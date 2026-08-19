// The web version's driver: the browser's answer to Panel.qml.
//
// Everything below is web-only. Sim.js, Draw.js and Palette.js are shared
// verbatim with the Omarchy bar plugin and are not allowed to know which of the
// two is running them — so this file does exactly what Panel.qml does, in the
// same order, with the same numbers, and nothing more. If you find yourself
// wanting to change one of the three shared files to make the web version
// behave, that is the signal that the change belongs in this file instead.
//
// The one thing here the plugin has no equivalent of is the theme picker: the
// plugin takes its five colors from whatever Omarchy theme is live, and this
// page has to pick for itself. That turns out to be the most useful thing
// about the web version — it renders the board under any theme in a second,
// where checking the same thing in the bar means restarting the whole shell.

(function () {
  "use strict"

  // The five foundational colors Omarchy themes define, lifted from
  // /usr/share/omarchy/themes/<name>/colors.toml. `urgent` is not a key those
  // files carry — the shell falls back to its own default, or a theme's
  // generated shell.toml maps it onto the theme's red — so that is what these
  // use, and it is the one value that may sit a shade off the real bar.
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
  // Dark only, deliberately. Every material is mixed out of the theme
  // background, so on a light theme dirt, rock and steel all land within a few
  // percent of each other and the board loses the tiers that tell you how deep
  // you're looking. The bar plugin has the same weakness; there it at least
  // matches the desktop around it.

  // Panel.qml's numbers, not new ones.
  var SPEED_NAMES = ["Calm", "Steady", "Brisk"]
  var SPEED_INTERVALS = [45, 33, 22]
  var MAX_ATTEMPTS = 3
  var DONE_HOLD = 110      // ticks to sit on a finished level before moving on

  var COMPLETION_LINES = [
    "Everyone home. The earth will keep.",
    "All accounted for. Nobody had to be told twice.",
    "They worked it out. They usually do.",
    "Home, every one. The tunnels stay behind.",
    "A tidy job. Not a brick wasted.",
    "That one took some digging.",
    "The long way round, but they got there.",
    "Umbrellas up, and down they went.",
    "Somebody had to stand still so the rest could pass.",
    "No plan, no map, no fuss."
  ]
  var NUKED_LINES = [
    "Time. Everybody out, the hard way.",
    "The clock won that one.",
    "Out of time, and out of options.",
    "Some levels don't get solved.",
    "That's what the last skill is for."
  ]
  var RETRY_LINES = [
    "Not this time. Sending a fresh lot in.",
    "That didn't work. Again, with different agents.",
    "Some levels take two goes.",
    "Round two. Same ground, new colony.",
    "They'll have another crack at it."
  ]
  var PARTIAL_LINES = [
    "Most of them made it. That's how it goes.",
    "A few stayed behind in the rock.",
    "Not everyone finds the way out.",
    "Some tunnels only go one direction.",
    "The ones who made it made it."
  ]

  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------

  var world = null
  var level = 1
  var attempt = 0
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
  var reporting = false
  var palette = null

  var el = {}
  var terrainCtx = null
  var actorCtx = null

  // -------------------------------------------------------------------------
  // Persistence — localStorage standing in for the plugin's state.json, same
  // fields, so a level you left off on comes back.
  // -------------------------------------------------------------------------

  var STORE_KEY = "oh-no-more-agents"
  var REPORT_STORE_KEY = "oh-no-more-agents-pending-reports"

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

  function reportId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID()
    return "rescue_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 14)
  }

  function enqueueGlobalSaves(saved) {
    if (!Number.isInteger(saved) || saved < 1) return
    pendingReports.push({ eventId: reportId(), saved: Math.min(30, saved) })
    savePendingReports()
    flushGlobalSaves()
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

  // -------------------------------------------------------------------------
  // Palette and scaling
  // -------------------------------------------------------------------------

  function rebuildPalette() {
    var t = THEMES[themeName]
    palette = build({
      background: hex(t.background), foreground: hex(t.foreground),
      accent: hex(t.accent), urgent: hex(t.urgent), muted: hex(t.muted)
    }, level)

    // The page dresses itself in the same theme, so the board doesn't sit in a
    // frame that argues with it.
    var root = document.documentElement
    root.style.setProperty("--bg", t.background)
    root.style.setProperty("--fg", t.foreground)
    root.style.setProperty("--accent", t.accent)
    root.style.setProperty("--muted", t.muted)
    root.style.setProperty("--urgent", t.urgent)
  }

  // The board is 400x248 real pixels. Everything on it is pixel art, so it is
  // only ever scaled by a whole number — a fractional scale puts a sprite's
  // 1px eye across two screen pixels and turns the whole colony to mush. The
  // canvas backing store stays at 400x248 and CSS does the enlarging with
  // image-rendering: pixelated.
  // How tall the window is going to be, rather than how tall it is this second.
  //
  // iOS reports innerHeight as the *visible* height, which is short while
  // Safari's toolbars are on screen and grows the moment a scroll collapses
  // them. The board is scaled by a whole number, so that difference is a whole
  // step of scale: the page opened at half size, and the way to get the big one
  // was to scroll a bit and let it re-fit — which is not an instruction anybody
  // should have to be given.
  //
  // documentElement.clientHeight is the layout viewport, which on iOS is the
  // toolbar-collapsed height and does not move when the toolbars come and go.
  // Taking the larger of the two sizes the board for the window the reader is
  // about to have. In fullscreen there are no toolbars and innerHeight is the
  // screen, so that one is used as it stands.
  function viewportHeight(full) {
    if (full) return window.innerHeight
    var doc = document.documentElement
    return Math.max(window.innerHeight || 0, (doc && doc.clientHeight) || 0)
  }

  function applyScale(scale) {
    el.boardWrap.style.width = (WIDTH * scale) + "px"
    el.boardWrap.style.height = (HEIGHT * scale) + "px"
    // The readouts line up with the board rather than with the viewport.
    document.documentElement.style.setProperty("--board-w", (WIDTH * scale) + "px")
  }

  // Does everything that has to be on screen fit, at whatever size the board is
  // right now? On the page that is the whole page; in fullscreen it is the
  // stage, because there is nothing else.
  function boardFits(full) {
    if (full) return stageAroundBoard() + el.boardWrap.clientHeight <= viewportHeight(true)
    // On the page, what has to be on screen is the board and everything above
    // it: you cannot watch a board you have to scroll down to find. The
    // toolbar, the controls, the themes and the soundtrack sit below it and may
    // fall past the fold — which is what the old fixed 260 was really saying,
    // in a number that happened to be right on one screen and wrong on the
    // rest. Measured, it holds on every screen, including the ones where the
    // blurb wraps to five lines.
    var top = el.boardWrap.getBoundingClientRect().top + (window.scrollY || 0)
    return top + el.boardWrap.clientHeight <= viewportHeight(false)
  }

  // Try the sizes, biggest first, and keep the first one that fits.
  //
  // This used to subtract a fixed 260px for "the rest of the page" and take
  // whatever scale was left. That number is wrong on almost every screen —
  // measured, the page furniture is 593px on an iPad in landscape — and worse,
  // it cannot be right, because the chrome depends on the board: the controls
  // row is board-width, so a small board wraps it onto three lines, which eats
  // the room the board needed to be bigger. Asking "does this size fit" with
  // the board actually at that size is the only version of the question that
  // has an answer, and it costs three reflows on a resize.
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

  // -------------------------------------------------------------------------
  // Fullscreen
  //
  // #stage holds the game and nothing else, so handing that one element to the
  // browser hides everything around it: a fullscreen element's siblings are not
  // rendered at all, which is a stronger guarantee than any rule this file
  // could write, and it cannot fall out of step with the page.
  // -------------------------------------------------------------------------

  function fullscreenEl() {
    return document.fullscreenElement || document.webkitFullscreenElement || null
  }

  function isFullscreen() {
    return fullscreenEl() === el.stage || el.stage.classList.contains("faux")
  }

  // The fallback is not a nicety: iOS Safari has no Element.requestFullscreen
  // at all, and a request can be refused outright by policy or because the page
  // is in a frame. Rather than leave the one control that visibly does nothing,
  // the stage covers the viewport itself — same result, minus the operating
  // system, and Escape still gets out of it.
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

  // How much of the stage is not the board: the readouts, the caption, the
  // toolbar and the controls, plus the gaps between them and the padding.
  //
  // Measured child by child rather than taken off the stage's own height,
  // because in fullscreen the stage IS the screen — scrollHeight then reports
  // the screen's height, the subtraction comes out about 120px too big, and the
  // board fits itself into what is left. Which is how asking for fullscreen
  // ended up making the board smaller.
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

  function newLevel(n, tryNumber) {
    level = Math.max(1, n)
    attempt = tryNumber || 0
    world = generate(level, attempt)
    completionLine = ""
    lastTerrainVersion = 0
    rebuildPalette()
    paintTerrain()
    paintActors()
    render()
  }

  function advance(delta) { newLevel(level + delta, 0); saveState() }
  function retryLevel() { newLevel(level, attempt + 1) }

  function pick(pool) { return pool[Math.floor(Math.random() * pool.length)] }

  function tick() {
    if (!world) return
    step(world)

    if (world.terrainVersion !== lastTerrainVersion) {
      lastTerrainVersion = world.terrainVersion
      paintTerrain()
    }
    paintActors()

    if (world.done && completionLine === "") {
      var everyone = world.saved >= (world.target || world.toRelease)
      var willRetry = !everyone && attempt + 1 < MAX_ATTEMPTS
      completionLine = pick(everyone ? COMPLETION_LINES
                            : (world.nuking ? NUKED_LINES
                               : (willRetry ? RETRY_LINES : PARTIAL_LINES)))
      lifetimeSaved += world.saved
      if (world.saved > 0) levelsCleared += 1
      enqueueGlobalSaves(world.saved)
      saveState()
    }

    render()

    // A pause on the finished level long enough to read the result, then
    // either another go at it or the next one. The loop is the point.
    if (world.done && world.doneTicks > DONE_HOLD) {
      if (world.saved >= (world.target || world.toRelease) || attempt + 1 >= MAX_ATTEMPTS) advance(1)
      else retryLevel()
    }
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
    var target = world.target || world.toRelease

    el.level.textContent = "Level " + world.level
    el.biome.textContent = world.biome
    el.home.textContent = world.saved + "/" + target
    el.bar.style.width = (target > 0 ? Math.min(1, world.saved / target) * 100 : 0) + "%"

    el.attempt.textContent = attempt > 0 ? "try " + (attempt + 1) : ""
    el.attempt.style.display = attempt > 0 ? "" : "none"

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

    el.line.textContent = completionLine
    el.line.style.opacity = completionLine ? "1" : "0"

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
    el.overlay.style.display = running ? "none" : ""
    el.lifetime.textContent = lifetimeSaved.toLocaleString() + " home, " + levelsCleared + " levels"
    el.global.textContent = globalSaved === null
      ? "worldwide: offline"
      : "worldwide: " + globalSaved.toLocaleString() + " saved"
  }

  // -------------------------------------------------------------------------
  // Clock
  // -------------------------------------------------------------------------

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

  // -------------------------------------------------------------------------
  // Soundtrack
  //
  // One player, and it is silent until somebody presses play. Not because
  // browsers block autoplay — they do — but because a page that starts making
  // noise on its own is a page you close. Switching track while something is
  // already playing keeps playing; switching while it is silent stays silent.
  //
  // The player itself does not loop. A track that ends hands over to the next
  // one and wraps at the end of the list, so leaving this open gets you the
  // whole soundtrack rather than the same three minutes until you notice.
  // -------------------------------------------------------------------------

  var TRACKS = ["agents/soundtrack_1.mp3", "agents/soundtrack_2.mp3",
               "agents/soundtrack_3.mp3", "agents/soundtrack_4.mp3",
               "agents/soundtrack_5.mp3", "agents/soundtrack_6.mp3",
               "agents/soundtrack_7.mp3"]
  var trackIndex = 0

  function setTrack(i, keepPlaying) {
    // Read this before assigning src: changing the source makes the element
    // paused immediately. At the natural end of a track `ended` is true, which
    // still means audio is enabled and the wrapped playlist should continue.
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
    // Rejects when the browser has not seen a gesture it accepts. Nothing to
    // do about it and nothing to report — the button stays showing play.
    if (p && p.catch) p.catch(function () { renderAudio() })
    if (p && p.then) p.then(renderAudio, function () {})
  }

  // Straight through the list, wrapping. In order rather than shuffled: these
  // were written as a set, and a set has an order.
  function advanceTrack() {
    setTrack((trackIndex + 1) % TRACKS.length, true)
  }

  function toggleAudio() {
    if (el.player.paused) playAudio()
    else { el.player.pause(); renderAudio() }
  }

  // Play and pause glyphs rather than a fixed one, so the button says which of
  // the two it will do next.
  function renderAudio() {
    var playing = !el.player.paused && !el.player.ended
    el.playpause.innerHTML = playing ? "&#10073;&#10073;" : "&#9654;"
    el.playpause.classList.toggle("on", playing)
  }

  // -------------------------------------------------------------------------
  // Boot
  // -------------------------------------------------------------------------

  function boot() {
    el.level = document.getElementById("level")
    el.biome = document.getElementById("biome")
    el.home = document.getElementById("home")
    el.bar = document.getElementById("bar")
    el.attempt = document.getElementById("attempt")
    el.clock = document.getElementById("clock")
    el.line = document.getElementById("line")
    el.toolbar = document.getElementById("toolbar")
    el.speed = document.getElementById("speed")
    el.who = document.getElementById("who")
    el.speedWord = document.getElementById("speedWord")
    el.whoWord = document.getElementById("whoWord")
    el.overlay = document.getElementById("overlay")
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
    // The element is the source of truth for whether sound is coming out, so
    // the button follows it however it got there — including the track ending
    // or the browser stopping it.
    ;["play", "pause", "ended"].forEach(function (ev) {
      el.player.addEventListener(ev, renderAudio)
    })
    el.player.addEventListener("ended", advanceTrack)

    newLevel(level, 0)
    fitBoard()
    restartClock()
    loadGlobalStats()

    window.addEventListener("resize", fitBoard)
    // Rotating an iPad, pinch-zooming, or the toolbars sliding away are all
    // things that change the picture without necessarily firing a window
    // resize. The visual viewport reports all three.
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", fitBoard)
      window.visualViewport.addEventListener("scroll", fitBoard)
    }
    window.addEventListener("orientationchange", fitBoard)
    document.addEventListener("fullscreenchange", afterFullscreen)
    document.addEventListener("webkitfullscreenchange", afterFullscreen)
    el.boardWrap.addEventListener("click", togglePause)

    // Every hint is also a button. The keys still work; this is so the page can
    // be used with a thumb, which it could not be before — a row of text saying
    // which keys to press is no use at all on a touchscreen.
    var buttons = {
      "c-pause": togglePause,
      "c-prev": function () { advance(-1) },
      "c-next": function () { advance(1) },
      "c-restart": function () { newLevel(level, 0) },
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
      else if (k === "r") newLevel(level, 0)
      else if (k === "s") cycleSpeed()
      else if (k === "w") toggleLabels()
      else if (k === "f") toggleFullscreen()
      // Real fullscreen hands Escape to the browser, which never reaches here.
      // The fallback has to answer for itself.
      else if (k === "escape" && el.stage.classList.contains("faux")) setFaux(false)
      else return
      render()
    })

    // A tab in the background is a tab nobody is watching, and browsers
    // throttle its timers to roughly once a second anyway — which would make
    // the sim crawl rather than pause, and quietly eat a level's clock.
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) { if (timer !== null) { clearInterval(timer); timer = null } }
      else restartClock()
    })
    window.addEventListener("online", function () { loadGlobalStats(); flushGlobalSaves() })
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot)
  else boot()
})()
