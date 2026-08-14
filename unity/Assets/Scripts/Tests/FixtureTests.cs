using System;
using System.Collections.Generic;
using System.Linq;
using ArcaneLegends.Data;
using ArcaneLegends.Save;

namespace ArcaneLegends.Tests
{
    /// <summary>
    /// Verifies the C# port against golden values generated from the WEB BUILD's own engine
    /// (StreamingAssets/testfixtures.json, produced by tools/export-test-fixtures.mjs).
    ///
    /// WHY THIS SHAPE: none of this C# could be compiled or run while it was written, so every
    /// behavioural claim about it is unverified. Asserting against fixtures produced by the real
    /// JS functions means a passing test proves agreement with the SHIPPED GAME, not merely
    /// internal self-consistency. Run this first — before any rendering work — because if the
    /// rules disagree here, everything built on them is wrong.
    ///
    /// Deliberately framework-free: no NUnit, no UnityEngine. It can be driven from a plain
    /// console runner, an EditMode test, or a MonoBehaviour, so it works whatever the project's
    /// test setup turns out to be. Wrap it in [Test] methods later if desired.
    /// </summary>
    public static class FixtureTests
    {
        public class Result
        {
            public int Passed, Failed;
            public readonly List<string> Failures = new();
            public bool Ok => Failed == 0;
            public override string ToString() =>
                $"{Passed} passed, {Failed} failed" +
                (Failures.Count > 0 ? "\n  " + string.Join("\n  ", Failures.Take(40)) : "");
        }

        /// <param name="fixturesJson">contents of StreamingAssets/testfixtures.json</param>
        /// <param name="deserialize">e.g. JsonConvert.DeserializeObject&lt;Fixtures&gt;</param>
        /// <param name="economy">contents of StreamingAssets/economy.json, already indexed
        /// (BuildIndexes called). Pass null to skip the economy checks.</param>
        public static Result RunAll(GameData data, string fixturesJson, Func<string, Fixtures> deserialize,
                                    EconomyData economy = null)
        {
            var r = new Result();
            var f = deserialize(fixturesJson)
                ?? throw new InvalidOperationException("testfixtures.json failed to deserialise");

            // ---- the PRNG, FIRST ----
            // Everything seeded below is meaningless if the stream disagrees, and a mis-ported
            // mulberry32 fails looking like a logic bug rather than a broken random source.
            foreach (var p in f.prng)
            {
                var stream = Economy.Mulberry32(p.seed);
                for (int i = 0; i < p.values.Count; i++)
                {
                    double expected = p.values[i], actual = stream();
                    int idx = i;
                    Check(r, $"mulberry32(seed {p.seed}) draw {idx}", () =>
                        (Math.Abs(actual - expected) < 1e-12, $"{actual:R} != {expected:R}"));
                }
            }

            Check(r, "gamedata validates clean", () =>
            {
                var problems = data.Validate();
                return (problems.Count == 0, string.Join("; ", problems));
            });

            // ---- data loaded intact ----
            Check(r, "card count matches", () =>
                (data.cards.Count == f.cardCounts.total,
                 $"{data.cards.Count} != {f.cardCounts.total}"));

            foreach (var kv in f.cardCounts.byType)
            {
                var type = kv.Key; var expected = kv.Value;
                Check(r, $"card type \"{type}\" count", () =>
                {
                    int actual = data.cards.Count(c => c.type == type);
                    return (actual == expected, $"{actual} != {expected}");
                });
            }

            Check(r, "ultChargeMax matches", () =>
                (data.ultChargeMax == f.ultChargeMax, $"{data.ultChargeMax} != {f.ultChargeMax}"));

            // ---- progression curves ----
            foreach (var p in f.progression.xpForLevel)
                Check(r, $"XpForLevel({p.level})", () =>
                {
                    int actual = Progression.XpForLevel(p.level);
                    return (actual == p.xp, $"{actual} != {p.xp}");
                });

            // The cumulative boundaries are the important ones: a port that treats the curve as
            // non-cumulative passes the easy cases and fails these.
            foreach (var p in f.progression.wizardLevel)
                Check(r, $"WizardLevel({p.totalXp})", () =>
                {
                    int actual = Progression.WizardLevel(p.totalXp);
                    return (actual == p.expected, $"{actual} != {p.expected}");
                });

            // Skill XP SPENDS the requirement on level-up, unlike wizard XP which accumulates.
            foreach (var seq in f.progression.skillXp)
            {
                var s = new SaveData();
                s.home.owned = seq.tavern > 0;
                s.home.upgrades["tavern"] = seq.tavern;
                for (int i = 0; i < seq.grants.Count; i++)
                {
                    Progression.AddSkillXp(s, "mining", seq.grants[i]);
                    var step = seq.steps[i];
                    int lvl = s.skills["mining"], into = s.skillXp["mining"];
                    Check(r, $"skill xp tavern={seq.tavern} after +{step.granted}", () =>
                        (lvl == step.level && into == step.xpIntoLevel,
                         $"level {lvl}/{step.level}, xpIntoLevel {into}/{step.xpIntoLevel}"));
                }
            }

            // ---- card -> trait resolution, all 25 creatures ----
            foreach (var t in f.cardTraitResolution)
                Check(r, $"trait for {t.cardId}", () =>
                {
                    var trait = data.TraitForCard(t.cardId);
                    string actual = trait?.id;
                    return (actual == t.trait, $"\"{actual}\" != \"{t.trait}\"");
                });

            // ---- affinity: caster school must MATCH the spell's school ----
            foreach (var a in f.affinity)
                Check(r, $"affinity {a.casterSchool}/{a.spellSchool}", () =>
                {
                    var got = data.AffinityFor(a.casterSchool, a.spellSchool);
                    if (a.expected == null) return (got == null, $"expected null, got {Describe(got)}");
                    return (got != null && got.k == a.expected.k && got.n == a.expected.n,
                            $"{Describe(got)} != {Describe(a.expected)}");
                });

            // ---- ultimate gating ----
            foreach (var u in f.ultimateGate)
                Check(r, $"ultimate gate {u.school} charge={u.charge} used={u.alreadyUsed}", () =>
                {
                    bool got = data.CanUseUltimate(u.charge, u.school, u.alreadyUsed);
                    return (got == u.expected, $"{got} != {u.expected}");
                });

            if (economy != null) RunEconomy(r, economy, f);

            return r;
        }

        // ------------------------------------------------------------------ economy

        /// <summary>
        /// Replays the seeded economy runs from the fixtures and compares the resulting save state
        /// field by field.
        ///
        /// These are the only fixtures that pin ORDER OF RANDOM DRAWS. gather() draws the Husbandry
        /// roll only when the bonus is non-zero, then the Pristine roll always — a port that draws
        /// unconditionally, or in the other order, lands on different items from the same seed and
        /// fails here while still reading perfectly sensibly.
        /// </summary>
        private static void RunEconomy(Result r, EconomyData data, Fixtures f)
        {
            Check(r, "economy data validates clean", () =>
            {
                var problems = data.Validate();
                return (problems.Count == 0, string.Join("; ", problems));
            });

            Check(r, "start gold matches", () =>
                (SaveData.StartGold == f.startGold, $"{SaveData.StartGold} != {f.startGold}"));

            foreach (var m in f.masteries)
            {
                var s = new SaveData();
                s.lessons.done = new List<string>(m.lessonsDone);
                var got = Masteries.For(data, s);
                Check(r, $"masteries [{string.Join(",", m.lessonsDone)}]", () =>
                    (got.gradeDiscount == m.expected.gradeDiscount && got.scribeBonus == m.expected.scribeBonus
                     && got.gatherBonus == m.expected.gatherBonus && got.sellBonus == m.expected.sellBonus,
                     $"gather {got.gatherBonus}/{m.expected.gatherBonus}, scribe {got.scribeBonus}/{m.expected.scribeBonus}, " +
                     $"grade {got.gradeDiscount}/{m.expected.gradeDiscount}, sell {got.sellBonus}/{m.expected.sellBonus}"));
            }

            foreach (var c in f.economy) RunEconomyCase(r, data, c);
        }

        /// <summary>The fixed instant the fixtures record cooldowns relative to (see the exporter).</summary>
        private const long FixtureNow = 1700000000000L;

        private static void RunEconomyCase(Result r, EconomyData data, EconomyCase c)
        {
            var s = new SaveData();
            // The exporter clears the starting inventory and pins the daily so a day rollover can
            // never burn a random draw mid-run. Reproduce both, or the seeded stream desyncs.
            s.inventory = new Dictionary<string, int>(c.before.inventory);
            s.gold = c.before.gold;
            s.skills = new Dictionary<string, int>(c.before.skills);
            s.skillXp = new Dictionary<string, int>(c.before.skillXp);
            s.stats.refined = c.before.refined;
            s.daily = new DailyChallenge
            {
                date = c.dailyDate, type = c.before.dailyType, progress = c.before.dailyProgress,
                target = c.before.dailyType == "win" ? 3 : c.before.dailyType == "gather" ? 12 : 3,
            };
            foreach (var kv in c.before.cooldownsFromNow) s.gatherCooldowns[kv.Key] = FixtureNow + kv.Value;
            foreach (var e in c.before.equipment)
                s.equipment.Add(new EquipmentInstance
                {
                    uid = "fixture_eq", id = e.id, metal = e.metal, slot = e.slot, tier = e.tier, enchant = e.enchant,
                });
            s.lessons.done = new List<string>(c.lessonsDone ?? new List<string>());

            var econ = new Economy(data, Economy.Mulberry32(c.seed));
            var actual = Replay(econ, data, s, c);

            for (int i = 0; i < c.results.Count; i++)
            {
                var exp = c.results[i];
                var got = i < actual.Count ? actual[i] : null;
                int idx = i;
                Check(r, $"[{c.name}] result {idx}", () =>
                {
                    if (got == null) return (false, "no result — the replay produced fewer calls than the fixture");
                    if (got.ok != exp.ok) return (false, $"ok {got.ok} != {exp.ok}");
                    // `err` is compared only when the fixture HAS one. Two JS paths (refine's bad
                    // source, sellItem's shortfall) return a bare {ok:false} with no reason, so
                    // there is nothing there to disagree with — the C# gives a reason anyway
                    // because a silent failure is worse for a caller.
                    if (exp.err != null && got.err != exp.err) return (false, $"err \"{got.err}\" != \"{exp.err}\"");
                    if (got.extra != exp.extra) return (false, $"extra {got.extra} != {exp.extra}");
                    if (got.pristine != exp.pristine) return (false, $"pristine {got.pristine} != {exp.pristine}");
                    if (got.remainingMs != exp.remaining) return (false, $"remaining {got.remainingMs} != {exp.remaining}");
                    if (exp.value != 0 && got.value != exp.value) return (false, $"value {got.value} != {exp.value}");
                    return (true, "");
                });
            }

            CompareSnapshot(r, c.name, data, s, c.after);
        }

        /// <summary>
        /// Drives the same calls the exporter made, dispatched by fixture name.
        ///
        /// Name-based dispatch is deliberate: the alternative is encoding a call script in JSON and
        /// interpreting it, which is a small language to write, debug and keep in step for no gain.
        /// Adding a fixture case means adding an arm here — and a missing arm FAILS LOUDLY as a
        /// short result list rather than silently passing.
        /// </summary>
        private static List<Economy.ActionResult> Replay(Economy econ, EconomyData data, SaveData s, EconomyCase c)
        {
            var outp = new List<Economy.ActionResult>();
            var copper = data.Material("copper");

            // The date the fixture was generated on. Passed explicitly so a day rollover between
            // generation and this run cannot reroll the daily challenge and consume an extra draw,
            // which would desync the seeded stream and fail every gather case at once.
            DateTime day = DateTime.SpecifyKind(DateTime.Parse(c.dailyDate,
                System.Globalization.CultureInfo.InvariantCulture), DateTimeKind.Utc);

            switch (c.name)
            {
                case "gather copper, no husbandry":
                case "gather copper, husbandry from two lessons":
                    outp.Add(econ.Gather(s, copper, FixtureNow, utcNow: day));
                    break;
                case "gather with event bonus":
                    outp.Add(econ.Gather(s, copper, FixtureNow, eventBonus: true, utcNow: day));
                    break;
                case "gather twice, second on cooldown":
                    outp.Add(econ.Gather(s, copper, FixtureNow, utcNow: day));
                    outp.Add(econ.Gather(s, copper, FixtureNow + 1000, utcNow: day));
                    break;
                case "gather again after cooldown elapses":
                    outp.Add(econ.Gather(s, copper, FixtureNow, utcNow: day));
                    outp.Add(econ.Gather(s, copper, FixtureNow + data.RegenMsFor("copper"), utcNow: day));
                    break;
                case "gather runite under-levelled":
                    outp.Add(econ.Gather(s, data.Material("runite"), FixtureNow, utcNow: day));
                    break;
                case "smelt bronze with materials":
                case "smelt bronze without tin":
                    outp.Add(econ.Smelt(s, data.Bar("bar_bronze")));
                    break;
                case "forge a bronze wand":
                    outp.Add(econ.Forge(s, data.Equipment("bronze", "wand"), () => "fixture_eq"));
                    break;
                case "brew draught of focus":
                    outp.Add(econ.Brew(s, data.Potion("potion_focus")));
                    break;
                case "refine ore into reagent at level 1":
                    outp.Add(econ.Refine(s, "reagent", "copper"));
                    break;
                case "refine rejects a wrong source":
                    outp.Add(econ.Refine(s, "canvas", "copper"));
                    break;
                case "sell ore and its pristine variant":
                    outp.Add(econ.Sell(s, "copper", 2));
                    outp.Add(econ.Sell(s, "pristine_copper", 1));
                    break;
                case "sell more than owned":
                    outp.Add(econ.Sell(s, "copper", 5));
                    break;
                case "enchant then re-enchant the same item":
                    outp.Add(econ.Enchant(s, "fixture_eq", "whet_1"));
                    outp.Add(econ.Enchant(s, "fixture_eq", "whet_2"));
                    break;
                // No default: an unknown case leaves the list short, which the result comparison
                // reports as a failure rather than passing quietly.
            }
            return outp;
        }

        private static void CompareSnapshot(Result r, string caseName, EconomyData data, SaveData s, EconomySnapshot want)
        {
            Check(r, $"[{caseName}] gold", () => (s.gold == want.gold, $"{s.gold} != {want.gold}"));

            Check(r, $"[{caseName}] inventory", () =>
            {
                // Compared as a SET of non-zero counts. The JS leaves a zeroed key behind after
                // removeItems; the C# deletes it. Both read as "none", so an exact key-for-key
                // comparison would fail on a difference that cannot affect play.
                var mine = s.inventory.Where(kv => kv.Value != 0).ToDictionary(kv => kv.Key, kv => kv.Value);
                var theirs = want.inventory.Where(kv => kv.Value != 0).ToDictionary(kv => kv.Key, kv => kv.Value);
                bool same = mine.Count == theirs.Count &&
                            mine.All(kv => theirs.TryGetValue(kv.Key, out var v) && v == kv.Value);
                return (same, $"{Dump(mine)} != {Dump(theirs)}");
            });

            foreach (var kv in want.skills)
            {
                var skill = kv.Key; var expected = kv.Value;
                Check(r, $"[{caseName}] skill {skill}", () =>
                {
                    int got = s.skills.TryGetValue(skill, out var v) ? v : -1;
                    return (got == expected, $"{got} != {expected}");
                });
            }
            foreach (var kv in want.skillXp)
            {
                var skill = kv.Key; var expected = kv.Value;
                Check(r, $"[{caseName}] skillXp {skill}", () =>
                {
                    int got = s.skillXp.TryGetValue(skill, out var v) ? v : -1;
                    return (got == expected, $"{got} != {expected}");
                });
            }

            Check(r, $"[{caseName}] gather cooldowns", () =>
            {
                var mine = s.gatherCooldowns.ToDictionary(kv => kv.Key, kv => kv.Value - FixtureNow);
                bool same = mine.Count == want.cooldownsFromNow.Count &&
                            mine.All(kv => want.cooldownsFromNow.TryGetValue(kv.Key, out var v) && v == kv.Value);
                return (same, $"{Dump(mine)} != {Dump(want.cooldownsFromNow)}");
            });

            Check(r, $"[{caseName}] daily progress", () =>
                (s.daily.progress == want.dailyProgress, $"{s.daily.progress} != {want.dailyProgress}"));

            Check(r, $"[{caseName}] refined counter", () =>
                (s.stats.refined == want.refined, $"{s.stats.refined} != {want.refined}"));

            Check(r, $"[{caseName}] equipment", () =>
            {
                if (s.equipment.Count != want.equipment.Count)
                    return (false, $"{s.equipment.Count} items != {want.equipment.Count}");
                for (int i = 0; i < s.equipment.Count; i++)
                {
                    var a = s.equipment[i]; var b = want.equipment[i];
                    if (a.id != b.id || a.metal != b.metal || a.slot != b.slot || a.tier != b.tier || a.enchant != b.enchant)
                        return (false, $"item {i}: {a.id}/{a.metal}/{a.slot}/t{a.tier}/{a.enchant ?? "-"} != " +
                                       $"{b.id}/{b.metal}/{b.slot}/t{b.tier}/{b.enchant ?? "-"}");
                }
                return (true, "");
            });
        }

        private static string Dump<T>(Dictionary<string, T> d) =>
            "{" + string.Join(",", d.OrderBy(kv => kv.Key).Select(kv => $"{kv.Key}:{kv.Value}")) + "}";

        private static string Describe(Effect e) => e == null ? "null" : $"{{{e.k},{e.n}}}";

        private static void Check(Result r, string name, Func<(bool ok, string detail)> body)
        {
            try
            {
                var (ok, detail) = body();
                if (ok) r.Passed++;
                else { r.Failed++; r.Failures.Add($"FAIL {name}: {detail}"); }
            }
            catch (Exception ex)
            {
                r.Failed++;
                r.Failures.Add($"THREW {name}: {ex.GetType().Name} {ex.Message}");
            }
        }

        // ------------------------------------------------------------------ fixture DTOs

        [Serializable] public class Fixtures
        {
            public CardCounts cardCounts = new();
            public int ultChargeMax;
            public int startGold;
            public List<PrngCase> prng = new();
            public List<EconomyCase> economy = new();
            public List<MasteryCase> masteries = new();
            public ProgressionFixtures progression = new();
            public List<TraitResolution> cardTraitResolution = new();
            public List<AffinityCase> affinity = new();
            public List<UltimateGateCase> ultimateGate = new();
        }

        [Serializable] public class CardCounts
        {
            public int total;
            public Dictionary<string, int> byType = new();
        }

        [Serializable] public class ProgressionFixtures
        {
            public List<XpForLevelCase> xpForLevel = new();
            public List<WizardLevelCase> wizardLevel = new();
            public List<SkillXpSequence> skillXp = new();
        }

        [Serializable] public class XpForLevelCase  { public int level; public int xp; }
        [Serializable] public class WizardLevelCase { public int totalXp; public int expected; }

        [Serializable] public class SkillXpSequence
        {
            public int tavern;
            public List<int> grants = new();
            public List<SkillXpStep> steps = new();
        }
        [Serializable] public class SkillXpStep { public int granted, level, xpIntoLevel; }

        [Serializable] public class PrngCase { public uint seed; public List<double> values = new(); }

        [Serializable]
        public class MasteryCase
        {
            public List<string> lessonsDone = new();
            public MasteryTotals expected = new();
        }
        [Serializable] public class MasteryTotals { public int gradeDiscount, scribeBonus, gatherBonus, sellBonus; }

        [Serializable]
        public class EconomyCase
        {
            public string name;
            public uint seed;
            /// <summary>The pinned calendar day, so a rollover cannot burn a random draw mid-replay.</summary>
            public string dailyDate;
            public List<string> lessonsDone = new();
            public EconomySnapshot before = new();
            public List<EconomyResult> results = new();
            public EconomySnapshot after = new();
        }

        [Serializable]
        public class EconomySnapshot
        {
            public int gold;
            public Dictionary<string, int> inventory = new();
            public Dictionary<string, int> skills = new();
            public Dictionary<string, int> skillXp = new();
            /// <summary>Cooldowns as an OFFSET from the fixture instant, so the values stay stable
            /// no matter when the fixtures were generated.</summary>
            public Dictionary<string, long> cooldownsFromNow = new();
            public string dailyType;
            public int dailyProgress;
            public int refined;
            public List<EquipmentSnapshot> equipment = new();
        }

        [Serializable] public class EquipmentSnapshot { public string id, metal, slot, enchant; public int tier; }

        [Serializable]
        public class EconomyResult
        {
            public bool ok;
            /// <summary>null where the JS returned a bare {ok:false} with no reason.</summary>
            public string err;
            public string itemId;
            public int xp, extra, value;
            public bool pristine;
            public long remaining;
        }

        [Serializable] public class TraitResolution { public string cardId, name, trait; }
        [Serializable] public class AffinityCase { public string casterSchool, spellSchool; public Effect expected; }
        [Serializable] public class UltimateGateCase { public string school; public int charge; public bool alreadyUsed; public bool expected; }
    }
}
