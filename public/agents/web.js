// Browser host integration. Shared game files stay host-agnostic.

(function () {
  "use strict"

  // Omarchy's five foundational theme colors; urgent maps to each theme's red.
  var THEMES = {
    "tokyo-night":  { background: "#1a1b26", foreground: "#a9b1d6", accent: "#7aa2f7", urgent: "#f7768e", muted: "#414868" },
    "catppuccin":   { background: "#1e1e2e", foreground: "#cdd6f4", accent: "#89b4fa", urgent: "#f38ba8", muted: "#585b70" },
    "gruvbox":      { background: "#282828", foreground: "#d4be98", accent: "#7daea3", urgent: "#ea6962", muted: "#665c54" },
    "nord":         { background: "#2e3440", foreground: "#d8dee9", accent: "#81a1c1", urgent: "#bf616a", muted: "#4c566a" },
    "everforest":   { background: "#2d353b", foreground: "#d3c6aa", accent: "#7fbbb3", urgent: "#e67e80", muted: "#475258" },
    "kanagawa":     { background: "#1f1f28", foreground: "#dcd7ba", accent: "#dcd7ba", urgent: "#c34043", muted: "#54546d" },
    "osaka-jade":   { background: "#111c18", foreground: "#c1c497", accent: "#509475", urgent: "#c34043", muted: "#53685b" },
    "matte-black":  { background: "#121212", foreground: "#bebebe", accent: "#e68e0d", urgent: "#d35f5f", muted: "#333333" },
    "hackerman":    { background: "#0b0c16", foreground: "#ddf7ff", accent: "#82fb9c", urgent: "#ff5555", muted: "#2d3450" }
  }
  var THEME_ORDER = Object.keys(THEMES)
  // Light themes collapse the contrast between terrain tiers, so use dark ones.

  // Panel.qml's numbers, not new ones.
  var SPEED_NAMES = ["Calm", "Steady", "Brisk"]
  var SPEED_INTERVALS = [45, 33, 22]
  // Canvas pixels per art pixel (see clearLayer in Draw.js). The board's size
  // on screen is unchanged; the art gets twice the resolution to be drawn in.
  var RES = 2
  var DONE_HOLD = 110      // ticks to sit on a finished level before moving on

  var world = null
  var level = 1
  var running = true
  var showLabels = false
  var speedIndex = 1
  var themeName = "tokyo-night"
  var completionLine = ""
  var lastTerrainVersion = 0
  var lifetimeSaved = 0
  var levelsCleared = 0
  var globalSaved = null
  var milestone = null      // this session's community milestone, if one was crossed
  var levelsThisVisit = 0   // the sweepstake's how-to shows on the first few
  var pendingReports = []
  var pendingBatch = null
  var flushedThisSession = false
  var reporting = false
  var reportingSince = 0
  var updateBuild = null
  var lastStatsAt = 0
  var palette = null

  var el = {}
  var terrainCtx = null
  var actorCtx = null

  // Persistence — localStorage standing in for the plugin's state.json, same
  // fields, so a level you left off on comes back.

  var STORE_KEY = "oh-no-more-agents"
  var REPORT_STORE_KEY = "oh-no-more-agents-pending-reports"
  var BATCH_STORE_KEY = "oh-no-more-agents-pending-batch"

  // A level lasts under a minute, so reporting each one put a write on the
  // counter every forty seconds per player. Rescues pool into one report per
  // BATCH_LEVELS instead. The first completed level after a load always flushes,
  // so a batch left over from a previous visit goes up while the player is still
  // here rather than waiting for four more levels. MAX_REPORT_SAVED is the
  // server's cap: a full batch of the biggest colony (5 x 18).
  var BATCH_LEVELS = 5
  var MAX_REPORT_SAVED = 90

  // Staying current. A tab left open all week would otherwise play last week's
  // build forever. Every counter reply carries the build a fresh load would
  // get, so a deploy is noticed on a request the page was making anyway —
  // roughly one per batch of levels. The idle poll is for a paused game, where
  // nothing else asks; it refreshes the global total on screen at the same time.
  var BUILD_KEY = "oh-no-more-agents-update"
  var STATS_IDLE = 20 * 60 * 1000

  function loadState() {
    try {
      var d = JSON.parse(localStorage.getItem(STORE_KEY) || "{}")
      if (typeof d.level === "number" && d.level >= 1) level = Math.floor(d.level)
      if (typeof d.lifetimeSaved === "number") lifetimeSaved = d.lifetimeSaved
      if (typeof d.levelsCleared === "number") levelsCleared = d.levelsCleared
      if (typeof d.speedIndex === "number" && d.speedIndex >= 0 && d.speedIndex < SPEED_INTERVALS.length)
        speedIndex = Math.floor(d.speedIndex)
      if (typeof d.showLabels === "boolean") showLabels = d.showLabels
      if (typeof d.theme === "string" && THEMES[d.theme]) themeName = d.theme
      if (typeof d.track === "number" && d.track >= 0 && d.track < TRACKS.length) trackIndex = Math.floor(d.track)
      if (d.sfx === true && window.AgentSfx) AgentSfx.setOn(true)
    } catch (e) { /* first visit, or someone cleared it */ }
  }

  function saveState() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        version: 1, level: level, lifetimeSaved: lifetimeSaved,
        levelsCleared: levelsCleared, speedIndex: speedIndex,
        showLabels: showLabels, theme: themeName, track: trackIndex,
        sfx: !!(window.AgentSfx && AgentSfx.isOn())
      }))
    } catch (e) { /* private browsing; the sim doesn't care */ }
  }

  // A backlog used to be trimmed to the last fifty reports on load and the rest
  // thrown away — about three thousand rescues kept, and the rest of a stalled
  // day discarded on the very reload that was supposed to recover it. The cap
  // is four hundred now, which at a full batch of sixty-odd is a day and a
  // half of total outage, and it is still a cap because an unbounded queue in
  // localStorage is its own failure.
  //
  // packReports is the smaller half and worth being honest about: reports are
  // pure addition, so a run of them is worth one larger one — but only up to
  // MAX_REPORT_SAVED, and a full five-level batch is already two thirds of
  // that. Measured on a stalled day of full batches it merges nothing at all.
  // What it does is stop a queue of part-batches (a browser that keeps being
  // closed mid-run) from eating the cap with reports worth five rescues each.
  //
  // The head is never merged. It is the one report that may have been in
  // flight when the page went away, and the server's idempotency is keyed on
  // its event id — re-sending it under a new id would count it twice, which is
  // the one failure worse than losing it.
  var REPORT_QUEUE_CAP = 400

  function packReports(list) {
    if (list.length < 2) return list
    var out = [list[0]]
    var open = null
    for (var i = 1; i < list.length; i++) {
      var r = list[i]
      if (open && open.saved + r.saved <= MAX_REPORT_SAVED) { open.saved += r.saved; continue }
      open = { eventId: r.eventId, saved: r.saved }
      out.push(open)
    }
    return out
  }

  function loadPendingReports() {
    try {
      var reports = JSON.parse(localStorage.getItem(REPORT_STORE_KEY) || "[]")
      if (Array.isArray(reports)) pendingReports = packReports(reports.filter(function (r) {
        return r && typeof r.eventId === "string" && Number.isInteger(r.saved)
          && r.saved > 0 && r.saved <= MAX_REPORT_SAVED
      })).slice(-REPORT_QUEUE_CAP)
    } catch (e) { pendingReports = [] }
  }

  function savePendingReports() {
    // Compact before writing too, so a session that never reloads cannot grow
    // the queue past what localStorage will take.
    if (pendingReports.length > 24) pendingReports = packReports(pendingReports)
    if (pendingReports.length > REPORT_QUEUE_CAP) pendingReports = pendingReports.slice(-REPORT_QUEUE_CAP)
    try { localStorage.setItem(REPORT_STORE_KEY, JSON.stringify(pendingReports)) } catch (e) {}
  }

  function loadPendingBatch() {
    try {
      var b = JSON.parse(localStorage.getItem(BATCH_STORE_KEY) || "null")
      if (b && typeof b.eventId === "string" && Number.isInteger(b.saved) && b.saved >= 0 &&
          b.saved <= MAX_REPORT_SAVED && Number.isInteger(b.levels) && b.levels >= 0)
        pendingBatch = { eventId: b.eventId, saved: b.saved, levels: b.levels }
    } catch (e) { pendingBatch = null }
  }

  function savePendingBatch() {
    try {
      if (pendingBatch) localStorage.setItem(BATCH_STORE_KEY, JSON.stringify(pendingBatch))
      else localStorage.removeItem(BATCH_STORE_KEY)
    } catch (e) {}
  }

  function reportId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID()
    return "rescue_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 14)
  }

  // A finished level joins the open batch; a sealed batch becomes a queued
  // report and travels by the retry machinery below, unchanged.
  function enqueueGlobalSaves(saved) {
    if (!Number.isInteger(saved) || saved < 0) return
    if (pendingBatch && pendingBatch.saved + saved > MAX_REPORT_SAVED) sealBatch()
    if (!pendingBatch) pendingBatch = { eventId: reportId(), saved: 0, levels: 0 }
    pendingBatch.saved += saved
    pendingBatch.levels += 1
    if (pendingBatch.levels >= BATCH_LEVELS || !flushedThisSession) sealBatch()
    savePendingBatch()
    flushGlobalSaves()
  }

  function sealBatch() {
    flushedThisSession = true
    if (!pendingBatch) return
    if (pendingBatch.saved > 0) {
      pendingReports.push({ eventId: pendingBatch.eventId, saved: pendingBatch.saved })
      savePendingReports()
    }
    pendingBatch = null
  }

  // `reporting` is a latch that stops two reports going up at once, and it was
  // cleared only by the fetch settling. A fetch is not obliged to settle: a
  // request in flight when the tab is backgrounded, or on a network that goes
  // away without closing the socket, can hang for the life of the page. When
  // that happened the latch stayed shut for the rest of the session and every
  // later report was queued and never sent — the page kept playing and kept
  // counting, and nothing left the machine. A screen left running for a day
  // rescued thirteen thousand agents and posted about nine hundred.
  //
  // Two belts for one job, because this failure is silent and expensive: the
  // request is aborted on a timer, and the latch itself is treated as stale
  // past REPORT_STALE regardless of what the promise did. Either alone would
  // have been enough; both, because there is no way to notice from inside the
  // page that the latch is shut and no reason to trust the promise again.
  var REPORT_TIMEOUT = 15000
  var REPORT_STALE = 45000
  // Unconditional retry. Every other trigger is an event that may never come
  // again on a machine left running: a level completing, a send succeeding, the
  // browser coming back online. If the head of the queue wedges for any reason
  // — a 429, a reload that killed the request in flight, a stall — the backlog
  // used to sit there until somebody finished another level, and if the thing
  // that wedged it also stopped the game there was no next level. A timer owes
  // nothing to any of that.
  var REPORT_RETRY = 20000
  // A report that keeps failing must not hold the queue shut behind it. After
  // this many consecutive failures the head goes to the back and the next one
  // gets a turn; re-sending it later is free, because the server dedupes on
  // its event id. Losing one report is a rounding error. Losing every report
  // behind it is what this whole afternoon was.
  var REPORT_MAX_TRIES = 4
  var headFailures = 0

  function flushGlobalSaves() {
    if (pendingReports.length === 0) return
    if (reporting) {
      if (Date.now() - reportingSince < REPORT_STALE) return
      // Whatever that request is doing, it is not coming back.
      reporting = false
    }
    reporting = true
    reportingSince = Date.now()
    var report = pendingReports[0]
    var done = false
    function release() {
      if (done) return
      done = true
      reporting = false
    }
    var ctl = typeof AbortController === "function" ? new AbortController() : null
    var timer = setTimeout(function () {
      release()
      if (ctl) try { ctl.abort() } catch (e) {}
    }, REPORT_TIMEOUT)
    var opts = {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(report)
    }
    if (ctl) opts.signal = ctl.signal
    fetch("/api/saves", opts).then(function (response) {
      if (!response.ok) throw new Error("counter unavailable")
      return response.json()
    }).then(function (stats) {
      clearTimeout(timer)
      if (done) return          // the timeout already gave up on this one
      lastStatsAt = Date.now()
      noteTotal(stats.totalSaved)
      noteBuild(stats.build)
      pendingReports.shift()
      headFailures = 0
      savePendingReports()
      release()
      render()
      flushGlobalSaves()
    }).catch(function () {
      clearTimeout(timer)
      release()
      // The queue stays in localStorage and the timer will come back for it.
      // What must not happen is the head sitting at the front forever: rotate
      // it once it has had its turns, so a single poisoned or rate-limited
      // report cannot hold everything behind it.
      headFailures++
      if (headFailures >= REPORT_MAX_TRIES && pendingReports.length > 1) {
        pendingReports.push(pendingReports.shift())
        headFailures = 0
        savePendingReports()
      }
    })
  }

  function loadGlobalStats() {
    lastStatsAt = Date.now()
    fetch("/api/stats").then(function (response) {
      if (!response.ok) throw new Error("counter unavailable")
      return response.json()
    }).then(function (stats) {
      noteTotal(stats.totalSaved)
      noteBuild(stats.build)
      render()
      flushGlobalSaves()
    }).catch(function () { render() })
  }

  // The build this page was served as. Deployed pages are never cached, so the
  // two agreeing means the tab is current.
  function pageBuild() {
    var meta = document.querySelector('meta[name="build"]')
    return (meta && meta.content) || ""
  }

  function noteBuild(build) {
    var mine = pageBuild()
    if (!build || !mine || build === mine || updateBuild) return
    // Reloading and coming back the same build would loop, so a build gets one
    // attempt. Something between here and the Worker is serving an old page,
    // and hammering it will not change that.
    var last = null
    try { last = JSON.parse(localStorage.getItem(BUILD_KEY) || "null") } catch (e) {}
    if (last && last.build === build) return
    updateBuild = build
  }

  // Between levels only: mid-level there is nothing to come back to, and the
  // level about to start is already in localStorage, so the reload is invisible
  // apart from the flicker.
  function applyUpdate() {
    if (!updateBuild) return
    try {
      localStorage.setItem(BUILD_KEY, JSON.stringify({ build: updateBuild, at: Date.now() }))
    } catch (e) {}
    updateBuild = null
    location.reload()
  }

  function rebuildPalette() {
    var t = THEMES[themeName]
    palette = build({
      background: hex(t.background), foreground: hex(t.foreground),
      accent: hex(t.accent), urgent: hex(t.urgent), muted: hex(t.muted)
    }, level)
    if (window.AgentSeason) window.AgentSeason.tint(palette)

    var root = document.documentElement
    root.style.setProperty("--bg", t.background)
    root.style.setProperty("--fg", t.foreground)
    root.style.setProperty("--accent", t.accent)
    root.style.setProperty("--muted", t.muted)
    root.style.setProperty("--urgent", t.urgent)
  }

  // iOS innerHeight changes with its toolbars; clientHeight is the stable layout
  // viewport. Fullscreen has no toolbars and should use innerHeight directly.
  function viewportHeight(full) {
    if (full) return window.innerHeight
    var doc = document.documentElement
    return Math.max(window.innerHeight || 0, (doc && doc.clientHeight) || 0)
  }

  function applyScale(scale) {
    el.stage.dataset.boardScale = scale
    el.boardWrap.style.width = (WIDTH * scale) + "px"
    el.boardWrap.style.height = (HEIGHT * scale) + "px"
    document.documentElement.style.setProperty("--board-w", (WIDTH * scale) + "px")
  }

  // Does everything that has to be on screen fit, at whatever size the board is
  // right now? On the page that is the whole page; in fullscreen it is the
  // stage, because there is nothing else.
  function boardFits(full) {
    if (full) return stageAroundBoard() + el.boardWrap.clientHeight <= viewportHeight(true)
    // Only the board and content above it must fit before the fold.
    var top = el.boardWrap.getBoundingClientRect().top + (window.scrollY || 0)
    return top + el.boardWrap.clientHeight <= viewportHeight(false)
  }

  // Test integer scales because board-width controls can reflow at each size.
  function fitBoard() {
    var full = isFullscreen()
    var avail = el.boardWrap.parentElement.clientWidth
    var top = Math.max(1, Math.min(Math.floor(avail / WIDTH), full ? 6 : 4))
    for (var scale = top; scale > 1; scale--) {
      applyScale(scale)
      if (boardFits(full)) { renderCaption(); return }
    }
    applyScale(1)
    renderCaption()
  }

  // Accepts ?full, ?full=1 and ?fullscreen; ?full=0 and ?full=false are an
  // explicit no, so the parameter can be templated in as a variable without
  // the caller having to add and remove it.
  function fullParam() {
    var q = new URLSearchParams(window.location.search)
    var v = q.has("full") ? q.get("full") : (q.has("fullscreen") ? q.get("fullscreen") : null)
    if (v === null) return false
    return v !== "0" && v !== "false" && v !== "off"
  }

  // Fullscreening #stage lets the browser hide its siblings.

  function fullscreenEl() {
    return document.fullscreenElement || document.webkitFullscreenElement || null
  }

  function isFullscreen() {
    return fullscreenEl() === el.stage || el.stage.classList.contains("faux")
  }

  // iOS and framed pages may lack/refuse fullscreen, so retain the CSS fallback.
  function setFaux(on) {
    el.stage.classList.toggle("faux", on)
    afterFullscreen()
  }

  function toggleFullscreen() {
    if (isFullscreen()) {
      var exit = document.exitFullscreen || document.webkitExitFullscreen
      if (fullscreenEl() && exit) exit.call(document)
      else setFaux(false)
      return
    }
    var req = el.stage.requestFullscreen || el.stage.webkitRequestFullscreen
    if (!req) return setFaux(true)
    var asked
    try { asked = req.call(el.stage) } catch (e) { return setFaux(true) }
    if (asked && asked.catch) asked.catch(function () { setFaux(true) })
  }

  // Sum children: in fullscreen stage.scrollHeight is the screen, not its content.
  function stageAroundBoard() {
    var st = getComputedStyle(el.stage)
    var total = (parseFloat(st.paddingTop) || 0) + (parseFloat(st.paddingBottom) || 0)
    var gap = parseFloat(st.rowGap) || 0
    var kids = el.stage.children
    for (var i = 0; i < kids.length; i++) {
      if (kids[i] !== el.boardWrap) total += kids[i].offsetHeight
      if (i) total += gap
    }
    return total
  }

  function afterFullscreen() {
    syncLogoMotion()
    el.fullWord.textContent = isFullscreen() ? "on" : "off"
    el.fullWord.parentNode.setAttribute("aria-pressed", isFullscreen() ? "true" : "false")
    fitBoard()
    render()
  }

  // -------------------------------------------------------------------------
  // Level lifecycle — Panel.qml's, step for step
  // -------------------------------------------------------------------------

  // Every total the counter hands back passes through here: a round number
  // crossed (Outcome's milestoneFor) dresses the colony for the rest of the
  // session, starting with the level on screen.
  function tipShowing() {
    var store = null
    try { store = window.localStorage } catch (e) {}
    return !!(window.AgentNews && AgentNews.tipDue(store))
  }

  function noteTotal(total) {
    var m = milestoneFor(globalSaved, total)
    globalSaved = total
    if (!m || (milestone && milestone.n >= m.n)) return
    milestone = m
    if (world) celebrate(world)
  }
  function celebrate(w) {
    w.milestone = milestone
    w.feed.push({ t: Math.max(w.ticks, 40), text: milestone.line })
  }

  function newLevel(n, seed) {
    // Any navigation ends the last level's intermission without its own
    // ending: a standup or replay left running drew over the new colony, and
    // the standup's finish then advanced again — Next during a standup
    // skipped a level (review 2026-10-15, finding 1).
    standup = null
    replay = null
    level = Math.max(1, n)
    world = generate(level, 0, seed)
    world.res = RES
    world.doneHold = DONE_HOLD
    if (milestone) world.milestone = milestone
    // The first few levels of a visit say how the sweepstake works — not
    // while the first-visit tip (news.js) is saying "tap an agent" already.
    if (++levelsThisVisit <= 3 && !tipShowing()) world.feed.push({ t: 45, text: "TAP AN AGENT: WHO GETS HOME FIRST?" })
    world.reducedMotion = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches)
    announce(levelAnnouncement(world) + " " + levelTitleSubtitle(world.level, world.biome))
    completionLine = ""
    lastTerrainVersion = 0
    rebuildPalette()
    paintTerrain()
    paintActors()
    showLevelTitle()
    render()
  }

  function advance(delta) { newLevel(level + delta); saveState() }

  // The tour: one tiny thumbnail per biome, painted from that biome's own
  // palette in the current theme, so a visitor who never gets past level five
  // can still see the Harbour or The Cloud. A jump is a move like prev/next:
  // nothing is cleared and nothing is counted. It goes to that biome's next
  // level after this one, so a tour moves forward through the game.
  function tourLevel(from, biome, count) {
    var l = from + 1
    while ((l - 1) % count !== biome) l++
    return l
  }
  window.AgentTour = { level: tourLevel }

  function buildTour() {
    if (!el.tour) return
    el.tour.innerHTML = ""
    BIOMES.forEach(function (name, i) {
      var b = document.createElement("button")
      b.className = "tour-stop"
      b.title = name
      b.setAttribute("aria-label", "Go to " + name)
      var c = document.createElement("canvas")
      c.width = 24; c.height = 16
      c.setAttribute("aria-hidden", "true")
      b.appendChild(c)
      b.addEventListener("click", function () { newLevel(tourLevel(level, i, BIOMES.length)); saveState(); render() })
      el.tour.appendChild(b)
    })
    paintTour()
  }

  function paintTour() {
    var badge = document.getElementById("dailyBadge")
    if (badge) drawDailyBadge(badge.getContext("2d"), 0, 0)
    if (!el.tour) return
    var t = THEMES[themeName]
    Array.prototype.forEach.call(el.tour.children, function (b, i) {
      var pal = build({ background: hex(t.background), foreground: hex(t.foreground), accent: hex(t.accent),
        urgent: hex(t.urgent), muted: hex(t.muted) }, i + 1)
      drawTourIcon(b.firstChild.getContext("2d"), pal, i)
    })
  }


  function tick() {
    if (!world) return
    if (standup) { stepStandup(); return }
    if (replay) { stepReplay(); return }
    step(world)
    if (window.AgentSfx) AgentSfx.observe(world)
    fastForward(world)

    if (world.terrainVersion !== lastTerrainVersion) {
      lastTerrainVersion = world.terrainVersion
      paintTerrain()
    }
    paintActors()

    if (world.done && completionLine === "") {
      completionLine = outcomeLine(world)
      announce(reportAnnouncement(world))
      noteSightings(world)
      noteBet(world)
      startReplay(world)
      lifetimeSaved += world.saved
      if (world.saved > 0) levelsCleared += 1
      enqueueGlobalSaves(world.saved)
      saveState()
    }

    render()

    // Every generated colony gets one story. Success or failure, move on after
    // the result rather than replaying the same ground with a replacement cast.
    // Every STANDUP_EVERY levels the survivors hold a standup on the way.
    if (world.done && world.doneTicks > DONE_HOLD) {
      recent.push(standupFacts(world))
      if (recent.length > STANDUP_EVERY) recent.shift()
      if (++transitions % STANDUP_EVERY === 0 && startStandup()) return
      advance(1); applyUpdate()
    }
  }

  // Fast-forward through the dead time. Once everybody is out of the hatch and
  // nothing has changed for FF_QUIET ticks, eight seconds (nobody home, nobody lost, not a
  // cell dug), the page runs the same simulation FF_STEPS times a tick until
  // something does — the stall cutoff's last twenty seconds become five. The
  // rules are untouched, so the run is the run it would have been; Draw shows
  // a small FAST-FORWARD tag while it lasts.
  var FF_QUIET = 240, FF_STEPS = 4, ffMark = -1, ffQuiet = 0
  function progressMark(w) { return w.saved * 100000 + w.lost * 1000 + (w.carved || 0) }
  function fastForward(w) {
    var mark = progressMark(w)
    if (mark !== ffMark || w.released < w.toRelease || w.done) { ffMark = mark; ffQuiet = 0; w.fastForward = false; return }
    ffQuiet++
    w.fastForward = ffQuiet > FF_QUIET
    for (var i = 1; w.fastForward && i < FF_STEPS && !w.done; i++) {
      step(w)
      // Every step is heard: the outage's power-down and up, and a fuse's
      // "oh no", are cued on an exact tick, and a skipped tick lost them
      // (review 2026-10-15, finding 5). sfx.js keeps its own real-time gaps.
      if (window.AgentSfx) AgentSfx.observe(w)
      if (progressMark(w) !== ffMark) { w.fastForward = false; ffMark = progressMark(w); ffQuiet = 0 }
    }
  }
  window.AgentFastForward = { quiet: FF_QUIET, steps: FF_STEPS, check: fastForward }

  // -------------------------------------------------------------------------
  // Instant replay (Sim's moments, Draw's drawReplayTag)
  // -------------------------------------------------------------------------
  // When a level ends with a moment worth seeing again, the best one is played
  // back before the report card: the level is generated again from its seed
  // and re-simulated to just before the moment — no frames are kept, and the
  // simulation is deterministic, so this is the same run — then played at the
  // usual speed for about three seconds under an INSTANT REPLAY tag. The
  // re-simulation is spread over a few ticks so a phone does not stall, any pep
  // talks the watcher gave are given again at the same ticks, and if the replay
  // does not note the same moment on the same tick it gives up rather than show
  // something that did not happen. A tap skips it. The finished world,
  // its report and its rescues are untouched throughout.
  var REPLAY_MIN = 3, REPLAY_BEFORE = 60, REPLAY_AFTER = 30, REPLAY_CATCHUP = 150
  var replay = null
  // Read-only, for tools and tests (like AgentWorld).
  window.AgentReplay = function () { return replay && { kind: replay.best.kind, t: replay.sim.ticks, from: replay.from, to: replay.to } }

  function bestMoment(w) {
    var best = null
    for (var i = 0; i < (w.moments || []).length; i++) {
      var m = w.moments[i]
      if (m.score >= REPLAY_MIN && (!best || m.score >= best.score)) best = m
    }
    return best
  }

  function startReplay(w) {
    hideLevelTitle()
    var best = bestMoment(w)
    if (!best) return
    var sim = generate(w.level, w.attempt || 0, w.colonySeed)
    sim.res = w.res; sim.doneHold = w.doneHold; sim.milestone = w.milestone; sim.reducedMotion = w.reducedMotion
    sim.replaying = true
    replay = { src: w, sim: sim, best: best, from: Math.max(0, best.t - REPLAY_BEFORE), to: best.t + REPLAY_AFTER,
      peps: (w.pepLog || []).slice(), terrain: -1 }
  }

  function replayStep() {
    var sim = replay.sim
    for (var i = 0; i < replay.peps.length; i++)
      if (replay.peps[i].t === sim.ticks) pepTalk(sim, agentById(sim, replay.peps[i].id))
    step(sim)
  }

  function stepReplay() {
    var sim = replay.sim
    if (sim.ticks < replay.from) {
      // Rewinding: a chunk a tick, with the finished frame left up meanwhile.
      for (var n = 0; n < REPLAY_CATCHUP && sim.ticks < replay.from && !sim.done; n++) replayStep()
      if (sim.done) endReplay()
      return
    }
    replayStep()
    // The same run arrives at the same moment: the re-simulation must have
    // noted it too, on the same tick. Otherwise this is not a replay.
    if (sim.ticks === replay.best.t && !sim.moments.some(function (m) { return m.t === replay.best.t && m.kind === replay.best.kind })) { endReplay(); return }
    if (window.AgentSeason) window.AgentSeason.dress(sim)
    if (sim.terrainVersion !== replay.terrain) { replay.terrain = sim.terrainVersion; drawTerrain(terrainCtx, sim, palette) }
    drawActors(actorCtx, sim, palette, { labels: showLabels, intro: false, feed: isFullscreen() })
    if (window.AgentSeason) window.AgentSeason.paint(actorCtx, sim)
    if (sim.ticks >= replay.to || sim.done) endReplay()
  }

  function endReplay() {
    replay = null
    lastTerrainVersion = -1
    paintTerrain()
    paintActors()
    render()
  }

  // -------------------------------------------------------------------------
  // Daily standup (Draw's drawStandup, Outcome's standupLines)
  // -------------------------------------------------------------------------
  // Up to five of the colony that just got home, the last few levels as their
  // status. The page allows 2.4 seconds per three-line update, independent
  // of game speed; a tap anywhere on the board still skips the meeting.
  var STANDUP_EVERY = 5, STANDUP_MS = 30   // ms per standup tick
  var recent = [], transitions = 0, standup = null

  function startStandup() {
    hideLevelTitle()
    var home = world.agents.filter(function (a) { return a.state === "saved" }).slice(0, 5)
    if (!home.length) return false
    var lines = standupLines(standupRecap(recent), home.length)
    standup = { started: performance.now(), t: 0, said: -1, speakers: home.map(function (a, i) {
      return { id: a.id, trait: a.trait, agi: !!a.agi, lines: lines[i] }
    }) }
    return true
  }

  function stepStandup() {
    standup.t = Math.floor((performance.now() - standup.started) / STANDUP_MS)
    if (standup.t >= standupLength(standup.speakers.length, world.res)) { endStandup(); return }
    var talking = standupSpeaker(standup.t, world.res)
    if (talking >= 0 && talking !== standup.said) {
      standup.said = talking
      if (window.AgentSfx && AgentSfx.cue) AgentSfx.cue("murmur")
    }
    drawStandup(actorCtx, world, palette, standup)
  }

  function endStandup() {
    standup = null
    advance(1); applyUpdate()
  }

  // -------------------------------------------------------------------------
  // Painting
  // -------------------------------------------------------------------------

  function paintTerrain() {
    if (!world) return
    if (window.AgentSeason) window.AgentSeason.dress(world)
    drawTerrain(terrainCtx, world, palette)
  }
  function paintActors() {
    if (!world) return
    if (world.done || world.replaying) hideLevelTitle()
    if (window.AgentSeason) window.AgentSeason.dress(world)
    drawActors(actorCtx, world, palette, { labels: showLabels, intro: false, feed: isFullscreen(), heldReport: reportHeld() })
    if (window.AgentSeason) window.AgentSeason.paint(actorCtx, world)
  }

  // One cached image per level/theme. CSS fades only this transparent layer;
  // the hatch, first drop and input keep running underneath. Wall-clock time
  // makes the duration independent of game speed (and of pausing the game).
  var titleTimer = 0, titleLayout = null
  function hideLevelTitle() {
    clearTimeout(titleTimer)
    titleTimer = 0
    titleLayout = null
    var c = document.getElementById("levelTitle")
    if (c) c.hidden = true
  }

  function paintLevelTitle() {
    var c = document.getElementById("levelTitle")
    if (!c || c.hidden || !world) return
    var ctx = c.getContext("2d")
    clearLayer(ctx, world)
    drawLevelTitleCard(ctx, world, palette, (level - 1) % BIOMES.length, titleLayout)
  }

  function showLevelTitle() {
    hideLevelTitle()
    var c = document.getElementById("levelTitle")
    if (!c || world.done || world.replaying || replay || standup) return
    titleLayout = levelTitleLayout(world)
    c.width = WIDTH * RES; c.height = HEIGHT * RES
    // Commit the hidden state so even rapid navigation restarts the fade.
    // This also works with the reduced-motion CSS exception.
    void c.offsetWidth
    c.hidden = false
    paintLevelTitle()
    titleTimer = setTimeout(hideLevelTitle, world.reducedMotion ? 600 : 1200)
  }

  // -------------------------------------------------------------------------
  // Chrome
  // -------------------------------------------------------------------------

  function buildToolbar() {
    el.toolbar.innerHTML = ""
    el.skillNodes = {}
    SKILL_ORDER.forEach(function (name) {
      var cell = document.createElement("div")
      cell.className = "skill"
      var label = document.createElement("span")
      label.className = "skill-name"
      label.textContent = SKILL_LABELS[name]
      var count = document.createElement("span")
      count.className = "skill-count"
      count.textContent = "0"
      var stock = document.createElement("span")
      stock.className = "skill-stock"
      var icon = document.createElement("canvas")
      icon.className = "skill-icon"
      icon.width = icon.height = 16
      icon.setAttribute("aria-hidden", "true")
      drawSkillIcon(icon.getContext("2d"), name)
      stock.appendChild(icon)
      stock.appendChild(count)
      cell.appendChild(label)
      cell.appendChild(stock)
      el.toolbar.appendChild(cell)
      el.skillNodes[name] = { cell: cell, count: count }
    })
  }

  // The rescue counter is a community total that only ever goes up, and the
  // first rule of a live ticker is that it has to tick. The version before this
  // one showed two significant digits above ten thousand — "96k" — and the site
  // earns about nine hundred rescues a day, so the number on screen changed
  // once per thousand and sat still for a whole day at a time. It was reported
  // as the API being down, which is exactly right as a reading: a counter that
  // does not move is a counter that is broken, whatever the database says.
  //
  // So: the exact figure while it still reads as one, and compaction only when
  // it genuinely stops being legible. A million is where "8,049,912" turns into
  // something you have to count the commas of; below that, "96,670" is both
  // shorter to understand and honest about the fact that it is climbing.
  //
  // Fit is not the constraint and never was — measured at seven widths from
  // 1400px down, the long form wraps the controls row in exactly the same
  // places as the short one, because `.counts` is `margin-left: auto` at the
  // end of a flex row and its own width is not what decides where that row
  // breaks. That is why precision is affordable here.
  var COMPACT_FROM = 1e6
  var UNITS = [
    { at: 1e12, suffix: "t" },
    { at: 1e9,  suffix: "b" },
    { at: 1e6,  suffix: "m" }
  ]
  function compact(n) {
    if (!isFinite(n)) return "\u221e"
    if (n < 0) return "-" + compact(-n)
    if (n < COMPACT_FROM) return Math.floor(n).toLocaleString()
    for (var i = 0; i < UNITS.length; i++) {
      var unit = UNITS[i]
      if (n < unit.at) continue
      var scaled = n / unit.at
      // Two decimals, not one, and for the same reason as everything above:
      // at a million a day's rescues are a rounding error, so "8.0m" would go
      // back to standing still. "8.04m" moves every ten thousand.
      // Truncated rather than rounded — a counter that has not reached eight
      // million should not say it has.
      return (Math.floor(scaled * 100) / 100).toFixed(2) + unit.suffix
    }
    return String(Math.floor(n))
  }

  // Keep the board clear and give its commentary five real seconds, including
  // at Brisk/fast-forward. No timer, animation, live-region chatter or per-frame
  // DOM rewrite; pausing leaves the latest line available to read.
  var captionWorld = null, captionNote = null, captionUntil = 0, captionProfile = ""
  function reportHeld() {
    return !running && world && world.done && !world.replaying && !replay && !standup
  }

  // Fullscreen hides the caption (index.html) and gives the board its
  // in-board ticker back: a reserved caption row cost a 720p kiosk its 2x.
  function renderCaption() {
    if (!el.caption) return
    if (captionWorld !== world) {
      captionWorld = world; captionNote = null; captionUntil = 0
      captionProfile = skyCardCaption(world)
    }
    var note = feedNotice(world), now = performance.now()
    if (note && note !== captionNote) { captionNote = note; captionUntil = now + 5000 }
    var held = reportHeld()
    var available = !world.done && !world.replaying && !replay && !standup
    var event = available && captionNote && (!running || now < captionUntil)
    var profile = el.stage.dataset.boardScale === "1" ? captionProfile : ""
    var text = held ? "Report held · Space or tap to resume" : available ? (event ? captionNote.text : profile) : ""
    if (el.captionText.textContent !== text) {
      el.captionText.textContent = text
      el.caption.classList.toggle("empty", !text)
      el.caption.setAttribute("aria-hidden", text ? "false" : "true")
    }
  }

  function syncSfxScene() {
    if (window.AgentSfx && AgentSfx.scene) AgentSfx.scene(world, running && !document.hidden && !standup && !replay && !world.done)
  }

  function render() {
    if (!world) return
    syncSfxScene()
    renderCaption()
    // The bar is the whole colony. There is no second, smaller number to
    // reach: the run goes on to the next level either way, so a goal of two
    // thirds only ever told you which of the fifteen you were allowed to stop
    // caring about.
    var total = world.toRelease

    el.level.textContent = "Level " + world.level
    el.biome.textContent = world.biome
    // Only a presentation hook: alternating names replay the CSS pop for each
    // arrival, without a timer or any change to the simulation's clock.
    if (world.saved > (parseInt(el.home.textContent, 10) || 0))
      el.home.className = world.saved % 2 ? "arrived-a" : "arrived-b"
    else if (world.saved === 0) el.home.className = ""
    el.home.textContent = world.saved + "/" + total
    el.bar.style.width = (total > 0 ? Math.min(1, world.saved / total) * 100 : 0) + "%"

    var left = Math.max(0, Math.ceil((world.timeLimit - world.ticks) / 30))
    if (world.nuking) {
      el.clock.textContent = "NUKE"
      el.clock.className = "clock urgent"
    } else if (left <= 30 && !world.done) {
      el.clock.textContent = left + "s"
      el.clock.className = "clock urgent"
    } else {
      el.clock.textContent = ""
      el.clock.className = "clock"
    }

    // The result is the canvas's own report card now (drawLevelResults). This
    // overlay used to print the same count and a line of prose on top of it,
    // and the two were unreadable through each other. Hold a finished report
    // without covering it; its resume hint uses the existing caption space.
    el.overlay.style.display = running || reportHeld() ? "none" : ""
    el.overlayTitle.textContent = "PAUSED"
    el.overlayLine.textContent = "Space or click to resume"

    // Same rule as the bar's toolbar: flash for two thirds of a second after
    // an agent takes one, so you can catch which skill just went out.
    SKILL_ORDER.forEach(function (name) {
      var node = el.skillNodes[name]
      var count = world.skills[name] || 0
      var used = world.lastUsed[name]
      var recent = used !== undefined && (world.ticks - used) < 20
      node.count.textContent = count
      node.count.dataset.pulse = count % 2 // replay the CSS blink on consecutive spends
      node.cell.classList.toggle("recent", recent)
      node.cell.classList.toggle("spent", count === 0 && !recent)
    })

    if (el.tour) Array.prototype.forEach.call(el.tour.children, function (b, i) {
      var here = (world.level - 1) % BIOMES.length === i
      b.classList.toggle("on", here)
      if (here) b.setAttribute("aria-current", "true"); else b.removeAttribute("aria-current")
    })
    el.speedWord.textContent = SPEED_NAMES[speedIndex]
    el.whoWord.textContent = showLabels ? "on" : "off"
    el.who.setAttribute("aria-pressed", showLabels ? "true" : "false")
    el.pauseWord.textContent = running ? "pause" : "resume"
    var lv = levelsCleared === 1 ? " level" : " levels"
    el.lifetime.textContent = compact(lifetimeSaved) + " home, " + levelsCleared + lv
    el.lifetime.title = lifetimeSaved.toLocaleString() + (lifetimeSaved === 1 ? " agent" : " agents") + " home over " + levelsCleared + lv
    el.global.textContent = globalSaved === null
      ? "worldwide: offline"
      : "worldwide: " + compact(globalSaved) + " saved"
    el.global.title = globalSaved === null
      ? "Saved by everyone playing worldwide"
      : globalSaved.toLocaleString() + " saved by everyone playing worldwide"
  }

  var timer = null
  function restartClock() {
    if (timer !== null) clearInterval(timer)
    timer = setInterval(function () { if (running) tick() }, SPEED_INTERVALS[speedIndex])
  }

  function cycleSpeed() { speedIndex = (speedIndex + 1) % SPEED_INTERVALS.length; restartClock(); saveState(); render() }
  function toggleLabels() { showLabels = !showLabels; paintActors(); saveState(); render() }
  // The agent drawn under a click, in art pixels: the sprite stands on its
  // cell's floor and is about two cells tall, so the target is the body, with
  // a little slack for a thumb.
  function agentUnder(ev) {
    var r = el.boardWrap.getBoundingClientRect(), k = world.k
    var ax = (ev.clientX - r.left) / r.width * k.COLS * k.CELL
    var ay = (ev.clientY - r.top) / r.height * k.ROWS * k.CELL
    var best = null, bestD = 9
    for (var i = 0; i < world.agents.length; i++) {
      var ag = world.agents[i]
      if (ag.gone || ag.state === "saved") continue
      var d = Math.max(Math.abs(ag.x * k.CELL - ax), Math.abs((ag.y + 1) * k.CELL - 7 - ay))
      if (d < bestD) { best = ag; bestD = d }
    }
    return best
  }

  // The live world, read-only, for tools and tests driving the page
  // (tools/phone.js, tools/fps.js, test/pep.test.js). Nothing on the page uses it.
  window.AgentWorld = function () { return world }

  // Sightings (Outcome's sightingsIn, Draw's strip on the report card): what
  // this viewer has seen, kept in this browser only. Storage that is missing,
  // full or blocked just means no strip — never an error.
  var SIGHTINGS_KEY = "oh-no-more-agents-sightings"
  function loadSightings() {
    try {
      var v = JSON.parse(localStorage.getItem(SIGHTINGS_KEY) || "[]")
      return Array.isArray(v) ? v.filter(function (id) { return typeof id === "string" }) : []
    } catch (e) { return null }
  }
  // For screen readers: the start of each level and its result, in a polite
  // live region — twice a level, never per frame. The board itself is a
  // picture with a name; everything that matters on it is said here.
  function levelAnnouncement(w) { return "Level " + w.level + ", " + w.biome + ". " + w.toRelease + " agents." }
  function reportAnnouncement(w) {
    return "Level " + w.level + " report: " + w.saved + " of " + w.toRelease + " home" + (w.lost ? ", " + w.lost + " lost." : ".")
      + spokenEmployee(w)
  }
  // The card's Employee of the Level, in sentence case for a screen reader.
  function spokenEmployee(w) {
    var line = typeof employeeLine === "function" && w.res >= 2 ? employeeLine(w) : ""
    if (!line) return ""
    return " " + line.toLowerCase().replace(/(^|\. )([a-z])/g, function (m, a, b) { return a + b.toUpperCase() })
      .replace(/\bagent (\d)/, "Agent $1")
      .replace(w.specialSpec ? w.specialSpec.name.toLowerCase() : "\u0000", w.specialSpec ? w.specialSpec.name : "")
  }
  function announce(text) { if (el.announce) el.announce.textContent = text }
  window.AgentAnnounce = { level: levelAnnouncement, report: reportAnnouncement }

  function noteSightings(w) {
    var seen = loadSightings()
    if (seen === null) return
    var fresh = sightingsIn(w).filter(function (id) { return seen.indexOf(id) < 0 })
    seen = seen.concat(fresh)
    try { localStorage.setItem(SIGHTINGS_KEY, JSON.stringify(seen)) } catch (e) { return }
    w.sightings = { seen: seen, fresh: fresh }
  }

  // Sweepstake tally (Draw's betLine): how many first-home calls this viewer
  // has got right, in this browser only, silent without storage.
  var BETS_KEY = "oh-no-more-agents-sweepstake"
  function noteBet(w) {
    if (w.bet === undefined) return
    try {
      var t = JSON.parse(localStorage.getItem(BETS_KEY) || "{}")
      t = { right: (t.right | 0) + (w.homeOrder && w.homeOrder[0] === w.bet ? 1 : 0), total: (t.total | 0) + 1 }
      localStorage.setItem(BETS_KEY, JSON.stringify(t))
      w.betTally = t
    } catch (e) { /* no tally, still the line */ }
  }

  // "Copy link": this level with this colony (share.js). The toast says
  // whether the clipboard took it; a browser that refuses gets the old
  // select-and-copy, and failing that the toast admits it.
  function copyShareLink() {
    if (!world || !window.AgentShare) return
    var link = world.daily ? AgentShare.dailyUrl(window.location.href, world.daily)
      : AgentShare.url(window.location.href, world.level, world.colonySeed)
    if (!link) return
    var done = function () { toast("LINK COPIED") }
    var fallback = function () { toast(copyByHand(link) ? "LINK COPIED" : "COPY FAILED") }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).then(done, fallback)
    else fallback()
  }
  // Colony of the day (share.js): today's UTC date picks the level and the
  // colony, the same for everyone. Like a shared link it is a move, not a clear.
  function playDaily() {
    if (!window.AgentShare) return
    var d = AgentShare.daily(AgentShare.today())
    if (!d) return
    newLevel(d.level, d.seed)
    world.daily = d.daily
    saveState()
    render()
    toast("TODAY'S STANDUP IS MANDATORY.")
  }

  function copyByHand(text) {
    var ta = document.createElement("textarea")
    ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0"
    document.body.appendChild(ta); ta.select()
    var ok = false
    try { ok = document.execCommand("copy") } catch (e) { ok = false }
    document.body.removeChild(ta)
    return ok
  }
  var toastTimer = 0
  function toast(text) {
    var t = document.getElementById("toast")
    if (!t) return
    t.textContent = text
    t.classList.add("on")
    clearTimeout(toastTimer)
    toastTimer = setTimeout(function () { t.classList.remove("on") }, 1600)
  }

  function togglePause() {
    running = !running
    // A held report also lifts an in-progress closing wipe. Repaint on resume
    // at exactly the same tick; no clock or simulation state is rewound.
    if (world && world.done && !replay && !standup) paintActors()
    render()
  }

  function setTheme(name) {
    if (!THEMES[name]) return
    themeName = name
    rebuildPalette()
    paintTerrain()
    paintActors()
    saveState()
    paintTour()
    repaintLogo()
    paintLevelTitle()
    Array.prototype.forEach.call(el.themes.children, function (b) {
      b.classList.toggle("on", b.dataset.theme === name)
      b.setAttribute("aria-pressed", b.dataset.theme === name ? "true" : "false")
    })
  }

  // A cached masthead; four tiny umbrella poses, one second apart. The
  // animation owns no game state and sleeps offscreen/hidden/fullscreen.
  var logoState = null
  function setupLogo() {
    var canvas = document.getElementById("pageLogo")
    if (!canvas || !canvas.getContext("2d")) return
    logoState = { canvas: canvas, base: document.createElement("canvas"), phase: 0,
      factor: 1, timer: null, visible: !!window.IntersectionObserver,
      motion: window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : { matches: true } }
    canvas.hidden = false
    document.getElementById("pageTitle").classList.add("logo-ready")
    repaintLogo()
    if (logoState.motion.addEventListener) logoState.motion.addEventListener("change", function () {
      logoState.phase = 0; paintLogoFrame(); syncLogoMotion()
    })
    if (window.ResizeObserver) new ResizeObserver(repaintLogo).observe(canvas)
    if (window.IntersectionObserver) new IntersectionObserver(function (entries) {
      logoState.visible = entries[0].isIntersecting; syncLogoMotion()
    }).observe(canvas)
    window.addEventListener("resize", repaintLogo)
    document.addEventListener("visibilitychange", syncLogoMotion)
  }
  function repaintLogo() {
    if (!logoState) return
    var s=logoState, width=s.canvas.getBoundingClientRect().width
    s.factor=Math.max(1,Math.ceil(width/PAGE_LOGO_WIDTH*(window.devicePixelRatio||1)))
    s.canvas.width=s.base.width=PAGE_LOGO_WIDTH*s.factor
    s.canvas.height=s.base.height=PAGE_LOGO_HEIGHT*s.factor
    var ctx=s.base.getContext("2d");ctx.setTransform(s.factor,0,0,s.factor,0,0)
    drawPageLogoBase(ctx,THEMES[themeName])
    s.phase=0;paintLogoFrame();syncLogoMotion()
  }
  function paintLogoFrame() {
    var s=logoState,ctx=s.canvas.getContext("2d")
    ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,s.canvas.width,s.canvas.height)
    ctx.drawImage(s.base,0,0)
    ctx.setTransform(s.factor,0,0,s.factor,0,0)
    drawLogoUmbrella(ctx,THEMES[themeName],s.phase)
  }
  function logoCanSway() {
    return logoState.visible && !document.hidden && !logoState.motion.matches && !isFullscreen()
  }
  function syncLogoMotion() {
    if (!logoState) return
    clearTimeout(logoState.timer);logoState.timer=null
    if (!logoCanSway()) return
    logoState.timer=setTimeout(function () {
      if (!logoCanSway()) return
      logoState.phase=(logoState.phase+1)%4;paintLogoFrame();syncLogoMotion()
    },1000)
  }

  // Soundtrack
  // Playback starts only on user request; an ended track advances and wraps.

  var TRACKS = ["agents/soundtrack_1.mp3", "agents/soundtrack_2.mp3",
               "agents/soundtrack_3.mp3", "agents/soundtrack_4.mp3",
               "agents/soundtrack_5.mp3", "agents/soundtrack_6.mp3",
               "agents/soundtrack_7.mp3"]
  var trackIndex = 0

  function setTrack(i, keepPlaying) {
    // Read before assigning src, which immediately changes paused state.
    var wasPlaying = keepPlaying && (!el.player.paused || el.player.ended)
    trackIndex = i
    el.player.src = TRACKS[i]
    if (wasPlaying) playAudio()
    Array.prototype.forEach.call(el.tracks.children, function (b, n) {
      b.classList.toggle("on", n === i)
      b.setAttribute("aria-pressed", n === i ? "true" : "false")
    })
    renderAudio()
    saveState()
  }

  function playAudio() {
    var p = el.player.play()
    // A rejected autoplay request leaves the button showing play.
    if (p && p.catch) p.catch(function () { renderAudio() })
    if (p && p.then) p.then(renderAudio, function () {})
  }

  function advanceTrack() {
    setTrack((trackIndex + 1) % TRACKS.length, true)
  }

  function toggleAudio() {
    if (el.player.paused) playAudio()
    else { el.player.pause(); renderAudio() }
  }

  function toggleSfx() {
    if (!window.AgentSfx) return
    AgentSfx.setOn(!AgentSfx.isOn())
    renderSfx()
    saveState()
  }

  function renderSfx() {
    if (!el.sfx) return
    var sfxOn = !!(window.AgentSfx && AgentSfx.isOn())
    el.sfx.querySelector("span").textContent = sfxOn ? "on" : "off"
    el.sfx.setAttribute("aria-pressed", sfxOn ? "true" : "false")
  }

  function renderAudio() {
    var playing = !el.player.paused && !el.player.ended
    el.playpause.innerHTML = playing ? "&#10073;&#10073;" : "&#9654;"
    el.playpause.classList.toggle("on", playing)
    el.playpause.setAttribute("aria-pressed", playing ? "true" : "false")
  }

  function boot() {
    el.level = document.getElementById("level")
    el.daily = document.getElementById("daily")
    if (el.daily && window.AgentShare) {
      document.getElementById("dailyDate").textContent = AgentShare.today()
      el.daily.addEventListener("click", playDaily)
    }
    el.tour = document.getElementById("tour")
    el.announce = document.getElementById("announce")
    el.biome = document.getElementById("biome")
    el.home = document.getElementById("home")
    el.bar = document.getElementById("bar")
    el.clock = document.getElementById("clock")
    el.toolbar = document.getElementById("toolbar")
    el.caption = document.getElementById("eventCaption")
    el.captionText = document.getElementById("eventText")
    el.speed = document.getElementById("speed")
    el.who = document.getElementById("who")
    el.speedWord = document.getElementById("speedWord")
    el.whoWord = document.getElementById("whoWord")
    el.overlay = document.getElementById("overlay")
    el.overlayTitle = document.getElementById("overlay-title")
    el.overlayLine = document.getElementById("overlay-line")
    el.lifetime = document.getElementById("lifetime")
    el.global = document.getElementById("global")
    el.themes = document.getElementById("themes")
    el.pauseWord = document.getElementById("pauseWord")
    el.boardWrap = document.getElementById("board")
    el.stage = document.getElementById("stage")
    el.fullWord = document.getElementById("fullWord")
    el.player = document.getElementById("player")
    el.tracks = document.getElementById("tracks")
    el.playpause = document.getElementById("playpause")

    var terrain = document.getElementById("terrain")
    var actors = document.getElementById("actors")
    terrain.width = actors.width = WIDTH * RES
    terrain.height = actors.height = HEIGHT * RES
    terrainCtx = terrain.getContext("2d")
    actorCtx = actors.getContext("2d")

    loadState()
    loadPendingReports()
    loadPendingBatch()
    buildToolbar()
    buildTour()

    THEME_ORDER.forEach(function (name) {
      var b = document.createElement("button")
      b.textContent = name
      b.dataset.theme = name
      b.className = "theme" + (name === themeName ? " on" : "")
      b.setAttribute("aria-pressed", name === themeName ? "true" : "false")
      b.addEventListener("click", function () { setTheme(name) })
      el.themes.appendChild(b)
    })

    TRACKS.forEach(function (_, i) {
      var b = document.createElement("button")
      b.textContent = "\u266a " + (i + 1)
      b.className = "theme"
      b.title = "Soundtrack " + (i + 1)
      b.setAttribute("aria-label", "Soundtrack " + (i + 1))
      b.setAttribute("aria-pressed", "false")
      b.addEventListener("click", function () { setTrack(i, true) })
      el.tracks.appendChild(b)
    })
    setTrack(trackIndex, false)
    el.playpause.addEventListener("click", toggleAudio)
    el.sfx = document.getElementById("sfx")
    if (el.sfx) el.sfx.addEventListener("click", function () { toggleSfx(); el.sfx.blur() })
    renderSfx()
    ;["pointerdown", "keydown"].forEach(function (ev) {
      document.addEventListener(ev, function () { if (window.AgentSfx) AgentSfx.wake() })
    })
    // Follow media events so browser-initiated pauses update the button.
    ;["play", "pause", "ended"].forEach(function (ev) {
      el.player.addEventListener(ev, renderAudio)
    })
    el.player.addEventListener("ended", advanceTrack)

    // A shared run (share.js): that level, that colony, once. The address bar
    // is cleaned so a reload or the next level is an ordinary one.
    var shared = window.AgentShare ? AgentShare.parse(window.location.search) : null
    // Read before the address is cleaned below: a shared or daily link with
    // ?full lost its fullscreen (review 2026-10-15, finding 3). The cleaned
    // address keeps ?full, so a reload stays the kiosk it was.
    var wantFull = fullParam()
    if (shared) {
      newLevel(shared.level, shared.seed)
      if (shared.daily) { world.daily = shared.daily; render() }
      saveState()
      try { history.replaceState(null, "", window.location.pathname + (wantFull ? "?full" : "")) } catch (e) {}
    } else newLevel(level)

    // ?full — the visual half of fullscreen, without asking the browser for
    // the real thing. `faux` is the CSS fallback that already exists for iOS
    // and framed pages, where requestFullscreen is missing or refused; it
    // covers the viewport, paints the theme background and drops everything
    // outside #stage, which is the whole of what fullscreen looks like. What
    // it does not do is need a user gesture, which is exactly why it is the
    // one that can be turned on at load: the Fullscreen API refuses a request
    // that did not come from a click, so a URL parameter could never drive it.
    //
    // For a kiosk, a second monitor or a screenshot — anywhere the page is the
    // only thing on screen and nobody is going to press `f`.
    setupLogo()
    if (wantFull) setFaux(true)

    fitBoard()
    restartClock()
    loadGlobalStats()

    window.addEventListener("resize", fitBoard)
    // visualViewport catches toolbar and pinch-zoom changes missed by resize.
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", fitBoard)
      window.visualViewport.addEventListener("scroll", fitBoard)
    }
    window.addEventListener("orientationchange", fitBoard)
    document.addEventListener("fullscreenchange", afterFullscreen)
    document.addEventListener("webkitfullscreenchange", afterFullscreen)
    // A tap on an agent is a pep talk (Sim's pepTalk); anywhere else, or
    // while paused, it is pause as it always was.
    el.boardWrap.addEventListener("click", function (ev) {
      hideLevelTitle()
      if (standup) { endStandup(); return }
      if (replay) { endReplay(); return }
      var ag = running && world ? agentUnder(ev) : null
      if (!ag) { togglePause(); return }
      // The first tap of a level, before anybody is home, is the watcher's
      // pick in the sweepstake — a bet, not a pep talk, so it nudges nobody.
      if (world.bet === undefined && world.saved === 0 && !world.done && !ag.special) {
        world.bet = ag.id; world.betAt = world.ticks
        paintActors()
        return
      }
      if (pepTalk(world, ag)) (world.pepLog = world.pepLog || []).push({ t: world.ticks, id: ag.id })
      paintActors()
    })

    // Keyboard hints double as touch controls.
    var buttons = {
      "c-pause": togglePause,
      "c-prev": function () { advance(-1) },
      "c-next": function () { advance(1) },
      "c-restart": function () { newLevel(level) },
      "speed": cycleSpeed,
      "who": toggleLabels,
      "c-full": toggleFullscreen,
      "share": copyShareLink
    }
    Object.keys(buttons).forEach(function (id) {
      var b = document.getElementById(id)
      if (!b) return
      b.addEventListener("click", function (ev) {
        ev.preventDefault()
        buttons[id]()
        render()
        b.blur()   // or the button keeps focus and swallows the space bar
      })
    })

    document.addEventListener("keydown", function (e) {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      var k = e.key.toLowerCase()
      // Space and Enter on a focused button or link belong to it: a keyboard
      // user tabbing to "next level" pressed Space and got a pause instead.
      if ((k === " " || k === "enter") && e.target && /^(BUTTON|A|INPUT|SELECT|TEXTAREA|SUMMARY)$/.test(e.target.tagName)) return
      if (k === " " || e.code === "Space") { togglePause(); e.preventDefault() }
      else if (k === "arrowright" || k === "l" || k === "n") advance(1)
      else if (k === "arrowleft" || k === "h" || k === "p") advance(-1)
      else if (k === "r") newLevel(level)
      else if (k === "c") copyShareLink()
      else if (k === "s") cycleSpeed()
      else if (k === "w") toggleLabels()
      else if (k === "f") toggleFullscreen()
      else if (k === "m") toggleSfx()
      // Only faux fullscreen receives Escape here.
      else if (k === "escape" && el.stage.classList.contains("faux")) setFaux(false)
      else return
      render()
    })

    // Pause the clock while hidden; throttled timers would consume game time.
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) { if (timer !== null) { clearInterval(timer); timer = null } }
      else restartClock()
      syncSfxScene()
    })
    window.addEventListener("online", function () { loadGlobalStats(); flushGlobalSaves() })

    // The drain that does not depend on anything else happening.
    setInterval(flushGlobalSaves, REPORT_RETRY)

    // A paused or hidden game makes no requests of its own. Hidden tabs throttle
    // this to about a minute, which is far finer than it needs to be.
    setInterval(function () {
      if (!document.hidden && Date.now() - lastStatsAt > STATS_IDLE) loadGlobalStats()
    }, 60000)

    // Leaving mid-batch would otherwise strand those rescues until the player
    // comes back. keepalive outlives the page; the report stays queued and is
    // retried next visit, which the event id makes harmless.
    window.addEventListener("pagehide", function () {
      sealBatch()
      savePendingBatch()
      if (reporting || pendingReports.length === 0) return
      try {
        fetch("/api/saves", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(pendingReports[0]),
          keepalive: true
        }).catch(function () {})
      } catch (e) {}
    })
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot)
  else boot()
})()
