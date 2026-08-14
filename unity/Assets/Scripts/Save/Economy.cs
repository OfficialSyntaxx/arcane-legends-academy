using System;
using System.Collections.Generic;
using System.Linq;
using ArcaneLegends.Data;

namespace ArcaneLegends.Save
{
    /// <summary>
    /// The skilling economy: gather, smelt, forge, brew, cook, refine, enchant, sell.
    /// Ported from public/game.js. No UnityEngine dependency — these are testable headlessly.
    ///
    /// EVERY ACTION RETURNS A RESULT, NEVER THROWS AND NEVER LOGS. That is faithful to the JS,
    /// where each of these returns `{ok:false, err:"level"}` and the CALLER decides what the player
    /// sees. Keeping the failure a value means the same function backs the 3D world's nodes, the
    /// Skills screen's buttons and the tests, with no UI assumptions baked in.
    ///
    /// The error strings are the JS strings verbatim ("level", "cooldown", "resources", "gold",
    /// "unknown", "item", "enchant", "materials"). They are compared in tests, so do not "improve"
    /// them.
    /// </summary>
    public class Economy
    {
        private readonly EconomyData _data;
        private readonly Func<double> _rand;

        /// <param name="rand">Random source in [0,1). Injected so gather rolls are reproducible in
        /// tests — an unseeded source makes a failing test unrepeatable. Use
        /// <see cref="Mulberry32"/> to match the web build's stream exactly.</param>
        public Economy(EconomyData data, Func<double> rand = null)
        {
            _data = data ?? throw new ArgumentNullException(nameof(data));
            _rand = rand ?? new Random().NextDouble;
        }

        // ---------------------------------------------------------------- results

        public class ActionResult
        {
            public bool ok;
            public string err;
            /// <summary>Item id produced, when there is one.</summary>
            public string itemId;
            public int xp;
            /// <summary>Gather: extra units beyond the guaranteed one (Husbandry and/or event).</summary>
            public int extra;
            public bool pristine;
            public bool eventBonus;
            /// <summary>Gather: ms until this material is ready again, when the call was refused.</summary>
            public long remainingMs;
            /// <summary>Sell: gold received.</summary>
            public int value;
            /// <summary>Forge: uid of the equipment created.</summary>
            public string uid;

            public static ActionResult Fail(string err) => new() { ok = false, err = err };
            public static ActionResult Ok(string itemId = null, int xp = 0) =>
                new() { ok = true, itemId = itemId, xp = xp };
        }

        // ---------------------------------------------------------------- gathering

        public bool CanGather(SaveData s, MaterialDef mat) =>
            mat != null && Progression.SkillLevel(s, mat.skill) >= mat.lvl;

        /// <summary>Ms until <paramref name="materialId"/> can be gathered again; 0 = ready. Pure read.</summary>
        public long GatherCooldownRemaining(SaveData s, string materialId, long nowMs)
        {
            long readyAt = s.gatherCooldowns.TryGetValue(materialId, out var t) ? t : 0;
            return Math.Max(0, readyAt - nowMs);
        }

        /// <summary>
        /// Gather one material.
        ///
        /// The cooldown is PER MATERIAL, not per node. The outdoor zones scatter many copies of the
        /// same ore from a deterministic seed and rebuild them on every chunk load, so "that
        /// particular rock" is not an identity that survives a reload — only the material is. This
        /// also closes the same exploit for the Skills-screen shortcut, which calls straight into
        /// here and bypasses the world entirely.
        ///
        /// RNG ORDER IS LOAD-BEARING: the Husbandry roll is drawn FIRST and only when the bonus is
        /// non-zero, then the Pristine roll, always. A port that draws them in the other order (or
        /// unconditionally) produces different results from the same seed, which is exactly what
        /// the fixture tests catch.
        /// </summary>
        /// <param name="eventBonus">A live "Bountiful Harvest" on this material — a GUARANTEED extra
        /// unit, not a chance. The caller checks the world event; this function is told.</param>
        /// <param name="utcNow">Calendar day for the daily challenge. Separate from
        /// <paramref name="nowMs"/> because the two clocks are genuinely different concerns —
        /// cooldowns are elapsed-ms arithmetic, the daily is a date — and tests need to pin the
        /// date without moving the cooldown instant. Defaults to the real UTC day.</param>
        public ActionResult Gather(SaveData s, MaterialDef mat, long nowMs, bool eventBonus = false,
                                   DateTime? utcNow = null)
        {
            if (!CanGather(s, mat)) return ActionResult.Fail("level");

            long remaining = GatherCooldownRemaining(s, mat.id, nowMs);
            if (remaining > 0)
            {
                var busy = ActionResult.Fail("cooldown");
                busy.remainingMs = remaining;
                return busy;
            }

            // "Husbandry", taught by the field-studies lessons: a percent chance at a second unit.
            int bonus = Masteries.For(_data, s).gatherBonus;
            int extra = (bonus > 0 && _rand() * 100 < bonus ? 1 : 0) + (eventBonus ? 1 : 0);

            s.AddItem(mat.id, 1 + extra);
            Progression.AddSkillXp(s, mat.skill, mat.xp);
            // NOTE: this can consume a random draw of its own when the calendar day has rolled
            // over (checkDaily rerolls the challenge type). That is why the fixtures pin the date.
            Daily.Progress(s, "gather", _rand, utcNow);
            s.gatherCooldowns[mat.id] = nowMs + _data.RegenMsFor(mat.id);

            // A flat, un-boosted chance at a Pristine find ALONGSIDE the ordinary yield — never
            // instead of it, so a lucky roll can't cost the player the material they came for.
            bool pristine = _rand() * 100 < _data.pristine.chancePercent;
            if (pristine) s.AddItem(_data.PristineIdFor(mat.id), 1);

            var r = ActionResult.Ok(mat.id, mat.xp);
            r.extra = extra;
            r.pristine = pristine;
            r.eventBonus = eventBonus;
            return r;
        }

        // ---------------------------------------------------------------- smithing

        public bool CanCraft(SaveData s, BarDef bar) =>
            bar != null && Progression.SkillLevel(s, "smithing") >= bar.lvl && s.HasItems(bar.req);

        /// <summary>
        /// Smelt ore into a bar. Note the JS returns err:"level" for a MATERIALS shortfall too —
        /// `canCraft` folds the level and resource checks together and the caller only learns that
        /// something was missing. Faithful on purpose; if this is ever improved, improve it in
        /// game.js first so the two stay in step.
        /// </summary>
        public ActionResult Smelt(SaveData s, BarDef bar)
        {
            if (!CanCraft(s, bar)) return ActionResult.Fail("level");
            s.RemoveItems(bar.req);
            s.AddItem(bar.id, 1);
            Progression.AddSkillXp(s, "smithing", bar.xp);
            return ActionResult.Ok(bar.id, bar.xp);
        }

        /// <summary>
        /// Forge equipment from bars. XP is tier*25+10 — a FORMULA, not a table column, because the
        /// equipment rows are generated from metal tier rather than authored.
        /// </summary>
        public ActionResult Forge(SaveData s, EquipmentDef equip, Func<string> newUid)
        {
            if (equip == null) return ActionResult.Fail("unknown");
            if (Progression.SkillLevel(s, "smithing") < equip.lvl) return ActionResult.Fail("level");
            if (s.CountOf(equip.barId) < equip.bars) return ActionResult.Fail("resources");

            s.AddItem(equip.barId, -equip.bars);
            string uid = (newUid ?? Uid.New)();
            s.equipment.Add(new EquipmentInstance
            {
                uid = uid, id = equip.id, metal = equip.metal, slot = equip.slot, tier = equip.tier,
            });
            int xp = equip.tier * 25 + 10;
            Progression.AddSkillXp(s, "smithing", xp);

            var r = ActionResult.Ok(equip.id, xp);
            r.uid = uid;
            return r;
        }

        // ---------------------------------------------------------------- alchemy / cooking

        public ActionResult Brew(SaveData s, PotionDef potion)
        {
            if (potion == null) return ActionResult.Fail("unknown");
            if (Progression.SkillLevel(s, "alchemy") < potion.lvl) return ActionResult.Fail("level");
            if (!s.HasItems(potion.req)) return ActionResult.Fail("resources");
            s.RemoveItems(potion.req);
            s.AddItem(potion.id, 1);
            Progression.AddSkillXp(s, "alchemy", potion.xp);
            return ActionResult.Ok(potion.id, potion.xp);
        }

        // ---------------------------------------------------------------- scribing inputs

        /// <summary>
        /// Refine a raw material into a card material (canvas &lt;- wood, ink &lt;- fish,
        /// reagent &lt;- ore). Unlike the other crafts this has NO level gate — refining is the
        /// entry point to Scribing, so gating it would make the skill unstartable.
        /// </summary>
        public ActionResult Refine(SaveData s, string cardMatId, string sourceId)
        {
            var cm = _data.CardMaterial(cardMatId);
            if (cm == null || !cm.from.Contains(sourceId)) return ActionResult.Fail("unknown");
            if (s.CountOf(sourceId) < 1) return ActionResult.Fail("resources");

            s.AddItem(sourceId, -1);
            s.AddItem(cardMatId, 1);
            s.stats.refined++;
            Progression.AddSkillXp(s, "scribing", cm.xp);
            return ActionResult.Ok(cardMatId, cm.xp);
        }

        // ---------------------------------------------------------------- enchanting

        /// <summary>
        /// Apply an enchant to an owned item. Re-enchanting REPLACES rather than stacking, and the
        /// cost is paid again — the same "spend to change your mind" shape regrading a card has.
        /// </summary>
        public ActionResult Enchant(SaveData s, string equipmentUid, string enchantId)
        {
            var eq = s.equipment.FirstOrDefault(e => e.uid == equipmentUid);
            if (eq == null) return ActionResult.Fail("item");
            var e = _data.Enchant(enchantId);
            if (e == null) return ActionResult.Fail("enchant");
            if (Progression.SkillLevel(s, "enchanting") < e.lvl) return ActionResult.Fail("level");
            if (s.gold < e.cost) return ActionResult.Fail("gold");
            if (!s.HasItems(e.req)) return ActionResult.Fail("resources");

            s.gold -= e.cost;
            s.RemoveItems(e.req);
            eq.enchant = enchantId;
            Progression.AddSkillXp(s, "enchanting", e.xp);
            return ActionResult.Ok(enchantId, e.xp);
        }

        /// <summary>The stat delta an enchant id contributes, in the same shape equipment stats use.</summary>
        public (int atk, int def, int hp, int pip, int gold) EnchantStats(string enchantId)
        {
            var e = _data.Enchant(enchantId);
            if (e == null) return (0, 0, 0, 0, 0);
            return e.stat switch
            {
                "atk" => (e.n, 0, 0, 0, 0),
                "def" => (0, e.n, 0, 0, 0),
                "hp"  => (0, 0, e.n, 0, 0),
                "pip" => (0, 0, 0, e.n, 0),
                _     => (0, 0, 0, 0, 0),
            };
        }

        // ---------------------------------------------------------------- selling

        /// <summary>
        /// Sell stackable inventory (materials, bars, potions, and pristine variants). Equipment
        /// sells through <see cref="SellEquipment"/> because it is instanced, not stacked.
        /// </summary>
        public ActionResult Sell(SaveData s, string itemId, int qty = 1)
        {
            if (qty <= 0) return ActionResult.Fail("qty");
            int unit = _data.SellValueOf(itemId);
            if (unit <= 0 || s.CountOf(itemId) < qty) return ActionResult.Fail("resources");

            s.AddItem(itemId, -qty);
            int gained = unit * qty;
            s.gold += gained;

            var r = ActionResult.Ok(itemId);
            r.value = gained;
            return r;
        }

        /// <summary>Sell an owned item, unequipping it first if it is in the loadout — otherwise the
        /// loadout would hold a uid that no longer exists.</summary>
        public ActionResult SellEquipment(SaveData s, string equipmentUid)
        {
            int i = s.equipment.FindIndex(e => e.uid == equipmentUid);
            if (i < 0) return ActionResult.Fail("item");

            var eq = s.equipment[i];
            var def = _data.Equipment(eq.metal, eq.slot);
            if (def == null) return ActionResult.Fail("unknown");

            if (s.loadout.wand == equipmentUid) s.loadout.wand = null;
            if (s.loadout.hat == equipmentUid) s.loadout.hat = null;
            if (s.loadout.robe == equipmentUid) s.loadout.robe = null;
            if (s.loadout.boots == equipmentUid) s.loadout.boots = null;
            if (s.loadout.amulet == equipmentUid) s.loadout.amulet = null;

            s.equipment.RemoveAt(i);
            s.gold += def.value;

            var r = ActionResult.Ok(eq.id);
            r.value = def.value;
            return r;
        }

        // ---------------------------------------------------------------- mulberry32

        /// <summary>
        /// The web build's PRNG, ported exactly (game.js `mulberry32`). Integer-only, so the same
        /// seed yields the same sequence in both languages — which is what lets a C# test reproduce
        /// values the JS produced. Every step is `unchecked` because the JS relies on 32-bit wrap.
        /// </summary>
        public static Func<double> Mulberry32(uint seed)
        {
            uint a = seed;
            return () =>
            {
                unchecked
                {
                    // JS: a = a + 0x6D2B79F5 | 0
                    a += 0x6D2B79F5u;
                    // JS: t = Math.imul(a ^ a>>>15, 1|a)
                    //     Math.imul is a 32-bit multiply; an unchecked uint multiply has the same
                    //     bit pattern, so no signed round-trip is needed.
                    uint t = (a ^ (a >> 15)) * (1u | a);
                    // JS: t = t + Math.imul(t ^ t>>>7, 61|t) ^ t
                    //     `+` binds tighter than `^`, so the XOR is applied to the whole sum.
                    t = (t + ((t ^ (t >> 7)) * (61u | t))) ^ t;
                    // JS: ((t ^ t>>>14) >>> 0) / 4294967296
                    return (t ^ (t >> 14)) / 4294967296.0;
                }
            };
        }
    }

    /// <summary>
    /// The four techniques the curriculum teaches, DERIVED from completed lessons on every read.
    ///
    /// Never stored. Re-tuning what a class teaches then instantly applies to every existing save
    /// with no migration, and a stored total can never drift from the lessons that produced it.
    /// This is the derived-state rule (see SaveData) applied to the one system most tempted to
    /// break it.
    /// </summary>
    public struct Masteries
    {
        /// <summary>Percent off grading and regrading fees ("Appraisal").</summary>
        public int gradeDiscount;
        /// <summary>Flat bonus to the scribe roll ("Penmanship").</summary>
        public int scribeBonus;
        /// <summary>Percent chance a gather yields a second unit ("Husbandry").</summary>
        public int gatherBonus;
        /// <summary>Percent more gold when selling a card ("Haggling").</summary>
        public int sellBonus;

        public static Masteries For(EconomyData data, SaveData s)
        {
            var m = new Masteries();
            if (data == null || s?.lessons?.done == null) return m;

            foreach (var id in s.lessons.done)
            {
                var lesson = data.Lesson(id);
                if (lesson?.teaches == null) continue;
                foreach (var kv in lesson.teaches)
                {
                    switch (kv.Key)
                    {
                        case "gradeDiscount": m.gradeDiscount += kv.Value; break;
                        case "scribeBonus":   m.scribeBonus   += kv.Value; break;
                        case "gatherBonus":   m.gatherBonus   += kv.Value; break;
                        case "sellBonus":     m.sellBonus     += kv.Value; break;
                        // An unknown technique is ignored rather than thrown on: the syllabus can
                        // add one before this port learns about it, and a lesson that teaches
                        // nothing recognised should still count as passed.
                    }
                }
            }
            return m;
        }
    }

    /// <summary>
    /// The daily challenge. Rerolls type and target when the calendar day changes, which CONSUMES
    /// one random draw — relevant because gather calls into here, so the roll order matters to
    /// anything reproducing a seeded sequence.
    /// </summary>
    public static class Daily
    {
        public static readonly string[] Types = { "win", "gather", "scribe" };

        public static string TodayStr(DateTime? utcNow = null) =>
            (utcNow ?? DateTime.UtcNow).ToString("yyyy-MM-dd");

        public static DailyChallenge Check(SaveData s, Func<double> rand, DateTime? utcNow = null)
        {
            s.daily ??= new DailyChallenge();
            string today = TodayStr(utcNow);
            if (s.daily.date != today)
            {
                s.daily.date = today;
                s.daily.claimed = false;
                s.daily.progress = 0;
                s.daily.type = Types[(int)Math.Floor(rand() * Types.Length)];
                s.daily.target = s.daily.type == "win" ? 3 : s.daily.type == "gather" ? 12 : 3;
            }
            return s.daily;
        }

        public static void Progress(SaveData s, string type, Func<double> rand, DateTime? utcNow = null)
        {
            Check(s, rand, utcNow);
            if (s.daily.type == type && !s.daily.claimed && s.daily.progress < s.daily.target)
                s.daily.progress++;
        }
    }

    /// <summary>Unique ids for instanced things (cards, equipment). Matches the JS shape
    /// ("c" + base36 time + counter) closely enough to be recognisable in a save file.</summary>
    public static class Uid
    {
        private static int _counter;
        private static readonly Random _rand = new();

        public static string New()
        {
            long ms = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            return "c" + Base36(ms) + Base36(++_counter) + _rand.Next(1000);
        }

        private static string Base36(long v)
        {
            const string digits = "0123456789abcdefghijklmnopqrstuvwxyz";
            if (v == 0) return "0";
            var sb = new System.Text.StringBuilder();
            while (v > 0) { sb.Insert(0, digits[(int)(v % 36)]); v /= 36; }
            return sb.ToString();
        }
    }
}
