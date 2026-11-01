// Seasons: cosmetic dressing over the ordinary board, chosen by the viewer's
// own calendar or previewed with ?season=<name> (?season=none forces it off).
// Nothing here touches the simulation. It hangs display fields on the world as
// w.season, which Draw.js reads (a report title, an umbrella pattern, hats, a
// ticker line), tints the palette, and paints its props on the actors canvas
// after drawActors. Web-only, like sfx.js. To add a season, add an entry to
// SEASONS; to retire one, delete it. Every field is optional.
(function () {
  var SEASONS = {
    christmas: {
      from: [12, 1], to: [12, 26],              // [month, day], both inclusive
      accent: "#e0314b",
      homePrefix: "HO HO HOME: ", homeSuffix: "",
      candy: "#d42a3c", candyEvery: 3,          // one floater umbrella in three
      hats: "santa",
      snow: 40,
      gift: true,
      homePuns: ["IS HOME FOR THE HOLIDAYS", "MADE THE NICE LIST", "DELIVERED. NO CHIMNEY REQUIRED"],
      deathPuns: ["IS ON THE NAUGHTY LIST", "GOT COAL", "WAS RETURNED, NO RECEIPT"]
    }
  }

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
    w.season = { name: name, homePrefix: s.homePrefix, homeSuffix: s.homeSuffix,
      candy: s.candy, candyEvery: s.candyEvery, hats: s.hats, note: null }
    w.seasonSeen = {}
    w.seasonHome = w.saved
  }

  function cell(w, x, y) { return w.terrain[y * w.k.COLS + x] }

  function tagOf(w, ag) { return ag.special && w.specialSpec ? w.specialSpec.name.toUpperCase() : "AGENT " + ("00" + ag.id).slice(-3) }

  // New deaths get a line on the ticker; the first one home, and every fifth
  // after, gets a line too.
  function observe(w) {
    var s = SEASONS[name]
    for (var i = 0; i < w.agents.length; i++) {
      var ag = w.agents[i]
      if (ag.state !== "dead" || w.seasonSeen[ag.id]) continue
      w.seasonSeen[ag.id] = true
      if (s.deathPuns) w.season.note = { t: w.ticks, text: tagOf(w, ag) + " " + s.deathPuns[(w.lost + w.level) % s.deathPuns.length] }
    }
    if (s.homePuns && w.saved > w.seasonHome) {
      for (var n = w.seasonHome + 1; n <= w.saved; n++) {
        if (n !== 1 && n % 5 !== 0) continue
        var who = lastHome(w)
        if (who) w.season.note = { t: w.ticks, text: tagOf(w, who) + " " + s.homePuns[(n + w.level) % s.homePuns.length] }
      }
      w.seasonHome = w.saved
    }
  }

  function lastHome(w) {
    var id = w.homeOrder && w.homeOrder[w.homeOrder.length - 1]
    for (var i = 0; i < w.agents.length; i++) if (w.agents[i].id === id) return w.agents[i]
    return null
  }

  function paint(ctx, w) {
    if (!name || !w || !w.season) return
    observe(w)
    // Weather and wrapping sit out report plates and blackout overlays.
    if (w.done || (w.outage && w.ticks >= w.outage.at && w.ticks < w.outage.at + w.outage.len)) return
    var s = SEASONS[name]
    ctx.save()
    if (s.snow) drawSnow(ctx, w, s.snow)
    if (s.gift && w.exit) drawGift(ctx, w)
    ctx.restore()
  }

  // Flakes drifting down through the air, a pure function of the tick: each
  // has its own column, speed and sway, and wraps from the floor to the top.
  // Only drawn over open air, so it reads as weather, not as noise on the rock.
  function snowActors(w) {
    var out = []
    for (var i = 0; i < w.agents.length; i++) {
      var ag = w.agents[i]
      if (!ag.gone && ag.state !== "dead" && ag.state !== "saved") {
        var b = seasonActorBox(w, ag)
        b.x -= 3; b.y -= 8; b.width += 6; b.height += 8
        out.push(b)
      }
    }
    return out
  }
  function snowAir(w, x, y, size, actors) {
    var c = w.k.CELL
    if (y < w.k.SKY * c + 18 || y + size > w.k.ROWS * c - 12) return false
    for (var yy = Math.floor(y / c); yy <= Math.floor((y + size - 0.5) / c); yy++)
      for (var xx = Math.floor(x / c); xx <= Math.floor((x + size - 0.5) / c); xx++)
        if (cell(w, xx, yy) !== w.k.EMPTY) return false
    if (seasonDanger(w, x, y, size, size)) return false
    var e = w.exit
    if (e && overlap(x, y, size, size, { x: e.x * c - 7, y: e.y * c - 7, width: e.w * c + 14, height: e.h * c + 14 })) return false
    for (var i = 0; i < actors.length; i++) if (overlap(x, y, size, size, actors[i])) return false
    return true
  }
  // Forty pure, staggered flakes. Triangle-wave drift needs no per-flake
  // trigonometry; full footprint tests preserve faces, canopies and danger tells.
  function drawSnow(ctx, w, n) {
    var k = w.k, W = k.COLS * k.CELL, H = k.ROWS * k.CELL, t = w.reducedMotion ? 0 : w.ticks
    var actors = snowActors(w), unit = (w.res || 1) >= 2 ? 0.5 : 1
    ctx.save(); ctx.fillStyle = "#e4edf9"
    for (var i = 0; i < n; i++) {
      var h = (i * 2654435761) >>> 0, phase = (t + i * 13) % 96
      var sway = (phase < 48 ? phase : 96 - phase) / 24 - 1
      var x = Math.round((((h >>> 4) % W + sway + W) % W) / unit) * unit
      var y = Math.round((((h >>> 12) % H + t * (0.12 + (h & 15) / 80)) % H) / unit) * unit
      var big = i % 9 === 0, size = big ? 3 : 1
      if (!snowAir(w, x, y, size, actors)) continue
      ctx.globalAlpha = 0.3 + (h & 3) * 0.1
      if (big) { ctx.fillRect(x + 1, y, 1, 3); ctx.fillRect(x, y + 1, 3, 1) }
      else ctx.fillRect(x, y, 1, 1)
    }
    ctx.restore()
  }
  // Wrapping lives on the jambs and lintel. The portal, threshold and any
  // arriving face remain visible; a bow and folded ribbon sell the gift.
  function drawGift(ctx, w) {
    var c = w.k.CELL, e = w.exit, x = e.x * c, y = e.y * c, width = e.w * c, height = e.h * c
    var mid = Math.round(x + width / 2), actors = snowActors(w)
    var fill = function(colour, xx, yy, wd, ht) {
      for (var i = 0; i < actors.length; i++) if (overlap(xx, yy, wd, ht, actors[i])) return
      ctx.fillStyle = colour; ctx.fillRect(xx, yy, wd, ht)
    }
    ctx.save()
    fill("#1d3e37", x - 2, y - 2, width + 4, 4)
    fill("#2c6252", x - 2, y, 4, height - 2); fill("#2c6252", x + width - 2, y, 4, height - 2)
    for (var row = 2; row < height - 3; row += 4) {
      fill("#d6d7b1", x - 1, y + row, 1, 1); fill("#d6d7b1", x + width, y + row + 1, 1, 1)
    }
    fill("#7c2135", x - 2, y - 1, width + 4, 2)
    fill("#d42a3c", x - 2, y - 1, width + 4, 1)
    fill("#d42a3c", x, y, 1, height - 2); fill("#d42a3c", x + width - 1, y, 1, height - 2)
    fill("#f0767d", x, y + Math.floor(height / 2), 2, 1); fill("#f0767d", x + width - 2, y + Math.floor(height / 2), 2, 1)
    fill("#8c2639", mid - 6, y - 6, 5, 4); fill("#8c2639", mid + 1, y - 6, 5, 4)
    fill("#e84a60", mid - 5, y - 6, 3, 1); fill("#e84a60", mid + 2, y - 6, 3, 1)
    fill("#d42a3c", mid - 3, y - 3, 2, 3); fill("#d42a3c", mid + 1, y - 3, 2, 3)
    fill("#ffe49a", mid - 1, y - 5, 2, 3)
    ctx.restore()
  }

  function overlap(x, y, width, height, b) {
    return x < b.x + b.width && x + width > b.x && y < b.y + b.height && y + height > b.y
  }
  function seasonActorBox(w, ag) {
    var c = w.k.CELL, halo = ag.floater ? 10 : 5, high = ag.floater ? 29 : 18
    return { x: ag.x * c - halo, y: (ag.y + 1) * c - high, width: halo * 2, height: high }
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
