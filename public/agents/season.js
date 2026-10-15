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
    var c = w.k.CELL, unit = (w.res || 1) >= 2 ? 0.5 : 1
    ctx.save()
    for (var i = 0; i < w.seasonLanterns.length; i++) {
      var p = w.seasonLanterns[i], lx = p.x * c - 2, ly = (p.y + 1) * c - 6
      if (!lanternAir(w, p) || seasonBlocked(w, lx - 2, ly - 2, 11, 9)) continue
      drawLantern(ctx, lx, ly, w.reducedMotion ? 0 : (w.ticks + i * 7) % 40 < 3, w.res)
    }
    for (var g = w.seasonGhosts.length - 1; g >= 0; g--) {
      var gh = w.seasonGhosts[g], age = w.ticks - gh.t
      if (age < 0 || age > GHOST_TICKS) { w.seasonGhosts.splice(g, 1); continue }
      var gx = Math.round((gh.x * c - 3) / unit) * unit
      var gy = Math.round(((gh.y + 1) * c - 11 - (w.reducedMotion ? 0 : age / 3)) / unit) * unit
      if (!seasonBlocked(w, gx, gy, 7, 9)) drawGhost(ctx, gx, gy, 1 - age / GHOST_TICKS, w.res)
    }
    ctx.restore()
  }

  function drawLantern(ctx, x, y, flicker, res) {
    ctx.save()
    ctx.globalAlpha = 0.12; ctx.fillStyle = "#ffb94e"; ctx.fillRect(x - 2, y + 5, 11, 1)
    ctx.globalAlpha = 1
    ctx.fillStyle = "#3f6b2a"; ctx.fillRect(x + 3, y - 2, 1, 2); ctx.fillRect(x + 4, y - 2, 1, 1)
    ctx.fillStyle = "#b8520f"; ctx.fillRect(x + 1, y, 5, 6); ctx.fillRect(x, y + 1, 7, 4)
    ctx.fillStyle = "#ed861f"; ctx.fillRect(x + 1, y + 1, 5, 4)
    ctx.fillStyle = "#ffac3d"; ctx.fillRect(x + 1, y + 1, 1, 3); ctx.fillRect(x + 3, y, 1, 2)
    ctx.fillStyle = "#56291b"; ctx.fillRect(x + 1, y + 2, 2, 1); ctx.fillRect(x + 4, y + 2, 2, 1)
    ctx.fillRect(x + 1, y + 3, 1, 1); ctx.fillRect(x + 5, y + 3, 1, 1); ctx.fillRect(x + 2, y + 4, 3, 1)
    ctx.fillStyle = flicker ? "#fff3b0" : "#ffd23f"
    ctx.fillRect(x + 2, y + 2, 1, 1); ctx.fillRect(x + 4, y + 2, 1, 1); ctx.fillRect(x + 3, y + 4, 1, 1)
    if ((res || 1) >= 2) { ctx.fillStyle = "#ffc564"; ctx.fillRect(x + 1.5, y + 0.5, 1.5, 0.5) }
    ctx.restore()
  }

  function drawGhost(ctx, x, y, alpha, res) {
    ctx.save(); ctx.globalAlpha = Math.max(0, alpha) * 0.78
    ctx.fillStyle = "#a4afca"; ctx.fillRect(x + 2, y, 3, 1); ctx.fillRect(x + 1, y + 1, 5, 1)
    ctx.fillRect(x, y + 2, 7, 5); ctx.fillRect(x, y + 7, 2, 1); ctx.fillRect(x + 3, y + 7, 1, 2); ctx.fillRect(x + 5, y + 7, 2, 1)
    ctx.fillStyle = "#eef2ff"; ctx.fillRect(x + 2, y + 1, 3, 1); ctx.fillRect(x + 1, y + 2, 5, 4)
    ctx.fillRect(x + 1, y + 6, 1, 1); ctx.fillRect(x + 3, y + 6, 1, 2); ctx.fillRect(x + 5, y + 6, 1, 1)
    ctx.fillStyle = "#1a1b26"; ctx.fillRect(x + 2, y + 3, 1, 2); ctx.fillRect(x + 4, y + 3, 1, 2); ctx.fillRect(x + 3, y + 5, 1, 1)
    if ((res || 1) >= 2) { ctx.fillStyle = "#ffffff"; ctx.fillRect(x + 1.5, y + 2, 1, 0.5) }
    ctx.restore()
  }

  function lanternAir(w, p) {
    if (cell(w, p.x, p.y + 1) === w.k.EMPTY) return false
    for (var y = p.y - 1; y <= p.y; y++) for (var x = p.x - 1; x <= p.x + 1; x++)
      if (cell(w, x, y) !== w.k.EMPTY) return false
    return true
  }
  function overlap(x, y, width, height, b) {
    return x < b.x + b.width && x + width > b.x && y < b.y + b.height && y + height > b.y
  }
  function seasonActorBox(w, ag) {
    var c = w.k.CELL, halo = ag.floater ? 10 : 5, high = ag.floater ? 29 : 18
    return { x: ag.x * c - halo, y: (ag.y + 1) * c - high, width: halo * 2, height: high }
  }
  function seasonBlocked(w, x, y, width, height) {
    var c = w.k.CELL, e = w.exit
    if (e && overlap(x, y, width, height, { x: e.x * c - 4, y: e.y * c - 8, width: (e.w + 2) * c, height: (e.h + 2) * c })) return true
    if (seasonDanger(w, x, y, width, height)) return true
    for (var i = 0; i < w.agents.length; i++) {
      var a = w.agents[i]
      if (!a.gone && a.state !== "dead" && a.state !== "saved" && overlap(x, y, width, height, seasonActorBox(w, a))) return true
    }
    return false
  }
  function seasonDanger(w, x, y, width, height) {
    var c = w.k.CELL, hazards = w.hazards || []
    for (var i = 0; i < hazards.length; i++) {
      var h = hazards[i]
      if (!h.wrecked && overlap(x, y, width, height, { x: h.zx0 * c - 3, y: h.zy0 * c - 3, width: (h.zx1 - h.zx0 + 1) * c + 6, height: (h.zy1 - h.zy0 + 1) * c + 6 })) return true
    }
    return false
  }

  window.AgentSeason = { name: name, pick: pick, tint: tint, dress: dress, paint: paint, SEASONS: SEASONS }
})()
