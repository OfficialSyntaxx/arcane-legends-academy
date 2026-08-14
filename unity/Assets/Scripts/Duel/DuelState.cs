using System;
using System.Collections.Generic;
using ArcaneLegends.Data;

namespace ArcaneLegends.Duel
{
    /// <summary>
    /// A creature in play. Distinct from <see cref="Card"/>: a Card is the immutable printed
    /// definition, a CreatureInstance is one copy on the board with its own mutable hp/atk/state.
    /// The web build conflated these early on and it caused real bugs (buffing one copy buffed
    /// every copy), so the split is deliberate.
    /// </summary>
    [Serializable]
    public class CreatureInstance
    {
        public string cardId;
        public string name;
        public string school;
        public int atk;
        public int hp;
        public int maxHp;

        /// <summary>Cannot attack the turn it is played, unless it has haste.</summary>
        public bool summoning = true;
        /// <summary>Frozen creatures skip their attack for a turn.</summary>
        public bool frozen;
        /// <summary>Already attacked this turn (multiAttack creatures may act again).</summary>
        public bool hasAttacked;
        /// <summary>Evade consumes itself on the first attack it dodges.</summary>
        public bool evadeUsed;
        /// <summary>Survive (cheat death at 1hp) fires at most once.</summary>
        public bool surviveUsed;

        public List<string> keywords = new();
        public CreatureTrait trait;

        public bool Has(string keyword) => keywords.Contains(keyword);
        public bool IsAlive => hp > 0;

        /// <summary>
        /// Attack including conditional bonuses. Rage adds while below half HP; warband scales
        /// with allies. Computed rather than stored so the value can never disagree with the
        /// board state that produces it — the same derive-don't-store rule the web build used
        /// for unlocks and trophies.
        /// </summary>
        public int EffectiveAtk(int allyCount)
        {
            int a = atk;
            if (trait != null)
            {
                if (trait.rageAtk > 0 && hp * 2 < maxHp) a += trait.rageAtk;
                if (trait.warband) a += Math.Max(0, allyCount - 1);
            }
            return Math.Max(0, a);
        }

        /// <summary>May this creature attack right now?</summary>
        public bool CanAttack =>
            IsAlive && !frozen && !hasAttacked && (!summoning || Has("haste") || (trait?.haste ?? false));
    }

    /// <summary>One side of a duel.</summary>
    [Serializable]
    public class DuelSide
    {
        public string playerId;
        public string school = "balance";

        public int hp = 30;
        public int maxHp = 30;
        public int shield;

        /// <summary>Mana. Grows by one each turn up to <see cref="maxPips"/>.</summary>
        public int pips;
        public int maxPips;

        public List<string> deck = new();
        public List<string> hand = new();
        public List<CreatureInstance> board = new();

        /// <summary>Banked ultimate charge; spendable once per duel at ultChargeMax.</summary>
        public int ultCharge;
        public bool ultUsed;

        /// <summary>
        /// Shield absorbs before hp, and never goes negative. Creatures are damaged directly —
        /// shield is a wizard-only resource, which is why this is not used for board damage.
        /// </summary>
        public void TakeDamage(int dmg)
        {
            if (dmg <= 0) return;
            int absorbed = Math.Min(shield, dmg);
            shield -= absorbed;
            hp -= (dmg - absorbed);
        }

        public void Heal(int amount) => hp = Math.Min(maxHp, hp + amount);
    }

    [Serializable]
    public class DuelStateData
    {
        public DuelSide you = new();
        public DuelSide enemy = new();
        public string turn;            // playerId whose turn it is
        public int turnNumber = 1;
        public bool over;
        public string winner;          // playerId, or null while in progress

        /// <summary>Human-readable log of what resolved, for UI and for test assertions.</summary>
        public List<string> log = new();

        public DuelSide SideOf(string playerId) => you.playerId == playerId ? you : enemy;
        public DuelSide FoeOf(DuelSide side) => ReferenceEquals(side, you) ? enemy : you;
    }
}
