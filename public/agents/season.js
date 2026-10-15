// Seasons: cosmetic dressing over the ordinary board, chosen by the viewer's
// own calendar or previewed with ?season=<name> (?season=none forces it off).
// Nothing here touches the simulation. It hangs display fields on the world as
// w.season, which Draw.js reads (a report title, a bat umbrella colour, a
// ticker line), tints the palette, and paints its props on the actors canvas
// after drawActors. Web-only, like sfx.js. To add a season, add an entry to
// SEASONS; to retire one, delete it.
(function () {
  var SEASONS = {
    halloween: {
      from: [10, 24], to: [11, 1],              // [month, day], both inclusive
      accent: "#ff8a1e",
      homePrefix: "TRICK OR TREAT: ",
      bat: "#2a2233", batEvery: 3,              // one floater umbrella in three
      lanterns: 5,
      puns: ["WAS GHOSTED", "IS NOW A BACKGROUND PROCESS", "404: BODY NOT FOUND", "WENT TO THE GREAT /DEV/NULL"]
    }
  }
  var GHOST_TICKS = 30

  // The season in force: a valid ?season= wins, anything else in it is ignored.
  function pick(search, date) {
    var m = /[?&]season=([^&]*)/.exec(search || "")
    if (m && m[1] === "none") return null
    if (m && Object.prototype.hasOwnProperty.call(SEASONS, m[1])) return m[1]
    var md = (date.getMonth() + 1) * 100 + date.getDate()
    for (var name in SEASONS) {
      var s = SEASONS[name], a = s.from[0] * 100 + s.from[1], b = s.to[0] * 100 + s.to[1]
      if (a <= b ? md >= a && md <= b : md >= a || md <= b) return name
    }
    return null
  }

  var name = null
  try { name = pick(window.location.search, new Date()) } catch (e) { name = null }

  function tint(pal) {
    if (!name || !pal) return pal
    pal.decorLit = SEASONS[name].accent
    return pal
  }

  function dress(w) {
    if (!name || !w || w.season) return
    var s = SEASONS[name]
    w.season = { name: name, homePrefix: s.homePrefix, bat: s.bat, batEvery: s.batEvery, note: null }
    w.seasonSeen = {}
    w.seasonGhosts = []
    w.seasonLanterns = lanternSpots(w, s.lanterns)
  }

  // Air cells standing on floor, spread across the board; fixed per level.
  function lanternSpots(w, n) {
    var k = w.k, out = [], hash = (w.level * 2654435761) >>> 0
    for (var i = 0; i < n; i++) {
      var x = Math.floor((i + 0.5) * k.COLS / n) + (((hash >>> (i * 3)) & 7) - 3)
      for (var y = k.SKY + 2; y < k.ROWS - 1; y++) {
        if (x < 1 || x >= k.COLS - 1) break
        if (cell(w, x, y) === k.EMPTY && cell(w, x, y - 1) === k.EMPTY && cell(w, x, y + 1) !== k.EMPTY) { out.push({ x: x, y: y }); break }
      }
    }
    return out
  }

  function cell(w, x, y) { return w.terrain[y * w.k.COLS + x] }

  // New deaths become ghosts and a line on the ticker.
  function observe(w) {
    var s = SEASONS[name]
    for (var i = 0; i < w.agents.length; i++) {
      var ag = w.agents[i]
      if (ag.state !== "dead" || w.seasonSeen[ag.id]) continue
      w.seasonSeen[ag.id] = true
      w.seasonGhosts.push({ x: ag.x, y: ag.y, t: w.ticks })
      var tag = ag.special && w.specialSpec ? w.specialSpec.name.toUpperCase() : "AGENT " + ("00" + ag.id).slice(-3)
      w.season.note = { t: w.ticks, text: tag + " " + s.puns[(w.lost + w.level) % s.puns.length] }
    }
  }

  function paint(ctx, w) {
    if (!name || !w || !w.season) return
    observe(w)
    var c = w.k.CELL
    for (var i = 0; i < w.seasonLanterns.length; i++) {
      var p = w.seasonLanterns[i]
      if (cell(w, p.x, p.y) !== w.k.EMPTY || cell(w, p.x, p.y + 1) === w.k.EMPTY) continue
      drawLantern(ctx, p.x * c - 1, (p.y + 1) * c - 5, w.reducedMotion ? 0 : (w.ticks + i * 7) % 40 < 3)
    }
    for (var g = w.seasonGhosts.length - 1; g >= 0; g--) {
      var gh = w.seasonGhosts[g], age = w.ticks - gh.t
      if (age < 0 || age > GHOST_TICKS) { w.seasonGhosts.splice(g, 1); continue }
      drawGhost(ctx, gh.x * c - 2, (gh.y + 1) * c - 9 - (w.reducedMotion ? 0 : age / 3), 1 - age / GHOST_TICKS)
    }
  }

  function drawLantern(ctx, x, y, flicker) {
    ctx.fillStyle = "#3f6b2a"; ctx.fillRect(x + 2, y - 1, 1, 1)          // stem
    ctx.fillStyle = "#e8741a"; ctx.fillRect(x, y, 5, 4)                  // the pumpkin
    ctx.fillStyle = "#b8520f"; ctx.fillRect(x + 2, y, 1, 4)              // a rib
    ctx.fillStyle = flicker ? "#fff3b0" : "#ffd23f"                      // the candle behind the face
    ctx.fillRect(x + 1, y + 1, 1, 1); ctx.fillRect(x + 3, y + 1, 1, 1)
    ctx.fillRect(x + 1, y + 3, 3, 1)
  }

  function drawGhost(ctx, x, y, alpha) {
    ctx.save()
    ctx.globalAlpha = Math.max(0, alpha) * 0.85
    ctx.fillStyle = "#eef2ff"
    ctx.fillRect(x + 1, y, 3, 1); ctx.fillRect(x, y + 1, 5, 4)
    ctx.fillRect(x, y + 5, 1, 1); ctx.fillRect(x + 2, y + 5, 1, 1); ctx.fillRect(x + 4, y + 5, 1, 1)
    ctx.fillStyle = "#1a1b26"
    ctx.fillRect(x + 1, y + 2, 1, 1); ctx.fillRect(x + 3, y + 2, 1, 1)
    ctx.restore()
  }

  window.AgentSeason = { name: name, pick: pick, tint: tint, dress: dress, paint: paint, SEASONS: SEASONS }
})()
