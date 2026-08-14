using System;

namespace ArcaneLegends.Save
{
    /// <summary>
    /// Wizard level, skill levels and XP curves. Ported from game.js.
    ///
    /// These formulas are LOAD-BEARING for balance — every reward in the game is tuned against
    /// them — so they are reproduced exactly rather than "cleaned up". Resist the urge to
    /// rationalise the curve; changing it silently rebalances the whole game.
    /// </summary>
    public static class Progression
    {
        /// <summary>
        /// XP needed to advance FROM level <paramref name="level"/> to the next.
        /// game.js: <c>Math.floor(50*l + l*l*2.5)</c>. Quadratic, so late levels cost sharply more.
        /// </summary>
        public static int XpForLevel(int level) => (int)Math.Floor(50.0 * level + level * level * 2.5);

        /// <summary>
        /// The wizard level a given total XP buys. Note this is CUMULATIVE: game.js walks up,
        /// adding each level's own requirement, so total XP for level N is the sum of
        /// XpForLevel(1..N-1) — not XpForLevel(N).
        /// </summary>
        public static int WizardLevel(int totalXp)
        {
            int level = 1;
            long need = XpForLevel(1);
            while (totalXp >= need)
            {
                level++;
                need += XpForLevel(level);
            }
            return level;
        }

        /// <summary>Grant wizard XP and re-derive the level from the new total.</summary>
        public static void AddWizardXp(SaveData s, int amount)
        {
            s.xp += amount;
            s.level = WizardLevel(s.xp);
        }

        public static int SkillLevel(SaveData s, string skill) =>
            s.skills.TryGetValue(skill, out var lv) ? lv : 1;

        /// <summary>
        /// Grant skill XP, applying the Tavern home upgrade (+10% per level) and rolling over as
        /// many levels as the amount covers.
        ///
        /// Unlike wizard XP, skill XP is SPENT on each level: the requirement is subtracted rather
        /// than accumulated, so `skillXp` is progress toward the *current* level only. That
        /// asymmetry is faithful to game.js — do not "fix" it to match the wizard curve.
        /// </summary>
        public static void AddSkillXp(SaveData s, string skill, int amount)
        {
            if (!s.skills.ContainsKey(skill)) return;

            int tavern = s.home.owned && s.home.upgrades.TryGetValue("tavern", out var t) ? t : 0;
            amount = (int)Math.Round(amount * (1 + tavern * 0.10));

            s.skillXp[skill] = s.skillXp.GetValueOrDefault(skill) + amount;
            while (s.skillXp[skill] >= XpForLevel(s.skills[skill]))
            {
                s.skillXp[skill] -= XpForLevel(s.skills[skill]);
                s.skills[skill]++;
            }
        }

        /// <summary>Progress toward the next skill level, 0..1 — for progress bars.</summary>
        public static float SkillProgress(SaveData s, string skill)
        {
            int need = XpForLevel(SkillLevel(s, skill));
            if (need <= 0) return 0f;
            return Math.Clamp(s.skillXp.GetValueOrDefault(skill) / (float)need, 0f, 1f);
        }
    }
}
