// Patch notes: what the watcher can do that the page never says out loud.
// NEWS is the one place a feature gets its line — newest first, one dry
// sentence each. A "what's new" link under the controls opens them; a small
// NEW dot sits on it until the newest line has been seen. The first visit also
// gets one dismissible tip on the board. Both remember in localStorage and
// carry on without it. Web-only, like share.js.
(function () {
  // Eight at most: when a line is added, the oldest (or least useful to a
  // watcher: keep the ones that say what a tap does) drops off.
  var NEWS = [
    { id: "2026-10-15-daily", text: "Added: colony of the day, the same level and colony for everyone. Copy link shares it." },
    { id: "2026-10-15-tour", text: "Added: The Cloud, a 20th biome, and a tour strip to visit all twenty. Bring an umbrella." },
    { id: "2026-10-15-voices", text: "Added: voices, with sound on. Let's go, oh no, yippee. Any resemblance is a tribute." },
    { id: "2026-10-15-librarian", text: "Added: a librarian in the Library, hot and cold aisles in the Data Center. Both have notes." },
    { id: "2026-10-15-seasons", text: "Added: Halloween (Oct 24 to Nov 1) and Christmas (Dec 1 to 26). Same agents, worse hats." },
    { id: "2026-10-15-replay", text: "Added: instant replay. The level's best moment, again, because nobody saw it the first time." },
    { id: "2026-10-15-sweepstake", text: "Added: sweepstake. Tap an agent before anyone's home to back it. It will not try any harder." },
    { id: "2026-10-15-pep", text: "Added: pep talks. Tap an agent to tell it it's absolutely right. It already knew." }
  ]
  var SEEN_KEY = "oh-no-more-agents-news", TIP_KEY = "oh-no-more-agents-tip"

  function read(store, key) { try { return store && store.getItem(key) } catch (e) { return null } }
  function write(store, key, value) { try { if (store) store.setItem(key, value) } catch (e) { /* private mode: it just shows again */ } }

  function unseen(store) { return read(store, SEEN_KEY) !== NEWS[0].id }
  function markSeen(store) { write(store, SEEN_KEY, NEWS[0].id) }
  function tipDue(store) { return read(store, TIP_KEY) === null }
  function tipDone(store) { write(store, TIP_KEY, "1") }

  // The first level the tip went up on is over.
  var tipLevel = null
  function tipOver(w) {
    if (tipLevel === null) tipLevel = w.level
    return w.done || w.level !== tipLevel
  }

  function store() { try { return window.localStorage } catch (e) { return null } }

  function mount(doc) {
    var open = doc.getElementById("news-open"), panel = doc.getElementById("news")
    if (!open || !panel) return
    var list = panel.querySelector("ol")
    NEWS.forEach(function (n) { var li = doc.createElement("li"); li.textContent = n.text; list.appendChild(li) })
    open.classList.toggle("new", unseen(store()))
    function show() { panel.hidden = false; markSeen(store()); open.classList.remove("new") }
    function hide() { panel.hidden = true; open.focus() }
    open.addEventListener("click", show)
    panel.addEventListener("click", hide)
    // Capture, so Escape closes the notes and nothing else hears it.
    doc.addEventListener("keydown", function (e) {
      if (panel.hidden) return
      if (e.key === "Escape") hide()
      e.stopPropagation()
    }, true)

    var tip = doc.getElementById("tip")
    if (tip && tipDue(store())) {
      tip.hidden = false
      var board = doc.getElementById("board")
      var dismiss = function () { tip.hidden = true; tipDone(store()); if (board) board.removeEventListener("click", dismiss) }
      tip.addEventListener("click", function (e) { e.stopPropagation(); dismiss() })
      if (board) board.addEventListener("click", dismiss)
      // Nor does it outstay the first level: a tip still on the board a
      // minute later, over the next level, is clutter (first-look review).
      var poll = setInterval(function () {
        var w = window.AgentWorld && window.AgentWorld()
        if (tip.hidden) { clearInterval(poll); return }
        if (w && tipOver(w)) { dismiss(); clearInterval(poll) }
      }, 500)
    }
  }

  window.AgentNews = { NEWS: NEWS, unseen: unseen, markSeen: markSeen, tipDue: tipDue, tipDone: tipDone, mount: mount, tipOver: tipOver }
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { mount(document) })
    else mount(document)
  }
})()
