using System;
using System.Collections.Generic;
using System.Linq;
using ArcaneLegends.Data;

namespace ArcaneLegends.Duel
{
    /// <summary>
    /// The duel rules — a port of logic.js, the web build's stateless referee.
    ///
    /// PORTING NOTE: logic.js is the authority, and tools/test.mjs (644 checks) plus
    /// tools/creature-rule-test.mjs (36 checks) are the specification. Port a rule, then port its
    /// test, and do not treat the rule as done until it passes here. See
    /// docs/UNITY-MIGRATION.md §3.
    ///
    /// No UnityEngine dependency on purpose: the rules must be unit-testable without opening the
    /// Editor, exactly as the JS modules were testable without a browser.
    /// </summary>
    public class DuelEngine
    {
        public const int MaxTurns = 100;
        public const int HandLimit = 10;
        public const int BoardLimit = 5;
        public const int OpeningHand = 5;

        private readonly GameData _data;
        private readonly Func<double> _rand;

        /// <param name="rand">
        /// Injected RNG so duels are reproducible. logic.js seeds mulberry32 for exactly this
        /// reason — an unseeded Random makes a failing test unrepeatable.
        /// </param>
        public DuelEngine(GameData data, Func<double> rand = null)
        {
            _data = data ?? throw new ArgumentNullException(nameof(data));
            _rand = rand ?? new Random().NextDouble;
        }

        // ---------------------------------------------------------------- setup

        public DuelStateData Setup(string youId, string youSchool, List<string> youDeck,
                                   string foeId, string foeSchool, List<string> foeDeck)
        {
            var s = new DuelStateData();
            s.you.playerId = youId;   s.you.school = youSchool ?? "balance";   s.you.deck = Shuffle(youDeck);
            s.enemy.playerId = foeId; s.enemy.school = foeSchool ?? "balance"; s.enemy.deck = Shuffle(foeDeck);

            for (int i = 0; i < OpeningHand; i++) { Draw(s.you); Draw(s.enemy); }
            s.turn = youId;
            return s;
        }

        private List<string> Shuffle(List<string> ids)
        {
            var d = new List<string>(ids ?? new List<string>());
            for (int i = d.Count - 1; i > 0; i--)
            {
                int j = (int)(_rand() * (i + 1));
                (d[i], d[j]) = (d[j], d[i]);
            }
            return d;
        }

        /// <summary>Draw one. Hand caps at 10 — draws past the cap are burned, as in logic.js.</summary>
        private void Draw(DuelSide p)
        {
            if (p.hand.Count >= HandLimit || p.deck.Count == 0) return;
            p.hand.Add(p.deck[^1]);
            p.deck.RemoveAt(p.deck.Count - 1);
        }

        // ---------------------------------------------------------------- turn flow

        /// <summary>
        /// Start of turn: grow max pips, apply persistent field effects, draw (or take escalating
        /// fatigue damage on an empty deck), and refresh the board's attack allowance.
        /// </summary>
        public void BeginTurn(DuelStateData s, DuelSide p)
        {
            p.maxPips = Math.Min(10, p.maxPips + 1);

            int pipBonus = 0;
            foreach (var f in p.field)
            {
                var def = _data.CardById(f.cardId);
                if (def == null) continue;
                foreach (var fx in def.effects)
                {
                    if (fx.k == "fieldPip") pipBonus += fx.n;
                    else if (fx.k == "fieldHeal") p.Heal(fx.n);
                }
            }
            p.pips = Math.Min(10, p.maxPips + pipBonus);

            if (p.deck.Count > 0) Draw(p);
            else { p.fatigue++; p.hp -= p.fatigue; }   // deck-out damage escalates each turn

            foreach (var c in p.board) { c.exhausted = false; c.attacks = 0; c.summoning = false; }
            CheckGameOver(s);
        }

        /// <summary>
        /// End the current turn. Freeze ticks down on the OUTGOING player's board so a frozen
        /// creature actually loses a turn rather than thawing before it would have acted.
        /// </summary>
        public void EndTurn(DuelStateData s)
        {
            if (s.over) return;
            var outgoing = s.SideOf(s.turn);
            foreach (var c in outgoing.board) if (c.freeze > 0) c.freeze--;

            var next = s.FoeOf(outgoing);
            s.turn = next.playerId;
            s.turns++;
            BeginTurn(s, next);
            CheckGameOver(s);
        }

        // ---------------------------------------------------------------- playing cards

        public bool CanPlay(DuelStateData s, DuelSide p, string cardId, out string reason)
        {
            reason = null;
            if (s.over) { reason = "the duel is over"; return false; }
            if (s.turn != p.playerId) { reason = "not your turn"; return false; }
            if (!p.hand.Contains(cardId)) { reason = "card not in hand"; return false; }

            var card = _data.CardById(cardId);
            if (card == null) { reason = $"unknown card \"{cardId}\""; return false; }
            if (card.cost > p.pips) { reason = "not enough pips"; return false; }
            if (card.type == "creature" && p.board.Count >= BoardLimit) { reason = "board is full"; return false; }
            return true;
        }

        /// <summary>
        /// Play a card from hand. <paramref name="target"/> applies to targeted spells; pass null
        /// to aim a damage spell at the enemy wizard.
        /// </summary>
        public bool Play(DuelStateData s, DuelSide p, string cardId, CreatureInstance target = null)
        {
            if (!CanPlay(s, p, cardId, out var reason)) { s.log.Add($"illegal play: {reason}"); return false; }

            var card = _data.CardById(cardId);
            p.hand.Remove(cardId);
            p.pips -= card.cost;

            switch (card.type)
            {
                case "creature": PlayCreature(s, p, card); break;
                case "field":    PlayField(s, p, card);    break;
                case "trap":     PlayTrap(p, card);        break;
                default:         PlaySpell(s, p, card, target); break;   // "spell"
            }

            CleanUpDead(s);
            CheckGameOver(s);
            return true;
        }

        private void PlayCreature(DuelStateData s, DuelSide p, Card card)
        {
            var foe = s.FoeOf(p);

            // Same-school affinity: a creature hits harder for a wizard of its own school. Baked
            // in at summon along with the current field bonus — see CreatureInstance.atk.
            int affinity = (!string.IsNullOrEmpty(p.school) && card.school == p.school) ? 1 : 0;

            var c = new CreatureInstance
            {
                cardId = card.id, name = card.name, school = card.school, ownerId = p.playerId,
                atk = card.atk + p.FieldAtkBonus(_data) + affinity,
                hp = card.hp, maxHp = card.hp,
                taunt = card.Has("taunt"),
                haste = card.Has("haste"),
                drain = card.Has("drain"),
                multi = card.Has("multiAttack") ? 2 : 1,
                summoning = true,
                trait = _data.TraitForCard(card.id),
            };
            if (c.haste || (c.trait?.haste ?? false)) c.summoning = false;

            // Printed on-play effects that resolve for the caster rather than the board.
            foreach (var f in card.effects)
            {
                if (f.k == "healPlay") p.Heal(f.n);
                else if (f.k == "buffAll") foreach (var x in p.board) x.atk += f.n;
            }

            p.board.Add(c);
            s.log.Add($"{p.playerId} played {card.name}");

            ApplyOnPlayTraits(s, p, foe, c);

            // Enemy traps fire on creature play — one trap, FIFO, consumed whether or not it
            // matches. Matches logic.js's shift() semantics exactly.
            if (foe.traps.Count > 0)
            {
                var t = foe.traps[0];
                foe.traps.RemoveAt(0);
                foreach (var fx in t.effects)
                    if (fx.k == "trapDmg")
                    {
                        c.hp -= fx.n;
                        s.log.Add($"Trap! {c.name} takes {fx.n}");
                    }
            }
        }

        /// <summary>Creature passives that fire the moment the creature enters play.</summary>
        private void ApplyOnPlayTraits(DuelStateData s, DuelSide p, DuelSide foe, CreatureInstance c)
        {
            var t = c.trait;
            if (t == null) return;

            if (t.shield > 0) p.shield += t.shield;
            if (t.onPlayDmgAll > 0) foreach (var e in foe.board) e.hp -= t.onPlayDmgAll;
            if (t.onPlayHealAll > 0)
                foreach (var a in p.board) a.hp = Math.Min(a.maxHp, a.hp + t.onPlayHealAll);
            if (t.onPlayBuffAll > 0) foreach (var a in p.board) a.atk += t.onPlayBuffAll;
            if (t.onPlayFreeze) foreach (var e in foe.board) e.freeze = 1;
            if (t.onPlayDraw > 0) for (int i = 0; i < t.onPlayDraw; i++) Draw(p);

            // Bolt hits a random enemy CREATURE, falling through to the wizard on an empty board.
            if (t.onPlayBolt > 0)
            {
                var pick = RandomLiving(foe.board);
                if (pick != null) pick.hp -= t.onPlayBolt;
                else foe.TakeDamage(t.onPlayBolt);
            }

            // Tongue: steal attack from ONE random enemy creature, never the whole board.
            if (t.onPlayStealAtk > 0)
            {
                var victim = RandomLiving(foe.board);
                if (victim != null)
                {
                    int stolen = Math.Min(t.onPlayStealAtk, victim.atk);
                    victim.atk -= stolen;
                    c.atk += stolen;
                }
            }
        }

        private void PlayField(DuelStateData s, DuelSide p, Card card)
        {
            p.field.Add(new FieldCard { cardId = card.id });
            // fieldAtk buffs the board that exists NOW; later summons pick it up via FieldAtkBonus.
            foreach (var f in card.effects)
                if (f.k == "fieldAtk")
                    foreach (var x in p.board) x.atk += f.n;
            s.log.Add($"{p.playerId} played field {card.name}");
        }

        private void PlayTrap(DuelSide p, Card card) =>
            p.traps.Add(new TrapCard { cardId = card.id, effects = new List<Effect>(card.effects) });

        private void PlaySpell(DuelStateData s, DuelSide p, Card card, CreatureInstance target)
        {
            s.log.Add($"{p.playerId} cast {card.name}");
            ApplyEffects(s, p, card.effects, target);

            var bonus = _data.AffinityFor(p.school, card.school);
            if (bonus != null) ApplyEffects(s, p, new List<Effect> { bonus }, target);

            p.ultCharge = Math.Min(_data.ultChargeMax, p.ultCharge + 1);
        }

        // ---------------------------------------------------------------- effects

        /// <summary>
        /// The effect dispatch table — the same {k,n} shapes cards, ultimates and affinities all
        /// speak, which is why an ultimate needs no special-casing.
        ///
        /// Targeting rule, ported exactly: "dmg" against a creature bypasses shield (a wizard-only
        /// resource); with no target it hits the enemy wizard instead.
        /// </summary>
        public void ApplyEffects(DuelStateData s, DuelSide owner, List<Effect> effects, CreatureInstance target)
        {
            if (effects == null) return;
            var foe = s.FoeOf(owner);

            foreach (var f in effects)
            {
                switch (f.k)
                {
                    case "dmg":
                        if (target != null) { if (!IsSpellImmune(target)) target.hp -= f.n; }
                        else foe.TakeDamage(f.n);
                        break;
                    case "dmgAll":
                        foreach (var c in foe.board.Where(c => !IsSpellImmune(c))) c.hp -= f.n;
                        break;
                    case "dmgWiz":    foe.TakeDamage(f.n); break;
                    case "heal":      owner.Heal(f.n); break;
                    case "healPlay":  owner.Heal(f.n); break;
                    case "shield":    owner.shield += f.n; break;
                    case "buffAll":   foreach (var c in owner.board) c.atk += f.n; break;
                    case "draw":      for (int i = 0; i < f.n; i++) Draw(owner); break;
                    case "freezeAll": foreach (var c in foe.board) c.freeze = 1; break;

                    // Persistent effects are handled where they live (BeginTurn / PlayField /
                    // trap triggers), not here. Listed explicitly so they are ignored knowingly
                    // rather than falling into the "unknown effect" warning.
                    case "fieldAtk": case "fieldHeal": case "fieldPip":
                    case "trapDmg":  case "trapShield":
                        break;

                    default:
                        s.log.Add($"unknown effect \"{f.k}\" ignored");
                        break;
                }
            }
            CleanUpDead(s);
        }

        private static bool IsSpellImmune(CreatureInstance c) => c.trait?.spellImmune ?? false;

        // ---------------------------------------------------------------- combat

        /// <summary>
        /// Attack with one creature. <paramref name="target"/> null means "face" — legal only if
        /// no taunt creature is guarding.
        /// </summary>
        public bool Attack(DuelStateData s, DuelSide p, CreatureInstance attacker, CreatureInstance target)
        {
            if (s.over || s.turn != p.playerId || attacker == null || !attacker.CanAttack) return false;

            var foe = s.FoeOf(p);
            var taunts = foe.board.Where(c => c.IsAlive && (c.taunt || (c.trait?.taunt ?? false))).ToList();
            if (taunts.Count > 0 && (target == null || !taunts.Contains(target))) return false;
            if (target != null && !foe.board.Contains(target)) return false;

            int dmg = EffectiveAtk(attacker, p);

            if (target == null)
            {
                foe.TakeDamage(dmg);
                if (attacker.drain || (attacker.trait?.drain ?? false)) p.Heal(dmg);
            }
            else
            {
                // Evade dodges the first attack against it, then is spent.
                bool evaded = (target.trait?.evade ?? false) && !target.exhausted && !EvadeSpent(target);
                if (evaded)
                {
                    MarkEvadeSpent(target);
                    s.log.Add($"{target.name} evaded");
                }
                else
                {
                    // The elemental ring: attacker's school beating the defender's adds +1.
                    int ringBonus = _data.SchoolBeats(attacker.school, target.school) ? 1 : 0;
                    int total = dmg + ringBonus;

                    target.hp -= total;
                    if (attacker.trait?.poison > 0) target.hp -= attacker.trait.poison;
                    if (attacker.drain || (attacker.trait?.drain ?? false)) p.Heal(total);

                    // Retaliation: a defender that SURVIVES hits back with its own attack.
                    if (target.hp > 0)
                    {
                        attacker.hp -= target.atk;
                        if (target.trait?.thorns > 0) attacker.hp -= target.trait.thorns;
                        if (target.trait?.healOnHit > 0)
                            target.hp = Math.Min(target.maxHp, target.hp + target.trait.healOnHit);
                    }

                    if (attacker.trait?.onAttackDmgAll > 0)
                        foreach (var e in foe.board.Where(e => e != target))
                            e.hp -= attacker.trait.onAttackDmgAll;
                    if (attacker.trait?.onAttackDebuff > 0)
                        target.atk = Math.Max(0, target.atk - attacker.trait.onAttackDebuff);
                }
            }

            if (attacker.trait?.wizardDmg > 0) foe.TakeDamage(attacker.trait.wizardDmg);

            attacker.attacks++;
            if (attacker.attacks >= attacker.multi) attacker.exhausted = true;

            // Defender traps fire on being attacked — one trap, FIFO, same as on creature play.
            if (foe.traps.Count > 0)
            {
                var t = foe.traps[0];
                foe.traps.RemoveAt(0);
                foreach (var fx in t.effects)
                    if (fx.k == "trapShield")
                    {
                        foe.shield += fx.n;
                        s.log.Add($"Trap! +{fx.n} shield");
                    }
            }

            CleanUpDead(s);
            CheckGameOver(s);
            return true;
        }

        /// <summary>
        /// Attack including conditional bonuses that depend on live board state — rage while
        /// below half HP, warband scaling with allies. Derived rather than stored so it can never
        /// disagree with the board that produces it.
        /// </summary>
        public static int EffectiveAtk(CreatureInstance c, DuelSide owner)
        {
            int a = c.atk;
            if (c.trait != null)
            {
                if (c.trait.rageAtk > 0 && c.hp * 2 < c.maxHp) a += c.trait.rageAtk;
                if (c.trait.warband) a += Math.Max(0, owner.board.Count(x => x.IsAlive) - 1);
            }
            return Math.Max(0, a);
        }

        // Evade is once-per-creature. Tracked via a spent set rather than a field on the instance
        // so the serialised shape stays a faithful mirror of logic.js's creature record.
        private readonly HashSet<CreatureInstance> _evadeSpent = new();
        private bool EvadeSpent(CreatureInstance c) => _evadeSpent.Contains(c);
        private void MarkEvadeSpent(CreatureInstance c) => _evadeSpent.Add(c);

        // ---------------------------------------------------------------- ultimates

        public bool UseUltimate(DuelStateData s, DuelSide p)
        {
            if (s.over || s.turn != p.playerId) return false;
            if (!_data.CanUseUltimate(p.ultCharge, p.school, p.ultUsed)) return false;

            var ult = _data.UltimateFor(p.school);
            p.ultUsed = true;
            p.ultCharge = 0;
            s.log.Add($"{p.playerId} unleashed {ult.name}");
            ApplyEffects(s, p, ult.effects, null);
            CheckGameOver(s);
            return true;
        }

        // ---------------------------------------------------------------- bookkeeping

        /// <summary>
        /// Remove the dead — but let "survive" cheat death at 1hp once first. Ordering matters:
        /// survive must resolve before the filter, or the creature is gone before it can fire.
        /// </summary>
        private readonly HashSet<CreatureInstance> _surviveUsed = new();
        private void CleanUpDead(DuelStateData s)
        {
            foreach (var side in new[] { s.you, s.enemy })
            {
                foreach (var c in side.board)
                {
                    if (c.hp > 0) continue;
                    if ((c.trait?.survive ?? false) && !_surviveUsed.Contains(c))
                    {
                        _surviveUsed.Add(c);
                        c.hp = 1;
                    }
                }
                side.board.RemoveAll(c => c.hp <= 0);
            }
        }

        /// <summary>
        /// Win/draw resolution. A double knockout is a DRAW, not a win for whichever side happens
        /// to be checked first — and the turn limit resolves on remaining hp.
        /// </summary>
        private void CheckGameOver(DuelStateData s)
        {
            if (s.over) return;

            if (s.you.hp <= 0 && s.enemy.hp <= 0)
            {
                s.over = true; s.draw = true; s.winner = null; s.endReason = "double knockout";
            }
            else if (s.you.hp <= 0) { s.over = true; s.winner = s.enemy.playerId; }
            else if (s.enemy.hp <= 0) { s.over = true; s.winner = s.you.playerId; }
            else if (s.turns >= MaxTurns)
            {
                s.over = true; s.endReason = "turn limit";
                if (s.you.hp == s.enemy.hp) { s.draw = true; s.winner = null; }
                else s.winner = s.you.hp > s.enemy.hp ? s.you.playerId : s.enemy.playerId;
            }
        }

        private CreatureInstance RandomLiving(List<CreatureInstance> board)
        {
            var alive = board.Where(c => c.IsAlive).ToList();
            return alive.Count == 0 ? null : alive[(int)(_rand() * alive.Count)];
        }
    }
}
