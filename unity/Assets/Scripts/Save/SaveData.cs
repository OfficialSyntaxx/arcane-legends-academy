using System;
using System.Collections.Generic;

namespace ArcaneLegends.Save
{
    /// <summary>
    /// The player's save. A faithful port of game.js newGame()'s shape.
    ///
    /// THE DERIVED-STATE RULE — the single most important convention in this codebase, and the one
    /// that caused the most bugs in the web build when it was broken. **The save stores only what
    /// the player CHOSE. What they have EARNED is recomputed on every read.**
    ///
    /// So: `cardBack`, `title`, `wandFx`, `favorites`, `lessons.enrolled/done`,
    /// `zoneQuests.accepted/done` are stored — they are choices. Which card backs are UNLOCKED,
    /// which achievements are done, what a class taught, whether a quest's objective is met,
    /// whether a trophy should exist — none of that is stored. It is derived from cards/stats/
    /// dungeon state every time it is read, so it can never disagree with reality.
    ///
    /// The documented exceptions, each with a reason it CANNOT be derived:
    ///   - card `roll`      — a random grade rolled once at mint; not reproducible after the fact
    ///   - `pvp.rankPoints` — the outcome of an ORDERED sequence of results; two identical
    ///                        win/loss records can sit at different points
    ///   - `marketHistory`  — the outcome of NPC bidding, gone once a listing settles
    ///   - `gatherCooldowns`— wall-clock timestamps
    ///
    /// Before adding a field here, ask whether it can be recomputed. If it can, don't store it.
    /// </summary>
    [Serializable]
    public class SaveData
    {
        public const int CurrentVersion = 1;
        /// <summary>game.js START_GOLD. It is 80, not a round number — enough for a couple of
        /// gathers and not a pack (PACK_COST is 100), which is a deliberate opening pinch.</summary>
        public const int StartGold = 80;

        public int version = CurrentVersion;

        // ---- identity ----
        /// <summary>Empty on a fresh save ON PURPOSE — character creation derives "unfinished"
        /// from a missing name, so defaulting it here would skip the creation screen.</summary>
        public string name = "";
        public string school = "balance";
        public Appearance appearance = new();

        // ---- progression ----
        public int gold = StartGold;
        public int xp;
        public int level = 1;
        public Dictionary<string, int> skills = NewSkillMap(1);
        public Dictionary<string, int> skillXp = NewSkillMap(0);
        /// <summary>Cumulative curriculum bonus. Reset by prestige; level/collection/wins are not.</summary>
        public int academyBonus;

        // ---- inventory and collection ----
        public Dictionary<string, int> inventory = new();
        public List<CardInstance> cards = new();
        public List<EquipmentInstance> equipment = new();
        public Loadout loadout = new();
        public List<string> deck = new();
        /// <summary>Favourited card TYPES — the one stored bit of the codex.</summary>
        public List<string> favorites = new();

        /// <summary>matId -> unix ms when it becomes gatherable again. Absent = ready now.</summary>
        public Dictionary<string, long> gatherCooldowns = new();

        // ---- cosmetics: the CHOICE only; what's unlocked is always derived ----
        public string cardBack = "default";
        public string title = "none";
        public string wandFx = "none";

        // ---- world ----
        public HomeState home = new();
        public WorldState worldState = new();
        public QuestState quests = new();
        public ZoneQuestState zoneQuests = new();
        public LessonState lessons = new();
        public Dictionary<string, int> reputation = new();
        public List<string> collectibles = new();
        public SeasonState seasons = new();
        public PetState pets = new();
        public FoodBuff foodBuff;                 // null when no buff is active

        // ---- competitive ----
        public PvpState pvp = new();
        public PrestigeState prestige = new();

        // ---- economy ----
        public List<AuctionListing> auctions = new();
        public List<MarketSale> marketHistory = new();
        public int slabCounter;

        // ---- misc ----
        public StatCounters stats = new();
        public DailyChallenge daily = new();
        public SaveFlags flags = new();

        public static readonly string[] SkillIds =
        {
            "mining", "fishing", "woodcutting", "smithing",
            "alchemy", "scribing", "enchanting", "cooking",
        };

        private static Dictionary<string, int> NewSkillMap(int value)
        {
            var d = new Dictionary<string, int>();
            foreach (var s in SkillIds) d[s] = value;
            return d;
        }

        /// <summary>Item count in the inventory, 0 when absent.</summary>
        public int CountOf(string itemId) =>
            itemId != null && inventory.TryGetValue(itemId, out var n) ? n : 0;

        public void AddItem(string itemId, int qty)
        {
            if (string.IsNullOrEmpty(itemId) || qty == 0) return;
            int next = CountOf(itemId) + qty;
            if (next <= 0) inventory.Remove(itemId);
            else inventory[itemId] = next;
        }

        public bool HasItems(Dictionary<string, int> required)
        {
            if (required == null) return true;
            foreach (var kv in required) if (CountOf(kv.Key) < kv.Value) return false;
            return true;
        }

        public void RemoveItems(Dictionary<string, int> required)
        {
            if (required == null) return;
            foreach (var kv in required) AddItem(kv.Key, -kv.Value);
        }
    }

    [Serializable] public class Appearance { public string variant = "standard"; public string aura = "none"; }

    /// <summary>
    /// One owned copy of a card. `uid` distinguishes copies; `roll` is the mint-time grade roll
    /// and is one of the few genuinely un-derivable stored values.
    /// </summary>
    [Serializable]
    public class CardInstance
    {
        public string uid;
        public string id;
        public int roll;
        public bool graded;
        public string variant = "normal";
        /// <summary>First-edition stamp. Only the first copy of a type a player ever owns.</summary>
        public bool fe;
        /// <summary>Serial number, assigned when graded into a slab.</summary>
        public int serial;
    }

    [Serializable]
    public class EquipmentInstance
    {
        public string uid;
        public string id;
        public string metal;
        public string slot;
        public int tier;
        /// <summary>Applied enchant id, or null. Re-enchanting REPLACES rather than stacking.</summary>
        public string enchant;
    }

    [Serializable]
    public class Loadout
    {
        public string wand, hat, robe, boots, amulet;   // equipment uids, or null
    }

    [Serializable]
    public class HomeState
    {
        public bool owned;
        public Dictionary<string, int> upgrades = new()
            { ["treasury"] = 0, ["library"] = 0, ["armory"] = 0, ["tavern"] = 0 };
        public Dictionary<string, int> stock = new();
        /// <summary>slot id -> furniture item id.</summary>
        public Dictionary<string, string> furniture = new();
        /// <summary>slot id -> displayed card uid. The card's grade/name is read live, so
        /// selling a displayed card empties its case rather than leaving a ghost.</summary>
        public Dictionary<string, string> cases = new();
    }

    [Serializable]
    public class WorldState
    {
        public string zone = "academy";
        public List<string> visited = new() { "academy" };
        public Dictionary<string, DungeonProgress> dungeons = new();
        /// <summary>Globally-unique treasure ids already claimed. Flat, not per-zone: a claimed
        /// cache is a one-time world event.</summary>
        public List<string> treasuresFound = new();
    }

    [Serializable]
    public class DungeonProgress
    {
        public List<string> cleared = new();
        public List<string> defeated = new();
        public bool bossDead;
    }

    [Serializable] public class QuestState { public int current; public List<string> done = new(); }

    /// <summary>Only the player's CHOICES. Objective progress is derived from inventory/world.</summary>
    [Serializable] public class ZoneQuestState { public List<string> accepted = new(); public List<string> done = new(); }

    /// <summary>Only enrolled/passed. What each class TAUGHT is recomputed from `done`.</summary>
    [Serializable] public class LessonState { public List<string> enrolled = new(); public List<string> done = new(); }

    [Serializable] public class SeasonState { public List<string> claimed = new(); }
    [Serializable] public class PetState { public List<string> owned = new(); public string active; }
    [Serializable] public class FoodBuff { public string id; public long until; }

    [Serializable]
    public class PvpState
    {
        public int wins, losses;
        /// <summary>Stored, not derived: the outcome of an ORDERED sequence of results.</summary>
        public int rankPoints;
        public int streak;
        public string season;          // set on first load, not at newGame
        public int seasonBest;
        public List<SeasonRecord> history = new();
    }

    [Serializable] public class SeasonRecord { public string season; public int best; public int wins, losses; }
    [Serializable] public class PrestigeState { public int level; public List<int> history = new(); }

    [Serializable]
    public class AuctionListing
    {
        public string id, itemId;
        public int qty, price;
        /// <summary>Unix ms. Stored absolute so a closed tab doesn't pause the clock.</summary>
        public long endsAt;
        public int topBid;
    }

    [Serializable] public class MarketSale { public string itemId; public int qty, price; public long soldAt; }

    [Serializable]
    public class StatCounters
    {
        public int packs, graded, won, slabs, scribed, refined;
    }

    [Serializable]
    public class DailyChallenge
    {
        public string date = "";
        public string type = "win";
        public int progress;
        public int target = 3;
        public bool claimed;
    }

    [Serializable]
    public class SaveFlags
    {
        public bool starters = true;
        public bool schoolPicked;
        public string lastClassDay;
        public bool adviceHidden;
    }
}
