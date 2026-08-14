using System;
using System.Collections.Generic;
using System.Linq;
using ArcaneLegends.Data;

namespace ArcaneLegends.Duel
{
    /// <summary>
    /// The duel rules. A faithful port of the web build's logic.js (the stateless referee) plus
    /// the creature-trait rules from game.js — the two together are what the existing 644-check
    /// engine suite and 36-check creature-rule suite already pin down.
    ///
    /// PORTING NOTE: those JS tests are the specification for this class. Port a rule, then port
    /// its test, and do not treat the rule as done until the test passes here too. That is what
    /// turns this rewrite into a translation against a known-good reference instead of a redesign
    /// — see docs/UNITY-MIGRATION.md §3.
    ///
    /// No UnityEngine dependency on purpose: the rules must be testable without opening the
    /// Editor, exactly as the JS modules were testable without a browser.
    /// </summary>
    public class DuelEngine
    {
        private readonly GameData _data;
        private readonly Func<double> _rand;

        /// <param name="rand">
        /// Injected RNG so duels are reproducible in tests. The web build used a seeded mulberry32
        /// for exactly this reason — an unseeded Random makes a failing test unrepeatable.
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
            s.you.playerId = youId;   s.you.school = youSchool;   s.you.deck = Shuffle(youDeck);
            s.enemy.playerId = foeId; s.enemy.school = foeSchool; s.enemy.deck = Shuffle(foeDeck);

            for (int i = 0; i < 4; i++) { Draw(s.you); Draw(s.enemy); }
            s.turn = youId;
            BeginTurn(s, s.you);
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

        /// <summary>Hand caps at 10 — draws past that are burned, matching logic.js.</summary>
        private void Draw(DuelSide p)
        {
            if (p.hand.Count >= 10 || p.deck.Count == 0) return;
            p.hand.Add(p.deck[^1]);
            p.deck.RemoveAt(p.deck.Count - 1);
        }

        // ---------------------------------------------------------------- turn flow

        public void BeginTurn(DuelStateData s, DuelSide p)
        {
            p.maxPips = Math.Min(10, p.maxPips + 1);
            p.pips = p.maxPips;
            Draw(p);

            foreach (var c in p.board)
            {
                c.summoning = false;
                c.hasAttacked = false;
                c.frozen = false;                       // freeze lasts one turn
                if (c.trait != null && c.trait.regen > 0 && c.IsAlive)
                    c.hp = Math.Min(c.maxHp, c.hp + c.trait.regen);
            }
        }

        public void EndTurn(DuelStateData s)
        {
            if (s.over) return;
            var current = s.SideOf(s.turn);
            var next = s.FoeOf(current);
            s.turn = next.playerId;
            s.turnNumber++;
            BeginTurn(s, next);
        }

        // ---------------------------------------------------------------- playing cards

        /// <summary>Whether this card may legally be played right now, and why not if it can't.</summary>
        public bool CanPlay(DuelStateData s, DuelSide p, string cardId, out string reason)
        {
            reason = null;
            if (s.over) { reason = "the duel is over"; return false; }
            if (s.turn != p.playerId) { reason = "not your turn"; return false; }
            if (!p.hand.Contains(cardId)) { reason = "card not in hand"; return false; }

            var card = _data.CardById(cardId);
            if (card == null) { reason = $"unknown card \"{cardId}\""; return false; }
            if (card.cost > p.pips) { reason = "not enough pips"; return false; }
            if (card.IsCreature && p.board.Count >= 5) { reason = "board is full"; return false; }
            return true;
        }

        public bool Play(DuelStateData s, DuelSide p, string cardId, CreatureInstance target = null)
        {
            if (!CanPlay(s, p, cardId, out var reason)) { s.log.Add($"illegal play: {reason}"); return false; }

            var card = _data.CardById(cardId);
            p.hand.Remove(cardId);
            p.pips -= card.cost;

            if (card.IsCreature) PlayCreature(s, p, card);
            else PlaySpell(s, p, card, target);

            CleanUpDead(s);
            CheckGameOver(s);
            return true;
        }

        private void PlayCreature(DuelStateData s, DuelSide p, Card card)
        {
            var trait = _data.TraitById(TraitKeyFor(card));
            var c = new CreatureInstance
            {
                cardId = card.id, name = card.name, school = card.school,
                atk = card.atk, hp = card.hp, maxHp = card.hp,
                keywords = new List<string>(card.keywords),
                trait = trait,
                summoning = true,
            };
            p.board.Add(c);
            s.log.Add($"{p.playerId} played {card.name}");

            if (trait == null) return;
            var foe = s.FoeOf(p);

            // "On play" traits. Order matches game.js: board-wide effects first, then targeted.
            if (trait.shield > 0) p.shield += trait.shield;
            if (trait.onPlayDmgAll > 0)
                foreach (var e in foe.board) e.hp -= trait.onPlayDmgAll;
            if (trait.onPlayHealAll > 0)
                foreach (var a in p.board) a.hp = Math.Min(a.maxHp, a.hp + trait.onPlayHealAll);
            if (trait.onPlayBuffAll > 0)
                foreach (var a in p.board) a.atk += trait.onPlayBuffAll;
            if (trait.onPlayFreeze)
                foreach (var e in foe.board) e.frozen = true;
            if (trait.onPlayDraw > 0)
                for (int i = 0; i < trait.onPlayDraw; i++) Draw(p);

            // Bolt hits a random enemy CREATURE, falling through to the wizard on an empty board —
            // the behaviour the "firespell hits the wizard when no creatures" test pins.
            if (trait.onPlayBolt > 0)
            {
                var pick = RandomLiving(foe.board);
                if (pick != null) pick.hp -= trait.onPlayBolt;
                else foe.TakeDamage(trait.onPlayBolt);
            }

            // Tongue: steal attack from one random enemy creature only, never the whole board.
            if (trait.onPlayStealAtk > 0)
            {
                var victim = RandomLiving(foe.board);
                if (victim != null)
                {
                    int stolen = Math.Min(trait.onPlayStealAtk, victim.atk);
                    victim.atk -= stolen;
                    c.atk += stolen;
                }
            }
        }

        private void PlaySpell(DuelStateData s, DuelSide p, Card card, CreatureInstance target)
        {
            s.log.Add($"{p.playerId} cast {card.name}");
            ApplyEffects(s, p, card.effects, target);

            // School affinity: a caster's own school appends one bonus effect to a matching spell.
            var bonus = _data.AffinityFor(p.school, card.school);
            if (bonus != null) ApplyEffects(s, p, new List<Effect> { bonus }, target);

            // Casting builds the ultimate meter. Capped so it cannot bank beyond one use.
            p.ultCharge = Math.Min(_data.ultChargeMax, p.ultCharge + 1);
        }

        // ---------------------------------------------------------------- effects

        /// <summary>
        /// The effect dispatch table. Same {k,n} shapes cards, ultimates and affinities all use,
        /// which is why an ultimate needs no special-casing here.
        ///
        /// Note the targeting rule, ported exactly: "dmg" against a creature bypasses shield
        /// (shield is a wizard resource), and with no target it hits the enemy wizard instead.
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
                        if (target != null && !IsSpellImmune(target)) target.hp -= f.n;
                        else if (target == null) foe.TakeDamage(f.n);
                        break;
                    case "dmgAll":
                        foreach (var c in foe.board.Where(c => !IsSpellImmune(c))) c.hp -= f.n;
                        break;
                    case "dmgWiz":  foe.TakeDamage(f.n); break;
                    case "heal":    owner.Heal(f.n); break;
                    case "shield":  owner.shield += f.n; break;
                    case "buffAll": foreach (var c in owner.board) c.atk += f.n; break;
                    case "draw":    for (int i = 0; i < f.n; i++) Draw(owner); break;
                    case "freezeAll": foreach (var c in foe.board) c.frozen = true; break;
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
        /// no taunt creature is guarding, which is the rule the "taunt blocks wizard attack" test
        /// pins down.
        /// </summary>
        public bool Attack(DuelStateData s, DuelSide p, CreatureInstance attacker, CreatureInstance target)
        {
            if (s.over || s.turn != p.playerId || attacker == null || !attacker.CanAttack) return false;

            var foe = s.FoeOf(p);
            var taunts = foe.board.Where(c => c.IsAlive && (c.Has("taunt") || (c.trait?.taunt ?? false))).ToList();
            if (taunts.Count > 0 && (target == null || !taunts.Contains(target))) return false;
            if (target != null && !foe.board.Contains(target)) return false;

            int dmg = attacker.EffectiveAtk(p.board.Count(c => c.IsAlive));

            if (target == null)
            {
                foe.TakeDamage(dmg);
                if (attacker.trait?.drain ?? false) p.Heal(dmg);
            }
            else
            {
                // Evade dodges the first attack against it, then is spent.
                if ((target.trait?.evade ?? false) && !target.evadeUsed)
                {
                    target.evadeUsed = true;
                    s.log.Add($"{target.name} evaded");
                }
                else
                {
                    target.hp -= dmg;
                    if (attacker.trait?.poison > 0) target.hp -= attacker.trait.poison;
                    if (attacker.trait?.drain ?? false) p.Heal(dmg);

                    // Retaliation the defender deals back on being hit.
                    if (target.trait?.thorns > 0) attacker.hp -= target.trait.thorns;
                    if (target.trait?.healOnHit > 0)
                        target.hp = Math.Min(target.maxHp, target.hp + target.trait.healOnHit);
                }

                // Attacker-side on-hit riders.
                if (attacker.trait?.onAttackDmgAll > 0)
                    foreach (var e in foe.board.Where(e => e != target))
                        e.hp -= attacker.trait.onAttackDmgAll;
                if (attacker.trait?.onAttackDebuff > 0)
                    target.atk = Math.Max(0, target.atk - attacker.trait.onAttackDebuff);
            }

            if (attacker.trait?.wizardDmg > 0) foe.TakeDamage(attacker.trait.wizardDmg);

            attacker.hasAttacked = !(attacker.Has("multiAttack"));
            CleanUpDead(s);
            CheckGameOver(s);
            return true;
        }

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
        /// Remove the dead — but give "survive" its one chance to cheat death at 1hp first.
        /// Ordering matters: survive must resolve before the filter, or the creature is gone
        /// before its trait ever fires.
        /// </summary>
        private void CleanUpDead(DuelStateData s)
        {
            foreach (var side in new[] { s.you, s.enemy })
            {
                foreach (var c in side.board)
                {
                    if (c.hp > 0) continue;
                    if ((c.trait?.survive ?? false) && !c.surviveUsed)
                    {
                        c.surviveUsed = true;
                        c.hp = 1;
                    }
                }
                side.board.RemoveAll(c => c.hp <= 0);
            }
        }

        private void CheckGameOver(DuelStateData s)
        {
            if (s.you.hp <= 0 || s.enemy.hp <= 0)
            {
                s.over = true;
                s.winner = s.you.hp <= 0 ? s.enemy.playerId : s.you.playerId;
            }
        }

        private CreatureInstance RandomLiving(List<CreatureInstance> board)
        {
            var alive = board.Where(c => c.IsAlive).ToList();
            return alive.Count == 0 ? null : alive[(int)(_rand() * alive.Count)];
        }

        /// <summary>
        /// Map a card to its creature-trait key. Mirrors creatures.js traitForCard()'s keyword
        /// matching — kept as one method so the mapping has a single definition, the same reason
        /// the web build shares its clip-role matcher between the world and the duel arena.
        /// </summary>
        public static string TraitKeyFor(Card card)
        {
            string n = ((card.name ?? "") + " " + (card.id ?? "")).ToLowerInvariant();
            foreach (var (pattern, key) in TraitKeywords)
                if (pattern.Split('|').Any(p => n.Contains(p))) return key;
            return null;
        }

        // Ordered — first match wins, so more specific entries must come first.
        private static readonly (string, string)[] TraitKeywords =
        {
            ("mushnub_evolved", "mushnub_evolved"),
            ("mushroomking|mushroom_king", "mushroomking"),
            ("mushnub", "mushnub"),
            ("orc_skull|skull", "orc_skull"),
            ("bluedemon|blue_demon", "bluedemon"),
            ("greenspikyblob", "greenspikyblob"),
            ("greenblob", "greenblob"),
            ("pinkblob", "pinkblob"),
            ("dragon|wyrm|titan", "dragon"),
            ("slime|ooze", "slime"),
            ("skeleton|bone", "skeleton"),
            ("panda|bear", "panda"),
            ("deer|stag|elk", "deer"),
            ("ghost|wraith|spirit", "ghost"),
            ("mushroom|shroom", "mushroom"),
            ("yeti|giant", "yeti"),
            ("dino|rex", "dino"),
            ("orc|goblin|troll", "orc"),
            ("demon|devil|imp", "demon"),
            ("frog|toad", "frog"),
            ("fish|shark", "fish"),
            ("bunny|rabbit", "bunny"),
            ("alien", "alien"),
            ("wizard|mage", "wizard"),
            ("ninja|assassin", "ninja"),
            ("monkroose", "monkroose"),
            ("birb", "birb"),
            ("cactoro|cactus", "cactoro"),
            ("cat|kitten", "cat"),
            ("dog|hound|wolf", "dog"),
            ("pigeon|dove", "pigeon"),
            ("glub", "glub"),
            ("goleling|golem", "goleling"),
            ("squidle|squid|kraken", "squidle"),
            ("hywirl|whirl|cyclone", "hywirl"),
            ("alpaking|alpaca|llama", "alpaking"),
            ("armabee|bee|wasp", "armabee"),
            ("chicken|rooster", "chicken"),
            ("bat", "bat"),
        };
    }
}
