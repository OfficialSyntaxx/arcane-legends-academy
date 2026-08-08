/**
 * analytics.js — lightweight client-side analytics for the live build.
 *
 * Tracks: play-session start/end (with seconds), zone visits, UI tab clicks,
 * and any uncaught JS errors (which includes movement/collision code). Events
 * are batched and sent to the Worker's POST /api/analytics endpoint (D1-backed),
 * flushed on a timer and on page hide so nothing is lost when the tab closes.
 */
(function () {
  if (window.__analytics) return;
  var ENDPOINT = "/api/analytics";

  // Stable per-browser id — reuse the game's duel id if present, else our own.
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

  function track(type, data) {
    events.push({ t: Date.now(), type: type, pid: pid, data: data || {} });
    if (!queueing) { queueing = true; setTimeout(flush, 4000); } // throttle: flush every ~4s
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
    } catch (e) { /* drop on failure — analytics must never break the game */ }
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
    else if (!ended) { ended = false; } // came back — keep the session alive
  });

  // ---- uncaught errors (includes movement/collision code) ----
  window.addEventListener("error", function (e) {
    track("error", { message: String(e && e.message || "unknown").slice(0, 200), source: (e && e.filename) || "" });
  });
  window.addEventListener("unhandledrejection", function (e) {
    track("error", { message: "unhandledrejection: " + String(e && e.reason).slice(0, 200) });
  });

  // ---- public API for the game to call ----
  window.__analytics = {
    track: track,
    flush: flush,
    sessionSeconds: sessionSeconds,
  };
})();