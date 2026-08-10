/**
 * analytics.js — lightweight client-side analytics + debug for the live build.
 *
 * Tracks: session start/end (with duration), zone visits, UI tab clicks, uncaught
 * errors, movement "stuck", world/map load events, low-FPS samples, and generic
 * debug breadcrumbs. Events are batched and sent to the Worker's POST /api/analytics
 * (D1-backed), flushed on a timer and on page-hide so nothing is lost on close.
 *
 * Exposes `window.__analytics.track(type, data)` for the game to call anywhere, plus
 * `window.__analytics.debug(...)` for opportunistic breadcrumbs.
 */
(function () {
  if (window.__analytics) return;
  var ENDPOINT = "/api/analytics";

  var pid =
    (typeof localStorage !== "undefined" &&
      (localStorage.getItem("hf:game:playerId") || localStorage.getItem("arcana:pid"))) ||
    (function () {
      var id = Math.random().toString(36).slice(2, 10);
      try { localStorage.setItem("arcana:pid", id); } catch (e) {}
      return id;
    })();

  var events = [];
  var sessionStart = Date.now();
  var queueing = false;
  var started = false;

  function track(type, data) {
    // Session metadata is attached once, on the first event of a session.
    if (!started) {
      started = true;
      events.push({ t: Date.now(), type: "session_meta", pid: pid, data: sessionMeta() });
    }
    events.push({ t: Date.now(), type: type, pid: pid, data: data || {} });
    if (!queueing) { queueing = true; setTimeout(flush, 4000); }
  }

  function sessionMeta() {
    try {
      var r = {};
      r.mobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) || navigator.maxTouchPoints > 1;
      r.screen = (window.screen ? screen.width + "x" + screen.height : "") ;
      r.dpr = window.devicePixelRatio || 1;
      r.lang = navigator.language || "";
      r.ua = (navigator.userAgent || "").slice(0, 120);
      // WebGL renderer (helps spot GPU/context issues)
      try {
        var c = document.createElement("canvas");
        var gl = c.getContext("webgl") || c.getContext("experimental-webgl");
        if (gl && gl.getExtension) {
          var dbg = gl.getExtension("WEBGL_debug_renderer_info");
          r.gl = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : "";
        }
      } catch (e) {}
      return r;
    } catch (e) { return {}; }
  }

  function flush() {
    queueing = false;
    if (!events.length) return;
    var batch = events.splice(0, events.length);
    var body = JSON.stringify(batch);
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "application/json" }));
      } else {
        fetch(ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body: body, keepalive: true });
      }
    } catch (e) { /* never break the game */ }
  }

  function sessionSeconds() { return Math.round((Date.now() - sessionStart) / 1000); }

  // ---- session ----
  track("session_start", {});
  var ended = false;
  function endSession() {
    if (ended) return;
    ended = true;
    track("session_end", { duration_sec: sessionSeconds() });
    flush();
  }
  window.addEventListener("beforeunload", endSession);
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") endSession();
    else if (!ended) { ended = false; }
  });

  // ---- uncaught errors (incl. movement/collision code) ----
  window.addEventListener("error", function (e) {
    track("error", { message: String((e && e.message) || "unknown").slice(0, 200), source: (e && e.filename) || "", line: (e && e.lineno) || 0 });
  });
  window.addEventListener("unhandledrejection", function (e) {
    track("error", { message: "unhandledrejection: " + String(e && e.reason).slice(0, 200) });
  });

  // ---- low-FPS sampling (performance / jank) ----
  var fpsFrames = 0, fpsLast = performance.now(), fpsReported = 0;
  function sampleFps() {
    fpsFrames++;
    var now = performance.now();
    if (now - fpsLast >= 5000) {
      var fps = Math.round((fpsFrames * 1000) / (now - fpsLast));
      fpsFrames = 0; fpsLast = now;
      if (fps < 30) { track("fps", { fps: fps }); fpsReported++; }
      // refresh the sample timer so it keeps running
      requestAnimationFrame(sampleFps);
    } else {
      requestAnimationFrame(sampleFps);
    }
  }
  requestAnimationFrame(sampleFps);

  // ---- public API ----
  window.__analytics = {
    track: track,
    debug: function (k, v) { try { track("debug", { k: k, v: v }); } catch (e) {} },
    flush: flush,
    sessionSeconds: sessionSeconds,
  };
})();