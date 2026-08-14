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
        public static Result RunAll(GameData data, string fixturesJson, Func<string, Fixtures> deserialize)
        {
            var r = new Result();
            var f = deserialize(fixturesJson)
                ?? throw new InvalidOperationException("testfixtures.json failed to deserialise");

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

            return r;
        }

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

        [Serializable] public class TraitResolution { public string cardId, name, trait; }
        [Serializable] public class AffinityCase { public string casterSchool, spellSchool; public Effect expected; }
        [Serializable] public class UltimateGateCase { public string school; public int charge; public bool alreadyUsed; public bool expected; }
    }
}
