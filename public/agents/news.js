// Patch notes: what the watcher can do that the page never says out loud.
// NEWS is the one place a feature gets its line — newest first, one dry
// sentence each. A "what's new" link under the controls opens them; a small
// NEW dot sits on it until the newest line has been seen. The first visit also
// gets one dismissible tip on the board. Both remember in localStorage and
// carry on without it. Web-only, like share.js.
(function () {
  // Eight at most: when a line is added, the oldest drops off the end.
  var NEWS = [
    { id: "2026-10-15-aisles", text: "Added: hot and cold aisles in the Data Center. Agents run hot or get throttled." },
    { id: "2026-10-15-biomes", text: "Added: new paint in all 19 biomes. The agents have not noticed." },
    { id: "2026-10-15-halloween", text: "Added: Halloween, Oct 24 to Nov 1. Same agents, worse lighting." },
    { id: "2026-10-15-replay", text: "Added: instant replay. The level's best moment, again, because nobody saw it the first time." },
    { id: "2026-10-15-sweepstake", text: "Added: sweepstake. Tap an agent before anyone's home to back it. It will not try any harder." },
    { id: "2026-10-15-sightings", text: "Added: sightings. The report card keeps track of the rare things you've seen. Nobody else is told." },
    { id: "2026-10-15-share", text: "Added: copy link. Send someone the exact colony that let you down." },
    { id: "2026-10-15-pep", text: "Added: pep talks. Tap an agent to tell it it's absolutely right. It already knew." }
  ]
  var SEEN_KEY = "oh-no-more-agents-news", TIP_KEY = "oh-no-more-agents-tip"

  function read(store, key) { try { return store && store.getItem(key) } catch (e) { return null } }
  function write(store, key, value) { try { if (store) store.setItem(key, value) } catch (e) { /* private mode: it just shows again */ } }

  function unseen(store) { return read(store, SEEN_KEY) !== NEWS[0].id }
  function markSeen(store) { write(store, SEEN_KEY, NEWS[0].id) }
  function tipDue(store) { return read(store, TIP_KEY) === null }
  function tipDone(store) { write(store, TIP_KEY, "1") }

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
    }
  }

  window.AgentNews = { NEWS: NEWS, unseen: unseen, markSeen: markSeen, tipDue: tipDue, tipDone: tipDone, mount: mount }
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { mount(document) })
    else mount(document)
  }
})()
