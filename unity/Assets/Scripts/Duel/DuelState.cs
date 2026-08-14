using System;
using System.Collections.Generic;
using System.Linq;
using ArcaneLegends.Data;

namespace ArcaneLegends.Duel
{
    /// <summary>
    /// A creature in play. Distinct from <see cref="Card"/>: a Card is the immutable printed
    /// definition, a CreatureInstance is one copy on the board with its own mutable hp/atk/state.
    /// Ported from logic.js makeCreature().
    /// </summary>
    [Serializable]
    public class CreatureInstance
    {
        public string cardId;
        public string name;
        public string school;
        public string ownerId;

        /// <summary>
        /// Attack is BAKED AT SUMMON TIME, not derived: it already includes the field bonus and
        /// the same-school affinity bonus that applied when this creature entered play. That is
        /// deliberate parity with logic.js — a field card played later buffs the board at that
        /// moment via buffAll, it does not retroactively re-derive every creature's attack.
        /// </summary>
        public int atk;
        public int hp;
        public int maxHp;

        public bool taunt, haste, drain;
        /// <summary>Attacks allowed per turn: 2 for multiAttack, otherwise 1.</summary>
        public int multi = 1;
        public int attacks;
        public bool exhausted;
        public bool summoning = true;
        /// <summary>Turns remaining frozen. Ticks down at the END of the owner's turn.</summary>
        public int freeze;

        /// <summary>Passive/active rules from creatures.js RULES, or null for a plain creature.</summary>
        public CreatureTrait trait;

        public bool IsAlive => hp > 0;
        public bool CanAttack => IsAlive && !exhausted && freeze <= 0 && !summoning;
    }

    /// <summary>A persistent field card in play. Its effects re-apply every turn.</summary>
    [Serializable]
    public class FieldCard
    {
        public string cardId;
    }

    /// <summary>An armed trap. Triggers once, FIFO, then is consumed.</summary>
    [Serializable]
    public class TrapCard
    {
        public string cardId;
        public List<Effect> effects = new();
    }

    /// <summary>One side of a duel. Ported from logic.js startBattle()'s player shape.</summary>
    [Serializable]
    public class DuelSide
    {
        public string playerId;
        public string school = "balance";

        // 100, not 30 — matches logic.js. Duels are long enough for fields and fatigue to matter.
        public int hp = 100;
        public int maxHp = 100;
        public int shield;

        public int pips = 1;
        public int maxPips = 1;

        /// <summary>Deck damage: once empty, each draw costs an escalating amount of hp.</summary>
        public int fatigue;

        public List<string> deck = new();
        public List<string> hand = new();
        public List<CreatureInstance> board = new();
        public List<FieldCard> field = new();
        public List<TrapCard> traps = new();

        public int ultCharge;
        public bool ultUsed;

        /// <summary>
        /// Shield absorbs before hp. Creature damage does NOT route through here — shield is a
        /// wizard-only resource, which is why board damage subtracts hp directly.
        /// </summary>
        public void TakeDamage(int dmg)
        {
            if (dmg <= 0) return;
            int absorbed = Math.Min(shield, dmg);
            shield -= absorbed;
            hp -= (dmg - absorbed);
        }

        public void Heal(int amount) => hp = Math.Min(maxHp, hp + amount);

        /// <summary>Total +atk that field cards currently grant to newly summoned creatures.</summary>
        public int FieldAtkBonus(GameData data) =>
            field.Sum(f => data.CardById(f.cardId)?.effects
                .Where(e => e.k == "fieldAtk").Sum(e => e.n) ?? 0);
    }

    [Serializable]
    public class DuelStateData
    {
        public DuelSide you = new();
        public DuelSide enemy = new();
        public string turn;
        public int turns;
        public bool over;
        /// <summary>Winner's playerId; null when the duel is ongoing OR drawn.</summary>
        public string winner;
        public bool draw;
        public string endReason;

        public List<string> log = new();

        public DuelSide SideOf(string playerId) => you.playerId == playerId ? you : enemy;
        public DuelSide FoeOf(DuelSide side) => ReferenceEquals(side, you) ? enemy : you;
    }
}
