using System;
using System.IO;

namespace ArcaneLegends.Data
{
    /// <summary>
    /// Loads gamedata.json from StreamingAssets.
    ///
    /// Split from GameData itself so the data model stays free of any file/platform concern and
    /// can be constructed directly in tests. Only this class needs to know where the JSON lives.
    ///
    /// DESERIALISER: Unity's built-in JsonUtility does NOT handle the nested generic lists used
    /// here well (and silently produces empty collections rather than erroring, which is a nasty
    /// failure mode). Use Newtonsoft.Json — add "com.unity.nuget.newtonsoft-json" via the Package
    /// Manager — and swap the body of Parse() to JsonConvert.DeserializeObject&lt;GameData&gt;.
    /// The signature is written so that swap touches nothing else.
    ///
    /// ANDROID CAVEAT: on Android, StreamingAssets lives inside the compressed APK and cannot be
    /// read with File.ReadAllText. Use UnityWebRequest against Application.streamingAssetsPath
    /// there. LoadFromPath() is kept synchronous for editor/desktop and tests; the mobile path
    /// should call Parse() with text fetched asynchronously.
    /// </summary>
    public static class GameDataLoader
    {
        public const string FileName = "gamedata.json";

        /// <summary>Parse an already-loaded JSON string and build the lookup indexes.</summary>
        public static GameData Parse(string json, Func<string, GameData> deserialize)
        {
            if (string.IsNullOrWhiteSpace(json))
                throw new ArgumentException("gamedata.json was empty", nameof(json));
            if (deserialize == null)
                throw new ArgumentNullException(nameof(deserialize),
                    "supply a deserialiser (e.g. JsonConvert.DeserializeObject<GameData>)");

            var data = deserialize(json)
                ?? throw new InvalidDataException("gamedata.json failed to deserialise");
            data.Index();

            // Fail loudly at load rather than mid-duel. The web build learned this the hard way:
            // silent data problems surface later as inexplicable gameplay bugs, so every module
            // there exposes a validateX() the test suite asserts is clean.
            var problems = data.Validate();
            if (problems.Count > 0)
                throw new InvalidDataException(
                    "gamedata.json failed validation:\n  " + string.Join("\n  ", problems));

            return data;
        }

        /// <summary>Editor/desktop/test path. See the Android caveat in the class summary.</summary>
        public static GameData LoadFromPath(string path, Func<string, GameData> deserialize)
        {
            if (!File.Exists(path)) throw new FileNotFoundException("game data not found", path);
            return Parse(File.ReadAllText(path), deserialize);
        }
    }
}
