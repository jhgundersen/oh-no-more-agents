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
  var pendingReports = []
  var pendingBatch = null
  var flushedThisSession = false
  var reporting = false
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
    } catch (e) { /* first visit, or someone cleared it */ }
  }

  function saveState() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        version: 1, level: level, lifetimeSaved: lifetimeSaved,
        levelsCleared: levelsCleared, speedIndex: speedIndex,
        showLabels: showLabels, theme: themeName, track: trackIndex
      }))
    } catch (e) { /* private browsing; the sim doesn't care */ }
  }

  function loadPendingReports() {
    try {
      var reports = JSON.parse(localStorage.getItem(REPORT_STORE_KEY) || "[]")
      if (Array.isArray(reports)) pendingReports = reports.filter(function (r) {
        return r && typeof r.eventId === "string" && Number.isInteger(r.saved) && r.saved > 0
      }).slice(-50)
    } catch (e) { pendingReports = [] }
  }

  function savePendingReports() {
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

  function flushGlobalSaves() {
    if (reporting || pendingReports.length === 0) return
    reporting = true
    var report = pendingReports[0]
    fetch("/api/saves", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(report)
    }).then(function (response) {
      if (!response.ok) throw new Error("counter unavailable")
      return response.json()
    }).then(function (stats) {
      globalSaved = stats.totalSaved
      pendingReports.shift()
      savePendingReports()
      reporting = false
      render()
      flushGlobalSaves()
    }).catch(function () {
      reporting = false
      // The queue remains in localStorage. Retry on the next completed level,
      // on the next page load, or when the browser comes back online.
    })
  }

  function loadGlobalStats() {
    fetch("/api/stats").then(function (response) {
      if (!response.ok) throw new Error("counter unavailable")
      return response.json()
    }).then(function (stats) {
      globalSaved = stats.totalSaved
      render()
      flushGlobalSaves()
    }).catch(function () { render() })
  }

  function rebuildPalette() {
    var t = THEMES[themeName]
    palette = build({
      background: hex(t.background), foreground: hex(t.foreground),
      accent: hex(t.accent), urgent: hex(t.urgent), muted: hex(t.muted)
    }, level)

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
      if (boardFits(full)) return
    }
    applyScale(1)
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
    el.fullWord.textContent = isFullscreen() ? "on" : "off"
    fitBoard()
    render()
  }

  // -------------------------------------------------------------------------
  // Level lifecycle — Panel.qml's, step for step
  // -------------------------------------------------------------------------

  function newLevel(n) {
    level = Math.max(1, n)
    world = generate(level, 0)
    completionLine = ""
    lastTerrainVersion = 0
    rebuildPalette()
    paintTerrain()
    paintActors()
    render()
  }

  function advance(delta) { newLevel(level + delta); saveState() }

  function tick() {
    if (!world) return
    step(world)

    if (world.terrainVersion !== lastTerrainVersion) {
      lastTerrainVersion = world.terrainVersion
      paintTerrain()
    }
    paintActors()

    if (world.done && completionLine === "") {
      completionLine = outcomeLine(world)
      lifetimeSaved += world.saved
      if (world.saved > 0) levelsCleared += 1
      enqueueGlobalSaves(world.saved)
      saveState()
    }

    render()

    // Every generated colony gets one story. Success or failure, move on after
    // the result rather than replaying the same ground with a replacement cast.
    if (world.done && world.doneTicks > DONE_HOLD) advance(1)
  }

  // -------------------------------------------------------------------------
  // Painting
  // -------------------------------------------------------------------------

  function paintTerrain() { if (world) drawTerrain(terrainCtx, world, palette) }
  function paintActors() { if (world) drawActors(actorCtx, world, palette, { labels: showLabels }) }

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
      cell.appendChild(label)
      cell.appendChild(count)
      el.toolbar.appendChild(cell)
      el.skillNodes[name] = { cell: cell, count: count }
    })
  }

  function render() {
    if (!world) return
    // The bar is the whole colony. There is no second, smaller number to
    // reach: the run goes on to the next level either way, so a goal of two
    // thirds only ever told you which of the fifteen you were allowed to stop
    // caring about.
    var total = world.toRelease

    el.level.textContent = "Level " + world.level
    el.biome.textContent = world.biome
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

    var showingResult = completionLine !== ""
    el.overlay.style.display = (!running || showingResult) ? "" : "none"
    el.overlayTitle.textContent = showingResult
      ? (world.saved + " of " + world.toRelease + " home") : "PAUSED"
    el.overlayLine.textContent = showingResult ? completionLine : "Space or click to resume"

    // Same rule as the bar's toolbar: flash for two thirds of a second after
    // an agent takes one, so you can catch which skill just went out.
    SKILL_ORDER.forEach(function (name) {
      var node = el.skillNodes[name]
      var count = world.skills[name] || 0
      var used = world.lastUsed[name]
      var recent = used !== undefined && (world.ticks - used) < 20
      node.count.textContent = count
      node.cell.classList.toggle("recent", recent)
      node.cell.classList.toggle("spent", count === 0 && !recent)
    })

    el.speedWord.textContent = SPEED_NAMES[speedIndex]
    el.whoWord.textContent = showLabels ? "on" : "off"
    el.pauseWord.textContent = running ? "pause" : "resume"
    el.lifetime.textContent = lifetimeSaved.toLocaleString() + " home, " + levelsCleared + " levels"
    el.global.textContent = globalSaved === null
      ? "worldwide: offline"
      : "worldwide: " + globalSaved.toLocaleString() + " saved"
  }

  var timer = null
  function restartClock() {
    if (timer !== null) clearInterval(timer)
    timer = setInterval(function () { if (running) tick() }, SPEED_INTERVALS[speedIndex])
  }

  function cycleSpeed() { speedIndex = (speedIndex + 1) % SPEED_INTERVALS.length; restartClock(); saveState(); render() }
  function toggleLabels() { showLabels = !showLabels; paintActors(); saveState(); render() }
  function togglePause() {
    running = !running
    render()
  }

  function setTheme(name) {
    if (!THEMES[name]) return
    themeName = name
    rebuildPalette()
    paintTerrain()
    paintActors()
    saveState()
    Array.prototype.forEach.call(el.themes.children, function (b) {
      b.classList.toggle("on", b.dataset.theme === name)
    })
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

  function renderAudio() {
    var playing = !el.player.paused && !el.player.ended
    el.playpause.innerHTML = playing ? "&#10073;&#10073;" : "&#9654;"
    el.playpause.classList.toggle("on", playing)
  }

  function boot() {
    el.level = document.getElementById("level")
    el.biome = document.getElementById("biome")
    el.home = document.getElementById("home")
    el.bar = document.getElementById("bar")
    el.clock = document.getElementById("clock")
    el.toolbar = document.getElementById("toolbar")
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
    terrain.width = actors.width = WIDTH
    terrain.height = actors.height = HEIGHT
    terrainCtx = terrain.getContext("2d")
    actorCtx = actors.getContext("2d")

    loadState()
    loadPendingReports()
    loadPendingBatch()
    buildToolbar()

    THEME_ORDER.forEach(function (name) {
      var b = document.createElement("button")
      b.textContent = name
      b.dataset.theme = name
      b.className = "theme" + (name === themeName ? " on" : "")
      b.addEventListener("click", function () { setTheme(name) })
      el.themes.appendChild(b)
    })

    TRACKS.forEach(function (_, i) {
      var b = document.createElement("button")
      b.textContent = "\u266a " + (i + 1)
      b.className = "theme"
      b.title = "Soundtrack " + (i + 1)
      b.addEventListener("click", function () { setTrack(i, true) })
      el.tracks.appendChild(b)
    })
    setTrack(trackIndex, false)
    el.playpause.addEventListener("click", toggleAudio)
    // Follow media events so browser-initiated pauses update the button.
    ;["play", "pause", "ended"].forEach(function (ev) {
      el.player.addEventListener(ev, renderAudio)
    })
    el.player.addEventListener("ended", advanceTrack)

    newLevel(level)
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
    el.boardWrap.addEventListener("click", togglePause)

    // Keyboard hints double as touch controls.
    var buttons = {
      "c-pause": togglePause,
      "c-prev": function () { advance(-1) },
      "c-next": function () { advance(1) },
      "c-restart": function () { newLevel(level) },
      "speed": cycleSpeed,
      "who": toggleLabels,
      "c-full": toggleFullscreen
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
      if (k === " " || e.code === "Space") { togglePause(); e.preventDefault() }
      else if (k === "arrowright" || k === "l" || k === "n") advance(1)
      else if (k === "arrowleft" || k === "h" || k === "p") advance(-1)
      else if (k === "r") newLevel(level)
      else if (k === "s") cycleSpeed()
      else if (k === "w") toggleLabels()
      else if (k === "f") toggleFullscreen()
      // Only faux fullscreen receives Escape here.
      else if (k === "escape" && el.stage.classList.contains("faux")) setFaux(false)
      else return
      render()
    })

    // Pause the clock while hidden; throttled timers would consume game time.
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) { if (timer !== null) { clearInterval(timer); timer = null } }
      else restartClock()
    })
    window.addEventListener("online", function () { loadGlobalStats(); flushGlobalSaves() })

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
