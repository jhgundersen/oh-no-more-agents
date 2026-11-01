// Patch notes: what the watcher can do that the page never says out loud.
// NEWS is the one place a feature gets its line — newest first, one dry
// sentence each. A "what's new" link under the controls opens them; a small
// NEW dot sits on it until the newest line has been seen, remembered in
// localStorage and carried on without it. Web-only, like share.js.
(function () {
  // Eight at most: when a line is added, the oldest (or least useful to a
  // watcher: keep the ones that say what a tap does) drops off.
  var NEWS = [
    { id: "2026-10-29-quiet", text: "Added: fewer words. The report says what happened, and the board does the rest." },
    { id: "2026-10-15-ooo", text: "Added: out-of-office replies. Lost agents leave an auto-reply under the board." },
    { id: "2026-10-15-daily", text: "Added: colony of the day, the same level and colony for everyone. Copy link shares it." },
    { id: "2026-10-15-seasons", text: "Added: Christmas (Dec 1 to 26). Same agents, worse hats." },
    { id: "2026-10-15-sweepstake", text: "Added: sweepstake. Tap an agent before anyone's home to back it. It will not try any harder." },
    { id: "2026-10-15-pep", text: "Added: pep talks. Tap an agent to tell it it's absolutely right. It already knew." }
  ]
  var SEEN_KEY = "oh-no-more-agents-news"

  function read(store, key) { try { return store && store.getItem(key) } catch (e) { return null } }
  function write(store, key, value) { try { if (store) store.setItem(key, value) } catch (e) { /* private mode: it just shows again */ } }

  function unseen(store) { return read(store, SEEN_KEY) !== NEWS[0].id }
  function markSeen(store) { write(store, SEEN_KEY, NEWS[0].id) }

  function store() { try { return window.localStorage } catch (e) { return null } }

  function mount(doc) {
    var open = doc.getElementById("news-open"), panel = doc.getElementById("news")
    var close = doc.getElementById("news-close")
    if (!open || !panel || !close) return
    var list = panel.querySelector("ol")
    NEWS.forEach(function (n) { var li = doc.createElement("li"); li.textContent = n.text; list.appendChild(li) })
    open.classList.toggle("new", unseen(store()))
    function show() {
      if (panel.open) return
      panel.showModal()                     // background controls are inert
      close.focus()
      markSeen(store()); open.classList.remove("new")
    }
    function hide() { panel.close() }
    open.addEventListener("click", show)
    close.addEventListener("click", hide)
    panel.addEventListener("close", function () { open.focus() })
    panel.addEventListener("click", function (e) { if (e.target === panel) hide() })
    // Capture before the game's shortcuts. The notes have one control: both
    // Tab directions stay on Close; native modality also blocks pointer/focus
    // access to the page behind them. Enter/Space retain button activation.
    doc.addEventListener("keydown", function (e) {
      if (!panel.open) return
      if (e.key === "Escape") { e.preventDefault(); hide() }
      else if (e.key === "Tab") { e.preventDefault(); close.focus() }
      e.stopPropagation()
    }, true)
  }

  window.AgentNews = { NEWS: NEWS, unseen: unseen, markSeen: markSeen, mount: mount }
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { mount(document) })
    else mount(document)
  }
})()
