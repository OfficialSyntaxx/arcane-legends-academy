// Arcane Legends — audio. Fully procedural WebAudio: no asset files, no download cost.
//
// Everything is synthesised from oscillators and a small noise buffer, so the whole soundscape
// adds zero bytes to the deploy. Three layers:
//   - SFX      one-shot cues bound to game events (gather, scribe, duel, coins, level-up)
//   - Ambience a slow evolving pad + occasional wind, for the 3D world
//   - Music    a gentle arpeggiated theme with a different mode per screen context
//
// Design rules that matter here:
//   - Browsers block audio until a user gesture, so the context starts suspended and `unlock()`
//     is called from the first pointer/key event. Everything before that is a silent no-op.
//   - No AudioContext (old browser, headless test) must never throw — the module degrades to
//     doing nothing rather than breaking the game.
//   - Volumes and mute persist in localStorage, separately from the game save.

const STORE_KEY = "arcane_audio_v1";

// note helper: MIDI number -> Hz
const hz = n => 440 * Math.pow(2, (n - 69) / 12);

// Scales used by the music layer. Each context picks one, so the academy, a duel and a victory
// all feel different without needing separate compositions. Originally one mode per SCREEN
// ("world"/"duel"/"menu") — extended to one mode per outdoor ZONE too, so walking from campus
// into the forest is audibly a different place, not just a different backdrop.
const MODES = {
  world:     { root: 57, steps: [0, 2, 3, 5, 7, 8, 10], bpm: 68 },  // A aeolian — wistful campus
  duel:      { root: 50, steps: [0, 2, 3, 5, 7, 8, 11], bpm: 96 },  // D harmonic minor — tense
  victory:   { root: 60, steps: [0, 2, 4, 7, 9],        bpm: 108 }, // C major pentatonic
  menu:      { root: 55, steps: [0, 2, 4, 5, 7, 9, 11], bpm: 60 },  // G ionian — calm
  forest:    { root: 52, steps: [0, 2, 3, 5, 7, 9, 10], bpm: 64 },  // E dorian — woody, watchful
  lake:      { root: 53, steps: [0, 2, 4, 6, 7, 9, 11], bpm: 58 },  // F lydian — open water, calm
  mountains: { root: 45, steps: [0, 1, 3, 5, 7, 8, 10], bpm: 72 },  // A phrygian — rugged, ominous
  snow:      { root: 50, steps: [0, 2, 4, 6, 8, 10],    bpm: 54 },  // D whole-tone — cold, sparse
  dungeon:   { root: 43, steps: [0, 2, 3, 5, 7, 8, 11], bpm: 50 },  // G harmonic minor — slow dread,
                                                                     // distinct from duel's own
                                                                     // harmonic-minor combat tempo
};

// Which zone id plays which mode. Not every zone needs an entry — an unlisted outdoor zone (or
// the academy hub itself) falls back to the default "world" campus theme; any interior falls back
// to "dungeon" regardless of which one it is, since a dorm and a cavern share nothing sonically
// with an outdoor zone but don't yet each need their own bespoke mode.
const ZONE_MODES = {
  whispering_forest: "forest",
  lake_arcanum: "lake",
  ashen_mountains: "mountains",
  snow: "snow",
};

/** The music mode for a zone: caller passes the zone id and whether it's an interior. Exported
 * so index.html can compute it the same way on every zone change/tab switch without duplicating
 * this table. */
export function audioModeForZone(zoneId, interior){
  if (interior) return "dungeon";
  return ZONE_MODES[zoneId] || "world";
}

export const SFX = {
  gather:    { kind:"pluck", freq: 420, dur: 0.14, type:"triangle", gain: 0.20, sweep: 1.5 },
  craft:     { kind:"pluck", freq: 300, dur: 0.22, type:"square",   gain: 0.14, sweep: 2.2 },
  card:      { kind:"pluck", freq: 520, dur: 0.10, type:"sine",     gain: 0.18, sweep: 1.2 },
  attack:    { kind:"noise", dur: 0.16, gain: 0.20, hp: 700 },
  damage:    { kind:"pluck", freq: 140, dur: 0.18, type:"sawtooth", gain: 0.22, sweep: 0.55 },
  heal:      { kind:"chord", notes:[72, 76, 79], dur: 0.42, type:"sine",     gain: 0.13 },
  coin:      { kind:"chord", notes:[84, 91],     dur: 0.20, type:"triangle", gain: 0.12 },
  levelUp:   { kind:"arp",   notes:[60, 64, 67, 72], step: 0.075, dur: 0.30, type:"triangle", gain: 0.16 },
  win:       { kind:"arp",   notes:[60, 64, 67, 72, 76], step: 0.11, dur: 0.55, type:"triangle", gain: 0.18 },
  lose:      { kind:"arp",   notes:[60, 56, 53, 48], step: 0.14, dur: 0.55, type:"sawtooth", gain: 0.13 },
  slab:      { kind:"arp",   notes:[76, 83, 88, 95], step: 0.06, dur: 0.7,  type:"sine",     gain: 0.15 },
  // zone transition — a rising, airy arpeggio so stepping through a gateway is audible
  zone:      { kind:"arp",   notes:[64, 71, 76, 83], step: 0.08, dur: 0.5, type:"sine",     gain: 0.14 },
  ui:        { kind:"pluck", freq: 660, dur: 0.05, type:"sine",     gain: 0.08, sweep: 1.0 },
  error:     { kind:"pluck", freq: 180, dur: 0.14, type:"square",   gain: 0.12, sweep: 0.7 },
};

function loadPrefs(){
  try {
    const p = JSON.parse(localStorage.getItem(STORE_KEY));
    if (p && typeof p === "object") return { muted:!!p.muted, sfx:clamp01(p.sfx ?? 0.8), music:clamp01(p.music ?? 0.35) };
  } catch(e){}
  return { muted:false, sfx:0.8, music:0.35 };
}
const clamp01 = v => Math.max(0, Math.min(1, Number(v) || 0));

export function createAudio(){
  const prefs = loadPrefs();
  let ctx = null, master = null, sfxBus = null, musicBus = null, noiseBuf = null;
  let musicTimer = null, mode = "world", started = false, ambience = null;

  function savePrefs(){
    try { localStorage.setItem(STORE_KEY, JSON.stringify(prefs)); } catch(e){}
  }

  // Built lazily and defensively: a browser without WebAudio must degrade to silence, never throw.
  function ensure(){
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
      master = ctx.createGain();  master.gain.value = prefs.muted ? 0 : 1;  master.connect(ctx.destination);
      sfxBus = ctx.createGain();  sfxBus.gain.value = prefs.sfx;            sfxBus.connect(master);
      musicBus = ctx.createGain(); musicBus.gain.value = prefs.music;       musicBus.connect(master);
      // one short noise buffer, reused by every noise-based cue
      const n = Math.floor(ctx.sampleRate * 0.4);
      noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i=0;i<n;i++) d[i] = Math.random()*2 - 1;
    } catch(e){ ctx = null; }
    return ctx;
  }

  function env(node, gain, dur, t0){
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain), t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    node.connect(g);
    return g;
  }

  function tone(freq, dur, type, gain, t0, sweep){
    const o = ctx.createOscillator();
    o.type = type || "sine";
    o.frequency.setValueAtTime(freq, t0);
    if (sweep && sweep !== 1) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq*sweep), t0 + dur);
    const g = env(o, gain, dur, t0);
    g.connect(sfxBus);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }

  function noise(dur, gain, t0, hp){
    const src = ctx.createBufferSource(); src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = "highpass"; f.frequency.value = hp || 500;
    src.connect(f);
    const g = env(f, gain, dur, t0);
    g.connect(sfxBus);
    src.start(t0); src.stop(t0 + dur + 0.02);
  }

  function play(name){
    if (prefs.muted || !ensure() || ctx.state === "suspended") return;
    const s = SFX[name]; if (!s) return;
    const t0 = ctx.currentTime;
    try {
      if (s.kind === "pluck") tone(s.freq, s.dur, s.type, s.gain, t0, s.sweep);
      else if (s.kind === "noise") noise(s.dur, s.gain, t0, s.hp);
      else if (s.kind === "chord") for (const n of s.notes) tone(hz(n), s.dur, s.type, s.gain, t0, 1);
      else if (s.kind === "arp") s.notes.forEach((n,i) => tone(hz(n), s.dur, s.type, s.gain, t0 + i*s.step, 1));
    } catch(e){}
  }

  // ---- ambience: a slow two-oscillator pad, plus occasional wind, only while the 3D world is
  // on screen. The pad alone was static — a held chord never changes, which reads as a looping
  // background track rather than a place. A soft filtered-noise gust every 10-25s (randomised,
  // never on a fixed beat so it doesn't read as a loop point) is what actually sells "outdoors".
  function windGust(){
    if (!ambience || !ctx || prefs.muted) return;
    try {
      const t0 = ctx.currentTime;
      const dur = 2.5 + Math.random()*2.5;
      const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
      const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 320 + Math.random()*200; f.Q.value = 0.7;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.045, t0 + dur*0.4);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(f); f.connect(g); g.connect(musicBus);
      src.start(t0); src.stop(t0 + dur + 0.1);
    } catch(e){}
    ambience.windTimer = setTimeout(windGust, 10000 + Math.random()*15000);
  }
  function startAmbience(){
    if (ambience || !ensure() || prefs.muted) return;
    try {
      const g = ctx.createGain(); g.gain.value = 0.0001; g.connect(musicBus);
      g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 3);
      const oscs = [];
      for (const [note, detune] of [[45, -4], [52, 5], [57, 0]]){
        const o = ctx.createOscillator();
        o.type = "sine"; o.frequency.value = hz(note); o.detune.value = detune;
        const lfo = ctx.createOscillator(), lfoGain = ctx.createGain();
        lfo.frequency.value = 0.05 + Math.random()*0.05; lfoGain.gain.value = 3;
        lfo.connect(lfoGain); lfoGain.connect(o.detune);
        o.connect(g); o.start(); lfo.start();
        oscs.push(o, lfo);
      }
      ambience = { g, oscs, windTimer: null };
      ambience.windTimer = setTimeout(windGust, 6000 + Math.random()*8000);
    } catch(e){}
  }
  function stopAmbience(){
    if (!ambience) return;
    try {
      ambience.g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.2);
      const dead = ambience.oscs;
      clearTimeout(ambience.windTimer);
      setTimeout(()=>{ for (const o of dead){ try{ o.stop(); }catch(e){} } }, 1500);
    } catch(e){}
    ambience = null;
  }

  // ---- music: a self-generating arpeggio in the current mode ----
  function step(){
    if (!ctx || prefs.muted) return;
    const m = MODES[mode] || MODES.world;
    const t0 = ctx.currentTime + 0.02;
    const deg = m.steps[Math.floor(Math.random()*m.steps.length)];
    const oct = 12 * (Math.random() < 0.25 ? 1 : 0);
    try {
      const o = ctx.createOscillator();
      o.type = "triangle";
      o.frequency.value = hz(m.root + deg + oct + 12);
      const g = env(o, 0.10, 0.55, t0);
      g.connect(musicBus);
      o.start(t0); o.stop(t0 + 0.6);
      // a soft bass note every fourth step keeps it grounded
      if (Math.random() < 0.3){
        const b = ctx.createOscillator();
        b.type = "sine"; b.frequency.value = hz(m.root - 12);
        const bg = env(b, 0.12, 1.1, t0);
        bg.connect(musicBus);
        b.start(t0); b.stop(t0 + 1.2);
      }
    } catch(e){}
  }
  function startMusic(){
    if (musicTimer || !ensure()) return;
    const m = MODES[mode] || MODES.world;
    musicTimer = setInterval(step, (60 / m.bpm) * 1000);
  }
  function stopMusic(){ clearInterval(musicTimer); musicTimer = null; }

  return {
    // Call from the first real user gesture — browsers refuse to start audio before one.
    unlock(){
      if (!ensure()) return;
      if (ctx.state === "suspended") ctx.resume().catch(()=>{});
      if (!started){ started = true; if (!prefs.muted){ startMusic(); } }
    },
    play,
    setContext(next){
      if (mode === next) return;
      mode = next;
      if (musicTimer){ stopMusic(); startMusic(); }
      if (next === "world") startAmbience(); else stopAmbience();
    },
    setMuted(v){
      prefs.muted = !!v; savePrefs();
      if (!ensure()) return;
      master.gain.setTargetAtTime(prefs.muted ? 0 : 1, ctx.currentTime, 0.05);
      if (prefs.muted){ stopMusic(); stopAmbience(); }
      else if (started){ startMusic(); if (mode === "world") startAmbience(); }
    },
    isMuted(){ return prefs.muted; },
    setSfxVolume(v){ prefs.sfx = clamp01(v); savePrefs(); if (ensure()) sfxBus.gain.value = prefs.sfx; },
    setMusicVolume(v){ prefs.music = clamp01(v); savePrefs(); if (ensure()) musicBus.gain.value = prefs.music; },
    volumes(){ return { sfx: prefs.sfx, music: prefs.music, muted: prefs.muted }; },
  };
}
