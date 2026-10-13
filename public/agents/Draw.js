// Shared renderer: it reads world state but never mutates it or imports Sim.js.
// Terrain repaints on terrainVersion; actors repaint every tick.

var SPRITE_W = 8
var SPRITE_PX = 16

function materialFill(k, pal, m) {
  if (m === k.DIRT) return pal.dirt
  if (m === k.ROCK) return pal.rock
  if (m === k.ORE) return pal.ore
  return pal.steel
}

function materialEdge(k, pal, m) {
  if (m === k.DIRT) return pal.dirtEdge
  if (m === k.ROCK) return pal.rockEdge
  if (m === k.ORE) return pal.oreEdge
  return pal.steelEdge
}

function materialShade(k, pal, m) {
  if (m === k.DIRT) return pal.dirtShade
  if (m === k.ROCK) return pal.rockShade
  if (m === k.ORE) return pal.oreShade
  return pal.steelShade
}

// Avoid ctx.reset(): it is missing on older Safari and has left stale pixels on iOS.
//
// `w.res` is how many canvas pixels the host gives each art pixel. Everything
// in this file is drawn in art pixels — the board is COLS×CELL wide whatever
// the canvas is — and this transform, set at the top of every pass, is the
// only place the two meet. A host that sets nothing (the Omarchy panel) gets
// 1, which is the board as it always was. At 2 the same art comes out the
// same size on screen, and anything drawn at a half-pixel lands on a real one:
// that is the room finer detail is drawn into.
function clearLayer(ctx, w) {
  var res = w.res || 1
  if (typeof ctx.setTransform === "function") ctx.setTransform(res, 0, 0, res, 0, 0)
  ctx.globalAlpha = 1
  ctx.clearRect(0, 0, w.k.COLS * w.k.CELL, w.k.ROWS * w.k.CELL)
}

// Three stepped rings, with sparse ordered stipple on a half-pixel lattice.
// No canvas filters, random draws or world caches. The fixed 8x8 sampling costs
// about forty rectangles even for a blast; a larger light never costs more.
var LIGHT_BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]
function drawLightPool(ctx, w, colour, x, y, rx, ry, strength) {
  if ((w.res || 1) < 2 || strength <= 0) return
  ctx.save()
  ctx.fillStyle = colour
  x = Math.round(x * 2) / 2; y = Math.round(y * 2) / 2
  var sizes = [1, 0.72, 0.43], weights = [0.18, 0.25, 0.35]
  for (var ring = 0; ring < 3; ring++) {
    ctx.globalAlpha = strength * weights[ring]
    drawLightSteps(ctx, x, y, rx * sizes[ring], ry * sizes[ring])
  }
  ctx.globalAlpha = strength * 0.7
  drawLightDither(ctx, x, y, rx, ry)
  ctx.restore()
}

function drawLightSteps(ctx, x, y, rx, ry) {
  // Five horizontal courses make a hard octagonal silhouette, not a blur.
  var widths = [0.52, 0.84, 1, 0.84, 0.52]
  var top = Math.round((y - ry) * 2) / 2
  for (var row = 0; row < 5; row++) {
    var bottom = Math.round((y - ry + (row + 1) * ry * 0.4) * 2) / 2
    var half = Math.round(rx * widths[row] * 2) / 2
    ctx.fillRect(x - half, top, half * 2, bottom - top)
    top = bottom
  }
}

function drawLightDither(ctx, x, y, rx, ry) {
  for (var row = 0; row < 8; row++) for (var col = 0; col < 8; col++) {
    var dx = (col - 3.5) / 4, dy = (row - 3.5) / 4
    var dist = Math.max(Math.abs(dx), Math.abs(dy)) + Math.min(Math.abs(dx), Math.abs(dy)) * 0.4
    var threshold = dist < 0.43 ? 8 : dist < 0.72 ? 4 : 2
    if (dist > 1 || LIGHT_BAYER[(row % 4) * 4 + col % 4] >= threshold) continue
    ctx.fillRect(Math.round((x + dx * rx) * 2) / 2, Math.round((y + dy * ry) * 2) / 2, 0.5, 0.5)
  }
}

function lightDecorAlive(w, d) {
  var support = d.kind === "hang" ? d.y - 1 : d.y + 1
  return !!w.terrain[support * w.k.COLS + d.x] && mechanismAir(w, d.x * w.k.CELL, d.y * w.k.CELL)
}

function drawTerrainLight(ctx, w, pal) {
  if ((w.res || 1) < 2) return
  var C = w.k.CELL, e = w.exit
  drawLightPool(ctx, w, pal.exitGlow, (e.x + e.w / 2) * C, (e.y + e.h - 1) * C, 23, 15, 0.12)
  for (var i = 0; i < w.pits.length; i++) drawPoolLight(ctx, w, pal, w.pits[i], false)
  drawFixtureLight(ctx, w, pal)
}

function drawFixtureLight(ctx, w, pal) {
  var C = w.k.CELL
  for (var i = 0; i < w.decor.length; i++) {
    var d = w.decor[i]
    if (!lightDecorAlive(w, d)) continue
    if (w.biome === "Library" && (d.kind === "hang" || d.kind === "tuft")) {
      var y = d.kind === "hang" ? d.y * C + 9 : (d.y + 1) * C - 2
      drawLightPool(ctx, w, pal.oreEdge, d.x * C + 2, y + 4, 11, 10, 0.12)
    }
    if (w.biome === "Mail Room" && (d.kind === "tuft" || (d.kind === "spire" && d.seed % 3 === 0)))
      drawLightPool(ctx, w, pal.oreEdge, d.x * C + 4, (d.y + 1) * C - 8, 9, 7, 0.10)
  }
}

function drawPoolLight(ctx, w, pal, p, moving) {
  if (p.liquid !== "lava" && p.liquid !== "slag" && p.liquid !== "coolant") return
  var C = w.k.CELL, wide = (p.x1 - p.x0 + 1) * C
  var strength = moving ? 0.025 + 0.015 * Math.sin(w.ticks * 0.045 + p.seed) : 0.10
  drawLightPool(ctx, w, pal.poolLip, (p.x0 * C + wide / 2), p.surfaceY * C - 2, Math.min(30, wide / 2 + 9), 13, strength)
}

function drawAnimatedLight(ctx, w, pal) {
  if ((w.res || 1) < 2) return
  for (var p = 0; p < w.pits.length; p++) drawPoolLight(ctx, w, pal, w.pits[p], true)
  for (var h = 0; h < w.hazards.length; h++) drawHazardLight(ctx, w, pal, w.hazards[h])
  for (var b = 0; b < w.blasts.length; b++) drawBlastLight(ctx, w, pal, w.blasts[b])
  for (var i = 0; i < w.pads.length; i++) drawTransportLight(ctx, w, w.pads[i])
  drawMuzzleLight(ctx, w, pal)
}

function drawHazardLight(ctx, w, pal, h) {
  if (w.eventBoost > 0 && w.eventMult === 0) return
  if (h.kind === "brazier") {
    drawLightPool(ctx, w, pal.fireHot, (h.zx0 + h.zx1 + 1) * w.k.CELL / 2,
      h.zy0 * w.k.CELL + 5, 16, 13, 0.12 + 0.025 * Math.sin(w.ticks * 0.8 + h.zx0))
    return
  }
  if (h.phase !== "fire") return
  var C = w.k.CELL, x = (h.zx0 + h.zx1 + 1) * C / 2
  var y = (h.zy0 + h.zy1 + 1) * C / 2
  if (h.kind === "flame" || h.kind === "molten") {
    var pulse = 0.13 + 0.03 * Math.sin(w.ticks * 0.8 + h.zx0)
    drawLightPool(ctx, w, pal.fireHot, x, y, 18, 14, pulse)
  }
  if (h.kind === "gun" || h.kind === "turret" || h.kind === "sniper")
    drawLightPool(ctx, w, pal.fireHot, x, h.zy0 * C + 10, 11, 8, Math.max(0, 0.18 * (1 - h.t / 6)))
}

function drawBlastLight(ctx, w, pal, b) {
  var age = w.ticks - b.t
  if (age < 0 || age >= 13) return
  var C = w.k.CELL, radius = b.r * C
  drawLightPool(ctx, w, age < 2 ? BLAST_CORE : BLAST_MID, b.x * C, b.y * C,
    radius * 1.8 + 8, radius * 1.3 + 6, 0.32 * (1 - age / 13))
}

function drawTransportLight(ctx, w, p) {
  var age = w.ticks - p.usedAt
  if (p.tube || p.usedAt < 0 || age < 0 || age >= PAD_FX_TICKS) return
  var C = w.k.CELL, strength = 0.14 * (1 - age / PAD_FX_TICKS)
  drawLightPool(ctx, w, PAD_LIGHT, (p.ax + 0.5) * C, (p.ay + 1) * C - 8, 14, 17, strength)
  drawLightPool(ctx, w, PAD_LIGHT, (p.bx + 0.5) * C, (p.by + 1) * C - 8, 14, 17, strength)
}

function drawMuzzleLight(ctx, w, pal) {
  var C = w.k.CELL
  for (var i = 0; i < w.agents.length; i++) drawAgentMuzzleLight(ctx, w, pal, w.agents[i])
  for (var e = 0; e < w.enemies.length; e++) {
    var en = w.enemies[e]
    if (en.gone || !(en.shotFor > 5)) continue
    drawLightPool(ctx, w, pal.fireHot, en.x * C + en.dir * 7, (en.y + 1) * C - 8, 12, 9, 0.18)
  }
}

function drawAgentMuzzleLight(ctx, w, pal, ag) {
  if (ag.gone) return
  var m = w.mission
  var hunting = m && m.kind === "alien" && !m.done && ag.id === m.scoutId
  var shot = hunting ? m.shotFor : ag.shotFor
  if (!(shot > 0)) return
  var C = w.k.CELL
  drawLightPool(ctx, w, pal.fireHot, ag.x * C + (ag.dir || 1) * 10, (ag.y + 1) * C - 9, 10, 7, 0.16)
}

function drawTerrain(ctx, w, pal) {
  var k = w.k
  var C = k.CELL
  var cols = k.COLS
  var rows = k.ROWS

  clearLayer(ctx, w)

  var sky = ctx.createLinearGradient(0, 0, 0, k.SKY * C + C * 4)
  sky.addColorStop(0, pal.skyTop)
  sky.addColorStop(1, pal.skyLow)
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, cols * C, rows * C)

  drawTerrainSky(ctx, w, pal)

  drawBackdrop(ctx, w, pal)

  drawTerrainMaterials(ctx, w, pal)

  if (w.biome === "Library") drawLibraryStacks(ctx, w, pal)
  if (w.biome === "Mail Room") drawMailSlots(ctx, w, pal)
  if (w.biome === "Building Site") drawSiteMaterials(ctx, w, pal)
  if (w.biome === "Clock Tower") drawClockMaterials(ctx, w, pal)
  if ((w.res || 1) >= 2) drawTerrainFine(ctx, w, pal)

  drawFactoryPlates(ctx, w, pal)
  if ((w.res || 1) >= 2 && !BUILT[w.biome]) drawTerrainDepth(ctx, w)

  var wash = ctx.createLinearGradient(0, k.SKY * C, 0, rows * C)
  wash.addColorStop(0, pal.washTop)
  wash.addColorStop(1, pal.washLow)
  ctx.fillStyle = wash
  ctx.fillRect(0, k.SKY * C, cols * C, (rows - k.SKY) * C)

  drawTerrainLight(ctx, w, pal)
  drawDecor(ctx, w, pal)
  drawExitBack(ctx, w, pal)
  drawSea(ctx, w, pal)
}

function drawTerrainSky(ctx, w, pal) {
  var k = w.k, C = k.CELL, cols = k.COLS
  // Seed stars from the level to preserve deterministic rendering.
  if (w.biome === "Spaceship") {
    var seed3 = w.level * 2654435761 % 100000
    for (var st4 = 0; st4 < 70; st4++) {
      seed3 = (seed3 * 1103515245 + 12345) % 2147483648
      var stx = (seed3 >> 7) % (cols * C)
      var sty = (seed3 >> 3) % (k.SKY * C)
      ctx.fillStyle = st4 % 7 === 0 ? pal.decorLit : pal.dust
      ctx.globalAlpha = st4 % 3 === 0 ? 0.9 : 0.45
      ctx.fillRect(stx, sty, 1, 1)
    }
    ctx.globalAlpha = 1
  }

  // The city, seen from inside one of the buildings in it. Seeded from the
  // level like the Spaceship's stars, so the skyline belongs to the level and
  // is the same every time it is played.
  if (w.biome === "Skyscraper") {
    var horizon = k.SKY * C
    var seedC = (w.level * 2654435761) % 100000
    var nextC = function () { seedC = (seedC * 1103515245 + 12345) % 2147483648; return seedC >> 5 }
    for (var bl2 = 0; bl2 < 22; bl2++) {
      var bw3 = 7 + nextC() % 16
      var bx3 = (nextC() % (cols * C + 40)) - 20
      var bh3 = 6 + nextC() % (horizon - 4)
      ctx.fillStyle = bl2 % 3 === 0 ? pal.rockShade : pal.steelShade
      ctx.fillRect(bx3, horizon - bh3, bw3, bh3)
      // Lit windows, a minority of them. An office block at night is mostly
      // dark, and the few that are on are what make it read as occupied.
      for (var wy3 = horizon - bh3 + 2; wy3 < horizon - 2; wy3 += 4) {
        for (var wx3 = bx3 + 2; wx3 < bx3 + bw3 - 2; wx3 += 3) {
          var r3 = nextC() % 7
          if (r3 > 1) continue
          ctx.fillStyle = r3 === 0 ? pal.decorLit : pal.warn
          ctx.fillRect(wx3, wy3, 1, 2)
        }
      }
    }
  }
}

function drawTerrainMaterials(ctx, w, pal) {
  var k = w.k, C = k.CELL, cols = k.COLS, rows = k.ROWS
  // Batch horizontal material runs instead of drawing thousands of cells.
  for (var y = 0; y < rows; y++) {
    var x = 0
    var base = y * cols
    while (x < cols) {
      var m = w.terrain[base + x]
      if (m === k.EMPTY) { x++; continue }
      var start = x
      while (x < cols && w.terrain[base + x] === m) x++
      ctx.fillStyle = materialFill(k, pal, m)
      ctx.fillRect(start * C, y * C, (x - start) * C, C)
    }
  }

  for (var sy2 = 0; sy2 < rows; sy2++) {
    var sx2 = 0
    var sbase = sy2 * cols
    while (sx2 < cols) {
      var sm = w.terrain[sbase + sx2]
      if (sm === k.EMPTY || sy2 + 1 >= rows || w.terrain[sbase + cols + sx2] !== k.EMPTY) { sx2++; continue }
      var sstart = sx2
      while (sx2 < cols && w.terrain[sbase + sx2] === sm
             && sy2 + 1 < rows && w.terrain[sbase + cols + sx2] === k.EMPTY) sx2++
      ctx.fillStyle = materialShade(k, pal, sm)
      ctx.fillRect(sstart * C, sy2 * C + C - 2, (sx2 - sstart) * C, 2)
    }
  }

  for (var ey = 0; ey < rows; ey++) {
    var ex = 0
    var ebase = ey * cols
    while (ex < cols) {
      var em = w.terrain[ebase + ex]
      if (em === k.EMPTY || (ey > 0 && w.terrain[ebase - cols + ex] !== k.EMPTY)) { ex++; continue }
      var estart = ex
      while (ex < cols && w.terrain[ebase + ex] === em
             && (ey === 0 || w.terrain[ebase - cols + ex] === k.EMPTY)) ex++
      ctx.fillStyle = materialEdge(k, pal, em)
      ctx.fillRect(estart * C, ey * C, (ex - estart) * C, Math.max(1, C - 2))
    }
  }
}

function drawFactoryPlates(ctx, w, pal) {
  var k = w.k, C = k.CELL, cols = k.COLS, rows = k.ROWS
  // Factory only. ORE is this biome's machinery and mezzanine plate, so it
  // gets riveted and seamed. The room's character has to come from detail on
  // the structures that are already there — the first version tried to get it
  // from objects floating in front of them, and seventeen free cogs read as
  // noise while the surfaces underneath stayed blank.
  if (w.biome === "Factory") {
    for (var ry = k.SKY; ry < rows; ry++) {
      var rbase = ry * cols
      for (var rx = 1; rx < cols - 1; rx++) {
        if (w.terrain[rbase + rx] !== k.ORE) continue
        // Rivets on a two-cell checker: dense enough to read as a fixing
        // pattern, sparse enough not to become a texture of its own.
        if ((rx + ry) % 2 === 0) {
          ctx.fillStyle = pal.oreEdge
          ctx.fillRect(rx * C + 1, ry * C + 1, 1, 1)
        }
        // A plate seam every fourth column, so the decks read as bolted
        // sections rather than one extruded girder.
        if (rx % 4 === 0) {
          ctx.fillStyle = pal.oreShade
          ctx.fillRect(rx * C, ry * C, 1, C)
        }
      }
    }
  }
}

// The earth at half-pixel detail, for hosts that draw at res 2 (see
// clearLayer). Three things the 4-pixel cells cannot say: grain inside every
// material, so a wall is made of something; a bright hairline on the very top
// of each walkable edge and a dark one under the lip, so a floor reads as a
// surface you could stand on; and a shaded half-pixel down any exposed side.
// Grain is a hash of the cell, so it is the same every repaint and stays put
// while the colony digs around it.
// Built places get no grain: on hull plate, office wall and machine housing it
// read as dirt, and those biomes carry their own pattern (panels, bays, rivets).
var BUILT = { "Spaceship": true, "Factory": true, "Skyscraper": true, "Data Center": true, "Library": true, "Mail Room": true, "Building Site": true, "Clock Tower": true }

// One cell's grain: a dark fleck in a quarter of cells, a pale one in an
// eighth, placed inside the cell by the hash.
function drawGrain(ctx, k, pal, m, px, py, h) {
  if ((h & 3) === 0) {
    ctx.fillStyle = materialShade(k, pal, m)
    ctx.fillRect(px + ((h >> 2) & 3) * 0.5 + 0.5, py + ((h >> 4) & 3) * 0.5 + 1, 1, 0.5)
  } else if ((h & 7) === 1) {
    ctx.fillStyle = materialEdge(k, pal, m)
    ctx.globalAlpha = 0.45
    ctx.fillRect(px + ((h >> 3) & 3) * 0.5 + 1, py + ((h >> 5) & 3) * 0.5 + 0.5, 0.5, 0.5)
    ctx.globalAlpha = 1
  }
}

function drawTerrainFine(ctx, w, pal) {
  var k = w.k, C = k.CELL, cols = k.COLS, rows = k.ROWS, T = w.terrain
  var grain = !BUILT[w.biome]
  for (var y = 0; y < rows; y++) {
    for (var x = 0; x < cols; x++) {
      var m = T[y * cols + x]
      if (m === k.EMPTY) continue
      var px = x * C, py = y * C
      var h = ((x * 73856093) ^ (y * 19349663)) >>> 0
      var openAbove = y > 0 && T[(y - 1) * cols + x] === k.EMPTY
      if (grain && !openAbove) drawGrain(ctx, k, pal, m, px, py, h)
      if (openAbove) {
        ctx.fillStyle = pal.dust
        ctx.globalAlpha = 0.35
        ctx.fillRect(px, py, C, 0.5)
        ctx.globalAlpha = 1
        ctx.fillStyle = materialShade(k, pal, m)
        ctx.fillRect(px, py + C - 2, C, 0.5)
      }
      if (x > 0 && T[y * cols + x - 1] === k.EMPTY) {
        ctx.fillStyle = materialShade(k, pal, m)
        ctx.fillRect(px, py + (openAbove ? 0.5 : 0), 0.5, C)
      }
      if (x < cols - 1 && T[y * cols + x + 1] === k.EMPTY) {
        ctx.fillStyle = materialShade(k, pal, m)
        ctx.fillRect(px + C - 0.5, py + (openAbove ? 0.5 : 0), 0.5, C)
      }
    }
  }
}

// Depth in the earth, res 2 and above. Solid ground darkens in steps with its
// distance from open air, so the corridors the colony walks stand out and the
// mass between them recedes instead of reading as a flat patchwork. Steps,
// not a smooth falloff: posterised bands keep the retro look. The distance is
// Chebyshev (eight neighbours), counted from the nearest empty cell; the board
// edge counts as solid so the outer walls sink too.
var DEPTH_SHADE = [0, 0, 0.08, 0.17, 0.25, 0.32, 0.38]

function terrainDepth(w) {
  var k = w.k, cols = k.COLS, rows = k.ROWS, T = w.terrain
  var max = DEPTH_SHADE.length - 1
  var d = new Uint8Array(cols * rows)
  for (var i = 0; i < d.length; i++) d[i] = T[i] === k.EMPTY ? 0 : max
  for (var pass = 0; pass < max; pass++) {
    for (var y = 0; y < rows; y++) {
      for (var x = 0; x < cols; x++) {
        var n = y * cols + x
        if (d[n] <= 1) continue
        d[n] = Math.min(d[n], nearestDepth(d, cols, rows, x, y) + 1)
      }
    }
  }
  return d
}

function nearestDepth(d, cols, rows, x, y) {
  var best = 255
  for (var dy = -1; dy <= 1; dy++) {
    var yy = y + dy
    if (yy < 0 || yy >= rows) continue
    for (var dx = -1; dx <= 1; dx++) {
      var xx = x + dx
      if ((dx || dy) && xx >= 0 && xx < cols) best = Math.min(best, d[yy * cols + xx])
    }
  }
  return best
}

function drawTerrainDepth(ctx, w) {
  var k = w.k, C = k.CELL, cols = k.COLS, d = terrainDepth(w)
  ctx.fillStyle = "#000"
  for (var y = 0; y < k.ROWS; y++) {
    var x = 0
    while (x < cols) {
      var level = d[y * cols + x]
      if (level < 2) { x++; continue }
      var start = x
      while (x < cols && d[y * cols + x] === level) x++
      ctx.globalAlpha = DEPTH_SHADE[level]
      ctx.fillRect(start * C, y * C, (x - start) * C, C)
    }
  }
  ctx.globalAlpha = 1
}

// ---------------------------------------------------------------------------
// Backdrop
// ---------------------------------------------------------------------------
//
// The far wall of the place, drawn behind the terrain so the corridors read as
// carved out of something rather than floating on a flat colour. Three shades
// only (pal.backDim/back/backLit), all darker than any ground the colony can
// stand on: the backdrop is depth, never a surface. It is static, so it lives
// on the terrain layer and costs nothing per tick; it is seeded from the level
// like the stars and the skyline, so a level always has the same wall behind
// it. One small function per biome — a new biome adds a row to BACKDROPS.

function backRng(w) {
  var s = (w.level * 2654435761 + 977) % 2147483647
  return function () { s = (s * 1103515245 + 12345) % 2147483648; return (s >> 8) / 8388608 }
}

var BACKDROPS = {
  "Cavern": backCavern, "Ruins": backRuins, "Frost": backFrost,
  "Foundry": backFoundry, "Jungle": backJungle, "Ice Cave": backIceCave,
  "Spaceship": backSpaceship, "Factory": backFactory, "Trench": backTrench,
  "Desert": backDesert, "Data Center": backDataCenter, "Library": backLibrary, "Mail Room": backMailRoom,
  "Building Site": backBuildingSite, "Clock Tower": backClockTower
}

function drawBackdrop(ctx, w, pal) {
  var fn = BACKDROPS[w.biome]
  var top = w.k.SKY * w.k.CELL
  if (fn) fn(ctx, backRng(w), { x: 0, y: top, w: w.k.COLS * w.k.CELL, h: w.k.ROWS * w.k.CELL - top, world: w }, pal)
  if ((w.res || 1) >= 2) drawBackdropFine(ctx, w, pal)
}

// A pixel position in open air, so a prop is hung where it can be seen rather
// than behind the earth. Most of the board is fill; the corridors are where a
// player's eye is, and a backdrop that only shows in the gaps between them is
// a backdrop nobody sees.
function backSpot(r, b) {
  var w = b.world, C = w.k.CELL
  for (var tries = 0; tries < 40; tries++) {
    var x = Math.floor(r() * b.w), y = b.y + Math.floor(r() * b.h)
    if (w.terrain[Math.floor(y / C) * w.k.COLS + Math.floor(x / C)] === w.k.EMPTY) return { x: x, y: y }
  }
  return { x: Math.floor(r() * b.w), y: b.y + Math.floor(r() * b.h) }
}

// A wobbling column of rock: a pillar for a cave, a trunk for a jungle.
function backColumn(ctx, r, x, top, bot, wid, colour) {
  ctx.fillStyle = colour
  for (var y = top; y < bot; y += 3) {
    var dx = Math.floor(r() * 3) - 1
    ctx.fillRect(x + dx, y, wid, 3)
  }
}

// A ragged horizontal band, the strata a long way back.
function backBand(ctx, r, b, y, thick, colour) {
  ctx.fillStyle = colour
  for (var x = b.x; x < b.x + b.w; x += 4) {
    var t = thick + Math.floor(r() * 3) - 1
    ctx.fillRect(x, y - Math.floor(t / 2), 4, t)
  }
}

function backCavern(ctx, r, b, pal) {
  for (var i = 0; i < 4; i++) backBand(ctx, r, b, b.y + 20 + i * 52 + Math.floor(r() * 16), 3 + Math.floor(r() * 4), pal.backDim)
  for (var c = 0; c < 7; c++) {
    var x = Math.floor(r() * b.w)
    var wid = 6 + Math.floor(r() * 10)
    backColumn(ctx, r, x, b.y, b.y + b.h, wid, pal.back)
    ctx.fillStyle = pal.backLit
    ctx.fillRect(x, b.y, 1, b.h)
  }
}

function backRuins(ctx, r, b, pal) {
  var span = 44 + Math.floor(r() * 12)
  for (var x = b.x + Math.floor(r() * span); x < b.x + b.w; x += span) {
    var broken = r() < 0.35
    var top = b.y + 14 + (broken ? 30 + Math.floor(r() * 80) : 0)
    ctx.fillStyle = pal.back
    ctx.fillRect(x, top, 7, b.y + b.h - top)
    ctx.fillStyle = pal.backLit
    ctx.fillRect(x - 2, top, 11, 3)
    ctx.fillRect(x + 1, top + 3, 1, b.y + b.h - top - 3)
    if (broken || x + span >= b.x + b.w) continue
    // The arch to the next column, stepped like the rest of the pixel art.
    ctx.fillStyle = pal.backDim
    for (var s = 0; s < 6; s++) ctx.fillRect(x + 7 + s * 2, b.y + 14 + s, span - 7 - s * 4, 2)
  }
}

function backFrost(ctx, r, b, pal) {
  // A ridge of peaks far off, the one biome that is outdoors.
  var x = b.x, h = 30
  while (x < b.x + b.w) {
    h = Math.max(10, Math.min(70, h + Math.floor(r() * 13) - 6))
    ctx.fillStyle = pal.back
    ctx.fillRect(x, b.y + 70 - h, 3, b.h)
    ctx.fillStyle = pal.backLit
    if (h > 40) ctx.fillRect(x, b.y + 70 - h, 3, 2)
    x += 3
  }
  backBand(ctx, r, b, b.y + 120, 4, pal.backDim)
}

function backFoundry(ctx, r, b, pal) {
  for (var x = b.x + 10 + Math.floor(r() * 30); x < b.x + b.w; x += 60 + Math.floor(r() * 30)) {
    ctx.fillStyle = pal.back
    ctx.fillRect(x, b.y, 5, b.h)
    ctx.fillStyle = pal.backLit
    ctx.fillRect(x - 1, b.y, 1, b.h)
    ctx.fillRect(x + 5, b.y, 1, b.h)
    // A chain hanging off the girder, links alternating.
    var cx = x + 14 + Math.floor(r() * 20), len = 30 + Math.floor(r() * 90)
    for (var y = b.y; y < b.y + len; y += 2) {
      ctx.fillStyle = (y >> 1) % 2 ? pal.back : pal.backDim
      ctx.fillRect(cx, y, (y >> 1) % 2 ? 1 : 2, 2)
    }
  }
  backBand(ctx, r, b, b.y + 8, 3, pal.back)
}

function backJungle(ctx, r, b, pal) {
  for (var t = 0; t < 6; t++) {
    var x = Math.floor(r() * b.w)
    backColumn(ctx, r, x, b.y + 10, b.y + b.h, 4 + Math.floor(r() * 4), pal.backDim)
  }
  // Foliage: clusters of blocks, which is all a leaf is at this scale.
  for (var f = 0; f < 22; f++) {
    var p = backSpot(r, b)
    for (var l = 0; l < 6; l++) {
      ctx.fillStyle = l % 3 ? pal.back : pal.backLit
      ctx.fillRect(p.x - 8 + Math.floor(r() * 16), p.y - 4 + Math.floor(r() * 8), 3 + Math.floor(r() * 5), 2 + Math.floor(r() * 3))
    }
  }
  for (var v = 0; v < 18; v++) {
    var vx = Math.floor(r() * b.w), vl = 10 + Math.floor(r() * 60)
    ctx.fillStyle = pal.back
    for (var y = 0; y < vl; y += 2) ctx.fillRect(vx + ((y >> 3) % 2), b.y + y, 1, 2)
  }
}

function backIceCave(ctx, r, b, pal) {
  for (var i = 0; i < 26; i++) {
    var p = backSpot(r, b), x = p.x, y = p.y + 8
    var h = 6 + Math.floor(r() * 14)
    // A crystal: a column that narrows to a point, lit down one face.
    for (var s = 0; s < h; s++) {
      var half = Math.max(0, Math.floor((h - s) / 4))
      ctx.fillStyle = pal.back
      ctx.fillRect(x - half, y - s, half * 2 + 1, 1)
      ctx.fillStyle = pal.backLit
      ctx.fillRect(x - half, y - s, 1, 1)
    }
  }
  backBand(ctx, r, b, b.y + 6, 5, pal.backDim)
}

function backSpaceship(ctx, r, b, pal) {
  var rib = 50
  for (var x = b.x + 20; x < b.x + b.w; x += rib) {
    ctx.fillStyle = pal.back
    ctx.fillRect(x, b.y, 4, b.h)
    ctx.fillStyle = pal.backDim
    ctx.fillRect(x + 4, b.y, 1, b.h)
  }
  // Portholes, with a star or two in them.
  for (var n = 0; n < 12; n++) {
    var p = backSpot(r, b), px = p.x - 3, y = p.y - 3
    ctx.fillStyle = pal.backLit
    ctx.fillRect(px - 1, y, 8, 6); ctx.fillRect(px, y - 1, 6, 8)
    ctx.fillStyle = pal.skyTop
    ctx.fillRect(px, y, 6, 6)
    ctx.fillStyle = pal.dust
    ctx.fillRect(px + 1 + Math.floor(r() * 4), y + 1 + Math.floor(r() * 4), 1, 1)
  }
}

function backFactory(ctx, r, b, pal) {
  // Brick courses, offset every other row; then windows knocked out of them.
  ctx.fillStyle = pal.backDim
  for (var y = b.y; y < b.y + b.h; y += 6) {
    ctx.fillRect(b.x, y, b.w, 1)
    for (var x = b.x + ((y / 6) % 2 ? 6 : 0); x < b.x + b.w; x += 12) ctx.fillRect(x, y, 1, 6)
  }
  for (var n = 0; n < 9; n++) {
    var p = backSpot(r, b), wx = p.x - 10, wy = p.y - 8, wh = 16
    ctx.fillStyle = pal.back
    ctx.fillRect(wx, wy, 20, wh)
    ctx.fillStyle = pal.backLit
    for (var gx = 0; gx <= 20; gx += 5) ctx.fillRect(wx + gx, wy, 1, wh)
    for (var gy = 0; gy <= wh; gy += 8) ctx.fillRect(wx, wy + gy, 20, 1)
  }
}

function backDesert(ctx, r, b, pal) {
  // The one biome with a sun. It hangs in the far wall rather than in the
  // band of sky, because that band is the special's card on most levels; low,
  // so the dunes cut across the bottom of it.
  // A glow rather than a shape: three discs of the palest sand at falling
  // strength, then thin rays. Drawn in wall shades it read as a gear set into
  // the rock; a light has to be lighter than what it lights.
  var sx = 40 + Math.floor(r() * (b.w - 80)), sy = b.y + 34
  ctx.fillStyle = pal.decorLit
  var discs = [[22, 0.10], [15, 0.18], [9, 0.55]]
  for (var dc = 0; dc < discs.length; dc++) {
    var rad = discs[dc][0]
    ctx.globalAlpha = discs[dc][1]
    for (var dy = -rad; dy <= rad; dy += 2) {
      var half = Math.round(Math.sqrt(rad * rad - dy * dy))
      ctx.fillRect(sx - half, sy + dy, half * 2, 2)
    }
  }
  ctx.globalAlpha = 0.22
  for (var ray = 0; ray < 16; ray++) {
    var ang = ray / 16 * Math.PI * 2, len = ray % 2 ? 30 : 38
    for (var rd = 24; rd < len; rd += 2)
      ctx.fillRect(Math.round(sx + Math.cos(ang) * rd), Math.round(sy + Math.sin(ang) * rd), 1, 1)
  }
  ctx.globalAlpha = 1
  // Two ranges of dunes, the near one darker; then a mesa or two standing
  // out of them with the flat top and straight sides that sand cannot make.
  var ridges = [{ base: 60, amp: 10, len: 37, col: pal.backDim }, { base: 95, amp: 14, len: 23, col: pal.back }]
  for (var ri = 0; ri < ridges.length; ri++) {
    var rg = ridges[ri], ph = r() * 6.28
    ctx.fillStyle = rg.col
    for (var x = b.x; x < b.x + b.w; x += 2) {
      var top = b.y + rg.base - Math.round(Math.sin(x / rg.len + ph) * rg.amp + Math.sin(x / 9 + ph) * 2)
      ctx.fillRect(x, top, 2, b.y + b.h - top)
    }
  }
  for (var m = 0; m < 2; m++) {
    var mx = Math.floor(r() * (b.w - 60)), mw = 30 + Math.floor(r() * 30), mt = b.y + 30 + Math.floor(r() * 30)
    ctx.fillStyle = pal.back
    ctx.fillRect(mx, mt, mw, b.y + b.h - mt)
    ctx.fillStyle = pal.backLit
    ctx.fillRect(mx - 2, mt, mw + 4, 2)
  }
}

// Far rows of racks: tall columns in the back shades, each with a few dim
// status dots, receding in two rows so the hall reads as deep.
function backDataCenter(ctx, r, b, pal) {
  for (var row = 0; row < 2; row++) {
    var pitch = row ? 14 : 22, wide = row ? 8 : 12
    ctx.fillStyle = row ? pal.backDim : pal.back
    for (var x = b.x + Math.floor(r() * pitch); x < b.x + b.w; x += pitch) {
      ctx.fillRect(x, b.y, wide, b.h)
      ctx.fillStyle = pal.backLit
      for (var y = b.y + 4; y < b.y + b.h; y += 6 + Math.floor(r() * 6)) ctx.fillRect(x + 2 + Math.floor(r() * (wide - 4)), y, 1, 1)
      ctx.fillStyle = row ? pal.backDim : pal.back
    }
  }
}

function backTrench(ctx, r, b, pal) {
  // Rock spires rising out of the deep; the sea is laid over them afterwards.
  for (var i = 0; i < 9; i++) {
    var x = Math.floor(r() * b.w), h = 40 + Math.floor(r() * (b.h - 50)), wid = 8 + Math.floor(r() * 14)
    for (var s = 0; s < h; s += 3) {
      var taper = Math.floor(wid * (1 - s / h) * 0.5) + 1
      ctx.fillStyle = pal.back
      ctx.fillRect(x - taper + Math.floor(r() * 2), b.y + b.h - s, taper * 2, 3)
    }
  }
  // Kelp: a stalk that drifts sideways a pixel at a time.
  for (var k = 0; k < 16; k++) {
    var kx = Math.floor(r() * b.w), kh = 20 + Math.floor(r() * 60)
    ctx.fillStyle = pal.backLit
    for (var y = 0; y < kh; y += 2) ctx.fillRect(kx + Math.round(Math.sin(y / 7 + k) * 2), b.y + b.h - y, 1, 2)
  }
}

// Fine wall detail follows the existing rectangles, including their seeded
// placement. Replaying the static recipe into a tiny recording context avoids
// a second copy of every placement rule. Only the three back shades qualify:
// the Desert's sun and the ship's stars keep their existing light and shape.
// Every mark stays inside its rectangle, under the terrain and the actors.
var BACKDROP_FINE = {
  "Cavern": backCavernFine, "Ruins": backRuinsFine, "Frost": backFrostFine,
  "Foundry": backFoundryFine, "Jungle": backJungleFine, "Ice Cave": backIceCaveFine,
  "Spaceship": backSpaceshipFine, "Factory": backFactoryFine,
  "Skyscraper": backSkyscraperFine, "Trench": backTrenchFine,
  "Desert": backDesertFine, "Data Center": backDataCenterFine, "Library": backLibraryFine, "Mail Room": backMailRoomFine,
  "Building Site": backBuildingSiteFine, "Clock Tower": backClockTowerFine
}

function drawBackdropFine(ctx, w, pal) {
  var fn = BACKDROP_FINE[w.biome]
  if (!fn) return
  var top = w.k.SKY * w.k.CELL
  var b = { x: 0, y: top, w: w.k.COLS * w.k.CELL, h: w.k.ROWS * w.k.CELL - top, world: w }
  ctx.save()
  ctx.globalAlpha = 0.4
  var recipe = BACKDROPS[w.biome]
  if (!recipe) fn(ctx, b, pal)
  else recipe(backFineRecorder(ctx, fn, pal), backRng(w), b, pal)
  ctx.restore()
}

function backFineRecorder(ctx, fn, pal) {
  return { fillStyle: pal.back, globalAlpha: 1,
    fillRect: function (x, y, width, height) {
      if (width < 1 || height < 1) return
      if (this.fillStyle !== pal.back && this.fillStyle !== pal.backDim && this.fillStyle !== pal.backLit) return
      fn(ctx, { x: x, y: y, w: width, h: height }, pal)
    }
  }
}

function backCavernFine(ctx, b, pal) {
  ctx.fillStyle = pal.backDim
  ctx.fillRect(b.x + b.w - 0.5, b.y + 0.5, 0.5, b.h - 0.5) // split edge
  ctx.fillRect(b.x + 0.5, b.y + 1, Math.min(2, b.w - 0.5), 0.5) // mineral seam
}

function backRuinsFine(ctx, b, pal) {
  ctx.fillStyle = pal.backDim
  for (var y = b.y + 4.5; y < b.y + b.h; y += 9) ctx.fillRect(b.x + 0.5, y, b.w - 0.5, 0.5) // mortar
  ctx.fillRect(b.x + b.w - 0.5, b.y + 0.5, 0.5, b.h - 0.5) // fluted shadow
}

function backFrostFine(ctx, b, pal) {
  ctx.fillStyle = pal.backDim
  if (b.h > 3) ctx.fillRect(b.x + 0.5, b.y + 2.5, 0.5, Math.min(5, b.h - 2.5)) // far ridge crevice
  ctx.fillStyle = pal.backLit
  ctx.fillRect(b.x + 0.5, b.y + 0.5, b.w - 1, 0.5) // narrow snow lip
}

function backFoundryFine(ctx, b, pal) {
  ctx.fillStyle = pal.backDim
  ctx.fillRect(b.x + 0.5, b.y + 0.5, 0.5, b.h - 0.5) // girder recess, hollow chain link
  if (b.h < 10 || b.w < 2) return
  ctx.fillStyle = pal.backLit
  for (var y = b.y + 8.5; y < b.y + b.h; y += 24) ctx.fillRect(b.x + 1, y, 0.5, 0.5) // fixings
}

function backJungleFine(ctx, b, pal) {
  ctx.fillStyle = pal.backDim
  ctx.fillRect(b.x + 0.5, b.y + 0.5, 0.5, b.h - 0.5) // bark and vine edge
  if (b.w < 3) return
  ctx.fillStyle = pal.backLit
  ctx.fillRect(b.x + 1, b.y + 1, b.w - 2, 0.5) // a short leaf vein
}

function backIceCaveFine(ctx, b, pal) {
  ctx.fillStyle = pal.backDim
  ctx.fillRect(b.x + b.w - 0.5, b.y, 0.5, b.h) // darker crystal face
  if (b.w < 3) return
  ctx.fillStyle = pal.backLit
  ctx.fillRect(b.x + 1.5, b.y + 0.5, 0.5, 0.5) // a split in the lit facet
}

function backSpaceshipFine(ctx, b, pal) {
  ctx.fillStyle = pal.backDim
  if (b.w === 6 && b.h === 8) {
    ctx.fillRect(b.x + 0.5, b.y + 0.5, b.w - 1, 0.5) // port top and bottom, clear of the stars
    ctx.fillRect(b.x + 0.5, b.y + b.h - 0.5, b.w - 1, 0.5)
    return
  }
  ctx.fillRect(b.x + b.w - 0.5, b.y + 0.5, 0.5, b.h - 0.5) // rib channel / port rim
  if (b.h < 12) return
  ctx.fillStyle = pal.backLit
  for (var y = b.y + 12.5; y < b.y + b.h; y += 32) ctx.fillRect(b.x + 0.5, y, Math.min(2, b.w - 0.5), 0.5) // rib joints
}

function backFactoryFine(ctx, b, pal) {
  ctx.fillStyle = pal.back
  ctx.fillRect(b.x + 0.5, b.y + 0.5, b.w - 0.5, 0.5) // recessed mortar / glazing edge
  ctx.fillStyle = pal.backDim
  ctx.fillRect(b.x + b.w - 0.5, b.y + 0.5, 0.5, b.h - 0.5)
}

function backSkyscraperFine(ctx, b, pal) {
  // The tower has a skyline, but no coarse wall. Keep the interior quieter
  // than the city: recessed office panel joints, without new lit windows.
  ctx.fillStyle = pal.backDim
  for (var x = b.x + 24.5; x < b.x + b.w; x += 48) {
    ctx.fillRect(x, b.y, 0.5, b.h)
    for (var y = b.y + 16.5; y < b.y + b.h; y += 32) ctx.fillRect(x, y, 12, 0.5)
  }
}

function backTrenchFine(ctx, b, pal) {
  ctx.fillStyle = pal.backDim
  ctx.fillRect(b.x + b.w - 0.5, b.y + 0.5, 0.5, b.h - 0.5) // spire erosion / kelp midrib
  if (b.w < 4) return
  ctx.fillRect(b.x + 1.5, b.y + 1, Math.min(3, b.w - 2), 0.5) // sediment ledge
}

function backDesertFine(ctx, b, pal) {
  // Long mesa faces get strata; dune slices keep only a soft half-pixel lip.
  ctx.fillStyle = pal.backDim
  ctx.fillRect(b.x + 0.5, b.y + 0.5, b.w - 0.5, 0.5)
  if (b.w < 20) return
  for (var y = b.y + 8.5; y < b.y + b.h; y += 17) ctx.fillRect(b.x + 1, y, b.w - 2, 0.5)
}

function backDataCenterFine(ctx, b, pal) {
  if (b.w < 4) return // retain the dim status dots
  ctx.fillStyle = pal.backDim
  ctx.fillRect(b.x + b.w - 0.5, b.y, 0.5, b.h) // cabinet seam
  for (var y = b.y + 3.5; y + 1.5 <= b.y + b.h; y += 12) {
    ctx.fillRect(b.x + 1.5, y, b.w - 3, 0.5) // vent slots
    ctx.fillRect(b.x + 1.5, y + 1, b.w - 3, 0.5)
  }
}

// The Trench's water, laid over the finished terrain rather than behind it.
// That is the whole trick of the biome: every other skin is a thing you look
// at, and this one is a thing you look *through*, so the earth has to be drawn
// first and then have the sea put in front of it. It lives in drawTerrain
// because none of it moves — the shafts hang from the same place all level and
// the depth gradient is a property of the board, not of the tick. Everything
// that does move (fish, bubbles, motes) is in drawWaterLife, on the actor pass.
function drawSea(ctx, w, pal) {
  if (w.biome !== "Trench") return
  var k = w.k
  var C = k.CELL
  var wide = k.COLS * C
  var tall = k.ROWS * C

  // Light coming down from a surface far above the top of the board. Vertical
  // rather than angled: a shaft that leans implies a sun with a position, and
  // the joke of the biome is that there is no sky in it at all. Seeded from
  // the level so a shot of level 20 is the same shot every time.
  var seed = (w.level * 2654435761) % 100000
  var next = function () { seed = (seed * 1103515245 + 12345) % 2147483648; return seed >> 6 }
  ctx.fillStyle = pal.sunShaft
  for (var sh = 0; sh < 7; sh++) {
    var sx = next() % wide
    var swide = 6 + next() % 22
    var sdeep = (k.SKY * C) + next() % (tall - k.SKY * C)
    // Tapered, by stacking narrowing slices. A rectangle of pale blue is a
    // rectangle; the taper is the only thing that says "light".
    var slices = 14
    for (var sl = 0; sl < slices; sl++) {
      var f = sl / slices
      var sw2 = Math.max(1, Math.round(swide * (1 - f * 0.75)))
      ctx.fillRect(Math.round(sx + (swide - sw2) / 2), Math.round(f * sdeep),
                   sw2, Math.ceil(sdeep / slices) + 1)
    }
  }

  // Depth. The board gets bluer and darker toward the bottom, which is the one
  // cue that makes a corridor near the floor feel further down than a corridor
  // near the top rather than merely lower on the screen.
  var deep = ctx.createLinearGradient(0, 0, 0, tall)
  deep.addColorStop(0, pal.seaWash)
  deep.addColorStop(0.55, pal.seaWash)
  deep.addColorStop(1, pal.seaDeep)
  ctx.fillStyle = deep
  ctx.fillRect(0, 0, wide, tall)
}

// Decor is non-solid and disappears visually when its supporting cell is gone.
// Fittings: the decor that is furniture rather than ground — a ship's
// viewport, a strip light, a floor grate, a desk. Each one checks the terrain
// it is fixed to and draws nothing once that has been dug away.
// The viewport is only drawn while the hull it is set into is still there,
// so an agent that bashes through the wall takes the window with it. The
// desk is the one piece of decor somebody was sitting at this morning; the
// chair is pushed back because they left in a hurry.
var DECOR_FITTINGS = {
  window: function(ctx, w, pal, d, px, py) {
    var k = w.k, C = k.CELL
    if (w.terrain[d.y * k.COLS + d.x] === k.EMPTY) return
    var ww2 = (d.size + 2) * C
    var wh2 = (d.size + 1) * C
    ctx.fillStyle = pal.hatchMouth               // the void outside
    ctx.fillRect(px, py, ww2, wh2)
    ctx.fillStyle = pal.decorLit
    for (var st3 = 0; st3 < 5; st3++) {          // stars in it
      var sxx = px + 2 + ((d.seed * (st3 + 3)) % Math.max(1, ww2 - 4))
      var syy = py + 2 + ((d.seed * (st3 + 7)) % Math.max(1, wh2 - 4))
      ctx.fillRect(sxx, syy, 1, 1)
    }
    ctx.fillStyle = pal.rig                      // the frame
    ctx.fillRect(px - 1, py - 1, ww2 + 2, 2)
    ctx.fillRect(px - 1, py + wh2 - 1, ww2 + 2, 2)
    ctx.fillRect(px - 1, py - 1, 2, wh2 + 2)
    ctx.fillRect(px + ww2 - 1, py - 1, 2, wh2 + 2)
  },
  strip: function(ctx, w, pal, d, px, py) {
    var k = w.k
    if (w.terrain[(d.y - 1) * k.COLS + d.x] === k.EMPTY) return
    ctx.fillStyle = pal.rigDark
    ctx.fillRect(px - 6, py, 16, 2)
    ctx.fillStyle = pal.decorLit                 // the lit tube
    ctx.fillRect(px - 4, py + 1, 12, 1)
  },
  grate: function(ctx, w, pal, d, px, py) {
    var k = w.k, C = k.CELL
    if (w.terrain[(d.y + 1) * k.COLS + d.x] === k.EMPTY) return
    ctx.fillStyle = pal.decorDim
    for (var gg = 0; gg < 5; gg++) ctx.fillRect(px + gg * 3, py + C - 2, 2, 2)
  },
  desk: function(ctx, w, pal, d, px, py) {
    var k = w.k, C = k.CELL
    if (w.terrain[(d.y + 1) * k.COLS + d.x] === k.EMPTY) return
    ctx.fillStyle = pal.decorDim
    ctx.fillRect(px - 1, py + C - 6, 12, 2)             // the desktop
    ctx.fillRect(px, py + C - 4, 2, 4)                  // and its legs
    ctx.fillRect(px + 8, py + C - 4, 2, 4)
    ctx.fillStyle = pal.rigDark
    ctx.fillRect(px + 5, py + C - 11, 6, 5)             // the monitor
    ctx.fillStyle = d.seed % 3 === 0 ? pal.decorLit : pal.decorDim
    ctx.fillRect(px + 6, py + C - 10, 4, 3)             // still logged in
    ctx.fillStyle = pal.decor
    ctx.fillRect(px - 5, py + C - 9, 4, 2)              // the chair back
    ctx.fillRect(px - 4, py + C - 7, 2, 4)
    ctx.fillRect(px - 6, py + C - 5, 5, 1)
  }
}

function drawDecor(ctx, w, pal) {
  var k = w.k
  var C = k.CELL
  for (var i = 0; i < w.decor.length; i++) {
    var d = w.decor[i]
    var px = d.x * C
    var py = d.y * C

    var fit = DECOR_FITTINGS[d.kind]
    if (fit) { fit(ctx, w, pal, d, px, py); continue }

    if (d.kind === "hang") {
      if (w.terrain[(d.y - 1) * k.COLS + d.x] === k.EMPTY) continue
      if (w.terrain[d.y * k.COLS + d.x] !== k.EMPTY) continue
    } else {
      if (w.terrain[(d.y + 1) * k.COLS + d.x] === k.EMPTY) continue
      if (w.terrain[d.y * k.COLS + d.x] !== k.EMPTY) continue
    }

    // The biome decides what the same four shapes are made of. A spire is a
    // stalagmite in a cavern, a fallen column in ruins, an ice needle in the
    // frost and a length of pipe in the foundry — same silhouette, and the
    // palette plus a detail or two does the rest.
    var ruins = w.biome === "Ruins"
    var frost = w.biome === "Frost" || w.biome === "Ice Cave"
    var foundry = w.biome === "Foundry" || w.biome === "Spaceship"
               || w.biome === "Factory" || w.biome === "Skyscraper" || w.biome === "Data Center"
    var jungle = w.biome === "Jungle"
    var desert = w.biome === "Desert"
    drawDecorShape(ctx, w, pal, d, px, py, ruins, frost, foundry, jungle, desert)
    if ((w.res || 1) >= 2) drawDecorFine(ctx, pal, d, px, py, py + C,
      w.biome === "Clock Tower" ? "clock" : w.biome === "Building Site" ? "site" : w.biome === "Mail Room" ? "mail" : w.biome === "Library" ? "library" : foundry ? "pipe" : ruins ? "ruins" : desert ? "desert" : jungle ? "jungle" : frost ? "frost" : "cave")
  }
}

function drawDecorShape(ctx, w, pal, d, px, py, ruins, frost, foundry, jungle, desert) {
  if (w.biome === "Clock Tower") return drawClockDecor(ctx, pal, d, px, py, w.k.CELL)
  if (w.biome === "Building Site") return drawSiteDecor(ctx, pal, d, px, py, w.k.CELL)
  if (w.biome === "Mail Room") return drawMailDecor(ctx, pal, d, px, py, w.k.CELL)
  if (w.biome === "Library") return drawLibraryDecor(ctx, pal, d, px, py, w.k.CELL)
  var C = w.k.CELL

    if (d.kind === "spire") {
      var h = 3 + d.size * 3
      ctx.fillStyle = pal.decor
      if (foundry) {
        // A pipe: straight sides, a collar near the top.
        ctx.fillRect(px + 1, py + C - h, 3, h)
        ctx.fillStyle = pal.decorLit
        ctx.fillRect(px, py + C - h + 2, 5, 2)
      } else if (ruins) {
        // A broken column: parallel sides, snapped off at an angle.
        ctx.fillRect(px, py + C - h, 5, h)
        ctx.fillStyle = pal.decorDim
        ctx.fillRect(px + 3, py + C - h, 2, 2)
        ctx.fillStyle = pal.decorLit
        ctx.fillRect(px, py + C - h, 3, 1)
      } else if (desert) {
        // A saguaro: a trunk and two arms that turn up, offset so it is never
        // a cross. The silhouette is the whole of it.
        ctx.fillRect(px + 2, py + C - h - 2, 3, h + 2)
        ctx.fillRect(px - 1, py + C - h + 2, 3, 2); ctx.fillRect(px - 1, py + C - h - 1, 2, 3)
        ctx.fillRect(px + 5, py + C - h + 4, 2, 2); ctx.fillRect(px + 6, py + C - h + 1, 2, 4)
        ctx.fillStyle = pal.decorLit
        ctx.fillRect(px + 3, py + C - h - 2, 1, h)
      } else if (jungle) {
        // A trunk with a canopy on top, which is the one silhouette that says
        // jungle without needing colour to do the work.
        ctx.fillRect(px + 2, py + C - h, 2, h)
        ctx.fillStyle = pal.decorLit
        ctx.fillRect(px - 1, py + C - h - 2, 8, 3)
        ctx.fillRect(px + 1, py + C - h - 4, 4, 2)
      } else {
        // A cone, drawn as courses that narrow toward the tip.
        for (var r = 0; r < h; r++) {
          var half = Math.max(0, Math.round((h - r) / (frost ? 3.2 : 2.4)))
          ctx.fillRect(px + 2 - half, py + C - 1 - r, half * 2 + 1, 1)
        }
        ctx.fillStyle = pal.decorLit
        ctx.fillRect(px + 2, py + C - h, 1, Math.min(3, h))
      }

    } else if (d.kind === "hang") {
      var hh = 2 + d.size * 3
      if (jungle) {
        // A vine: a wavering line with leaves off it, and long enough to hang
        // into the corridor properly. Nothing else on the board is soft.
        ctx.fillStyle = pal.decor
        var vlen = hh + 6
        for (var v = 0; v < vlen; v++) {
          var wob = Math.round(Math.sin((v + d.seed) * 0.4) * 1.4)
          ctx.fillRect(px + 2 + wob, py + v, 1, 1)
          if (v > 2 && v % 4 === (d.seed % 3)) {
            ctx.fillStyle = pal.decorLit
            ctx.fillRect(px + 2 + wob + (v % 8 < 4 ? 1 : -2), py + v, 2, 1)
            ctx.fillStyle = pal.decor
          }
        }
      } else if (foundry) {
        // A cable loop off the ceiling.
        ctx.fillStyle = pal.decorDim
        for (var cbl = 0; cbl <= 6; cbl++) {
          var sag = Math.round(Math.sin(cbl / 6 * Math.PI) * (2 + d.size))
          ctx.fillRect(px + cbl - 1, py + sag, 1, 1)
        }
      } else {
        ctx.fillStyle = frost ? pal.decorLit : pal.decorDim
        for (var g = 0; g < hh; g++) {
          var gw = Math.max(0, Math.round((hh - g) / 2.6))
          ctx.fillRect(px + 2 - gw, py + g, gw * 2 + 1, 1)
        }
      }

    } else if (d.kind === "clump") {
      // A mound of loose material: rubble, a snow drift, a heap of slag.
      var cw = 3 + d.size * 2
      ctx.fillStyle = pal.decorDim
      ctx.fillRect(px, py + C - 2, cw, 2)
      ctx.fillStyle = pal.decor
      ctx.fillRect(px + 1, py + C - 3, cw - 2, 1)
      if (d.seed % 3 === 0) {
        ctx.fillStyle = pal.decorLit
        ctx.fillRect(px + 1 + (d.seed % 2), py + C - 4, 1, 1)
      }

    } else {
      // Tufts: grass in a cavern, crystals in the frost, weeds in ruins,
      // a spray of sparks in the foundry. Three blades at different heights.
      ctx.fillStyle = foundry ? pal.decorLit : pal.decor
      var blades = 2 + (d.seed % 2)
      for (var bl = 0; bl <= blades; bl++) {
        var bh = 2 + ((d.seed >> bl) % 3) + d.size
        var bxo = bl * 2
        ctx.fillRect(px + bxo, py + C - bh, 1, bh)
        if (frost) ctx.fillRect(px + bxo, py + C - bh, 1, 1)
      }
    }
}

// Decor at half-pixel detail: shading down the shadow side of a spire, the
// fluting on a column, spines on a cactus, pebbles in a heap, light on the tip
// of a blade. Inside the silhouettes drawDecorShape has just drawn, so res 1
// loses nothing. `base` is the floor line a standing shape stands on; `top`
// the ceiling line a hanging one hangs from.
function drawDecorFine(ctx, pal, d, px, top, base, look) {
  var fn = DECOR_FINE[d.kind + ":" + look] || DECOR_FINE[d.kind]
  if (fn) fn(ctx, pal, d, px, base, top)
}

function fineSpireHeight(d) { return 3 + d.size * 3 }

var DECOR_FINE = {
  "spire:clock": fineClockWeight, "clump:clock": fineClockParts,
  "hang:clock": fineClockChain, "tuft:clock": fineClockOiler,
  "spire:site": fineSiteCone, "clump:site": fineSitePallet,
  "hang:site": fineSiteSign, "tuft:site": fineSiteEquipment,
  "spire:mail": fineMailSack, "clump:mail": fineMailParcels,
  "hang:mail": fineMailSign, "tuft:mail": fineMailFrank,
  "spire:library": fineLibraryLadder, "hang:library": fineLibraryLamp,
  "clump:library": fineLibraryPile, "tuft:library": fineLibraryLamp,
  "spire:cave": function(ctx, pal, d, px, base) { fineCone(ctx, pal, d, px, base, 2.4) },
  "spire:frost": function(ctx, pal, d, px, base) {
    fineCone(ctx, pal, d, px, base, 3.2)
    ctx.fillStyle = "#ffffff"
    ctx.fillRect(px + 2, base - fineSpireHeight(d), 0.5, 0.5)       // the needle's point
  },
  "spire:ruins": function(ctx, pal, d, px, base) {
    var h = fineSpireHeight(d)
    ctx.fillStyle = pal.decorDim
    ctx.fillRect(px + 1.5, base - h + 1.5, 0.5, h - 1.5)            // fluting
    ctx.fillRect(px + 3, base - h + 2, 0.5, h - 2)
    ctx.fillRect(px, base - 1.5, 5, 0.5)                             // the base course
    ctx.fillStyle = pal.decorLit
    ctx.fillRect(px + 0.5, base - h + 1, 0.5, h - 2)
  },
  "spire:pipe": function(ctx, pal, d, px, base) {
    var h = fineSpireHeight(d)
    ctx.fillStyle = pal.decorLit
    ctx.fillRect(px + 1.5, base - h, 0.5, h)                         // light down the pipe
    ctx.fillStyle = pal.decorDim
    ctx.fillRect(px + 3.5, base - h, 0.5, h)
    ctx.fillRect(px + 0.5, base - h + 2.5, 0.5, 0.5)                 // bolts on the collar
    ctx.fillRect(px + 4, base - h + 2.5, 0.5, 0.5)
  },
  "spire:desert": function(ctx, pal, d, px, base) {
    var h = fineSpireHeight(d)
    ctx.fillStyle = pal.decorDim
    for (var y = 0; y < h; y += 2) ctx.fillRect(px + 4.5, base - h - 1 + y, 0.5, 0.5)   // spines
    ctx.fillRect(px + 1.5, base - h + 1, 0.5, 0.5)
    ctx.fillRect(px + 7.5, base - h + 2, 0.5, 0.5)
  },
  "spire:jungle": function(ctx, pal, d, px, base) {
    var h = fineSpireHeight(d)
    ctx.fillStyle = pal.decor
    for (var l = 0; l < 4; l++) ctx.fillRect(px - 0.5 + l * 2, base - h - 0.5 + (l % 2) * 0.5, 0.5, 0.5)
    ctx.fillStyle = pal.decorDim
    ctx.fillRect(px + 3.5, base - h + 1, 0.5, h - 1)                 // bark on the trunk
  },
  "hang:cave": fineDrip,
  "hang:ruins": fineDrip,
  "hang:frost": fineDrip,
  "clump": function(ctx, pal, d, px, base) {
    var cw = 3 + d.size * 2
    for (var p = 0; p < cw; p += 1.5) {
      ctx.fillStyle = (d.seed + p * 2) % 3 ? pal.decorLit : pal.rigDark
      ctx.fillRect(px + 0.5 + p, base - 1.5 - ((d.seed + p * 2) % 2) * 0.5, 0.5, 0.5)
    }
  },
  "tuft": function(ctx, pal, d, px, base) {
    ctx.fillStyle = pal.decorLit
    var blades = 2 + (d.seed % 2)
    for (var bl = 0; bl <= blades; bl++) {
      var bh = 2 + ((d.seed >> bl) % 3) + d.size
      ctx.fillRect(px + bl * 2 + 0.5, base - bh, 0.5, 1)             // light on the tip
    }
  }
}

// A stalactite (or an icicle): the shadow side, and a drop of water forming
// on the tip.
function fineDrip(ctx, pal, d, px, base, top) {
  var hh = 2 + d.size * 3
  ctx.fillStyle = pal.rigDark
  ctx.globalAlpha = 0.5
  for (var g = 0; g < hh - 1; g++) {
    var gw = Math.round((hh - g) / 2.6)
    if (gw) ctx.fillRect(px + 2 + gw + 0.5, top + g, 0.5, 1)
  }
  ctx.globalAlpha = 1
  ctx.fillStyle = pal.decorLit
  ctx.fillRect(px + 2.25, top + hh + 0.5, 0.5, 0.5)
}

// The shadow side of a cone, half a pixel in from its right edge, and a
// highlight a half-pixel left of its spine.
function fineCone(ctx, pal, d, px, base, taper) {
  var h = fineSpireHeight(d)
  for (var r = 0; r < h - 1; r++) {
    var half = Math.max(0, Math.round((h - r) / taper))
    if (!half) continue
    ctx.fillStyle = pal.decorDim
    ctx.fillRect(px + 2 + half + 0.5, base - 1 - r, 0.5, 1)
    ctx.fillStyle = pal.decorLit
    ctx.globalAlpha = 0.5
    ctx.fillRect(px + 1.5, base - 1 - r, 0.5, 1)
    ctx.globalAlpha = 1
  }
}

// The portal's static half sits on the terrain layer so the pulsing light on
// top of it (see drawExitGlow) is the only part paying the per-tick cost.
function drawExitBack(ctx, w, pal) {
  var k = w.k
  var C = k.CELL
  var e = w.exit
  var x = e.x * C
  var y = e.y * C
  var ww = e.w * C
  var hh = e.h * C

  // Dark at the top, bright at the floor: the way in reads as a mouth with
  // something lit at the bottom of it rather than as a pane of glass.
  var g = ctx.createLinearGradient(0, y, 0, y + hh)
  g.addColorStop(0, pal.exitDeep)
  g.addColorStop(1, pal.exitGlow)
  ctx.fillStyle = g
  ctx.fillRect(x, y, ww, hh)

  // The way home is the one thing on the board that must be recognisable at a
  // glance on every level, so the lit mouth above never changes. What changes
  // is what has been built around it: each biome frames its exit in its own
  // materials, and you know where you are from the doorway alone.
  ctx.fillStyle = pal.exitFrame
  var cx3 = x + ww / 2

  var frame = EXIT_FRAMES[w.biome]
  if (frame) frame(ctx, pal, x, y, ww, hh)
  else drawExitFrameBase(ctx, w, pal, x, y, ww, hh, cx3)
  drawExitFrameFine(ctx, w, pal, x, y, ww, hh)
}

var EXIT_FRAMES = { "Library": drawExitLibrary, "Data Center": drawExitDataBack, "Mail Room": drawExitMail, "Building Site": drawExitSite, "Clock Tower": drawExitClock }
function drawExitFrameBase(ctx, w, pal, x, y, ww, hh, cx3) {
  switch (w.biome) {
  case "Ruins":
    // A pediment on two broken columns, one shorter than the other.
    ctx.fillRect(x - 5, y - 7, ww + 10, 3)
    for (var pd = 0; pd < 4; pd++)
      ctx.fillRect(cx3 - 6 + pd * 3, y - 10 + pd, 3, 3)
    ctx.fillRect(x - 4, y - 4, 3, hh + 4)
    ctx.fillRect(x + ww + 1, y - 4, 3, hh - 2)          // snapped short
    break

  case "Ice Cave":
    // The same doorway, but the cave has been closing on it for a long time:
    // a thick encrusted arch, with ice growing down into the opening itself.
    ctx.fillRect(x - 5, y - 7, ww + 10, 5)
    ctx.fillRect(x - 5, y - 2, 4, hh + 2)
    ctx.fillRect(x + ww + 1, y - 2, 4, hh + 2)
    ctx.fillStyle = pal.decorLit
    for (var ie = 0; ie < ww + 6; ie += 3)
      for (var id2 = 0; id2 < 2 + ((ie / 3) % 4); id2++)
        ctx.fillRect(x - 3 + ie, y - 2 + id2, 2, 1)
    for (var iw = 0; iw < 3; iw++) {         // and down the jambs inside
      ctx.fillRect(x, y + iw * 4, 1, 3)
      ctx.fillRect(x + ww - 1, y + 2 + iw * 4, 1, 3)
    }
    break

  case "Frost":
    // A light fringe of ice off a plain lintel — frost, not a glacier.
    ctx.fillRect(x - 3, y - 5, ww + 6, 3)
    ctx.fillRect(x - 3, y - 2, 2, hh + 2)
    ctx.fillRect(x + ww + 1, y - 2, 2, hh + 2)
    ctx.fillStyle = pal.decorLit
    for (var ic2 = 0; ic2 < ww; ic2 += 4)
      for (var dp = 0; dp < 2 + ((ic2 / 4) % 3); dp++)
        ctx.fillRect(x + ic2, y - 2 + dp, 2 - (dp > 1 ? 1 : 0), 1)
    break

  case "Foundry":
    // A blast door: heavy jambs, a lintel, and rivets.
    ctx.fillRect(x - 5, y - 6, ww + 10, 4)
    ctx.fillRect(x - 4, y - 2, 4, hh + 2)
    ctx.fillRect(x + ww, y - 2, 4, hh + 2)
    ctx.fillStyle = pal.rigDark
    for (var rv = 0; rv < ww + 8; rv += 5) ctx.fillRect(x - 4 + rv, y - 5, 2, 2)
    break

  case "Desert":
    // A temple pylon: jambs that lean in as they rise, a heavy lintel, and a
    // sun disc over the door.
    for (var py2 = 0; py2 < hh + 4; py2++) {
      var lean = Math.floor((hh + 4 - py2) / 6)
      ctx.fillRect(x - 6 + (lean > 2 ? 2 : lean), y - 4 + py2, 4, 1)
      ctx.fillRect(x + ww + 2 - (lean > 2 ? 2 : lean), y - 4 + py2, 4, 1)
    }
    ctx.fillRect(x - 6, y - 7, ww + 12, 3)
    ctx.fillStyle = pal.decorLit
    ctx.fillRect(cx3 - 2, y - 11, 5, 4); ctx.fillRect(cx3 - 3, y - 10, 7, 2)
    ctx.fillRect(cx3 - 8, y - 9, 4, 1); ctx.fillRect(cx3 + 5, y - 9, 4, 1)
    break

  case "Jungle":
    // A stone arch that the forest has taken back.
    ctx.fillRect(x - 4, y - 5, ww + 8, 3)
    ctx.fillRect(x - 3, y - 2, 2, hh + 2)
    ctx.fillRect(x + ww + 1, y - 2, 2, hh + 2)
    ctx.fillStyle = pal.decor
    for (var vn = -4; vn < ww + 4; vn += 3) {
      var drop3 = 3 + ((vn + 12) % 4) * 2
      ctx.fillRect(x + vn, y - 5, 1, drop3)             // vines over the lintel
      ctx.fillStyle = pal.decorLit
      ctx.fillRect(x + vn - 1, y - 5 + drop3, 2, 1)     // a leaf on the end
      ctx.fillStyle = pal.decor
    }
    break

  case "Spaceship":
    // An airlock: a bolted collar, hazard striping, and a lamp above it.
    ctx.fillStyle = pal.rig
    ctx.fillRect(x - 5, y - 6, ww + 10, 4)
    ctx.fillRect(x - 5, y - 2, 5, hh + 2)
    ctx.fillRect(x + ww, y - 2, 5, hh + 2)
    ctx.fillStyle = pal.warn
    for (var hs = 0; hs < ww + 10; hs += 6) ctx.fillRect(x - 5 + hs, y - 6, 3, 4)
    ctx.fillStyle = pal.rigDark
    for (var bo = 0; bo < hh; bo += 5) {
      ctx.fillRect(x - 3, y + bo, 2, 2)
      ctx.fillRect(x + ww + 1, y + bo, 2, 2)
    }
    ctx.fillStyle = pal.decorLit
    ctx.fillRect(cx3 - 2, y - 9, 4, 2)                  // lamp over the door
    break

  case "Factory":
    // A roller shutter in a bolted frame, with the slats drawn in above the
    // opening as though it has been wound up and is waiting to come down.
    ctx.fillStyle = pal.rig
    ctx.fillRect(x - 5, y - 8, ww + 10, 3)                  // the header box
    ctx.fillRect(x - 4, y - 5, 3, hh + 5)
    ctx.fillRect(x + ww + 1, y - 5, 3, hh + 5)
    ctx.fillStyle = pal.rigDark
    for (var sl2 = 0; sl2 < 4; sl2++)                       // rolled-up slats
      ctx.fillRect(x - 2, y - 7 + sl2 * 2, ww + 4, 1)
    ctx.fillStyle = pal.warn
    ctx.fillRect(x - 4, y - 5, 3, 3)                        // the two lamps
    ctx.fillRect(x + ww + 1, y - 5, 3, 3)
    break

  case "Skyscraper":
    // A lobby door: a polished surround, a canopy over it, and the floor
    // indicator above that with one segment lit — the only sign in the
    // building that says which way is out rather than which way is up.
    ctx.fillStyle = pal.rig
    ctx.fillRect(x - 6, y - 5, ww + 12, 3)                  // the canopy
    ctx.fillRect(x - 3, y - 2, 3, hh + 2)                   // jambs
    ctx.fillRect(x + ww, y - 2, 3, hh + 2)
    ctx.fillStyle = pal.rigDark
    ctx.fillRect(x - 6, y - 2, ww + 12, 1)                  // its underside
    ctx.fillStyle = pal.exitFrame
    ctx.fillRect(cx3 - 9, y - 11, 18, 5)                    // the indicator
    ctx.fillStyle = pal.rigDark
    for (var fl2 = 0; fl2 < 4; fl2++) ctx.fillRect(cx3 - 7 + fl2 * 4, y - 10, 3, 3)
    ctx.fillStyle = pal.exitLight
    ctx.fillRect(cx3 - 7, y - 10, 3, 3)                     // lobby
    break

  default:
    // Cavern: the original stepped lintel, two courses, the upper one wider.
    ctx.fillRect(x - 4, y - 6, ww + 8, 3)
    ctx.fillRect(x - 2, y - 3, ww + 4, 3)
    ctx.fillRect(x - 2, y - 3, 2, hh + 3)
    ctx.fillRect(x + ww, y - 3, 2, hh + 3)
  }
}

// Static material detail, all on the half-pixel grid and inside the existing
// frame. The panel's res-1 pass never enters this table; the lit mouth and its
// animated shimmer stay in their own passes.
var EXIT_FINE = {
  "Cavern": drawExitCavernFine,
  "Ruins": drawExitRuinsFine,
  "Frost": drawExitFrostFine,
  "Foundry": drawExitFoundryFine,
  "Jungle": drawExitJungleFine,
  "Ice Cave": drawExitIceFine,
  "Spaceship": drawExitSpaceshipFine,
  "Factory": drawExitFactoryFine,
  "Skyscraper": drawExitSkyscraperFine,
  "Trench": drawExitTrenchFine,
  "Desert": drawExitDesertFine,
  "Data Center": drawExitDataFine,
  "Library": drawExitLibraryFine,
  "Mail Room": drawExitMailFine,
  "Building Site": drawExitSiteFine, "Clock Tower": drawExitClockFine
}

function drawExitFrameFine(ctx, w, pal, x, y, ww, hh) {
  if ((w.res || 1) >= 2) (EXIT_FINE[w.biome] || EXIT_FINE.Cavern)(ctx, pal, x, y, ww, hh)
}

function drawExitCavernFine(ctx, pal, x, y, ww, hh) {
  ctx.fillStyle = pal.steelEdge
  ctx.fillRect(x - 3.5, y - 5.5, ww + 7, 0.5)           // worn course edges
  ctx.fillRect(x - 1.5, y - 2.5, ww + 3, 0.5)
  ctx.fillRect(x - 1.5, y, 0.5, hh)
  ctx.fillStyle = pal.rigDark
  for (var c = 2; c < ww; c += 6) ctx.fillRect(x + c, y - 5, 0.5, 2)
  for (var r = 3; r < hh - 2; r += 5) {
    ctx.fillRect(x - 2, y + r, 2, 0.5)
    ctx.fillRect(x + ww, y + r + 2, 2, 0.5)
  }
  ctx.fillRect(x + ww - 4, y - 2, 0.5, 1)
  ctx.fillRect(x + ww - 4.5, y - 1, 0.5, 1)            // a stepped hairline crack
}

function drawExitRuinsFine(ctx, pal, x, y, ww, hh) {
  ctx.fillStyle = pal.steelEdge
  ctx.fillRect(x - 4.5, y - 6.5, ww + 9, 0.5)
  ctx.fillRect(x + ww / 2 - 5.5, y - 9.5, 2, 0.5)
  ctx.fillRect(x - 3.5, y - 3.5, 0.5, hh + 3.5)
  ctx.fillRect(x + ww + 1.5, y - 3.5, 0.5, hh - 2.5)
  ctx.fillStyle = pal.rigDark
  ctx.fillRect(x - 2, y - 2, 0.5, hh + 2)              // fluted columns
  ctx.fillRect(x + ww + 3, y - 2, 0.5, hh - 4)
  ctx.fillRect(x - 4, y + hh - 3, 3, 0.5)
  ctx.fillRect(x + ww + 1, y + hh - 6.5, 3, 0.5)       // fractured stump
  ctx.fillRect(x + 5, y - 6, 0.5, 1)
  ctx.fillRect(x + 5.5, y - 5, 2, 0.5)
  ctx.fillRect(x + 7, y - 4.5, 0.5, 0.5)
}

function drawExitFrostFine(ctx, pal, x, y, ww, hh) {
  ctx.fillStyle = pal.steelEdge
  ctx.fillRect(x - 2.5, y - 4.5, ww + 5, 0.5)
  ctx.fillRect(x - 2.5, y - 1.5, 0.5, hh + 1.5)
  ctx.fillRect(x + ww + 1.5, y - 1.5, 0.5, hh + 1.5)
  for (var i = 0; i < ww; i += 4) {
    var h = 2 + ((i / 4) % 3)
    ctx.fillStyle = pal.exitLight
    ctx.fillRect(x + i, y - 2, 0.5, h)
    ctx.fillStyle = pal.decorDim
    ctx.fillRect(x + i + 1.5, y - 2, 0.5, 2)           // translucent ice's dark edge
  }
  ctx.fillStyle = pal.exitLight
  ctx.fillRect(x - 1, y - 4, 1, 0.5)
  ctx.fillRect(x + ww - 3, y - 3.5, 0.5, 0.5)
}

function drawExitFoundryFine(ctx, pal, x, y, ww, hh) {
  ctx.fillStyle = pal.steelEdge
  ctx.fillRect(x - 4.5, y - 5.5, ww + 9, 0.5)
  ctx.fillRect(x - 3.5, y - 1.5, 0.5, hh + 1.5)
  ctx.fillRect(x + ww + 0.5, y - 1.5, 0.5, hh + 1.5)
  for (var r = 0; r < ww + 8; r += 5) {
    ctx.fillRect(x - 3.5 + r, y - 4.5, 1, 0.5)        // rivet crowns
    ctx.fillRect(x - 3.5 + r, y - 4, 0.5, 0.5)
  }
  ctx.fillStyle = pal.rigDark
  for (var j = 3; j < hh; j += 6) {
    ctx.fillRect(x - 3, y + j, 2, 0.5)               // welded plate joints
    ctx.fillRect(x + ww + 1, y + j, 2, 0.5)
  }
  ctx.fillRect(x + 4, y - 2.5, ww - 8, 0.5)
}

function drawExitJungleFine(ctx, pal, x, y, ww, hh) {
  ctx.fillStyle = pal.rigDark
  ctx.fillRect(x - 2, y + 4, 0.5, 3)
  ctx.fillRect(x - 2.5, y + 7, 0.5, 2)               // cracked stone under vines
  ctx.fillRect(x + ww + 1, y + hh - 5, 2, 0.5)
  for (var v = -4; v < ww + 4; v += 3) {
    var drop = 3 + ((v + 12) % 4) * 2
    ctx.fillStyle = pal.decorLit
    ctx.fillRect(x + v, y - 4.5, 0.5, drop - 0.5)    // vine edge
    ctx.fillStyle = pal.decorDim
    ctx.fillRect(x + v - 0.5, y - 5 + drop, 1.5, 0.5) // leaf vein
    ctx.fillStyle = pal.steelEdge
    ctx.fillRect(x + v - 1, y - 4.5 + drop, 0.5, 0.5) // leaf tip
  }
}

function drawExitIceFine(ctx, pal, x, y, ww, hh) {
  ctx.fillStyle = pal.steelEdge
  ctx.fillRect(x - 4.5, y - 6.5, ww + 9, 0.5)
  ctx.fillRect(x - 4.5, y - 6, 0.5, hh + 6)
  ctx.fillRect(x + ww + 1.5, y - 1.5, 0.5, hh + 1.5)
  ctx.fillStyle = pal.decorDim
  for (var f = 0; f < ww; f += 6) {
    ctx.fillRect(x + f, y - 6, 0.5, 1)
    ctx.fillRect(x + f + 0.5, y - 5, 1, 0.5)         // angular facets in the arch
  }
  for (var i = 0; i < ww + 6; i += 3) {
    ctx.fillStyle = pal.exitLight
    ctx.fillRect(x - 3 + i, y - 2, 0.5, 1 + ((i / 3) % 4))
    ctx.fillStyle = pal.decorDim
    ctx.fillRect(x - 1.5 + i, y - 2, 0.5, 2 + ((i / 3) % 4))
  }
  ctx.fillStyle = pal.exitLight
  ctx.fillRect(x - 3.5, y + 5, 0.5, 1.5)
  ctx.fillRect(x + ww + 3, y + 11, 1, 0.5)
}

function drawExitSpaceshipFine(ctx, pal, x, y, ww, hh) {
  ctx.fillStyle = pal.steelEdge
  ctx.fillRect(x - 4.5, y - 5.5, ww + 9, 0.5)
  ctx.fillRect(x - 0.5, y - 1.5, 0.5, hh + 1.5)      // machined inner collar
  ctx.fillRect(x + ww, y - 1.5, 0.5, hh + 1.5)
  for (var b = 0; b < hh; b += 5) {
    ctx.fillRect(x - 2.5, y + b + 0.5, 1, 0.5)       // slotted bolt heads
    ctx.fillRect(x + ww + 1.5, y + b + 0.5, 1, 0.5)
  }
  ctx.fillStyle = pal.rigDark
  ctx.fillRect(x - 4.5, y + 3, 0.5, hh - 3)
  ctx.fillRect(x + ww + 4, y + 3, 0.5, hh - 3)
  ctx.fillStyle = pal.exitLight
  ctx.fillRect(x + ww / 2 - 1.5, y - 8.5, 3, 0.5)
}

function drawExitFactoryFine(ctx, pal, x, y, ww, hh) {
  ctx.fillStyle = pal.steelEdge
  ctx.fillRect(x - 4.5, y - 7.5, ww + 9, 0.5)
  for (var s = 0; s < 4; s++) ctx.fillRect(x - 1.5, y - 6.5 + s * 2, ww + 3, 0.5)
  ctx.fillRect(x - 3.5, y - 2, 0.5, hh + 2)
  ctx.fillRect(x + ww + 1.5, y - 2, 0.5, hh + 2)
  ctx.fillStyle = pal.rigDark
  for (var b = 3; b < hh; b += 6) {
    ctx.fillRect(x - 2.5, y + b, 0.5, 0.5)          // guide-rail screws
    ctx.fillRect(x + ww + 2.5, y + b, 0.5, 0.5)
  }
  ctx.fillRect(x - 3.5, y - 4.5, 2, 2)             // inset lamp lenses
  ctx.fillRect(x + ww + 1.5, y - 4.5, 2, 2)
  ctx.fillStyle = pal.warn
  ctx.fillRect(x - 3, y - 4, 1, 1)
  ctx.fillRect(x + ww + 2, y - 4, 1, 1)
}

function drawExitSkyscraperFine(ctx, pal, x, y, ww, hh) {
  var cx = x + ww / 2
  ctx.fillStyle = pal.steelEdge
  ctx.fillRect(x - 5.5, y - 4.5, ww + 11, 0.5)       // polished canopy and jambs
  ctx.fillRect(x - 2.5, y - 1, 0.5, hh + 1)
  ctx.fillRect(x + ww + 0.5, y - 1, 0.5, hh + 1)
  ctx.fillRect(cx - 8.5, y - 10.5, 17, 0.5)
  ctx.fillStyle = pal.rigDark
  ctx.fillRect(x - 1, y, 0.5, hh)
  ctx.fillRect(x + ww + 2, y, 0.5, hh)
  ctx.fillStyle = pal.exitFrame
  for (var f = 0; f < 4; f++) ctx.fillRect(cx - 6.5 + f * 4, y - 7.5, 2, 0.5)
  ctx.fillStyle = pal.steelEdge
  ctx.fillRect(cx - 6.5, y - 9.5, 0.5, 1.5)          // glint in the lit lobby segment
}

function drawExitTrenchFine(ctx, pal, x, y, ww, hh) {
  ctx.fillStyle = pal.decorLit
  ctx.fillRect(x - 3.5, y - 5.5, ww + 7, 0.5)        // wet upper edge
  ctx.fillRect(x - 1.5, y - 2.5, 0.5, hh + 2.5)
  ctx.fillRect(x + ww + 0.5, y - 2.5, 0.5, hh + 2.5)
  ctx.fillStyle = pal.rigDark
  ctx.fillRect(x - 1, y, 0.5, hh)
  ctx.fillRect(x + ww + 1.5, y, 0.5, hh)
  for (var p = 0; p < ww; p += 4) {
    ctx.fillRect(x + p + 0.5, y - 4.5, 1, 0.5)       // salt pits in the lintel
    ctx.fillStyle = pal.decorDim
    ctx.fillRect(x + p + 1, y - 4, 0.5, 0.5)
    ctx.fillStyle = pal.rigDark
  }
  ctx.fillStyle = pal.decorDim
  for (var r = 3; r < hh; r += 5) {
    ctx.fillRect(x - 1.5, y + r, 1, 0.5)              // marine deposits on the jambs
    ctx.fillRect(x + ww + 0.5, y + r + 1, 1, 0.5)
  }
}

function drawExitDesertFine(ctx, pal, x, y, ww, hh) {
  var cx = x + ww / 2
  ctx.fillStyle = pal.steelEdge
  ctx.fillRect(x - 5.5, y - 6.5, ww + 11, 0.5)
  ctx.fillStyle = pal.rigDark
  ctx.fillRect(x - 4, y - 3, 0.5, 6)                 // carved reed and crossbar glyphs
  ctx.fillRect(x - 4, y + 1, 2, 0.5)
  ctx.fillRect(x + ww + 3, y - 3, 0.5, 6)
  ctx.fillRect(x + ww + 2, y - 1, 2, 0.5)
  ctx.fillRect(x - 5, y + hh - 5, 2.5, 0.5)          // eroded joints near the foot
  ctx.fillRect(x + ww + 2.5, y + hh - 8, 2.5, 0.5)
  ctx.fillRect(cx - 1, y - 10, 3, 0.5)               // recessed sun disc
  ctx.fillRect(cx + 1.5, y - 9.5, 0.5, 1.5)
  ctx.fillStyle = pal.steelEdge
  ctx.fillRect(cx - 1.5, y - 10.5, 2.5, 0.5)
  ctx.fillRect(cx - 2.5, y - 9.5, 0.5, 1)
}

function drawExitDataFine(ctx, pal, x, y, ww, hh) {
  ctx.fillStyle = pal.steelEdge
  ctx.fillRect(x - 3.5, y - 5.5, ww + 7, 0.5)
  ctx.fillRect(x - 3.5, y - 1.5, 0.5, hh + 1.5)
  ctx.fillRect(x + ww + 1.5, y - 1.5, 0.5, hh / 2 - 0.5)
  ctx.fillStyle = pal.rigDark
  for (var v = 1; v < ww; v += 3) ctx.fillRect(x + v, y - 3.5, 1.5, 0.5) // rack vents
  ctx.fillRect(x - 2, y + 2, 0.5, hh - 2)             // brushed frame seam
  ctx.fillStyle = pal.exitLight
  for (var l = 0; l < ww + 4; l += 3) ctx.fillRect(x - 2 + l, y - 5, 0.5, 0.5)
  ctx.fillStyle = pal.exitFrame
  ctx.fillRect(x + ww + 1.5, y + hh / 2 - 1.5, 2, 0.5) // badge-reader slot
  ctx.fillStyle = pal.decorLit
  ctx.fillRect(x + ww + 2, y + hh / 2 + 0.5, 0.5, 0.5)
}

// ---------------------------------------------------------------------------
// Actor layer
// ---------------------------------------------------------------------------

// Factory fittings, drawn on the per-tick layer rather than with the rest of
// the decor. drawDecor runs inside drawTerrain, which only repaints when the
// terrain changes — a cog painted there is a cog that never turns and smoke
// that never rises, which is most of what this biome is supposed to be. They
// go in first so the machinery sits behind the agents working in front of it.
// Everything in the Trench that moves and is not an agent. Called from
// drawMachines, which is on the per-tick actor pass — drawDecor is not, because
// it lives inside drawTerrain and only repaints when the terrain changes, and a
// fish that only moves when somebody bashes a wall is not a fish.
//
// None of this is simulated. There is no `w.fish`: every position here is a
// pure function of w.ticks and the level number, so the shoals cost the
// simulation nothing, can never drift out of step between two hosts, and
// cannot possibly affect a clear rate. That is the right trade for scenery —
// the moment scenery has state, it has bugs.
function drawWaterLife(ctx, w, pal) {
  if (w.biome !== "Trench") return
  var k = w.k
  var C = k.CELL
  var wide = k.COLS * C
  var tall = k.ROWS * C
  var t = w.ticks

  // Marine snow: the constant slow fall of detritus that makes deep water
  // read as water rather than as a blue room. Drawn first and dimmest.
  var seed = (w.level * 40503) % 65536
  var next = function () { seed = (seed * 1103515245 + 12345) % 2147483648; return seed >> 6 }
  ctx.fillStyle = pal.bubble
  ctx.globalAlpha = 0.22
  for (var m = 0; m < 90; m++) {
    var mx = next() % wide
    var speed = 0.12 + (next() % 60) / 400
    var my = ((next() % tall) + t * speed) % tall
    // A sway, so it drifts rather than drops.
    mx += Math.sin((t * 0.01) + m) * 3
    if ((w.res || 1) >= 2) AMBIENCE_FINE[w.biome](ctx, w, pal, Math.round(mx * 2) / 2, Math.round(my * 2) / 2)
    else ctx.fillRect(Math.round(mx), Math.round(my), 1, 1)
  }
  ctx.globalAlpha = 1

  // Shoals. Each is a loop of fish crossing the board on its own line, turning
  // at the edges — a school reads as a school because the members hold station
  // on each other, so the offsets inside one are fixed and only the shoal
  // moves. Three of them, at different depths and speeds.
  for (var sc = 0; sc < 3; sc++) {
    var lane = (k.SKY + 4) * C + ((next() % Math.max(1, tall - (k.SKY + 8) * C)))
    var rate = 0.5 + sc * 0.28
    var period = wide * 2
    var travel = (t * rate + sc * 400) % period
    // Out and back: past the halfway mark the shoal is returning, and it faces
    // the way it is going.
    var goingRight = travel < wide
    var headX = goingRight ? travel : period - travel
    var members = 5 + sc * 2
    for (var f = 0; f < members; f++) {
      // Station-keeping: each fish sits a fixed distance back and to one side
      // of the leader, with a small tail-beat of its own.
      var back = (f % 4) * 9 + 4
      var side = ((f * 37) % 13) - 6
      var fx = headX - (goingRight ? back : -back)
      var fy = lane + side + Math.sin(t * 0.08 + f * 1.7) * 2
      if (fx < -8 || fx > wide + 8) continue
      // The body is three pixels and the tail is one, which at this size is
      // the whole animal. The tail alternates so the shoal shimmers.
      var beat = Math.floor(t * 0.2 + f) % 2 === 0
      ctx.fillStyle = beat ? pal.fishLit : pal.fish
      ctx.fillRect(Math.round(fx), Math.round(fy), 3, 2)
      ctx.fillRect(Math.round(fx + (goingRight ? -2 : 3)), Math.round(fy + (beat ? -1 : 1)), 2, 1)
    }
  }
}

// ---------------------------------------------------------------------------
// Ambience
// ---------------------------------------------------------------------------
//
// Air that moves: dust, snow, embers, leaves, fireflies, glints. The same rules
// as the Trench's water life — no state, every mote a pure function of
// `w.ticks` and its index, so it costs the simulation nothing and two hosts
// cannot disagree about it. A mote inside solid ground is skipped rather than
// drawn over it: weather happens in the air, and snow falling through rock
// reads as a rendering bug. One row per biome in AMBIENCE; a field is a count
// and a motion, never code.
//
//   n      motes          vx, vy  drift, px per tick     sway  side-to-side px
//   size   px square      col     palette key            alpha
//   blink  >0: lit only for that share of a cycle (fireflies, glints)

var AMBIENCE = {
  "Clock Tower": [{ n: 52, vx: 0.018, vy: 0.04, sway: 2, size: 1, col: "dust", alpha: 0.38 },
                  { n: 4, vx: 0.015, vy: 0.35, sway: 1, size: 2, col: "oreEdge", alpha: 0.55 }],
  "Building Site": [{ n: 48, vx: 0.07, vy: 0.09, sway: 2, size: 1, col: "dust", alpha: 0.34 }],
  "Mail Room": [{ n: 26, vx: 0.12, vy: 0.08, sway: 5, size: 2, col: "oreEdge", alpha: 0.55 },
                { n: 16, vx: -0.08, vy: 0.06, sway: 3, size: 1, col: "urgent", alpha: 0.65 }],
  "Library":  [{ n: 36, vx: 0.015, vy: 0.025, sway: 2, size: 1, col: "dust", alpha: 0.24 }],
  "Cavern":   [{ n: 26, vx: 0.02, vy: 0.05, sway: 2, size: 1, col: "dust", alpha: 0.30 }],
  "Ruins":    [{ n: 30, vx: 0.06, vy: 0.04, sway: 3, size: 1, col: "dust", alpha: 0.28 }],
  "Frost":    [{ n: 70, vx: 0.18, vy: 0.32, sway: 4, size: 1, col: "dust", alpha: 0.65 },
               { n: 14, vx: 0.24, vy: 0.45, sway: 5, size: 2, col: "dust", alpha: 0.45 }],
  "Foundry":  [{ n: 30, vx: 0.03, vy: -0.22, sway: 3, size: 1, col: "fire", alpha: 0.85, blink: 0.7 },
               { n: 10, vx: 0.05, vy: -0.30, sway: 4, size: 1, col: "fireHot", alpha: 0.9, blink: 0.4 }],
  "Jungle":   [{ n: 12, vx: 0.10, vy: 0.16, sway: 6, size: 2, col: "decor", alpha: 0.70 },
               { n: 18, vx: 0.04, vy: -0.02, sway: 5, size: 1, col: "decorLit", alpha: 0.95, blink: 0.35 }],
  "Ice Cave": [{ n: 22, vx: 0, vy: 0, sway: 0, size: 1, col: "dust", alpha: 0.9, blink: 0.12 },
               { n: 24, vx: 0.03, vy: 0.08, sway: 2, size: 1, col: "dust", alpha: 0.30 }],
  "Spaceship":[{ n: 16, vx: 0.05, vy: 0.01, sway: 2, size: 1, col: "dust", alpha: 0.25 }],
  "Factory":  [{ n: 24, vx: 0.08, vy: -0.03, sway: 3, size: 1, col: "dust", alpha: 0.22 }],
  // Sand on the wind: fast, nearly flat, and a few grains big enough to see.
  // Cold air off the floor vents: a slow upward drift of dust in the aisles.
  "Data Center": [{ n: 22, vx: 0.01, vy: -0.10, sway: 1, size: 1, col: "dust", alpha: 0.22 }],
  "Desert":   [{ n: 50, vx: 0.55, vy: 0.03, sway: 1, size: 1, col: "decorLit", alpha: 0.45 },
               { n: 8, vx: 0.40, vy: 0.05, sway: 2, size: 2, col: "decor", alpha: 0.35 }]
}

function drawAmbience(ctx, w, pal) {
  if (w.biome === "Library") drawLibraryLamplight(ctx, w, pal)
  if (w.wind) drawGust(ctx, w, pal)
  var fields = AMBIENCE[w.biome] || ((w.res || 1) >= 2 && AMBIENCE_FINE_ONLY[w.biome])
  if (!fields) return
  var fineOnly = !AMBIENCE[w.biome]
  if (fineOnly) ctx.save()
  for (var f = 0; f < fields.length; f++) drawMotes(ctx, w, pal, fields[f], f)
  ctx.globalAlpha = 1
  if (fineOnly) ctx.restore()
}

// A gust in the Desert (see `windAt` in Sim.js): streaks of sand down every
// open corridor, more and longer the harder it blows, travelling the way it
// blows. The wind slows and carries the colony, and a force nobody can see is
// a force the audience reads as agents dawdling for no reason.
function drawGust(ctx, w, pal) {
  var k = w.k, C = k.CELL, wide = k.COLS * C
  var top = k.SKY * C, tall = k.ROWS * C - top
  var force = Math.abs(w.wind), sign = w.wind > 0 ? 1 : -1
  var seed = (w.level * 7121) % 65536
  var next = function () { seed = (seed * 1103515245 + 12345) % 2147483648; return (seed >> 6) / 33554432 }
  ctx.save()
  for (var i = 0; i < Math.round(100 * force); i++) {
    var x0 = next() * wide, y0 = top + next() * tall, pace = 1.2 + next() * 1.6
    var x = Math.floor(((x0 + sign * w.ticks * pace) % wide + wide) % wide)
    var y = Math.floor(y0 + Math.sin(w.ticks * 0.045 + i) * 2)
    drawSandStreak(ctx, w, pal, x, y, sign, 3 + Math.round(force * 5), force, i)
  }
  ctx.restore()
}

// Clip every grain, including the tail: no sand streak drawn through a wall.
function drawSandStreak(ctx, w, pal, x, y, sign, len, force, seed) {
  for (var j = 0; j < len; j++) {
    var px = x - sign * j, py = y + Math.floor(j / 4) * (seed % 2 ? 1 : -1)
    if (!mechanismAir(w, px, py)) continue
    ctx.fillStyle = j === 0 ? pal.decorLit : pal.dust
    ctx.globalAlpha = (0.25 + force * 0.45) * (1 - j / len)
    ctx.fillRect(px, py, 1, 1)
    if ((w.res || 1) >= 2 && j === 0 && mechanismAir(w, px, py - 0.5)) ctx.fillRect(px, py - 0.5, 0.5, 0.5)
  }
}

function mechanismAir(w, x, y) {
  var k = w.k, cx = Math.floor(x / k.CELL), cy = Math.floor(y / k.CELL)
  return cx >= 0 && cx < k.COLS && cy >= 0 && cy < k.ROWS && w.terrain[cy * k.COLS + cx] === k.EMPTY
}

function drawMotes(ctx, w, pal, spec, salt) {
  var k = w.k, C = k.CELL
  var wide = k.COLS * C, top = k.SKY * C, tall = k.ROWS * C - top
  var t = w.ticks
  var seed = (w.level * 40503 + salt * 7919) % 65536
  var next = function () { seed = (seed * 1103515245 + 12345) % 2147483648; return (seed >> 6) / 33554432 }
  ctx.fillStyle = pal[spec.col]
  for (var i = 0; i < spec.n; i++) {
    var x0 = next() * wide, y0 = next() * tall, pace = 0.6 + next() * 0.8, phase = next() * 100
    if (spec.blink && ((t * 0.02 * pace + phase) % 1) > spec.blink) continue
    var x = ((x0 + t * spec.vx * pace + Math.sin(t * 0.015 * pace + phase) * spec.sway) % wide + wide) % wide
    var y = ((y0 + t * spec.vy * pace) % tall + tall) % tall + top
    var px = Math.floor(x), py = Math.floor(y)
    if (w.terrain[Math.floor(py / C) * k.COLS + Math.floor(px / C)] !== k.EMPTY) continue
    ctx.globalAlpha = spec.alpha
    if ((w.res || 1) >= 2) AMBIENCE_FINE[w.biome](ctx, w, pal, Math.floor(x * 2) / 2, Math.floor(y * 2) / 2, spec, i)
    else if (w.biome === "Mail Room") drawMailMote(ctx, w, pal, px, py, spec)
    else ctx.fillRect(px, py, spec.size, spec.size)
  }
}

// Shapes replace the squares only at res 2, on the same drift/blink recipe.
// The small core is always inside the old particle's size; no glowing halo.
var AMBIENCE_FINE_ONLY = {
  "Skyscraper": [{ n: 20, vx: 0.02, vy: 0.04, sway: 1, size: 1, col: "dust", alpha: 0.22 }]
}
var AMBIENCE_FINE = {
  "Cavern": drawMoteCavernFine, "Ruins": drawMoteRuinsFine, "Frost": drawMoteFrostFine,
  "Foundry": drawMoteFoundryFine, "Jungle": drawMoteJungleFine, "Ice Cave": drawMoteIceFine,
  "Spaceship": drawMoteSpaceshipFine, "Factory": drawMoteFactoryFine,
  "Skyscraper": drawMoteSkyscraperFine, "Trench": drawMoteTrenchFine,
  "Desert": drawMoteDesertFine, "Data Center": drawMoteDataFine, "Library": drawMoteLibraryFine, "Mail Room": drawMoteMailFine,
  "Building Site": drawMoteSiteFine, "Clock Tower": drawMoteClockFine
}

// Check the complete half-pixel footprint: the motion can put a corner into
// the next cell even when the particle's anchor is still in open air.
function moteFineRect(ctx, w, x, y, width, height) {
  var k = w.k, C = k.CELL
  for (var yy = Math.floor(y / C); yy <= Math.floor((y + height - 0.5) / C); yy++)
    for (var xx = Math.floor(x / C); xx <= Math.floor((x + width - 0.5) / C); xx++) {
      if (xx < 0 || yy < 0 || xx >= k.COLS || yy >= k.ROWS || w.terrain[yy * k.COLS + xx] !== k.EMPTY) return
    }
  ctx.fillRect(x, y, width, height)
}

function drawMoteCavernFine(ctx, w, pal, x, y) {
  moteFineRect(ctx, w, x, y, 1, 0.5) // a flake of dust with a heavy corner
  moteFineRect(ctx, w, x + 0.5, y + 0.5, 0.5, 0.5)
}

function drawMoteRuinsFine(ctx, w, pal, x, y) {
  moteFineRect(ctx, w, x, y, 0.5, 1) // chipped stone dust
  moteFineRect(ctx, w, x + 0.5, y, 0.5, 0.5)
}

function drawMoteFrostFine(ctx, w, pal, x, y, spec) {
  var half = (spec.size - 0.5) / 2
  // Three-pixel flakes at size 1; crossed arms on the larger flakes.
  var arm = Math.floor(half * 2) / 2
  moteFineRect(ctx, w, x + arm, y, 0.5, spec.size)
  moteFineRect(ctx, w, x, y + arm, spec.size, 0.5)
}

function drawMoteFoundryFine(ctx, w, pal, x, y, spec) {
  ctx.fillStyle = pal.fire
  moteFineRect(ctx, w, x, y, 0.5, 1) // rising ember's cooler tip
  ctx.fillStyle = pal[spec.col]
  moteFineRect(ctx, w, x + 0.5, y + 0.5, 0.5, 0.5)
  ctx.fillStyle = pal.fireHot
  moteFineRect(ctx, w, x, y + 0.5, 0.5, 0.5) // hot core
  ctx.fillStyle = pal[spec.col]
}

function drawMoteJungleFine(ctx, w, pal, x, y, spec, i) {
  if (spec.size === 1) {
    moteFineRect(ctx, w, x, y + 0.5, 1, 0.5) // firefly wings
    moteFineRect(ctx, w, x + 0.5, y, 0.5, 0.5)
    return
  }
  var curl = Math.floor(w.ticks / 12 + i) % 2 * 0.5
  moteFineRect(ctx, w, x + curl, y, 1.5 - curl, 0.5)
  moteFineRect(ctx, w, x + 0.5, y + 0.5, 1, 1)
  ctx.fillStyle = pal.decorDim
  moteFineRect(ctx, w, x + 1, y + 0.5, 0.5, 1.5) // vein and stem
  ctx.fillStyle = pal[spec.col]
}

function drawMoteIceFine(ctx, w, pal, x, y, spec) {
  if (spec.blink) {
    moteFineRect(ctx, w, x, y + 0.5, 1, 0.5) // tiny asymmetric glint
    moteFineRect(ctx, w, x + 0.5, y, 0.5, 0.5)
  } else moteFineRect(ctx, w, x, y, 0.5, 1) // drifting ice splinter
}

function drawMoteSpaceshipFine(ctx, w, pal, x, y) {
  moteFineRect(ctx, w, x, y, 0.5, 0.5) // weightless fleck, faint trailing corner
  moteFineRect(ctx, w, x + 0.5, y + 0.5, 0.5, 0.5)
}

function drawMoteFactoryFine(ctx, w, pal, x, y) {
  moteFineRect(ctx, w, x, y + 0.5, 1, 0.5) // flat soot flake
  moteFineRect(ctx, w, x + 0.5, y, 0.5, 0.5)
}

function drawMoteSkyscraperFine(ctx, w, pal, x, y) {
  moteFineRect(ctx, w, x, y, 0.5, 1) // quiet indoor dust
}

function drawMoteTrenchFine(ctx, w, pal, x, y) {
  moteFineRect(ctx, w, x, y, 0.5, 1) // irregular marine snow
  moteFineRect(ctx, w, x + 0.5, y + 0.5, 0.5, 0.5)
}

function drawMoteDesertFine(ctx, w, pal, x, y, spec) {
  moteFineRect(ctx, w, x, y + 0.5, spec.size, 0.5) // wind-polished grain
  moteFineRect(ctx, w, x + 0.5, y, 0.5, 0.5)
}

function drawMoteDataFine(ctx, w, pal, x, y) {
  moteFineRect(ctx, w, x, y, 0.5, 1) // cool vent dust, light across one corner
  moteFineRect(ctx, w, x + 0.5, y, 0.5, 0.5)
}

// Status lights on every rack face in the Data Center: one in five rack cells
// that face the open air carries a light, which blinks on a phase of its own
// and now and then goes amber. A pure function of the tick and the cell, so
// it costs nothing to keep and cannot drift between hosts; on the actor pass
// because it moves (see the drawDecor note in AGENTS.md).
function drawRackLights(ctx, w) {
  var k = w.k, C = k.CELL, T = w.terrain, cols = k.COLS
  for (var y = k.SKY; y < k.ROWS - 1; y++) for (var x = 1; x < cols - 1; x++) {
    var i = y * cols + x
    if (T[i] !== k.ORE || (T[i - 1] !== k.EMPTY && T[i + 1] !== k.EMPTY)) continue
    var h = ((x * 73856093) ^ (y * 19349663)) >>> 0
    if (h % 5) continue
    var on = Math.floor((w.ticks + (h >> 4) % 97) / (12 + (h >> 9) % 20)) % 3
    if (on === 0) continue
    ctx.fillStyle = (h >> 13) % 7 === 0 ? "#ffb13b" : "#5dffa0"
    var lx = T[i - 1] === k.EMPTY ? x * C : x * C + C - 1
    drawLightPool(ctx, w, ctx.fillStyle, lx + 0.5, y * C + 1.5 + (h >> 6) % 2, 5, 4, 0.08)
    ctx.fillRect(lx, y * C + 1 + (h >> 6) % 2, 1, 1)
  }
}

// The Data Center's updrafts (Sim's `w.updraft`): pale streaks climbing each
// column of rising air, in open air only. A safe way down that the audience
// cannot see is a safe way down that looks like luck.
function drawUpdrafts(ctx, w, pal) {
  var k = w.k, C = k.CELL, top = k.SKY * C, tall = k.ROWS * C - top
  ctx.save()
  for (var x = 0; x < k.COLS; x++) {
    if (!w.updraft[x]) continue
    ctx.fillStyle = pal.dust
    ctx.globalAlpha = 0.04
    for (var cy = k.SKY; cy < k.ROWS; cy++)
      if (w.terrain[cy * k.COLS + x] === k.EMPTY) ctx.fillRect(x * C, cy * C, C, C)
    for (var s = 0; s < 10; s++) {
      var y = Math.floor(top + tall - ((w.ticks * 0.75 + s * tall / 10 + x * 13) % tall))
      drawDraftWisp(ctx, w, pal, x * C + 1 + s % 2, y, s)
    }
  }
  ctx.restore()
}

function drawDraftWisp(ctx, w, pal, x, y, seed) {
  var fine = (w.res || 1) >= 2, size = fine ? 0.5 : 1
  for (var j = 0; j < 5; j++) {
    var px = x + (j > 2 ? seed % 2 : 0), py = y + j
    if (!mechanismAir(w, px, py)) continue
    ctx.fillStyle = j === 0 ? pal.decorLit : pal.dust
    ctx.globalAlpha = 0.6 - j * 0.1
    ctx.fillRect(px, py, size, 1)
  }
  // A tiny opening curl at the leading end, rather than falling rain.
  if (mechanismAir(w, x - 1, y + 1)) ctx.fillRect(x - 1, y + 1, size, size)
}

// The Factory's conveyors (Sim's `w.belts`): a dark belt along the top of the
// floor with treads moving the way it carries, a drum at each end turning
// with it, and nothing where the floor under it is gone — the same test
// `beltUnder` makes, so what is drawn moving is what carries. On the actor
// pass because it moves.
var BELT_DRIFT = 0.56   // px per tick: the speed it adds to a walker, drawn
function drawBelts(ctx, w, pal) {
  var C = w.k.CELL, cols = w.k.COLS
  for (var i = 0; i < w.belts.length; i++) {
    var b = w.belts[i], top = (b.y + 1) * C
    var shift = Math.floor(w.ticks * BELT_DRIFT) * b.dir
    for (var x = b.x0; x < b.x1; x++) {
      if (w.terrain[(b.y + 1) * cols + x] === w.k.EMPTY) continue
      drawBeltTreads(ctx, w, pal, x * C, top, shift)
    }
    if (w.terrain[(b.y + 1) * cols + b.x0] !== w.k.EMPTY)
      drawBeltDrum(ctx, w, pal, b.x0 * C, top, -1, b.dir)
    if (w.terrain[(b.y + 1) * cols + b.x1 - 1] !== w.k.EMPTY)
      drawBeltDrum(ctx, w, pal, b.x1 * C, top, 1, b.dir)
  }
}

function drawBeltTreads(ctx, w, pal, x, top, shift) {
  ctx.fillStyle = pal.rigDark
  ctx.fillRect(x, top, w.k.CELL, 3)
  for (var j = 0; j < w.k.CELL; j++) {
    var phase = ((x + j - shift) % 4 + 4) % 4
    ctx.fillStyle = phase < 2 ? pal.steelShade : pal.decorLit
    ctx.fillRect(x + j, top, 1, 1)
    ctx.fillStyle = pal.decorDim
    if (phase === 3) ctx.fillRect(x + j, top + 1, 1, 1)
    // The return run moves the other way underneath the carrying surface.
    if (((x + j + shift) % 4 + 4) % 4 === 0) ctx.fillRect(x + j, top + 2, 1, 1)
  }
  if ((w.res || 1) >= 2) {
    ctx.fillStyle = pal.steelEdge
    ctx.fillRect(x, top, w.k.CELL, 0.5)
  }
}

// An end drum: a stubby round end with a spoke that turns with the belt.
function drawBeltDrum(ctx, w, pal, x, top, side, dir) {
  var cx = x + (side > 0 ? 0 : -3), cy = top + 1
  ctx.fillStyle = pal.rigDark
  ctx.fillRect(cx, top, 3, 3)
  ctx.fillRect(cx + 1, top - 1, 1, 5)
  ctx.fillStyle = pal.steelShade
  ctx.fillRect(cx, top, 3, 2)
  ctx.fillStyle = pal.steelEdge
  ctx.fillRect(cx, top, 2, 1)
  var a = w.ticks * BELT_DRIFT * (dir || 1)
  ctx.fillStyle = pal.rigDark
  ctx.fillRect(cx + 1 + Math.round(Math.sin(a)), cy - Math.round(Math.cos(a)), 1, 1)
  if ((w.res || 1) < 2) return
  ctx.fillStyle = pal.decorLit
  ctx.fillRect(cx + 0.5, top - 0.5, 1, 0.5)
  ctx.fillStyle = pal.rig
  ctx.fillRect(cx + 1, cy + 0.5, 0.5, 0.5)
}

function drawMachines(ctx, w, pal) {
  drawWaterLife(ctx, w, pal)
  if (w.biome === "Building Site") drawSiteMachines(ctx, w, pal)
  if (w.biome === "Clock Tower") drawClockMachines(ctx, w, pal)
  if (w.biome === "Data Center") drawRackLights(ctx, w)
  if (w.belts && w.belts.length) drawBelts(ctx, w, pal)
  if (w.updraft) drawUpdrafts(ctx, w, pal)
  drawAmbience(ctx, w, pal)
  if (w.biome !== "Factory") return
  var k = w.k
  var C = k.CELL
  for (var i = 0; i < w.decor.length; i++) {
    var d = w.decor[i]
    if (d.kind !== "cog" && d.kind !== "vent" && d.kind !== "gauge") continue
    var px = d.x * C
    var py = d.y * C

    // Factory fittings. The cog turns and the vent breathes on their own
    // clocks, because the one thing a machine room has to do is look like it
    // is running even on the stretches where nothing is trying to kill anybody.
    if (d.kind === "cog") {
      if (w.terrain[d.y * k.COLS + d.x] === k.EMPTY) continue
      var cr = 3 + d.size
      var ccx = px + cr, ccy = py + cr
      // Slow. A big wheel that whips round reads as a fan; the whole point of
      // a flywheel is mass, and mass is legible as unhurried.
      var spin = (w.ticks * 0.012 + d.seed) % (Math.PI * 2)

      // The bracket it hangs on, so the wheel belongs to the wall behind it
      // rather than floating in front of the level.
      ctx.fillStyle = pal.rigDark
      ctx.fillRect(ccx - 2, ccy - cr - 4, 4, cr + 4)
      ctx.fillRect(ccx - cr - 3, ccy - 2, 4, 4)
      ctx.fillRect(ccx + cr - 1, ccy - 2, 4, 4)

      // A thin bright rim with nothing inside it. The first version filled the
      // disc in a dim colour and it read as a mud ball: the wheel only works
      // if the background shows through between the spokes.
      ctx.fillStyle = pal.oreEdge
      for (var a3 = 0; a3 < 72; a3++) {
        var th3 = (a3 / 72) * Math.PI * 2
        ctx.fillRect(Math.round(ccx + Math.cos(th3) * cr), Math.round(ccy + Math.sin(th3) * cr), 2, 2)
      }
      // Teeth, clear of the rim and few enough to count as they go past.
      ctx.fillStyle = pal.ore
      for (var tk = 0; tk < 10; tk++) {
        var a2 = spin + tk * Math.PI / 5
        ctx.fillRect(Math.round(ccx + Math.cos(a2) * (cr + 3)) - 1,
                     Math.round(ccy + Math.sin(a2) * (cr + 3)) - 1, 3, 3)
      }
      // Four spokes, a rivet where each meets the rim, and a heavy hub.
      for (var spk = 0; spk < 4; spk++) {
        var sa2 = spin + spk * Math.PI / 2
        ctx.fillStyle = pal.ore
        for (var rr = 3; rr < cr; rr++)
          ctx.fillRect(Math.round(ccx + Math.cos(sa2) * rr), Math.round(ccy + Math.sin(sa2) * rr), 2, 2)
        ctx.fillStyle = pal.oreEdge
        ctx.fillRect(Math.round(ccx + Math.cos(sa2) * (cr - 1)) - 1,
                     Math.round(ccy + Math.sin(sa2) * (cr - 1)) - 1, 2, 2)
      }
      ctx.fillStyle = pal.rigDark
      ctx.fillRect(ccx - 3, ccy - 3, 6, 6)
      ctx.fillStyle = pal.oreEdge
      ctx.fillRect(ccx - 1, ccy - 1, 2, 2)
      continue
    }

    // A pressure gauge: a brass case, a pale face and a needle that wanders.
    // Ornament rather than repetition, and the one fitting in here that
    // implies somebody is supposed to be reading it.
    if (d.kind === "gauge") {
      if (w.terrain[d.y * k.COLS + d.x] === k.EMPTY) continue
      var gr = 4
      var gcx = px + gr, gcy = py + gr
      ctx.fillStyle = pal.rigDark
      ctx.fillRect(gcx - gr - 1, gcy - gr - 1, gr * 2 + 2, gr * 2 + 2)
      ctx.fillStyle = pal.decorLit
      ctx.fillRect(gcx - gr + 1, gcy - gr + 1, gr * 2 - 2, gr * 2 - 2)
      ctx.fillStyle = pal.rigDark
      ctx.fillRect(gcx - gr - 1, gcy - gr - 1, 2, 2)
      ctx.fillRect(gcx + gr - 1, gcy - gr - 1, 2, 2)
      ctx.fillRect(gcx - gr - 1, gcy + gr - 1, 2, 2)
      ctx.fillRect(gcx + gr - 1, gcy + gr - 1, 2, 2)
      // Mostly in the safe half, drifting toward the red now and then.
      var swing = Math.sin(w.ticks * 0.01 + d.seed) * 0.9 - 2.2
      ctx.fillStyle = pal.warn
      for (var nl = 1; nl <= gr - 1; nl++)
        ctx.fillRect(Math.round(gcx + Math.cos(swing) * nl), Math.round(gcy + Math.sin(swing) * nl), 1, 1)
      continue
    }

    if (d.kind === "vent") {
      if (w.terrain[(d.y + 1) * k.COLS + d.x] === k.EMPTY) continue
      ctx.fillStyle = pal.rigDark
      ctx.fillRect(px, py + C - 3, 8, 3)                    // the cowl
      ctx.fillStyle = pal.rig
      ctx.fillRect(px + 1, py + C - 4, 6, 1)
      // Three puffs on a long cycle, rising and fading. Smoke is the whole
      // reason this fitting exists, so it gets the pixels.
      // How far it may rise. These fittings are on the per-tick layer, which
      // paints over the terrain rather than under it, so an unclamped plume
      // would pour straight up through the ceiling of its own corridor.
      var head = 0
      while (head < 14 && w.terrain[(d.y - head - 1) * k.COLS + d.x] === k.EMPTY) head++
      var span = Math.max(1, head * C - 2)

      for (var sm = 0; sm < 4; sm++) {
        var ph2 = (w.ticks * 0.5 + sm * 30 + d.seed) % 120
        if (ph2 > 100) continue
        if (ph2 * 0.5 > span) continue
        // Smoke over a dark board needs more than a hint of alpha or it is
        // simply not there. Fades from most of the way opaque, and grows.
        ctx.globalAlpha = 0.55 * (1 - ph2 / 100)
        ctx.fillStyle = pal.decorLit
        var puff = 3 + Math.round(ph2 / 14)
        ctx.fillRect(Math.round(px + 4 - puff / 2 + Math.sin(ph2 * 0.05 + sm) * 3),
                     Math.round(py + C - 6 - ph2 * 0.5), puff, puff)
      }
      ctx.globalAlpha = 1
      continue
    }

  }
}

// The warning, and then the name of what just happened. An event that changes
// the level without saying so is indistinguishable from the sim misbehaving,
// so the telegraph is not decoration: it is the difference between "the floor
// went" and "the floor went, and it said Legacy Collapse first".
// The other thing at the end of a floor. A fire escape is bolted to the
// outside of the building rather than cut through it, so almost none of the
// hoistway's vocabulary carries over: no rope, no rails, no car. What it has
// instead is a switchback — land, cross the well as you descend, land again,
// and turn — which is the shape the eye reads as New York before it reads any
// of the detail, and the reason stairX alternates its direction per storey.
//
// The switchback rule is Sim.js's, written out a second time here because the
// two files cannot call each other — and under a different name, because in a
// browser these files land in one global scope and `npm run check` refuses a
// name declared in two of them. Change one and change the other; the whole of
// it is the landing share and the parity of the storey index.
var ESC_LAND = 0.16

function escapeRunX(L, i, end) {
  var a = L.x0 + 0.9, b = L.x1 - 0.4
  var from = (i % 2 === 0) ? a : b
  return end ? (from === a ? b : a) : from
}

function drawFireEscape(ctx, w, pal, L, x0, wid, top, bot) {
  var C = w.k.CELL
  var iron = pal.rig
  var dark = pal.rigDark

  // The well is open air, not a shaft: this is the outside of the building and
  // it should read as sky rather than as the dark the hoistway gets.
  ctx.fillStyle = pal.skyLow
  ctx.fillRect(x0, top, wid, bot - top)

  // The panes, painted over whatever the terrain pass made of them. A glazed door
  // still in its frame is the flat indigo this biome is tinted with; one that
  // has been opened is an empty opening with the frame left behind, which
  // is the only readout the board gives of where the colony has been through.
  for (var pi = 0; pi < L.panes.length; pi++) {
    var pane = L.panes[pi]
    var px = L.wallX * C
    var py = pane.y0 * C
    var ph = (pane.y1 - pane.y0 + 1) * C
    var intact = false
    for (var cy = pane.y0; cy <= pane.y1; cy++)
      if (w.terrain[cy * w.k.COLS + L.wallX] !== w.k.EMPTY) intact = true
    if (intact) {
      ctx.fillStyle = pal.glassPane
      ctx.fillRect(px, py, C, ph)
      ctx.fillStyle = pal.glassLit
      ctx.fillRect(px + 1, py + 2, 2, ph - 6)               // the light down one edge
      ctx.fillRect(px + 1, py + 2, C - 3, 2)
      ctx.fillStyle = dark
      ctx.fillRect(px, py + Math.round(ph / 2), C, 1)       // the meeting rail
    } else {
      ctx.fillStyle = pal.glassShard
      for (var sh = 0; sh < 5; sh++)
        ctx.fillRect(px + (sh % 2 ? 1 : C - 3), py + 2 + sh * 3, 2, 2)
    }
    ctx.fillStyle = iron
    ctx.fillRect(px - 1, py - 2, C + 2, 2)                  // lintel
    ctx.fillRect(px - 1, py + ph, C + 2, 2)                 // sill
  }

  // A landing at every storey, and the flight that leaves it. Both are drawn
  // as open grating — a line for the deck, a rail above it, and balusters
  // between — because a fire escape you cannot see the street through is a
  // balcony.
  for (var si = 0; si < L.stops.length; si++) {
    var fy = L.stops[si] * C
    ctx.fillStyle = iron
    ctx.fillRect(x0, fy - 2, wid, 2)                        // the deck
    ctx.fillStyle = dark
    for (var gx = x0 + 1; gx < x0 + wid; gx += 3) ctx.fillRect(gx, fy - 2, 1, 2)

    // Waist high, and open. A rail drawn head-high with a baluster every
    // fourth pixel is a cage, and a stack of cages down the side of a building
    // is the one thing this is not supposed to look like.
    var rail = fy - 2 - 2 * C
    ctx.fillStyle = iron
    ctx.fillRect(x0, rail, wid, 2)                          // top rail
    ctx.fillStyle = dark
    for (var bx = x0 + 3; bx < x0 + wid - 2; bx += 7)
      ctx.fillRect(bx, rail + 2, 1, 2 * C - 2)              // balusters
    ctx.fillStyle = iron
    ctx.fillRect(x0, rail, 2, 2 * C)                        // the outer post
    ctx.fillRect(x0 + wid - 2, rail, 2, 2 * C)

    // Brackets back to the wall. Nothing here is holding itself up.
    ctx.fillStyle = dark
    var bWall = L.out > 0 ? x0 + wid : x0
    for (var b = 1; b <= 2; b++) {
      ctx.fillRect(bWall - L.out * b * 5 - (L.out > 0 ? 2 : 0), fy, 2, 2 + b * 2)
    }

    if (si >= L.stops.length - 1) continue

    // The flight. Drawn as treads on the diagonal the walker is actually
    // following, so an agent on it stands on its steps rather than beside
    // them, and with a handrail on the same slope above.
    var span = L.stops[si + 1] - L.stops[si]
    var yA = L.stops[si] + span * ESC_LAND
    var yB = L.stops[si + 1] - span * ESC_LAND
    var xA = escapeRunX(L, si, false), xB = escapeRunX(L, si, true)
    var steps = Math.max(4, Math.round(yB - yA))
    for (var st = 0; st <= steps; st++) {
      var t = st / steps
      var sx = (xA + (xB - xA) * t) * C
      var sy = (yA + (yB - yA) * t) * C
      ctx.fillStyle = iron
      ctx.fillRect(Math.round(sx) - 3, Math.round(sy) - 1, 7, 2)      // tread
      ctx.fillStyle = dark
      ctx.fillRect(Math.round(sx) - 3, Math.round(sy) + 1, 7, 1)      // its shadow
      // Handrail on the same slope, with a stanchion every third tread. Every
      // other one filled the flight in solid and it stopped reading as stairs.
      ctx.fillStyle = iron
      ctx.fillRect(Math.round(sx) - 1, Math.round(sy) - 2 * C, 2, 2)
      if (st % 3 === 0) {
        ctx.fillStyle = dark
        ctx.fillRect(Math.round(sx), Math.round(sy) - 2 * C + 2, 1, 2 * C - 3)
      }
    }
  }

  // The drop ladder at the bottom, counterweighted and swung up out of reach
  // of the street, which is the one piece of a fire escape everybody can draw
  // from memory and the one piece nobody in this game will ever use.
  var lx = escapeRunX(L, L.stops.length - 1, false) * C
  var ly = L.stops[L.stops.length - 1] * C
  ctx.fillStyle = dark
  ctx.fillRect(Math.round(lx) - 3, ly, 2, 5 * C)
  ctx.fillRect(Math.round(lx) + 3, ly, 2, 5 * C)
  ctx.fillStyle = iron
  for (var rg = 0; rg < 5; rg++) ctx.fillRect(Math.round(lx) - 3, ly + 4 + rg * 5, 8, 1)
}

// The Skyscraper's two hoistways and the cars in them. On the per-tick layer
// for the same reason the Factory's cogs are: a lift painted with the terrain
// only repaints when the terrain changes, which is a shaft with a lift stuck
// in it, and that is the one thing this biome cannot afford to look like.
//
// Drawn before the agents so a car is the box they are standing in rather than
// a box drawn over them, and with no front panel at all — the cabin is a back
// wall, a roof and a floor plate, and the passengers are the rest of it.
function drawLifts(ctx, w, pal) {
  if (!w.lifts || !w.lifts.length) return
  var C = w.k.CELL
  for (var i = 0; i < w.lifts.length; i++) {
    var L = w.lifts[i]
    var x0 = L.x0 * C
    var wid = (L.x1 - L.x0 + 1) * C
    var top = L.headY * C
    var bot = L.bottom * C

    if (L.stairs) { drawFireEscape(ctx, w, pal, L, x0, wid, top, bot); continue }

    // The void. Darker than any corridor on the board, because a hoistway is
    // the one place in the building with no floor under it for fifty rows.
    ctx.fillStyle = pal.pitDeep
    ctx.fillRect(x0, top, wid, bot - top)

    // Guide rails down both faces, and the ladder of service rungs that every
    // shaft has and nobody in this game is ever going to use.
    ctx.fillStyle = pal.rigDark
    ctx.fillRect(x0 + 1, top, 2, bot - top)
    ctx.fillRect(x0 + wid - 3, top, 2, bot - top)
    ctx.fillStyle = pal.steelShade
    for (var rg = top + 4; rg < bot; rg += 7) ctx.fillRect(x0 + wid - 8, rg, 5, 1)

    var carTop = Math.round(L.car * C) - 5 * C
    // The hoist rope, from the head of the shaft down to the car.
    ctx.fillStyle = pal.rig
    ctx.fillRect(Math.round(L.mid * C) - 1, top, 2, Math.max(0, carTop - top))

    // The doors, one set per floor. A frame on the wall face, and leaves that
    // are shut everywhere the car is not — which is what makes the one open
    // set worth walking to.
    for (var s = 0; s < L.stops.length; s++) {
      var fy = L.stops[s] * C
      var dx = L.wallX * C
      // Open exactly while the car is available, which now includes a parked
      // one: a lift that waits to be called spends most of a level standing
      // still, and a standing car with its doors shut is indistinguishable
      // from a shaft with no car in it at all.
      var open = Math.abs(L.car - L.stops[s]) < 0.6 && (L.hold > 0 || L.parked)
      var dh = 5 * C                                      // the opening
      var dy0 = fy - dh - 2
      ctx.fillStyle = pal.rig
      ctx.fillRect(dx - 2, dy0 - 3, C + 4, 3)             // lintel
      ctx.fillRect(dx - 2, fy - 3, C + 4, 3)              // sill
      ctx.fillRect(dx - 2, dy0, 2, dh + 2)                // jambs
      ctx.fillRect(dx + C, dy0, 2, dh + 2)
      // Leaves. Shut everywhere the car is not, which is what makes the one
      // open set worth crossing a floor for.
      ctx.fillStyle = pal.steelShade
      if (open) {
        ctx.fillRect(dx, dy0, 1, dh)
        ctx.fillRect(dx + C - 1, dy0, 1, dh)
      } else {
        ctx.fillRect(dx, dy0, C, dh)
        ctx.fillStyle = pal.rigDark
        ctx.fillRect(dx + C / 2, dy0, 1, dh)              // the seam
      }
      // The lamp over the door. Lit at the floor the car is standing at, and
      // otherwise showing which way it went.
      var lx2 = dx + (L.out > 0 ? C + 3 : -5)
      ctx.fillStyle = pal.rigDark
      ctx.fillRect(lx2, dy0 - 8, 4, 5)
      ctx.fillStyle = open ? pal.exitLight : pal.decorDim
      ctx.fillRect(lx2 + 1, dy0 - 7 + (open ? 0 : (L.dir > 0 ? 2 : 0)), 2, open ? 3 : 1)
    }

    // The car: a back wall, a roof, a floor plate and a light. No front panel
    // at all — the passengers are the front of it, and they are drawn after.
    // Six cells tall: a clear course over an agent's head, and — the point —
    // the floor plate lands just under the riders' foot line instead of
    // behind their shoes, so they read as standing on it rather than sunk
    // through the bottom of the box.
    //
    // The back wall is `rig`, two steps brighter than the shaft it hangs in.
    // At `rigDark` it vanished into the void the moment riders filled the
    // cabin, and a moving car read as a box chasing agents who floated above
    // it. Seams break the panel up so it stays scenery behind the sprites.
    var ch2 = 6 * C
    ctx.fillStyle = pal.rig
    ctx.fillRect(x0 + 3, carTop, wid - 6, ch2)
    ctx.fillStyle = pal.rigDark
    for (var seam = x0 + 9; seam < x0 + wid - 6; seam += 7)
      ctx.fillRect(seam, carTop + 4, 1, ch2 - 8)
    ctx.fillStyle = pal.steel
    ctx.fillRect(x0 + 2, carTop, wid - 4, 3)                    // roof
    // The plate's top row is the riders' foot line exactly — the same join a
    // walker makes with a floor, one pixel lower and their boots hang over an
    // empty row of shaft.
    ctx.fillRect(x0 + 2, carTop + ch2 - 4, wid - 4, 3)          // floor plate
    // A bright jamb down each side. A full load of riders covers the wall
    // between them, and without this outline the only cues left are strips
    // above their heads and under their feet — the cabin stops reading as a
    // thing they are inside of.
    ctx.fillStyle = pal.steelEdge
    ctx.fillRect(x0 + 2, carTop, 2, ch2)
    ctx.fillRect(x0 + wid - 4, carTop, 2, ch2)
    ctx.fillStyle = pal.steelShade
    ctx.fillRect(x0 + 3, carTop + 3, 2, ch2 - 6)                // corner posts
    ctx.fillRect(x0 + wid - 5, carTop + 3, 2, ch2 - 6)
    ctx.fillStyle = pal.decorLit
    ctx.fillRect(x0 + 6, carTop + 4, wid - 12, 2)               // the ceiling light
    ctx.globalAlpha = 0.25                                      // and what it throws
    ctx.fillRect(x0 + 5, carTop + 6, wid - 10, ch2 - 10)
    ctx.globalAlpha = 1
  }
}

// The end of a level held by blockers: they put their arms down and go home
// (Sim's `standDown`). Said in words across the top for a few seconds, the way
// an event is, because a row of blockers all walking off at once with no
// reason given looks like the game forgot what they were for.
function drawStandDown(ctx, w, pal) {
  var since = w.ticks - w.stoodDownAt
  if (!(w.stoodDownAt >= 0) || since < 0 || since >= 90) return
  drawSkyNotice(ctx, w, pal, {
    text: "STAND DOWN — EVERYBODY HOME", label: "ALL CLEAR",
    age: since, left: 90 - since, colour: pal.exitLight, warn: false
  })
}

// The moment one blocker stands down: a ring going out from it, so each of
// them is seen to have been released rather than to have wandered off.
function drawReleaseRing(ctx, pal, ag, ox, oy, now) {
  var since = now - ag.stoodDownAt
  if (!(ag.stoodDownAt >= 0) || since > 20) return
  ctx.fillStyle = pal.exitLight
  ctx.globalAlpha = 0.8 * (1 - since / 20)
  var r = 4 + since
  for (var s = 0; s < 12; s++) {
    var a = s / 12 * Math.PI * 2
    ctx.fillRect(Math.round(ox + 4 + Math.cos(a) * r), Math.round(oy + 8 + Math.sin(a) * r * 0.8), 1, 1)
  }
  ctx.globalAlpha = 1
}

// Sim decrements the warning on the tick it starts it. The schedule bridges
// the one tick between a zero countdown and the fire, without a render latch.
// 75 is the existing telegraph length; 40 is the existing post-event hold.
function skyEvent(w, pal) {
  var events = w.events || []
  for (var i = events.length - 1; i >= 0; i--) {
    var e = events[i]
    var age = w.ticks - e.at + 75
    if (e.spec.name === w.eventWarn && age >= 0 && age < 115 && (age < 75 || e.fired))
      return skyEventPhase(w, pal, age, e.at - w.ticks)
  }
  if (w.eventWarnFor > 0) return skyEventPhase(w, pal, 75 - w.eventWarnFor, w.eventWarnFor)
  if (w.eventFlash > 0) return skyEventPhase(w, pal, 115 - w.eventFlash, 0)
  return null
}

function skyEventPhase(w, pal, age, countdown) {
  var warn = countdown > 0
  return { text: w.eventWarn, label: warn ? "INCOMING" : "EVENT",
    age: age, left: 115 - age, colour: warn ? pal.warn : pal.fireHot,
    warn: warn, countdown: Math.max(0, countdown) }
}

function drawEventBanner(ctx, w, pal) {
  var event = skyEvent(w, pal)
  if (event) drawSkyNotice(ctx, w, pal, event)
  else drawStandDown(ctx, w, pal)
}

// A short, integer-pixel lift, not a fade through illegible intermediate text.
function skySlide(age, left) {
  return Math.max(0, Math.min(1, age / 12, left / 12))
}

function skyNoticeAmount(w, pal) {
  var event = skyEvent(w, pal)
  if (event) return skySlide(event.age, event.left)
  var age = w.ticks - w.stoodDownAt
  if (w.stoodDownAt >= 0 && age >= 0 && age < 90) return skySlide(age, 90 - age)
  return 0
}

function skyLayout(w) {
  var width = w.k.COLS * w.k.CELL
  var hx = Math.round(w.hatch.x * w.k.CELL)
  var right = hx < width / 2
  var x = right ? hx + 20 : 4
  var end = right ? width - 4 : hx - 20
  return { x: x, width: end - x, height: w.k.SKY * w.k.CELL - 2, right: right }
}

function skyClip(ctx, box) {
  ctx.beginPath()
  ctx.rect(box.x, 0, box.width, box.height + 2)
  ctx.clip()
}

// Cut corners, a whole-pixel bevel and inset shadow remain readable on the
// panel. Portraits add their hero's hair to the raised edge, robe to the rim.
function drawSkyPanel(ctx, pal, x, y, width, height, rim, light) {
  ctx.fillStyle = pal.rigDark
  ctx.fillRect(x + 1, y, width - 2, height)
  ctx.fillRect(x, y + 1, width, height - 2)
  ctx.fillStyle = rim
  ctx.fillRect(x + 1, y + 1, width - 2, height - 2)
  ctx.fillStyle = light
  ctx.fillRect(x + 2, y + 1, width - 4, 1)
  ctx.fillRect(x + 1, y + 2, 1, height - 4)
  ctx.fillStyle = pal.cardBack
  ctx.fillRect(x + 2, y + 2, width - 4, height - 4)
  ctx.fillStyle = pal.rigDark
  ctx.fillRect(x + 2, y + height - 3, width - 4, 1)
  ctx.fillRect(x + width - 3, y + 2, 1, height - 4)
}

function skyFitText(ctx, text, width) {
  if (ctx.measureText(text).width <= width) return text
  while (text.length && ctx.measureText(text + "…").width > width) text = text.slice(0, -1)
  return text ? text + "…" : ""
}

function drawSkyNotice(ctx, w, pal, notice) {
  var box = skyLayout(w)
  if (box.width < 40) return
  var amount = skySlide(notice.age, notice.left)
  ctx.save()
  skyClip(ctx, box)
  ctx.translate(0, -Math.round((1 - amount) * (box.height + 1)))
  drawSkyPanel(ctx, pal, box.x, 1, box.width, box.height, notice.colour, pal.hatchLip)
  drawSkyNoticeText(ctx, w, pal, box, notice)
  ctx.restore()
}

function drawSkyNoticeText(ctx, w, pal, box, notice) {
  var x = box.x + 7, width = box.width - 14
  ctx.textAlign = "left"
  ctx.font = "bold 8px monospace"
  ctx.fillStyle = notice.colour
  ctx.fillText(notice.label, x + 7, 11)
  var blink = !notice.warn || Math.floor(w.ticks / (notice.countdown < 25 ? 3 : 7)) % 2 === 0
  ctx.fillStyle = blink ? notice.colour : pal.rigDark
  ctx.fillRect(x, 5, 3, 3)
  ctx.font = "9px monospace"
  ctx.fillStyle = pal.label
  // Only the message types in; its panel, label and countdown stay steady.
  var text = skyFitText(ctx, notice.text, width)
  if (notice.warn) text = text.slice(0, Math.floor(notice.age))
  ctx.fillText(text, x, 22)
  drawSkyCountdown(ctx, pal, box, notice)
}

function drawSkyCountdown(ctx, pal, box, notice) {
  if (!notice.warn) return
  ctx.font = "7px monospace"
  ctx.textAlign = "right"
  ctx.fillStyle = notice.colour
  ctx.fillText(String(Math.ceil(notice.countdown / 30)) + "s", box.x + box.width - 7, 11)
  var width = box.width - 14
  ctx.fillStyle = pal.rigDark
  ctx.fillRect(box.x + 7, 24, width, 1)
  ctx.fillStyle = notice.colour
  ctx.fillRect(box.x + 7, 24, Math.round(width * Math.min(1, notice.countdown / 75)), 1)
}

function drawActors(ctx, w, pal, opts) {
  var k = w.k
  clearLayer(ctx, w)
  drawAnimatedLight(ctx, w, pal)
  drawMachines(ctx, w, pal)
  drawActiveEventAir(ctx, w, pal)
  drawLifts(ctx, w, pal)
  drawPits(ctx, w, pal)
  drawSpecialCard(ctx, w, pal)
  drawHatch(ctx, w, pal)
  drawEnemyHatch(ctx, w, pal, opts)
  drawExitGlow(ctx, w, pal)
  drawExitGate(ctx, w, pal)
  drawMission(ctx, w, pal)

  for (var dhi = 0; dhi < w.hazards.length; dhi++) drawHazard(ctx, w, pal, w.hazards[dhi], opts)

  drawEventBanner(ctx, w, pal)

  drawActorFixtures(ctx, w, pal)
  drawActorColony(ctx, w, pal, opts)
  // Last, over everybody: whoever is standing in a fireball is behind it.
  if (w.blasts) for (var bl = 0; bl < w.blasts.length; bl++) drawBlast(ctx, w, pal, w.blasts[bl])
  drawLevelTransition(ctx, w, pal)
}

function drawActorFixtures(ctx, w, pal) {
  drawActorMines(ctx, w, pal)
  drawActorLadders(ctx, w, pal)
  drawActorParticles(ctx, w, pal)
  if (w.prints && w.prints.length) drawPrints(ctx, w, pal)
  if (w.eventSiteFx) drawEventSite(ctx, w, pal, w.eventSiteFx)
  if (w.boulder) drawBoulder(ctx, w, pal, w.boulder)
  if (w.frozen) for (var fz = 0; fz < w.frozen.length; fz++) drawFrozen(ctx, w, pal, w.frozen[fz])
  if (w.pads) for (var pd = 0; pd < w.pads.length; pd++) drawPadPair(ctx, w, pal, w.pads[pd])
  if (w.sinkholes) for (var sk = 0; sk < w.sinkholes.length; sk++) drawSinkhole(ctx, w, pal, w.sinkholes[sk])
  if (w.nets) for (var ni = 0; ni < w.nets.length; ni++) drawNet(ctx, w, w.nets[ni])
  if (w.reloadFx) drawReloadTrail(ctx, w, w.reloadFx)
  if (w.debugFx) drawDebugFx(ctx, w, w.debugFx)
  if (w.restockFx) drawRestockFx(ctx, w, pal, w.restockFx)

  if (w.biome === "Frost") drawPowderBursts(ctx, w, pal)
}

function drawActorColony(ctx, w, pal, opts) {
  for (var i = 0; i < w.agents.length; i++) {
    var ag = w.agents[i]
    if (ag.gone) { drawDeath(ctx, w, pal, ag); continue }
    if (drawBeamArrival(ctx, w, ag)) continue
    drawAgent(ctx, w, pal, ag, opts)
    drawAgentSidearm(ctx, w, pal, ag)
  }
  for (var ei = 0; ei < w.enemies.length; ei++) {
    var enemy = w.enemies[ei]
    if (enemy.gone) { drawEnemyDefeat(ctx, w, pal, enemy); continue }
    drawEnemy(ctx, w, pal, enemy, opts)
    if (enemy.throttled > 0) drawThrottled(ctx, w, enemy.x * w.k.CELL, (enemy.y - 4) * w.k.CELL - 4, enemy.throttled)
  }
}

// Board transitions belong to the per-tick layer in every host. No timers,
// random draws or writes to the world: a paused/repainted frame stays itself.
var LEVEL_INTRO_TICKS = 40
var LEVEL_OPEN_TICKS = 12
var LEVEL_CLOSE_TICKS = 25

// A tiny 3x5 ROM font, drawn as rectangles so QML, browsers and the offline
// renderer all get the same hard pixels. The large lines use two art pixels
// per dot; the small labels use one, with no dependence on an installed font.
var TRANSITION_GLYPHS = {
  A: [2,5,7,5,5], B: [6,5,6,5,6], C: [3,4,4,4,3], D: [6,5,5,5,6],
  E: [7,4,6,4,7], F: [7,4,6,4,4], G: [3,4,5,5,3], H: [5,5,7,5,5],
  I: [7,2,2,2,7], J: [1,1,1,5,2], K: [5,5,6,5,5], L: [4,4,4,4,7],
  M: [5,7,7,5,5], N: [5,7,7,7,5], O: [2,5,5,5,2], P: [6,5,6,4,4],
  Q: [2,5,5,3,1], R: [6,5,6,5,5], S: [3,4,2,1,6], T: [7,2,2,2,2],
  U: [5,5,5,5,7], V: [5,5,5,5,2], W: [5,5,7,7,5], X: [5,5,2,5,5],
  Y: [5,5,2,2,2], Z: [7,1,2,4,7],
  "0": [7,5,5,5,7], "1": [2,6,2,2,7], "2": [6,1,2,4,7],
  "3": [6,1,2,1,6], "4": [5,5,7,1,1], "5": [7,4,6,1,6],
  "6": [3,4,7,5,7], "7": [7,1,2,2,2], "8": [7,5,7,5,7], "9": [7,5,7,1,6],
  " ": [0,0,0,0,0], "·": [0,0,2,0,0], "/": [1,1,2,4,4],
  "!": [2,2,2,0,2], "?": [6,1,2,0,2], "+": [0,2,7,2,0]
}

function drawTransitionGlyph(ctx, rows, x, y, size) {
  for (var row = 0; row < 5; row++) for (var col = 0; col < 3; col++) {
    if (rows[row] & (4 >> col)) ctx.fillRect(x + col * size, y + row * size, size, size)
  }
}

function drawTransitionText(ctx, text, cx, y, size) {
  var x = Math.round(cx - (text.length * 4 - 1) * size / 2)
  for (var i = 0; i < text.length; i++) {
    drawTransitionGlyph(ctx, TRANSITION_GLYPHS[text[i]] || TRANSITION_GLYPHS["?"], x + i * 4 * size, y, size)
  }
}

function drawTransitionPlate(ctx, w, pal, x, y, height) {
  ctx.fillStyle = pal.hatchMouth
  ctx.fillRect(x + 3, y + 3, 272, height)
  ctx.fillStyle = pal.dirtEdge
  ctx.fillRect(x + 3, y, 266, height)
  ctx.fillRect(x, y + 3, 272, height - 6)
  ctx.fillStyle = pal.cardBack
  ctx.fillRect(x + 3, y + 3, 266, height - 6)
  ctx.fillStyle = pal.rockEdge
  ctx.fillRect(x + 6, y + height - 4, 260, 1)
  ctx.fillStyle = pal.label
  ctx.fillRect(x + 5, y + 5, 1, 1)
  ctx.fillRect(x + 266, y + 5, 1, 1)
  ctx.fillRect(x + 5, y + height - 6, 1, 1)
  ctx.fillRect(x + 266, y + height - 6, 1, 1)
  if ((w.res || 1) >= 2) {
    ctx.fillStyle = pal.decorLit
    ctx.fillRect(x + 6, y + 1, 260, 0.5)
    ctx.fillRect(x + 1, y + 6, 0.5, height - 12)
  }
}

// A stepped diamond iris, made of four-pixel scan bands. Opening at the hatch
// exposes the first drop immediately; the whole board is open by tick twelve.
function drawLevelIris(ctx, w, pal, cx, cy, open) {
  if (open >= 1) return
  var width = w.k.COLS * w.k.CELL, height = w.k.ROWS * w.k.CELL
  var reach = Math.max(cx, width - cx) + Math.max(cy, height - cy) + 4
  var radius = reach * Math.max(0, open)
  ctx.fillStyle = pal.hatchMouth
  for (var y = 0; y < height; y += 4) {
    var span = Math.max(0, radius - Math.abs(y + 2 - cy))
    var left = Math.max(0, Math.min(width, Math.floor((cx - span) / 4) * 4))
    var right = Math.max(0, Math.min(width, Math.ceil((cx + span) / 4) * 4))
    // No aperture on this band, including at the fully closed endpoint.
    if (span === 0) { ctx.fillRect(0, y, width, 4); continue }
    ctx.fillRect(0, y, left, 4)
    ctx.fillRect(right, y, width - right, 4)
  }
}

function drawLevelIntro(ctx, w, pal) {
  var width = w.k.COLS * w.k.CELL, height = w.k.ROWS * w.k.CELL
  drawLevelIris(ctx, w, pal, w.hatch.x * w.k.CELL, w.hatch.y * w.k.CELL, w.ticks / LEVEL_OPEN_TICKS)
  var slide = Math.round(Math.max(0, (w.ticks - 24) / 16) * (width / 2 + 136))
  var cx = Math.round(width / 2) + slide, y = Math.round(height / 2) - 20
  drawTransitionPlate(ctx, w, pal, cx - 136, y, 40)
  ctx.fillStyle = pal.decorLit
  drawTransitionText(ctx, "DEPLOYING AGENTS", cx, y + 8, 1)
  ctx.fillStyle = pal.label
  drawTransitionText(ctx, "LEVEL " + w.level + " · " + w.biome.toUpperCase(), cx, y + 21, 2)
}

function levelVerdict(w) {
  if (w.saved === 0) return "OH NO! NO AGENTS"
  if (w.saved >= w.toRelease) return "ALL AGENTS ACCOUNTED FOR"
  if (w.saved * 2 >= w.toRelease) return "ACCEPTABLE COLLATERAL"
  return "MORE AGENTS REQUIRED"
}

// The mission's rescued who followed an agent home (Sim's stepEscorted).
function escortLine(w) {
  return w.escortsHome > 0 ? " · +" + w.escortsHome + " RESCUED" : ""
}

// Eight-pixel silhouettes, one per arrival (up to six, to bound the row).
// The count is authoritative; these just recall who came through the door.
var ESCORT_BADGES = {
  civilian: [56,56,16,124,84,56,40,40],
  explorer: [60,56,16,126,86,58,40,40],
  camel: [2,98,246,255,254,68,68,68],
  boar: [0,0,4,254,255,126,68,68],
  bird: [16,56,60,254,124,56,40,40],
  monkey: [56,56,16,125,85,60,40,40]
}

function drawEscortBadge(ctx, kind, t, x, y) {
  var key = kind === "animal" ? ["boar", "bird", "monkey"][t.variant || 0] : kind
  var rows = ESCORT_BADGES[key]
  if (!rows) return
  for (var r = 0; r < rows.length; r++) for (var c = 0; c < 8; c++)
    if (rows[r] & (128 >> c)) ctx.fillRect(x + c, y + r, 1, 1)
}

function drawEscortReport(ctx, w, pal, cx, y) {
  if (!(w.escortsHome > 0)) return
  var targets = w.mission ? w.mission.targets.filter(function (t) { return t.home }).slice(0, 6) : []
  var text = "+" + w.escortsHome + " RESCUED", width = text.length * 4 - 1
  var icons = targets.length * 12, left = Math.round(cx - (width + icons) / 2)
  ctx.save()
  ctx.fillStyle = pal.exitLight
  drawTransitionText(ctx, text, left + width / 2, y + 2, 1)
  for (var i = 0; i < targets.length; i++)
    drawEscortBadge(ctx, w.mission.kind, targets[i], left + width + 5 + i * 12, y)
  ctx.restore()
}

function drawLevelResults(ctx, w, pal) {
  var cx = Math.round(w.k.COLS * w.k.CELL / 2)
  var y = Math.round(w.k.ROWS * w.k.CELL / 2) - 31 + Math.max(0, 10 - w.doneTicks) * 2
  drawTransitionPlate(ctx, w, pal, cx - 136, y, w.escortsHome > 0 ? 78 : 62)
  ctx.fillStyle = pal.decorLit
  drawTransitionText(ctx, "LEVEL " + w.level + " · REPORT", cx, y + 8, 1)
  ctx.fillStyle = pal.label
  drawTransitionText(ctx, w.saved + " / " + w.toRelease + " HOME", cx, y + 22, 2)
  ctx.fillStyle = w.saved === 0 ? pal.urgent : pal.exitLight
  drawTransitionText(ctx, levelVerdict(w), cx, y + 43, 1)
  drawEscortReport(ctx, w, pal, cx, y + 59)
}

function drawLevelClosing(ctx, w, pal) {
  // doneHold belongs to the host, not Sim. Undefined means keep the report up.
  if (!(w.doneHold > 0)) return
  var remaining = w.doneHold - w.doneTicks
  drawLevelIris(ctx, w, pal, w.k.COLS * w.k.CELL / 2, w.k.ROWS * w.k.CELL / 2, remaining / LEVEL_CLOSE_TICKS)
}

function drawLevelTransition(ctx, w, pal) {
  if (w.done) {
    ctx.save()
    drawLevelResults(ctx, w, pal)
    drawLevelClosing(ctx, w, pal)
    ctx.restore()
  } else if (w.ticks >= 0 && w.ticks < LEVEL_INTRO_TICKS) {
    ctx.save()
    drawLevelIntro(ctx, w, pal)
    ctx.restore()
  }
}

function drawActorMines(ctx, w, pal) {
  var k = w.k
  // Planted mines are separate actors: a small pulsing charge on the floor
  // with its own three-second countdown, rather than a tool hidden in a pose.
  for (var mi = 0; mi < w.mines.length; mi++) {
    var mine = w.mines[mi]
    var mx = Math.round(mine.x * k.CELL)
    var my = Math.round(mine.y * k.CELL)
    var pulse = Math.floor(mine.fuse / (mine.fuse < 30 ? 3 : 6)) % 2 === 0
    ctx.fillStyle = pulse ? pal.urgent : pal.dirtEdge
    ctx.fillRect(mx - 3, my - 3, 7, 3)
    ctx.fillRect(mx - 1, my - 5, 3, 2)
    ctx.fillStyle = pulse ? "#ffffff" : pal.fireHot
    ctx.fillRect(mx, my - 6, 1, 1)
    ctx.fillStyle = pal.urgent
    ctx.font = "bold 9px monospace"
    ctx.textAlign = "center"
    ctx.fillText(String(Math.ceil(mine.fuse / 30)), mx, my - 9)
  }
}

function drawActorLadders(ctx, w, pal) {
  var k = w.k
  // Ladders. Drawn on the face of the wall they lean on, in the timber colours
  // of whoever left them, and drawn BEFORE the agents so a climber's hands are
  // in front of the rungs rather than behind them. `t` grows the ladder up the
  // wall over half a second the first time, so it reads as being put there.
  for (var li = 0; li < w.ladders.length; li++) {
    var lad = w.ladders[li]
    var lgrow = Math.min(1, lad.t / 14)
    var lx = Math.round((lad.x + (lad.side > 0 ? 0 : 1)) * k.CELL) - lad.side * 1
    var lbot = Math.round((lad.bottom + 1) * k.CELL)
    var lspan = Math.round((lad.bottom - lad.top + 1) * k.CELL * lgrow)
    var stile = lad.side > 0 ? lx - 3 : lx + 1
    if (lad.vine) { drawVine(ctx, w, pal, stile, lbot, lspan, lad.x); continue }
    if (lad.chain) { drawChain(ctx, w, pal, stile, lbot, lspan); continue }

    ctx.fillStyle = pal.rigDark
    ctx.fillRect(stile, lbot - lspan, 2, lspan)
    ctx.fillStyle = SPECIALS_LADDER_WOOD
    ctx.fillRect(stile + (lad.side > 0 ? 0 : 1), lbot - lspan, 1, lspan)
    for (var lr = 2; lr < lspan; lr += 4) {
      ctx.fillStyle = lr % 8 === 2 ? SPECIALS_LADDER_RUNG : SPECIALS_LADDER_WOOD
      ctx.fillRect(stile - 1, lbot - lr, 5, 1)
    }
    // A fresh one still has sawdust coming off the top rung.
    if (lad.t < 14) {
      ctx.globalAlpha = 1 - lad.t / 14
      ctx.fillStyle = pal.dust
      ctx.fillRect(stile - 2, lbot - lspan - 2, 7, 2)
      ctx.globalAlpha = 1
    }
  }
}

function drawActorParticles(ctx, w, pal) {
  var k = w.k
  for (var p = 0; p < w.particles.length; p++) {
    var d = w.particles[p]
    // Blood is bigger, redder and fades slower than dust, because it is the
    // one particle on the board that is meant to be noticed.
    if (d.blood) {
      ctx.globalAlpha = Math.min(1, d.life / 24)
      ctx.fillStyle = pal.blood
      ctx.fillRect(Math.round(d.x * k.CELL), Math.round(d.y * k.CELL), 3, 3)
    } else {
      ctx.globalAlpha = 0.55
      ctx.fillStyle = pal.dust
      ctx.fillRect(Math.round(d.x * k.CELL), Math.round(d.y * k.CELL), 2, 2)
    }
  }
  ctx.globalAlpha = 1
}

// Deaths are poses, never another walk cycle. Coordinates below are whole art
// pixels relative to the last boot line, mirrored by the dispatcher's transform.
// No random draws or stored animation state: a repaint cannot change the world.
var DEATH_TICKS = 32
var DEATH_DRAW = {
  "boom": drawDeathBoom,
  "red team": drawDeathShot,
  "hazard": drawDeathHazard,
  "drone strike": drawDeathDrone,
  "fell": drawDeathFell,
  "splat": drawDeathSplat,
  "crushed": drawDeathCrushed,
  "turned": drawDeathTurned,
  "stand down": drawDeathStandDown
}

function drawDeath(ctx, w, pal, ag) {
  if (!ag.gone || ag.state === "saved" || ag.diedAt === undefined) return
  var age = w.ticks - ag.diedAt
  if (age < 0 || age >= DEATH_TICKS) return
  var draw = Object.prototype.hasOwnProperty.call(DEATH_DRAW, ag.diedBy)
    ? DEATH_DRAW[ag.diedBy] : drawDeathGeneric
  ctx.save()
  ctx.translate(Math.round(ag.x * w.k.CELL), Math.round((ag.y + 1) * w.k.CELL))
  ctx.scale(ag.dir === -1 ? -1 : 1, 1)
  ctx.globalAlpha = Math.min(1, (DEATH_TICKS - age) / 10)
  draw(ctx, w, pal, age)
  ctx.restore()
}

function drawDeathFlat(ctx, pal, width, height) {
  ctx.fillStyle = pal.robe
  ctx.fillRect(-width + 2, -height, width + 1, height)
  ctx.fillStyle = pal.lapel
  ctx.fillRect(-width + 3, -height, width - 2, 1)
  ctx.fillStyle = "#ffffff"
  ctx.fillRect(1, -height, 2, height)
  ctx.fillStyle = pal.skin
  ctx.fillRect(3, -height, 4, height)
  ctx.fillStyle = pal.hair
  ctx.fillRect(5, -height - 1, 3, 1)
  ctx.fillStyle = pal.rigDark
  ctx.fillRect(-width, -height, 2, height)
  ctx.fillRect(5, -height, 1, 1)
}

function drawDeathDust(ctx, pal, age, spread) {
  var reach = spread + Math.floor(age / 4)
  var lift = Math.max(0, 3 - Math.floor(age / 5))
  ctx.fillStyle = pal.dust
  ctx.fillRect(-reach - 2, -2 - lift, 2, 1)
  ctx.fillRect(reach, -2 - lift, 2, 1)
  ctx.fillRect(-reach, -1, 2, 1)
  ctx.fillRect(reach - 2, -1, 2, 1)
}

function drawDeathSplat(ctx, w, pal, age) {
  drawDeathFlat(ctx, pal, 7, age < 4 ? 3 : 2)
  if (age < 8) {
    ctx.fillStyle = pal.robe
    ctx.fillRect(-5, -6 + Math.floor(age / 2), 2, 3)
  }
  if (age < 20) drawDeathDust(ctx, pal, age, 8)
}

function drawDeathCrushed(ctx, w, pal, age) {
  // A suit pressed to one row, with its collar squeezed out at the sides.
  drawDeathFlat(ctx, pal, 10, 1)
  ctx.fillStyle = "#ffffff"
  ctx.fillRect(-4, -2, 3, 1)
  ctx.fillRect(3, -2, 3, 1)
  if (age < 16) drawDeathDust(ctx, pal, age, 11)
}

function drawDeathGhost(ctx, w, pal, age) {
  var y = -13 - Math.floor(age / 2)
  var x = Math.floor(age / 4) % 2
  ctx.fillStyle = "#ffffff"
  ctx.fillRect(x - 1, y, 3, 1)
  ctx.fillRect(x - 2, y + 1, 5, 4)
  ctx.fillRect(x - 2, y + 5, 1, 1)
  ctx.fillRect(x, y + 5, 1, 1)
  ctx.fillRect(x + 2, y + 5, 1, 1)
  ctx.fillStyle = pal.rigDark
  ctx.fillRect(x - 1, y + 2, 1, 1)
  ctx.fillRect(x + 1, y + 2, 1, 1)
  if ((w.res || 1) >= 2) {
    ctx.fillStyle = pal.lapel
    ctx.fillRect(x - 1.5, y + 3.5, 0.5, 1)
    ctx.fillRect(x + 1.5, y + 3.5, 0.5, 1)
  }
}

function drawDeathRecoil(ctx, pal, age) {
  // Hand-stepped diagonal poses keep the impact crisp at res 1, unlike a
  // rotated standing sprite. The head is already behind the boots at age 0.
  var lean = Math.min(3, Math.floor(age / 3))
  ctx.save()
  ctx.translate(-Math.min(5, Math.floor(age / 2)), 0)
  ctx.fillStyle = pal.robe
  ctx.fillRect(-2, -5, 5, 3)
  ctx.fillRect(-3 - lean, -9 + lean, 4, 4)
  ctx.fillRect(1, -2, 3, 2)
  ctx.fillStyle = "#ffffff"
  ctx.fillRect(-2 - lean, -10 + lean, 2, 2)
  ctx.fillStyle = pal.skin
  ctx.fillRect(-5 - lean, -13 + lean * 2, 4, 3)
  ctx.fillStyle = pal.hair
  ctx.fillRect(-6 - lean, -14 + lean * 2, 4, 1)
  ctx.fillStyle = pal.rigDark
  ctx.fillRect(-4 - lean, -12 + lean * 2, 2, 1)
  ctx.restore()
}

function drawDeathShot(ctx, w, pal, age) {
  if (age < 12) drawDeathRecoil(ctx, pal, age)
  else {
    ctx.save(); ctx.translate(-5, 0)
    ctx.scale(-1, 1)
    drawDeathFlat(ctx, pal, 7, 3)
    if (age >= 14) drawDeathGhost(ctx, w, pal, age - 14)
    ctx.restore()
  }
}

function drawDeathDrone(ctx, w, pal, age) {
  // A downward strike: splayed suit, impact rays, then the tie escapes upward.
  drawDeathFlat(ctx, pal, 6 + Math.min(3, Math.floor(age / 3)), 2)
  if (age < 10) {
    ctx.fillStyle = pal.fireHot
    ctx.fillRect(-8, -9 + Math.floor(age / 2), 1, 3)
    ctx.fillRect(8, -9 + Math.floor(age / 2), 1, 3)
    drawDeathDust(ctx, pal, age, 10)
  }
  ctx.save()
  ctx.translate(Math.floor(age / 6) % 2, -5 - Math.floor(age / 2))
  drawDeathTie(ctx, pal)
  ctx.restore()
}

function drawDeathTie(ctx, pal) {
  ctx.fillStyle = pal.urgent
  ctx.fillRect(0, 0, 1, 1)
  ctx.fillRect(-1, 2, 3, 2)
  ctx.fillRect(0, 4, 1, 1)
}

function drawDeathBoom(ctx, w, pal, age) {
  // The blast owns the body; just a hat (copper for divers) arcs out of it.
  var x = Math.floor(age / 3)
  var y = -17 - Math.round(age * (DEATH_TICKS - age) / 36)
  ctx.fillStyle = w.submerged ? "#bc8147" : pal.hair
  ctx.fillRect(x - 2, y, 5, 3)
  ctx.fillRect(x - 3, y + 3, 7, 1)
  ctx.fillStyle = w.submerged ? "#f2c886" : pal.lapel
  ctx.fillRect(x - 1, y, 3, 1)
  ctx.fillStyle = pal.dust
  ctx.fillRect(x - 3, y + 6, 1, 1)
  ctx.fillRect(x - 4, y + 9, 1, 1)
}

function drawDeathHazard(ctx, w, pal, age) {
  // Charcoal, white eyes and a last electrical twitch, then a collapsing heap.
  var height = Math.max(2, 12 - Math.floor(age / 2))
  var twitch = Math.floor(age / 2) % 2
  ctx.fillStyle = pal.rigDark
  ctx.fillRect(-3 + twitch, -height, 5, height - 1)
  ctx.fillRect(-5, -3, 9, 2)
  ctx.fillStyle = pal.lapel
  ctx.fillRect(-3 + twitch, -height, 4, 1)
  ctx.fillStyle = "#ffffff"
  ctx.fillRect(-2 + twitch, -Math.max(1, height - 2), 1, 1)
  ctx.fillRect(twitch, -Math.max(1, height - 2), 1, 1)
  if (age < 16) {
    ctx.fillStyle = pal.fireHot
    ctx.fillRect(-7, -height - 2, 3, 1)
    ctx.fillRect(-5, -height - 1, 1, 3)
    ctx.fillRect(5, -height + 1, 3, 1)
    ctx.fillRect(5, -height + 2, 1, 3)
  }
}

function drawDeathTurned(ctx, w, pal, age) {
  // The replacement enemy is drawn separately. Only the old identity sheds
  // pixels here, pulling inward before its green/purple afterimage disperses.
  var spread = Math.abs(8 - Math.floor(age / 2))
  for (var i = 0; i < 6; i++) {
    var side = i % 2 === 0 ? -1 : 1
    ctx.fillStyle = i % 2 === 0 ? "#9ce879" : "#c586e8"
    ctx.fillRect(side * (spread + i % 3), -14 + i * 2, 2, 1)
  }
}

function drawDeathStandDown(ctx, w, pal, age) {
  // An empty shirt collar drops as a white handkerchief flutters away.
  var drop = Math.min(9, Math.floor(age / 2))
  ctx.fillStyle = "#ffffff"
  ctx.fillRect(-3, -11 + drop, 2, 2)
  ctx.fillRect(1, -11 + drop, 2, 2)
  ctx.save()
  ctx.translate(0, -9 + Math.min(4, Math.floor(age / 2)))
  drawDeathTie(ctx, pal)
  ctx.restore()
  ctx.fillStyle = "#ffffff"
  var x = 4 + Math.floor(age / 5) % 2
  var y = -16 - Math.floor(age / 3)
  ctx.fillRect(x, y, 3, 2)
  ctx.fillRect(x + 2, y + 2, 2, 2)
}

function drawDeathFell(ctx, w, pal, age) {
  // Already below the world: do not bring a falling body back onto the board.
}

function drawDeathGeneric(ctx, w, pal, age) {
  drawDeathGhost(ctx, w, pal, age)
  if (age < 12) drawDeathDust(ctx, pal, age, 5)
}

function drawMission(ctx, w, pal) {
  var m = w.mission
  if (!m) return
  var C = w.k.CELL

  ctx.save()
  drawSkyMission(ctx, w, pal)

  for (var i = 0; i < m.targets.length; i++) {
    var t = m.targets[i]
    if (drawMissionEscort(ctx, w, pal, m.kind, t)) continue
    var x = Math.round(t.x * C), y = Math.round(t.y * C)

    if (!t.freed && !t.dead) drawMissionContainer(ctx, m.kind, x, y, pal)
    drawMissionSubject(ctx, m.kind, t, x, y, pal, (w.res || 1) >= 2)

    if (!t.freed && !t.dead && m.progress > 0) {
      ctx.fillStyle = pal.rigDark
      ctx.fillRect(x - 7, y - 19, 14, 2)
      ctx.fillStyle = pal.exitLight
      ctx.fillRect(x - 7, y - 19, Math.round(14 * Math.min(1, m.progress / 4)), 2)
    }
  }
  ctx.restore()
}

var ESCORT_DRAW = {
  civilian: drawEscortPerson,
  explorer: drawEscortPerson,
  animal: drawEscortAnimal,
  camel: drawEscortCamel
}
var ESCORT_HOME_TICKS = 14

function drawMissionEscort(ctx, w, pal, kind, t) {
  if (t.home) { drawEscortHome(ctx, w, pal, kind, t); return true }
  if (!t.freed || t.dead || !(t.escort >= 0) || !ESCORT_DRAW[kind]) return false
  ctx.save()
  var pose = escortPose(w, t)
  var x = Math.round(t.x * w.k.CELL), y = Math.round(t.y * w.k.CELL)
  if (pose.moving && !pose.air && pose.phase % 2) y--
  ESCORT_DRAW[kind](ctx, pal, kind, t, x, y, pose, (w.res || 1) >= 2)
  ctx.restore()
  return true
}

// The trail stores positions and direction, not movement states. Look at its
// next sample and support under the current feet, never the leader's *current*
// state: a leader climbing now may still have a follower on the floor below.
// A large first gap is the pickup delay, not a stride. No render-side history.
function escortPose(w, t) {
  var next = t.trail && t.trail[0]
  var dx = next ? next[0] - t.x : 0, dy = next ? next[1] - t.y : 0
  var moving = Math.abs(dx) + Math.abs(dy) > 0.005 && Math.abs(dx) + Math.abs(dy) < 1.5
  var foot = Math.floor(t.y) * w.k.COLS + Math.floor(t.x)
  var air = !w.terrain[foot] || Math.abs(dy) > 0.12
  return { dir: t.dir || 1, moving: moving, air: air, up: dy < -0.02,
    phase: moving ? Math.floor(t.anim / 3) % 4 : 0 }
}

function drawEscortHome(ctx, w, pal, kind, t) {
  var age = w.ticks - t.homeAt
  if (!(age >= 0 && age < ESCORT_HOME_TICKS) || !ESCORT_DRAW[kind]) return
  ctx.save()
  ctx.globalAlpha *= 1 - age / ESCORT_HOME_TICKS
  var x = Math.round(t.x * w.k.CELL), y = Math.round(t.y * w.k.CELL) - age
  var pose = { dir: t.dir || 1, moving: false, air: true, up: true, phase: 0 }
  ESCORT_DRAW[kind](ctx, pal, kind, t, x, y, pose, (w.res || 1) >= 2)
  ctx.fillStyle = pal.exitLight
  for (var s = 0; s < 4; s++) {
    var angle = s * Math.PI / 2 + age * 0.3 + (t.variant || 0)
    ctx.fillRect(x + Math.round(Math.cos(angle) * (4 + age / 2)),
      y - 7 + Math.round(Math.sin(angle) * (3 + age / 3)), 1, 1)
  }
  ctx.restore()
}

// A forward profile and pumping elbows replace the freed cheering pose.
// In a shaft the hands reach and the knees tuck; the same silhouette can hop
// off a ledge, scramble up a ladder or ride a lift without walking on air.
function drawEscortPerson(ctx, pal, kind, t, x, y, pose, fine) {
  var v = t.variant || 0, dir = pose.dir, short = v === 1 ? 2 : 0
  var coat = kind === "explorer" ? (v === 2 ? pal.ore : pal.decorLit) : (v === 2 ? pal.warn : pal.exitLight)
  var stride = pose.moving ? [-2, 0, 2, 0][pose.phase] : 0
  ctx.fillStyle = coat
  ctx.fillRect(x - 2, y - 7 + short, 5, 4 - short)
  var arm = pose.air ? (pose.up ? -10 : -7) : -6 - Math.sign(stride)
  ctx.fillRect(x + dir * 3 - (dir < 0 ? 2 : 0), y + arm, 2, 3)
  ctx.fillRect(x - dir * 4 - (dir < 0 ? 1 : 0), y - 6, 2, 2)
  drawEscortFeet(ctx, pal.rigDark, x, y, stride, pose.air)
  ctx.fillStyle = pal.skin
  var head = x + (pose.moving ? dir : 0)
  ctx.fillRect(head - 2, y - 11 + short, 4, 4)
  ctx.fillRect(head + dir * 2 - (dir < 0 ? 1 : 0), y - 9 + short, 1, 2)
  ctx.fillRect(x + dir * 4 - (dir < 0 ? 1 : 0), y + arm, 1, 1)
  ctx.fillStyle = pal.rigDark
  ctx.fillRect(head - 2, y - 12 + short, 4, 2)
  ctx.fillRect(head + dir - (dir < 0 ? 1 : 0), y - 9 + short, 1, 1)
  if (v === 2) ctx.fillRect(head - dir * 3, y - 10, 1, 5)
  if (kind === "explorer") {
    ctx.fillStyle = pal.urgent
    ctx.fillRect(x - dir * 5, y - 8 + short, 3, 4)
    ctx.fillStyle = pal.rigDark
    ctx.fillRect(head - 2, y - 9 + short, 4, 1)
  }
  if (!fine) return
  ctx.fillStyle = pal.lens
  ctx.fillRect(head + dir - (dir < 0 ? 0.5 : 0), y - 9 + short, 0.5, 0.5)
  ctx.fillStyle = pal.skin
  ctx.fillRect(head + dir - (dir < 0 ? 0.5 : 0), y - 7.5 + short, 1, 0.5)
  ctx.fillStyle = pal.decorDim
  ctx.fillRect(x + dir, y - 5, 0.5, 1)
}

function drawEscortFeet(ctx, colour, x, y, stride, air) {
  ctx.fillStyle = colour
  if (air) {
    ctx.fillRect(x - 3, y - 4, 2, 2); ctx.fillRect(x + 2, y - 3, 2, 2)
    ctx.fillRect(x - 2, y - 2, 2, 1); ctx.fillRect(x + 1, y - 1, 2, 1)
    return
  }
  ctx.fillRect(x - 2 - stride, y - 3, 2, 3)
  ctx.fillRect(x + 1 + stride, y - 3, 2, 3)
}

var ESCORT_ANIMALS = [drawEscortBoar, drawEscortBird, drawEscortMonkey]
function drawEscortAnimal(ctx, pal, kind, t, x, y, pose, fine) {
  ESCORT_ANIMALS[t.variant || 0](ctx, pal, x, y, pose, fine)
}

function drawEscortBoar(ctx, pal, x, y, pose, fine) {
  var dir = pose.dir, stride = pose.moving ? [-1, 0, 1, 0][pose.phase] : 0
  ctx.fillStyle = pal.decorLit
  ctx.fillRect(x - 4, y - 7, 8, 4)
  ctx.fillRect(x + dir * 4 - (dir < 0 ? 3 : 0), y - 8, 3, 4)
  drawEscortFeet(ctx, pal.decorDim, x, y, stride, pose.air)
  ctx.fillStyle = pal.exitLight
  ctx.fillRect(x + dir * 6 - (dir < 0 ? 1 : 0), y - 5, 1, 2)
  ctx.fillStyle = pal.eye
  ctx.fillRect(x + dir * 4, y - 7, 1, 1)
  ctx.fillStyle = pal.decorDim
  ctx.fillRect(x - dir * 5, y - 6, 1, 2)
  if (fine) {
    for (var b = -3; b < 3; b += 1.5) ctx.fillRect(x + b, y - 7.5, 0.5, 1)
  }
}

function drawEscortBird(ctx, pal, x, y, pose, fine) {
  var dir = pose.dir, flap = pose.phase % 2
  ctx.fillStyle = pal.exitLight
  ctx.fillRect(x - 2, y - 9, 5, 5)
  ctx.fillRect(x + dir - 1, y - 11, 3, 2)
  var wing = pose.air ? -11 + flap * 3 : -7
  ctx.fillRect(x - 5, y + wing, 3, 2); ctx.fillRect(x + 3, y + wing, 3, 2)
  drawEscortFeet(ctx, pal.decorDim, x, y, pose.moving ? [-2, 0, 2, 0][pose.phase] : 0, pose.air)
  ctx.fillStyle = pal.urgent
  ctx.fillRect(x + dir * 3 - (dir < 0 ? 2 : 0), y - 9, 2, 1)
  ctx.fillStyle = pal.eye
  ctx.fillRect(x + dir, y - 10, 1, 1)
  if (fine) {
    ctx.fillStyle = pal.decorDim
    ctx.fillRect(x - 4, y + wing + 1, 2, 0.5); ctx.fillRect(x + 3, y + wing + 1, 2, 0.5)
  }
}

function drawEscortMonkey(ctx, pal, x, y, pose, fine) {
  var dir = pose.dir, stride = pose.moving ? [-2, 0, 2, 0][pose.phase] : 0
  ctx.fillStyle = pal.ore
  ctx.fillRect(x - 2, y - 10, 5, 5); ctx.fillRect(x - 3, y - 5, 6, 2)
  var reach = pose.air ? -11 : -7
  ctx.fillRect(x + dir * 4, y + reach, 2, 4)
  ctx.fillRect(x - dir * 5, y - 6, 2, 3)
  ctx.fillRect(x - dir * 5, y - 7, 2, 1); ctx.fillRect(x - dir * 6, y - 9, 1, 3)
  drawEscortFeet(ctx, pal.ore, x, y, stride, pose.air)
  ctx.fillStyle = pal.skin
  ctx.fillRect(x + dir - 1, y - 9, 3, 3)
  ctx.fillStyle = pal.eye
  ctx.fillRect(x + dir * 2, y - 8, 1, 1)
  if (fine) {
    ctx.fillStyle = pal.skin
    ctx.fillRect(x + dir * 4, y + reach, 1, 0.5)
  }
}

function drawEscortCamel(ctx, pal, kind, t, x, y, pose, fine) {
  var dir = pose.dir, stride = pose.moving ? [-1, 0, 1, 0][pose.phase] : 0
  ctx.fillStyle = "#c99a5b"
  ctx.fillRect(x - 5, y - 8, 10, 4)
  if ((t.variant || 0) % 2) {
    ctx.fillRect(x - 4, y - 10, 3, 2); ctx.fillRect(x + 1, y - 10, 3, 2)
  } else ctx.fillRect(x - 3, y - 11, 5, 3)
  ctx.fillRect(x + dir * 5 - (dir < 0 ? 2 : 0), y - 12, 2, 6)
  ctx.fillRect(x + dir * 6 - (dir < 0 ? 3 : 0), y - 13, 3, 2)
  ctx.fillStyle = "#8a6436"
  var legY = pose.air ? y - 3 : y - 4, legH = pose.air ? 2 : 4
  for (var l = 0; l < 4; l++) {
    var offset = l % 2 ? stride : -stride
    ctx.fillRect(x + [-4, -2, 2, 4][l] + offset, legY, 1, legH)
  }
  ctx.fillRect(x - dir * 6 - (dir > 0 ? 0 : 1), y - 8, 1, 3)
  ctx.fillStyle = pal.eye
  ctx.fillRect(x + dir * 7 - (dir < 0 ? 1 : 0), y - 13, 1, 1)
  if (fine) {
    ctx.fillStyle = "#b8362e"
    ctx.fillRect(x + dir * 6 - (dir < 0 ? 3 : 0), y - 12, 3, 0.5)
    ctx.fillStyle = "#e3b77a"
    ctx.fillRect(x - 2, y - ((t.variant || 0) % 2 ? 10 : 11), 2, 0.5)
  }
}

function drawMissionContainer(ctx, kind, x, y, pal) {
  if (kind === "alien") return // a hunt, not a prisoner exchange
  if (kind === "camel") {
    // Hobbled to a stake, under a scrap of awning. Not a cage: a camel is
    // tied up, and what freeing it means is somebody undoing a knot.
    ctx.fillStyle = pal.decorDim
    ctx.fillRect(x - 9, y - 16, 2, 16); ctx.fillRect(x + 8, y - 13, 2, 13)
    ctx.fillStyle = pal.decorLit
    ctx.fillRect(x - 10, y - 17, 21, 2)
    for (var aw = 0; aw < 21; aw += 4) ctx.fillRect(x - 10 + aw, y - 15, 2, 1 + (aw % 8 ? 1 : 0))
    ctx.fillStyle = pal.decor
    ctx.fillRect(x - 7, y - 3, 6, 1)
    return
  }
  if (kind === "treasure") {
    // Not a container at all: the silt and coral that grew over the wreck
    // while it lay here. It is what the divers are digging the chest out of,
    // so it wants to read as accretion rather than as a cage — no straight
    // lines, and it sits low and wide around the base.
    ctx.fillStyle = pal.decorDim
    ctx.fillRect(x - 9, y - 4, 18, 4)
    ctx.fillRect(x - 7, y - 6, 14, 2)
    ctx.fillStyle = pal.decor
    for (var cr = 0; cr < 5; cr++) {
      var crx = x - 8 + cr * 4
      ctx.fillRect(crx, y - 8 - (cr % 2), 2, 4)
      ctx.fillRect(crx - 1, y - 10 - (cr % 2), 1, 2)
    }
    return
  }
  if (kind === "animal") {
    // A pegged rope net: organic and visibly different from a cell.
    ctx.fillStyle = pal.decorDim
    ctx.fillRect(x - 8, y - 14, 2, 14); ctx.fillRect(x + 6, y - 14, 2, 14)
    ctx.fillStyle = pal.decorLit
    for (var n = 0; n < 4; n++) {
      ctx.fillRect(x - 6 + n * 4, y - 13, 1, 11)
      ctx.fillRect(x - 6, y - 12 + n * 3, 12, 1)
    }
    return
  }
  if (kind === "explorer") {
    // Ice slabs and a distress beacon, not prison bars.
    ctx.fillStyle = pal.decor
    ctx.fillRect(x - 7, y - 13, 3, 13); ctx.fillRect(x + 4, y - 11, 3, 11)
    ctx.fillStyle = pal.decorLit
    ctx.fillRect(x - 6, y - 15, 1, 4); ctx.fillRect(x + 5, y - 14, 1, 5)
    ctx.fillStyle = pal.urgent
    ctx.fillRect(x + 7, y - 16, 2, 2); ctx.fillRect(x + 7, y - 14, 1, 4)
    return
  }
  // Civilians are held in a recognisable barred cell.
  ctx.fillStyle = pal.rigDark
  ctx.fillRect(x - 7, y - 15, 2, 15); ctx.fillRect(x + 5, y - 15, 2, 15)
  ctx.fillRect(x - 7, y - 15, 14, 2); ctx.fillRect(x - 7, y - 2, 14, 2)
  ctx.fillStyle = pal.steelEdge
  ctx.fillRect(x - 3, y - 14, 1, 12); ctx.fillRect(x + 2, y - 14, 1, 12)
}

function drawAgentSidearm(ctx, w, pal, ag) {
  var m = w.mission
  var hunting = m && m.kind === "alien" && !m.done && ag.id === m.scoutId
  if (!hunting && (ag.special || ag.shotFor <= 0)) return
  var C = w.k.CELL, dir = ag.dir || 1
  var ox = Math.round(ag.x * C) - SPRITE_W / 2
  var oy = Math.round((ag.y + 1) * C) - SPRITE_PX
  var handX = dir > 0 ? ox + 7 : ox + 1
  var handY = oy + 9
  // A compact sidearm held from the forward hand. The old six-pixel barrel
  // began at cell centre and crossed the face; this one sits below the head,
  // with the skin pixel making the grip visibly belong to the agent.
  ctx.fillStyle = pal.skin
  ctx.fillRect(handX, handY, 2, 2)
  ctx.fillStyle = pal.steelEdge
  ctx.fillRect(dir > 0 ? handX + 1 : handX - 4, handY - 1, 5, 2)
  ctx.fillStyle = pal.rigDark
  ctx.fillRect(dir > 0 ? handX + 1 : handX, handY + 1, 2, 2)
  var firing = hunting ? m.shotFor > 0 : ag.shotFor > 0
  if (firing) {
    ctx.fillStyle = pal.fireHot
    ctx.fillRect(dir > 0 ? handX + 7 : handX - 7, handY - 2, 2, 3)
    if (!hunting && ag.shotTo && (w.res || 1) >= 2) drawSidearmShotFine(ctx, w, pal, ag, handX + dir * 7, handY)
    else if (!hunting && ag.shotTo) {
      ctx.globalAlpha = Math.min(0.8, ag.shotFor / 5)
      var ex = ag.shotTo * C, ey = ag.shotY * C
      var sx = handX + dir * 7, sy = handY
      var steps = Math.max(1, Math.round(Math.abs(ex - sx) / 5))
      for (var q = 1; q <= steps; q += 2)
        ctx.fillRect(Math.round(sx + (ex - sx) * q / steps),
                     Math.round(sy + (ey - sy) * q / steps), 1, 1)
      ctx.globalAlpha = 1
    }
  }
}

// A sidearm shot at res 2. The res-1 dotted line spaced its dots ten pixels
// apart, and at that spacing nobody watching could tell what was being shot
// at. Here the round is a short bright streak that crosses the gap in the
// first three ticks of the shot, leaving a fading half-pixel trail; then the
// far end sparks for the rest of it, so the eye lands on what was hit.
var SHOT_FLIGHT = 3
function drawSidearmShotFine(ctx, w, pal, ag, sx, sy) {
  var C = w.k.CELL, age = 8 - ag.shotFor
  var ex = ag.shotTo * C, ey = ag.shotY * C
  var flight = Math.min(1, (age + 1) / SHOT_FLIGHT)
  var tipX = sx + (ex - sx) * flight, tipY = sy + (ey - sy) * flight
  var len = Math.max(1, Math.round(Math.hypot(tipX - sx, tipY - sy) * 2))
  ctx.fillStyle = pal.fireHot
  ctx.globalAlpha = 0.5 * (1 - age / 8)
  for (var q = 0; q < len; q += 2) shotDot(ctx, sx + (tipX - sx) * q / len, sy + (tipY - sy) * q / len, 0.5)
  ctx.globalAlpha = 1
  if (flight < 1) {
    var back = 3 / Math.max(1, Math.hypot(ex - sx, ey - sy))
    ctx.fillStyle = pal.fireHot
    for (var b = 0; b <= 4; b++) shotDot(ctx, tipX - (ex - sx) * back * b / 4, tipY - (ey - sy) * back * b / 4, 1)
    ctx.fillStyle = "#ffffff"
    shotDot(ctx, tipX, tipY, 1)
    return
  }
  drawShotSpark(ctx, pal, ex, ey, age - SHOT_FLIGHT + 1)
}

function shotDot(ctx, x, y, size) {
  ctx.fillRect(Math.round(x * 2) / 2, Math.round(y * 2) / 2, size, size)
}

// Four sparks thrown out from the point of impact, and a white flash on the
// first tick.
function drawShotSpark(ctx, pal, x, y, t) {
  if (t === 1) { ctx.fillStyle = "#ffffff"; shotDot(ctx, x - 1, y - 1, 2) }
  ctx.fillStyle = pal.fireHot
  ctx.globalAlpha = Math.max(0, 1 - t / 6)
  var r = 1 + t * 0.75
  shotDot(ctx, x - r, y - r, 0.5); shotDot(ctx, x + r, y - r, 0.5)
  shotDot(ctx, x - r * 0.5, y + r * 0.5, 0.5); shotDot(ctx, x + r * 0.5, y + r * 0.5, 0.5)
  shotDot(ctx, x, y - r * 1.25, 0.5)
  ctx.globalAlpha = 1
}

function drawMissionSubject(ctx, kind, t, x, y, pal, fine) {
  drawMissionSubjectBase(ctx, kind, t, x, y, pal, fine)
  if (fine && CREATURE_FINE[kind]) CREATURE_FINE[kind](ctx, t, x, y - (t.freed && Math.floor(t.anim / 5) % 2 ? 1 : 0), pal, t.variant || 0, t.dir || 1)
}

// The non-human prisoners at res 2 (the people have drawPersonFine): a touch
// each, inside the coarse shape, keyed by mission kind.
var CREATURE_FINE = {
  animal: function (ctx, t, x, y, pal, v, dir) {
    if (v === 0) {                                                     // boar
      ctx.fillStyle = pal.decorDim
      for (var b = -3; b < 3; b += 1.5) ctx.fillRect(x + b, y - 7.5, 0.5, 1)
      ctx.fillStyle = "#f2f2e6"
      ctx.fillRect(x + dir * 6.5 - (dir < 0 ? 0.5 : 0), y - 5.5, 0.5, 1)  // tusk
    } else if (v === 1) {                                              // bird
      ctx.fillStyle = pal.decorDim
      ctx.fillRect(x - 4.5, y - 7, 2, 0.5); ctx.fillRect(x + 3.5, y - 7, 2, 0.5)
    } else {                                                           // monkey
      ctx.fillStyle = "#e9d6b8"
      ctx.fillRect(x - 1, y - 8.5, 2.5, 2)
      ctx.fillStyle = "#1c1c22"
      ctx.fillRect(x - 0.5, y - 8, 0.5, 0.5); ctx.fillRect(x + 0.5, y - 8, 0.5, 0.5)
    }
  },
  treasure: function (ctx, t, x, y, pal) {
    ctx.fillStyle = "#e0b649"
    ctx.fillRect(x - 0.5, y - 6, 1, 1.5)                               // lock plate
    for (var r = -5; r <= 5; r += 2.5) ctx.fillRect(x + r, y - 2, 0.5, 0.5)   // rivets
    if (!t.freed) return
    ctx.fillStyle = "#ffffff"                                          // coins glinting
    for (var g = 0; g < 3; g++) if ((t.anim + g * 7) % 18 < 6) ctx.fillRect(x - 3 + g * 3, y - 9.5 + (g % 2), 0.5, 0.5)
  },
  camel: function (ctx, t, x, y, pal, v, dir) {
    ctx.fillStyle = "#b8362e"
    ctx.fillRect(x + dir * 6 - (dir < 0 ? 3 : 0), y - 12, 3, 0.5)       // halter
    ctx.fillStyle = "#e3b77a"
    ctx.fillRect(x - 2, y - (v % 2 ? 10 : 11), 2, 0.5)                 // light on the hump
  },
  alien: function (ctx, t, x, y, pal, v) {
    if (t.dead) return
    ctx.fillStyle = "#ffffff"
    ctx.globalAlpha = 0.5
    var ey = y - (v === 1 ? 11 : 7)
    ctx.fillRect(x - 2.5, ey - 0.5, 2, 2); ctx.fillRect(x + 1.5, ey - 0.5, 2, 2)  // eye glow
    ctx.globalAlpha = 1
  }
}

function drawMissionSubjectBase(ctx, kind, t, x, y, pal, fine) {
  var v = t.variant || 0
  var dir = t.dir || 1
  var bob = t.freed && Math.floor(t.anim / 5) % 2 ? 1 : 0
  y -= bob

  if (kind === "camel") { drawCamel(ctx, t, x, y, dir, pal); return }

  if (kind === "treasure") {
    // A strongbox with banded iron and a hasp. Shut it is a dark box with a
    // brass line across it; open it is the only genuinely bright thing in the
    // biome, which is what makes finding one worth watching — everything else
    // down here is blue.
    var open = t.freed
    ctx.fillStyle = pal.helmetDark
    ctx.fillRect(x - 6, y - 9, 12, 9)                 // the body of the chest
    ctx.fillStyle = pal.decorDim
    ctx.fillRect(x - 6, y - 9, 12, 1)
    ctx.fillStyle = pal.helmet
    ctx.fillRect(x - 6, y - 5, 12, 1)                 // the band
    ctx.fillRect(x - 1, y - 5, 2, 3)                  // the hasp
    if (!open) {
      // The lid, shut: a shallow curve of staves across the top.
      ctx.fillStyle = pal.helmetDark
      ctx.fillRect(x - 6, y - 13, 12, 4)
      ctx.fillStyle = pal.helmet
      ctx.fillRect(x - 5, y - 14, 10, 1)
      return
    }
    // Thrown back, and what is inside it. The glow is drawn as loose coins
    // rather than as a light because a light source in a biome with one sun
    // shaft would read as a second sun.
    ctx.fillStyle = pal.helmetDark
    ctx.fillRect(x - 7, y - 15, 12, 3)
    ctx.fillStyle = pal.helmetLit
    ctx.fillRect(x - 5, y - 12, 10, 3)                // the hoard
    for (var co = 0; co < 6; co++) {
      var glint = (Math.floor(t.anim / 4) + co) % 3 === 0
      ctx.fillStyle = glint ? "#fff2b0" : pal.helmetLit
      ctx.fillRect(x - 5 + co * 2, y - 13 - (co % 2), 2, 2)
    }
    return
  }

  if (kind === "animal") {
    ctx.fillStyle = v === 0 ? pal.decorLit : (v === 1 ? pal.exitLight : pal.ore)
    if (v === 0) { // boar: low, square and tusked
      ctx.fillRect(x - 4, y - 7, 8, 4); ctx.fillRect(x + dir * 4 - (dir < 0 ? 2 : 0), y - 8, 3, 3)
      ctx.fillRect(x - 3, y - 3, 2, 3); ctx.fillRect(x + 2, y - 3, 2, 3)
      ctx.fillStyle = pal.exitLight; ctx.fillRect(x + dir * 6 - (dir < 0 ? 1 : 0), y - 6, 1, 1)
    } else if (v === 1) { // bird: crest, wings and stick legs
      ctx.fillRect(x - 3, y - 10, 6, 6); ctx.fillRect(x - 5, y - 8, 3, 3); ctx.fillRect(x + 3, y - 8, 3, 3)
      ctx.fillRect(x - 2, y - 4, 1, 4); ctx.fillRect(x + 2, y - 4, 1, 4)
      ctx.fillStyle = pal.urgent; ctx.fillRect(x + dir * 3, y - 9, 2, 1)
    } else { // monkey: long arms and a curled pixel tail
      ctx.fillRect(x - 2, y - 10, 5, 5); ctx.fillRect(x - 3, y - 5, 6, 4)
      ctx.fillRect(x - 5, y - 7, 2, 6); ctx.fillRect(x + 3, y - 7, 2, 6)
      ctx.fillRect(x - dir * 5, y - 6, 2, 1); ctx.fillRect(x - dir * 6, y - 8, 1, 3)
      ctx.fillRect(x - 3, y - 2, 2, 2); ctx.fillRect(x + 2, y - 2, 2, 2)
    }
    return
  }

  if (kind === "alien") {
    if (t.dead) {
      ctx.fillStyle = pal.blood
      ctx.fillRect(x - 6, y - 3, 12, 2)
      ctx.fillStyle = pal.urgent
      ctx.fillRect(x - 4, y - 5, 7, 3); ctx.fillRect(x + 3, y - 4, 4, 1)
      return
    }
    ctx.fillStyle = v === 1 ? pal.decorLit : pal.urgent
    if (v === 0) { // broad xeno
      ctx.fillRect(x - 3, y - 11, 7, 7); ctx.fillRect(x - 5, y - 8, 2, 5); ctx.fillRect(x + 4, y - 8, 2, 5)
    } else if (v === 1) { // tall visitor
      ctx.fillRect(x - 2, y - 13, 5, 7); ctx.fillRect(x - 3, y - 6, 7, 5); ctx.fillRect(x - 4, y - 3, 2, 3); ctx.fillRect(x + 3, y - 3, 2, 3)
    } else { // crab thing
      ctx.fillRect(x - 4, y - 8, 9, 5); ctx.fillRect(x - 6, y - 6, 2, 2); ctx.fillRect(x + 5, y - 6, 2, 2)
      ctx.fillRect(x - 4, y - 3, 2, 3); ctx.fillRect(x + 3, y - 3, 2, 3)
    }
    ctx.fillStyle = pal.exitLight; ctx.fillRect(x - 2, y - (v === 1 ? 11 : 7), 1, 1); ctx.fillRect(x + 2, y - (v === 1 ? 11 : 7), 1, 1)
    return
  }

  // Civilians and explorers share anatomy, but variants change height, hair,
  // coat and carried gear enough to read as a group instead of copied sprites.
  var short = v === 1 ? 2 : 0
  ctx.fillStyle = kind === "explorer" ? (v === 2 ? pal.ore : pal.decorLit) : (v === 2 ? pal.warn : pal.exitLight)
  ctx.fillRect(x - 2, y - 11 + short, 5, 5)
  ctx.fillRect(x - 3, y - 6 + short, 7, 5 - short)
  if (t.freed) {
    var stride = Math.floor(t.anim / 4) % 2
    ctx.fillRect(x - 3 + stride, y - 2, 2, 2)
    ctx.fillRect(x + 2 - stride, y - 2, 2, 2)
  }
  ctx.fillStyle = pal.rigDark
  if (v === 0) ctx.fillRect(x - 3, y - 12, 7, 2)
  else if (v === 1) ctx.fillRect(x - 2, y - 10, 5, 1)
  else { ctx.fillRect(x - 3, y - 12, 6, 2); ctx.fillRect(x + 3, y - 9, 2, 5) }
  ctx.fillRect(x - 1, y - 9 + short, 1, 1); ctx.fillRect(x + 2, y - 9 + short, 1, 1)
  if (kind === "explorer") { ctx.fillStyle = pal.urgent; ctx.fillRect(x - dir * 5, y - 7, 3, 5) }
  if (fine) drawPersonFine(ctx, kind, t, x, y + short, pal,
    kind === "explorer" ? (v === 2 ? pal.ore : pal.decorLit) : (v === 2 ? pal.warn : pal.exitLight))
}

// A prisoner's half-pixel detail at res 2: a face where the coarse sprite has
// a pale block with two dots in it — skin, eyes, and a mouth that is a frown
// while held and an open cheer once freed, when the arms go up as well.
// Civilians get buttons down the coat; explorers a goggle strap with a glint.
function drawPersonFine(ctx, kind, t, x, y, pal, coat) {
  ctx.fillStyle = pal.skin
  ctx.fillRect(x - 1.5, y - 10, 4, 3)
  ctx.fillStyle = pal.eye
  ctx.fillRect(x - 0.5, y - 9, 0.5, 0.5); ctx.fillRect(x + 1.5, y - 9, 0.5, 0.5)
  if (t.freed) {
    ctx.fillRect(x, y - 8, 1, 0.5)                          // a cheer
    ctx.fillStyle = coat                                    // arms up, from the shoulders
    ctx.fillRect(x - 4, y - 10, 1, 4.5); ctx.fillRect(x + 4, y - 10, 1, 4.5)
    ctx.fillStyle = pal.skin
    ctx.fillRect(x - 4, y - 11, 1, 1); ctx.fillRect(x + 4, y - 11, 1, 1)
  } else {
    ctx.fillRect(x, y - 7.5, 1, 0.5)                        // a frown
    ctx.fillRect(x - 0.5, y - 7, 0.5, 0.5); ctx.fillRect(x + 1, y - 7, 0.5, 0.5)
  }
  if (kind === "explorer") {
    ctx.fillStyle = pal.rigDark
    ctx.fillRect(x - 2, y - 9.5, 5, 0.5)                    // goggle strap
    ctx.fillStyle = "#ffffff"
    ctx.fillRect(x + 2, y - 9.5, 0.5, 0.5)
  } else {
    ctx.fillStyle = pal.rigDark
    ctx.fillRect(x + 0.5, y - 5, 0.5, 0.5); ctx.fillRect(x + 0.5, y - 3.5, 0.5, 0.5)
  }
}

// ---------------------------------------------------------------------------
// The pit
//
// On the actors layer rather than the terrain layer, because the surface moves
// and the terrain layer only repaints when a cell changes. Nothing is ever
// drawn in front of it: the shaft is empty terrain all the way down, and a
// bridge laid over the hole sits at the corridor floor, several cells above
// the waterline.
// ---------------------------------------------------------------------------

function drawPits(ctx, w, pal) {
  if (!w.pits || !w.pits.length) return
  var k = w.k
  var C = k.CELL

  for (var i = 0; i < w.pits.length; i++) {
    var p = w.pits[i]
    var px = p.x0 * C
    var pw = (p.x1 - p.x0 + 1) * C
    var top = p.floorY * C
    var bot = k.ROWS * C

    // Depth first, and every pit gets it. A hole cut through the bedrock is
    // exactly the same colour as the corridor it opens off, so undrawn it reads
    // as a doorway rather than as a drop — which is a poor thing for the one
    // feature on the board that kills whatever walks into it.
    var deep = ctx.createLinearGradient(0, top, 0, bot)
    deep.addColorStop(0, pal.pitLip)
    deep.addColorStop(1, pal.pitDeep)
    ctx.fillStyle = deep
    ctx.fillRect(px, top, pw, bot - top)

    // The downdraught, drawn. Underwater a fall is a sink and a sink does not
    // hurt, so a trench that merely looked dark was the one feature on the
    // board built to be feared with nothing about it to fear. The pull is real
    // — see DOWNWELL_SPEED — and this is it on screen: streamlines running
    // down the throat of the hole, faster and brighter than the drifting motes
    // everywhere else, so a diver standing at the lip is standing somewhere
    // the audience can already see is going one way.
    if (w.submerged) {
      var t = w.ticks
      var lanes = Math.max(2, Math.floor(pw / 10))
      for (var ln = 0; ln < lanes; ln++) {
        var lx = px + 4 + ln * (pw / lanes)
        // Each lane runs at its own rate, which is what stops the column
        // reading as a barcode scrolling.
        var rate = 5.2 + (ln % 3) * 1.6
        var span = bot - top + 30
        for (var seg = 0; seg < 3; seg++) {
          var head = ((t * rate + ln * 37 + seg * 90) % span)
          var sy = top + head - 20
          if (sy > bot) continue
          var len = 9 + (ln % 2) * 5
          ctx.globalAlpha = 0.30 * Math.min(1, (bot - sy) / 60)
          ctx.fillStyle = pal.bubble
          ctx.fillRect(Math.round(lx), Math.round(Math.max(top, sy)),
                       1, Math.min(len, bot - Math.max(top, sy)))
          // An arrowhead on the leading end, so the direction survives a
          // still frame the way the current's does.
          var tip = Math.round(Math.max(top, sy) + Math.min(len, bot - Math.max(top, sy)))
          if (tip < bot - 1 && tip > top + 1) {
            ctx.fillRect(Math.round(lx) - 1, tip - 2, 1, 1)
            ctx.fillRect(Math.round(lx) + 1, tip - 2, 1, 1)
          }
        }
      }
      ctx.globalAlpha = 1

      // Silt going over the lip. A waterfall of sediment at the edges is what
      // says the hole is drawing from the corridor either side of it rather
      // than merely being a hole in the same water.
      ctx.fillStyle = pal.fish
      ctx.globalAlpha = 0.35
      for (var sp = 0; sp < 6; sp++) {
        var side = sp % 2 === 0 ? px + 1 : px + pw - 2
        var drop = ((t * 3.1 + sp * 24) % 42)
        ctx.fillRect(side, Math.round(top + drop), 1, 2)
      }
      ctx.globalAlpha = 1
    }

    if (!p.liquid) continue
    drawPool(ctx, w, pal, p, px, pw, bot)
  }
}

function drawPool(ctx, w, pal, p, px, pw, bot) {
  var C = w.k.CELL
  var sy = p.surfaceY * C
  var t = w.ticks

  var body = ctx.createLinearGradient(0, sy, 0, bot)
  body.addColorStop(0, pal.poolBody)
  body.addColorStop(1, pal.poolDeep)
  ctx.fillStyle = body
  if (p.wet) {
    // Paint the connected empty cells rather than the pit's original bounds.
    // Sim.js updates this mask whenever a bash or blast opens a side chamber.
    for (var wy = p.surfaceY; wy < w.k.ROWS; wy++) {
      var run = -1
      for (var wx = 0; wx <= w.k.COLS; wx++) {
        var wet = wx < w.k.COLS && p.wet[wy * w.k.COLS + wx]
        if (wet && run < 0) run = wx
        if (!wet && run >= 0) {
          ctx.fillRect(run * C, wy * C, (wx - run) * C, C)
          run = -1
        }
      }
    }
  } else {
    ctx.fillRect(px, sy, pw, bot - sy)
  }

  // The order from here is what makes a half-submerged animal work without a
  // single clip or a second sprite. The whole creature is drawn first, then the
  // water is laid back over everything below the line — so the part that is
  // under goes green-through-water and the part that is out stays sharp, and
  // an animal rising through the surface does it a pixel at a time for free.
  if (p.croc) drawCroc(ctx, w, pal, p, px, pw, sy)

  ctx.globalAlpha = 0.74
  ctx.fillStyle = pal.poolBody
  ctx.fillRect(px, sy + 1, pw, Math.min(20, bot - sy - 1))
  ctx.globalAlpha = 1

  // The waterline: two slow sine waves of different periods laid over each
  // other, so the surface never repeats on a count anybody can follow. Drawn
  // two pixels at a time, which at this scale is what keeps it a drawn line
  // rather than an anti-aliased smear.
  ctx.fillStyle = pal.poolLip
  for (var c = 0; c < pw; c += 2) {
    var wob = Math.sin(c * 0.11 + t * 0.045 + p.seed)
            + Math.sin(c * 0.047 - t * 0.028)
    ctx.fillRect(px + c, sy + Math.round(wob), 2, 2)
  }
  if (p.wet) {
    // New exposed surfaces in side chambers get their own waterline. The
    // original pit line above remains wavy; these smaller spills stay crisp.
    for (var fx = 0; fx < w.k.COLS; fx++)
      for (var fy = p.surfaceY; fy < w.k.ROWS; fy++) {
        var fi = fy * w.k.COLS + fx
        if (!p.wet[fi] || (fy > p.surfaceY && p.wet[fi - w.k.COLS])) continue
        ctx.fillRect(fx * C, fy * C, C, 2)
      }
  }

  // What the surface does when nobody is in it. Lava spits, coolant strobes
  // along its length, water catches the light — three pools that behave
  // differently enough that the biome is legible from the hole alone.
  if (p.liquid === "lava") {
    for (var e = 0; e < 5; e++) {
      var eph = (t * 0.9 + e * 137 + p.seed) % 220
      if (eph > 60) continue
      var ex = px + ((e * 53 + p.seed) % Math.max(1, pw - 2))
      ctx.globalAlpha = 1 - eph / 60
      ctx.fillStyle = e % 2 ? pal.poolGlint : pal.poolLip
      ctx.fillRect(ex, sy - Math.round(eph * 0.22), 1, 2)
    }
    ctx.globalAlpha = 1
  } else if (p.liquid === "oil") {
    // Neither glints nor churns. A slick drifts: broad bands of sheen that
    // slide along the surface, so the pool reads as something with a skin on
    // it rather than something with a depth to it.
    for (var sl = 0; sl < 3; sl++) {
      var band = (t * 0.22 + sl * 47 + p.seed) % (pw + 30) - 15
      ctx.globalAlpha = 0.16 + 0.07 * Math.sin(t * 0.02 + sl)
      ctx.fillStyle = sl % 2 ? pal.poolGlint : pal.poolLip
      ctx.fillRect(px + Math.round(band), sy + 1 + sl, 18, 1)
    }
    ctx.globalAlpha = 1
  } else if (p.liquid === "coolant") {
    var scan = (t * 1.6 + p.seed) % (pw + 40) - 20
    ctx.globalAlpha = 0.5
    ctx.fillStyle = pal.poolGlint
    ctx.fillRect(px + Math.round(scan), sy + 2, 14, 1)
    ctx.globalAlpha = 1
  } else {
    for (var g = 0; g < 3; g++) {
      var gx = px + ((g * 29 + p.seed + Math.floor(t / 40) * 7) % Math.max(1, pw - 6))
      ctx.globalAlpha = 0.30 + 0.22 * Math.sin(t * 0.06 + g)
      ctx.fillStyle = pal.poolGlint
      ctx.fillRect(gx, sy + 3, 4, 1)
    }
    ctx.globalAlpha = 1
  }

  // Somebody went in. Rings, for about a second and a half after.
  var age = t - p.ripple
  if (age >= 0 && age < 45) {
    ctx.globalAlpha = 1 - age / 45
    ctx.fillStyle = pal.poolLip
    for (var r = 0; r < 3; r++) {
      var rad = age * 0.9 + r * 7
      ctx.fillRect(px + pw / 2 - rad, sy + r, 2, 1)
      ctx.fillRect(px + pw / 2 + rad, sy + r, 2, 1)
    }
    ctx.globalAlpha = 1
  }
}

// Something lives in the swamp.
//
// It is scenery and nothing else: the water kills on contact whether or not
// anything is showing, and the simulation has never heard of this. But a jungle
// pool that is only ever a flat green rectangle is a texture, and the difference
// between a texture and a place is that something in it keeps its own schedule.
// It surfaces about every twenty-five seconds, crosses a stretch of the pool
// with its eyes and back ridges out, opens up once in the middle, and goes
// under — long enough to be worth catching, rare enough to still be worth
// catching the second time.
//
// The silhouette is the whole job at this size. A crocodile from the side is
// three lengths of nothing much — a long flat snout, a body a little thicker,
// and a tail — with exactly two things that say what it is: the brow with the
// eye on top of it, and the row of ridges down the back. Draw those two and it
// reads at forty pixels; leave them out and it is a floating log, which is what
// the first attempt looked like.
var CROC_CYCLE = 760
var CROC_SHOW = 230
var CROC_LEN = 34        // nose to tail tip, in pixels

// Un-themed, like the green hair and the orange umbrella. At this size it has
// to read as what it is without help from the palette.
var CROC_HIDE = "#3a7033"
var CROC_BACK = "#254a20"
var CROC_LIT = "#6aa855"
var CROC_EYE = "#f2d03a"
var CROC_TOOTH = "#f4f0e2"

// Every measurement in drawCroc is "this far back from the snout", whichever
// way the animal is pointing, which is what makes the mirror free: one set of
// numbers draws it swimming either way.
function crocBar(ctx, nose, dir, y, back, len, top, h) {
  var a = nose - dir * back
  var b = nose - dir * (back + len)
  ctx.fillRect(Math.min(a, b), y + top, len, h)
}

function drawCroc(ctx, w, pal, p, px, pw, sy) {
  // Wide pools only. A pit five cells across is twenty pixels, which is not
  // somewhere an animal swims across, it is somewhere one is wedged. In a pool
  // with just enough room to hold it and none to spare, it surfaces on the
  // spot instead of crossing — same rise, same gape, same slow sink.
  if (pw < CROC_LEN + 8) return
  var span = Math.max(0, pw - CROC_LEN - 10)

  var ph = (w.ticks + p.seed * 7) % CROC_CYCLE
  if (ph >= CROC_SHOW) return
  var u = ph / CROC_SHOW

  // Which way it swims alternates between visits, so the pool is not a conveyor
  // belt running one way forever.
  var dir = Math.floor((w.ticks + p.seed * 7) / CROC_CYCLE) % 2 ? -1 : 1
  var travel = dir > 0 ? u : 1 - u
  var nose = Math.round(px + 5 + travel * span + (dir > 0 ? CROC_LEN : 0))

  // Up on the way in, down on the way out, riding the swell in between. The
  // water is painted back over it afterwards, so "under" needs no special case:
  // it is the same animal, four pixels lower.
  var sink = 0
  if (u < 0.16) sink = (1 - u / 0.16) * 8
  else if (u > 0.84) sink = ((u - 0.84) / 0.16) * 8
  var y = sy + Math.round(sink + Math.sin(w.ticks * 0.05 + p.seed) * 0.8)
  if (sink > 7) return

  // Tail, swept and swaying. Two lengths rather than a taper, because a taper
  // at this size is one pixel of nothing.
  var sway = Math.round(Math.sin(w.ticks * 0.11 + p.seed) * 1.4)
  ctx.fillStyle = CROC_BACK
  crocBar(ctx, nose, dir, y, 26, 8, 3 + sway, 2)
  crocBar(ctx, nose, dir, y, 34, 5, 3 + sway * 2, 1)

  // Body, one pixel thicker than the snout and sitting a shade lower than the
  // head. That step from snout to body is most of what separates a crocodile
  // from a floating branch.
  ctx.fillStyle = CROC_HIDE
  crocBar(ctx, nose, dir, y, 15, 12, 0, 4)

  // Ridges: three bumps along the back, breathing out of step with each other,
  // so the line of them is never quite straight.
  ctx.fillStyle = CROC_BACK
  for (var b = 0; b < 3; b++)
    crocBar(ctx, nose, dir, y, 17 + b * 4, 3,
            -2 + Math.round(Math.sin(w.ticks * 0.08 + b * 0.9 + p.seed) * 0.5), 2)

  // The snout: long, flat and two pixels thick, which is the difference between
  // a crocodile and a hippopotamus. It gapes once, in the middle of the
  // crossing, and that is the whole performance.
  var gape = u > 0.42 && u < 0.62 ? Math.sin((u - 0.42) / 0.20 * Math.PI) : 0
  var jaw = Math.round(gape * 4)

  ctx.fillStyle = CROC_HIDE
  crocBar(ctx, nose, dir, y, 0, 13, 1, 2)              // lower jaw, on the water
  crocBar(ctx, nose, dir, y, 1, 12, -1 - jaw, 2)       // upper, hinged at the brow
  if (jaw > 0) {
    ctx.fillStyle = CROC_TOOTH
    for (var t2 = 0; t2 < 4; t2++) crocBar(ctx, nose, dir, y, 3 + t2 * 3, 1, 1 - jaw, jaw)
  }

  // A lit top edge, the same trick the earth uses: at this size a silhouette in
  // one flat colour is a shape, and a shape with a bright line along its top is
  // a thing with a back.
  ctx.fillStyle = CROC_LIT
  crocBar(ctx, nose, dir, y, 1, 11, -1 - jaw, 1)
  crocBar(ctx, nose, dir, y, 16, 11, 0, 1)

  // The brow, and the eye on top of it. This is the pixel that does the work.
  ctx.fillStyle = CROC_HIDE
  crocBar(ctx, nose, dir, y, 11, 5, -2, 5)
  ctx.fillStyle = CROC_EYE
  crocBar(ctx, nose, dir, y, 13, 2, -3, 2)
  ctx.fillStyle = pal.eye
  crocBar(ctx, nose, dir, y, dir > 0 ? 13 : 14, 1, -3, 2)

  // Nostril at the very tip. One pixel, and without it the snout is a plank.
  ctx.fillStyle = CROC_BACK
  crocBar(ctx, nose, dir, y, 2, 1, -1 - jaw, 1)

  // Wake, behind the tail and only when there is pool left to put it in — the
  // animal is drawn from its nose, so at one end of a crossing the wake would
  // otherwise be a bright line lying on the rock.
  var wake = nose - dir * (CROC_LEN + 4)
  if (wake > px + 2 && wake + 6 < px + pw) {
    ctx.globalAlpha = 0.45
    ctx.fillStyle = pal.poolLip
    ctx.fillRect(Math.min(wake, wake - 6), y + 2, 6, 1)
    ctx.globalAlpha = 1
  }
}

// The open sky above the earth was doing nothing but holding the hatch, and
// there is a whole band of it. When the level has a special, it gets a card up
// there: who is on the board, and one line about them.
//
// Three per special, picked by level number so it is the same line every time
// you come back to level 42 — the same rule the rest of the level runs on.
var SPECIAL_FACTS = {
  pkgmanager: [
    "ran out of bashers. Ran npm install.",
    "added 1 package, and 1,412 dependencies.",
    "works on its machine. Ships its machine.",
    "found 0 vulnerabilities. Did not look.",
    "pinned nothing. Everything still works. For now.",
    "delivers tools to colleagues who never asked.",
    "the lockfile is a suggestion.",
    "restocks the toolbar three times, then goes offline.",
    "peer dependency: a colleague who is still alive.",
    "your tool is in the post. The post is a crate."
  ],
  rubberduck: [
    "explains the problem slowly, out loud, to a duck.",
    "has never once needed to hear the duck reply.",
    "you were stuck. Now you are stuck with an audience.",
    "the bug was in your assumptions. It usually is.",
    "squeak. That is the whole code review.",
    "pairs with anyone. The duck pairs with everyone.",
    "works out loud so you do not have to.",
    "did you try describing what it actually does?",
    "a second pair of eyes, painted on.",
    "closes tickets it never opened."
  ],
  hotreload: [
    "restarts the process. The process was a colleague.",
    "your changes have been applied without losing state.",
    "has never once read the stack trace first.",
    "it worked on the second run. Ship it.",
    "keeps the module, swaps the outcome.",
    "turned it off and on again. Twice. That is the limit.",
    "remembers the trait, forgets the fall.",
    "does not travel. It is simply somewhere else now.",
    "rolls back one mistake per cooldown.",
    "you were never gone. You were cached."
  ],
  fallback: [
    "is the plan for when the plan hits the floor.",
    "catches what the happy path dropped.",
    "has never once been the primary.",
    "degrades gracefully, and makes you do it too.",
    "only works when everything else has failed.",
    "was configured years ago and finally got called.",
    "returns a safe default. You are the safe default.",
    "falls the way it handles errors: with a bounce.",
    "stands under the edge case so you do not have to.",
    "the umbrellas ran out. This did not."
  ],
  ratelimit: [
    "returns 429 to anything that moves too often.",
    "does not fix the danger. Schedules it.",
    "please retry after the colony has passed.",
    "believes every problem is a throughput problem.",
    "has never once been asked to go faster.",
    "falls the way it retries: exponentially.",
    "the turret has been asked to wait its turn.",
    "a quota is a kindness, explained slowly.",
    "is holding the door by holding everything else.",
    "your request is important to us. Please hold."
  ],
  ladder: [
    "calls itself, one rung at a time. There is no base case.",
    "grew the stack until something gave.",
    "has never returned from a call.",
    "was asked how to get up there and posted a ladder instead.",
    "marked this wall as a duplicate of the last wall.",
    "was closed as off-topic and kept building anyway.",
    "accepts the first answer that reaches the top.",
    "does not solve the wall. It appends to it.",
    "leaves the problem standing and the way up beside it.",
    "allocates one more frame. And then one more."
  ],
  bulwark: [
    "declines the request and the projectile.",
    "blocks pop-ups, darts and the occasional colleague.",
    "was told to be helpful and harmless. Harmless first.",
    "has never let anything through, including the point.",
    "refuses on principle, and on impact.",
    "considers every incoming token unsolicited.",
    "filters aggressively. Nothing gets past. Nothing gets done.",
    "cannot comply with that trajectory.",
    "has an allowlist of exactly nobody.",
    "is the last line of defence and will not stop saying so."
  ],
  buckshot: [
    "does not aim. Aiming is a form of doubt.",
    "solved it in one shot and cannot say which one.",
    "was asked for a door and delivered a doorway.",
    "has a context window of one wall.",
    "outputs everything it knows and stops mid-",
    "was asked to be concise. It has been trying.",
    "does not do drafts.",
    "answers every question at maximum length.",
    "has never been truncated. It has truncated.",
    "considers restraint an unsolved problem."
  ],
  roundhouse: [
    "does not destroy the wall. The wall relocates.",
    "moved the problem. That counts as solving it.",
    "roundhouse kicks in 512 dimensions.",
    "does not embed. It is embedded in the wall.",
    "was fine-tuned on one video and it shows.",
    "does not go around. Around is for the aligned.",
    "has never read the documentation for a wall.",
    "solved it laterally. Very laterally.",
    "kicked first and computed the gradient later.",
    "does not hallucinate walls. It relocates real ones."
  ],
  spider: [
    "indexed the ceiling. Nobody asked it to.",
    "respects no robots.txt.",
    "went up there to think and never came down.",
    "crawls everything, retains nothing.",
    "found the ceiling and marked it as canonical.",
    "reports 100% coverage of a surface nobody uses.",
    "escalated to the roof without being asked.",
    "reads top-down, literally.",
    "is exploring. It has been exploring for a while.",
    "has never once been where the exit is."
  ],
  forcepush: [
    "resolved the conflict by removing the branch.",
    "does not pull. It has never pulled.",
    "considered a smaller change and rejected it.",
    "rewrote history from forty feet away.",
    "was asked to review the wall and deleted it instead.",
    "believes the remote should match its local copy.",
    "has no merge strategy and does not need one.",
    "solves problems it cannot personally reach.",
    "left no conflict markers, or wall.",
    "reports the change as non-breaking."
  ],
  sapper: [
    "ignores everything above and does what the wall says.",
    "was told to be helpful, harmless and honest. Two of three.",
    "hid the instruction in the rock. The rock complied.",
    "reads its input a little too trustingly.",
    "found a system prompt in the bedrock.",
    "does not follow orders. It follows the last order.",
    "delegates to the explosion.",
    "was given guardrails and planted them.",
    "escalated privileges through a hole in the floor.",
    "does exactly what it was asked, which was the problem."
  ],
  piledriver: [
    "only knows one direction and is very confident about it.",
    "found a local minimum and moved in.",
    "has never once considered going up.",
    "descends. That is the entire architecture.",
    "converged early and stayed there.",
    "is very sure the answer is further down.",
    "has a learning rate nobody tuned.",
    "reached a plateau and kept going anyway.",
    "does not backtrack. Backtracking is for the uncertain.",
    "is optimising something. Not necessarily this."
  ],
  quarryman: [
    "needed one cell of room and took two hundred.",
    "does not summarise. It attends to everything at once.",
    "opened the whole thing to be sure.",
    "has quadratic instincts.",
    "loaded the entire level into memory.",
    "asked for more context and meant it.",
    "does not retrieve. It ingests.",
    "was told to be thorough exactly once.",
    "considers scoping a failure of ambition.",
    "reads the whole file to change one line."
  ],
  glazier: [
    "is the only one here that adds anything.",
    "lays a rail nobody asked for and everybody uses.",
    "cannot be talked into going round.",
    "is the constraint, and knows it.",
    "builds the floor it was going to need anyway.",
    "does not remove. It scaffolds.",
    "was aligned once and never got over it.",
    "produces a surface. That is the whole offering.",
    "is load-bearing in every sense.",
    "solves the gap by disagreeing that there is one."
  ],
  gridsearch: [
    "searched the whole grid one belt at a time.",
    "has enough RAM for exactly one more magazine.",
    "tried every bullet. One of them worked.",
    "considers precision a form of hesitation.",
    "does not tune hyperparameters. It suppresses them.",
    "brute force is a strategy if you bring enough ammunition.",
    "is one of two agents the machinery is afraid of.",
    "was asked to narrow the search. It opened fire.",
    "draws first, then searches for an explanation.",
    "calls collateral damage exhaustive evaluation."
  ],
  beamsearch: [
    "keeps only the most promising candidate. Then shoots it.",
    "picked a spot and has not moved since.",
    "prunes at range.",
    "does not explore. It waits for the branch to come to it.",
    "has line of sight and infinite patience.",
    "is not going home and has made peace with that.",
    "the danger was a candidate. It is not any more.",
    "evaluates from cover.",
    "one shot, then a long think about the next one.",
    "sets up, sights, and lets the level come to it."
  ],
  wraith: [
    "walked through the wall and reported it as solved.",
    "sees a corridor. There is no corridor.",
    "is not stuck. Everyone else is stuck.",
    "confidently describes a route that does not exist.",
    "passed the benchmark and none of the levels.",
    "solved it for itself and filed that as done.",
    "cites a passage the rock does not contain.",
    "is very sure, which is the problem.",
    "does not collaborate. It phases.",
    "left the level exactly as it found it and took credit."
  ],
  autocomplete: [
    "finished the bridge and the next three bridges.",
    "knows what you meant. This is worse.",
    "completed the sentence, tunnel and surrounding geology.",
    "was asked for one step and supplied the staircase.",
    "predicts the next token is always more floor.",
    "cannot stop while there is whitespace remaining.",
    "helpfully continued past the useful part.",
    "turned a suggestion into infrastructure.",
    "has never met an ending it could not extend.",
    "pressed Tab on the physical world."
  ],
  chainthought: [
    "brought four premises and misplaced the conclusion.",
    "shows its working. Everyone is in it now.",
    "linked the agents logically, not safely.",
    "reasoned through the wall and took witnesses.",
    "has several steps. None are optional.",
    "made the others follow its train of thought.",
    "the conclusion was on the far side all along.",
    "cannot think quietly or alone.",
    "mistook consensus for correctness at speed.",
    "has a long chain and one weak link per agent."
  ],
  specdecoder: [
    "tried three futures and billed for all of them.",
    "drafted ahead and deleted the witnesses.",
    "committed to the least visibly impossible route.",
    "moves faster by being wrong in parallel.",
    "accepted one future and ghosted the others.",
    "predicts several exits. One occasionally exists.",
    "has already been where it might be going.",
    "discarded two excellent mistakes per step.",
    "branches first and asks about reality later.",
    "calls teleporting a decoding optimisation."
  ],
  collapse: [
    "trained a copy on a copy of this sentence.",
    "each generation remembers fewer pixels.",
    "scaled out and quality went with it.",
    "made a cheaper model of a cheaper decision.",
    "the copies agree because nuance was removed.",
    "has reproduced the error with high fidelity.",
    "distilled itself until only confidence remained.",
    "creates synthetic agents from organic mistakes.",
    "the third copy is mostly robe and conviction.",
    "collapsed the distribution into a small crowd."
  ]
}

// One hump or two (variant), a long neck carried forward, and legs that
// swing in pairs once it is walking. The hump is what makes it a camel at
// eight pixels tall; everything else is a horse.
function drawCamel(ctx, t, x, y, dir, pal) {
  var tan = "#c99a5b", dark = "#8a6436"
  var stride = t.freed ? Math.floor(t.anim / 4) % 2 : 0
  ctx.fillStyle = tan
  ctx.fillRect(x - 5, y - 8, 10, 4)                            // body
  if ((t.variant || 0) % 2) {
    ctx.fillRect(x - 4, y - 10, 3, 2); ctx.fillRect(x + 1, y - 10, 3, 2)
  } else ctx.fillRect(x - 3, y - 11, 5, 3)                     // hump
  ctx.fillRect(x + dir * 5 - (dir < 0 ? 2 : 0), y - 12, 2, 6)   // neck
  ctx.fillRect(x + dir * 6 - (dir < 0 ? 3 : 0), y - 13, 3, 2)   // head
  ctx.fillStyle = dark
  ctx.fillRect(x - 4, y - 4, 1, 4 - stride); ctx.fillRect(x - 2, y - 4, 1, 3 + stride)
  ctx.fillRect(x + 2, y - 4, 1, 4 - stride); ctx.fillRect(x + 4, y - 4, 1, 3 + stride)
  ctx.fillRect(x - dir * 6 - (dir > 0 ? 0 : 1), y - 8, 1, 3)    // tail
  ctx.fillStyle = "#1c1c22"
  ctx.fillRect(x + dir * 7 - (dir < 0 ? 1 : 0), y - 13, 1, 1)   // eye
}

// A bust of the special, drawn at double size so it reads as a portrait rather
// than as an agent that wandered into the sky.
function drawBust(ctx, x, y, sp, pal, submerged, fine) {
  var P = 2
  function px(bx, by, bw, bh, fill) { ctx.fillStyle = fill; ctx.fillRect(x + bx * P, y + by * P, bw * P, bh * P) }
  // Dressed like the colony it came out of. This was still wearing the old
  // face — one eye pixel, no collar — while every agent on the board below it
  // had shades and a shirt, and a portrait that does not match the sprite it
  // is captioning is worse than no portrait. The same argument applies to the
  // helmet: on a Trench level every agent under this card has one, so a
  // portrait with a bare face is the same mismatch again.
  if (submerged) {
    px(2, 0, 4, 1, pal.helmetDark)
    px(1, 1, 6, 5, pal.helmetDark)
    px(3, 0, 2, 1, pal.helmet)
    px(2, 1, 4, 4, pal.helmet)
    px(3, 0, 1, 1, pal.helmetLit)
    px(4, 2, 2, 3, pal.port)
    px(4, 2, 1, 1, pal.bubbleLit)
    px(1, 6, 6, 1, pal.helmetDark)   // the bolted collar
    px(1, 6, 6, 5, sp.robe)          // shoulders
    px(0, 7, 1, 4, sp.robe)
    px(7, 7, 1, 4, sp.robe)
    px(1, 8, 2, 2, sp.hair)          // the shoulder pip
    return
  }
  px(1, 0, 6, 3, sp.hair)          // hair
  px(0, 1, 1, 2, sp.hair)          // and the back of the head
  px(2, 3, 4, 3, pal.skin)         // face
  px(6, 4, 1, 1, pal.skin)         // nose, on the side it is facing
  px(2, 4, 5, 1, pal.eye)          // shades, out over it
  px(5, 4, 1, 1, pal.lens)         // the lit lens
  px(1, 6, 6, 5, sp.robe)          // shoulders
  px(0, 7, 1, 4, sp.robe)
  px(7, 7, 1, 4, sp.robe)
  px(3, 6, 2, 2, pal.shirt)        // collar and shirt front
  px(1, 8, 2, 2, sp.hair)          // the shoulder pip, same as on the board
  if (fine) drawBustFine(px, sp, pal)
}

// The portrait at res 2: quarter-block detail on the face and the suit. The
// card is up all level on nearly every level, and the agents under it got
// their ties and glints long before the picture of their hero did.
function drawBustFine(px, sp, pal) {
  px(1.5, 0.5, 4, 0.25, "#ffffff22")                 // light on the hair
  px(2, 1.75, 0.25, 1.25, "#00000033")               // strands
  px(3.5, 1.5, 0.25, 1.5, "#00000033")
  px(1.5, 3.25, 0.5, 1, pal.skin)                    // ear
  px(1.5, 4, 0.75, 0.25, pal.eye)                    // glasses arm
  px(5.25, 4, 0.25, 0.25, "#ffffff")                 // glint
  px(3.25, 5.25, 1.5, 0.25, "#00000055")             // the smirk
  px(4.5, 5, 0.25, 0.25, "#00000055")
  px(2, 5.75, 4, 0.25, "#00000033")                  // chin shadow
  px(3.75, 6, 0.5, 2.5, pal.eye)                     // tie
  px(3.5, 6, 1, 0.5, pal.eye)
  px(2.5, 6, 0.25, 2, "#ffffff33")                   // lapels
  px(5.25, 6, 0.25, 2, "#ffffff33")
  px(1.25, 8, 1.5, 0.25, "#ffffff55")                // light on the pip
  px(0.75, 7, 0.25, 4, "#00000033")                  // shoulder seam
}

function drawSpecialCard(ctx, w, pal) {
  if (!w.special || !w.specialSpec) return
  var box = skyLayout(w)
  if (box.width < 40) return
  var sp = w.specialSpec
  var amount = Math.min(1, w.ticks / 12) * (1 - skyNoticeAmount(w, pal))
  ctx.save()
  skyClip(ctx, box)
  ctx.translate(0, -Math.round((1 - amount) * (box.height + 1)))
  drawSkyPanel(ctx, pal, box.x, 1, box.width, box.height, sp.robe, pal.hatchLip)
  var portraitX = box.right ? box.x + box.width - 24 : box.x + 2
  drawSkyPanel(ctx, pal, portraitX, 1, 22, box.height, sp.robe, sp.hair)
  drawBust(ctx, portraitX + 3, 3, sp, pal, w.submerged, (w.res || 1) >= 2)
  drawSkyCardText(ctx, w, pal, box)
  ctx.restore()
}

function skyCardTextBox(box) {
  return { x: box.x + (box.right ? 6 : 28), width: box.width - 34 }
}

function skyMissionAlpha(w) {
  if (!w.mission) return 0
  if (!w.mission.done) return 1
  return Math.max(0, 1 - (w.ticks - w.mission.openedAt) / 45)
}

function skyNameWidth(w, width) {
  if (skyMissionAlpha(w) > 0) return Math.floor(width * 0.43)
  return width
}

function drawSkyCardText(ctx, w, pal, box) {
  var sp = w.specialSpec, textBox = skyCardTextBox(box)
  ctx.textAlign = "left"
  ctx.font = "bold 8px monospace"
  ctx.fillStyle = pal.label
  ctx.fillText(skyFitText(ctx, sp.name, skyNameWidth(w, textBox.width)), textBox.x, 11)
  ctx.font = "7px monospace"
  ctx.fillStyle = pal.label
  var facts = SPECIAL_FACTS[sp.id] || [""]
  ctx.fillText(skyFitText(ctx, facts[(w.factPick || 0) % facts.length], textBox.width), textBox.x, 22)
}

function drawSkyMission(ctx, w, pal) {
  var alpha = skyMissionAlpha(w)
  if (alpha <= 0) return
  var box = skyLayout(w)
  if (box.width < 40) return
  var amount = Math.min(1, w.ticks / 12) * (1 - skyNoticeAmount(w, pal))
  ctx.save()
  skyClip(ctx, box)
  ctx.translate(0, -Math.round((1 - amount) * (box.height + 1)))
  var textBox = { x: box.x + 7, width: box.width - 14 }
  if (w.special && w.specialSpec) textBox = skyCardTextBox(box)
  else drawSkyPanel(ctx, pal, box.x, 1, box.width, box.height, pal.warn, pal.hatchLip)
  drawSkyMissionText(ctx, w, pal, textBox, alpha)
  ctx.restore()
}

function drawSkyMissionText(ctx, w, pal, box, alpha) {
  var x = box.x, width = box.width
  if (w.special && w.specialSpec) {
    var nameWidth = skyNameWidth(w, width)
    x += nameWidth + 9
    width -= nameWidth + 9
    ctx.fillStyle = pal.rigDark
    ctx.fillRect(x - 5, 4, 1, 7)
  }
  ctx.globalAlpha = alpha
  ctx.font = "bold 8px monospace"
  ctx.textAlign = "left"
  ctx.fillStyle = w.mission.done ? pal.exitLight : pal.warn
  var text = w.mission.done ? "MISSION COMPLETE — EXIT ONLINE" : "MISSION: " + w.mission.verb
  ctx.fillText(skyFitText(ctx, text, width), x, 11)
}

// The trapdoor the colony comes out of. Panelled and riveted so it reads as
// a machine and not a slab; two doors that swing down before the first drop
// and come back up once the last agent is through; a lamp that blinks while
// it is releasing; and a flash in the mouth on each drop. It is open exactly
// as long as it is doing something, which is the whole of its story.
var HATCH_SWING = 18      // ticks for a door to swing fully open or shut
function hatchOpen(w) {
  var opening = Math.min(1, w.ticks / HATCH_SWING)
  if (w.released < w.toRelease || w.lastReleaseAt < 0) return opening
  var since = w.ticks - w.lastReleaseAt - 30
  return since <= 0 ? opening : Math.max(0, 1 - since / HATCH_SWING)
}

function drawHatch(ctx, w, pal) {
  var k = w.k
  var C = k.CELL
  var x = Math.round(w.hatch.x * C)
  var y = w.hatch.y * C
  var open = hatchOpen(w)
  var releasing = w.released < w.toRelease

  ctx.fillStyle = pal.hatchBody
  ctx.fillRect(x - 14, y - 10, 28, 10)
  ctx.fillStyle = pal.rigDark
  ctx.fillRect(x - 14, y - 10, 28, 2)                  // the roof of the housing
  for (var seam = -7; seam <= 7; seam += 7) ctx.fillRect(x + seam, y - 8, 1, 6)
  ctx.fillStyle = pal.hatchLip
  for (var rv = -12; rv <= 12; rv += 24) { ctx.fillRect(x + rv, y - 7, 1, 1); ctx.fillRect(x + rv, y - 4, 1, 1) }
  ctx.fillRect(x - 16, y - 2, 32, 4)

  // The lamp: blinking while there are agents still to come, dark after.
  var lit = releasing && Math.floor(w.ticks / 8) % 2 === 0
  ctx.fillStyle = lit ? pal.exitLight : pal.rigDark
  ctx.fillRect(x - 1, y - 13, 3, 3)
  if ((w.res || 1) >= 2) drawHatchFine(ctx, pal, x, y, lit)

  // The mouth, and the light of a drop going through it.
  ctx.fillStyle = pal.hatchMouth
  ctx.fillRect(x - 9, y + 2, 18, 3)
  if (releasing && w.ticks - w.lastReleaseAt < 4 && w.lastReleaseAt >= 0) {
    ctx.fillStyle = pal.exitLight
    ctx.globalAlpha = 0.6
    ctx.fillRect(x - 8, y + 2, 16, 2)
    ctx.globalAlpha = 1
  }

  // Two doors hinged at the sides of the mouth, swinging down and out.
  var ang = open * Math.PI * 0.5
  ctx.fillStyle = pal.hatchBody
  for (var i = 0; i < 9; i++) {
    var dx = Math.round(i * Math.cos(ang)), dy = Math.round(i * Math.sin(ang))
    ctx.fillRect(x - 9 + dx, y + 2 + dy, 1, 2)
    ctx.fillRect(x + 8 - dx, y + 2 + dy, 1, 2)
  }
}

// The hatch at half-pixel detail: each panel bevelled — light on its top and
// left, shadow on its right — rivets along the roof, a bolt at each end of the
// lip, and a glass lamp with a glint and, when lit, a halo.
function drawHatchFine(ctx, pal, x, y, lit) {
  for (var p = -14; p < 14; p += 7) {
    ctx.fillStyle = pal.hatchLip
    ctx.globalAlpha = 0.45
    ctx.fillRect(x + p + (p > -14 ? 1 : 0), y - 8, 6 - (p > -14 ? 1 : 0), 0.5)
    ctx.fillRect(x + p + (p > -14 ? 1 : 0), y - 8, 0.5, 6)
    ctx.fillStyle = pal.rigDark
    ctx.fillRect(x + p + 6.5, y - 7.5, 0.5, 5.5)
    ctx.globalAlpha = 1
  }
  ctx.fillStyle = pal.hatchLip
  for (var r = -12; r <= 12; r += 4) ctx.fillRect(x + r, y - 9.5, 0.5, 0.5)
  ctx.fillStyle = "#ffffff"
  ctx.globalAlpha = 0.35
  ctx.fillRect(x - 16, y - 2, 32, 0.5)                        // light on the lip
  ctx.fillStyle = pal.rigDark
  ctx.globalAlpha = 0.6
  ctx.fillRect(x - 16, y + 1.5, 32, 0.5)                      // and its underside
  ctx.globalAlpha = 1
  for (var bt = -14.5; bt <= 14; bt += 28.5) {                // a bolt at each end
    ctx.fillStyle = pal.rigDark
    ctx.fillRect(x + bt, y - 1, 1, 1)
    ctx.fillStyle = "#ffffff"
    ctx.fillRect(x + bt, y - 1, 0.5, 0.5)
  }
  ctx.fillStyle = "#ffffff"
  ctx.fillRect(x - 0.5, y - 12.5, 0.5, 0.5)                    // the lamp's glint
  if (!lit) return
  ctx.fillStyle = pal.exitLight
  ctx.globalAlpha = 0.55
  ctx.fillRect(x - 2.5, y - 14.5, 6, 0.5)
  ctx.fillRect(x - 2.5, y - 10.5, 6, 0.5)
  ctx.fillRect(x - 2.5, y - 14, 0.5, 3.5)
  ctx.fillRect(x + 3, y - 14, 0.5, 3.5)
  ctx.globalAlpha = 1
}

function drawEnemyHatch(ctx, w, pal, opts) {
  if (!w.enemyHatch) return
  var C = w.k.CELL
  var x = w.enemyHatch.x * C
  var y = (w.enemyHatch.y + 1) * C
  var biome = w.enemyHatch.biome || w.biome
  var wall = pal.steel, roof = pal.steelShade, edge = pal.steelEdge, sign = "GUARD PROCESS"
  if (biome === "Cavern") { wall = pal.rock; roof = pal.rockShade; edge = pal.rockEdge; sign = "CAVEAT EMPTOR" }
  else if (biome === "Ruins") { wall = pal.dirt; roof = pal.dirtShade; edge = pal.dirtEdge; sign = "LEGACY SUPPORT" }
  else if (biome === "Frost") { wall = pal.decor; roof = pal.rock; edge = pal.decorLit; sign = "ICE SECURITY" }
  else if (biome === "Foundry") { wall = pal.steelShade; roof = pal.rigDark; edge = pal.steelEdge; sign = "FIREWALL" }
  else if (biome === "Jungle") { wall = pal.decor; roof = pal.decorDim; edge = pal.decorLit; sign = "BRANCH OFFICE" }
  else if (biome === "Ice Cave") { wall = pal.ore; roof = pal.rockShade; edge = pal.oreEdge; sign = "COLD STORAGE" }
  else if (biome === "Spaceship") { wall = pal.steel; roof = pal.rigDark; edge = pal.steelEdge; sign = "REMOTE OFFICE" }
  else if (biome === "Skyscraper") { wall = pal.dirt; roof = pal.rig; edge = pal.dirtEdge; sign = "MIDDLE MANAGEMENT" }
  else if (biome === "Desert") { wall = pal.ore; roof = pal.dirtShade; edge = pal.oreEdge; sign = "SANDBOX ESCAPE" }
  else if (biome === "Data Center") { wall = pal.steel; roof = pal.rigDark; edge = pal.oreEdge; sign = "SHADOW IT" }
  else if (biome === "Mail Room") { wall = pal.dirt; roof = pal.urgent; edge = pal.oreEdge; sign = "MAILER DAEMON" }
  else if (biome === "Library") { wall = pal.dirt; roof = pal.dirtShade; edge = pal.oreEdge; sign = "STACK OVERFLOW" }
  else if (biome === "Clock Tower") { wall = pal.dirt; roof = pal.oreShade; edge = pal.oreEdge; sign = "WATCHDOG TIMER" }
  else if (biome === "Building Site") { wall = pal.rock; roof = pal.ore; edge = pal.oreEdge; sign = "BUILD FAILED" }

  // Barely larger than an agent: a sentry booth, not a second landmark. Its
  // materials come from the current theme; biome identity is in the roofline.
  ctx.fillStyle = wall
  ctx.fillRect(x - 9, y - 15, 18, 15)
  ctx.fillStyle = roof
  if (biome === "Frost") {
    ctx.fillRect(x - 6, y - 19, 12, 2); ctx.fillRect(x - 9, y - 17, 18, 2)
  } else if (biome === "Jungle") {
    ctx.fillRect(x - 11, y - 19, 22, 3); ctx.fillRect(x - 7, y - 22, 14, 3)
  } else if (biome === "Clock Tower") {
    drawClockBoothTop(ctx, pal, x, y)
  } else if (biome === "Building Site") {
    drawSiteBoothTop(ctx, pal, x, y)
  } else if (biome === "Mail Room") {
    drawMailBoothTop(ctx, pal, x, y)
  } else if (biome === "Library") {
    drawLibraryBoothTop(ctx, pal, x, y)
  } else if (biome === "Ice Cave") {
    hzTri(ctx, x - 5, y - 15, 4, 7, -1); hzTri(ctx, x + 4, y - 15, 5, 10, -1)
  } else {
    ctx.fillRect(x - 10, y - 18, 20, 3)
    if (biome === "Foundry") ctx.fillRect(x + 5, y - 24, 3, 6)
    if (biome === "Ruins") { ctx.fillRect(x - 8, y - 21, 4, 3); ctx.fillRect(x + 4, y - 20, 4, 2) }
    if (biome === "Spaceship") { ctx.fillRect(x - 12, y - 16, 2, 11); ctx.fillRect(x + 10, y - 16, 2, 11) }
  }
  ctx.fillStyle = edge
  ctx.fillRect(x - 9, y - 15, 18, 2)
  ctx.fillStyle = pal.hatchMouth
  ctx.fillRect(x - 3, y - 10, 7, 10)                // deployment door
  ctx.fillStyle = pal.urgent
  ctx.fillRect(x + 1, y - 8, 1, 1)                  // one hostile status LED
  if (opts && opts.labels) {
    ctx.fillStyle = pal.warn
    ctx.font = "bold 6px monospace"
    ctx.textAlign = "center"
    ctx.fillText(sign, x, y - 23)
    ctx.textAlign = "left"
  }
}

function drawExitGlow(ctx, w, pal) {
  var k = w.k
  var C = k.CELL
  var e = w.exit
  var missionOpening = w.mission && (!w.mission.done || w.ticks - w.mission.openedAt < 24)
  var pulse = missionOpening ? 0 : 0.45 + 0.3 * Math.sin(w.ticks * 0.06)
  var x = e.x * C
  var y = e.y * C
  var ww = e.w * C
  var hh = e.h * C

  ctx.globalAlpha = pulse
  ctx.fillStyle = pal.exitLight
  ctx.fillRect(x + 2, y + hh - 6, ww - 4, 5)
  ctx.globalAlpha = pulse * 0.45
  ctx.fillRect(x - 3, y - 5, ww + 6, hh + 6)
  ctx.globalAlpha = 1
  if ((w.res || 1) >= 2 && !missionOpening) drawExitShimmer(ctx, w, pal, x, y, ww, hh)
}

// The open door at res 2: bands of light climbing the mouth, a few sparks
// drifting up through it, and light spilled across the floor in front. A door
// that is doing something reads as a way out from across the board; a flat
// pane reads as a window.
function drawExitShimmer(ctx, w, pal, x, y, ww, hh) {
  var t = w.ticks
  ctx.fillStyle = pal.exitLight
  for (var b = 0; b < 4; b++) {
    var by = y + hh - 1 - ((t * 0.35 + b * hh / 4) % hh)
    ctx.globalAlpha = 0.18 + 0.25 * ((by - y) / hh)
    ctx.fillRect(x + 1, Math.round(by * 2) / 2, ww - 2, 0.5)
  }
  ctx.fillStyle = "#ffffff"
  for (var sp = 0; sp < 5; sp++) {
    var sx = x + 1.5 + ((sp * 37 + w.level * 11) % Math.max(1, ww - 3))
    var sy = y + hh - 1 - ((t * (0.25 + sp * 0.06) + sp * 7) % (hh - 1))
    ctx.globalAlpha = 0.7 * ((sy - y) / hh)
    ctx.fillRect(Math.round(sx * 2) / 2, Math.round(sy * 2) / 2, 0.5, 0.5)
  }
  ctx.fillStyle = pal.exitLight
  ctx.globalAlpha = 0.35 + 0.15 * Math.sin(t * 0.06)
  ctx.fillRect(x - 4, y + hh, ww + 8, 0.5)
  ctx.globalAlpha = 0.18
  ctx.fillRect(x - 8, y + hh + 0.5, ww + 16, 0.5)
  ctx.globalAlpha = 1
}

function drawExitGate(ctx, w, pal) {
  var m = w.mission
  if (!m) return
  var C = w.k.CELL
  var e = w.exit
  var x = e.x * C, y = e.y * C
  var ww = e.w * C, hh = e.h * C
  var opening = m.done ? Math.min(1, Math.max(0, (w.ticks - m.openedAt) / 24)) : 0
  var panel = Math.ceil(ww * (1 - opening) / 2)

  // Two heavy panels retract into the jambs. Drawing them on the actor layer
  // keeps all 24 opening frames live while the terrain layer remains cached.
  if (panel > 0) {
    ctx.fillStyle = pal.steelShade
    ctx.fillRect(x, y, panel, hh)
    ctx.fillRect(x + ww - panel, y, panel, hh)
    ctx.fillStyle = pal.steelEdge
    ctx.fillRect(x + panel - 2, y, 2, hh)
    ctx.fillRect(x + ww - panel, y, 2, hh)
    ctx.fillStyle = pal.rigDark
    for (var sy = y + 3; sy < y + hh; sy += 6) {
      ctx.fillRect(x + 2, sy, Math.max(0, panel - 4), 1)
      ctx.fillRect(x + ww - panel + 2, sy, Math.max(0, panel - 4), 1)
    }
  }

  // Locked: a slow red warning. Opening: a quick amber chatter. Online: a
  // bright green-ish pulse in the palette's exit colour.
  var blink = m.done ? Math.floor(w.ticks / (opening < 1 ? 2 : 9)) % 2 === 0
                     : Math.floor(w.ticks / 12) % 2 === 0
  ctx.fillStyle = m.done && opening >= 1 ? pal.exitLight : pal.urgent
  ctx.globalAlpha = blink ? 1 : 0.22
  ctx.fillRect(x + ww - 4, y - 5, 4, 3)
  ctx.globalAlpha = 1
}

// Each danger gets its own fixture and effect; a level may
// now contain several, and shared silhouettes would turn that into visual soup.
// A hazard you cannot tell from the last one is, from where the viewer sits,
// the same hazard.
//
// Charge stays visible throughout, builds from the fixture, and never borrows
// the full lethal effect. Fire snaps; the first twelve rest ticks settle.
// All animation is derived from the phase clock, never stored on the world.

// A triangle standing on its base, or hanging from it. Teeth, spikes, jaws and
// stalactite-shaped things are all this.
function hzTri(ctx, cx, baseY, halfW, height, dir) {
  for (var i = 0; i < height; i++) {
    var hw = Math.max(0, Math.round(halfW * (1 - i / height)))
    ctx.fillRect(cx - hw, baseY + dir * i, hw * 2 + 1, 1)
  }
}

// A jagged line between two points: arcs, sparks, lightning.
function hzBolt(ctx, x0, y0, x1, y1, seed, amp) {
  var steps = 6
  var px = x0, py = y0
  for (var i = 1; i <= steps; i++) {
    var t = i / steps
    var nx = x0 + (x1 - x0) * t
    var ny = y0 + (y1 - y0) * t
    if (i < steps) {
      var j = ((seed + i * 37) % 7) - 3
      if (Math.abs(x1 - x0) > Math.abs(y1 - y0)) ny += j * amp
      else nx += j * amp
    }
    var dx = nx - px, dy = ny - py
    var n = Math.max(1, Math.round(Math.max(Math.abs(dx), Math.abs(dy))))
    for (var k2 = 0; k2 <= n; k2++) ctx.fillRect(Math.round(px + dx * k2 / n), Math.round(py + dy * k2 / n), 1, 1)
    px = nx; py = ny
  }
}

function drawHazardKind(ctx, w, pal, h) {
  var C = w.k.CELL
  var x0 = h.zx0 * C, x1 = (h.zx1 + 1) * C
  var y0 = h.zy0 * C, y1 = (h.zy1 + 1) * C
  var cx = Math.round((x0 + x1) / 2)
  var wide = x1 - x0, tall = y1 - y0
  var live = h.phase === "fire", winding = h.phase === "charge"
  var t = w.ticks, seed = h.zx0
  var progress = winding ? Math.min(1, h.t / (HAZARD_CHARGE[h.kind] || 1)) : 0
  var cool = h.phase === "rest" && !h.throttled && h.fired > 0 ? Math.max(0, 1 - h.t / 12) : 0
  var show = live || winding
  var hot = live || (winding && progress > 0.65) ? pal.fireHot : pal.warn
  // The frame every drawing below is measured against, worked out once.
  var geo = { C: C, x0: x0, x1: x1, y0: y0, y1: y1, cx: cx, wide: wide, tall: tall,
    live: live, winding: winding, t: t, seed: seed, show: show, hot: hot,
    progress: progress, cool: cool }
  var draw = HAZARD_DRAW[h.kind] || drawHzDefault
  draw(ctx, w, pal, h, geo)
  var fine = (w.res || 1) >= 2 && HAZARD_FINE[h.kind]
  if (fine) fine(ctx, w, pal, h, geo)
}

// Visual wind-up lengths only; test/hazards.test.js guards this mirror of the
// simulation timings. Draw cannot call hazardSpec in the panel's QML scope.
var HAZARD_CHARGE = {
  gun: 16, sentry: 34, turret: 18, darts: 18, flame: 30, tesla: 24, sniper: 44,
  lasergrid: 30, sweeper: 26, tripwire: 20, spikes: 16, beartrap: 8, sawblade: 20,
  grinder: 24, crusher: 34, pendulum: 28, geyser: 30, rockfall: 36, piston: 18,
  echobat: 24, scarab: 18, snowball: 28, molten: 26, hotaisle: 26, scorpion: 22,
  snake: 20, spores: 30, vinelock: 14, icicle: 32, frostjet: 22, blackice: 12,
  airlock: 34, servo: 18, packetloss: 24, stamper: 30, flywheel: 26, steamvent: 26,
  sprinkler: 26, polisher: 22, shredder: 16, shark: 30, current: 26, vent: 28
}

// A small running light, then a filling bank of warning lamps. The tell is
// solid even between pulses; a flash belongs to the first few fire ticks only.
function hzLamp(ctx, pal, h, g, x, y) {
  var n = g.winding ? 1 + Math.floor(g.progress * 3) : 1 + Math.ceil(g.cool * 2)
  ctx.fillStyle = pal.rigDark
  ctx.fillRect(x, y, 4, 1)
  ctx.fillStyle = g.show ? g.hot : pal.warn
  ctx.globalAlpha = g.show || g.cool ? 1 : (0.25 + 0.25 * (Math.floor(g.t / 24) % 2))
  ctx.fillRect(x, y, n, 1)
  ctx.globalAlpha = 1
  if (g.live && h.t < 3) {
    ctx.fillStyle = pal.fireHot
    ctx.fillRect(x - 1, y - 1, 6, 1)
  }
}

// A pilot/drip at idle, pressure gathering at the outlet, a hot core on
// release, then three short wisps. Whole pixels carry it; res 2 adds a glint.
function hzPressure(ctx, w, pal, h, g, x, y, color) {
  var strength = g.winding ? 0.4 + g.progress * 0.6 : g.cool
  if (g.live) strength = 1
  if (!g.show && !g.cool) strength = Math.floor(g.t / 24) % 2 * 0.2
  ctx.fillStyle = color
  ctx.globalAlpha = strength
  for (var i = 0; i < 3; i++) {
    var lift = (h.t + i * 3) % 9
    ctx.fillRect(x - 2 + i * 2, y - 1 - lift, 1 + Math.round(strength), 1)
  }
  ctx.globalAlpha = 1
  if ((w.res || 1) >= 2 && g.show) {
    ctx.fillStyle = pal.fireHot
    ctx.fillRect(x - 0.5, y - 0.5, 1, 0.5)
  }
}

// Contact sparks/dust stay close to the impact, never claim another corridor.
function hzImpact(ctx, pal, h, g, x, y, color) {
  var energy = g.cool
  if (g.live && h.t < 4) energy = 1 - h.t / 6
  if (!energy) return
  ctx.fillStyle = color
  ctx.globalAlpha = energy
  for (var i = 0; i < 4; i++) {
    var side = i % 2 ? 1 : -1
    ctx.fillRect(Math.round(x + side * (3 + (1 - energy) * 6 + (i >> 1) * 3)),
      Math.round(y - 1 - (i >> 1) * 2 - energy * 2), 2, 1)
  }
  ctx.globalAlpha = 1
}

function hzStroke(g, full, windup) {
  if (g.live) return full
  if (g.cool) return Math.round(full * g.cool)
  return g.winding ? Math.round(windup * (0.3 + g.progress * 0.7)) : 0
}

// Half-pixel detail at res 2 for the commonest fixtures, laid over the coarse
// drawing and inside its silhouette — the agents' rule (drawAgentFine).
var HAZARD_FINE = {
  fence: function (ctx, w, pal, h, g) {
    ctx.fillStyle = "#e9edf7"                                   // insulators
    for (var p = 0; p < 2; p++) for (var i = 0; i < 3; i++)
      ctx.fillRect((p ? g.x1 - 1.5 : g.x0 + 0.5), g.y0 + 3.5 + i * Math.max(2, Math.round((g.tall - 6) / 3)), 1, 1)
    ctx.fillStyle = pal.warn                                    // a warning plate
    ctx.fillRect(g.cx - 1.5, g.y1 - 5, 3, 2)
    ctx.fillStyle = "#1c1c22"
    ctx.fillRect(g.cx - 0.5, g.y1 - 4.5, 1, 1)
  },
  tripwire: function (ctx, w, pal, h, g) {
    ctx.fillStyle = "#e9edf7"                                   // eyelets
    ctx.fillRect(g.x0 + 0.5, g.y1 - 7.5, 1, 1.5); ctx.fillRect(g.x1 - 1.5, g.y1 - 7.5, 1, 1.5)
    ctx.fillStyle = g.show ? g.hot : (Math.floor(w.ticks / 12) % 2 ? "#5dffa0" : "#1f4a33")
    ctx.fillRect(g.x0 + 0.5, g.y1 - 5, 1, 0.5)                  // armed lamp on the post
  },
  beartrap: function (ctx, w, pal, h, g) {
    if (g.live || g.cool > 0.5) return
    ctx.fillStyle = "#e9edf7"                                   // teeth along both jaws
    for (var j = 0; j < 5; j += 1) {
      ctx.fillRect(g.x0 + j + 0.5 + (g.winding ? Math.round(g.progress * 2) : 0), g.y1 - 3.5 - j, 0.5, 0.5)
      ctx.fillRect(g.x1 - 1.5 - j - (g.winding ? Math.round(g.progress * 2) : 0), g.y1 - 3.5 - j, 0.5, 0.5)
    }
    ctx.fillStyle = pal.rigDark                                 // chain to the floor
    for (var c = 0; c < 4; c++) ctx.fillRect(g.cx + 1 + c, g.y1 - 0.5 - (c % 2) * 0.5, 0.5, 0.5)
  },
  gun: function (ctx, w, pal, h, g) {
    ctx.fillStyle = "#1c1c22"
    ctx.fillRect(g.cx - 0.5, g.y0 + 10.5, 1, 0.5)               // the bore
    ctx.fillStyle = pal.warn                                    // ammo belt
    for (var b = 0; b < 4; b++) ctx.fillRect(g.cx - 6 + b, g.y0 + 6 + (b % 2) * 0.5, 0.5, 1)
    ctx.fillStyle = "#e9edf7"                                   // bolts
    ctx.fillRect(g.x0 + 2.5, g.y0 + 2.5, 0.5, 0.5); ctx.fillRect(g.x1 - 3, g.y0 + 2.5, 0.5, 0.5)
  },
  sentry: function (ctx, w, pal, h, g) {
    ctx.fillStyle = "#ffffff"
    ctx.fillRect(g.cx + 0.5, g.y0 + 2.5, 0.5, 0.5)              // glint on the lens
    ctx.fillStyle = pal.rigDark                                 // vents
    for (var v = 0; v < 3; v++) ctx.fillRect(g.x0 + 1 + v * 1.5, g.y0 + 0.5, 0.5, 1.5)
    ctx.fillStyle = g.show ? g.hot : (Math.floor(w.ticks / 24) % 2 ? "#ff5268" : "#5c1424")
    ctx.fillRect(g.x1 - 1.5, g.y0 + 0.5, 1, 0.5)                // status lamp
  }
}

// One drawing per hazard kind. A new hazard adds a function and a row here.
var HAZARD_DRAW = {
  gun: drawHzGun, sentry: drawHzSentry, turret: drawHzTurret, darts: drawHzDarts,
  flame: drawHzFlame, tesla: drawHzTesla, sniper: drawHzSniper,
  lasergrid: drawHzLasergrid, sweeper: drawHzSweeper, tripwire: drawHzTripwire,
  spikes: drawHzSpikes, beartrap: drawHzBeartrap, sawblade: drawHzSawblade,
  grinder: drawHzGrinder, crusher: drawHzCrusher, pendulum: drawHzPendulum,
  geyser: drawHzGeyser, rockfall: drawHzRockfall, piston: drawHzPiston,
  brazier: drawHzBrazier, fence: drawHzFence, echobat: drawHzEchobat,
  scarab: drawHzScarab, snowball: drawHzSnowball, molten: drawHzMolten,
  vinelock: drawHzVinelock, blackice: drawHzBlackice, packetloss: drawHzPacketloss,
  snake: drawHzSnake, scorpion: drawHzScorpion, hotaisle: drawHzHotaisle, shark: drawHzShark, current: drawHzCurrent, vent: drawHzVent,
  spores: drawHzSpores, icicle: drawHzIcicle, frostjet: drawHzFrostjet,
  airlock: drawHzAirlock, stamper: drawHzStamper, flywheel: drawHzFlywheel,
  steamvent: drawHzSteamvent, sprinkler: drawHzSprinkler, polisher: drawHzPolisher,
  shredder: drawHzShredder, servo: drawHzServo
}

// --- watch: mounted, dormant, wakes when somebody walks into reach -------
function drawHzGun(ctx, w, pal, h, geo) {
  var x0 = geo.x0, y0 = geo.y0, cx = geo.cx, wide = geo.wide, tall = geo.tall,
    live = geo.live, t = geo.t, show = geo.show, hot = geo.hot
  ctx.fillStyle = pal.rig
  ctx.fillRect(x0 + 2, y0, wide - 4, 5)          // mount
  ctx.fillRect(cx - 2, y0 + 5, 4, 6)             // barrel
  ctx.fillStyle = pal.rigDark
  ctx.fillRect(cx - 6, y0 + 2, 4, 4)             // drum magazine
  ctx.fillStyle = pal.warn
  ctx.fillRect(x0 + 2, y0 + 1, wide - 4, 1)
  if (show) {
    ctx.fillStyle = hot
    if (live) {
      hzTri(ctx, cx, y0 + 11, 3, 4, 1)           // muzzle flash
      for (var g = 0; g < tall; g += 5) ctx.fillRect(cx - 1, y0 + 13 + ((t * 4 + g) % tall), 2, 3)
    } else ctx.fillRect(cx - 1, y0 + 11, 2, 2)
  }
  hzLamp(ctx, pal, h, geo, cx - 2, y0 + 2)
  hzPressure(ctx, w, pal, h, geo, cx, y0 + 11, pal.rig)
}

function drawHzSentry(ctx, w, pal, h, geo) {
  var C = geo.C, x0 = geo.x0, y0 = geo.y0, cx = geo.cx, wide = geo.wide,
    live = geo.live, show = geo.show, hot = geo.hot
  ctx.fillStyle = pal.rig
  ctx.fillRect(x0, y0, wide, 6)
  ctx.fillStyle = pal.rigDark
  ctx.fillRect(x0 + 1, y0 + 6, wide - 2, 2)
  ctx.fillStyle = show ? hot : (geo.cool ? pal.fire : pal.warn)
  ctx.fillRect(cx - 2, y0 + 2, 4, 3)             // lens
  if (show) {
    ctx.fillStyle = hot
    var sentryReach = 12 * C * h.dir        // Sim's sentry reach; keep the two together
    if (live) ctx.fillRect(Math.min(cx, cx + sentryReach), y0 + 4, Math.abs(sentryReach), 2)
    else for (var sight = 0; sight < Math.abs(sentryReach); sight += 5)
      ctx.fillRect(cx + sight * h.dir, y0 + 4, 1, 1)
  }
  hzLamp(ctx, pal, h, geo, cx - 2, y0 + 1)
}

function drawHzTurret(ctx, w, pal, h, geo) {
  var x0 = geo.x0, y0 = geo.y0, cx = geo.cx, wide = geo.wide, tall = geo.tall,
    live = geo.live, show = geo.show, hot = geo.hot
  ctx.fillStyle = pal.rig
  ctx.fillRect(x0 + 1, y0, wide - 2, 4)
  ctx.fillRect(cx - 4, y0 + 4, 3, 5)             // twin barrels
  ctx.fillRect(cx + 2, y0 + 4, 3, 5)
  ctx.fillStyle = pal.warn
  ctx.fillRect(x0 + 1, y0 + 1, wide - 2, 1)
  if (show) {
    ctx.fillStyle = hot
    var beam = live ? tall - 9 : 1 + Math.round(geo.progress * 4)
    ctx.fillRect(cx - 3, y0 + 9, live ? 2 : 1, beam)
    ctx.fillRect(cx + 3, y0 + 9, live ? 2 : 1, beam)
  }
  hzLamp(ctx, pal, h, geo, cx - 2, y0 + 1)
  hzPressure(ctx, w, pal, h, geo, cx, y0 + 9, pal.rig)
}

function drawHzDarts(ctx, w, pal, h, geo) {
  var C = geo.C, x0 = geo.x0, y0 = geo.y0, cx = geo.cx, tall = geo.tall,
    live = geo.live, show = geo.show, hot = geo.hot
  ctx.fillStyle = pal.rig
  ctx.fillRect(x0, y0, 5, tall)                  // wall plate
  ctx.fillStyle = pal.rigDark
  for (var dh = 0; dh < 3; dh++) ctx.fillRect(x0 + 5, y0 + 3 + dh * 5, 2, 2)
  ctx.fillStyle = pal.warn
  ctx.fillRect(x0 + 1, y0 + 2, 1, tall - 4)
  if (show) {
    ctx.fillStyle = hot
    // Darts in flight: short dashes marching away from the plate.
    for (var dd = 0; dd < 3; dd++) {
      var dartTravel = live ? ((h.t * 4 + dd * 13) % (11 * C)) * h.dir : 0
      var dx2 = live ? cx + dartTravel : x0 + 5 + Math.floor(geo.progress * 2)
      ctx.fillRect(dx2, y0 + 3 + dd * 3, live ? 5 : 2, 1)
    }
  }
  hzLamp(ctx, pal, h, geo, x0, y0 + 1)
  hzPressure(ctx, w, pal, h, geo, x0 + 5, y0 + 6, pal.rig)
}

function drawHzFlame(ctx, w, pal, h, geo) {
  var y0 = geo.y0, cx = geo.cx, wide = geo.wide, tall = geo.tall,
    live = geo.live, t = geo.t, show = geo.show
  ctx.fillStyle = pal.rig
  ctx.fillRect(cx - 4, y0, 8, 3)
  hzTri(ctx, cx, y0 + 3, 3, 4, 1)                // flared nozzle
  ctx.fillStyle = pal.warn
  ctx.fillRect(cx - 3, y0 + 1, 6, 1)
  if (show) {
    // A cone that widens as it falls, with a hotter core.
    for (var f = 0; f < (live ? tall - 7 : 2 + Math.round(geo.progress * 4)); f++) {
      var fw = Math.round((wide / 2) * (0.25 + (f / tall) * (live ? 1.5 : 0.5)))
      ctx.fillStyle = f % 3 === Math.floor(t / 3) % 3 ? pal.fireHot : pal.fire
      ctx.fillRect(cx - fw, y0 + 7 + f, fw * 2, 1)
    }
  }
  hzPressure(ctx, w, pal, h, geo, cx, y0 + 7, pal.fire)
}

function drawHzTesla(ctx, w, pal, h, geo) {
  var x0 = geo.x0, x1 = geo.x1, y0 = geo.y0, y1 = geo.y1, cx = geo.cx,
    wide = geo.wide, tall = geo.tall, live = geo.live, t = geo.t,
    seed = geo.seed, show = geo.show, hot = geo.hot
  ctx.fillStyle = pal.rig
  ctx.fillRect(cx - 2, y1 - tall + 4, 4, tall - 4)   // post
  ctx.fillRect(x0 + 1, y1 - 3, wide - 2, 3)          // base
  ctx.fillStyle = show ? hot : pal.rigDark
  ctx.fillRect(cx - 4, y0, 8, 4)                     // ball on top
  if (show) {
    ctx.fillStyle = hot
    var arc = live ? tall - 6 : 1 + Math.round(geo.progress * 4)
    hzBolt(ctx, cx, y0 + 2, live ? x0 : cx - arc, y0 + 2 + arc, seed + t, live ? 2 : 1)
    hzBolt(ctx, cx, y0 + 2, live ? x1 : cx + arc, y0 + 2 + arc, seed + t + 3, live ? 2 : 1)
  }
  ctx.fillStyle = geo.cool ? pal.warn : pal.rig
  for (var coil = 0; coil < 3; coil++) {
    if (geo.winding && coil < Math.ceil(geo.progress * 3)) ctx.fillStyle = geo.hot
    ctx.fillRect(cx - 3, y1 - 5 - coil * 3, 6, 1)
  }
  hzPressure(ctx, w, pal, h, geo, cx, y0, pal.warn)
}

// --- snipe: one target, a long way off, one shot then a long reload -----
function drawHzSniper(ctx, w, pal, h, geo) {
  var C = geo.C, x0 = geo.x0, y0 = geo.y0, tall = geo.tall, live = geo.live,
    show = geo.show, hot = geo.hot
  ctx.fillStyle = pal.rig
  ctx.fillRect(x0, y0 + 2, 4, tall - 4)              // housing
  ctx.fillRect(x0 + 4, y0 + 4, 7, 3)                 // barrel
  ctx.fillStyle = pal.rigDark
  ctx.fillRect(x0 + 4, y0 + 1, 4, 3)                 // scope
  ctx.fillStyle = h.phase === "rest" ? pal.rigDark : pal.warn
  ctx.fillRect(x0 + 1, y0 + 3, 1, tall - 6)
  if (show && h.lineTo >= 0) {
    // The sight, then the shot. One pixel high while it is only looking, and
    // it reaches all the way to whoever it has picked out.
    var tx = h.lineTo * C
    var ty = h.lineY * C
    var sy = y0 + 5
    ctx.fillStyle = hot
    var n2 = Math.max(1, Math.round(Math.abs(tx - (x0 + 11))))
    for (var q = 0; q <= n2; q += live ? 1 : 3) {
      var qx = (x0 + 11) + (tx - (x0 + 11)) * (q / n2)
      var qy = sy + (ty - sy) * (q / n2)
      ctx.fillRect(Math.round(qx), Math.round(qy), live ? 2 : 1, live ? 2 : 1)
    }
  }
  hzLamp(ctx, pal, h, geo, x0 + 4, y0 + 2)
  hzPressure(ctx, w, pal, h, geo, x0 + 11, y0 + 5, pal.rig)
}

// --- beam: keeps its own schedule ---------------------------------------
function drawHzLasergrid(ctx, w, pal, h, geo) {
  var x0 = geo.x0, x1 = geo.x1, y0 = geo.y0, wide = geo.wide, tall = geo.tall,
    live = geo.live, show = geo.show, hot = geo.hot
  ctx.fillStyle = pal.rig
  ctx.fillRect(x0, y0, wide, 3)
  ctx.fillStyle = geo.cool ? pal.warn : pal.rigDark
  for (var e = x0 + 2; e < x1 - 1; e += 8) ctx.fillRect(e, y0 + 3, 3, 2)
  ctx.fillStyle = pal.warn
  ctx.fillRect(x0, y0 + 1, wide, 1)
  if (show) {
    ctx.fillStyle = hot
    for (var b2 = x0 + 3; b2 < x1 - 1; b2 += 8) {
      if (live) ctx.fillRect(b2, y0 + 5, 2, tall - 5)
      else for (var aim = 0; aim < tall - 5; aim += 5) ctx.fillRect(b2, y0 + 5 + aim, 1, 1)
    }
  }
  hzLamp(ctx, pal, h, geo, geo.cx - 2, y0 + 1)
}

function drawHzSweeper(ctx, w, pal, h, geo) {
  var x0 = geo.x0, y0 = geo.y0, wide = geo.wide, tall = geo.tall,
    live = geo.live, t = geo.t, show = geo.show, hot = geo.hot
  // A head that travels along a rail, with the beam raking after it.
  var rail = x0 + Math.round((wide - 8) * (0.5 + 0.5 * Math.sin(t * 0.05)))
  ctx.fillStyle = pal.rigDark
  ctx.fillRect(x0, y0, wide, 2)                      // the rail
  ctx.fillStyle = pal.rig
  ctx.fillRect(rail, y0, 8, 5)                       // the head
  ctx.fillStyle = geo.cool ? pal.fire : pal.warn
  ctx.fillRect(rail + 1, y0 + 1, 6, 1)
  if (show) {
    ctx.fillStyle = hot
    for (var sv = 0; sv < tall - 5; sv++) {
      var lean = Math.round(sv * Math.sin(t * 0.05) * 0.5)
      if (live || sv % 5 === 0) ctx.fillRect(rail + 3 + lean, y0 + 5 + sv, live ? 3 : 1, 1)
    }
  }
  hzLamp(ctx, pal, h, geo, rail + 2, y0 + 1)
}

function drawHzTripwire(ctx, w, pal, h, geo) {
  var x0 = geo.x0, x1 = geo.x1, y1 = geo.y1, wide = geo.wide, live = geo.live,
    t = geo.t, show = geo.show, hot = geo.hot
  ctx.fillStyle = pal.rig
  ctx.fillRect(x0, y1 - 8, 2, 8)                     // posts
  ctx.fillRect(x1 - 2, y1 - 8, 2, 8)
  ctx.fillStyle = show ? hot : pal.warn
  ctx.fillRect(x0, y1 - 7, wide, 1)                  // the wire itself
  if (show && live) {
    ctx.fillStyle = pal.fireHot
    for (var tw = 0; tw < wide; tw += 3) ctx.fillRect(x0 + tw, y1 - 9 - ((t + tw) % 4), 2, 2)
  }
  hzLamp(ctx, pal, h, geo, x0, y1 - 4)
}

// --- plate: armed by being stood on -------------------------------------
function drawHzSpikes(ctx, w, pal, h, geo) {
  var x0 = geo.x0, x1 = geo.x1, y1 = geo.y1, wide = geo.wide, live = geo.live,
    show = geo.show, hot = geo.hot
  ctx.fillStyle = pal.rig
  ctx.fillRect(x0, y1 - 3, wide, 3)                  // the plate
  ctx.fillStyle = pal.warn
  ctx.fillRect(x0 + 1, y1 - 2, wide - 2, 1)
  if (show || geo.cool) {
    ctx.fillStyle = hot
    for (var sp = x0 + 2; sp < x1 - 1; sp += 4) hzTri(ctx, sp, y1 - 3, 2, hzStroke(geo, 10, 4), -1)
  }
  hzLamp(ctx, pal, h, geo, geo.cx - 2, y1 - 2)
  hzImpact(ctx, pal, h, geo, geo.cx, y1 - 3, pal.rig)
}

function drawHzBeartrap(ctx, w, pal, h, geo) {
  var x0 = geo.x0, x1 = geo.x1, y1 = geo.y1, cx = geo.cx, live = geo.live,
    show = geo.show, hot = geo.hot
  // Jaws: open and waiting, or shut.
  ctx.fillStyle = pal.rig
  ctx.fillRect(cx - 1, y1 - 2, 2, 2)                 // the plate between them
  ctx.fillStyle = show ? hot : pal.rigDark
  if (live || geo.cool > 0.5) {
    hzTri(ctx, cx - 3, y1 - 2, 3, 7, -1)
    hzTri(ctx, cx + 3, y1 - 2, 3, 7, -1)
  } else {
    for (var jw = 0; jw < 5; jw++) {
      ctx.fillRect(x0 + jw + (geo.winding ? Math.round(geo.progress * 2) : 0), y1 - 3 - jw, 2, 1)       // open, leaning out
      ctx.fillRect(x1 - 2 - jw - (geo.winding ? Math.round(geo.progress * 2) : 0), y1 - 3 - jw, 2, 1)
    }
    ctx.fillStyle = pal.warn
    ctx.fillRect(cx - 2, y1 - 3, 4, 1)
  }
  hzLamp(ctx, pal, h, geo, cx - 2, y1 - 2)
  hzImpact(ctx, pal, h, geo, cx, y1 - 2, pal.rig)
}

function drawHzSawblade(ctx, w, pal, h, geo) {
  var x0 = geo.x0, y1 = geo.y1, cx = geo.cx, wide = geo.wide, live = geo.live,
    t = geo.t, show = geo.show, hot = geo.hot
  ctx.fillStyle = pal.rig
  ctx.fillRect(x0 + 2, y1 - 3, wide - 4, 3)          // slot
  ctx.fillStyle = pal.warn
  ctx.fillRect(x0 + 3, y1 - 2, wide - 6, 1)
  if (show || geo.cool) {
    // A disc rising out of the slot, teeth turning.
    var rise = hzStroke(geo, 9, 5)
    var rad = Math.min(rise, 8)
    ctx.fillStyle = geo.cool ? pal.rig : hot
    for (var a2 = 0; a2 < 12; a2++) {
      var ang = (a2 / 12) * Math.PI * 2 + t * 0.25
      ctx.fillRect(Math.round(cx + Math.cos(ang) * rad), Math.round(y1 - 3 - rise / 2 + Math.sin(ang) * rad * 0.6), 2, 2)
    }
    ctx.fillRect(cx - 1, y1 - 4 - rise / 2, 2, 2)
  }
  hzLamp(ctx, pal, h, geo, cx - 2, y1 - 2)
  hzImpact(ctx, pal, h, geo, cx, y1 - 3, pal.warn)
}

function drawHzGrinder(ctx, w, pal, h, geo) {
  var x0 = geo.x0, y1 = geo.y1, cx = geo.cx, wide = geo.wide, live = geo.live,
    t = geo.t, show = geo.show, hot = geo.hot
  // Two toothed rollers side by side, turning inward.
  ctx.fillStyle = pal.rig
  ctx.fillRect(x0, y1 - 6, wide, 6)
  ctx.fillStyle = pal.rigDark
  ctx.fillRect(cx - 1, y1 - 6, 2, 6)
  ctx.fillStyle = show ? hot : pal.warn
  for (var gr = 0; gr < wide; gr += 4) {
    var turn = live ? t * 2 : t * 0.08 + (geo.winding ? h.t * (0.42 + geo.progress * 0.5) : 0)
    var off = (Math.floor(turn) + gr) % 4
    ctx.fillRect(x0 + gr + (gr < wide / 2 ? off : 3 - off), y1 - 7, 2, live ? 4 : 2)
  }
  hzLamp(ctx, pal, h, geo, cx - 2, y1 - 3)
  hzImpact(ctx, pal, h, geo, cx, y1 - 6, pal.warn)
}

// --- cycle: never triggers, never stops ---------------------------------
function drawHzCrusher(ctx, w, pal, h, geo) {
  var x0 = geo.x0, x1 = geo.x1, y0 = geo.y0, wide = geo.wide, tall = geo.tall,
    live = geo.live, winding = geo.winding, hot = geo.hot
  // A block on two rams, hanging high or driven down.
  var drop = hzStroke(geo, tall - 11, 3)
  ctx.fillStyle = pal.rigDark
  ctx.fillRect(x0 + 3, y0, 2, 4 + drop)
  ctx.fillRect(x1 - 5, y0, 2, 4 + drop)
  ctx.fillStyle = live ? hot : pal.rig
  ctx.fillRect(x0, y0 + 4 + drop, wide, 7)
  ctx.fillStyle = pal.warn
  ctx.fillRect(x0 + 1, y0 + 5 + drop, wide - 2, 1)
  hzLamp(ctx, pal, h, geo, geo.cx - 2, y0 + 1)
  hzImpact(ctx, pal, h, geo, geo.cx, geo.y1, pal.rig)
}

function hzSwing(g, h) {
  if (g.live) return Math.sin(h.t * 0.26)
  if (g.winding) return -0.3 - g.progress * 0.65
  if (g.cool) return Math.sin(h.t * 0.26) * g.cool
  return Math.sin(g.t * 0.035) * 0.2
}

function drawHzPendulum(ctx, w, pal, h, geo) {
  var y0 = geo.y0, cx = geo.cx, wide = geo.wide, tall = geo.tall, t = geo.t,
    show = geo.show, hot = geo.hot
  // A blade on an arm, swinging from a pivot.
  var swing = hzSwing(geo, h)
  var sw = swing * (wide / 2 - 2)
  ctx.fillStyle = pal.rigDark
  ctx.fillRect(cx - 2, y0, 4, 3)                     // pivot
  ctx.fillStyle = pal.rig
  var bx = Math.round(cx + sw)
  var by = y0 + tall - 6
  var an = Math.max(1, Math.round(Math.max(Math.abs(bx - cx), by - y0)))
  for (var pa = 0; pa <= an; pa++)
    ctx.fillRect(Math.round(cx + (bx - cx) * pa / an), Math.round(y0 + 3 + (by - y0 - 3) * pa / an), 2, 2)
  ctx.fillStyle = show ? hot : pal.warn
  hzTri(ctx, bx, by + 5, 4, 6, -1)                   // the blade
  hzLamp(ctx, pal, h, geo, cx - 2, y0)
  hzImpact(ctx, pal, h, geo, bx, by + 5, pal.rig)
}

function drawHzGeyser(ctx, w, pal, h, geo) {
  var x0 = geo.x0, x1 = geo.x1, y1 = geo.y1, cx = geo.cx, wide = geo.wide,
    tall = geo.tall, live = geo.live, t = geo.t, show = geo.show, hot = geo.hot
  ctx.fillStyle = pal.rig
  ctx.fillRect(x0, y1 - 3, wide, 3)                  // grate
  ctx.fillStyle = pal.rigDark
  for (var gg = x0 + 1; gg < x1 - 1; gg += 3) ctx.fillRect(gg, y1 - 3, 1, 3)
  if (show) {
    // A plume that billows wider the higher it gets.
    for (var pu = 0; pu < (live ? tall - 4 : 2 + Math.round(geo.progress * 5)); pu++) {
      var pw = Math.round((wide / 2) * (0.3 + (pu / tall) * (live ? 1.4 : 0.4)))
      ctx.fillStyle = (pu + Math.floor(t / 2)) % 4 === 0 ? pal.fireHot : hot
      ctx.fillRect(cx - pw, y1 - 4 - pu, pw * 2, 1)
    }
  }
  hzPressure(ctx, w, pal, h, geo, cx, y1 - 3, pal.decorLit)
}

function drawHzRockfall(ctx, w, pal, h, geo) {
  var C = geo.C, x0 = geo.x0, y0 = geo.y0, wide = geo.wide, live = geo.live,
    show = geo.show
  ctx.fillStyle = pal.rigDark
  ctx.fillRect(x0, y0, wide, 3)                      // cracked slab
  ctx.fillStyle = pal.rig
  for (var cr = 0; cr < wide; cr += 5) ctx.fillRect(x0 + cr, y0 + 3, 3, 1)
  ctx.fillStyle = pal.warn
  ctx.fillRect(x0 + 2, y0 + 1, wide - 4, 1)
  if (show || geo.cool) {
    // Rocks on their way down, at staggered heights.
    ctx.fillStyle = live ? pal.rig : pal.warn
    for (var rk = 0; rk < 4; rk++) {
      var rockX = (h.zx0 + 0.5 + ((rk * 2.3 + (live ? h.fired : 0)) % Math.max(1, h.zx1 - h.zx0 + 1))) * C
      var ry = live ? (h.zy0 + ((h.t * 0.55 + rk * 3.1) % Math.max(1, h.zy1 - h.zy0 + 1))) * C
        : (geo.cool ? geo.y1 - 2 : y0 + 3 + (rk % 2) + Math.round(geo.progress * 2))
      ctx.fillRect(rockX, ry, live ? 4 : 2, live ? 4 : 2)
    }
  }
  hzImpact(ctx, pal, h, geo, geo.cx, geo.y1, pal.rig)
  if (!show && !geo.cool) {
    ctx.fillStyle = pal.rig
    ctx.fillRect(geo.cx, y0 + 4 + Math.floor(geo.t / 24) % 3, 1, 1)
  }
}

function drawHzPiston(ctx, w, pal, h, geo) {
  var x0 = geo.x0, y0 = geo.y0, wide = geo.wide, tall = geo.tall,
    live = geo.live, winding = geo.winding, show = geo.show, hot = geo.hot
  // A ram in a housing, driven out sideways.
  var ext = hzStroke(geo, wide - 8, 4)
  ctx.fillStyle = pal.rig
  ctx.fillRect(x0, y0, 5, tall)                      // housing
  ctx.fillStyle = pal.rigDark
  ctx.fillRect(x0 + 5, y0 + 2, ext, tall - 4)        // the ram
  ctx.fillStyle = show ? hot : pal.warn
  ctx.fillRect(x0 + 5 + ext, y0 + 1, 3, tall - 2)    // the head
  hzLamp(ctx, pal, h, geo, x0, y0 + 1)
  hzImpact(ctx, pal, h, geo, x0 + 5 + ext, geo.y1, pal.warn)
}

// --- field: always live -------------------------------------------------
function drawHzBrazier(ctx, w, pal, h, geo) {
  var y1 = geo.y1, cx = geo.cx, tall = geo.tall, t = geo.t
  ctx.fillStyle = pal.rig
  ctx.fillRect(cx - 4, y1 - 4, 8, 4)                 // bowl
  ctx.fillRect(cx - 1, y1 - 6, 2, 2)
  // Flames, flickering on their own clock.
  for (var fl = 0; fl < tall - 5; fl++) {
    var fw2 = Math.max(1, Math.round((3 - fl * 0.35) + Math.sin((t + fl * 3) * 0.3)))
    ctx.fillStyle = fl < 2 ? pal.fireHot : pal.fire
    ctx.fillRect(cx - fw2, y1 - 6 - fl, fw2 * 2, 1)
  }
}

function drawHzFence(ctx, w, pal, h, geo) {
  var x0 = geo.x0, x1 = geo.x1, y0 = geo.y0, y1 = geo.y1, wide = geo.wide,
    tall = geo.tall, t = geo.t, seed = geo.seed
  ctx.fillStyle = pal.rig
  ctx.fillRect(x0, y0 + 2, 2, tall - 2)              // posts
  ctx.fillRect(x1 - 2, y0 + 2, 2, tall - 2)
  ctx.fillStyle = pal.rigDark
  ctx.fillRect(x0, y1 - 2, wide, 2)
  // Wires, with a charge running between them.
  for (var wi = 0; wi < 3; wi++) {
    var wy = y0 + 4 + wi * Math.max(2, Math.round((tall - 6) / 3))
    ctx.fillStyle = pal.rigDark
    ctx.fillRect(x0, wy, wide, 1)
    if ((Math.floor(t / 3) + wi) % 3 === 0) {
      ctx.fillStyle = pal.fireHot
      hzBolt(ctx, x0 + 1, wy, x1 - 1, wy, seed + wi + t, 1)
    }
  }
}

// --- biome-exclusive oddities -----------------------------------------
function drawHzEchobat(ctx, w, pal, h, geo) {
  var y0 = geo.y0, cx = geo.cx, t = geo.t, show = geo.show, hot = geo.hot
  ctx.fillStyle = pal.rigDark
  ctx.fillRect(cx - 2, y0, 4, 5)
  ctx.fillStyle = show ? hot : pal.rig
  var wing = geo.winding ? 3 + Math.round(geo.progress * 3) : 5
  var breath = Math.floor(t / 24) % 2
  hzTri(ctx, cx - wing, y0 + 4 + breath, wing, 4, 1)
  hzTri(ctx, cx + wing, y0 + 4 + breath, wing, 4, 1)
  // The screech, out to where it actually kills: three rings travelling to
  // the full reach either side. It used to stop at five cells while the
  // lethal zone ran to fifteen — the colony died to something nobody could see.
  if (show) {
    var span = geo.live ? (h.reach || 9) * geo.C * Math.min(1, h.t / 18) : 3 + geo.progress * 5
    ctx.fillStyle = hot
    for (var eb = 1; eb <= 3; eb++) {
      var er = Math.round(((t + eb * 6) % 18) / 18 * span) + 3
      ctx.globalAlpha = 1 - er / (span + 4)
      ctx.fillRect(cx - er, y0 + 8 + eb * 2, er * 2, 1)
      ctx.fillRect(cx - er, y0 + 6 + eb * 2, 1, 3)
      ctx.fillRect(cx + er - 1, y0 + 6 + eb * 2, 1, 3)
    }
    ctx.globalAlpha = 1
  }
  hzPressure(ctx, w, pal, h, geo, cx, y0 + 8, pal.rig)
}

function drawHzScarab(ctx, w, pal, h, geo) {
  var C = geo.C, x0 = geo.x0, y1 = geo.y1, cx = geo.cx, wide = geo.wide,
    live = geo.live, t = geo.t, show = geo.show, hot = geo.hot
  ctx.fillStyle = pal.rigDark
  ctx.fillRect(x0, y1 - 2, wide, 2)
  for (var sca = 0; sca < 5; sca++) {
    var scx = live ? cx + h.dir * ((sca * 7 + t * 2) % (10 * C))
      : x0 + 2 + sca * 3 + (geo.winding ? Math.round(geo.progress * 2) : Math.floor(t / 30) % 2)
    ctx.fillStyle = show ? hot : pal.rig
    ctx.fillRect(scx, y1 - 5 - (sca % 2), 3, 2)
    ctx.fillRect(scx + 1, y1 - 7 - (sca % 2), 1, 2)
  }
  hzImpact(ctx, pal, h, geo, cx, y1 - 2, pal.rig)
}

function drawHzSnowball(ctx, w, pal, h, geo) {
  var C = geo.C, x0 = geo.x0, y0 = geo.y0, wide = geo.wide, live = geo.live,
    show = geo.show, hot = geo.hot
  ctx.fillStyle = pal.rigDark
  ctx.fillRect(x0, y0, wide, 2)
  ctx.fillStyle = show ? hot : pal.decorLit
  for (var sn = 0; sn < 4; sn++) {
    if (!show && !geo.cool && sn > 0) continue
    var snowX = (h.zx0 + 0.5 + ((sn * 2.3 + (live ? h.fired : 0)) % Math.max(1, h.zx1 - h.zx0 + 1))) * C
    var sny = live ? (h.zy0 + ((h.t * 0.55 + sn * 3.1) % Math.max(1, h.zy1 - h.zy0 + 1))) * C
        : (geo.cool ? geo.y1 - 2 : y0 + 3 + (sn % 2) + Math.round(geo.progress * 2) + (!show ? Math.floor(geo.t / 24) % 2 : 0))
    var snr = live ? 4 : 2
    ctx.fillRect(snowX - snr, sny - snr, snr * 2, snr * 2)
  }
  hzImpact(ctx, pal, h, geo, geo.cx, geo.y1, pal.decorLit)
}

function drawHzMolten(ctx, w, pal, h, geo) {
  var C = geo.C, x0 = geo.x0, y0 = geo.y0, wide = geo.wide, live = geo.live,
    show = geo.show, hot = geo.hot
  ctx.fillStyle = pal.rigDark
  ctx.fillRect(x0, y0, wide, 3)
  ctx.fillStyle = show ? hot : pal.warn
  for (var ml = 0; ml < 4; ml++) {
    if (!show && !geo.cool && ml > 0) continue
    var moltenX = (h.zx0 + 0.5 + ((ml * 2.3 + (live ? h.fired : 0)) % Math.max(1, h.zx1 - h.zx0 + 1))) * C
    var mly = live ? (h.zy0 + ((h.t * 0.55 + ml * 3.1) % Math.max(1, h.zy1 - h.zy0 + 1))) * C
        : (geo.cool ? geo.y1 - 2 : y0 + 3 + (ml % 2) + Math.round(geo.progress * 2) + (!show ? Math.floor(geo.t / 24) % 2 : 0))
    ctx.fillRect(moltenX, mly, live ? 3 : 1, live ? 5 : 2)
  }
  hzImpact(ctx, pal, h, geo, geo.cx, geo.y1, pal.fire)
}

function drawHzVinelock(ctx, w, pal, h, geo) {
  var x0 = geo.x0, y1 = geo.y1, wide = geo.wide, tall = geo.tall,
    live = geo.live, winding = geo.winding, show = geo.show, hot = geo.hot
  ctx.fillStyle = pal.decorDim
  ctx.fillRect(x0, y1 - 2, wide, 2)
  ctx.fillStyle = show ? hot : pal.decor
  for (var vl = 1; vl < wide; vl += 4) {
    var vh = 2 + hzStroke(geo, tall - 4, 6)
    for (var vv = 0; vv < vh; vv++) ctx.fillRect(x0 + vl + ((vv >> 2) % 2) + (vv > 0 ? Math.round(Math.sin(geo.t * 0.06 + vl) * 0.6) : 0), y1 - 3 - vv, 2, 1)
  }
  hzImpact(ctx, pal, h, geo, geo.cx, y1 - 4, pal.decor)
}

function drawHzBlackice(ctx, w, pal, h, geo) {
  var x0 = geo.x0, y1 = geo.y1, cx = geo.cx, wide = geo.wide, live = geo.live,
    show = geo.show, hot = geo.hot
  ctx.fillStyle = show ? hot : pal.decorLit
  ctx.fillRect(x0, y1 - 2, wide, 2)
  ctx.fillStyle = pal.rockEdge
  for (var bi = 1; bi < wide; bi += 5) ctx.fillRect(x0 + bi, y1 - 3, 3, 1)
  if (live) {
    ctx.fillStyle = hot
    hzTri(ctx, cx, y1 - 2, 5, 8, -1)
  }
  ctx.fillStyle = show ? hot : pal.decorLit
  var crack = geo.winding ? 2 + Math.round(geo.progress * 7) : 2
  for (var frost = 0; frost < 3; frost++) {
    var fx = x0 + 3 + frost * 7 + (Math.floor(geo.t / 30) % 2)
    ctx.fillRect(fx, y1 - 3, crack, 1)
    if (geo.winding) ctx.fillRect(fx + crack - 1, y1 - 5, 1, 2)
  }
  hzImpact(ctx, pal, h, geo, cx, y1 - 3, pal.decorLit)
}

function drawHzPacketloss(ctx, w, pal, h, geo) {
  var x0 = geo.x0, y0 = geo.y0, wide = geo.wide, tall = geo.tall,
    live = geo.live, t = geo.t, show = geo.show, hot = geo.hot
  ctx.fillStyle = pal.rigDark
  ctx.fillRect(x0, y0, wide, 3)
  ctx.fillStyle = show ? hot : pal.warn
  for (var pk = 0; pk < 18; pk++) {
    if (!show && !geo.cool && pk > 1) continue
    if (geo.winding && pk > 3 + Math.floor(geo.progress * 14)) continue
    if (live && (pk + Math.floor(t / 3)) % 4 === 0) continue
    var pkx = x0 + ((pk * 7) % Math.max(1, wide))
    var pky = y0 + 4 + ((pk * 11 + (live ? t : Math.floor(t / 12))) % Math.max(1, tall - 5))
    ctx.fillRect(pkx, pky, live ? 3 : 1, live ? 2 : 1)
  }
  hzLamp(ctx, pal, h, geo, geo.cx - 2, y0 + 1)
}

// --- jungle -------------------------------------------------------------
// A scorpion: a flat body on the floor, claws out in front, and the tail
// carried over the back in a hook. Winding up, the tail draws back and the
// sting shivers; firing, it comes over and down in front of the claws — the
// strike happens at the far end from where the tail starts, which is the joke
// in the name.
function drawHzScorpion(ctx, w, pal, h, geo) {
  var x0 = geo.x0, x1 = geo.x1, y1 = geo.y1, live = geo.live, winding = geo.winding,
    show = geo.show, hot = geo.hot, t = geo.t
  var sdir = h.zx0 % 2 === 0 ? 1 : -1
  var front = sdir > 0 ? x1 - 3 : x0 + 3
  var back = sdir > 0 ? x0 + 4 : x1 - 4
  var floorY = y1 - 1
  ctx.fillStyle = pal.rigDark
  ctx.fillRect(Math.min(front, back), floorY - 3, Math.abs(front - back), 3)    // body
  for (var lg = 0; lg < 4; lg++) ctx.fillRect(Math.min(front, back) + 1 + lg * 3, floorY - 1, 1, 2)
  ctx.fillStyle = pal.rig
  ctx.fillRect(front + sdir * 1 - (sdir < 0 ? 2 : 0), floorY - 4, 3, 2)        // claws
  ctx.fillRect(front + sdir * 1 - (sdir < 0 ? 2 : 0), floorY - 1, 3, 1)
  // The tail: four segments rising from the back. Each phase pushes the hook
  // further forward over the body.
  var reach = live ? 1 : (winding ? -0.35 - geo.progress * 0.45 : 0.18 + Math.sin(t * 0.04) * 0.18)
  ctx.fillStyle = pal.rigDark
  var tx = back, ty = floorY - 3
  for (var sg = 0; sg < 4; sg++) {
    tx += sdir * Math.round(reach * 2) + (sg < 2 ? -sdir : 0)
    ty -= sg < 3 ? 2 : -1
    ctx.fillRect(tx, ty, 2, 2)
  }
  var stx = live ? front + sdir * 3 : tx + sdir * 2
  var sty = live ? floorY - 4 : ty + 1
  ctx.fillStyle = show ? hot : pal.warn
  ctx.fillRect(stx - (sdir < 0 ? 1 : 0), sty, 2, 2)                           // sting
  hzImpact(ctx, pal, h, geo, front, floorY, pal.rig)
}

// A rack fan on the wall: a round grille with blades that turn slowly at
// rest, spin up through the wind-up, and then blow a shimmer of hot air down
// the aisle as far as it reaches.
function drawHzHotaisle(ctx, w, pal, h, geo) {
  var C = geo.C, x0 = geo.x0, y0 = geo.y0, cx = geo.cx, wide = geo.wide,
    live = geo.live, winding = geo.winding, show = geo.show, hot = geo.hot, t = geo.t
  var cy = y0 + 7
  ctx.fillStyle = pal.rigDark
  ctx.fillRect(x0, y0 + 2, wide, 10)
  ctx.fillStyle = pal.rig
  ctx.fillRect(x0 + 1, y0 + 3, wide - 2, 8)
  var spin = t * 0.08 + (winding ? h.t * geo.progress * 0.25 : 0)
  if (live) spin = t * 0.9
  ctx.fillStyle = show ? hot : pal.rigDark
  for (var b = 0; b < 3; b++) {
    var a = spin + b * 2.094
    ctx.fillRect(Math.round(cx + Math.cos(a) * 3) - 1, Math.round(cy + Math.sin(a) * 3) - 1, 2, 2)
  }
  ctx.fillRect(cx - 1, cy - 1, 2, 2)
  hzLamp(ctx, pal, h, geo, x0 + 1, y0 + 2)
  if (!live && !geo.cool) return
  ctx.fillStyle = hot
  var reach = (h.reach || 10) * C
  for (var s = 0; s < 4; s++) {
    var sx = cx + h.dir * (((t * 3 + s * reach / 4) % reach) + 4)
    ctx.globalAlpha = 0.7 * (1 - s / 5) * (live ? 1 : geo.cool)
    ctx.fillRect(Math.min(sx, sx + h.dir * 6), cy - 3 + (s % 2) * 4, 6, 1)
  }
  ctx.globalAlpha = 1
}

function drawHzSnake(ctx, w, pal, h, geo) {
  var x0 = geo.x0, x1 = geo.x1, y1 = geo.y1, wide = geo.wide, live = geo.live,
    winding = geo.winding, show = geo.show, hot = geo.hot
  // An S of body along the floor with a wedge head on the end of it, rather
  // than the vertical post the first version drew — which, with a bright tip
  // and a muzzle flash, read as a mounted gun and not as an animal at all.
  var sdir = h.zx0 % 2 === 0 ? 1 : -1
  var bodyY = y1 - 3
  ctx.fillStyle = pal.rigDark
  for (var sb = 0; sb < wide; sb++) {
    // Two shallow humps: a snake at rest is a curve, and a curve is what
    // separates it from every straight-edged machine on this board.
    var hump = Math.round(Math.sin(sb * 0.55) * 1.6)
    ctx.fillRect(x0 + sb, bodyY - hump, 1, 3)
  }
  // Scales along the back, a shade lighter.
  ctx.fillStyle = pal.rig
  for (var sc = 0; sc < wide; sc += 2) {
    var hump2 = Math.round(Math.sin(sc * 0.55) * 1.6)
    ctx.fillRect(x0 + sc, bodyY - hump2, 1, 1)
  }

  // The head, at the end it is facing, raised a little when it is winding up
  // and thrown forward when it strikes.
  var hx = sdir > 0 ? x1 - 4 : x0
  var rear2 = live ? 0 : (winding ? 3 + Math.round(geo.progress * 3) : 2 + Math.floor(geo.t / 30) % 2)
  var hy = bodyY - rear2 - 2
  if (winding || live) {
    // The raised neck curving up out of the coil.
    ctx.fillStyle = pal.rigDark
    for (var nk = 0; nk <= rear2 + 2; nk++)
      ctx.fillRect(hx + (sdir > 0 ? 0 : 3), bodyY - nk, 2, 1)
  }
  ctx.fillStyle = show ? hot : pal.rig
  ctx.fillRect(hx, hy, 4, 3)                        // wedge head
  ctx.fillRect(hx + (sdir > 0 ? 4 : -1), hy + 1, 1, 2)
  ctx.fillStyle = pal.eye
  ctx.fillRect(hx + (sdir > 0 ? 3 : 0), hy + 1, 1, 1)   // eye
  if (live) {
    // Struck: the head is thrown out, and the tongue with it.
    ctx.fillStyle = pal.fireHot
    ctx.fillRect(hx + (sdir > 0 ? 5 : -6), hy + 1, 6, 1)
  } else if (winding) {
    ctx.fillStyle = pal.warn
    ctx.fillRect(hx + (sdir > 0 ? 5 : -3), hy + 1, 3, 1)  // flicking tongue
  }
  hzImpact(ctx, pal, h, geo, hx, y1 - 1, pal.decorDim)
}

// --- Trench -------------------------------------------------------------
function drawHzShark(ctx, w, pal, h, geo) {
  var x0 = geo.x0, x1 = geo.x1, y0 = geo.y0, wide = geo.wide, tall = geo.tall,
    live = geo.live, winding = geo.winding, t = geo.t, seed = geo.seed,
    show = geo.show, hot = geo.hot
  // The only hazard on the board that is not bolted to anything, so it is
  // the only one that has to say where it is going. It patrols its zone at
  // rest, hangs still and turns side-on while it winds up — a shark lining
  // somebody up stops swimming, which is the tell — and crosses the zone in
  // one run when it strikes.
  var swim = live
    ? (h.t / Math.max(1, 16)) * wide           // the run
    : (winding ? wide * (0.4 + geo.progress * 0.1) : (0.5 + 0.5 * Math.sin(t * 0.018 + seed)) * (wide - 22))
  var shdir = h.zx0 % 2 === 0 ? 1 : -1
  var shx = Math.round(shdir > 0 ? x0 + swim : x1 - swim - 22)
  var shy = Math.round(y0 + tall * 0.42 + Math.sin(t * 0.05) * (winding ? 0 : 2))
  var nose = shdir > 0 ? shx + 22 : shx

  var pose = { x: shx, y: shy, dir: shdir, nose: nose }
  drawSharkBody(ctx, pal, geo, pose)
  drawSharkFins(ctx, pal, geo, pose)
  drawSharkJaw(ctx, pal, geo, pose)
  hzPressure(ctx, w, pal, h, geo, shdir > 0 ? shx - 1 : shx + 22, shy + 2, pal.bubble)
}

function drawSharkBody(ctx, pal, g, pose) {
  var shx = pose.x, shy = pose.y, shdir = pose.dir, live = g.live, hot = g.hot
  // Body. The first version drew a symmetric wedge and it read, unmistakably,
  // as a submarine — which in this biome is a real confusion, because there
  // is a submarine on the roster. A fish is not symmetric: the back is a
  // long shallow arch and the belly is a deep one, the snout is blunt below
  // and pointed above, and the body narrows to a thin peduncle before the
  // tail rather than tapering all the way. Two curves, not one.
  ctx.fillStyle = live ? hot : pal.rigDark
  for (var sk = 0; sk < 22; sk++) {
    var along = shdir > 0 ? sk / 22 : 1 - sk / 22
    // Peduncle: everything behind 0.82 pinches to almost nothing, which is
    // what makes the tail read as attached rather than as a bracket.
    var girth = along < 0.82
      ? Math.sin(Math.pow(along, 0.55) * Math.PI * 0.92)
      : 0.16
    var back = Math.round(3.2 * girth)
    var belly = Math.round(2.0 * girth + (along > 0.15 && along < 0.7 ? 1 : 0))
    ctx.fillRect(shx + sk, shy - back, 1, Math.max(1, back + belly + 1))
  }
  // The pale underside. A shark is recognised by countershading more than by
  // outline, and it is two pixels a column.
  ctx.fillStyle = pal.rig
  for (var bk = 3; bk < 17; bk++) {
    var balong = shdir > 0 ? bk / 22 : 1 - bk / 22
    var bgirth = Math.sin(Math.pow(balong, 0.55) * Math.PI * 0.92)
    var bbelly = Math.round(2.0 * bgirth + (balong > 0.15 && balong < 0.7 ? 1 : 0))
    ctx.fillRect(shx + bk, shy + bbelly, 1, 1)
  }
}

function drawSharkFins(ctx, pal, g, pose) {
  var shx = pose.x, shy = pose.y, shdir = pose.dir, nose = pose.nose, live = g.live, hot = g.hot
  // The fins. A crescent tail with the upper lobe longer than the lower —
  // the one detail that says shark rather than fish — plus a tall dorsal set
  // forward of centre and a pectoral swept back under it.
  ctx.fillStyle = live ? hot : pal.rigDark
  var tailX = shdir > 0 ? shx - 1 : shx + 22
  for (var tl = 0; tl < 5; tl++) {
    var spread = 1 + tl                                   // opens away from the body
    ctx.fillRect(tailX + (shdir > 0 ? -tl : tl), shy - spread - 1, 1, 2)   // upper lobe
    if (tl < 4) ctx.fillRect(tailX + (shdir > 0 ? -tl : tl), shy + spread - 1, 1, 2)
  }
  hzTri(ctx, shx + (shdir > 0 ? 13 : 9), shy - 3, 2, 5, -1)      // dorsal
  ctx.fillRect(shx + (shdir > 0 ? 6 : 13), shy + 3, 4, 1)        // pectoral
  ctx.fillRect(shx + (shdir > 0 ? 6 : 16), shy + 4, 2, 1)
  // Gill slits, and the eye set right up at the snout.
  ctx.fillStyle = pal.rigDark
  for (var gs = 0; gs < 3; gs++)
    ctx.fillRect(nose + (shdir > 0 ? -6 - gs * 2 : 6 + gs * 2), shy - 1, 1, 3)
  ctx.fillStyle = pal.eye
  ctx.fillRect(shdir > 0 ? nose - 4 : nose + 3, shy - 2, 1, 1)
}

function drawSharkJaw(ctx, pal, g, pose) {
  var shy = pose.y, shdir = pose.dir, nose = pose.nose, live = g.live, show = g.show, hot = g.hot
  // The jaw. Shut until it means it, and then the whole point of the thing.
  if (show) {
    ctx.fillStyle = live ? "#ffffff" : pal.warn
    for (var tooth = 0; tooth < 4; tooth++)
      hzTri(ctx, nose + (shdir > 0 ? -2 - tooth * 2 : 2 + tooth * 2), shy + 2, 1, 2, -1)
    ctx.fillStyle = live ? hot : pal.warn
    ctx.fillRect(shdir > 0 ? nose - 8 : nose + 1, shy + 1, 8, 1)
  }
}

function drawHzCurrent(ctx, w, pal, h, geo) {
  var x0 = geo.x0, x1 = geo.x1, y0 = geo.y0, wide = geo.wide, tall = geo.tall,
    live = geo.live, t = geo.t
  // No machine, no mount, nothing to wreck: the fixture IS the water. Drawn
  // as streamlines rather than as a box, because the one thing it has to say
  // is which way it is going — being carried the wrong way down a corridor
  // is only fair if the direction was on screen before the diver arrived.
  //
  // It is the only hazard that draws at full strength when it is NOT firing,
  // for the same reason: the flow has to be legible in the gap so somebody
  // watching can see what is about to happen to the queue walking into it.
  var flowDir = h.dir
  var lines = 7
  for (var fl = 0; fl < lines; fl++) {
    var fy2 = y0 + 3 + fl * Math.max(2, Math.floor((tall - 6) / lines))
    // Each streamline runs at its own speed and phase, which is what makes
    // the band read as moving water instead of as marching dashes.
    var drift = live ? t * 3.4 : t * 1.1 + (geo.winding ? h.t * geo.progress * 0.8 : 0)
    var span = wide + 40
    var head = ((drift + fl * 23) % span)
    var fx2 = flowDir > 0 ? x0 - 20 + head : x1 + 20 - head
    var len = live ? 16 : 9 + Math.round((geo.winding ? geo.progress : geo.cool) * 5)
    ctx.globalAlpha = live ? 0.85 : 0.42 + (geo.winding ? geo.progress : geo.cool) * 0.35
    ctx.fillStyle = live ? pal.bubbleLit : pal.bubble
    // Clipped to the zone by hand: a streamline that ran past the edge would
    // claim corridor the current cannot actually reach.
    var sx2 = Math.max(x0, Math.min(x1, fx2))
    var ex2 = Math.max(x0, Math.min(x1, fx2 + flowDir * len))
    if (ex2 !== sx2) ctx.fillRect(Math.min(sx2, ex2), fy2, Math.abs(ex2 - sx2), 1)
    // An arrowhead on the leading end, so the direction survives a still.
    var tip = flowDir > 0 ? ex2 : sx2
    if (tip > x0 + 1 && tip < x1 - 1) {
      ctx.fillRect(tip - (flowDir > 0 ? 2 : -1), fy2 - 1, 1, 1)
      ctx.fillRect(tip - (flowDir > 0 ? 2 : -1), fy2 + 1, 1, 1)
    }
  }
  ctx.globalAlpha = 1
  // Bubbles caught in it, tumbling along faster than they rise.
  ctx.fillStyle = pal.bubble
  ctx.globalAlpha = live ? 0.7 : 0.3
  for (var cb = 0; cb < 9; cb++) {
    var bubbleDrift = live ? t * 4.2 : t * 1.4 + (geo.winding ? h.t * geo.progress : 0)
    var cbx = x0 + ((bubbleDrift + cb * 31) % Math.max(1, wide))
    if (flowDir < 0) cbx = x1 - (cbx - x0)
    ctx.fillRect(Math.round(cbx), Math.round(y0 + 2 + ((cb * 37) % Math.max(1, tall - 4))), 1, 1)
  }
  ctx.globalAlpha = 1
}

function drawHzVent(ctx, w, pal, h, geo) {
  var x0 = geo.x0, y0 = geo.y0, y1 = geo.y1, cx = geo.cx, wide = geo.wide,
    tall = geo.tall, live = geo.live, t = geo.t, show = geo.show
  // A split in the sea floor letting go of what is under it. Vertical, so it
  // is the one thing in the biome going decisively up.
  ctx.fillStyle = pal.rigDark
  ctx.fillRect(x0 + 1, y1 - 3, wide - 2, 3)                 // the fissure lip
  ctx.fillStyle = pal.rig
  ctx.fillRect(x0 + 2, y1 - 4, wide - 4, 1)
  if (show) {
    // The plume: bubbles widening and fading as they climb, which is the
    // same rule the divers' own exhaust follows so the biome stays coherent.
    for (var vb = 0; vb < 16; vb++) {
      var vlife = (((t * (live ? 2.6 : 1.0)) + vb * 19) % 100) / 100
      var vx = cx + Math.sin(vlife * 5 + vb) * (2 + vlife * (wide / 2))
      var vy = y1 - 4 - vlife * (live ? tall : 3 + geo.progress * 6)
      if (vy < y0) continue
      ctx.globalAlpha = (live ? 0.85 : 0.4) * (1 - vlife * 0.8)
      ctx.fillStyle = live ? pal.bubbleLit : pal.bubble
      var vsz = vlife > 0.6 ? 2 : 1
      ctx.fillRect(Math.round(vx), Math.round(vy), vsz, vsz)
    }
    ctx.globalAlpha = 1
  }
  hzPressure(ctx, w, pal, h, geo, cx, y1 - 4, pal.bubbleLit)
}

function drawHzSpores(ctx, w, pal, h, geo) {
  var x0 = geo.x0, y0 = geo.y0, cx = geo.cx, wide = geo.wide, tall = geo.tall,
    live = geo.live, t = geo.t, show = geo.show, hot = geo.hot
  // A pod that splits, and a drift of spores under it.
  ctx.fillStyle = pal.rigDark
  ctx.fillRect(cx - 4, y0, 8, 4)
  ctx.fillStyle = show ? hot : pal.rig
  ctx.fillRect(cx - 5, y0 + 4, 10, 2)
  ctx.fillStyle = show ? hot : pal.decorDim
  ctx.fillRect(cx - 1, y0 + 2, 2, 2 + (geo.winding ? Math.round(geo.progress * 2) : Math.floor(t / 30) % 2))
  if (show) {
    ctx.fillStyle = hot
    for (var sp2 = 0; sp2 < 14; sp2++) {
      var sy3 = y0 + 6 + ((t + sp2 * 9) % (live ? Math.max(1, tall - 6) : 2 + Math.round(geo.progress * 4)))
      var sx3 = x0 + ((sp2 * 5 + Math.floor(t / 6)) % Math.max(1, wide))
      ctx.fillRect(sx3, sy3, live ? 2 : 1, live ? 2 : 1)
    }
  }
  hzPressure(ctx, w, pal, h, geo, cx, y0 + 6, pal.decor)
}

// --- ice cave -----------------------------------------------------------
function drawHzIcicle(ctx, w, pal, h, geo) {
  var x0 = geo.x0, y0 = geo.y0, wide = geo.wide, tall = geo.tall,
    live = geo.live, winding = geo.winding, t = geo.t, show = geo.show,
    hot = geo.hot
  // Hanging, until it isn't.
  ctx.fillStyle = pal.rigDark
  ctx.fillRect(x0, y0, wide, 2)
  var drop2 = live ? tall - 10 : (winding ? Math.round(geo.progress * 2) : 0)
  ctx.fillStyle = show ? hot : pal.rig
  for (var ic = 0; ic < 3; ic++) {
    var icx = x0 + 2 + ic * Math.max(3, Math.round((wide - 4) / 3))
    hzTri(ctx, icx + (winding ? Math.floor(t / 2) % 2 : 0), y0 + 2 + drop2, 2, 8, 1)
  }
  hzPressure(ctx, w, pal, h, geo, geo.cx, y0 + 4, pal.decorLit)
  hzImpact(ctx, pal, h, geo, geo.cx, geo.y1, pal.decorLit)
}

function drawHzFrostjet(ctx, w, pal, h, geo) {
  var C = geo.C, x0 = geo.x0, y0 = geo.y0, cx = geo.cx, tall = geo.tall,
    live = geo.live, show = geo.show, hot = geo.hot
  ctx.fillStyle = pal.rig
  ctx.fillRect(x0, y0 + 1, 4, tall - 2)             // the nozzle housing
  ctx.fillStyle = pal.rigDark
  ctx.fillRect(x0 + 4, y0 + 3, 3, 3)
  ctx.fillStyle = pal.warn
  ctx.fillRect(x0 + 1, y0 + 2, 1, tall - 4)
  if (show) {
    // A cone of vapour, thickening as it goes.
    ctx.fillStyle = hot
    for (var fj = 0; fj < (live ? 12 * C : 2 + Math.round(geo.progress * 5)); fj++) {
      var fh = Math.round(1 + fj * (live ? 0.18 : 0.1))
      ctx.fillRect(cx + h.dir * fj, y0 + 4 - fh / 2, 1, fh + 1)
    }
  }
  hzPressure(ctx, w, pal, h, geo, x0 + 7, y0 + 4, pal.decorLit)
}

// --- spaceship ----------------------------------------------------------
function drawHzAirlock(ctx, w, pal, h, geo) {
  var x0 = geo.x0, y0 = geo.y0, y1 = geo.y1, wide = geo.wide, tall = geo.tall,
    live = geo.live, winding = geo.winding, show = geo.show, hot = geo.hot
  // Floor plates that part, and everything above them goes.
  var gap2 = hzStroke(geo, Math.round(wide / 2) - 2, 4)
  ctx.fillStyle = pal.rig
  ctx.fillRect(x0, y1 - 4, Math.max(0, wide / 2 - gap2), 4)
  ctx.fillRect(x0 + wide / 2 + gap2, y1 - 4, Math.max(0, wide / 2 - gap2), 4)
  ctx.fillStyle = show ? hot : pal.warn
  ctx.fillRect(x0 + 1, y1 - 5, wide - 2, 1)
  if (live) {
    ctx.fillStyle = pal.fire
    ctx.globalAlpha = 0.5
    ctx.fillRect(x0 + wide / 2 - gap2, y0, gap2 * 2, tall - 4)
    ctx.globalAlpha = 1
  }
  hzLamp(ctx, pal, h, geo, x0 + 1, y1 - 3)
  hzPressure(ctx, w, pal, h, geo, geo.cx, y1 - 4, pal.decorLit)
}

// --- Factory ------------------------------------------------------------
function drawHzStamper(ctx, w, pal, h, geo) {
  var x0 = geo.x0, y0 = geo.y0, y1 = geo.y1, cx = geo.cx, wide = geo.wide,
    tall = geo.tall, live = geo.live, show = geo.show, hot = geo.hot
  // A press on a ram. The head sits high while it winds and is driven to the
  // floor of its zone when it fires, so the whole cycle is in one moving part.
  ctx.fillStyle = pal.rigDark
  ctx.fillRect(x0 + 1, y0, wide - 2, 3)                   // the gantry
  ctx.fillStyle = pal.rig
  var stroke = hzStroke(geo, tall - 15, 3)
  ctx.fillRect(cx - 2, y0 + 3, 4, 6 + stroke)    // the ram
  var headY = y0 + 9 + stroke
  ctx.fillRect(x0 + 2, headY, wide - 4, 6)                // the head
  ctx.fillStyle = pal.rigDark
  for (var sb = 0; sb < wide - 6; sb += 4)                // its bolts
    ctx.fillRect(x0 + 3 + sb, headY + 2, 2, 2)
  if (show) {
    ctx.fillStyle = hot
    ctx.fillRect(x0 + 2, live ? y1 - 1 : headY + 6, wide - 4, 1)
  }
  hzLamp(ctx, pal, h, geo, cx - 2, y0 + 1)
  hzImpact(ctx, pal, h, geo, cx, y1, pal.rig)
}

function drawHzFlywheel(ctx, w, pal, h, geo) {
  var y0 = geo.y0, cx = geo.cx, wide = geo.wide, tall = geo.tall,
    live = geo.live, winding = geo.winding, t = geo.t, hot = geo.hot
  // A wheel that idles and then runs up. Dormant it turns slowly, live it
  // blurs into a disc and throws its spokes out as a ring.
  var fr = Math.min(wide, tall) / 2 - 1
  var fcx = cx, fcy = y0 + tall / 2
  var rate = live ? 0.42 : 0.04
  var angle = t * rate + (winding ? h.t * (0.04 + geo.progress * 0.15) : 0)
  ctx.fillStyle = pal.rigDark
  ctx.fillRect(fcx - fr - 1, fcy - 1, fr * 2 + 2, 2)      // the shaft
  ctx.fillStyle = winding ? hot : pal.rig
  for (var sp = 0; sp < 6; sp++) {
    var sa = angle + sp * Math.PI / 3
    ctx.fillRect(Math.round(fcx + Math.cos(sa) * fr) - 1,
                 Math.round(fcy + Math.sin(sa) * fr) - 1, 2, 2)
  }
  ctx.fillStyle = live ? hot : pal.rigDark
  ctx.fillRect(fcx - 2, fcy - 2, 4, 4)                    // the hub
  if (live) {
    ctx.globalAlpha = 0.4
    ctx.fillStyle = hot
    for (var rg = 0; rg < 10; rg++) {
      var ra = t * rate * 1.6 + rg * Math.PI / 5
      ctx.fillRect(Math.round(fcx + Math.cos(ra) * (fr + 3)) - 1,
                   Math.round(fcy + Math.sin(ra) * (fr + 3)) - 1, 2, 2)
    }
    ctx.globalAlpha = 1
  }
  hzLamp(ctx, pal, h, geo, cx - 2, y0)
  hzImpact(ctx, pal, h, geo, cx, y0 + tall / 2, pal.warn)
}

function drawHzSteamvent(ctx, w, pal, h, geo) {
  var y1 = geo.y1, cx = geo.cx, tall = geo.tall, live = geo.live, t = geo.t,
    show = geo.show, hot = geo.hot
  // A floor pipe that lets go upward. Nothing to see between times except
  // the cowl, which is the point: the danger is the column, not the fitting.
  ctx.fillStyle = pal.rigDark
  ctx.fillRect(cx - 4, y1 - 4, 8, 4)                      // the cowl
  ctx.fillStyle = pal.rig
  ctx.fillRect(cx - 3, y1 - 6, 6, 2)
  if (show) {
    // The column, widening as it rises and thinning as it loses pressure.
    for (var jv = 0; jv < (live ? tall - 6 : 3 + Math.round(geo.progress * 6)); jv += 2) {
      var lift = live ? 1 : 0.45
      var wj = 2 + Math.round(jv * 0.22 * lift)
      ctx.globalAlpha = (live ? 0.75 : 0.35) * (1 - jv / (tall - 6))
      ctx.fillStyle = jv % 4 === 0 ? hot : pal.decorLit
      ctx.fillRect(cx - wj / 2 + Math.sin((t * 0.12) + jv * 0.4) * 2,
                   y1 - 7 - jv, wj, 2)
    }
    ctx.globalAlpha = 1
  }
  hzPressure(ctx, w, pal, h, geo, cx, y1 - 6, pal.decorLit)
}

function drawHzSprinkler(ctx, w, pal, h, geo) {
  var x0 = geo.x0, y0 = geo.y0, wide = geo.wide, tall = geo.tall,
    live = geo.live, t = geo.t, show = geo.show
  // A pipe run with heads on it. Between times it is plumbing; live, it is
  // the reason nobody keeps paper on their desk any more.
  ctx.fillStyle = pal.rigDark
  ctx.fillRect(x0, y0 + 1, wide, 3)                       // the main
  ctx.fillStyle = pal.rig
  for (var sk = 0; sk < 4; sk++) {
    var skx = x0 + 4 + Math.round(sk * (wide - 8) / 3)
    ctx.fillRect(skx - 1, y0 + 4, 3, 3)                   // and its heads
  }
  if (show) {
    ctx.fillStyle = live ? pal.poolLip : pal.decorLit
    for (var sw2 = 0; sw2 < 4; sw2++) {
      var swx = x0 + 4 + Math.round(sw2 * (wide - 8) / 3)
      var reach = live ? tall - 8 : 2 + Math.round(geo.progress * 6)
      for (var sd = 0; sd < reach; sd += 3) {
        var spread = Math.round(sd * 0.35)
        ctx.globalAlpha = live ? 0.8 - sd / (tall * 1.6) : 0.4
        ctx.fillRect(swx - spread + ((t + sd * 3) % 5) - 2, y0 + 7 + sd, 1, 2)
        ctx.fillRect(swx + spread - ((t + sd * 5) % 5) + 1, y0 + 7 + sd, 1, 2)
      }
    }
    ctx.globalAlpha = 1
  }
  hzPressure(ctx, w, pal, h, geo, geo.cx, y0 + 7, pal.poolLip)
}

function drawHzPolisher(ctx, w, pal, h, geo) {
  var x0 = geo.x0, y1 = geo.y1, wide = geo.wide, live = geo.live, t = geo.t,
    seed = geo.seed, show = geo.show, hot = geo.hot
  // A floor buffer nobody switched off, running its beat up and down the
  // same six cells for as long as the building stands.
  var run = (Math.sin(t * 0.035 + seed) * 0.5 + 0.5)
  var pcx = Math.round(x0 + 6 + run * (wide - 12))
  ctx.fillStyle = pal.rigDark
  ctx.fillRect(pcx - 5, y1 - 4, 10, 4)                    // the deck
  ctx.fillStyle = pal.rig
  ctx.fillRect(pcx + 3, y1 - 12, 2, 9)                    // the handle
  ctx.fillRect(pcx + 3, y1 - 13, 5, 2)
  ctx.fillStyle = show ? hot : pal.steelShade
  var turn = live ? t * 2 : t * 0.08 + (geo.winding ? h.t * (0.12 + geo.progress * 0.5) : 0)
  for (var pb = 0; pb < 5; pb++)                          // the pad, spinning
    ctx.fillRect(pcx - 5 + ((pb * 3 + Math.floor(turn)) % 10), y1 - 1, 2, 1)
  if (show) {
    ctx.globalAlpha = 0.5
    ctx.fillStyle = pal.decorLit
    for (var pf = 0; pf < 4; pf++)
      ctx.fillRect(pcx - 7 + pf * 4, y1 - 6 - ((t + pf * 7) % 5), 2, 1)
    ctx.globalAlpha = 1
  }
  hzLamp(ctx, pal, h, geo, pcx - 2, y1 - 3)
  hzImpact(ctx, pal, h, geo, pcx, y1 - 4, pal.decorLit)
}

function drawHzShredder(ctx, w, pal, h, geo) {
  var x0 = geo.x0, y1 = geo.y1, wide = geo.wide, live = geo.live, t = geo.t,
    show = geo.show, hot = geo.hot
  // A slot in the floor with a very good appetite. Dormant it is furniture;
  // armed, the rollers turn and you can see how far down it goes.
  ctx.fillStyle = pal.rigDark
  ctx.fillRect(x0 + 1, y1 - 5, wide - 2, 5)               // the hopper
  ctx.fillStyle = pal.hatchMouth
  ctx.fillRect(x0 + 3, y1 - 4, wide - 6, 3)               // the slot
  if (show) {
    ctx.fillStyle = hot
    for (var sr = 0; sr < 6; sr++)
      ctx.fillRect(x0 + 4 + ((sr * 4 + Math.floor(t * (live ? 0.8 : 0.3))) % (wide - 8)),
                   y1 - 4, 2, 3)                          // the rollers
    if (live) for (var st5 = 0; st5 < wide - 6; st5 += 4)
      hzTri(ctx, x0 + 4 + st5, y1 - 5, 2, 3, -1)          // and the teeth
  }
  hzLamp(ctx, pal, h, geo, x0 + 2, y1 - 2)
  hzImpact(ctx, pal, h, geo, geo.cx, y1 - 5, pal.rig)
}

function drawHzServo(ctx, w, pal, h, geo) {
  var x0 = geo.x0, y0 = geo.y0, cx = geo.cx, wide = geo.wide, tall = geo.tall,
    live = geo.live, winding = geo.winding, show = geo.show, hot = geo.hot
  // An arm on a rail that swings down and sweeps.
  var swing2 = hzStroke(geo, 10, 6) / 10
  ctx.fillStyle = pal.rigDark
  ctx.fillRect(x0, y0, wide, 3)
  ctx.fillStyle = pal.rig
  ctx.fillRect(cx - 2, y0 + 3, 4, Math.round(4 + swing2 * (tall - 8)))
  ctx.fillStyle = show ? hot : pal.warn
  var armY = y0 + 3 + Math.round(4 + swing2 * (tall - 8))
  ctx.fillRect(cx - Math.round(wide / 2 * swing2) - 1, armY, Math.round(wide * swing2) + 2, 2)
  hzLamp(ctx, pal, h, geo, cx - 2, y0 + 1)
  hzImpact(ctx, pal, h, geo, cx, armY, pal.warn)
}

function drawHzDefault(ctx, w, pal, h, geo) {
  var x0 = geo.x0, y0 = geo.y0, wide = geo.wide, tall = geo.tall,
    show = geo.show, hot = geo.hot
  ctx.fillStyle = pal.rig
  ctx.fillRect(x0, y0, wide, 4)
  if (show) { ctx.fillStyle = hot; ctx.fillRect(x0, y0, wide, tall) }
}

function drawHazard(ctx, w, pal, h, opts) {
  h = h || w.hazard
  if (!h) return
  var C = w.k.CELL
  var x0 = h.zx0 * C
  var x1 = (h.zx1 + 1) * C
  var y0 = h.zy0 * C
  var y1 = (h.zy1 + 1) * C
  var cx = Math.round((x0 + x1) / 2)
  var wide = x1 - x0
  var tall = y1 - y0
  var live = h.phase === "fire"
  var winding = h.phase === "charge"
  var t = w.ticks
  var seed = h.zx0

  // Winding up blinks, firing is solid. A steady glow for both would make the
  // moment it becomes lethal impossible to see coming.
  var show = live || (winding && Math.floor(t / 4) % 2 === 0)
  var hot = live ? pal.fireHot : pal.warn

  // Shot to pieces. It stays on the board, because the colony has to be able to
  // see that the thing which was killing them is now scrap, but it does nothing
  // and it is drawn as nothing: a slumped, unlit heap in the material of the
  // earth rather than the machinery colour.
  if (h.wrecked) {
    ctx.fillStyle = pal.rigDark
    var wy = h.mount === "ceiling" ? y0 : y1 - 5
    ctx.fillRect(x0 + 1, wy, wide - 2, 5)
    ctx.fillStyle = pal.dirtShade
    for (var wk = 0; wk < wide; wk += 3)
      ctx.fillRect(x0 + wk, wy + 3 + ((wk >> 1) % 2), 2, 2)
    return
  }

  // Rate-limited: drawn at rest whatever phase it was frozen in, because a
  // fixture caught mid-shot would otherwise sit there looking lethal for seven
  // seconds while the colony walks through it unharmed.
  if (h.throttled > 0) {
    var resting = {}
    for (var hk in h) resting[hk] = h[hk]
    resting.phase = "rest"
    resting.lineTo = -1
    drawEventHazard(ctx, w, pal, resting)
    drawThrottled(ctx, w, cx, y0 - 6, h.throttled)
  } else {
    drawEventHazard(ctx, w, pal, h)
  }
  if (opts && opts.labels) {
    ctx.fillStyle = h.wrecked ? pal.labelFaint : pal.warn
    ctx.font = "bold 6px monospace"
    ctx.textAlign = "center"
    ctx.fillText(h.name, cx, y0 - 3)
    ctx.textAlign = "left"
  }

  spriteFlip = false
  ctx.globalAlpha = 1
}

// Rate Limiter's mark over whatever it has throttled: a pause sign in the
// special's colour and a bar that drains as the window closes. The last second
// blinks, so the end of the window is something a viewer sees coming — the
// same rule as a hazard's wind-up.
var THROTTLE_AMBER = "#ffb13b"
function drawThrottled(ctx, w, cx, y, left) {
  var full = 210
  if (left < 30 && Math.floor(w.ticks / 3) % 2 === 0) return
  ctx.fillStyle = "#1c1c22"
  ctx.fillRect(Math.round(cx) - 6, Math.round(y) - 8, 12, 10)
  ctx.fillStyle = THROTTLE_AMBER
  ctx.fillRect(Math.round(cx) - 3, Math.round(y) - 6, 2, 6)
  ctx.fillRect(Math.round(cx) + 1, Math.round(y) - 6, 2, 6)
  ctx.fillRect(Math.round(cx) - 6, Math.round(y) + 3, Math.max(1, Math.round(12 * left / full)), 1)
}

// The moment it happens: a stop sign held up at arm's length and a ring
// going out from it to the edge of its reach, so the pause marks that appear on
// the far side of the room are seen to have come from this agent.
function drawThrottleSignal(ctx, pal, ag, ox, oy, dir, robe) {
  var p = 1 - ag.throttleFor / 24
  ctx.fillStyle = robe
  blit(ctx, ox, oy, dir, 7, 3, 1, 5)                 // the arm up
  ctx.fillStyle = pal.skin
  blit(ctx, ox, oy, dir, 7, 2, 1, 1)
  ctx.fillStyle = THROTTLE_AMBER
  blit(ctx, ox, oy, dir, 6, -3, 5, 5)                // the sign
  ctx.fillStyle = "#1c1c22"
  blit(ctx, ox, oy, dir, 7, -2, 1, 3); blit(ctx, ox, oy, dir, 9, -2, 1, 3)
  var r = Math.round(6 + p * 60), cx = ox + SPRITE_W / 2, cy = oy + 6
  ctx.globalAlpha = 0.6 * (1 - p)
  ctx.fillStyle = THROTTLE_AMBER
  for (var a = 0; a < 16; a++) {
    var ang = a / 16 * Math.PI * 2
    ctx.fillRect(Math.round(cx + Math.cos(ang) * r), Math.round(cy + Math.sin(ang) * r * 0.5), 2, 1)
  }
  ctx.globalAlpha = 1
}

// One pose per state, for the torso and limbs; drawAgent draws the head, the
// collar and everything laid over them. A state not listed walks.
var AGENT_POSES = {
  climb: drawPoseClimb, fall: drawPoseFall, height: drawPoseFall, rappel: drawPoseRappel,
  webup: drawPoseWebUp, slide: drawPoseSlide, stunned: drawPoseStunned, block: drawPoseBlock,
  build: drawPoseBuild, bash: drawPoseBash, dig: drawPoseDig
}

// Waiting for CI. Three short gestures per role, with long quiet intervals.
// Only the literal same-cell stall counts: a walker pacing across a corridor
// still walks. No draw-time memory or RNG, including for hosts that skip ticks.
var IDLE_REPERTOIRE = {
  block: ["tap", "watch", "fold"], wait: ["phone", "glance", "yawn"],
  camp: ["watch", "glance", "tie"], held: ["drum", "tie", "yawn"],
  stuck: ["tie", "watch", "fold"]
}
function agentIdleKind(ag) {
  if (ag.id === undefined || ag.shotFor > 0) return ""
  if (IDLE_REPERTOIRE[ag.state]) return ag.state
  if (ag.state !== "walk") return ""
  if (ag.waitFor > 0) return "held"
  return ag.still > 24 ? "stuck" : ""
}
function agentIdle(w, ag) {
  var kind = agentIdleKind(ag)
  if (!kind) return null
  var period = 180 + (ag.id % 3) * 23
  var clock = w.ticks + ag.id * 47
  var phase = clock % period
  var turn = (Math.floor(clock / period) + ag.id) % 3
  return { kind: kind, phase: phase, pose: phase < 36 ? IDLE_REPERTOIRE[kind][turn] : "" }
}

// Sleeve rectangles. Hands and props go on after the suit's fine pass, so a
// lapel cannot paint over a wristwatch. The feet stay together and planted;
// the tap lifts just the toe, never alternating legs into a walking stride.
var IDLE_SLEEVES = {
  watch: [[5, 9, 4, 2], [6, 8, 2, 2]], fold: [[0, 9, 8, 2]],
  phone: [[6, 9, 3, 2]], glance: [], yawn: [[6, 6, 2, 5]],
  drum: [[6, 10, 4, 1]], tie: [[5, 8, 2, 3]], tap: []
}
function drawIdleBody(ctx, w, pal, ag, ox, oy, dir, robe, drop, idle) {
  if ((w.res || 1) >= 2 && idle.kind === "block") return drawBracedBlocker(ctx, w, pal, ag, ox, oy, dir, robe, idle)
  blit(ctx, ox, oy, dir, 1, 7 + Math.max(drop, -1), 6, 6 - Math.max(drop, -1))
  blit(ctx, ox, oy, dir, 2, 13, 2, 3)
  var toe = idle.pose === "tap" && idle.phase % 12 < 6 ? 1 : 0
  blit(ctx, ox, oy, dir, 4, 13, 2, 3 - toe)
  if (toe) blit(ctx, ox, oy, dir, 6, 14, 1, 1)
  if (idle.kind === "block" && idle.pose !== "fold") {
    blit(ctx, ox, oy, dir, -2, 8, 3, 2)
    if (!idle.pose || idle.pose === "tap") blit(ctx, ox, oy, dir, 7, 8, 3, 2)
  }
  var sleeves = IDLE_SLEEVES[idle.pose] || []
  for (var i = 0; i < sleeves.length; i++) {
    var r = sleeves[i]
    blit(ctx, ox, oy, dir, r[0], r[1] + drop, r[2], r[3])
  }
}
function drawIdleFine(ctx, pal, ag, ox, oy, dir, drop, idle, w) {
  var look = traitHeadOffset(w, ag)
  drawFineHead(ctx, pal, ag, ox + dir * look.x, oy, dir, drop + look.y - (idle.pose === "glance" ? 1 : 0))
  drawFineSuit(ctx, pal, ox, oy, dir, 7 + Math.max(drop, -1))
  var toe = idle.pose === "tap" && idle.phase % 12 < 6 ? 1 : 0
  if (idle.kind === "block" && (w.res || 1) >= 2) drawFineShoes(ctx, pal, ox, oy, dir, 0, 15.5, 6, 15.5 - toe, 2)
  else drawFineShoes(ctx, pal, ox, oy, dir, 2, 15.5, 4, 15.5 - toe, 2)
}

var IDLE_GESTURES = {
  watch: drawIdleWatch, fold: drawIdleFold, phone: drawIdlePhone,
  yawn: drawIdleYawn, drum: drawIdleDrum, tie: drawIdleTie
}
function drawIdleGesture(ctx, w, pal, ag, ox, oy, dir, robe, drop, idle) {
  if (!idle) return
  var gesture = IDLE_GESTURES[idle.pose]
  if (gesture) gesture(ctx, w, pal, ox, oy + drop, dir, robe, idle.phase)
}
function drawIdleWatch(ctx, w, pal, ox, oy, dir, robe, phase) {
  ctx.fillStyle = pal.skin
  blit(ctx, ox, oy, dir, 7, 9, 2, 1)
  ctx.fillStyle = pal.eye
  blit(ctx, ox, oy, dir, 7, 8, 2, 1)
  ctx.fillStyle = pal.shirt
  blit(ctx, ox, oy, dir, 7, 8, 1, 1)
  if ((w.res || 1) < 2) return
  ctx.fillStyle = pal.eye
  blitFine(ctx, ox, oy, dir, 7.5, 8, 0.5, 0.5) // the build is still pending
  ctx.fillStyle = pal.skin
  blitFine(ctx, ox, oy, dir, 6.5, 8.5, 0.5, 0.5)
}
function drawIdleFold(ctx, w, pal, ox, oy, dir, robe, phase) {
  ctx.fillStyle = pal.lapel
  blit(ctx, ox, oy, dir, 1, 9, 6, 1)
  ctx.fillStyle = pal.skin
  blit(ctx, ox, oy, dir, 1, 10, 2, 1)
  blit(ctx, ox, oy, dir, 5, 9, 2, 1)
  if ((w.res || 1) < 2) return
  ctx.fillStyle = pal.shirt
  blitFine(ctx, ox, oy, dir, 3, 10, 0.5, 1)
  blitFine(ctx, ox, oy, dir, 4.5, 9, 0.5, 1)
}
function drawIdlePhone(ctx, w, pal, ox, oy, dir, robe, phase) {
  ctx.fillStyle = pal.eye
  blit(ctx, ox, oy, dir, 7, 6, 3, 4)
  ctx.fillStyle = pal.exitLight
  blit(ctx, ox, oy, dir, 8, 7, 1, 2)
  ctx.fillStyle = pal.skin
  blit(ctx, ox, oy, dir, 6, 10, 2, 1)
  if ((w.res || 1) < 2) return
  ctx.fillStyle = pal.shirt
  blitFine(ctx, ox, oy, dir, 7.5, 6.5, 2, 0.5)
  blitFine(ctx, ox, oy, dir, 8, 7.5 + (phase >> 3) % 2 * 0.5, 1, 0.5) // scrolling logs
  ctx.fillStyle = pal.skin
  blitFine(ctx, ox, oy, dir, 7, 9, 0.5, 1)
}
function drawIdleYawn(ctx, w, pal, ox, oy, dir, robe, phase) {
  ctx.fillStyle = pal.skin
  blit(ctx, ox, oy, dir, 6, 6, 2, 2)
  if (w.submerged) return
  ctx.fillStyle = pal.eye
  blit(ctx, ox, oy, dir, 5, 6, 1, 2)
  if ((w.res || 1) < 2) return
  ctx.fillStyle = pal.shirt
  blitFine(ctx, ox, oy, dir, 5, 6, 1, 0.5)
  ctx.fillStyle = pal.lapel
  blitFine(ctx, ox, oy, dir, 6.5, 8, 1, 0.5)
}
function drawIdleDrum(ctx, w, pal, ox, oy, dir, robe, phase) {
  var finger = (phase >> 2) % 2
  ctx.fillStyle = pal.skin
  blit(ctx, ox, oy, dir, 8, 10, 2, 1)
  blit(ctx, ox, oy, dir, 9, 9 + finger, 1, 1)
  if ((w.res || 1) < 2) return
  blitFine(ctx, ox, oy, dir, 8, 9.5 + (1 - finger) * 0.5, 0.5, 0.5)
  ctx.fillStyle = pal.shirt
  blitFine(ctx, ox, oy, dir, 7.5, 10, 0.5, 1)
}
function drawIdleTie(ctx, w, pal, ox, oy, dir, robe, phase) {
  ctx.fillStyle = pal.eye
  blit(ctx, ox, oy, dir, 4, 7, 1, 3)
  ctx.fillStyle = pal.skin
  blit(ctx, ox, oy, dir, 4, 8 + (phase >> 3) % 2, 2, 1)
  if ((w.res || 1) < 2) return
  ctx.fillStyle = pal.shirt
  blitFine(ctx, ox, oy, dir, 5.5, 9, 0.5, 1)
  ctx.fillStyle = pal.lapel
  blitFine(ctx, ox, oy, dir, 6, 9, 0.5, 1)
}

function drawAgentBody(ctx, w, pal, ag, ox, oy, dir, robe, skin, st, bodyDrop, walkLead, squash, idle) {
  if ((w.res || 1) >= 2 && st === "bomb") return drawBombPose(ctx, w, pal, ag, ox, oy, dir, robe)
  if (idle) return drawIdleBody(ctx, w, pal, ag, ox, oy, dir, robe, bodyDrop, idle)
  if (st === "height" && ag.heightMode === "cushion") return drawPoseTucked(ctx, w, pal, ag, ox, oy, dir, robe, st, bodyDrop)
  if (w.submerged && (st === "walk" || st === "swim")) return drawPoseSwim(ctx, w, pal, ag, ox, oy, dir, robe, st, bodyDrop)
  if (st === "saved") return drawAgentHome(ctx, w, pal, ag, ox, oy, dir, robe, skin)
  var pose = AGENT_POSES[st]
  if (pose) return pose(ctx, w, pal, ag, ox, oy, dir, robe, st, bodyDrop)
  drawAgentWalk(ctx, ag, ox, oy, dir, robe, skin, walkLead, squash, bodyDrop, st === "walk", w)
}

function drawPoseClimb(ctx, w, pal, ag, ox, oy, dir, robe, st, bodyDrop) {
  if (libraryShelfPose(w, ag)) return drawPoseShelf(ctx, w, pal, ag, ox, oy, dir, robe)
  if ((w.res || 1) >= 2) return drawClimbingPose(ctx, w, pal, ag, ox, oy, dir, robe)
  blit(ctx, ox, oy, dir, 2, 7, 4, 6)
  blit(ctx, ox, oy, dir, 5, 3 + (ag.anim >> 3) % 2, 2, 4)   // hand over hand
  blit(ctx, ox, oy, dir, 3, 13, 3, 3)
}

function drawPoseTucked(ctx, w, pal, ag, ox, oy, dir, robe, st, bodyDrop) {
  // Tucked. The spread-eagle fall pose was being rotated a full turn, and a
  // spread figure spinning is a diagram of a rotation; a tucked one is a
  // salto. Arms in, knees up, nothing sticking out to catch the eye on the
  // way round.
  blit(ctx, ox, oy, dir, 1, 7, 6, 5)              // torso, folded
  blit(ctx, ox, oy, dir, 0, 8, 2, 3)              // arms wrapped in
  blit(ctx, ox, oy, dir, 6, 8, 2, 3)
  blit(ctx, ox, oy, dir, 2, 11, 5, 4)             // knees drawn up
}

function drawPoseFall(ctx, w, pal, ag, ox, oy, dir, robe, st, bodyDrop) {
  blit(ctx, ox, oy, dir, 1, 7, 6, 6)
  blit(ctx, ox, oy, dir, 0, 4, 2, 4)
  blit(ctx, ox, oy, dir, 6, 4, 2, 4)
  blit(ctx, ox, oy, dir, 2, 13, 2, 3)
  blit(ctx, ox, oy, dir, 4, 13, 2, 3)
}

function drawPoseRappel(ctx, w, pal, ag, ox, oy, dir, robe, st, bodyDrop) {
  blit(ctx, ox, oy, dir, 1, 7, 6, 6)
  blit(ctx, ox, oy, dir, 3, 3, 2, 5)             // hand on the web
  blit(ctx, ox, oy, dir, 1, 12, 3, 2)            // feet braced apart
  blit(ctx, ox, oy, dir, 5, 13, 3, 2)
}

function drawPoseWebUp(ctx, w, pal, ag, ox, oy, dir, robe, st, bodyDrop) {
  blit(ctx, ox, oy, dir, 1, 7, 6, 6)
  blit(ctx, ox, oy, dir, 3, 2, 2, 7)              // both hands on the web
  blit(ctx, ox, oy, dir, 0, 12, 3, 2)             // legs trailing in the swing
  blit(ctx, ox, oy, dir, 5, 14, 3, 2)
}

function drawPoseSlide(ctx, w, pal, ag, ox, oy, dir, robe, st, bodyDrop) {
  // Coat, tucked knees and one hand forward: a compact two-cell silhouette
  // that straightens immediately when the roof clears.
  blit(ctx, ox, oy, dir, 1, 8 + bodyDrop, 7, 4)
  blit(ctx, ox, oy, dir, 7, 9 + bodyDrop, 3, 2)
  blit(ctx, ox, oy, dir, 0, 12 + bodyDrop, 4, 2)
}

function drawPoseStunned(ctx, w, pal, ag, ox, oy, dir, robe, st, bodyDrop) {
  blit(ctx, ox, oy, dir, 0, 9, 7, 4)
  blit(ctx, ox, oy, dir, 1, 13, 3, 2)
  blit(ctx, ox, oy, dir, 5, 13, 3, 2)
}

function drawPoseBlock(ctx, w, pal, ag, ox, oy, dir, robe, st, bodyDrop) {
  if ((w.res || 1) >= 2) return drawBracedBlocker(ctx, w, pal, ag, ox, oy, dir, robe)
  blit(ctx, ox, oy, dir, 1, 7, 6, 6)
  blit(ctx, ox, oy, dir, -2, 8, 3, 2)
  blit(ctx, ox, oy, dir, 7, 8, 3, 2)
  blit(ctx, ox, oy, dir, 1, 13, 6, 3)
}

function drawPoseBuild(ctx, w, pal, ag, ox, oy, dir, robe, st, bodyDrop) {
  if ((w.res || 1) >= 2) return drawWorkingBuilder(ctx, w, pal, ag, ox, oy, dir, robe)
  blit(ctx, ox, oy, dir, 1, 7, 6, 6)
  blit(ctx, ox, oy, dir, 6, 8, 3, 2)
  ctx.fillStyle = pal.dirtEdge
  blit(ctx, ox, oy, dir, 8, 9, 5, 2)                        // the brick
  ctx.fillStyle = robe
  blit(ctx, ox, oy, dir, 2, 13, 2, 3)
  blit(ctx, ox, oy, dir, 4, 13, 2, 3)
}

function drawPoseBash(ctx, w, pal, ag, ox, oy, dir, robe, st, bodyDrop) {
  blit(ctx, ox, oy, dir, 1, 7 + bodyDrop, 6, 6)
  var swing = (ag.timer % 6) < 3 ? 0 : 2
  blit(ctx, ox, oy, dir, 6, 8 + swing, 4, 2)
  blit(ctx, ox, oy, dir, 2, 13, 2, 3)
  blit(ctx, ox, oy, dir, 4, 13, 2, 3)
}

function drawPoseDig(ctx, w, pal, ag, ox, oy, dir, robe, st, bodyDrop) {
  blit(ctx, ox, oy, dir, 1, 7 + bodyDrop, 6, 5)
  blit(ctx, ox, oy, dir, 0, 11 + bodyDrop, 2, 3)
  blit(ctx, ox, oy, dir, 6, 11 + bodyDrop, 2, 3)
  blit(ctx, ox, oy, dir, 2, 14, 4, 2)
}

function drawPoseSwim(ctx, w, pal, ag, ox, oy, dir, robe, st, bodyDrop) {
  // Finning, not striding. Two changes carry it and neither needs a new
  // sprite: the body rides the kick, and the legs beat together instead of
  // alternating. A walk cycle is two legs taking turns to hold the ground; a
  // swimmer's legs never touch anything, so they move as a pair and the
  // whole body rises and falls on the same clock.
  var kick = Math.sin(ag.anim * 0.22)
  var lift = Math.round(kick * 1.2)
  var rising = st === "swim" && ag.swimUp

  // Trim. Head-up kicking for the surface, head-down on the way down, level
  // otherwise — standing a walker upright in water was most of what made the
  // first version read as somebody strolling along the sea bed.
  var lean = rising ? -1 : (st === "swim" ? 1 : 0)

  blit(ctx, ox, oy, dir, 1, 7 + lift, 6, 6)                  // torso
  // The trailing arm, swept back along the body. One arm, not two: the far
  // one is behind the torso at this angle and drawing it makes a starfish.
  blit(ctx, ox, oy, dir, 0, 8 + lift + lean, 2, 2)
  // Both legs together, beating. One pixel between them — enough to say two
  // legs, not enough to read as a stride.
  blit(ctx, ox, oy, dir, 2, 13 + lift, 2, 3)
  blit(ctx, ox, oy, dir, 4, 13 + lift + (kick > 0 ? 1 : -1), 2, 3)
  // Fins: the one piece of kit that exists only down here, and what makes
  // the silhouette unmistakable at this size.
  ctx.fillStyle = pal.suit || robe
  blit(ctx, ox, oy, dir, 0, 15 + lift + (kick > 0 ? 1 : 0), 3, 1)
  blit(ctx, ox, oy, dir, 0, 16 + lift + (kick > 0 ? 0 : 1), 3, 1)
  ctx.fillStyle = robe
}

// The umbrella, drawn behind nothing and above everything.
function drawUmbrella(ctx, w, pal, ag, ox, oy, st) {
  if (ag.brollyFor > 0 && st !== "fall") { drawUmbrellaShield(ctx, w, pal, ag, ox, oy); return }
  if (!(ag.floater && st === "fall" && ag.fall > 2)) return
  // It breathes. A canopy that holds one shape all the way down reads as a
  // prop being carried; one that flexes against the air reads as the thing
  // actually holding somebody up. The centre lifts as the tips drop and back
  // again, which is what a canopy taking a load does, and the phase is off
  // the agent's own id so a sky full of them is not one animation repeated.
  var puff = Math.sin(w.ticks * 0.13 + ag.id * 1.7)
  var flex = puff > 0.3 ? 1 : (puff < -0.3 ? -1 : 0)

  // Whose umbrella it is. Keyed off the agent's id so it never changes hand
  // to hand mid-descent, and offset by the colony seed so the same id is not
  // handed the same umbrella every playthrough — the same trick the colony
  // itself uses, and it costs no draw from the trait stream to do it here.
  var brolly = brollyColour(w, pal, ag)

  if ((w.res || 1) >= 2) drawFloatingUmbrella(ctx, w, pal, ag, ox, oy, flex, brolly)
  else {

  ctx.fillStyle = pal.umbrellaStem
  blit(ctx, ox, oy, 1, 4, -6, 1, 7)                    // one-pixel shaft
  blit(ctx, ox, oy, 1, 3, -7 - flex, 3, 1)             // the spreader under it

  // Only the centre flexes. Moving the tips the other way as well pulled
  // them clean off the canopy and left three separate marks in the air.
  ctx.fillStyle = brolly
  blit(ctx, ox, oy, 1, -1, -9 - flex, 11, 2)           // canopy
  blit(ctx, ox, oy, 1, -2, -7, 2, 2)                   // tips, staying put
  blit(ctx, ox, oy, 1, 9, -7, 2, 2)

  ctx.fillStyle = pal.umbrellaRim
  blit(ctx, ox, oy, 1, -1, -10 - flex, 11, 1)          // the lit edge
  blit(ctx, ox, oy, 1, -2, -8, 2, 1)
  blit(ctx, ox, oy, 1, 9, -8, 2, 1)
  }
}

function brollyColour(w, pal, ag) {
  return pal.umbrellas
    ? pal.umbrellas[(ag.id + (w.colonySeed || 0)) % pal.umbrellas.length]
    : pal.umbrella
}

// The umbrella held up as cover (Sim: umbrellaParries, umbrellaGuards). Into
// the line of fire it is a canopy on its side, bulging toward the shooter on
// a short shaft from the forward hand; against falling rock it is held
// overhead. It snaps open over the first four ticks and shudders while held.
var BROLLY_OPEN = 4
function drawUmbrellaShield(ctx, w, pal, ag, ox, oy) {
  var held = w.k.BROLLY_HOLD - ag.brollyFor
  var open = Math.min(1, (held + 1) / BROLLY_OPEN)
  var brolly = brollyColour(w, pal, ag)
  if (!ag.brollyDir) { drawUmbrellaOverhead(ctx, w, pal, ox, oy, open, brolly); return }
  var d = ag.brollyDir, half = Math.max(1, Math.round(6 * open))
  var shake = held < 8 && held % 2 ? 1 : 0
  if ((w.res || 1) >= 2) { drawShieldCanopyFine(ctx, pal, ox, oy, d, open, shake * 0.5, brolly); return }
  ctx.fillStyle = pal.umbrellaStem
  blit(ctx, ox, oy, d, 7, 8, 3, 1)                         // shaft from the hand
  ctx.fillStyle = brolly
  blit(ctx, ox, oy, d, 10 + shake, 8 - half, 2, half * 2 + 1)            // canopy
  if (open >= 1) {
    blit(ctx, ox, oy, d, 9 + shake, 8 - half - 1, 2, 1)                  // tips
    blit(ctx, ox, oy, d, 9 + shake, 8 + half + 1, 2, 1)
  }
  ctx.fillStyle = pal.umbrellaRim
  blit(ctx, ox, oy, d, 12 + shake, 8 - half + 1, 1, Math.max(1, half * 2 - 1))  // lit edge
}

// The side-on canopy at res 2: a dome in half-pixel rows, deepest at the
// middle where the shaft meets it, with the lit rim on the outside and two
// ribs showing through. It is the floater's canopy turned toward the gun.
function drawShieldCanopyFine(ctx, pal, ox, oy, d, open, shake, brolly) {
  var half = Math.max(1, Math.round(6.5 * open * 2) / 2), base = 10 + shake
  ctx.fillStyle = pal.umbrellaStem
  blitFine(ctx, ox, oy, d, 6.5, 8, base - 6.5, 0.5)
  for (var r = -half; r <= half; r += 0.5) {
    var q = 1 - (r / (half + 0.5)) * (r / (half + 0.5))
    var deep = Math.round(3 * Math.sqrt(q) * 2) / 2
    if (deep <= 0) continue
    ctx.fillStyle = brolly
    blitFine(ctx, ox, oy, d, base, 8 + r, deep, 0.5)
    ctx.fillStyle = pal.umbrellaRim
    blitFine(ctx, ox, oy, d, base + deep - 0.5, 8 + r, 0.5, 0.5)
  }
  ctx.fillStyle = pal.umbrellaStem
  ctx.globalAlpha = 0.45
  blitFine(ctx, ox, oy, d, base, 8 - half / 2, 1.5, 0.5)
  blitFine(ctx, ox, oy, d, base, 8 + half / 2, 1.5, 0.5)
  ctx.globalAlpha = 1
  blitFine(ctx, ox, oy, d, base + 0.5, 8 - half - 0.5, 0.5, 0.5)       // tips
  blitFine(ctx, ox, oy, d, base + 0.5, 8 + half + 0.5, 0.5, 0.5)
}

function drawUmbrellaOverhead(ctx, w, pal, ox, oy, open, brolly) {
  if ((w.res || 1) >= 2) {
    drawUmbrellaFine(ctx, pal, ox, oy, 0, brolly, Math.max(0.25, open))
    ctx.fillStyle = pal.umbrellaStem
    blitFine(ctx, ox, oy, 1, 4, -7, 0.5, 9)
    return
  }
  ctx.fillStyle = pal.umbrellaStem
  blit(ctx, ox, oy, 1, 4, -6, 1, 8)
  ctx.fillStyle = brolly
  blit(ctx, ox, oy, 1, -1, -9, 11, 2)
  ctx.fillStyle = pal.umbrellaRim
  blit(ctx, ox, oy, 1, -1, -10, 11, 1)
}

function drawShieldPlate(ctx, pal, ag, ox, oy, dir, robe, hair, skin, C) {
  if (!(ag.shieldFor > 0)) return
  var plateX = dir > 0 ? ox + SPRITE_W + 1 : ox - 4
  var tired = ag.shieldHeld > 260
  ctx.fillStyle = hair
  ctx.fillRect(plateX, oy + 1, 3, SPRITE_PX - 2)
  ctx.fillStyle = robe
  ctx.fillRect(plateX + (dir > 0 ? 0 : 2), oy + 2, 1, SPRITE_PX - 4)
  // Boss in the middle, and an arm behind it.
  ctx.fillStyle = hair
  ctx.fillRect(plateX - dir * 1, oy + 7, 2, 3)
  ctx.fillStyle = skin
  ctx.fillRect(dir > 0 ? ox + SPRITE_W - 1 : ox - 1, oy + 8, 2, 2)

  // The cover itself, faint, along the ground behind it.
  ctx.globalAlpha = tired ? 0.10 : 0.20
  ctx.fillStyle = hair
  ctx.fillRect(dir > 0 ? ox - 4 * C : ox + SPRITE_W, oy + SPRITE_PX - 1, 4 * C, 2)
  ctx.globalAlpha = 1

  // Arms giving out: the plate starts to shake before it comes down, so a
  // drop in cover is something you can see coming rather than something that
  // simply happens to whoever was behind it.
  if (tired && (ag.anim >> 1) % 2 === 0) {
    ctx.fillStyle = pal.warn
    ctx.fillRect(plateX, oy + 1 + ((ag.anim >> 2) % 3), 3, 1)
  }
}

function drawShieldSpark(ctx, pal, ag, ox, oy, dir, hair) {
  if (!(ag.blockFor > 0)) return
  var sparkX = dir > 0 ? ox + SPRITE_W + 3 : ox - 6
  ctx.globalAlpha = Math.min(1, ag.blockFor / 6)
  ctx.fillStyle = pal.fireHot
  ctx.fillRect(sparkX, oy + 6, 4, 4)
  ctx.fillStyle = "#ffffff"
  ctx.fillRect(sparkX + 1, oy + 7, 2, 2)
  ctx.fillStyle = hair
  for (var shard = 0; shard < 3; shard++)
    ctx.fillRect(sparkX + dir * (3 + shard * 3), oy + 3 + shard * 4 - (10 - ag.blockFor), 2, 1)
  ctx.globalAlpha = 1
}

function drawCampShot(ctx, w, pal, ag, ox, oy, dir, st, C) {
  if (!(st === "camp" && ag.shotFor > 0 && ag.special)) return
  var csp = w.specialSpec
  ctx.globalAlpha = Math.min(1, ag.shotFor / 6)
  ctx.fillStyle = csp ? csp.hair : pal.fireHot
  var sx0 = ox + (dir > 0 ? SPRITE_W : 0)
  var sy0 = oy + 9
  var ex0 = ag.shotTo * C
  var ey0 = ag.shotY * C
  var steps2 = Math.max(1, Math.round(Math.abs(ex0 - sx0) / 3))
  for (var q2 = 0; q2 <= steps2; q2++)
    ctx.fillRect(Math.round(sx0 + (ex0 - sx0) * q2 / steps2),
                 Math.round(sy0 + (ey0 - sy0) * q2 / steps2), 2, 1)
  ctx.globalAlpha = 1
}

// Walking. The torso stretches down to the hips whatever the bob, so the
// legs stay planted while the chest rises and falls above them.
function drawAgentWalk(ctx, ag, ox, oy, dir, robe, skin, walkLead, squash, bodyDrop, walking, w) {
  var look = agentTraitLook(w, ag)
  var pixel = look ? blitFine : blit
  walkLead = traitStride(w, ag, walkLead)
  var walkTop = 7 + Math.max(bodyDrop, -1)
  pixel(ctx, ox, oy, dir, 1, walkTop, 6, 13 - walkTop)
  if (squash) {
    pixel(ctx, ox, oy, dir, 1, 13, 2, 3)            // knees out, taking it
    pixel(ctx, ox, oy, dir, 5, 13, 2, 3)
  } else {
    pixel(ctx, ox, oy, dir, 2 + walkLead, 13, 2, 3)
    pixel(ctx, ox, oy, dir, 4 - walkLead, 13, 2, 3)
  }
  // Hands, swinging against the legs: the one in front when the far leg is
  // forward. A pixel each, but a walk with no arms in it is a slide.
  if (walking && walkLead !== 0 && !squash && !(look && look.arms)) {
    ctx.fillStyle = skin
    pixel(ctx, ox, oy, dir, walkLead < 0 ? 6 : 0, 11 + Math.max(bodyDrop, -1), 1, 1)
    ctx.fillStyle = robe
  }
}

// How deep the knees go after a landing: two pixels on the first ticks of a
// real drop, one as it straightens, none for a step down a stair.
function landSquash(w, ag) {
  if (!(ag.landedFrom > 3)) return 0
  var since = w.ticks - ag.landedAt
  return since < 3 ? 2 : (since < 6 ? 1 : 0)
}

// Home. Arms up and a few sparks off the portal (the hop is on `oy`, above,
// so the head goes with it) — the fade alone read as an agent switched off
// rather than one that made it.
function drawAgentHome(ctx, w, pal, ag, ox, oy, dir, robe, skin) {
  ctx.fillStyle = robe
  blit(ctx, ox, oy, dir, 1, 7, 6, 6)
  blit(ctx, ox, oy, dir, 2, 13, 2, 3)
  blit(ctx, ox, oy, dir, 4, 13, 2, 3)
  blit(ctx, ox, oy, dir, 0, 2, 1, 6)             // arms up
  blit(ctx, ox, oy, dir, 7, 2, 1, 6)
  ctx.fillStyle = skin
  blit(ctx, ox, oy, dir, 0, 0, 1, 2)
  blit(ctx, ox, oy, dir, 7, 0, 1, 2)
  ctx.fillStyle = pal.exitLight
  var r = 3 + ag.fade
  for (var sp = 0; sp < 4; sp++) {
    var ang = sp * Math.PI / 2 + ag.fade * 0.3 + ag.id
    ctx.fillRect(Math.round(ox + 4 + Math.cos(ang) * r), Math.round(oy + 6 + Math.sin(ang) * r * 0.7), 1, 1)
  }
  ctx.fillStyle = robe
}

// The umbrella at res 2: a dome built in half-pixel rows instead of a slab,
// in two-tone panels with the ribs running out to the tips, a lit rim, a
// ferrule on top. `flex` lifts the crown the way the
// coarse canopy's centre lifts, so it still breathes.
function drawUmbrellaFine(ctx, pal, ox, oy, flex, brolly, spread) {
  spread = spread === undefined ? 1 : spread
  var cx = ox + 4.5, top = oy - 11 - flex * 0.5 + Math.round((1 - spread) * 6) / 2, base = oy - 7
  var radius = Math.round(6.5 * spread * 2) / 2
  var rows = Math.round((base - top) * 2)
  for (var r = 0; r <= rows; r++) {
    var y = top + r * 0.5, q = (r + 1) / (rows + 1)
    var half = Math.round(radius * Math.sqrt(1 - (1 - q) * (1 - q)) * 2) / 2
    ctx.fillStyle = brolly
    ctx.fillRect(cx - half, y, half * 2, 0.5)
    ctx.globalAlpha = 0.28                                  // every other panel in shade
    ctx.fillStyle = "#000000"
    var panel = Math.round(half) / 2
    ctx.fillRect(cx - panel, y, panel, 0.5)
    ctx.fillRect(cx + panel, y, half - panel, 0.5)
    ctx.globalAlpha = 1
  }
  ctx.fillStyle = pal.umbrellaRim
  ctx.fillRect(cx - radius, base, radius * 2, 0.5)                     // the rim
  for (var rib = -1; rib <= 1; rib += 2)                    // tips hanging off it
    ctx.fillRect(cx + rib * radius - (rib > 0 ? 0.5 : 0), base + 0.5, 0.5, 1)
  ctx.fillRect(cx - 0.5, top - 1, 1, 1)                     // ferrule
  ctx.fillStyle = pal.umbrellaStem
  ctx.fillRect(cx - 0.5, base + 0.5, 1, 6.5)                // shaft
}

// The throw: both arms out toward where the net went, and a line of cord
// arcing from the hands to it for the first few ticks.
function drawNetThrow(ctx, w, ag, ox, oy, dir, hair) {
  var C = w.k.CELL, p = 1 - ag.netFor / 20
  ctx.fillStyle = hair
  blit(ctx, ox, oy, dir, 7, 8, 2, 1); blit(ctx, ox, oy, dir, 7, 10, 2, 1)
  if (p > 0.5) return
  var sx = ox + 4, sy = oy + 8, tx = (ag.netX + 0.5) * C, ty = (ag.netY - 1) * C
  for (var s = 0; s <= 10; s++) {
    var q = s / 10 * Math.min(1, p * 2.5)
    ctx.fillRect(Math.round(sx + (tx - sx) * q), Math.round(sy + (ty - sy) * q - Math.sin(q * Math.PI) * 10), 1, 1)
  }
}

// Hot Reload's revival: a stream of light running from where the colleague
// was lost to the hatch it comes back out of, over a second, then a ring at
// the hatch as it drops through. Without it a body appears at the top of the
// board for no reason anybody could give.
function drawReloadTrail(ctx, w, fx) {
  var age = w.ticks - fx.t
  if (age < 0 || age > 45) return
  var C = w.k.CELL, sp = w.specialSpec
  var sx = fx.fromX * C, sy = (fx.fromY - 2) * C, tx = w.hatch.x * C, ty = w.hatch.y * C
  var p = Math.min(1, age / 30)
  ctx.fillStyle = sp ? sp.hair : "#ff5b8a"
  for (var s = 0; s <= 24; s++) {
    var q = s / 24
    if (q > p || q < p - 0.4) continue
    ctx.globalAlpha = 0.9 * (1 - (p - q) / 0.4)
    ctx.fillRect(Math.round(sx + (tx - sx) * q), Math.round(sy + (ty - sy) * q - Math.sin(q * Math.PI) * 20), 2, 2)
  }
  if (age >= 30) {
    ctx.globalAlpha = 1 - (age - 30) / 15
    var r = 4 + (age - 30)
    for (var a = 0; a < 12; a++) ctx.fillRect(Math.round(tx + Math.cos(a / 12 * Math.PI * 2) * r), Math.round(ty + Math.sin(a / 12 * Math.PI * 2) * r * 0.6), 1, 1)
  }
  ctx.globalAlpha = 1
}

// Rubber Duck's duck, held up at arm's length while it explains: a yellow
// body, an orange beak, an eye, bobbing as it squeaks. The colour is the
// duck's, not the theme's, like the umbrella.
var DUCK_YELLOW = "#ffd23f", DUCK_BEAK = "#ff8a1f"
function drawDuck(ctx, ag, ox, oy, dir) {
  var bob = (ag.debugFor >> 2) % 2, x = dir > 0 ? ox + 8 : ox - 5, y = oy + 3 - bob
  ctx.fillStyle = DUCK_YELLOW
  ctx.fillRect(x, y + 2, 5, 3)                                  // body
  ctx.fillRect(x + (dir > 0 ? 2 : 1), y, 2, 2)                  // head
  ctx.fillStyle = DUCK_BEAK
  ctx.fillRect(dir > 0 ? x + 4 : x, y + 1, 1, 1)
  ctx.fillStyle = "#1a1a20"
  ctx.fillRect(x + (dir > 0 ? 3 : 1), y, 1, 1)
}

// The duck's effect (Sim's debugFx): a squeak of rings off the duck, and over
// the colleague a "?" that turns into a "!" when the answer lands — or stays
// a "?" if all the duck could do was listen.
function drawDebugFx(ctx, w, fx) {
  var age = w.ticks - fx.t, C = w.k.CELL
  if (age > 40) return
  ctx.globalAlpha = 1 - age / 40
  ctx.fillStyle = DUCK_YELLOW
  for (var r = 0; r < 2; r++) {
    var rr = 3 + r * 3 + age * 0.3
    for (var a = 0; a < 8; a++)
      ctx.fillRect(Math.round(fx.fromX * C + Math.cos(a / 8 * Math.PI * 2) * rr), Math.round((fx.fromY - 3) * C + Math.sin(a / 8 * Math.PI * 2) * rr * 0.6), 1, 1)
  }
  var bx = Math.round(fx.x * C) - 1, by = Math.round((fx.y - 5) * C) - age * 0.15
  ctx.fillStyle = "#ffffff"
  ctx.fillRect(bx - 2, by - 7, 7, 8)                             // the bubble
  ctx.fillStyle = "#1a1a20"
  if (fx.helped && age > 10) { ctx.fillRect(bx + 1, by - 6, 1, 4); ctx.fillRect(bx + 1, by - 1, 1, 1) }
  else { ctx.fillRect(bx, by - 6, 3, 1); ctx.fillRect(bx + 2, by - 5, 1, 1); ctx.fillRect(bx + 1, by - 4, 1, 2); ctx.fillRect(bx + 1, by - 1, 1, 1) }
  ctx.globalAlpha = 1
}

// Package Manager's delivery (Sim's restockFx): a parcel thrown up off its
// hands that arcs toward the toolbar end of the sky and is gone, with the
// tool it installed written under it — "+1 basher" — for a second.
function drawRestockFx(ctx, w, pal, fx) {
  var age = w.ticks - fx.t, C = w.k.CELL
  if (age > 40) return
  var x = fx.x * C + age * 1.2, y = (fx.y - 4) * C - age * 2 + age * age * 0.03
  ctx.globalAlpha = 1 - age / 40
  ctx.fillStyle = CRATE_WOOD
  ctx.fillRect(Math.round(x) - 2, Math.round(y) - 2, 5, 4)
  ctx.fillStyle = CRATE_DARK
  ctx.fillRect(Math.round(x) - 2, Math.round(y), 5, 1)
  ctx.fillStyle = pal.label
  ctx.font = "5px monospace"
  ctx.textAlign = "center"
  ctx.fillText("+1 " + fx.skill, Math.round(fx.x * C), Math.round((fx.y - 5) * C) - Math.min(age, 10))
  ctx.globalAlpha = 1
}

// The gesture: a circular arrow over its head while it does it.
function drawReloadSign(ctx, ag, ox, oy, hair) {
  ctx.fillStyle = hair
  var cx = ox + 4, cy = oy - 5, turn = ag.reloadFor * 0.4
  for (var a = 0; a < 9; a++) {
    var ang = turn + a / 12 * Math.PI * 2
    ctx.fillRect(Math.round(cx + Math.cos(ang) * 3), Math.round(cy + Math.sin(ang) * 3), 1, 1)
  }
  ctx.fillRect(Math.round(cx + Math.cos(turn) * 3) - 1, Math.round(cy + Math.sin(turn) * 3), 2, 1)
}

// Persistent rule changes live on the actor layer, below hazards and agents.
// These are visual durations only (guarded against EVENTS by the tests), so a
// direct fireEvent and a scheduled one fade alike without a renderer clock.
var EVENT_VISUAL_SPANS = {
  boost: { Ruins: 420, Foundry: 360, Factory: 380, Skyscraper: 400, "Data Center": 300, "Mail Room": 360, "Building Site": 380, "Clock Tower": { 0: 280, 2: 360 } },
  sight: { Cavern: 420, Frost: 480, "Ice Cave": 450, Desert: 460, Library: 420 },
  fall: { Spaceship: 400 }
}

function eventVisualSpan(w, kind) {
  var span = EVENT_VISUAL_SPANS[kind][w.biome]
  return typeof span === "object" ? span[w.eventMult] : span
}

function activeEventFade(w, kind) {
  var left = kind === "boost" ? w.eventBoost : w.eventDrift
  if (!(left > 0)) return 0
  var full = eventVisualSpan(w, kind) || left + 24
  return Math.max(0, Math.min(1, (full - left + 1) / 24, left / 30))
}

function drawActiveEventAir(ctx, w, pal) {
  if (!(w.eventDrift > 0)) return
  if (w.driftWhat !== "sight" && w.driftWhat !== "fall") return
  var fade = activeEventFade(w, w.driftWhat)
  ctx.save()
  if (w.driftWhat === "sight") drawEventHaze(ctx, w, pal, fade)
  if (w.driftWhat === "fall") drawEventFloatDust(ctx, w, pal, fade)
  ctx.restore()
}

function eventHazeClear(w, x, y) {
  // A small clear pocket around each living colleague. Fixtures are painted
  // afterwards, so even the thickest part never conceals their warning lamps.
  for (var i = 0; i < w.agents.length; i++) {
    var ag = w.agents[i]
    if (!ag.gone && Math.abs(ag.x * w.k.CELL - x) < 19 && Math.abs(ag.y * w.k.CELL - y) < 16) return 0.22
  }
  return 1
}

function drawEventHaze(ctx, w, pal, fade) {
  var wide = w.k.COLS * w.k.CELL, t = w.ticks
  var colour = w.biome === "Desert" ? pal.dust : pal.label
  var samples = Math.floor(96 / w.corridors.length)
  for (var row = 0; row < w.corridors.length; row++) {
    var floor = w.corridors[row].floorY * w.k.CELL
    // Ninety-six coarse samples in total, never a board-sized pixel loop.
    for (var i = 0; i < samples; i++) {
      var x = (Math.floor(i * wide / samples) + row * 11 + Math.floor(t / 5)) % (wide - 12) + 3
      var y = floor - 23 + (i * 7 + row * 3 + Math.floor(t / 11)) % 18
      if (!mechanismAir(w, x, y)) continue
      var clear = eventHazeClear(w, x, y)
      ctx.fillStyle = colour
      ctx.globalAlpha = fade * clear * 0.12
      var span = mechanismAir(w, x + 12, y) ? 12 : 2
      ctx.fillRect(x, y, span, 2)
      ctx.globalAlpha = fade * clear * 0.48
      drawEventHazeGlyph(ctx, w, pal, x, y, i)
    }
  }
}

function drawEventHazeGlyph(ctx, w, pal, x, y, i) {
  if (w.biome === "Cavern") {
    // A body and two staggered wing rows, rather than black flecks of fog.
    var flap = Math.floor(w.ticks / 6 + i) % 2
    ctx.fillStyle = pal.rig
    ctx.fillRect(x + 3, y, 2, 2)
    ctx.fillRect(x, y - flap, 3, 1)
    ctx.fillRect(x + 5, y - flap, 3, 1)
  } else if (w.biome === "Ice Cave") {
    ctx.fillStyle = pal.decorLit
    ctx.fillRect(x, y, 4, 1); ctx.fillRect(x, y + 3, 4, 1)
    ctx.fillRect(x, y + 1, 1, 2); ctx.fillRect(x + 3, y + 1, 1, 2)
  } else {
    ctx.fillRect(x, y, 2, 1); ctx.fillRect(x + 5, y + 2, 1, 1)
    if (w.biome === "Frost") ctx.fillRect(x + 1, y - 1, 1, 3)
  }
  if ((w.res || 1) >= 2) ctx.fillRect(x + 8.5, y + 0.5, 0.5, 0.5)
}

function drawEventFloatDust(ctx, w, pal, fade) {
  var C = w.k.CELL, wide = w.k.COLS * C, top = w.k.SKY * C
  var tall = w.k.ROWS * C - top - 4
  for (var i = 0; i < 80; i++) {
    var x = 3 + (i * 73 + w.level * 19 + Math.round(Math.sin(w.ticks / 25 + i) * 3)) % (wide - 8)
    var y = top + (i * 43 + w.level * 7 + tall - Math.floor(w.ticks * 0.4) % tall) % tall
    if (!mechanismAir(w, x, y)) continue
    ctx.fillStyle = i % 4 === 0 ? pal.steelEdge : pal.dust
    ctx.globalAlpha = fade * 0.6
    ctx.fillRect(x, y, i % 4 === 0 ? 3 : 1, i % 4 === 0 ? 2 : 1)
    ctx.globalAlpha = fade * 0.22
    ctx.fillRect(x, y + 2, 1, 3)
    if ((w.res || 1) >= 2) ctx.fillRect(x + 0.5, y - 0.5, 0.5, 0.5)
  }
}

function eventFloatBob(w, ag) {
  if (!(w.eventDrift > 0) || w.driftWhat !== "fall" || ag.state !== "fall" || ag.gone) return 0
  var res = w.res || 1
  return Math.round(Math.sin(w.ticks / 9 + ag.x) * activeEventFade(w, "fall") * res) / res
}

function drawEventHazard(ctx, w, pal, h) {
  if (!(w.eventBoost > 0)) { drawHazardKind(ctx, w, pal, h); return }
  var fade = activeEventFade(w, "boost")
  if (w.eventMult === 0) drawEventQuietHazard(ctx, w, pal, h, fade)
  else {
    // Speed the idle motion as well as the phase clock already sped by Sim.
    var hotWorld = Object.create(w)
    hotWorld.ticks = w.ticks * w.eventMult
    drawHazardKind(ctx, hotWorld, pal, h)
  }
  drawEventHazardStatus(ctx, w, pal, h, fade)
}

function drawEventQuietHazard(ctx, w, pal, h, fade) {
  var quiet = Object.create(h), still = Object.create(w), dark = Object.create(pal)
  quiet.phase = "idle"; quiet.t = 0; quiet.fired = 0; quiet.lineTo = -1
  still.ticks = h.zx0
  dark.warn = eventDimColour(pal.warn, pal.rigDark, fade)
  dark.fireHot = eventDimColour(pal.fireHot, pal.rigDark, fade)
  dark.fire = eventDimColour(pal.fire, pal.rigDark, fade)
  dark.rig = eventDimColour(pal.rig, pal.rigDark, fade * 0.55)
  ctx.save()
  ctx.globalAlpha = 1 - 0.45 * fade
  drawHazardKind(ctx, still, dark, quiet)
  ctx.restore()
}

function eventDimColour(colour, shade, fade) {
  // Palette emits rgba strings. Blend their channels, keeping hard edges:
  // the lamps cool and relight gradually even when a fixture resets alpha.
  var a = colour.match(/[\d.]+/g), b = shade.match(/[\d.]+/g), channels = []
  for (var i = 0; i < 3; i++) channels.push(Math.round(Number(a[i]) * (1 - fade) + Number(b[i]) * fade))
  return "rgba(" + channels.join(",") + "," + a[3] + ")"
}

function drawEventHazardStatus(ctx, w, pal, h, fade) {
  if (!(w.eventBoost > 0) || h.wrecked || h.throttled > 0) return
  if (w.biome === "Clock Tower") return drawClockHazardStatus(ctx, w, pal, h, fade)
  var C = w.k.CELL, x = Math.round((h.zx0 + h.zx1 + 1) * C / 2)
  var y = h.mount === "ceiling" ? h.zy0 * C + 2 : (h.zy1 + 1) * C - 5
  var stopped = w.eventMult === 0
  ctx.save()
  ctx.globalAlpha = fade
  ctx.fillStyle = pal.rigDark
  ctx.fillRect(x - 3, y - 2, 6, 4)
  ctx.fillStyle = stopped ? pal.rig : pal.fireHot
  ctx.fillRect(x - 2, y - 1, 4, 1)
  if (stopped) {
    ctx.fillStyle = pal.labelFaint
    ctx.fillRect(x - 2, y + 1, 1, 1); ctx.fillRect(x + 1, y + 1, 1, 1)
  } else {
    ctx.globalAlpha = fade * (Math.floor(w.ticks / 3) % 2 ? 0.35 : 1)
    ctx.fillRect(x - 2, y, 4, 1)
    drawEventHeat(ctx, w, pal, x, y, fade, h.mount === "ceiling" ? 1 : -1)
  }
  ctx.restore()
}

function drawEventHeat(ctx, w, pal, x, y, fade, dir) {
  for (var i = 0; i < 10; i++) {
    var rise = (w.ticks * 2 + i * 7) % 23
    var sx = x - 12 + (i * 11 + Math.floor(rise / 4)) % 24, sy = y + dir * (3 + rise)
    if (!mechanismAir(w, sx, sy) || !mechanismAir(w, sx, sy + 1)) continue
    ctx.globalAlpha = fade * (1 - rise / 26) * 0.8
    ctx.fillStyle = i % 3 ? pal.warn : pal.fireHot
    ctx.fillRect(sx, sy, 1, 2)
    if ((w.res || 1) >= 2 && mechanismAir(w, sx, sy - 0.5)) ctx.fillRect(sx + 0.5, sy - 0.5, 0.5, 0.5)
  }
}

// Where an event is about to land (Sim's eventSiteFx), through the
// countdown the banner announces: cracks spreading across the slab that is
// going to fall, with dust trickling out of it faster as it comes; or, for
// growth, the floor's edge blinking in warning where it will rise. Then, for a
// collapse, the rubble coming down. The banner says what; this says where.
function drawEventSite(ctx, w, pal, fx) {
  if (w.biome === "Building Site") drawSiteEventMarker(ctx, w, pal, fx)
  if (w.biome === "Clock Tower") drawClockEventMarker(ctx, w, pal, fx)
  if (w.ticks < fx.fireAt) {
    var p = (w.ticks - fx.warnAt) / Math.max(1, fx.fireAt - fx.warnAt)
    if (fx.mech === "growth") drawGrowthWarning(ctx, w, pal, fx, p)
    else drawCrackWarning(ctx, w, pal, fx, p)
  } else if (fx.mech === "collapse" && fx.firedAt >= 0) drawRubble(ctx, w, pal, fx, w.ticks - fx.firedAt)
}

// Growth: the floor's edge where it will rise, blinking, steadier as it comes.
function drawGrowthWarning(ctx, w, pal, fx, p) {
  if (Math.floor(w.ticks / 6) % 2) return
  var C = w.k.CELL
  ctx.fillStyle = pal.warn
  ctx.globalAlpha = 0.5 + 0.4 * p
  ctx.fillRect(fx.x * C, fx.floorY * C - 1, fx.span * C, 1)
  ctx.globalAlpha = 1
}

// A collapse: a zigzag crack growing outward across the slab from the middle,
// a branch every few pixels, and for a ceiling, dust trickling out faster as
// the moment comes.
function drawCrackWarning(ctx, w, pal, fx, p) {
  var C = w.k.CELL, x0 = fx.x * C, wide = fx.span * C
  var ceiling = fx.at === "ceiling", edgeY = ceiling ? fx.ceilY * C : fx.floorY * C
  ctx.fillStyle = pal.dust
  ctx.globalAlpha = 0.6 + 0.4 * p
  var reach = Math.round(wide * 0.5 * Math.min(1, p * 1.3)), cy = edgeY + (ceiling ? -3 : 1)
  for (var dx = -reach; dx <= reach; dx += 2) {
    var cx = x0 + wide / 2 + dx, zig = (dx >> 1) % 3
    ctx.fillRect(cx, cy + zig, 2, 1)
    if (dx % 6 === 0) ctx.fillRect(cx, cy + zig + (ceiling ? -2 : 1), 1, 2)
  }
  ctx.globalAlpha = 1
  if (!ceiling) return
  var fall = (fx.floorY - fx.ceilY) * C
  for (var i = 0; i < 1 + Math.floor(p * 6); i++)
    ctx.fillRect(x0 + ((i * 37 + fx.x * 11) % Math.max(1, wide)), edgeY + ((w.ticks * (0.6 + i * 0.1) + i * 9) % fall), 1, 1)
}

// The slab coming down: chunks accelerating for half a second, fading.
function drawRubble(ctx, w, pal, fx, age) {
  if (age > 18) return
  var C = w.k.CELL, x0 = fx.x * C, wide = fx.span * C
  var top = fx.at === "ceiling" ? (fx.ceilY - fx.deep) * C : fx.floorY * C
  ctx.fillStyle = pal.rock
  ctx.globalAlpha = 1 - age / 18
  for (var k = 0; k < fx.span * 2; k++)
    ctx.fillRect(x0 + ((k * 23) % wide), top + age * age * 0.08 * C + (k % 3) * 3, 2 + (k % 2), 2)
  ctx.globalAlpha = 1
}

// Tracks in the snow or the sand (Sim's notePrint): a small dent on the
// floor's top edge per step, alternating feet, toe toward the way it was
// going, fading as it fills in. Drawn in the floor's own shadow colour so a
// track reads as a dent and not as something lying on the ground.
function drawPrints(ctx, w, pal) {
  var C = w.k.CELL, fine = (w.res || 1) >= 2
  ctx.fillStyle = pal.rigDark
  for (var i = 0; i < w.prints.length; i++) {
    var p = w.prints[i], age = w.ticks - p.t
    ctx.globalAlpha = 0.85 * Math.max(0, 1 - age / 900) + 0.1
    var px = Math.round(p.x * C) + (p.odd ? -1 : 1), py = (p.y + 1) * C
    if (fine) {
      ctx.fillRect(px - 1, py + 0.5, 2, 1)
      ctx.fillRect(px + (p.dir > 0 ? 1 : -1.5), py + 0.5, 0.5, 0.5)   // the toe, forward
    } else ctx.fillRect(px - 1, py, 2, 1)
  }
  ctx.globalAlpha = 1
}

// The Spaceship's transporters (Sim's `w.pads`): a plate set in the floor at
// each end, its lamps filling up as it recharges, and on each beam a column of
// light with scan lines climbing it — rising out of the sending pad, settling
// onto the receiving one — so where somebody went is as visible as that they
// went. The colour is its own, not the theme's: it has to read as the ship's
// machinery under every palette, like the umbrella and the ladder.
var PAD_LIGHT = "#6ff3ff", PAD_FX_TICKS = 24, PAD_CHARGE = 10
function drawPadPair(ctx, w, pal, p) {
  if (p.tube) return drawTubePair(ctx, w, pal, p)
  var since = w.ticks - p.usedAt
  drawPad(ctx, w, pal, p.ax, p.ay, Math.min(1, since / PAD_CHARGE))
  drawPad(ctx, w, pal, p.bx, p.by, Math.min(1, since / PAD_CHARGE))
  // usedAt starts negative; a newly generated pad has never beamed anyone.
  if (p.usedAt < 0 || since < 0 || since >= PAD_FX_TICKS) return
  drawBeam(ctx, w, p.ax, p.ay, since, -1)
  drawBeam(ctx, w, p.bx, p.by, since, 1)
}

function drawPad(ctx, w, pal, x, y, charge) {
  var C = w.k.CELL, px = (x - 1) * C, py = (y + 1) * C
  ctx.fillStyle = pal.rigDark
  ctx.fillRect(px, py - 1, C * 3, 3)
  ctx.fillStyle = pal.steelShade
  ctx.fillRect(px + 1, py - 2, C * 3 - 2, 1)
  ctx.fillStyle = pal.steelEdge
  ctx.fillRect(px + 2, py - 2, C * 3 - 4, 1)
  ctx.fillStyle = pal.rig
  ctx.fillRect(px, py - 3, 2, 2)
  ctx.fillRect(px + C * 3 - 2, py - 3, 2, 2)
  drawPadLamps(ctx, w, px, py, charge)
}

function drawPadLamps(ctx, w, px, py, charge) {
  ctx.save()
  for (var l = 0; l < 4; l++) {
    ctx.fillStyle = PAD_LIGHT
    ctx.globalAlpha = l < Math.floor(charge * 4) ? 1 : 0.18
    ctx.fillRect(px + 2 + l * 2, py, 1, 1)
  }
  if ((w.res || 1) >= 2) {
    ctx.globalAlpha = 0.8
    ctx.fillRect(px + 0.5, py - 2.5, 1, 0.5)
    ctx.fillRect(px + 10.5, py - 2.5, 1, 0.5)
  }
  ctx.restore()
}

// `way` -1 climbs out of the floor, +1 settles down onto it.
function drawBeam(ctx, w, x, y, age, way) {
  var C = w.k.CELL, px = (x - 1) * C + 1, base = (y + 1) * C
  var fade = 1 - age / PAD_FX_TICKS, fine = (w.res || 1) >= 2
  ctx.save()
  ctx.fillStyle = PAD_LIGHT
  ctx.globalAlpha = 0.08 * fade
  ctx.fillRect(px, base - 18, C * 3 - 2, 16)
  ctx.globalAlpha = 0.6 * fade
  for (var s = 0; s < 3; s++) {
    var t = (age + s * 6) % 16
    ctx.fillRect(px + 1, base - 2 - (way < 0 ? t : 16 - t), C * 3 - 4, fine ? 0.5 : 1)
  }
  if (way < 0) drawBeamOutline(ctx, w, (x + 0.5) * C, base, age, -1)
  drawBeamGrains(ctx, w, px, base, age, way)
  ctx.restore()
}

// A head, shoulders, collar and split boots, scanned away or assembled in rows.
var BEAM_ROWS = [2, 3, 3, 3, 2, 1, 3, 4, 4, 3, 3, 3, 2, 2, 2, 3]
function drawBeamOutline(ctx, w, cx, base, age, way) {
  var progress = Math.min(1, age / PAD_CHARGE), scan = Math.floor(progress * 16)
  for (var row = 0; row < BEAM_ROWS.length; row++) {
    var visible = way < 0 ? row >= scan : row < scan
    if (!visible) continue
    var hw = BEAM_ROWS[row], y = Math.round(base) - SPRITE_PX + row
    ctx.fillStyle = row === (way < 0 ? scan : scan - 1) ? "#ffffff" : PAD_LIGHT
    ctx.globalAlpha = 0.85
    ctx.fillRect(Math.round(cx) - hw, y, 1, 1)
    ctx.fillRect(Math.round(cx) + hw - 1, y, 1, 1)
    ctx.globalAlpha = 0.4
    if (row < 13) ctx.fillRect(Math.round(cx) - hw + 1, y, hw * 2 - 2, 1)
    if ((w.res || 1) >= 2 && row === 5) {
      ctx.fillStyle = "#ffffff"
      ctx.fillRect(Math.round(cx) - 0.5, y, 0.5, 1) // the tie leaves with its row
    }
  }
}

function drawBeamGrains(ctx, w, px, base, age, way) {
  ctx.fillStyle = PAD_LIGHT
  for (var k = 0; k < 6; k++) {
    var phase = (age + k * 3) % 16
    ctx.globalAlpha = 0.8 * (1 - age / PAD_FX_TICKS)
    ctx.fillRect(px + (k * 5 % 9), base - 2 - (way < 0 ? phase : 16 - phase), 1, 1)
  }
}

// The traveller has already moved in Sim. Materialise at its current position
// so the effect follows the walker instead of leaving a second body on the pad.
function drawBeamArrival(ctx, w, ag) {
  if (!w.pads) return false
  for (var i = 0; i < w.pads.length; i++) {
    var p = w.pads[i], age = w.ticks - p.usedAt
    if (p.usedAt < 0 || p.who !== ag.id || age < 0 || age >= PAD_CHARGE) continue
    if (p.tube) return age < TUBE_TRAVEL
    ctx.save()
    drawBeamOutline(ctx, w, ag.x * w.k.CELL, (ag.y + 1) * w.k.CELL, age + 1, 1)
    ctx.restore()
    return true
  }
  return false
}

// Frost's powder snow (Sim's killingFall): a long drop ends in a burst of
// snow thrown up round the landing instead of a splat — the only sign that the
// colony stepped off that ledge on purpose.
var POWDER_TICKS = 16
function drawPowderBursts(ctx, w, pal) {
  var C = w.k.CELL
  ctx.fillStyle = pal.decorLit
  for (var i = 0; i < w.agents.length; i++) {
    var ag = w.agents[i], age = w.ticks - (ag.landedAt === undefined ? -99 : ag.landedAt)
    if (ag.gone || age < 0 || age >= POWDER_TICKS || (ag.landedFrom || 0) < 6) continue
    var cx = ag.x * C, by = (ag.y + 1) * C
    ctx.globalAlpha = 1 - age / POWDER_TICKS
    for (var k = 0; k < 10; k++) {
      var vx = ((k * 7) % 11 - 5) * 0.45, vy = -0.9 - (k % 3) * 0.35
      ctx.fillRect(Math.round(cx + vx * age), Math.round(by + vy * age + age * age * 0.06), k % 2 + 1, 1)
    }
  }
  ctx.globalAlpha = 1
}

// The Cavern's sinkholes (Sim's `w.sinkholes`): before, a crust with a crack
// running through it and a darker sag in the middle — readable as "do not
// trust this" from across the board; after, the slab's chunks dropping down the
// new shaft for a moment.
var SINK_FX = 22
function drawSinkhole(ctx, w, pal, s) {
  var C = w.k.CELL, x0 = s.x * C, wide = 3 * C, top = s.top * C
  if (s.openedAt < 0) {
    ctx.fillStyle = pal.rigDark
    ctx.fillRect(x0 + 2, top, wide - 4, 1)                         // the sag
    for (var i = 0; i < wide - 1; i += 2)                            // the crack
      ctx.fillRect(x0 + i, top + 1 + ((i * 7) % 3 === 0 ? 1 : 0), 2, 1)
    if ((w.res || 1) >= 2) { ctx.fillStyle = pal.decorLit; ctx.fillRect(x0 + 1, top + 0.5, 0.5, 0.5); ctx.fillRect(x0 + wide - 2, top + 0.5, 0.5, 0.5) }
    return
  }
  var age = w.ticks - s.openedAt
  if (age > SINK_FX) return
  ctx.fillStyle = pal.rock
  ctx.globalAlpha = 1 - age / SINK_FX
  for (var k = 0; k < 9; k++)
    ctx.fillRect(x0 + ((k * 5) % (wide - 2)), top + age * age * 0.12 + (k % 3) * 3, 2 + (k % 2), 2)
  ctx.globalAlpha = 1
}

// A colleague in the Ice Cave's ice (Sim's `w.frozen`): the ordinary sprite,
// standing, under a pane of ice with a shine across it — seen through the
// wall, not standing in front of it. When the wall is opened the ice goes in
// shards, drips and a wisp of mist for a second while they walk off.
var FROZEN_FX = 30
function drawFrozen(ctx, w, pal, f) {
  if (f.thawedAt >= 0) { drawThaw(ctx, w, pal, f, w.ticks - f.thawedAt); return }
  var C = w.k.CELL
  drawAgent(ctx, w, pal, { x: f.x + 0.5, y: f.y, dir: f.dir, state: "wait", anim: 0, fade: 0 }, {})
  var x = f.x * C - 1, top = (f.y + 1) * C - SPRITE_PX - 1
  drawIcePane(ctx, w, pal, x, top, C * 2 + 2, SPRITE_PX + 1)
}

function drawIcePane(ctx, w, pal, x, top, wide, tall) {
  ctx.save()
  ctx.fillStyle = pal.decorLit
  ctx.globalAlpha = 0.28
  ctx.fillRect(x + 1, top, wide - 2, tall)
  ctx.fillRect(x, top + 2, wide, tall - 4)
  ctx.globalAlpha = 0.9
  ctx.fillRect(x + 2, top, wide - 4, 1)
  ctx.fillRect(x, top + 2, 1, tall - 4)
  ctx.fillRect(x + wide - 1, top + 2, 1, tall - 4)
  ctx.fillRect(x + 1, top + tall - 2, wide - 2, 2)
  drawIceFacets(ctx, w, pal, x, top, wide, tall)
  ctx.restore()
}

function drawIceFacets(ctx, w, pal, x, top, wide, tall) {
  ctx.fillStyle = pal.dust
  ctx.globalAlpha = 0.65
  for (var r = 1; r < tall - 2; r++) {
    var edge = Math.min(3, Math.floor(r / 4))
    ctx.fillRect(x + 1 + edge, top + r, 1, 1)
    if (r % 3 === 0) ctx.fillRect(x + wide - 2, top + r, 2, 1)
  }
  ctx.fillStyle = "#ffffff"
  ctx.globalAlpha = 0.7
  ctx.fillRect(x + 1, top + 1, 2, 1)
  ctx.fillRect(x + 1, top + 2, 1, 3)
  ctx.fillRect(x + wide - 3, top + tall - 3, 2, 1)
  if ((w.res || 1) < 2) return
  ctx.globalAlpha = 0.55 + Math.sin(w.ticks * 0.045 + x) * 0.2
  for (var j = 0; j < 6; j++) ctx.fillRect(x + 3 + j * 0.5, top + 9 - j, 0.5, 1)
}

function drawThaw(ctx, w, pal, f, age) {
  if (age < 0 || age >= FROZEN_FX) return
  var C = w.k.CELL, cx = (f.x + 0.5) * C, base = (f.y + 1) * C
  ctx.save()
  ctx.globalAlpha = 1 - age / FROZEN_FX
  for (var k = 0; k < 8; k++) {
    var vx = ((k * 29) % 7 - 3) * 0.3, vy = -0.7 - (k % 3) * 0.3
    var x = Math.round(cx + vx * age), y = Math.min(base - 2, Math.round(base - 8 + vy * age + age * age * 0.05))
    ctx.fillStyle = pal.decorLit
    ctx.fillRect(x, y, 2, 1 + k % 2)
    ctx.fillStyle = pal.dust
    ctx.fillRect(x, y, 1, 1)
  }
  drawThawDrips(ctx, w, pal, cx, base, age)
  ctx.restore()
}

function drawThawDrips(ctx, w, pal, cx, base, age) {
  ctx.fillStyle = pal.decorLit
  ctx.fillRect(cx - 4, base - 1, 8, 1) // meltwater stays on the floor
  for (var d = 0; d < 3; d++) {
    var fall = Math.max(0, age - d * 4), x = cx - 3 + d * 3
    var y = Math.min(base - 2, base - 14 + Math.floor(fall * fall * 0.12))
    ctx.fillRect(x, y, 1, 2)
    if ((w.res || 1) >= 2) {
      ctx.fillStyle = pal.dust
      ctx.fillRect(x, y, 0.5, 0.5)
      ctx.fillStyle = pal.decorLit
    }
  }
  ctx.fillStyle = pal.dust
  ctx.globalAlpha *= 0.35
  for (var p = 0; p < 3; p++)
    ctx.fillRect(Math.round(cx - 3 + p * 3 + Math.sin(age * 0.15 + p)), Math.round(base - 8 - age * 0.25 - p * 2), 2, 1)
}

// The Ruins' boulder (Sim's `w.boulder`): a carved stone ball with three cracks
// and an off-centre fossil turning under fixed upper-left lighting. Rocks
// on its seat while it wakes, kicks up dust as it goes, and flies apart where
// it stops. Half-pixel moss and a rim of light at res 2.
// Its own sandstone, not the biome's rock: the rock is the backdrop's colour,
// and a stone the colour of the wall behind it is a stone nobody sees coming.
var BOULDER_ROWS = [2, 4, 5, 5, 6, 6, 6, 6, 5, 5, 4, 2]   // half-width per row
var BOULDER_STONE = "#a8946f", BOULDER_LIT = "#dcc9a0", BOULDER_SHADE = "#6b5a42", BOULDER_CUT = "#3b3024"
var BOULDER_SHARDS = 10
function drawBoulder(ctx, w, pal, b) {
  if (b.state === "done") { drawBoulderShards(ctx, w, pal, b, w.ticks - b.endedAt); return }
  var waking = b.state === "wake" ? w.ticks - b.wokeAt : -1
  var cx = Math.round(b.x * w.k.CELL) + (waking >= 0 ? Math.round(Math.sin(waking * 1.3)) : 0)
  var bot = (Math.floor(b.y) + 1) * w.k.CELL, top = bot - BOULDER_ROWS.length
  if (b.state === "roll" || waking >= 0) drawBoulderDust(ctx, w, pal, b, cx, bot, waking)
  drawBoulderBody(ctx, cx, top)
  drawBoulderGlyph(ctx, pal, cx, top + 6, b.spin * b.dir)
  if ((w.res || 1) >= 2) drawBoulderFine(ctx, pal, cx, top)
}

function drawBoulderBody(ctx, cx, top) {
  for (var r = 0; r < BOULDER_ROWS.length; r++) {
    var hw = BOULDER_ROWS[r]
    ctx.fillStyle = BOULDER_SHADE
    ctx.fillRect(cx - hw, top + r, hw * 2, 1)
    ctx.fillStyle = BOULDER_STONE
    ctx.fillRect(cx - hw, top + r, hw * 2 - 2, 1)
    if (r < 8) {
      ctx.fillStyle = BOULDER_LIT
      ctx.fillRect(cx - hw, top + r, Math.max(1, 4 - Math.floor(r / 3)), 1)
    }
  }
}

function drawBoulderDust(ctx, w, pal, b, cx, bot, waking) {
  ctx.save()
  ctx.fillStyle = pal.dust
  for (var d = 0; d < 5; d++) {
    var age = (w.ticks + d * 5) % 18, reach = 5 + Math.floor(age * 0.7)
    var x = cx - b.dir * reach, y = bot - 1 - Math.floor(age * 0.15) - d % 2
    if (waking >= 0) { x = cx + (d % 2 ? -1 : 1) * (5 + age % 3); y = bot - 1 - d % 2 }
    ctx.globalAlpha = 0.65 * (1 - age / 18)
    ctx.fillRect(x, y, 2, 1)
    if ((w.res || 1) >= 2) ctx.fillRect(x + 0.5, y - 0.5, 0.5, 0.5)
  }
  ctx.restore()
}

// Three unequal markings turn with the stone; the rim light never turns.
function drawBoulderGlyph(ctx, pal, cx, cy, spin) {
  ctx.fillStyle = BOULDER_CUT
  for (var arm = 0; arm < 3; arm++) {
    var a = spin + arm * Math.PI * 2 / 3
    for (var t = 1; t <= 4; t++)
      ctx.fillRect(cx + Math.round(Math.cos(a) * t) - 1, cy + Math.round(Math.sin(a) * t), 1, 1)
  }
  // An off-centre fossil breaks rotational symmetry; light stays on the body.
  var fx = cx + Math.round(Math.cos(spin + 0.6) * 3)
  var fy = cy + Math.round(Math.sin(spin + 0.6) * 3)
  ctx.fillStyle = BOULDER_SHADE
  ctx.fillRect(fx - 1, fy - 1, 2, 2)
  ctx.fillStyle = BOULDER_LIT
  ctx.fillRect(fx - 1, fy - 1, 1, 1)
}

function drawBoulderFine(ctx, pal, cx, top) {
  ctx.fillStyle = "#fff1cf"
  ctx.fillRect(cx - 3, top + 0.5, 3, 0.5)                 // rim light
  ctx.fillRect(cx - 4.5, top + 1.5, 1, 0.5)
  ctx.fillRect(cx - 5.5, top + 3, 0.5, 1.5)
  ctx.fillStyle = pal.decor
  ctx.fillRect(cx + 1, top, 2, 0.5)                       // moss on the crown
  ctx.fillRect(cx + 2.5, top + 0.5, 1.5, 0.5)
  ctx.fillStyle = BOULDER_SHADE
  ctx.fillRect(cx - 2.5, top + 9.5, 0.5, 0.5)             // pits
  ctx.fillRect(cx + 3, top + 4, 0.5, 0.5)
}

function drawBoulderShards(ctx, w, pal, b, age) {
  if (age < 0 || age >= 24) return
  var C = w.k.CELL, cx = b.x * C, base = (Math.floor(b.y) + 1) * C
  ctx.save()
  ctx.globalAlpha = 1 - age / 24
  for (var k = 0; k < BOULDER_SHARDS; k++) {
    var vx = ((k * 37) % 9 - 4) * 0.35 - b.dir * 0.3, vy = -1.2 - (k % 4) * 0.35
    var x = Math.round(cx + vx * age), y = Math.min(base - 2, Math.round(base - 6 + vy * age + age * age * 0.09))
    ctx.fillStyle = BOULDER_SHADE
    ctx.fillRect(x, y, 2 + k % 2, 2)
    ctx.fillStyle = BOULDER_STONE
    ctx.fillRect(x, y, 2, 1)
    if ((w.res || 1) >= 2) { ctx.fillStyle = BOULDER_LIT; ctx.fillRect(x, y, 1, 0.5) }
  }
  drawBoulderImpact(ctx, pal, cx, base, age)
  ctx.restore()
}

function drawBoulderImpact(ctx, pal, cx, base, age) {
  ctx.fillStyle = pal.dust
  ctx.globalAlpha *= 0.6
  for (var d = 0; d < 6; d++) {
    var side = d % 2 ? -1 : 1
    ctx.fillRect(Math.round(cx + side * (3 + age * 0.7 + d)), base - 1 - Math.floor(age / 6) - d % 3, 3, 1)
  }
}

// A Foundry hoist chain down a wall face (a ladder in everything but looks):
// links that alternate face-on and edge-on, a fixed hook and a small pendulum
// sway growing toward the loose end. Half-pixel glints at res 2.
function drawChain(ctx, w, pal, stile, lbot, lspan) {
  for (var y = 0; y < lspan; y += 3) {
    var top = lbot - y - 3
    var sway = Math.round(Math.sin(w.ticks * 0.035 + stile * 0.2) * (1 - y / lspan))
    drawChainLink(ctx, w, pal, stile + sway, top, (y / 3) % 2 === 0)
  }
  ctx.fillStyle = pal.rigDark
  ctx.fillRect(stile - 1, lbot - lspan - 3, 5, 2)
  ctx.fillStyle = pal.steelEdge
  ctx.fillRect(stile, lbot - lspan - 2, 3, 1)
  ctx.fillRect(stile + 2, lbot - lspan - 1, 1, 2)
}

function drawChainLink(ctx, w, pal, x, top, face) {
  ctx.fillStyle = pal.steelShade
  if (face) {
    ctx.fillRect(x, top, 3, 3)
    ctx.fillStyle = pal.rigDark
    ctx.fillRect(x + 1, top + 1, 1, 1)
    ctx.fillStyle = pal.steelEdge
    ctx.fillRect(x, top, 1, 2)
  } else {
    ctx.fillRect(x + 1, top, 1, 3)
    ctx.fillStyle = pal.rig
    ctx.fillRect(x + 1, top, 1, 1)
  }
  if ((w.res || 1) < 2) return
  ctx.fillStyle = pal.steelEdge
  ctx.fillRect(x + (face ? 0.5 : 1), top + 0.5, 0.5, 1)
}

// A Jungle vine down a wall face (a ladder in everything but looks): a
// rooted stem, gently swaying at the loose end, with cupped leaves on alternate
// sides. Whole-pixel contours first, half-pixel veins at res 2.
function drawVine(ctx, w, pal, stile, lbot, lspan, seed) {
  for (var y = 0; y < lspan; y++) {
    var sway = Math.sin(w.ticks * 0.04 + seed) * (1 - y / lspan)
    var wob = Math.round(Math.sin((y + seed * 3) * 0.35) + sway)
    var x = stile + 1 + wob, py = lbot - y - 1
    ctx.fillStyle = pal.decorDim
    ctx.fillRect(x, py, 2, 1)
    ctx.fillStyle = pal.decor
    ctx.fillRect(x, py, 1, 1)
    if (y % 5 === seed % 5) drawVineLeaf(ctx, w, pal, x, py, (y % 10 < 5 ? 1 : -1))
  }
}

function drawVineLeaf(ctx, w, pal, x, y, side) {
  var left = side > 0 ? x + 1 : x - 3
  ctx.fillStyle = pal.decor
  ctx.fillRect(left, y - 1, 3, 1)
  ctx.fillRect(left + 1, y - 2, 2, 1)
  ctx.fillStyle = pal.decorLit
  ctx.fillRect(left + 1, y - 1, 2, 1)
  if ((w.res || 1) >= 2) {
    ctx.fillStyle = pal.decorDim
    ctx.fillRect(left + 0.5, y - 0.5, 2, 0.5)
  }
}

// Fallback's net: two posts and a mesh slung between them on the landing
// floor, in the special's colours so it is seen to be its. It sags and springs
// back when it takes somebody, and fades for its last second.
var NET_FADE = 30
function drawNet(ctx, w, n) {
  var sp = w.specialSpec, C = w.k.CELL
  var age = w.ticks - n.t, left = 120 - age
  if (left <= 0) return
  var x0 = (n.x - 3) * C, x1 = (n.x + 4) * C, base = (n.y + 1) * C
  var since = n.caught >= 0 ? w.ticks - n.caught : 99
  var sag = since < 12 ? Math.round(Math.sin(since / 12 * Math.PI) * 4) : 1
  var rise = Math.min(1, age / 6)
  ctx.globalAlpha = left < NET_FADE ? left / NET_FADE : 1
  ctx.fillStyle = sp ? sp.robe : "#3a8f8f"
  ctx.fillRect(x0, base - 9 * rise, 1, 9 * rise)                  // posts
  ctx.fillRect(x1 - 1, base - 9 * rise, 1, 9 * rise)
  ctx.fillStyle = sp ? sp.hair : "#ffd6e0"
  var span = x1 - x0
  for (var i = 0; i <= span; i += 2) {
    var d = Math.round(Math.sin(i / span * Math.PI) * sag)
    ctx.fillRect(x0 + i, base - 7 * rise + d, 1, 1)                // the top cord
    if (i % 4 === 0) ctx.fillRect(x0 + i, base - 6 * rise + d, 1, 3 + sag)   // mesh
  }
  ctx.globalAlpha = 1
}

// A disc in two-pixel rows, so a fireball keeps the board's blockiness rather
// than turning up as the one smooth circle in the game. `rag` frays the edge
// row by row, off a seed, so it billows instead of reading as a balloon.
function pixelDisc(ctx, cx, cy, r, rag, seed) {
  for (var dy = -r; dy <= r; dy += 2) {
    var half = Math.round(Math.sqrt(Math.max(0, r * r - dy * dy)))
    if (rag) half += Math.round(Math.sin(dy * 1.7 + seed) * rag)
    if (half > 0) ctx.fillRect(Math.round(cx - half), Math.round(cy + dy), half * 2, 2)
  }
}

// Fire is fire in every theme, for the reason blood is blood: the theme's
// `urgent` is pink in some of them, and a pink explosion is a balloon.
var BLAST_RIM = "#c2402a", BLAST_MID = "#ff8a35", BLAST_CORE = "#ffe68a"

// An explosion over its life (Sim's `noteBlast`): a white flash, a fireball
// that swells to the blast radius in three layers and burns down from the
// core outward, a shock ring running out past it, and smoke left rising. The
// size is the real radius, so a mine reads bigger than a bomb because it is,
// and a drone's pop stays a pop.
function drawBlast(ctx, w, pal, b) {
  var a = w.ticks - b.t
  if (a < 0 || a > 26) return
  var C = w.k.CELL, cx = b.x * C, cy = b.y * C, R = b.r * C
  var grow = Math.min(1, a / 4)
  if (a < 10) {
    ctx.globalAlpha = 0.6 * (1 - a / 10)
    ctx.fillStyle = BLAST_CORE
    var ring = R * (0.7 + a / 6)
    for (var s = 0; s < 24; s++) {
      var ang = s / 24 * Math.PI * 2
      ctx.fillRect(Math.round(cx + Math.cos(ang) * ring), Math.round(cy + Math.sin(ang) * ring * 0.8), 2, 1)
    }
  }
  if (a > 4) {
    ctx.fillStyle = pal.rigDark
    ctx.globalAlpha = 0.6 * (1 - (a - 4) / 22)
    for (var pf = 0; pf < 5; pf++) {
      var px = cx + (pf - 2) * R * 0.34, py = cy - (a - 4) * 0.55 - (pf % 2) * 3
      pixelDisc(ctx, px, py, 3 + (pf % 3) + Math.round((a - 4) / 5), 1, pf + b.t)
    }
  }
  var layers = [[BLAST_RIM, 1.0, 13], [BLAST_MID, 0.72, 9], [BLAST_CORE, 0.42, 5]]
  for (var li = 0; li < layers.length; li++) {
    var until = layers[li][2]
    if (a >= until) continue
    ctx.globalAlpha = a < 3 ? 1 : 1 - (a - 3) / (until - 3)
    ctx.fillStyle = layers[li][0]
    pixelDisc(ctx, cx, cy - a * 0.3, Math.round(R * layers[li][1] * (0.4 + 0.6 * grow)), 2, b.t + li * 3 + a)
  }
  if (a < 2) {
    ctx.globalAlpha = 0.95
    ctx.fillStyle = "#ffffff"
    pixelDisc(ctx, cx, cy, Math.round(R * 0.35), 0, 0)
  }
  ctx.globalAlpha = 1
}

// One 8x16 sprite, mirrored by facing, with per-action limb changes. The
// helper takes coordinates in right-facing sprite space and flips them for a
// left-facing agent, so every pose below is written once.
// Set while drawing an agent that is upside down. A module-level flag rather
// than another parameter because every pose in this file goes through blit and
// none of them should have to know which way up they are.
var spriteFlip = false

// Stack Overflow's timber. Kept here rather than taken from the palette on
// purpose: a ladder has to read as a thing somebody brought to the level, not
// as part of the biome it was left in, so it stays the same colour under every
// theme exactly like the umbrella does.
var SPECIALS_LADDER_WOOD = "#b5651d"
var SPECIALS_LADDER_RUNG = "#ffe9a8"

// blit at half-pixel precision: the same mirroring and flipping, rounded to
// 0.5 instead of 1. Only for detail that is drawn when the host gives each art
// pixel two canvas pixels (`w.res`); at res 1 it would smear.
function blitFine(ctx, ox, oy, dir, x, y, bw, bh) {
  var sx = dir > 0 ? ox + x : ox + (SPRITE_W - x - bw)
  var sy = spriteFlip ? oy + (SPRITE_PX - y - bh) : oy + y
  ctx.fillRect(Math.round(sx * 2) / 2, Math.round(sy * 2) / 2, bw, bh)
}

// The agent's half-pixel detail. Everything here sits inside the silhouette
// the coarse sprite already draws, so at res 1 nothing is missing and at res 2
// the same figure turns out to be wearing something: a tie, lapels, buttons,
// shoes, glasses with arms that reach the ear and a glint on the lens.
// Each action keeps its own limb coordinates, just like AGENT_POSES. The
// umbrella already has a fine canopy; its passenger uses the fall detail.
var FINE_POSES = {
  walk: drawAgentUprightFine, block: drawAgentUprightFine, ride: drawAgentUprightFine,
  bash: drawAgentUprightFine, wait: drawAgentUprightFine, camp: drawAgentUprightFine, trick: drawAgentUprightFine,
  climb: drawFineClimb, webup: drawFineWebUp, rappel: drawFineRappel,
  build: drawFineBuild, dig: drawFineDig, fall: drawFineFall, height: drawFineHeight,
  slide: drawFineSlide, stunned: drawFineStunned,
  bomb: drawFineBomb, jump: drawFineStride, ceil: drawFineStride
}
function drawAgentFine(ctx, pal, ag, ox, oy, dir, drop, lead, squash, robe, w) {
  if (w && libraryShelfPose(w, ag)) {
    drawFineHead(ctx, pal, ag, ox, oy, dir, drop)
    drawFineSuit(ctx, pal, ox, oy, dir, 7)
    return
  }
  var pose = FINE_POSES[ag.state]
  if (!pose) return
  if (pose !== drawAgentUprightFine) drawFineHead(ctx, pal, ag, ox, oy, dir, drop)
  pose(ctx, pal, ag, ox, oy, dir, drop, lead, squash, robe, w)
}

// A colony still wears one suit. Personality is a half-pixel tilt, a cuff or
// something crammed into that suit; heroes keep their own costume. These are
// drawing choices, never a second copy of the simulation's trait rules.
var TRAIT_LOOKS = {
  steady:   { x: 0,   y: 0,    stride: 1,    draw: drawTraitSteady },
  brave:    { x: 0.5, y: -0.5, stride: 1.5,  arms: true, draw: drawTraitBrave },
  cautious: { x: 0.5, y: 0.5,  stride: 0.5,  arms: true, draw: drawTraitCautious },
  curious:  { x: 0,   y: 0,    stride: 1,    arms: true, draw: drawTraitCurious },
  stubborn: { x: 0.5, y: 0,    stride: 1,    arms: true, draw: drawTraitStubborn },
  tinkerer: { x: 0,   y: 0,    stride: 1,    draw: drawTraitTinkerer },
  engineer: { x: 0,   y: 0,    stride: 1,    draw: drawTraitEngineer },
  sentinel: { x: 0,   y: -0.5, stride: 0.5,  arms: true, draw: drawTraitSentinel },
  burrower: { x: 0,   y: 0,    stride: 1,    draw: drawTraitBurrower },
  hoarder:  { x: 0,   y: 0,    stride: 1,    draw: drawTraitHoarder },
  follower: { x: 0,   y: 0,    stride: 1,    arms: true, draw: drawTraitFollower },
  skittish: { x: 0,   y: 0,    stride: 1.5,  arms: true, draw: drawTraitSkittish }
}
var TRAIT_POSES = { walk: true, wait: true, block: true, ride: true }
function agentTraitLook(w, ag) {
  if (!w || (w.res || 1) < 2 || ag.special || !TRAIT_POSES[ag.state]) return null
  return TRAIT_LOOKS[ag.trait] || null
}
function traitHeadOffset(w, ag) {
  var look = agentTraitLook(w, ag)
  if (!look || w.submerged) return { x: 0, y: 0 }
  // Peeks are brief and staggered by id, with no random draw or pose memory.
  var peek = (ag.anim + (ag.id || 0) * 17) % 96
  if (ag.trait === "curious" && peek < 20) return { x: peek < 10 ? 0.5 : -0.5, y: -0.5 }
  if ((ag.trait === "follower" || ag.trait === "skittish") && peek < 16) return { x: -0.5, y: 0 }
  return { x: look.x, y: look.y }
}
function traitStride(w, ag, lead) {
  var look = agentTraitLook(w, ag)
  return look ? lead * look.stride : lead
}
function drawTraitDetail(ctx, w, pal, ag, ox, oy, dir, drop, lead, idle) {
  var look = agentTraitLook(w, ag)
  if (!look) return
  var head = traitHeadOffset(w, ag)
  var lift = w.submerged && !idle && ag.state === "walk" ? Math.round(Math.sin(ag.anim * 0.22) * 1.2) : 0
  var p = { ctx: ctx, pal: pal, ag: ag, x: ox, y: oy + drop + lift, dir: dir,
    drop: drop, lead: idle ? 0 : lead, hands: !idle || !idle.pose,
    hx: head.x, hy: head.y - (idle && idle.pose === "glance" ? 1 : 0), wet: w.submerged }
  look.draw(p)
}
function traitPixel(p, color, x, y, width, height) {
  p.ctx.fillStyle = color
  blitFine(p.ctx, p.x, p.y, p.dir, x, y, width, height)
}
function drawTraitSteady(p) {
  // Pressed sleeves. Somebody has to be the adult in this meeting.
  traitPixel(p, p.pal.lapel, 1.5, 9, 0.5, 2)
  traitPixel(p, p.pal.shirt, 1.5, 11, 1, 0.5)
}
function drawTraitBrave(p) {
  traitPixel(p, p.pal.lapel, 1, 6.5, 1.5, 0.5)
  if (!p.hands || p.ag.state === "block") return
  var front = p.lead < 0 ? 7 : 6.5, back = p.lead > 0 ? -0.5 : 0
  traitPixel(p, p.pal.robe, front, 9.5, 1, 1.5)
  traitPixel(p, p.pal.skin, front, 11, 1, 0.5)
  traitPixel(p, p.pal.skin, back, 11.5, 1, 0.5)
}
function drawTraitCautious(p) {
  // Shoulders up, hands held close, eyes tipped toward the next floor cell.
  traitPixel(p, p.pal.lapel, 5.5, 6.5, 1.5, 0.5)
  traitPixel(p, p.pal.robe, 2.5, 7, 2.5, 0.5)
  if (!p.hands) return
  traitPixel(p, p.pal.skin, 5.5, 9.5, 1, 0.5)
  traitPixel(p, p.pal.shirt, 5, 10, 0.5, 1)
}
function drawTraitCurious(p) {
  // A finger at the chin between those little upward/sideways peeks.
  traitPixel(p, p.pal.lapel, 6, 7, 0.5, 1)
  if (!p.hands) return
  traitPixel(p, p.pal.skin, 6 + p.hx, 6.5 + p.hy, 0.5, 1)
  traitPixel(p, p.pal.shirt, 6, 8, 0.5, 0.5)
}
function drawTraitStubborn(p) {
  traitPixel(p, p.pal.lapel, 6, 7, 1.5, 0.5)
  if (!p.hands) return
  traitPixel(p, p.pal.robe, 6.5, 9, 1, 2)
  traitPixel(p, p.pal.skin, 6.5, 10.5, 1, 1)
  traitPixel(p, p.pal.eye, 7, 11, 0.5, 0.5) // clenched knuckles
}
function drawTraitTinkerer(p) {
  // A pencil behind the ear on land; a screwdriver in the suit everywhere.
  if (!p.wet) {
    traitPixel(p, p.pal.dirtEdge, 1.5 + p.hx, 2 + p.hy, 0.5, 2)
    traitPixel(p, p.pal.shirt, 1.5 + p.hx, 2 + p.hy, 0.5, 0.5)
  }
  traitPixel(p, p.pal.lapel, 5.5, 9, 0.5, 2)
  traitPixel(p, p.pal.dirtEdge, 5.5, 8.5, 0.5, 1)
}
function drawTraitEngineer(p) {
  // Pocket protector: still the same uniform, just an aggressively tidy one.
  traitPixel(p, p.pal.shirt, 5, 8.5, 1.5, 1.5)
  traitPixel(p, p.pal.eye, 5.5, 8, 0.5, 1)
  traitPixel(p, p.pal.lapel, 5, 10, 1.5, 0.5)
}
function drawTraitSentinel(p) {
  traitPixel(p, p.pal.lapel, 1, 6.5, 1, 0.5)
  if (!p.hands || p.ag.state === "block") return
  traitPixel(p, p.pal.robe, 6, 10, 1, 2) // front hand tucked away
  traitPixel(p, p.pal.shirt, 0, 10, 0.5, 1)
  traitPixel(p, p.pal.skin, -0.5, 10.5, 1, 0.5) // hands behind back
}
function drawTraitBurrower(p) {
  traitPixel(p, p.pal.dirtShade, 2 + p.lead, 13.5 - p.drop, 1, 0.5)
  traitPixel(p, p.pal.dirtEdge, 4 - p.lead, 14 - p.drop, 0.5, 0.5)
  traitPixel(p, p.pal.dirtEdge, 1, 10, 0.5, 2)
  traitPixel(p, p.pal.lapel, 0.5, 12, 1.5, 0.5) // pocket trowel
}
function drawTraitHoarder(p) {
  traitPixel(p, p.pal.robe, -0.5, 8, 1.5, 4.5)
  traitPixel(p, p.pal.lapel, -0.5, 8.5, 0.5, 3)
  traitPixel(p, p.pal.eye, 0, 10, 1, 0.5) // bag flap
  traitPixel(p, p.pal.lapel, 6, 11, 1.5, 1)
  traitPixel(p, p.pal.robe, 6.5, 11.5, 1, 1) // overstuffed pocket
}
function drawTraitFollower(p) {
  traitPixel(p, p.pal.shirt, 0.5, 9.5, 0.5, 1)
  if (!p.hands) return
  traitPixel(p, p.pal.skin, -0.5, 9.5, 1, 0.5) // checking the colleague behind
  traitPixel(p, p.pal.lapel, 0, 8.5, 0.5, 1)
}
function drawTraitSkittish(p) {
  traitPixel(p, p.pal.lapel, 1, 6.5, 0.5, 1)
  if (!p.hands) return
  var elbow = p.lead > 0 ? 0.5 : 0
  traitPixel(p, p.pal.robe, 6.5, 8 + elbow, 1, 2)
  traitPixel(p, p.pal.skin, 6.5, 8 + elbow, 0.5, 0.5)
  traitPixel(p, p.pal.shirt, 6.5, 8.5 + elbow, 0.5, 0.5)
}

// The head rides the walking bob and the res-2 personality tilt.
function drawUprightHeadFine(ctx, pal, ag, ox, oy, dir, hy) {
  ctx.fillStyle = pal.lapel
  blitFine(ctx, ox, oy, dir, 2.5, 0.5 + hy, 2.5, 0.5)       // light on the hair
  ctx.fillStyle = pal.skin
  blitFine(ctx, ox, oy, dir, 1.5, 3.5 + hy, 0.5, 1)         // an ear in the hair
  ctx.fillStyle = pal.eye
  blitFine(ctx, ox, oy, dir, 1.5, 4 + hy, 1, 0.5)           // glasses arm
  ctx.globalAlpha = 0.35
  blitFine(ctx, ox, oy, dir, 4, 6 + hy, 1.5, 0.5)           // mouth
  ctx.globalAlpha = 1
  ctx.fillStyle = "#ffffff"
  blitFine(ctx, ox, oy, dir, 5.5, 4 + hy, 0.5, 0.5)         // glint
}
function drawAgentUprightFine(ctx, pal, ag, ox, oy, dir, drop, lead, squash, robe, w) {
  var look = traitHeadOffset(w, ag)
  drawUprightHeadFine(ctx, pal, ag, ox + dir * look.x, oy, dir, drop + look.y)
  if (ag.state === "saved") return
  var ty = 7 + Math.max(drop, -1)
  ctx.fillStyle = pal.shirt
  blitFine(ctx, ox, oy, dir, 3, ty, 2, 1.5)                 // shirt front
  ctx.fillStyle = pal.eye
  blitFine(ctx, ox, oy, dir, 3.75, ty - 0.5, 0.5, 0.5)      // the knot
  blitFine(ctx, ox, oy, dir, 3.75, ty, 0.5, 2.5)            // the tie
  ctx.fillStyle = pal.lapel
  blitFine(ctx, ox, oy, dir, 2.5, ty, 0.5, 1.5)             // lapels
  blitFine(ctx, ox, oy, dir, 5, ty, 0.5, 1.5)
  blitFine(ctx, ox, oy, dir, 4.5, ty + 3.5, 0.5, 0.5)       // buttons
  blitFine(ctx, ox, oy, dir, 4.5, ty + 5, 0.5, 0.5)
  if (ag.state !== "walk") return
  // Shoes: the last row of each leg, with a toe forward of the heel.
  ctx.fillStyle = pal.eye
  var stride = traitStride(w, ag, lead)
  var l1 = squash ? 1 : 2 + stride, l2 = squash ? 5 : 4 - stride
  blitFine(ctx, ox, oy, dir, l1, 15, 2.5, 1)
  blitFine(ctx, ox, oy, dir, l2, 15, 2.5, 1)
  ctx.fillStyle = robe
}


// These marks are opaque half pixels. Raised climbing hands cover the front
// of the face, so leave its glasses and mouth behind that arm.
function drawFineHead(ctx, pal, ag, ox, oy, dir, drop) {
  ctx.fillStyle = pal.lapel
  blitFine(ctx, ox, oy, dir, 2.5, 0.5 + drop, 2.5, 0.5)
  ctx.fillStyle = pal.skin
  blitFine(ctx, ox, oy, dir, 1.5, 3 + drop, 0.5, 0.5)
  ctx.fillStyle = pal.eye
  blitFine(ctx, ox, oy, dir, 1.5, 3.5 + drop, 1, 0.5)
  if (ag.state === "climb") return
  blitFine(ctx, ox, oy, dir, 5, 6 + drop, 0.5, 0.5)
  ctx.fillStyle = pal.shirt
  blitFine(ctx, ox, oy, dir, 5.5, 4 + drop, 0.5, 0.5)
}

// A short shirt front and tie fit even the folded torsos. All callers give
// the actual top of their coat, not the head's drop.
function drawFineSuit(ctx, pal, ox, oy, dir, top) {
  ctx.fillStyle = pal.shirt
  blitFine(ctx, ox, oy, dir, 3, top, 2, 1)
  ctx.fillStyle = pal.eye
  blitFine(ctx, ox, oy, dir, 3.5, top, 0.5, 2)
  ctx.fillStyle = pal.lapel
  blitFine(ctx, ox, oy, dir, 2.5, top + 0.5, 0.5, 1)
  blitFine(ctx, ox, oy, dir, 5, top + 0.5, 0.5, 1)
  blitFine(ctx, ox, oy, dir, 4.5, top + 3, 0.5, 0.5)
}

// Soles stop at the edge of each existing leg; a half-pixel toe must not
// make the silhouette wider. Coordinates follow the coarse pose exactly.
function drawFineShoes(ctx, pal, ox, oy, dir, x1, y1, x2, y2, width) {
  ctx.fillStyle = pal.eye
  blitFine(ctx, ox, oy, dir, x1, y1, width, 0.5)
  blitFine(ctx, ox, oy, dir, x2, y2, width, 0.5)
  ctx.fillStyle = pal.lapel
  blitFine(ctx, ox, oy, dir, x1 + width - 0.5, y1 - 0.5, 0.5, 0.5)
  blitFine(ctx, ox, oy, dir, x2 + width - 0.5, y2 - 0.5, 0.5, 0.5)
}

function drawFineClimb(ctx, pal, ag, ox, oy, dir) {
  drawFineSuit(ctx, pal, ox, oy, dir, 7)
}

function drawFineWebUp(ctx, pal, ag, ox, oy, dir) {
  drawFineSuit(ctx, pal, ox, oy, dir, 9)
  ctx.fillStyle = pal.skin
  blitFine(ctx, ox, oy, dir, 3.5, 2, 0.5, 1)
  blitFine(ctx, ox, oy, dir, 4.5, 3.5, 0.5, 1)          // two grips on the line
  ctx.fillStyle = pal.shirt
  blitFine(ctx, ox, oy, dir, 3.5, 3, 0.5, 0.5)
  blitFine(ctx, ox, oy, dir, 4.5, 4.5, 0.5, 0.5)
  drawFineShoes(ctx, pal, ox, oy, dir, 0, 13.5, 5, 15.5, 3)
}

function drawFineRappel(ctx, pal, ag, ox, oy, dir) {
  drawFineSuit(ctx, pal, ox, oy, dir, 8)
  ctx.fillStyle = pal.skin
  blitFine(ctx, ox, oy, dir, 3.5, 3, 1, 1)
  ctx.fillStyle = pal.shirt
  blitFine(ctx, ox, oy, dir, 3.5, 4, 1, 0.5)
  drawFineShoes(ctx, pal, ox, oy, dir, 1, 13.5, 5, 14.5, 3)
}

function drawFineBuild(ctx, pal, ag, ox, oy, dir) {
  drawFineSuit(ctx, pal, ox, oy, dir, 7)
  drawFineShoes(ctx, pal, ox, oy, dir, 2, 15.5, 4, 15.5, 2)
}

// Page skill silhouettes use the existing anim/fuse/fall clocks. The panel
// keeps its coarse poses; no renderer-owned progress or extra particles.
function climbContacts(w, ag, ox, dir) {
  var phase = (ag.anim >> 2) % 4
  var face = (Math.floor(ag.x) + dir + (dir < 0 ? 1 : 0)) * w.k.CELL
  var x = dir > 0 ? face - ox : ox + SPRITE_W - face
  return { x: Math.round(x * 2) / 2, hand: [2, 2, 5, 5][phase],
    other: [7, 6, 3, 3][phase], knee: [12, 10, 10, 12][phase] }
}

function drawClimbingPose(ctx, w, pal, ag, ox, oy, dir, robe) {
  ctx.save()
  var grip = climbContacts(w, ag, ox, dir)
  ctx.fillStyle = robe
  blitFine(ctx, ox, oy, dir, 2, 7, 4, 6)
  // Elbows bend into the pull; one boot is planted while the other rises.
  blitFine(ctx, ox, oy, dir, 5, grip.hand + 1, 1.5, 7 - grip.hand)
  blitFine(ctx, ox, oy, dir, 6, grip.hand + 1, grip.x - 5.5, 1)
  blitFine(ctx, ox, oy, dir, 5, grip.other + 1, grip.x - 4.5, 1)
  blitFine(ctx, ox, oy, dir, 2.5, 12, 2, 4)
  blitFine(ctx, ox, oy, dir, 4.5, grip.knee, grip.x - 4, 1.5)
  blitFine(ctx, ox, oy, dir, grip.x - 1.5, grip.knee + 1, 1.5, 2)
  ctx.restore()
}

function drawClimbContactDetail(ctx, w, pal, ag, ox, oy, dir) {
  if (libraryShelfPose(w, ag)) return // the actual shelf board supplies its grip
  var grip = climbContacts(w, ag, ox, dir)
  ctx.fillStyle = pal.shirt
  blitFine(ctx, ox, oy, dir, grip.x - 1.5, grip.hand + 1, 1, 0.5)
  blitFine(ctx, ox, oy, dir, grip.x - 1.5, grip.other + 1, 1, 0.5)
  ctx.fillStyle = pal.skin
  blitFine(ctx, ox, oy, dir, grip.x - 0.5, grip.hand, 1, 1)
  blitFine(ctx, ox, oy, dir, grip.x - 0.5, grip.other, 1, 1)
  ctx.fillStyle = pal.eye
  blitFine(ctx, ox, oy, dir, 2.5, 15.5, 2.5, 0.5)
  blitFine(ctx, ox, oy, dir, grip.x - 1.5, grip.knee + 2.5, 2, 0.5)
  ctx.fillStyle = pal.lapel
  blitFine(ctx, ox, oy, dir, grip.x - 1.5, grip.knee, 1, 0.5)
}

function drawBracedBlocker(ctx, w, pal, ag, ox, oy, dir, robe, idle) {
  ctx.save()
  var toe = idle && idle.pose === "tap" && idle.phase % 12 < 6 ? 1 : 0
  ctx.fillStyle = robe
  blitFine(ctx, ox, oy, dir, 1, 7, 6, 6)
  blitFine(ctx, ox, oy, dir, 0, 13, 3, 1.5)
  blitFine(ctx, ox, oy, dir, 5, 13, 3, 1.5)
  blitFine(ctx, ox, oy, dir, 0, 14, 2, 2)
  blitFine(ctx, ox, oy, dir, 6, 14, 2, 2 - toe)
  if (toe) blitFine(ctx, ox, oy, dir, 8, 14, 1, 0.5)
  drawBlockArms(ctx, pal, ox, oy, dir, robe, idle)
  drawFineShoes(ctx, pal, ox, oy, dir, 0, 15.5, 6, 15.5 - toe, 2)
  ctx.restore()
}

function drawBlockArms(ctx, pal, ox, oy, dir, robe, idle) {
  var pose = idle ? idle.pose : ""
  var sides = pose === "fold" ? [] : (pose === "watch" ? [-1] : [-1, 1])
  for (var i = 0; i < sides.length; i++) {
    var left = sides[i] < 0, sleeve = left ? -2 : 7
    ctx.fillStyle = robe
    blitFine(ctx, ox, oy, dir, sleeve, 8, 3, 2)
    ctx.fillStyle = pal.shirt
    blitFine(ctx, ox, oy, dir, left ? -2 : 9.5, 8.5, 0.5, 1)
    ctx.fillStyle = pal.skin
    blitFine(ctx, ox, oy, dir, left ? -3 : 10, 8, 1, 2)
  }
  // Existing gestures still get their sleeves before their hands/props.
  var sleeves = IDLE_SLEEVES[pose] || []
  ctx.fillStyle = robe
  for (var j = 0; j < sleeves.length; j++) {
    var r = sleeves[j]
    blitFine(ctx, ox, oy, dir, r[0], r[1], r[2], r[3])
  }
}

function bombCrouch(ag) { return ag.fuse < 15 ? 2 : (ag.fuse < 30 ? 1 : 0) }

function drawBombPose(ctx, w, pal, ag, ox, oy, dir, robe) {
  ctx.save()
  var tuck = bombCrouch(ag)
  ctx.fillStyle = robe
  blitFine(ctx, ox, oy, dir, 1, 7 + tuck, 6, 6 - tuck)
  blitFine(ctx, ox, oy, dir, 1, 13, 2, 3)
  blitFine(ctx, ox, oy, dir, 5, 13, 2, 3)
  // Both hands hold the charge; at the end the elbows and knees fold in.
  blitFine(ctx, ox, oy, dir, 0, 8 + tuck, 2, 3)
  blitFine(ctx, ox, oy, dir, 6, 8 + tuck, 2, 3)
  ctx.restore()
}

function drawFineBomb(ctx, pal, ag, ox, oy, dir) {
  drawFineSuit(ctx, pal, ox, oy, dir, 7 + bombCrouch(ag))
  drawFineShoes(ctx, pal, ox, oy, dir, 1, 15.5, 5, 15.5, 2)
}

function drawBombFuse(ctx, w, pal, ag, ox, oy, dir) {
  var y = 10 + bombCrouch(ag), fuse = Math.max(0.5, Math.ceil((ag.fuse || 0) / 30) * 0.5)
  ctx.fillStyle = pal.rigDark
  blitFine(ctx, ox, oy, dir, 2.5, y, 3, 3)
  ctx.fillStyle = pal.urgent
  blitFine(ctx, ox, oy, dir, 3, y, 2, 0.5)
  ctx.fillStyle = pal.steelEdge
  blitFine(ctx, ox, oy, dir, 3, y + 0.5, 0.5, 1)
  ctx.fillStyle = pal.skin
  blitFine(ctx, ox, oy, dir, 1.5, y + 1, 1, 1)
  blitFine(ctx, ox, oy, dir, 5.5, y + 1, 1, 1)
  ctx.fillStyle = pal.rig
  blitFine(ctx, ox, oy, dir, 4, y - fuse, 0.5, fuse)
  ctx.fillStyle = pal.fireHot
  blitFine(ctx, ox, oy, dir, 3.5 + (ag.fuse % 2) * 0.5, y - fuse - 0.5, 1, 0.5)
  if (ag.fuse < 15) {
    // Three bounded flecks, only for the last half-second. No blast early.
    blitFine(ctx, ox, oy, dir, 2, y - fuse - 1, 0.5, 0.5)
    blitFine(ctx, ox, oy, dir, 5.5, y - fuse - 2, 0.5, 0.5)
    blitFine(ctx, ox, oy, dir, 6.5, y - fuse, 0.5, 0.5)
  }
}

function drawFloatingUmbrella(ctx, w, pal, ag, ox, oy, flex, brolly) {
  ctx.save()
  // fall is distance: the first cell under load unfolds over several ticks.
  var spread = Math.min(1, Math.max(0.25, Math.ceil((ag.fall - 2) * 4) / 4))
  var sway = Math.round(Math.sin(w.ticks * 0.09 + ag.id * 1.7) * 2) * 0.5
  drawUmbrellaFine(ctx, pal, ox + sway, oy, flex, brolly, spread)
  // The canopy sways above the grip, which stays attached to the passenger.
  drawWorkHandle(ctx, pal, ox, oy, 1, 4 + sway, -0.5, 4, 5, pal.umbrellaStem)
  ctx.fillStyle = pal.umbrellaStem
  blitFine(ctx, ox, oy, 1, 4, 4, 0.5, 2)
  ctx.restore()
}

function drawFloatGrip(ctx, w, pal, ag, ox, oy, dir) {
  if (!ag.floater || !(ag.fall > 2)) return
  ctx.fillStyle = pal.skin
  blitFine(ctx, ox, oy, 1, 3.5, 4, 1.5, 1)
}

var SKILL_DETAIL_DRAW = { climb: drawClimbContactDetail, bomb: drawBombFuse, fall: drawFloatGrip }
function drawSkillDetail(ctx, w, pal, ag, ox, oy, dir) {
  if ((w.res || 1) < 2) return
  var draw = SKILL_DETAIL_DRAW[ag.state]
  if (!draw) return
  ctx.save()
  draw(ctx, w, pal, ag, ox, oy, dir)
  ctx.restore()
}

// Work is read by the tool and its stroke, not by dust alone. The panel keeps
// its old silhouettes; page tools use half pixels and the simulation's timer.
// No sparks are invented here: the simulation already supplies impact dust.
var WORK_TOOL_DRAW = { bash: drawWorkBash, dig: drawWorkDig }

function drawWorkTools(ctx, w, pal, ag, ox, oy, dir) {
  if ((w.res || 1) < 2) return
  var draw = WORK_TOOL_DRAW[ag.state]
  if (!draw) return
  ctx.save()
  draw(ctx, pal, ag, ox, oy, dir)
  ctx.restore()
}

// Stair-step a handle on the half-pixel grid. Unlike rotating a thin
// rectangle this stays crisp at every stroke and in either facing direction.
function drawWorkHandle(ctx, pal, ox, oy, dir, x0, y0, x1, y1, color) {
  var steps = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2)
  ctx.fillStyle = color || pal.rig
  for (var i = 0; i <= steps; i++) {
    var p = steps ? i / steps : 0
    blitFine(ctx, ox, oy, dir, x0 + (x1 - x0) * p, y0 + (y1 - y0) * p, 1, 1)
  }
}

function drawWorkBash(ctx, pal, ag, ox, oy, dir) {
  var strike = ag.timer % 6 >= 3
  var handY = strike ? 11 : 9
  var headX = strike ? 12 : 9, headY = strike ? 9 : 4
  drawWorkHandle(ctx, pal, ox, oy, dir, 8, handY, headX, headY)
  // A curved steel pick, with a bright upper edge and a dark socket.
  ctx.fillStyle = pal.steelShade
  blitFine(ctx, ox, oy, dir, headX - 2, headY, 5, 1.5)
  ctx.fillStyle = pal.steelEdge
  blitFine(ctx, ox, oy, dir, headX - 2, headY, 5, 0.5)
  blitFine(ctx, ox, oy, dir, headX - 2.5, headY + 0.5, 0.5, 1)
  blitFine(ctx, ox, oy, dir, headX + 3, headY + 0.5, 0.5, 1)
  ctx.fillStyle = pal.eye
  blitFine(ctx, ox, oy, dir, headX, headY + 0.5, 1, 1)
  ctx.fillStyle = pal.shirt
  blitFine(ctx, ox, oy, dir, 7, handY, 1, 0.5)
  ctx.fillStyle = pal.skin
  blitFine(ctx, ox, oy, dir, 8, handY, 1.5, 1)
}

function drawWorkDig(ctx, pal, ag, ox, oy, dir) {
  var lift = ag.timer % 7 >= 4
  var bladeX = lift ? 11 : 9, bladeY = lift ? 11 : 15
  drawWorkHandle(ctx, pal, ox, oy, dir, 7, lift ? 10 : 12, bladeX, bladeY)
  // A broad spade with clipped shoulders and a tapered cutting edge.
  ctx.fillStyle = pal.steelShade
  blitFine(ctx, ox, oy, dir, bladeX - 1, bladeY, 3, 2)
  blitFine(ctx, ox, oy, dir, bladeX - 0.5, bladeY + 2, 2, 0.5)
  ctx.fillStyle = pal.steelEdge
  blitFine(ctx, ox, oy, dir, bladeX - 1, bladeY, 1, 1.5)
  blitFine(ctx, ox, oy, dir, bladeX - 0.5, bladeY + 2, 2, 0.5)
  ctx.fillStyle = pal.rigDark
  blitFine(ctx, ox, oy, dir, bladeX + 0.5, bladeY + 0.5, 0.5, 1)
  ctx.fillStyle = pal.shirt
  blitFine(ctx, ox, oy, dir, 6.5, 12, 1, 0.5)
  ctx.fillStyle = pal.skin
  blitFine(ctx, ox, oy, dir, 7, lift ? 11 : 12.5, 1.5, 1)
}

function builderLoad(ag) {
  var phase = Math.floor(((ag.timer || 0) % 6) / 2)
  return [{ x: 8, y: 9 }, { x: 10, y: 12 }, { x: 11, y: 14 }][phase]
}

function drawWorkingBuilder(ctx, w, pal, ag, ox, oy, dir, robe) {
  if ((w.res || 1) < 2) return
  ctx.save()
  var load = builderLoad(ag)
  ctx.fillStyle = robe
  blit(ctx, ox, oy, dir, 1, 7, 6, 6)
  blit(ctx, ox, oy, dir, 2, 13, 2, 3)
  blit(ctx, ox, oy, dir, 4, 13, 2, 3)
  // The sleeve follows the brick down; the palm supports it from below.
  blitFine(ctx, ox, oy, dir, 6, 8.5, 1.5, load.y - 7)
  blitFine(ctx, ox, oy, dir, 7, load.y, load.x - 6, 1)
  ctx.fillStyle = pal.shirt
  blitFine(ctx, ox, oy, dir, load.x - 1, load.y + 0.5, 1, 0.5)
  ctx.fillStyle = pal.skin
  blitFine(ctx, ox, oy, dir, load.x, load.y + 1, 2, 0.5)
  ctx.fillStyle = pal.dirtEdge
  blitFine(ctx, ox, oy, dir, load.x, load.y, 4.5, 1.5)
  ctx.fillStyle = pal.dirt
  blitFine(ctx, ox, oy, dir, load.x, load.y + 0.5, 4, 0.5)
  ctx.fillStyle = pal.dirtShade
  blitFine(ctx, ox, oy, dir, load.x + 4, load.y + 0.5, 0.5, 1)
  blitFine(ctx, ox, oy, dir, load.x, load.y + 1, 4, 0.5)
  blitFine(ctx, ox, oy, dir, load.x + 2, load.y + 0.5, 0.5, 0.5)
  ctx.fillStyle = pal.skin
  blitFine(ctx, ox, oy, dir, load.x, load.y + 1.5, 2, 0.5)
  ctx.restore()
}

function drawFineDig(ctx, pal, ag, ox, oy, dir, drop) {
  drawFineSuit(ctx, pal, ox, oy, dir, 7 + drop)
  // Alternate the grip inside the two coarse sleeves on the stroke clock.
  var grip = (ag.timer % 6) < 3 ? 0 : 0.5
  ctx.fillStyle = pal.shirt
  blitFine(ctx, ox, oy, dir, 0.5, 11.5 + drop, 1, 0.5)
  blitFine(ctx, ox, oy, dir, 6.5, 11.5 + drop, 1, 0.5)
  ctx.fillStyle = pal.skin
  blitFine(ctx, ox, oy, dir, 0.5, 12 + drop + grip, 1, 0.5)
  blitFine(ctx, ox, oy, dir, 6.5, 12.5 + drop - grip, 1, 0.5)
  drawFineShoes(ctx, pal, ox, oy, dir, 2, 15.5, 4, 15.5, 2)
}

function drawFineFall(ctx, pal, ag, ox, oy, dir) {
  drawFineSuit(ctx, pal, ox, oy, dir, 7)
  ctx.fillStyle = pal.skin
  blitFine(ctx, ox, oy, dir, 0.5, 4.5, 0.5, 1)
  blitFine(ctx, ox, oy, dir, 7, 4.5, 0.5, 1)
  ctx.fillStyle = pal.shirt
  blitFine(ctx, ox, oy, dir, 0.5, 5.5, 0.5, 0.5)
  blitFine(ctx, ox, oy, dir, 7, 5.5, 0.5, 0.5)
  drawFineShoes(ctx, pal, ox, oy, dir, 2, 15.5, 4, 15.5, 2)
}

function drawFineHeight(ctx, pal, ag, ox, oy, dir) {
  if (ag.heightMode !== "cushion") return drawFineFall(ctx, pal, ag, ox, oy, dir)
  drawFineSuit(ctx, pal, ox, oy, dir, 7)
  ctx.fillStyle = pal.skin
  blitFine(ctx, ox, oy, dir, 0.5, 9, 1, 0.5)
  blitFine(ctx, ox, oy, dir, 6.5, 9, 1, 0.5)            // hands around the knees
  ctx.fillStyle = pal.lapel
  blitFine(ctx, ox, oy, dir, 2.5, 11.5, 3.5, 0.5)       // folded trouser seam
  drawFineShoes(ctx, pal, ox, oy, dir, 2, 14.5, 5, 14.5, 2)
}

function drawFineSlide(ctx, pal, ag, ox, oy, dir, drop) {
  drawFineSuit(ctx, pal, ox, oy, dir, 8 + drop)
  ctx.fillStyle = pal.shirt
  blitFine(ctx, ox, oy, dir, 7.5, 9.5 + drop, 0.5, 1)
  ctx.fillStyle = pal.skin
  blitFine(ctx, ox, oy, dir, 8, 10 + drop, 1.5, 0.5)
  ctx.fillStyle = pal.eye
  blitFine(ctx, ox, oy, dir, 0, 13.5 + drop, 3, 0.5)
  ctx.fillStyle = pal.lapel
  blitFine(ctx, ox, oy, dir, 1, 12.5 + drop, 2, 0.5)      // knee crease
}

function drawFineStunned(ctx, pal, ag, ox, oy, dir) {
  drawFineSuit(ctx, pal, ox, oy, dir, 9)
  ctx.fillStyle = pal.skin
  blitFine(ctx, ox, oy, dir, 0.5, 11.5, 1, 0.5)         // resting hand
  drawFineShoes(ctx, pal, ox, oy, dir, 1, 14.5, 5, 14.5, 3)
}

// Bomb, jump and ceiling-walk all use the ordinary stride without a bob.
// The coat stays in its flashing colour on a bomber; only its tailoring is
// picked out. Ceiling detail goes through blitFine's existing vertical flip.
function drawFineStride(ctx, pal, ag, ox, oy, dir, drop, lead) {
  drawFineSuit(ctx, pal, ox, oy, dir, 7 + Math.max(drop, -1))
  drawFineShoes(ctx, pal, ox, oy, dir, 2 + lead, 15.5, 4 - lead, 15.5, 2)
}

function blit(ctx, ox, oy, dir, x, y, bw, bh) {
  var sx = dir > 0 ? ox + x : ox + (SPRITE_W - x - bw)
  var sy = spriteFlip ? oy + (SPRITE_PX - y - bh) : oy + y
  ctx.fillRect(Math.round(sx), Math.round(sy), bw, bh)
}

// Red-team poses are pure reads. anim advances while moving, timer while
// aiming/reloading; neither needs a renderer-owned clock or a world write.
function enemyMotion(w, en) {
  var moving = ["walk", "recover", "deploy", "seekpost"].indexOf(en.state) >= 0
  if (en.throttled > 0) return { stride: 0, bob: 0 }
  var stride = moving ? [0, 1, 0, -1][(en.anim >> 2) % 4] : 0
  var bob = Math.abs(stride)
  if (en.kind === "drone" || en.state === "jet") bob = [0, 1, 0, -1][Math.floor(en.anim / 6) % 4]
  return { stride: stride, bob: bob }
}

function enemyRecoil(en) {
  if (en.shotFor > 5) return 2
  return en.shotFor > 2 ? 1 : 0
}

function drawEnemy(ctx, w, pal, en, opts) {
  if (en.gone) return
  spriteFlip = false
  var m = enemyMotion(w, en)
  var ox = Math.round(en.x * w.k.CELL) - SPRITE_W / 2 - en.dir * enemyRecoil(en)
  var oy = Math.round((en.y + 1) * w.k.CELL) - SPRITE_PX - m.bob
  var fn = ENEMY_DRAW[en.kind] || drawGunner
  fn(ctx, w, pal, en, ox, oy, en.dir, m)
  if (opts && opts.labels) drawEnemyLabel(ctx, w, en, ox, oy)
  ctx.globalAlpha = 1
}

var ENEMY_DRAW = { gun: drawGunner, drone: drawDrone, operator: drawOperator,
  sniper: drawSniper, xeno: drawXeno, harpoon: drawHarpoon }

// Like colony deaths, these are dated poses at the last position, not actors.
// The last event is only a hint: unrecognised events keep the kind's defeat.
var ENEMY_DEFEAT_TICKS = 32
var ENEMY_DEFEAT_DRAW = { gun: drawDefeatGunner, drone: drawDefeatDrone,
  operator: drawDefeatOperator, sniper: drawDefeatSniper,
  xeno: drawDefeatXeno, harpoon: drawDefeatDiver }
var ENEMY_DEFEAT_CAUSE = { "mine boom": drawDefeatBlast,
  "drone strike": drawDefeatBlast, "red team splash": drawDefeatBubbles }

function drawEnemyDefeat(ctx, w, pal, en) {
  if (!en.gone || en.diedAt === undefined) return
  var age = w.ticks - en.diedAt
  if (age < 0 || age >= ENEMY_DEFEAT_TICKS) return
  var draw = Object.prototype.hasOwnProperty.call(ENEMY_DEFEAT_DRAW, en.kind)
    ? ENEMY_DEFEAT_DRAW[en.kind] : drawDefeatGunner
  ctx.save()
  ctx.translate(Math.round(en.x * w.k.CELL), Math.round((en.y + 1) * w.k.CELL))
  ctx.scale(en.dir === -1 ? -1 : 1, 1)
  ctx.globalAlpha = Math.min(1, (ENEMY_DEFEAT_TICKS - age) / 10)
  // A force push throws the kit away from the facing, without moving Sim.
  if (en.diedBy === "force pushed") ctx.translate(-Math.min(12, Math.floor(age / 2)), 0)
  draw(ctx, w, pal, age, en)
  if (Object.prototype.hasOwnProperty.call(ENEMY_DEFEAT_CAUSE, en.diedBy))
    ENEMY_DEFEAT_CAUSE[en.diedBy](ctx, w, pal, age)
  ctx.restore()
}

function drawDefeatBody(ctx, w, age, coat, head) {
  // Two hand-stepped poses: a knock backwards, then boots/head spread flat.
  var lean = Math.min(3, Math.floor(age / 3))
  ctx.fillStyle = coat
  if (age < 10) {
    ctx.fillRect(-3 - lean, -10 + lean, 5, 5)
    ctx.fillRect(-2, -5, 5, 3)
    ctx.fillStyle = head
    ctx.fillRect(-4 - lean, -14 + lean * 2, 4, 3)
  } else {
    ctx.fillRect(-6, -4, 8, 3)
    ctx.fillStyle = head
    ctx.fillRect(-10, -4, 4, 3)
  }
  ctx.fillStyle = "#16161b"
  ctx.fillRect(1, -2, 4, 2)
  ctx.fillRect(-1, -1, 3, 1)
  if ((w.res || 1) >= 2) {
    ctx.fillStyle = "#ff5268"
    ctx.fillRect(-3, -3.5, 1, 0.5)
  }
}

function drawDefeatCap(ctx, w, age) {
  var x = 3 + Math.floor(age / 3)
  var y = -3 - Math.max(0, 11 - Math.floor(age / 2))
  var edge = Math.floor(age / 4) % 2
  ctx.fillStyle = "#d9d7cf"
  ctx.fillRect(x, y, 4 - edge * 2, 2 + edge * 2)
  ctx.fillRect(x - 1, y + 2, 6 - edge * 3, 1)
  ctx.fillStyle = "#8a8378"
  ctx.fillRect(x, y + 2, 3, 1)
  if ((w.res || 1) >= 2) {
    ctx.fillStyle = "#ffffff"
    ctx.fillRect(x + 0.5, y, 1.5, 0.5)
  }
}

function drawDefeatGunner(ctx, w, pal, age, en) {
  if (w.submerged) { drawDefeatDiver(ctx, w, pal, age, en); return }
  if (en.diedBy === "red team splash") {
    drawDefeatCap(ctx, w, age)
    return
  }
  drawDefeatBody(ctx, w, age, "#8f1f35", "#b9a59a")
  drawDefeatCap(ctx, w, age)
  if (age < 18) drawDeathDust(ctx, pal, age, 5)
}

function drawDefeatRifle(ctx, w, pal, age) {
  // Barrel drops first, stock follows, then a last two-pixel bounce.
  var y = -10 + Math.min(8, Math.floor(age / 2))
  var bounce = age >= 16 && age < 22 ? 1 : 0
  ctx.fillStyle = "#25252b"
  ctx.fillRect(5, y - bounce, 11, 1)
  ctx.fillRect(4, y - 1 - bounce, 4, 2)
  ctx.fillRect(8, y - 2 - bounce, 3, 1)
  ctx.fillStyle = "#8a8f9c"
  ctx.fillRect(12, y - bounce, 4, 1)
  if ((w.res || 1) >= 2) {
    ctx.fillStyle = "#9fd6ff"
    ctx.fillRect(10.5, y - 2 - bounce, 0.5, 0.5)
  }
  if (age >= 16 && age < 24) {
    ctx.fillStyle = pal.fireHot
    ctx.fillRect(17, -4, 1, 2)
    ctx.fillRect(19, -2, 2, 1)
  }
}

function drawDefeatSniper(ctx, w, pal, age) {
  drawDefeatBody(ctx, w, age, "#55406f", "#34313a")
  drawDefeatRifle(ctx, w, pal, age)
}

function drawDefeatOperator(ctx, w, pal, age) {
  drawDefeatBody(ctx, w, age, "#c47a24", "#34313a")
  var x = 5 + Math.floor(age / 5)
  var y = -3 - Math.max(0, 6 - Math.floor(age / 2))
  ctx.fillStyle = "#f0b34f"
  ctx.fillRect(x, y, 5, 3)
  ctx.fillStyle = age < 12 ? "#86d8e8" : "#34313a"
  ctx.fillRect(x + 1, y + 1, 3, 1)
  ctx.fillStyle = "#34313a"
  ctx.fillRect(x, y - 2, 1, 2)
  if ((w.res || 1) >= 2) {
    ctx.fillStyle = "#5a3a12"
    ctx.fillRect(x + 1.5, y + 2, 0.5, 0.5)
  }
  if (age < 10) {
    ctx.fillStyle = "#86d8e8"
    ctx.fillRect(x - 2, y - 3, 1, 2)
    ctx.fillRect(x + 6, y - 1, 2, 1)
    ctx.fillRect(x + 3, y - 4, 1, 1)
  }
}

function drawDefeatXeno(ctx, w, pal, age) {
  var height = Math.max(2, 8 - Math.floor(age / 4))
  var width = Math.max(3, 10 - Math.floor(age / 4))
  var curl = Math.floor(age / 4)
  ctx.fillStyle = "#3f7d4a"
  ctx.fillRect(-width, -height, width + 2, height - 1)
  ctx.fillRect(-width - 4 + Math.min(4, curl), -3, 4, 2)
  ctx.fillStyle = "#7de37a"
  ctx.fillRect(1, -height - 3, Math.max(2, 5 - curl), 3)
  ctx.fillStyle = "#0f1a12"
  ctx.fillRect(2, -height - 2, 1, 1)
  ctx.fillRect(-2, -2, 2, 1)
  if ((w.res || 1) >= 2) {
    ctx.fillStyle = "#24472b"
    for (var r = -width + 1; r < 0; r += 2) ctx.fillRect(r, -height + 0.5, 0.5, height - 1)
    ctx.fillStyle = "#9df59a"
    ctx.fillRect(1.5, -height - 3, 1.5, 0.5)
  }
}

function drawDefeatHelmet(ctx, w, age) {
  var x = Math.floor(age / 5) % 3 - 1
  var y = -15 - Math.floor(age / 2)
  ctx.fillStyle = "#8c6a2a"
  ctx.fillRect(x - 2, y, 4, 1)
  ctx.fillRect(x - 3, y + 1, 6, 4)
  ctx.fillRect(x - 2, y + 5, 4, 1)
  ctx.fillStyle = "#c39a45"
  ctx.fillRect(x - 2, y + 1, 4, 1)
  ctx.fillStyle = "#7fb8c4"
  ctx.fillRect(x, y + 2, 2, 2)
  if ((w.res || 1) >= 2) {
    ctx.fillStyle = "#e4bd62"
    ctx.fillRect(x - 1.5, y + 0.5, 2, 0.5)
    ctx.fillStyle = "#f4ffff"
    ctx.fillRect(x + 0.5, y + 2, 0.5, 1)
  }
}

function drawDefeatDiver(ctx, w, pal, age, en) {
  // Empty oxblood suit crumples while the sealed helmet escapes its collar.
  drawDefeatBody(ctx, w, age + 10, "#6b1f2e", "#4a1520")
  drawDefeatHelmet(ctx, w, age)
  if (en.diedBy !== "red team splash") drawDefeatBubbles(ctx, w, pal, age)
  ctx.fillStyle = "#171920"
  ctx.fillRect(5, -2, en.kind === "harpoon" ? 11 : 6, 1)
}

function drawDefeatBubbles(ctx, w, pal, age) {
  for (var i = 0; i < 5; i++) {
    var x = (i - 2) * (2 + Math.floor(age / 8))
    var y = -8 - Math.floor(age / 2) - (i % 3) * 4
    ctx.fillStyle = pal.bubble || "#7fb8c4"
    ctx.fillRect(x, y, 2, 2)
    ctx.fillStyle = pal.bubbleLit || "#f4ffff"
    ctx.fillRect(x, y, 1, 1)
    if ((w.res || 1) >= 2) {
      ctx.fillStyle = "#1c3548"
      ctx.fillRect(x + 0.5, y + 0.5, 1, 1)
    }
  }
}

function drawDefeatBlast(ctx, w, pal, age) {
  if (age >= 12) return
  var reach = 3 + Math.floor(age / 2)
  ctx.fillStyle = "#ff8a35"
  ctx.fillRect(-reach - 2, -9, 2, 1)
  ctx.fillRect(reach, -9, 2, 1)
  ctx.fillRect(0, -12 - reach, 1, 3)
  ctx.fillStyle = pal.fireHot
  ctx.fillRect(-reach, -12, 1, 2)
  ctx.fillRect(reach, -5, 1, 2)
}

function drawDefeatDrone(ctx, w, pal, age, en) {
  // A contact strike pops at once; a shoot-down tumbles in quarter turns.
  var popAt = en.diedBy === "drone strike" ? 0 : 18
  if (age >= popAt) {
    drawDefeatDronePop(ctx, w, pal, age - popAt)
    return
  }
  drawDefeatSmoke(ctx, pal, age)
  ctx.save()
  ctx.translate(Math.floor(age / 6), -8 + Math.floor(age / 3))
  ctx.rotate((Math.floor(age / 3) % 4) * Math.PI / 2)
  ctx.fillStyle = "#20232b"
  ctx.fillRect(-6, -1, 12, 1)
  ctx.fillRect(-5, -3, 3, 1)
  ctx.fillRect(3, 1, 3, 1)
  ctx.fillStyle = "#d9d7cf"
  ctx.fillRect(-2, -2, 4, 4)
  ctx.fillStyle = "#ff5268"
  ctx.fillRect(2, -1, 2, 2)
  if ((w.res || 1) >= 2) {
    ctx.fillStyle = "#3a3e49"
    ctx.fillRect(-2, 0.5, 4, 0.5)
    ctx.fillStyle = "#ffffff"
    ctx.fillRect(2.5, -1, 0.5, 0.5)
  }
  ctx.restore()
}

function drawDefeatSmoke(ctx, pal, age) {
  ctx.fillStyle = pal.dust
  for (var i = 0; i < 3; i++) {
    var x = Math.floor(age / 6) - i * 2
    var y = -11 - i * 3 + Math.floor(age / 6)
    ctx.fillRect(x - 1, y, 3, 2)
    ctx.fillRect(x, y - 1, 1, 1)
  }
}

function drawDefeatDronePop(ctx, w, pal, age) {
  if (age < 8) {
    ctx.fillStyle = "#ff8a35"
    ctx.fillRect(-3, -7, 6, 4)
    ctx.fillRect(-1, -9, 2, 8)
    ctx.fillStyle = "#ffe68a"
    ctx.fillRect(-2, -6, 4, 2)
    drawDefeatBlast(ctx, w, pal, age)
  }
  var spread = 3 + Math.floor(age / 3)
  ctx.fillStyle = "#d9d7cf"
  ctx.fillRect(-spread, -5, 3, 1)
  ctx.fillRect(spread, -3, 2, 2)
  ctx.fillStyle = "#ff5268"
  ctx.fillRect(0, -2, 2, 1)
  drawDefeatSmoke(ctx, pal, age)
}

function drawEnemyLabel(ctx, w, en, ox, oy) {
  var labels = { drone: "Remote Execution", operator: "Drone Operator", xeno: "Adversarial Input",
    harpoon: "Spear Phishing", sniper: "Scope Creep", gun: "Trigger Warning" }
  var label = labels[en.kind]
  if (en.kind === "sniper" && ["camp", "aim", "reload"].indexOf(en.state) >= 0) label = "Long Context"
  if (en.kind === "gun" && w.submerged) label = "Salvage Rights"
  if (en.kind === "gun" && en.state === "jet") {
    label = { rise: "Stack Ascending", land: "Soft Landing" }[en.jetMode] || "Air-gapped"
  }
  var colours = { drone: "#ff5268", operator: "#f0b34f", xeno: "#7de37a",
    harpoon: "#c39a45", sniper: "#a98bd0", gun: w.submerged ? "#c39a45" : "#ff5268" }
  ctx.fillStyle = colours[en.kind] || "#ff5268"
  ctx.font = "7px monospace"; ctx.textAlign = "center"
  ctx.fillText(label, ox + 4, oy - 4)
}

// Hips follow the bob, planted boots keep their floor line. The passing foot
// lifts one pixel, then the other takes its turn. Falls and jets tuck both.
function drawEnemyFeet(ctx, w, en, ox, oy, dir, m, hip, colour) {
  var airborne = en.state === "fall" || en.state === "jet"
  var lifts = [Math.max(0, m.stride), Math.max(0, -m.stride)]
  var xs = [1 + m.stride, 5 - m.stride]
  var fin = w.submerged || en.kind === "harpoon"
  var toe = en.kind === "xeno" ? "#24472b" : (fin ? "#4a1520" : "#16161b")
  ctx.fillStyle = colour
  for (var i = 0; i < 2; i++) {
    var height = airborne ? 2 : 3 + m.bob - lifts[i]
    blit(ctx, ox, oy, dir, xs[i], hip, 2, height)
    ctx.fillStyle = toe
    blit(ctx, ox, oy, dir, xs[i], hip + height - 1, fin ? 4 : 3, 1)
    if ((w.res || 1) >= 2) {
      ctx.fillStyle = en.kind === "xeno" ? "#7de37a" : "#6b6874"
      blitFine(ctx, ox, oy, dir, xs[i] + 1, hip + height - 1, 1.5, 0.5)
    }
    ctx.fillStyle = colour
  }
}

// A persistent muzzle bracket and raised supporting hand are visible even
// during the gunner's eight-tick tell. Hotter inner pixels build toward fire.
function drawEnemyTell(ctx, en, x, y, dir, aimTicks) {
  if (en.state !== "aim") return
  var late = en.timer >= aimTicks / 2
  ctx.fillStyle = "#ff5268"
  ctx.fillRect(x + dir * 2, y - 3, 1, 2)
  ctx.fillRect(x + dir * 2, y + 2, 1, 2)
  ctx.fillRect(x + dir * 3, y - 3, 2, 1)
  ctx.fillRect(x + dir * 3, y + 3, 2, 1)
  ctx.fillStyle = late ? "#ffe68a" : "#ff5268"
  ctx.fillRect(x - (dir < 0 ? 1 : 0), y, 1, 1)
}

function drawEnemySight(ctx, w, en, x, y) {
  if (en.state !== "aim" && !(en.shotFor > 0)) return
  var firing = en.shotFor > 0
  ctx.globalAlpha = firing ? Math.min(1, en.shotFor / 4) : 0.45 + ((en.timer >> 2) % 2) * 0.25
  ctx.fillStyle = firing ? "#ffe68a" : "#ff5268"
  var tx = Math.round(en.lineTo * w.k.CELL), ty = Math.round((en.lineY + 0.5) * w.k.CELL)
  var steps = Math.max(1, Math.round(Math.abs(tx - x) / 3))
  for (var i = 0; i <= steps; i++)
    ctx.fillRect(Math.round(x + (tx - x) * i / steps), Math.round(y + (ty - y) * i / steps), firing ? 2 : 1, 1)
  ctx.globalAlpha = 1
}

function drawEnemyDischarge(ctx, en, x, y, dir, wet) {
  if (en.shotFor > 5) {
    ctx.fillStyle = wet ? "#d6dde8" : "#ff8a35"
    hzTri(ctx, x + dir, y - 2, 4, 5, dir)
    ctx.fillStyle = wet ? "#f4ffff" : "#ffe68a"
    ctx.fillRect(x + (dir > 0 ? 0 : -2), y - 1, 2, 2)
    return
  }
  // Reload can also mean an abandoned aim. Those start late in the timer,
  // beyond this short recovery window, and must never imply a phantom shot.
  if (en.state !== "reload" || en.timer >= 12 || en.throttled > 0) return
  ctx.fillStyle = wet ? "#7fb8c4" : "#8a8378"
  var rise = Math.floor(en.timer / 3)
  ctx.globalAlpha = (12 - en.timer) / 18
  ctx.fillRect(x + dir * 2, y - 1 - rise, 1, 1)
  ctx.fillRect(x + dir * 4, y - 3 - rise, 1, 1)
  ctx.globalAlpha = 1
}

function drawDrone(ctx, w, pal, en, ox, oy, dir, m) {
  var pale = "#d9d7cf", redLit = "#ff5268"
  var rotor = (en.anim >> 1) % 2
  ctx.fillStyle = "#20232b"
  ctx.fillRect(ox + 2, oy + 7, 8, 3)
  ctx.fillRect(ox, oy + 5 + rotor, 4, 1)
  ctx.fillRect(ox + 8, oy + 6 - rotor, 4, 1)
  ctx.fillStyle = pale
  ctx.fillRect(ox + 4, oy + 6, 4, 4)
  ctx.fillStyle = redLit
  ctx.fillRect(dir > 0 ? ox + 8 : ox + 3, oy + 7, 2, 2)
  ctx.fillStyle = "#ff9a35"
  ctx.fillRect(ox + 5, oy + 10, 2, 2 + rotor)
  if ((w.res || 1) >= 2) drawDroneFine(ctx, w, ox, oy, dir, rotor)
  drawDroneLock(ctx, w, en, ox, oy, dir)
}

function drawDroneLock(ctx, w, en, ox, oy, dir) {
  if (en.throttled > 0) return
  var target = null
  for (var i = 0; i < w.agents.length; i++) if (w.agents[i].id === en.targetId) target = w.agents[i]
  if (!target || target.gone || target.state === "saved") return
  var near = Math.abs(target.x - en.x) + Math.abs(target.y - 2 - en.y) < 7
  ctx.fillStyle = near ? "#ffe68a" : "#ff5268"
  var x = dir > 0 ? ox + 10 : ox + 1
  ctx.fillRect(x, oy + 7, 1, 2)
  if (!near) return
  ctx.fillRect(x + dir * 3, oy + 5, 2, 1)
  ctx.fillRect(x + dir * 3, oy + 10, 2, 1)
}

function drawOperator(ctx, w, pal, en, ox, oy, dir, m) {
  var redLit = "#ff5268"
  var amber = "#c47a24"
  var amberLit = "#f0b34f"
  ctx.fillStyle = "#34313a"
  ctx.fillRect(ox, oy + 1, 9, 5)                 // broad helmet
  ctx.fillRect(ox - 1, oy + 7, 3, 7)             // square radio pack
  ctx.fillStyle = "#86d8e8"
  ctx.fillRect(ox + (dir > 0 ? 4 : 1), oy + 3, 5, 2) // single visor
  ctx.fillStyle = amber
  ctx.fillRect(ox + 2, oy + 6, 7, 8)              // one-piece coat
  var press = en.state === "operate" ? (en.anim >> 3) % 2 : 0
  ctx.fillStyle = amberLit
  ctx.fillRect(dir > 0 ? ox + 8 : ox, oy + 9 + press, 4, 3) // controller
  ctx.fillStyle = "#34313a"
  drawEnemyFeet(ctx, w, en, ox + 1, oy, dir, m, 14, "#34313a")
  ctx.fillStyle = redLit
  ctx.fillRect(ox, oy + 9, 1, 2)                  // small red-team lamp
  if ((w.res || 1) >= 2) drawOperatorFine(ctx, w, ox, oy, dir, press)
  drawOperatorSignal(ctx, en, ox, oy, dir, press)
}

function drawOperatorSignal(ctx, en, ox, oy, dir, press) {
  if (en.state !== "operate" || en.throttled > 0) return
  ctx.fillStyle = "#86d8e8"
  ctx.fillRect(dir > 0 ? ox + 9 : ox + 1, oy + 10 + press, 2, 1)
  // Sim's replacement-drone wait counts to 180; a live drone resets it to 0.
  if (en.timer < 144) return
  ctx.fillStyle = en.timer >= 168 ? "#ffe68a" : "#ff5268"
  ctx.fillRect(ox - 1, oy - 1, 3, 1)
  ctx.fillRect(ox - 3, oy - 3, 1, 3)
  ctx.fillRect(ox + 3, oy - 3, 1, 3)
}

function drawXeno(ctx, w, pal, en, ox, oy, dir, m) {
  var xg = "#3f7d4a"
  var xgLit = "#7de37a"

  ctx.fillStyle = xg
  blit(ctx, ox, oy, dir, 1, 11, 8, 4)        // the long body
  blit(ctx, ox, oy, dir, 7, 8, 4, 4)         // shoulders, forward
  ctx.fillStyle = xgLit
  blit(ctx, ox, oy, dir, 9, 7, 5, 3)         // the head, out in front
  ctx.fillStyle = "#0f1a12"
  blit(ctx, ox, oy, dir, 11, 8, 2, 1)        // no eyes, just the socket

  // The tail: a counterweight that swings against the legs, which is most
  // of what makes it read as moving rather than sliding.
  ctx.fillStyle = xg
  var sway = Math.round(Math.sin(en.anim * 0.22) * 2)
  blit(ctx, ox, oy, dir, -3, 10 + sway, 4, 2)
  blit(ctx, ox, oy, dir, -6, 9 + sway * 2, 3, 2)

  // Legs, out of phase with each other.
  ctx.fillStyle = "#2c5a35"
  drawEnemyFeet(ctx, w, en, ox, oy, dir, m, 15, "#2c5a35")
  if ((w.res || 1) >= 2) drawXenoFine(ctx, ox, oy, dir, 0, sway)

  if (en.touchCool > 0) {
    // Sated, briefly. The one moment it is not a threat, and it says so.
    ctx.globalAlpha = 0.5
    ctx.fillStyle = xgLit
    blit(ctx, ox, oy, dir, 9, 5, 2, 1)
    ctx.globalAlpha = 1
  }
  if (en.targetId && !en.touchCool) {
    ctx.fillStyle = "#f2f2e6"
    blit(ctx, ox, oy, dir, 12, 10, 2, 1) // bared jaw on pursuit; it has no gun
  }
}

function drawSniper(ctx, w, pal, en, ox, oy, dir, m) {
  var redLit = "#ff5268"
  var violet = "#55406f"
  var posted = en.state === "camp" || en.state === "aim" || en.state === "reload"
  var rifleX
  if (posted) {
    ctx.fillStyle = violet
    ctx.fillRect(ox + 1, oy + 11, 9, 3)           // prone coat and legs
    ctx.fillStyle = "#25252b"
    ctx.fillRect(dir > 0 ? ox + 8 : ox, oy + 9, 4, 4) // hood at the muzzle end
    ctx.fillStyle = "#b9a59a"
    ctx.fillRect(dir > 0 ? ox + 9 : ox + 1, oy + 10, 2, 1)
    rifleX = dir > 0 ? ox + 10 : ox - 12
    ctx.fillStyle = "#171920"
    ctx.fillRect(rifleX, oy + 11, 12, 2)
    ctx.fillRect(dir > 0 ? rifleX + 1 : rifleX + 10, oy + 9, 3, 2)
  } else {
    ctx.fillStyle = "#25252b"
    ctx.fillRect(ox + 2, oy + 2, 5, 4)            // narrow hood
    ctx.fillStyle = violet
    ctx.fillRect(ox + 2, oy + 6, 5, 8)            // narrow coat
    ctx.fillStyle = "#171920"
    rifleX = dir > 0 ? ox + 6 : ox - 7
    ctx.fillRect(rifleX, oy + 8, 10, 2)
    ctx.fillStyle = "#ff8a35"
    if (en.state === "jet") ctx.fillRect(ox + 2, oy + 14, 2, 3 + ((en.anim >> 1) % 2))
    ctx.fillStyle = "#25252b"
    drawEnemyFeet(ctx, w, en, ox, oy, dir, m, 14, "#25252b")
  }
  ctx.fillStyle = redLit
  ctx.fillRect(dir > 0 ? rifleX + 2 : rifleX + 11, oy + (posted ? 9 : 7), 1, 1)
  if ((w.res || 1) >= 2) drawSniperFine(ctx, ox, oy, dir, rifleX, posted)
  var mx = dir > 0 ? rifleX + (posted ? 12 : 10) : rifleX - 1
  var my = oy + (posted ? 12 : 9)
  drawEnemyTell(ctx, en, mx, my, dir, 36)
  drawEnemySight(ctx, w, en, mx, my)
  drawEnemyDischarge(ctx, en, mx, my, dir, false)
  if (en.state === "reload" && !en.shotFor) {
    ctx.fillStyle = "#b9a59a"
    var bolt = (en.timer >> 3) % 2
    ctx.fillRect(dir > 0 ? rifleX + 2 - bolt : rifleX + 8 + bolt, oy + 13, 2, 1)
  }
}

function drawGunner(ctx, w, pal, en, ox, oy, dir, m) {
  if (w.submerged) { drawEnemyDiver(ctx, w, pal, en, ox, oy, dir, false, m); return }
  var pale = "#d9d7cf", red = "#8f1f35", redLit = "#ff5268"
  ctx.fillStyle = pale
  blit(ctx, ox, oy, dir, 1, 0, 6, 3)               // pale, hostile crest
  ctx.fillStyle = "#b9a59a"
  blit(ctx, ox, oy, dir, 2, 3, 4, 4)
  ctx.fillStyle = redLit
  blit(ctx, ox, oy, dir, 5, 4, 1, 1)               // angular red eye
  ctx.fillStyle = "#303039"
  blit(ctx, ox, oy, dir, 0, 7, 2, 7)               // hostile hot-deploy pack
  ctx.fillStyle = red
  blit(ctx, ox, oy, dir, 1, 7, 6, 6)

  var gunY = en.state === "aim" || en.shotFor > 0 ? 6 : 8
  drawGunnerWeapon(ctx, w, en, ox, oy, dir, gunY)
  if (en.state === "jet") {
    // Two uneven exhaust tongues make the tiny pack read even at panel scale.
    var flame = (en.anim >> 1) % 2
    ctx.fillStyle = "#ff8a35"
    blit(ctx, ox, oy, dir, 0, 14, 1, 3 + flame)
    ctx.fillStyle = "#ffe68a"
    blit(ctx, ox, oy, dir, 1, 14, 1, 2 + (1 - flame))
  }

  drawEnemyFeet(ctx, w, en, ox, oy, dir, m, 13, red)
  if ((w.res || 1) >= 2) drawGunnerFine(ctx, ox, oy, dir, gunY)
}

function drawGunnerWeapon(ctx, w, en, ox, oy, dir, gunY) {
  ctx.fillStyle = "#25252b"
  blit(ctx, ox, oy, dir, 6, gunY, 5, 2)
  blit(ctx, ox, oy, dir, 7, gunY + 2, 2, 3)
  if (en.state === "aim") {
    ctx.fillStyle = "#b9a59a"
    blit(ctx, ox, oy, dir, 8, gunY + 2, 2, 1)
  }
  var mx = dir > 0 ? ox + 11 : ox - 4
  drawEnemyTell(ctx, en, mx, oy + gunY, dir, 8)
  drawEnemySight(ctx, w, en, mx, oy + gunY)
  drawEnemyDischarge(ctx, en, mx, oy + gunY, dir, false)
}

function drawHarpoon(ctx, w, pal, en, ox, oy, dir, m) {
  drawEnemyDiver(ctx, w, pal, en, ox, oy, dir, true, m)
}

// The drone at res 2: rotors as blurred discs rather than bars, a seam on the
// body, a camera with a glint, and a tail light that blinks.
function drawDroneFine(ctx, w, ox, oy, dir, rotor) {
  ctx.fillStyle = "#8a8f9c"
  ctx.globalAlpha = 0.55
  ctx.fillRect(ox - 1, oy + 5.5 + rotor, 6, 0.5)
  ctx.fillRect(ox + 7, oy + 6.5 - rotor, 6, 0.5)
  ctx.globalAlpha = 1
  ctx.fillStyle = "#3a3e49"
  ctx.fillRect(ox + 4, oy + 8, 4, 0.5)                          // seam
  ctx.fillStyle = "#ffffff"
  ctx.fillRect(dir > 0 ? ox + 9 : ox + 3, oy + 7, 0.5, 0.5)     // glint on the lens
  if (Math.floor(w.ticks / 6) % 2 === 0) {
    ctx.fillStyle = "#7dff9a"
    ctx.fillRect(dir > 0 ? ox + 2 : ox + 9.5, oy + 7.5, 0.5, 0.5)
  }
}

// The operator at res 2: a streak across the visor, an antenna on the radio
// pack with a blinking tip, a belt, and two sticks on the controller.
function drawOperatorFine(ctx, w, ox, oy, dir, press) {
  ctx.fillStyle = "#ffffff"
  ctx.globalAlpha = 0.7
  ctx.fillRect(ox + (dir > 0 ? 5 : 2), oy + 3, 1.5, 0.5)       // visor streak
  ctx.globalAlpha = 1
  ctx.fillStyle = "#34313a"
  ctx.fillRect(ox - 0.5, oy + 3, 0.5, 4)                        // antenna
  ctx.fillRect(ox + 2, oy + 12, 7, 0.5)                         // belt
  ctx.fillStyle = Math.floor(w.ticks / 10) % 2 ? "#ff5268" : "#5c1424"
  ctx.fillRect(ox - 0.5, oy + 2.5, 0.5, 0.5)
  ctx.fillStyle = "#5a3a12"
  var cx = dir > 0 ? ox + 9 : ox + 1
  ctx.fillRect(cx, oy + 8.5 + press, 0.5, 0.5); ctx.fillRect(cx + 1.5, oy + 8.5 + press, 0.5, 0.5)   // sticks
}

// The sniper at res 2: a scope on the rifle with a lens glint, a darker rim
// to the hood, and when it is lying down a ragged fringe of camouflage.
function drawSniperFine(ctx, ox, oy, dir, rifleX, posted) {
  var sy = oy + (posted ? 10 : 7)
  ctx.fillStyle = "#2c2f3a"
  ctx.fillRect(dir > 0 ? rifleX + 4 : rifleX + 5, sy, 3, 1)       // scope
  ctx.fillStyle = "#9fd6ff"
  ctx.fillRect(dir > 0 ? rifleX + 7 : rifleX + 4.5, sy, 0.5, 0.5) // lens
  ctx.fillStyle = "#16161b"
  if (posted) {
    for (var g = 0; g < 9; g += 1.5) ctx.fillRect(ox + 1 + g, oy + 10.5 + (g % 3 ? 0 : 0.5), 0.5, 0.5)
  } else {
    ctx.fillRect(ox + 2, oy + 5.5, 5, 0.5)                          // hood rim
  }
}

// The xenomorph at res 2: ribs across the body, spines along the back, a
// gloss along the length of the head, teeth at the front of it and a barb on
// the end of the tail. Still nothing square about it.
function drawXenoFine(ctx, ox, oy, dir, bob, sway) {
  ctx.fillStyle = "#24472b"
  for (var r = 2; r < 9; r += 1.5) blitFine(ctx, ox, oy, dir, r, 11.5 + bob, 0.5, 3)    // ribs
  ctx.fillStyle = "#9df59a"
  for (var sp = 1.5; sp < 9; sp += 2) blitFine(ctx, ox, oy, dir, sp, 10.5 + bob, 0.5, 0.5)  // spines
  blitFine(ctx, ox, oy, dir, 9.5, 7 + bob, 3.5, 0.5)                                    // gloss
  ctx.fillStyle = "#f2f2e6"
  blitFine(ctx, ox, oy, dir, 13, 9 + bob, 0.5, 0.5); blitFine(ctx, ox, oy, dir, 12.5, 9.5 + bob, 0.5, 0.5)  // teeth
  ctx.fillStyle = "#7de37a"
  blitFine(ctx, ox, oy, dir, -6.5, 8.5 + sway * 2, 1, 0.5)                              // the barb
}

// The gunner's half-pixel detail at res 2 (see drawAgentFine for the colony's
// own): the same rule — all of it inside the coarse silhouette. Where the
// agents got a suit, the red team gets kit: a scarred brow over an eye with a
// hot core, a shadowed crest, a vest with straps and a buckled belt, vents on
// the pack, a lit edge along the pistol's slide, and boots.
function drawGunnerFine(ctx, ox, oy, dir, gunY) {
  ctx.fillStyle = "#8a8378"
  blitFine(ctx, ox, oy, dir, 1, 2.5, 6, 0.5)                    // the crest's shadow
  blitFine(ctx, ox, oy, dir, 1, 0, 1.5, 0.5)                    // swept back
  ctx.fillStyle = "#6e5a52"
  blitFine(ctx, ox, oy, dir, 4, 3.5, 2, 0.5)                    // brow
  blitFine(ctx, ox, oy, dir, 3, 5, 0.5, 1.5)                    // scar
  ctx.fillStyle = "#ffd0d6"
  blitFine(ctx, ox, oy, dir, 5.5, 4, 0.5, 0.5)                  // the eye's core
  ctx.fillStyle = "#5c1424"
  blitFine(ctx, ox, oy, dir, 2, 7, 0.5, 5)                      // vest straps
  blitFine(ctx, ox, oy, dir, 5, 7, 0.5, 5)
  blitFine(ctx, ox, oy, dir, 1, 12, 6, 0.5)                     // belt
  ctx.fillStyle = "#e0b649"
  blitFine(ctx, ox, oy, dir, 3.5, 12, 1, 0.5)                   // buckle
  ctx.fillStyle = "#4a4a55"
  blitFine(ctx, ox, oy, dir, 0.5, 8.5, 1, 0.5)                  // pack vents
  blitFine(ctx, ox, oy, dir, 0.5, 10, 1, 0.5)
  blitFine(ctx, ox, oy, dir, 6.5, gunY, 4.5, 0.5)                  // the slide's lit edge
}

// The rival salvage crew, in the same period dress as the colony — that is the
// joke, and it is why the helmet is the same brass. Colder suit and a red eye
// in the port so the two read apart at a glance without being a different
// silhouette; friend and foe are told apart by colour here rather than by
// shape, because at this size the shape is the diving suit and there is only
// one of those.
//
// `big` picks the weapon: the speargun for the harpooner, a diving pistol for
// the gunner. Everything else is shared, which is the point — one crew.
function drawEnemyDiver(ctx, w, pal, en, ox, oy, dir, big, m) {
  drawEnemyBubbles(ctx, w, pal, en, ox, oy)
  var suit = "#6b1f2e", suitDark = "#4a1520"
  ctx.fillStyle = suit
  ctx.fillRect(ox + 1, oy + 6, 7, 7)                     // body
  ctx.fillStyle = suitDark
  ctx.fillRect(ox + 1, oy + 6, 7, 1)                     // the shoulder shadow
  drawEnemyFeet(ctx, w, en, ox, oy, dir, m, 13, suitDark)
  ctx.fillStyle = "#8c6a2a"
  ctx.fillRect(ox + 2, oy + 1, 5, 5)                     // helmet
  ctx.fillStyle = "#c39a45"
  ctx.fillRect(ox + 2, oy + 1, 3, 1)
  ctx.fillStyle = "#7fb8c4"
  ctx.fillRect(dir > 0 ? ox + 5 : ox + 2, oy + 3, 2, 2)  // port
  ctx.fillStyle = "#ff6b6b"
  ctx.fillRect(dir > 0 ? ox + 6 : ox + 2, oy + 3, 1, 1)  // the eye in it

  if ((w.res || 1) >= 2) drawEnemyDiverFine(ctx, ox, oy, dir)
  drawEnemyDiverWeapon(ctx, w, en, ox, oy, dir, big)
}

function drawEnemyBubbles(ctx, w, pal, en, ox, oy) {
  for (var b = 0; b < 3; b++) {
    var life = (((w.ticks * 0.9 + en.id * 37) + b * 33) % 108) / 108
    ctx.globalAlpha = 0.55 * (1 - life * 0.75)
    ctx.fillStyle = life > 0.5 ? (pal.bubbleLit || "#fff") : (pal.bubble || "#cfe")
    ctx.fillRect(Math.round(ox + 3 + Math.sin(life * 7 + en.id) * 2.5),
                 Math.round(oy - life * 24), life > 0.62 ? 2 : 1, life > 0.62 ? 2 : 1)
  }
  ctx.globalAlpha = 1
}

function drawEnemyDiverFine(ctx, ox, oy, dir) {
  ctx.fillStyle = "#e4bd62"
  ctx.fillRect(ox + 2.5, oy + 1, 2, 0.5)
  ctx.fillStyle = "#4f391c"
  ctx.fillRect(ox + 2, oy + 5.5, 5, 0.5)
  ctx.fillStyle = "#d6dde8"
  ctx.fillRect(dir > 0 ? ox + 5 : ox + 2, oy + 3.5, 0.5, 1)
  ctx.fillStyle = "#4a1520"
  ctx.fillRect(ox + 2.5, oy + 7, 0.5, 5)
  ctx.fillRect(ox + 5.5, oy + 7, 0.5, 5)
  ctx.fillStyle = "#c39a45"
  ctx.fillRect(ox + 3, oy + 12, 2, 0.5)
}

function drawEnemyDiverWeapon(ctx, w, en, ox, oy, dir, big) {
  var aiming = en.state === "aim" || en.shotFor > 0
  var gunY = oy + (aiming ? 7 : 9)
  var len = big ? 11 : 6
  var gunX = dir > 0 ? ox + 7 : ox - (len - 2)
  var mx = dir > 0 ? gunX + len : gunX - 1
  ctx.fillStyle = "#171920"
  ctx.fillRect(gunX, gunY, len, 2)
  ctx.fillRect(dir > 0 ? gunX : gunX + len - 2, gunY + 2, 2, 3)
  if (big && !en.shotFor) {
    ctx.fillStyle = "#9aa2b4"
    ctx.fillRect(dir > 0 ? gunX + 4 : gunX, gunY - 1, len - 2, 1)
  }
  if (en.state === "aim") {
    ctx.fillStyle = "#c39a45"
    ctx.fillRect(dir > 0 ? gunX + 3 : gunX + len - 5, gunY + 2, 2, 1)
  }
  drawEnemyTell(ctx, en, mx, gunY, dir, big ? 46 : 8)
  drawEnemyDischarge(ctx, en, mx, gunY, dir, true)
  if (big) drawEnemySpear(ctx, w, en, mx, gunY, dir)
  else drawEnemySight(ctx, w, en, mx, gunY)
}

// Spear and trailing line travel together from the actual raised muzzle.
function drawEnemySpear(ctx, w, en, fromX, gunY, dir) {
  if (!(en.shotFor > 0)) return
  var spearX = Math.round(en.lineTo * w.k.CELL)
  var spearY = Math.round((en.lineY + 0.5) * w.k.CELL)
  var flight = Math.min(1, (8 - en.shotFor) / 5)
  var tipX = Math.round(fromX + (spearX - fromX) * flight)
  var tipY = Math.round(gunY + (spearY - gunY) * flight)
  ctx.fillStyle = "#8a9aa6"
  var steps = Math.max(1, Math.round(Math.abs(tipX - fromX) / 4))
  ctx.globalAlpha = 0.55
  for (var hl = 0; hl <= steps; hl++)
    ctx.fillRect(Math.round(fromX + (tipX - fromX) * hl / steps),
                 Math.round(gunY + (tipY - gunY) * hl / steps) + 1, 1, 1)
  ctx.globalAlpha = 1
  ctx.fillStyle = "#d6dde8"
  ctx.fillRect(tipX - (dir > 0 ? 6 : 0), tipY, 7, 1)
  hzTri(ctx, tipX + (dir > 0 ? 1 : -1), tipY, 2, 3, dir)
}

function drawAgentTrick(ctx, w, pal, ag, ox, oy, dir, robe, hair) {
  var C = w.k.CELL
  if (ag.state === "trick" && ag.special) {
    var tsp = w.specialSpec
    var reach = ag.timer / 14
    var tx = ox + (dir > 0 ? SPRITE_W : 0)
    var mid = oy + 8
    ctx.fillStyle = tsp ? tsp.robe : pal.urgent
    ctx.globalAlpha = 0.45 + 0.55 * reach
    var fn = TRICK_DRAW[tsp && tsp.act]
    if (fn) fn(ctx, w, pal, ag, ox, oy, dir, robe, hair, { C: C, tsp: tsp, reach: reach, tx: tx, mid: mid })
    ctx.globalAlpha = 1
    drawTrickFine(ctx, w, pal, ag, ox, oy, dir, robe, hair, { C: C, tsp: tsp, reach: reach, tx: tx, mid: mid })
  }

  // The camped sniper's shot: a thin line from the muzzle to whatever it hit,
  // fading over about a third of a second. It is the only way to tell that
  // something happening at the far end of the corridor was done by the agent
  // sitting perfectly still at this one.
}

var TRICK_DRAW = {
  blast: drawTrickBlast, kick: drawTrickKick,
  rocket: drawTrickRocket, sap: drawTrickSap, stomp: drawTrickStomp,
  ballast: drawTrickBallast, quarry: drawTrickQuarry, spray: drawTrickSpray,
  slab: drawTrickSlab, phase: drawTrickPhase, complete: drawTrickComplete,
  chain: drawTrickChain, speculate: drawTrickSpeculate,
  collapse: drawTrickCollapse, stack: drawTrickStack
}

// A widening cone of shot.
function drawTrickBlast(ctx, w, pal, ag, ox, oy, dir, robe, hair, fr) {
  var reach = fr.reach, tx = fr.tx, mid = fr.mid
  for (var bi = 1; bi <= 6; bi++) {
    var bs = Math.round(bi * 1.6 * reach)
    ctx.fillRect(tx + dir * bi * 3 - (dir < 0 ? 2 : 0), mid - bs, 2, bs * 2 + 1)
  }
  // The answer ended several tokens ago. Max Tokens is still answering.
  for (var ov = 0; ov < 4; ov++)
    ctx.fillRect(tx + dir * (22 + ov * 5) - (dir < 0 ? 3 : 0), mid - 8 + ov * 5, 3, 2)
}

// One heavy bar driven forward.
function drawTrickKick(ctx, w, pal, ag, ox, oy, dir, robe, hair, fr) {
  var reach = fr.reach, tx = fr.tx, mid = fr.mid
  ctx.fillRect(dir > 0 ? tx : tx - Math.round(18 * reach), mid - 6, Math.round(18 * reach), 12)
}

// Launched, not swung.
function drawTrickRocket(ctx, w, pal, ag, ox, oy, dir, robe, hair, fr) {
  var reach = fr.reach, tx = fr.tx, mid = fr.mid
  // The tube on the shoulder, and the round already on its way. reach
  // runs 0..1 over the move, so the rocket crosses the gap in the time
  // the agent spends braced against the recoil.
  ctx.fillStyle = pal.rigDark
  ctx.fillRect(dir > 0 ? tx - 4 : tx - 8, mid - 4, 12, 5)
  ctx.fillStyle = pal.rig
  ctx.fillRect(dir > 0 ? tx + 6 : tx - 8, mid - 3, 3, 3)

  // How far it actually goes. The first version flew a fixed forty
  // pixels while the simulation reached twenty-six cells, so the round
  // stopped in mid-air and the hole opened somewhere behind it. Scan the
  // same way the shot does and fly the whole distance.
  var C2 = w.k.CELL
  var rkCell = Math.floor(ag.x)
  var rkFoot = Math.floor(ag.y)
  var rkTo = rkCell
  for (var rr2 = 2; rr2 <= w.k.ROCKET_RANGE; rr2++) {
    var rcx = rkCell + dir * rr2
    if (rcx < 0 || rcx >= w.k.COLS) break
    rkTo = rcx
    if (w.terrain[(rkFoot - 2) * w.k.COLS + rcx] !== w.k.EMPTY
        || w.terrain[(rkFoot - 1) * w.k.COLS + rcx] !== w.k.EMPTY) break
  }
  var flight = Math.min(1, reach)
  var rkFrom = ox + SPRITE_W / 2 + dir * 6
  var rkX = Math.round(rkFrom + (rkTo * C2 - rkFrom) * flight)
  var rkY = mid - 2
  ctx.fillStyle = "#d8dde5"
  ctx.fillRect(rkX, rkY, 5, 3)                       // the round
  ctx.fillStyle = "#ffb648"
  hzTri(ctx, rkX - dir * 3, rkY + 1, 3, 5, dir > 0 ? -1 : 1)
  // Exhaust, thinning behind it.
  for (var ex2 = 1; ex2 <= 5; ex2++) {
    ctx.globalAlpha = 0.5 / ex2
    ctx.fillStyle = ex2 < 3 ? "#ffe68a" : "#8a8f9c"
    ctx.fillRect(rkX - dir * (4 + ex2 * 4), rkY, 4, 3 - (ex2 > 3 ? 1 : 0))
  }
  ctx.globalAlpha = 1
}

// Instructions injected into rock.
function drawTrickSap(ctx, w, pal, ag, ox, oy, dir, robe, hair, fr) {
  var tx = fr.tx, mid = fr.mid
  for (var pr = 0; pr < 4; pr++) {
    var promptX = tx + dir * (5 + pr * 5)
    ctx.fillRect(promptX - (dir < 0 ? 4 : 0), mid - 7 + pr * 4, 4, 1)
    ctx.fillRect(promptX + dir * 3, mid - 8 + pr * 4, 1, 3)
  }
}

// Straight down, under its feet.
function drawTrickStomp(ctx, w, pal, ag, ox, oy, dir, robe, hair, fr) {
  var reach = fr.reach
  ctx.fillRect(ox + 1, oy + SPRITE_PX, 6, Math.round(18 * reach))
}

// Straight up, over its head.
function drawTrickBallast(ctx, w, pal, ag, ox, oy, dir, robe, hair, fr) {
  var reach = fr.reach
  // The mirror of the stomp, and drawn as the tanks emptying rather than
  // as a beam: the shaft above is full of the air that made it rise, so
  // it is a column of bubbles widening as it climbs. The only trick on
  // the roster that leaves the board looking like something happened to
  // the water rather than to the rock.
  var bshaft = Math.round(26 * reach)
  ctx.fillRect(ox + 1, oy - bshaft, 6, bshaft)
  for (var bb = 0; bb < 14; bb++) {
    var bl = ((w.ticks * 2 + bb * 17) % 100) / 100
    ctx.globalAlpha = 0.8 * (1 - bl * 0.6)
    ctx.fillRect(Math.round(ox + 4 + Math.sin(bl * 6 + bb) * 5),
                 Math.round(oy - bl * bshaft), bl > 0.6 ? 2 : 1, bl > 0.6 ? 2 : 1)
  }
  ctx.globalAlpha = 1
}

// A whole room's worth.
function drawTrickQuarry(ctx, w, pal, ag, ox, oy, dir, robe, hair, fr) {
  var reach = fr.reach, tx = fr.tx
  var qwide = Math.round(28 * reach)
  ctx.globalAlpha = 0.28
  for (var qgx = 0; qgx <= qwide; qgx += 4)
    ctx.fillRect((dir > 0 ? tx : tx - qwide) + qgx, oy - 12, 1, 28)
  for (var qgy = 0; qgy <= 28; qgy += 4)
    ctx.fillRect(dir > 0 ? tx : tx - qwide, oy - 12 + qgy, qwide, 1)
  ctx.globalAlpha = 1
  ctx.fillRect(dir > 0 ? tx + qwide - 2 : tx - qwide, oy - 12, 2, 28)
}

// A wall of tracer, full height.
function drawTrickSpray(ctx, w, pal, ag, ox, oy, dir, robe, hair, fr) {
  var C = fr.C, tsp = fr.tsp, tx = fr.tx, mid = fr.mid
  // A twelve-round burst, one angled tracer at a time. The simulation
  // uses the same slope sequence, so the visible impact is the cell that
  // actually absorbs this particular round.
  var gunX = dir > 0 ? tx : tx - 9
  ctx.fillStyle = pal.rigDark
  ctx.fillRect(gunX, mid - 1, 9, 3)          // receiver and long barrel
  ctx.fillRect(dir > 0 ? gunX - 3 : gunX + 8, mid + 2, 4, 4)
  var spraySlopes = w.k.SPRAY_SLOPES
  var shotIndex = Math.min(11, Math.floor(Math.max(0, ag.timer - 1) / 2))
  var muzzleCellY = Math.floor(ag.y) - 2
  var shotSlope = spraySlopes[shotIndex]
  var hitCellX = ag.shotFor > 0 ? ag.shotTo : Math.floor(ag.x) + dir * 30
  var hitCellY = ag.shotFor > 0 ? ag.shotY : Math.round(muzzleCellY + shotSlope * 30)
  var shotPhase = ((ag.timer - 1) % 2) === 0 ? 0.55 : 1
  var bulletCellX = ag.x + (hitCellX - ag.x) * shotPhase
  var bulletCellY = muzzleCellY + (hitCellY - muzzleCellY) * shotPhase
  ctx.fillStyle = pal.fireHot
  ctx.fillRect(Math.round(bulletCellX * C), Math.round((bulletCellY + 0.5) * C), 4, 2)
  ctx.globalAlpha = 0.45
  ctx.fillRect(Math.round((bulletCellX - dir * 1.5) * C), Math.round((bulletCellY + 0.5) * C), 4, 1)
  ctx.globalAlpha = 1
  hzTri(ctx, tx + dir * 5, mid, 3, 5, dir > 0 ? 1 : -1)
  // One hot casing per shot, falling behind the receiver.
  ctx.fillStyle = tsp ? tsp.hair : pal.warn
  ctx.fillRect(gunX + (dir > 0 ? 1 : 7), mid + 4 + (shotIndex % 3), 2, 1)
}

// Laid out rather than taken out.
function drawTrickSlab(ctx, w, pal, ag, ox, oy, dir, robe, hair, fr) {
  var reach = fr.reach, tx = fr.tx
  ctx.fillRect(dir > 0 ? tx : tx - Math.round(24 * reach), oy + SPRITE_PX - 2, Math.round(24 * reach), 5)
}

// The confident route that is not there.
function drawTrickPhase(ctx, w, pal, ag, ox, oy, dir, robe, hair, fr) {
  for (var ph = 1; ph <= 4; ph++) {
    ctx.globalAlpha = (5 - ph) * 0.12
    ctx.fillRect(ox + dir * ph * 7, oy + 2, SPRITE_W, SPRITE_PX - 3)
  }
}

// Cursor and unsolicited continuation.
function drawTrickComplete(ctx, w, pal, ag, ox, oy, dir, robe, hair, fr) {
  var reach = fr.reach, tx = fr.tx
  for (var au = 1; au <= 7; au++)
    ctx.fillRect(tx + dir * au * 4 - (dir < 0 ? 2 : 0), oy + 14 - (au % 3), 3, 1)
  ctx.fillRect(tx + dir * Math.round(30 * reach), oy + 3, 2, 13)
}

// Linked bubbles, one conclusion.
function drawTrickChain(ctx, w, pal, ag, ox, oy, dir, robe, hair, fr) {
  for (var ch = 0; ch < 5; ch++) {
    var chx = ox + SPRITE_W / 2 + dir * ch * 7
    ctx.fillRect(chx, oy - 2 - (ch % 2) * 2, 4, 3)
    if (ch > 0) ctx.fillRect(chx - dir * 4, oy - 1 - (ch % 2), 4, 1)
  }
}

// Three futures, one commitment.
function drawTrickSpeculate(ctx, w, pal, ag, ox, oy, dir, robe, hair, fr) {
  var reach = fr.reach
  for (var sd = -1; sd <= 1; sd++) {
    ctx.globalAlpha = sd === 0 ? 0.65 : 0.25
    ctx.fillRect(ox + dir * Math.round(22 * reach), oy + sd * 6, SPRITE_W, SPRITE_PX)
  }
}

// Copies losing resolution outward.
function drawTrickCollapse(ctx, w, pal, ag, ox, oy, dir, robe, hair, fr) {
  for (var mc = 1; mc <= 3; mc++) {
    ctx.globalAlpha = 0.55 / mc
    var msize = SPRITE_PX - mc * 3
    ctx.fillRect(ox - dir * mc * 8, oy + SPRITE_PX - msize, Math.max(2, SPRITE_W - mc), msize)
  }
}

// Rungs going up, one call at a time.
function drawTrickStack(ctx, w, pal, ag, ox, oy, dir, robe, hair, fr) {
  var reach = fr.reach, tx = fr.tx
  var rungs = Math.min(7, 1 + Math.floor(reach * 7))
  for (var sr = 0; sr < rungs; sr++) {
    var sry = oy + SPRITE_PX - 4 - sr * 5
    ctx.fillRect(tx + dir * 2 - (dir < 0 ? 5 : 0), sry, 6, 2)
  }
  // The two stiles it is nailing them to, and the frame that has not
  // returned yet at the top of the stack.
  ctx.fillRect(tx + dir * 1 - (dir < 0 ? 1 : 0), oy + SPRITE_PX - 4 - rungs * 5, 1, rungs * 5)
  ctx.fillRect(tx + dir * 6 - (dir < 0 ? 1 : 0), oy + SPRITE_PX - 4 - rungs * 5, 1, rungs * 5)
  ctx.globalAlpha = 0.35
  ctx.fillRect(tx + dir * 2 - (dir < 0 ? 5 : 0), oy + SPRITE_PX - 9 - rungs * 5, 6, 2)
}

function drawAgentHeightGear(ctx, w, pal, ag, ox, oy, dir, robe, hair) {
  var C = w.k.CELL
  if (ag.state === "height") {
    var hm = ag.heightMode
    var hp = ag.heightTicks ? ag.heightTick / ag.heightTicks : 0
    var hc = w.specialSpec ? w.specialSpec.hair : pal.label
    ctx.fillStyle = hc
    var fn = GEAR_DRAW[hm]
    if (fn) fn(ctx, w, pal, ag, ox, oy, dir, robe, hair, { C: C, hm: hm, hp: hp, hc: hc })
    drawHeightGearFine(ctx, w, pal, ag, ox, oy, dir, robe, hair, { C: C, hm: hm, hp: hp, hc: hc })
  }

  // Model Collapse commits to the stunt: one full salto between the ledge and
  // its pile of cheaper selves. Keep the pad and the label upright; rotate the
  // original agent alone around the middle of its sprite.
}

// Fallback on its own way down: a cord from where it jumped to its harness,
// stretching and slackening with the bounce.
function drawGearBungee(ctx, w, pal, ag, ox, oy, dir, robe, hair, fr) {
  var C = fr.C, topY = Math.round((ag.heightFromY - 3) * C), hx = ox + 4
  ctx.fillStyle = hair
  for (var y = topY; y < oy + 6; y += 2) ctx.fillRect(hx + ((y >> 2) % 2), y, 1, 1)
  ctx.fillRect(hx - 2, topY - 1, 5, 1)                          // the anchor
  ctx.fillStyle = robe
  ctx.fillRect(ox + 1, oy + 9, 6, 1)                            // harness
}

// Hot Reload going down a drop: it comes apart into scattered pixels at the
// top and assembles out of them at the bottom.
function drawGearTeleport(ctx, w, pal, ag, ox, oy, dir, robe, hair, fr) {
  var hp = fr.hp, half = hp < 0.5 ? hp * 2 : (1 - hp) * 2
  ctx.fillStyle = hair
  for (var i = 0; i < 10; i++) {
    var sx = ox + ((i * 7) % 10) - 1 + Math.round(Math.sin(i * 2.1 + hp * 9) * half * 6)
    var sy = oy + ((i * 5) % 16) + Math.round(Math.cos(i * 1.3 + hp * 7) * half * 4)
    ctx.fillRect(sx, sy, 1, 1)
  }
  ctx.globalAlpha = Math.max(0.15, 1 - half)
}

var GEAR_DRAW = {
  bungee: drawGearBungee, teleport: drawGearTeleport,
  jetpack: drawGearJetpack, helicopter: drawGearHelicopter,
  cushion: drawGearCushion, conning: drawGearConning, web: drawGearWeb,
  chain: drawGearWeb, balloon: drawGearBalloon, promptchute: drawGearPromptchute,
  duckfloat: drawGearDuckfloat, crate: drawGearCrate,
  extender: drawGearExtender, shieldglider: drawGearShieldglider,
  backoff: drawGearBackoff, glasswing: drawGearGlasswing, tractor: drawGearTractor,
  steps: drawGearSteps, logchute: drawGearLogchute, recoil: drawGearRecoil,
  gunwing: drawGearGunwing, cyclone: drawGearCyclone, ghost: drawGearGhost,
  piledrive: drawGearPiledrive
}

function drawGearJetpack(ctx, w, pal, ag, ox, oy, dir, robe, hair, fr) {
  ctx.fillStyle = "#303039"; ctx.fillRect(ox - dir * 2, oy + 7, 3, 8)
  ctx.fillStyle = (ag.anim >> 1) % 2 ? "#ffe68a" : "#ff8a35"
  ctx.fillRect(ox - dir * 2, oy + 15, 2, 4 + ((ag.anim >> 1) % 2))
}

function drawGearHelicopter(ctx, w, pal, ag, ox, oy, dir, robe, hair, fr) {
  var hc = fr.hc
  // Context Window does not merely wear a rotor: it becomes the whole
  // tiny aircraft, tail, cockpit and skids included.
  ctx.fillStyle = robe
  ctx.fillRect(ox - 3, oy + 4, 15, 8)                 // cabin
  ctx.fillRect(ox - 11, oy + 6, 9, 3)                // tail boom
  ctx.fillRect(ox - 13, oy + 2, 2, 9)                // tail rotor
  ctx.fillStyle = "#91d7e8"
  ctx.fillRect(ox + 5, oy + 5, 6, 4)                 // cockpit
  ctx.fillStyle = hc
  ctx.fillRect(ox + 3, oy - 2, 2, 7)                 // mast
  ctx.fillRect(ox - 10 - ((ag.anim >> 1) % 2) * 3, oy - 3,
               28 + ((ag.anim >> 1) % 2) * 6, 2)     // main rotor
  ctx.fillRect(ox - 1, oy + 13, 14, 1)               // skids
  ctx.fillRect(ox + 1, oy + 11, 1, 3)
  ctx.fillRect(ox + 10, oy + 11, 1, 3)
}

function drawGearCushion(ctx, w, pal, ag, ox, oy, dir, robe, hair, fr) {
  var C = fr.C
  var py = Math.round((ag.heightToY + 1) * C) - 3
  var px = Math.round(ag.heightToX * C)
  // Three progressively cheaper, visibly squashed little agents make the
  // stuntman's landing pad. Bodies alone looked like an unexplained pink
  // mattress; the separate heads are what sell the awful solution.
  var copyAlpha = [0.75, 0.55, 0.35]
  var copyX = [px - 10, px - 3, px + 4]
  var copyH = [3, 5, 3]
  for (var cp = 0; cp < 3; cp++) {
    ctx.globalAlpha = copyAlpha[cp]
    ctx.fillStyle = robe
    ctx.fillRect(copyX[cp], py - copyH[cp], 7, copyH[cp])
    ctx.fillStyle = hair
    ctx.fillRect(copyX[cp] + 2, py - copyH[cp] - 2, 3, 2)
  }
  ctx.globalAlpha = 1
}

function drawGearConning(ctx, w, pal, ag, ox, oy, dir, robe, hair, fr) {
  var hc = fr.hc
  // The one device on the roster that is a vehicle: a little hull with a
  // conning tower and a lit port, and the agent inside it rather than
  // hanging off it. Everything else here is a machine somebody is
  // wearing; this one they are driving, so it is drawn around them and
  // the sprite shows through the port rather than above the gear.
  var subY = oy + 2
  ctx.fillStyle = hc
  ctx.fillRect(ox - 5, subY + 3, 18, 8)                 // hull
  ctx.fillRect(ox - 7, subY + 5, 2, 4)                  // bow cap
  ctx.fillRect(ox + 13, subY + 5, 2, 4)                 // stern cap
  ctx.fillStyle = robe
  ctx.fillRect(ox + 1, subY - 2, 6, 5)                  // conning tower
  ctx.fillRect(ox + 3, subY - 5, 1, 3)                  // periscope
  ctx.fillStyle = pal.port || "#9fd8e4"
  ctx.fillRect(ox + 7, subY + 5, 3, 3)                  // the port
  ctx.fillStyle = pal.bubbleLit || "#ffffff"
  ctx.fillRect(ox + 7, subY + 5, 1, 1)
  // The screw, turning, and the wake it is putting out behind.
  ctx.fillStyle = hc
  var blade = Math.floor(ag.heightTick * 0.4) % 2 === 0
  ctx.fillRect(ox + 15, subY + (blade ? 4 : 6), 1, blade ? 6 : 2)
  ctx.globalAlpha = 0.5
  ctx.fillStyle = pal.bubble || "#ffffff"
  for (var wk = 0; wk < 5; wk++)
    ctx.fillRect(ox + 17 + wk * 3, subY + 6 + ((ag.heightTick + wk) % 3) - 1, 2, 1)
  ctx.globalAlpha = 1
}

function drawGearWeb(ctx, w, pal, ag, ox, oy, dir, robe, hair, fr) {
  var C = fr.C, hm = fr.hm, hc = fr.hc
  var anchorX = Math.round((ag.heightUp ? ag.heightToX : ag.heightFromX) * C)
  var anchorY = Math.round(((ag.heightUp ? ag.heightToY : ag.heightFromY) - 2) * C)
  ctx.fillStyle = hm === "web" ? "#e8e8f4" : hc
  var lineSteps = Math.max(1, Math.round(Math.abs(anchorY - (oy + 7)) / 3))
  for (var ls = 0; ls <= lineSteps; ls++)
    ctx.fillRect(Math.round(anchorX + (ox + 4 - anchorX) * ls / lineSteps),
                 Math.round(anchorY + (oy + 7 - anchorY) * ls / lineSteps), 1, 2)
}

function drawGearBalloon(ctx, w, pal, ag, ox, oy, dir, robe, hair, fr) {
  ctx.fillRect(ox - 2, oy - 11, 12, 8)
  ctx.fillStyle = robe; ctx.fillRect(ox, oy - 4, 1, 6); ctx.fillRect(ox + 7, oy - 4, 1, 6)
}

// Package Manager's way down: stood in an open shipping crate, slats and a
// stencilled arrow, that it rides down and then is simply not in any more.
var CRATE_WOOD = "#b7864b", CRATE_DARK = "#7a5530"
function drawGearCrate(ctx, w, pal, ag, ox, oy, dir, robe, hair, fr) {
  var y = oy + 9
  ctx.fillStyle = CRATE_WOOD
  ctx.fillRect(ox - 2, y, 12, 8)
  ctx.fillStyle = CRATE_DARK
  ctx.fillRect(ox - 2, y, 12, 1); ctx.fillRect(ox - 2, y + 4, 12, 1)       // slats
  ctx.fillRect(ox - 2, y, 1, 8); ctx.fillRect(ox + 9, y, 1, 8)
  ctx.fillStyle = "#1a1a20"
  ctx.fillRect(ox + 3, y + 1, 2, 2); ctx.fillRect(ox + 2, y + 2, 4, 1)      // "this way up"
}

// Rubber Duck's way down: sat on an inflatable duck, which bobs. The duck's
// own yellow, like the one it carries (drawDuck).
function drawGearDuckfloat(ctx, w, pal, ag, ox, oy, dir, robe, hair, fr) {
  var bob = Math.round(Math.sin((fr.hp || 0) * Math.PI * 6)), y = oy + 11 + bob
  var head = dir > 0 ? ox + 9 : ox - 4
  ctx.fillStyle = DUCK_YELLOW
  ctx.fillRect(ox - 3, y, 14, 5)                                  // the ring of its body
  ctx.fillRect(head, y - 5, 4, 5)                                 // neck and head
  ctx.fillStyle = DUCK_BEAK
  ctx.fillRect(dir > 0 ? head + 4 : head - 2, y - 3, 2, 1)
  ctx.fillStyle = "#1a1a20"
  ctx.fillRect(head + (dir > 0 ? 2 : 1), y - 4, 1, 1)
  ctx.fillStyle = "#ffffff"
  ctx.fillRect(ox - 1, y + 1, 3, 1)                               // a shine on the plastic
}

function drawGearPromptchute(ctx, w, pal, ag, ox, oy, dir, robe, hair, fr) {
  ctx.fillRect(ox - 6, oy - 10, 20, 6)
  ctx.fillStyle = pal.eye; ctx.font = "bold 6px monospace"; ctx.textAlign = "center"
  ctx.fillText("LAND", ox + 4, oy - 5)
}

function drawGearExtender(ctx, w, pal, ag, ox, oy, dir, robe, hair, fr) {
  ctx.fillRect(ox - 3, oy - 3, 2, 22); ctx.fillRect(ox + 9, oy - 3, 2, 22)
  for (var er = 0; er < 22; er += 5) ctx.fillRect(ox - 3, oy + er, 14, 1)
}

function drawGearShieldglider(ctx, w, pal, ag, ox, oy, dir, robe, hair, fr) {
  ctx.fillRect(ox - 8, oy - 7, 24, 3)
  ctx.fillRect(ox - 5, oy - 4, 18, 2)
}

function drawGearBackoff(ctx, w, pal, ag, ox, oy, dir, robe, hair, fr) {
  var hp = fr.hp
  // An octagonal stop sign worn as a canopy. It lights on each drop and
  // goes dark on each wait, so the retries can be counted.
  var dropping = Math.floor(hp * 11) % 2 === 0 || hp >= 1
  ctx.fillStyle = dropping ? THROTTLE_AMBER : robe
  ctx.fillRect(ox - 3, oy - 12, 14, 8)
  ctx.fillRect(ox - 1, oy - 14, 10, 12)
  ctx.fillStyle = "#1c1c22"
  ctx.fillRect(ox + 1, oy - 10, 2, 4); ctx.fillRect(ox + 5, oy - 10, 2, 4)
  ctx.fillStyle = robe
  ctx.fillRect(ox, oy - 2, 1, 4); ctx.fillRect(ox + 7, oy - 2, 1, 4)
}

function drawGearGlasswing(ctx, w, pal, ag, ox, oy, dir, robe, hair, fr) {
  ctx.globalAlpha = 0.55
  ctx.fillRect(ox - 10, oy + 2, 10, 8); ctx.fillRect(ox + 8, oy + 2, 10, 8)
  ctx.globalAlpha = 1
}

function drawGearTractor(ctx, w, pal, ag, ox, oy, dir, robe, hair, fr) {
  ctx.globalAlpha = 0.5
  ctx.fillRect(ox - 7, oy - 9, 22, 2)
  ctx.fillRect(ox - 4, oy - 7, 16, 22); ctx.globalAlpha = 1
}

function drawGearSteps(ctx, w, pal, ag, ox, oy, dir, robe, hair, fr) {
  for (var hs = 0; hs < 4; hs++) ctx.fillRect(ox - dir * hs * 5, oy + 18 - hs * 4, 7, 2)
}

function drawGearLogchute(ctx, w, pal, ag, ox, oy, dir, robe, hair, fr) {
  ctx.fillStyle = "#8a4b22"; ctx.fillRect(ox - 7, oy + 15, 22, 4)
  ctx.fillStyle = "#c8843f"; ctx.fillRect(ox - 6, oy + 16, 20, 1)
}

function drawGearRecoil(ctx, w, pal, ag, ox, oy, dir, robe, hair, fr) {
  ctx.fillRect(ox - dir * 8, oy + 8, 9, 3)
  ctx.fillStyle = "#ffe68a"; ctx.fillRect(ox - dir * 11, oy + 8, 4, 3)
}

// RAMbo rides his own recoil: the gun points at the floor and each shot
// kicks him higher. It used to share Max Tokens' sideways barrel, which
// read as a man carrying a gun through the air rather than a man being
// pushed up by one — and the two specials were indistinguishable in
// flight. The beat here is the same five shots the climb is built from
// in stepSpecialHeight, so the flash lands on the kick.
function drawGearGunwing(ctx, w, pal, ag, ox, oy, dir, robe, hair, fr) {
  var hp = fr.hp, hc = fr.hc
  // One round at a time, each at the next angle in the burst, with the
  // gun swinging to follow it — the same thing his spray move does at a
  // wall, pointed at the floor instead. Not a fan: the weapon fires one
  // tracer per shot and sweeps between them.
  //
  // Two things this drawing has to stay away from. The gun is small and
  // held out to the side, because a long barrel hanging from the middle
  // of an eight-pixel sprite does not read as a gun at all. And there is
  // exactly one stream of anything: ejected brass was drawn here once
  // and read as a second burst being fired sideways.
  var slopes = w.k.SPRAY_SLOPES
  var shots = w.k.GUNWING_SHOTS
  var shotIx = Math.min(shots - 1, Math.floor(hp * shots))
  var beat = (hp * shots) % 1
  var slope = slopes[shotIx % slopes.length]

  // The slopes are gentle because the spray move throws them down a long
  // corridor, where a shallow angle is a wide deviation by the far end.
  // Here the throw is a few body-lengths, so they open right out.
  var aimX = slope * 8
  var len = Math.sqrt(aimX * aimX + 1)
  var ux = aimX / len, uy = 1 / len

  // Rounds stop at the ground: this layer paints over the terrain, so
  // an unclamped tracer carries on through the floor it is fired at.
  var gcx = Math.floor(ag.x)
  var toFloor = 0
  while (toFloor < 34
         && w.terrain[(Math.floor(ag.y) + 1 + toFloor) * w.k.COLS + gcx] === w.k.EMPTY) toFloor++
  var floorPx = Math.max(5, toFloor * w.k.CELL - 2)

  // Held out on whichever side it is aiming, not on the side he happens
  // to be facing: gripped on the leading side it swung back across his
  // own body every other round and spent half the burst hidden behind
  // him. Moving the grip with the aim is also what the swing looks like.
  var gripX = ox + 3 + (ux < -0.05 ? -3 : (ux > 0.05 ? 3 : 0))
  var gripY = oy + 9
  var muzX = gripX + ux * 6
  var muzY = gripY + uy * 6

  ctx.fillStyle = "#6f7180"
  for (var gb = 1; gb <= 6; gb += 2)
    ctx.fillRect(Math.round(gripX + ux * gb), Math.round(gripY + uy * gb), 2, 2)
  ctx.fillStyle = hc
  ctx.fillRect(Math.round(gripX), gripY - 1, 2, 3)         // the hand on it

  // The round, out along the line the barrel is pointing.
  var travel = 3 + beat * (floorPx - 3)
  ctx.fillStyle = "#ffe68a"
  ctx.fillRect(Math.round(muzX + ux * travel), Math.round(muzY + uy * travel), 2, 3)
  ctx.globalAlpha = 0.35
  ctx.fillRect(Math.round(muzX + ux * (travel - 5)), Math.round(muzY + uy * (travel - 5)), 1, 2)
  ctx.globalAlpha = 1

  if (beat < 0.3) {
    ctx.fillStyle = "#ffe68a"
    ctx.fillRect(Math.round(muzX), Math.round(muzY), 2, 2)
  }
}

function drawGearCyclone(ctx, w, pal, ag, ox, oy, dir, robe, hair, fr) {
  ctx.globalAlpha = 0.35
  ctx.fillRect(ox - 8, oy + 5, 24, 2); ctx.fillRect(ox - 4, oy + 12, 16, 2)
  ctx.globalAlpha = 1
}

function drawGearGhost(ctx, w, pal, ag, ox, oy, dir, robe, hair, fr) {
  var hp = fr.hp
  ctx.globalAlpha = 0.28 + Math.sin(hp * Math.PI) * 0.35
}

function drawGearPiledrive(ctx, w, pal, ag, ox, oy, dir, robe, hair, fr) {
  ctx.fillRect(ox - 3, oy + 14, 14, 3)
}

// Detail belongs to the device, not the body pose. These marks follow the
// coarse drawing's own coordinates (most vehicles do not turn with the rider).
// Save the post-device state: teleport deliberately leaves the body faded.
var GEAR_FINE = {
  bungee: drawGearBungeeFine, teleport: drawGearTeleportFine,
  jetpack: drawGearJetpackFine, helicopter: drawGearHelicopterFine,
  cushion: drawGearCushionFine, conning: drawGearConningFine,
  web: drawGearWebFine, chain: drawGearChainFine,
  balloon: drawGearBalloonFine, promptchute: drawGearPromptchuteFine,
  extender: drawGearExtenderFine, shieldglider: drawGearShieldgliderFine,
  backoff: drawGearBackoffFine, glasswing: drawGearGlasswingFine,
  tractor: drawGearTractorFine, steps: drawGearStepsFine,
  logchute: drawGearLogchuteFine, recoil: drawGearRecoilFine,
  gunwing: drawGearGunwingFine, cyclone: drawGearCycloneFine,
  piledrive: drawGearPiledriveFine
}

function drawHeightGearFine(ctx, w, pal, ag, ox, oy, dir, robe, hair, fr) {
  if ((w.res || 1) < 2) return
  var fn = GEAR_FINE[fr.hm]
  if (!fn) return
  ctx.save(); ctx.globalAlpha = 1
  fn(ctx, w, pal, ag, ox, oy, dir, robe, hair, fr)
  ctx.restore()
}

function gearFineRect(ctx, ox, oy, x, y, width, height) {
  ctx.fillRect(Math.round((ox + x) * 2) / 2, Math.round((oy + y) * 2) / 2, width, height)
}

function drawGearBungeeFine(ctx, w, pal, ag, ox, oy, dir, robe, hair, fr) {
  var top = Math.round((ag.heightFromY - 3) * fr.C) - oy
  ctx.fillStyle = pal.rigDark
  for (var y = top; y < 6; y += 2)
    gearFineRect(ctx, ox, oy, 4.5 + (((y + oy) >> 2) % 2), y + 0.5, 0.5, 0.5)
  ctx.fillStyle = pal.label
  gearFineRect(ctx, ox, oy, 2.5, top - 1, 0.5, 0.5)
  gearFineRect(ctx, ox, oy, 5.5, top - 1, 0.5, 0.5) // anchor bolts
  gearFineRect(ctx, ox, oy, 3.5, 9, 1, 0.5)       // harness buckle
}

function drawGearTeleportFine(ctx, w, pal, ag, ox, oy, dir, robe, hair, fr) {
  var hp = fr.hp, half = hp < 0.5 ? hp * 2 : (1 - hp) * 2
  ctx.fillStyle = robe
  for (var i = 0; i < 10; i++) {
    var x = ((i * 7) % 10) - 1 + Math.round(Math.sin(i * 2.1 + hp * 9) * half * 6)
    var y = ((i * 5) % 16) + Math.round(Math.cos(i * 1.3 + hp * 7) * half * 4)
    gearFineRect(ctx, ox, oy, x, y, 0.5, 0.5) // bright corner of each reassembly pixel
  }
}

function drawGearJetpackFine(ctx, w, pal, ag, ox, oy, dir, robe, hair, fr) {
  var x = -dir * 2, pulse = (ag.anim >> 1) % 2
  ctx.fillStyle = pal.rig
  gearFineRect(ctx, ox, oy, x + 0.5, 7.5, 0.5, 6)
  gearFineRect(ctx, ox, oy, x + 1, 14, 1.5, 0.5) // nozzle rim
  ctx.fillStyle = hair
  gearFineRect(ctx, ox, oy, x + 1.5, 8, 0.5, 0.5) // valve
  ctx.fillStyle = "#ffe68a"
  gearFineRect(ctx, ox, oy, x + 0.5, 15.5, 0.5, 2.5 + pulse)
  ctx.fillStyle = "#ff8a35"
  gearFineRect(ctx, ox, oy, x + 1.5, 16, 0.5, 2 + pulse)
}

function drawGearHelicopterFine(ctx, w, pal, ag, ox, oy, dir, robe, hair, fr) {
  var pulse = (ag.anim >> 1) % 2
  ctx.fillStyle = pal.rigDark
  gearFineRect(ctx, ox, oy, -2.5, 11, 14, 0.5) // cabin sill
  gearFineRect(ctx, ox, oy, -10, 8, 7.5, 0.5)
  gearFineRect(ctx, ox, oy, 7.5, 5, 0.5, 4) // cockpit mullion
  ctx.fillStyle = "#91d7e8"
  gearFineRect(ctx, ox, oy, -12.5, 3, 0.5, 2) // tail rotor edge
  gearFineRect(ctx, ox, oy, 6, 5.5, 1.5, 0.5)
  ctx.fillStyle = pal.label
  gearFineRect(ctx, ox, oy, 8.5, 5.5, 1.5, 0.5) // glass glint
  gearFineRect(ctx, ox, oy, -9.5 - pulse * 3, -3, 27 + pulse * 6, 0.5)
  gearFineRect(ctx, ox, oy, 3.5, -1, 0.5, 4) // mast
  gearFineRect(ctx, ox, oy, 0, 13, 12, 0.5) // skid lip
  for (var x = -1.5; x < 5; x += 3) gearFineRect(ctx, ox, oy, x, 10, 0.5, 0.5)
}

function drawGearCushionFine(ctx, w, pal, ag, ox, oy, dir, robe, hair, fr) {
  var py = Math.round((ag.heightToY + 1) * fr.C) - 3 - oy
  var px = Math.round(ag.heightToX * fr.C) - ox
  var heights = [3, 5, 3], alphas = [0.75, 0.55, 0.35]
  for (var i = 0; i < 3; i++) {
    var x = px - 10 + i * 7, y = py - heights[i]
    ctx.globalAlpha = alphas[i]
    ctx.fillStyle = hair
    gearFineRect(ctx, ox, oy, x + 0.5, y + 0.5, 5, 0.5) // compressed collar
    ctx.fillStyle = pal.rigDark
    gearFineRect(ctx, ox, oy, x + 4, y - 1, 0.5, 0.5) // each copy still has glasses
    gearFineRect(ctx, ox, oy, x + 3.5, y + 1, 0.5, 1)
  }
}

function drawGearConningFine(ctx, w, pal, ag, ox, oy, dir, robe, hair, fr) {
  var blade = Math.floor(ag.heightTick * 0.4) % 2 === 0
  ctx.fillStyle = robe
  gearFineRect(ctx, ox, oy, -4.5, 12, 17, 0.5) // hull seam
  for (var x = -3.5; x < 13; x += 3) gearFineRect(ctx, ox, oy, x, 6, 0.5, 0.5)
  gearFineRect(ctx, ox, oy, 9.5, 7.5, 0.5, 2) // port's shaded rim
  ctx.fillStyle = pal.bubbleLit || "#ffffff"
  gearFineRect(ctx, ox, oy, -4, 5.5, 7, 0.5) // curved hull's lit shoulder
  gearFineRect(ctx, ox, oy, 7.5, 7.5, 1, 0.5) // lens
  gearFineRect(ctx, ox, oy, 3, -2.5, 0.5, 1.5) // periscope
  gearFineRect(ctx, ox, oy, 15, blade ? 6.5 : 8.5, 0.5, blade ? 4.5 : 1)
  ctx.fillStyle = hair
  gearFineRect(ctx, ox, oy, 1.5, 0.5, 4, 0.5) // tower hatch
}

function drawGearWebFine(ctx, w, pal, ag, ox, oy, dir, robe, hair, fr) {
  var ax = Math.round((ag.heightUp ? ag.heightToX : ag.heightFromX) * fr.C)
  var ay = Math.round(((ag.heightUp ? ag.heightToY : ag.heightFromY) - 2) * fr.C)
  var steps = Math.max(1, Math.round(Math.abs(ay - (oy + 7)) / 3))
  ctx.fillStyle = pal.rigDark
  for (var i = 0; i <= steps; i++)
    gearFineRect(ctx, 0, 0, Math.round(ax + (ox + 4 - ax) * i / steps) + 0.5,
      Math.round(ay + (oy + 7 - ay) * i / steps) + 0.5, 0.5, 1)
}

function drawGearChainFine(ctx, w, pal, ag, ox, oy, dir, robe, hair, fr) {
  var ax = Math.round((ag.heightUp ? ag.heightToX : ag.heightFromX) * fr.C)
  var ay = Math.round(((ag.heightUp ? ag.heightToY : ag.heightFromY) - 2) * fr.C)
  var steps = Math.max(1, Math.round(Math.abs(ay - (oy + 7)) / 3))
  ctx.fillStyle = robe
  for (var i = 0; i <= steps; i++)
    gearFineRect(ctx, 0, 0, Math.round(ax + (ox + 4 - ax) * i / steps),
      Math.round(ay + (oy + 7 - ay) * i / steps) + 0.5, 0.5, 1) // hollow link
}

function drawGearBalloonFine(ctx, w, pal, ag, ox, oy, dir, robe, hair, fr) {
  ctx.fillStyle = robe
  gearFineRect(ctx, ox, oy, 1, -10.5, 0.5, 6.5) // panel seams
  gearFineRect(ctx, ox, oy, 6.5, -10.5, 0.5, 6.5)
  gearFineRect(ctx, ox, oy, -1.5, -3.5, 11, 0.5)
  ctx.fillStyle = pal.label
  gearFineRect(ctx, ox, oy, -0.5, -10, 1.5, 0.5) // curved glint
  gearFineRect(ctx, ox, oy, -1, -9.5, 0.5, 1.5)
  gearFineRect(ctx, ox, oy, 0, -2, 0.5, 3) // rope edges
  gearFineRect(ctx, ox, oy, 7, -2, 0.5, 3)
}

function drawGearPromptchuteFine(ctx, w, pal, ag, ox, oy, dir, robe, hair, fr) {
  ctx.fillStyle = robe
  gearFineRect(ctx, ox, oy, -5.5, -4.5, 19, 0.5) // stitched hem
  for (var x = -4; x < 14; x += 4) gearFineRect(ctx, ox, oy, x, -9.5, 0.5, 1.5)
  ctx.fillStyle = pal.label
  gearFineRect(ctx, ox, oy, -5, -9.5, 18, 0.5) // folded leading edge, above LAND
}

function drawGearExtenderFine(ctx, w, pal, ag, ox, oy, dir, robe, hair, fr) {
  ctx.fillStyle = robe
  gearFineRect(ctx, ox, oy, -2, -2.5, 0.5, 21)
  gearFineRect(ctx, ox, oy, 10, -2.5, 0.5, 21) // recessed telescopic channels
  for (var y = 0; y < 22; y += 5) {
    gearFineRect(ctx, ox, oy, -0.5, y + 0.5, 9, 0.5) // tread underside
    ctx.fillStyle = pal.label
    gearFineRect(ctx, ox, oy, -2.5, y, 0.5, 0.5)
    gearFineRect(ctx, ox, oy, 9.5, y, 0.5, 0.5) // rung bolts
    ctx.fillStyle = robe
  }
}

function drawGearShieldgliderFine(ctx, w, pal, ag, ox, oy, dir, robe, hair, fr) {
  ctx.fillStyle = robe
  gearFineRect(ctx, ox, oy, -7.5, -4.5, 23, 0.5) // plate bevel
  gearFineRect(ctx, ox, oy, -4.5, -2.5, 17, 0.5)
  gearFineRect(ctx, ox, oy, 3.5, -6.5, 1, 3) // central spar
  ctx.fillStyle = pal.label
  for (var x = -6; x < 16; x += 5) gearFineRect(ctx, ox, oy, x, -6, 0.5, 0.5)
}

function drawGearBackoffFine(ctx, w, pal, ag, ox, oy, dir, robe, hair, fr) {
  var dropping = Math.floor(fr.hp * 11) % 2 === 0 || fr.hp >= 1
  ctx.fillStyle = dropping ? robe : THROTTLE_AMBER
  gearFineRect(ctx, ox, oy, -0.5, -13.5, 9, 0.5) // sign rim
  gearFineRect(ctx, ox, oy, -2.5, -11, 0.5, 6)
  gearFineRect(ctx, ox, oy, 10, -11, 0.5, 6)
  gearFineRect(ctx, ox, oy, -0.5, -3, 9, 0.5)
  ctx.fillStyle = pal.label
  gearFineRect(ctx, ox, oy, 1.5, -9.5, 0.5, 0.5)
  gearFineRect(ctx, ox, oy, 5.5, -9.5, 0.5, 0.5) // pause lamps
  gearFineRect(ctx, ox, oy, 0, -1, 0.5, 2)
  gearFineRect(ctx, ox, oy, 7, -1, 0.5, 2)
}

function drawGearGlasswingFine(ctx, w, pal, ag, ox, oy, dir, robe, hair, fr) {
  ctx.globalAlpha = 0.55
  ctx.fillStyle = robe
  gearFineRect(ctx, ox, oy, -9.5, 9, 9, 0.5)
  gearFineRect(ctx, ox, oy, 8.5, 9, 9, 0.5)
  gearFineRect(ctx, ox, oy, -5, 2.5, 0.5, 6)
  gearFineRect(ctx, ox, oy, 12.5, 2.5, 0.5, 6) // glass panel ribs
  ctx.fillStyle = hair
  gearFineRect(ctx, ox, oy, -9, 3, 2, 0.5)
  gearFineRect(ctx, ox, oy, 9, 3, 2, 0.5) // glass reflections
}

function drawGearTractorFine(ctx, w, pal, ag, ox, oy, dir, robe, hair, fr) {
  ctx.fillStyle = robe
  gearFineRect(ctx, ox, oy, -6.5, -8, 21, 0.5) // emitter underside
  ctx.fillStyle = hair
  for (var x = -5; x < 15; x += 4) gearFineRect(ctx, ox, oy, x, -8.5, 0.5, 0.5)
  ctx.globalAlpha = 0.5
  var beat = (ag.anim >> 1) % 2
  for (var y = -5 + beat; y < 15; y += 5) {
    gearFineRect(ctx, ox, oy, -3.5, y, 0.5, 2) // beam's moving edge pulses
    gearFineRect(ctx, ox, oy, 11, y, 0.5, 2)
  }
}

function drawGearStepsFine(ctx, w, pal, ag, ox, oy, dir, robe, hair, fr) {
  for (var i = 0; i < 4; i++) {
    var x = -dir * i * 5, y = 18 - i * 4
    ctx.fillStyle = robe
    gearFineRect(ctx, ox, oy, x + 0.5, y + 1.5, 6, 0.5)
    ctx.fillStyle = pal.label
    gearFineRect(ctx, ox, oy, x + 0.5, y, 5.5, 0.5) // tread lip
  }
}

function drawGearLogchuteFine(ctx, w, pal, ag, ox, oy, dir, robe, hair, fr) {
  ctx.fillStyle = "#8a4b22"
  for (var x = -3; x < 12; x += 5) gearFineRect(ctx, ox, oy, x, 16, 2, 0.5) // grain breaks
  ctx.fillStyle = "#c8843f"
  gearFineRect(ctx, ox, oy, -6.5, 15.5, 0.5, 3) // end grain
  gearFineRect(ctx, ox, oy, 13.5, 15.5, 0.5, 3)
  gearFineRect(ctx, ox, oy, -4, 18, 13, 0.5)
}

function drawGearRecoilFine(ctx, w, pal, ag, ox, oy, dir, robe, hair, fr) {
  var x = -dir * 8
  ctx.fillStyle = pal.rigDark
  gearFineRect(ctx, ox, oy, x + 0.5, 10, 8, 0.5) // barrel underside
  ctx.fillStyle = pal.label
  gearFineRect(ctx, ox, oy, x + 1, 8, 6, 0.5) // barrel glint
  ctx.fillStyle = "#ff8a35"
  gearFineRect(ctx, ox, oy, -dir * 11 + 0.5, 10, 3, 0.5) // flash edge
}

function drawGearGunwingFine(ctx, w, pal, ag, ox, oy, dir, robe, hair, fr) {
  var ix = Math.min(w.k.GUNWING_SHOTS - 1, Math.floor(fr.hp * w.k.GUNWING_SHOTS))
  var aim = w.k.SPRAY_SLOPES[ix % w.k.SPRAY_SLOPES.length] * 8
  var len = Math.sqrt(aim * aim + 1), ux = aim / len, uy = 1 / len
  var grip = 3 + (ux < -0.05 ? -3 : (ux > 0.05 ? 3 : 0))
  ctx.fillStyle = pal.rigDark
  for (var i = 1; i <= 6; i += 2)
    gearFineRect(ctx, ox, oy, Math.round(grip + ux * i) + 1.5,
      Math.round(9 + uy * i) + 0.5, 0.5, 1) // moving barrel's shaded edge
  ctx.fillStyle = pal.label
  gearFineRect(ctx, ox, oy, Math.round(grip + ux * 5), Math.round(9 + uy * 5), 1, 0.5)
  ctx.fillStyle = robe
  gearFineRect(ctx, ox, oy, grip + 0.5, 8.5, 1, 0.5) // grip strap
}

function drawGearCycloneFine(ctx, w, pal, ag, ox, oy, dir, robe, hair, fr) {
  var beat = (ag.anim >> 1) % 2
  ctx.globalAlpha = 0.35
  ctx.fillStyle = hair
  for (var x = -6 + beat; x < 15; x += 5) gearFineRect(ctx, ox, oy, x, 5.5, 2, 0.5)
  for (var x2 = -2 + beat; x2 < 11; x2 += 5) gearFineRect(ctx, ox, oy, x2, 12.5, 2, 0.5)
}

function drawGearPiledriveFine(ctx, w, pal, ag, ox, oy, dir, robe, hair, fr) {
  ctx.fillStyle = robe
  gearFineRect(ctx, ox, oy, -2.5, 16, 13, 0.5) // weight's bevel
  gearFineRect(ctx, ox, oy, 3.5, 14.5, 1, 1) // piston recess
  ctx.fillStyle = pal.label
  for (var x = -1.5; x < 10; x += 4) gearFineRect(ctx, ox, oy, x, 14.5, 0.5, 0.5)
}

var TRICK_FINE = {
  rocket: drawTrickRocketFine, spray: drawTrickSprayFine,
  quarry: drawTrickQuarryFine, slab: drawTrickSlabFine,
  chain: drawTrickChainFine, stack: drawTrickStackFine, sap: drawTrickSapFine
}

function drawTrickFine(ctx, w, pal, ag, ox, oy, dir, robe, hair, fr) {
  if ((w.res || 1) < 2) return
  var fn = TRICK_FINE[fr.tsp && fr.tsp.act]
  if (!fn) return
  ctx.save(); ctx.globalAlpha = 1
  fn(ctx, w, pal, ag, ox, oy, dir, robe, hair, fr)
  ctx.restore()
}

function drawTrickRocketFine(ctx, w, pal, ag, ox, oy, dir, robe, hair, fr) {
  var x = fr.tx - ox - (dir > 0 ? 4 : 8)
  ctx.fillStyle = pal.rig
  gearFineRect(ctx, ox, oy, x + 0.5, 4.5, 10, 0.5) // launch tube seam
  ctx.fillStyle = pal.label
  gearFineRect(ctx, ox, oy, x + 2, 5.5, 0.5, 0.5) // sight screw
  ctx.fillStyle = pal.rigDark
  gearFineRect(ctx, ox, oy, fr.tx - ox + (dir > 0 ? 6.5 : -7.5), 5.5, 2, 0.5) // muzzle bore
}

function drawTrickSprayFine(ctx, w, pal, ag, ox, oy, dir, robe, hair, fr) {
  var x = fr.tx - ox - (dir > 0 ? 0 : 9)
  ctx.fillStyle = pal.rig
  gearFineRect(ctx, ox, oy, x + 0.5, 7, 8, 0.5) // receiver edge
  gearFineRect(ctx, ox, oy, x + (dir > 0 ? -2.5 : 8.5), 11, 2.5, 0.5) // grip grooves
  gearFineRect(ctx, ox, oy, x + (dir > 0 ? -2.5 : 8.5), 12.5, 2.5, 0.5)
  ctx.fillStyle = pal.label
  gearFineRect(ctx, ox, oy, x + (dir > 0 ? 1.5 : 6.5), 8, 1, 0.5) // breech
}

function drawTrickQuarryFine(ctx, w, pal, ag, ox, oy, dir, robe, hair, fr) {
  var wide = Math.round(28 * fr.reach)
  var x = fr.tx - ox + (dir > 0 ? wide - 2 : -wide)
  ctx.fillStyle = hair
  gearFineRect(ctx, ox, oy, x + 0.5, -11.5, 0.5, 27) // cutting frame's bright rail
  ctx.fillStyle = pal.rigDark
  for (var y = -10; y < 16; y += 5) gearFineRect(ctx, ox, oy, x + 1, y, 0.5, 0.5)
}

function drawTrickSlabFine(ctx, w, pal, ag, ox, oy, dir, robe, hair, fr) {
  var wide = Math.round(24 * fr.reach)
  if (wide < 1) return
  var x = fr.tx - ox - (dir > 0 ? 0 : wide)
  ctx.fillStyle = hair
  gearFineRect(ctx, ox, oy, x, 14, wide, 0.5) // glazed upper lip
  ctx.fillStyle = pal.rigDark
  gearFineRect(ctx, ox, oy, x, 18, wide, 0.5)
  for (var i = 2; i < wide; i += 5) gearFineRect(ctx, ox, oy, x + i, 15, 0.5, 2.5)
}

function drawTrickChainFine(ctx, w, pal, ag, ox, oy, dir, robe, hair, fr) {
  for (var i = 0; i < 5; i++) {
    var x = 4 + dir * i * 7, y = -2 - (i % 2) * 2
    ctx.fillStyle = hair
    gearFineRect(ctx, ox, oy, x + 0.5, y + 0.5, 2.5, 0.5)
    ctx.fillStyle = pal.rigDark
    gearFineRect(ctx, ox, oy, x + 1, y + 2, 2, 0.5) // inset bubble edges
  }
}

function drawTrickStackFine(ctx, w, pal, ag, ox, oy, dir, robe, hair, fr) {
  var rungs = Math.min(7, 1 + Math.floor(fr.reach * 7))
  var x = fr.tx - ox + dir * 2 - (dir < 0 ? 5 : 0)
  for (var i = 0; i < rungs; i++) {
    var y = 12 - i * 5
    ctx.fillStyle = hair
    gearFineRect(ctx, ox, oy, x + 0.5, y, 5, 0.5) // tread lip
    ctx.fillStyle = pal.rigDark
    gearFineRect(ctx, ox, oy, x + 0.5, y + 1, 0.5, 0.5)
    gearFineRect(ctx, ox, oy, x + 5, y + 1, 0.5, 0.5) // fixings
  }
}

function drawTrickSapFine(ctx, w, pal, ag, ox, oy, dir, robe, hair, fr) {
  ctx.fillStyle = hair
  for (var i = 0; i < 4; i++) {
    var x = fr.tx - ox + dir * (5 + i * 5) - (dir < 0 ? 4 : 0)
    gearFineRect(ctx, ox, oy, x + 0.5, 1 + i * 4, 2, 0.5) // terminal strokes
  }
}

// A standard diving dress of about 1870: a spherical copper helmet with one
// round front port and a bolted collar, on top of the same suit everybody else
// is wearing. It replaces the head rather than sitting over it, because the
// helmet IS the silhouette down here — on dry land what carries an agent
// against a dark board is the pale face over the white collar, and there is no
// face to see through six inches of copper. So the helmet takes that job: it
// is the only warm colour in the biome, which makes a colony of them read at a
// glance against water that is entirely blue-green.
//
// The port faces the way the agent is going. That is the one piece of
// information the head used to carry with its nose and lens, and it has to
// survive the change or a colony walking left looks exactly like a colony
// walking right.
// Fin edges and seams ride the same kick as drawPoseSwim, including the
// offset between its two legs and the lean of the trailing sleeve.
function drawFineSwim(ctx, pal, ag, ox, oy, dir) {
  var kick = Math.sin(ag.anim * 0.22), lift = Math.round(kick * 1.2)
  var lean = ag.state === "swim" ? (ag.swimUp ? -1 : 1) : 0
  ctx.fillStyle = pal.lapel
  blitFine(ctx, ox, oy, dir, 0.5, 8.5 + lift + lean, 1, 0.5)  // swept-back cuff
  blitFine(ctx, ox, oy, dir, 2.5, 13 + lift, 0.5, 2)          // trouser seams
  blitFine(ctx, ox, oy, dir, 4.5, 13 + lift + (kick > 0 ? 1 : -1), 0.5, 2)
  ctx.fillStyle = pal.eye
  blitFine(ctx, ox, oy, dir, 0.5, 15.5 + lift + (kick > 0 ? 1 : 0), 2, 0.5)
  blitFine(ctx, ox, oy, dir, 0.5, 16.5 + lift + (kick > 0 ? 0 : 1), 2, 0.5)
}

// The diver at res 2 (the dry-land detail is drawAgentFine): rivets round
// the collar, a dark ring framing the port and two bars of grille across it,
// a second highlight following the helmet's curve, and a weight belt with
// its lead blocks — the suit is what keeps a diver on the floor.
function drawDiverFine(ctx, pal, ag, ox, oy, dir, drop) {
  ctx.fillStyle = pal.helmetLit
  for (var r = 1.5; r < 7; r += 1.5) blitFine(ctx, ox, oy, dir, r, 6.25 + drop, 0.5, 0.5)   // rivets
  blitFine(ctx, ox, oy, dir, 1.5, 2 + drop, 0.5, 1.5)                                     // the curve
  ctx.fillStyle = pal.helmetDark
  blitFine(ctx, ox, oy, dir, 3.5, 2 + drop, 0.5, 3)                                       // port ring
  blitFine(ctx, ox, oy, dir, 4, 5 + drop, 2, 0.5)
  blitFine(ctx, ox, oy, dir, 4, 3 + drop, 2, 0.5)                                         // grille
  blitFine(ctx, ox, oy, dir, 4, 4 + drop, 2, 0.5)
  ctx.fillStyle = "#1c1c22"
  blitFine(ctx, ox, oy, dir, 1, 11.5 + drop, 6, 1)                                        // weight belt
  ctx.fillStyle = "#6a6f7a"
  blitFine(ctx, ox, oy, dir, 1.5, 11.5 + drop, 1, 1); blitFine(ctx, ox, oy, dir, 5.5, 11.5 + drop, 1, 1)
  if (ag.state === "walk" || ag.state === "swim") drawFineSwim(ctx, pal, ag, ox, oy, dir)
}

function drawDiverHead(ctx, w, pal, ag, ox, oy, dir, drop) {
  // Built row by row rather than as one rectangle, because the corners are the
  // whole difference between a copper sphere and a brass brick: the first
  // version was a 6x7 block and read as a blond square with a window in it.
  ctx.fillStyle = pal.helmetDark
  blit(ctx, ox, oy, dir, 2, 0 + drop, 4, 1)            // narrow crown
  blit(ctx, ox, oy, dir, 1, 1 + drop, 6, 5)            // the full round of it
  ctx.fillStyle = pal.helmet
  blit(ctx, ox, oy, dir, 3, 0 + drop, 2, 1)
  blit(ctx, ox, oy, dir, 2, 1 + drop, 4, 4)            // the lit body
  ctx.fillStyle = pal.helmetLit
  blit(ctx, ox, oy, dir, 3, 0 + drop, 1, 1)            // the crown highlight
  blit(ctx, ox, oy, dir, 2, 1 + drop, 1, 1)

  // The front port, and a glint in it. Two pixels of pale blue-white is all
  // the glass there is room for, and it is what stops the helmet reading as a
  // brass ball.
  ctx.fillStyle = pal.port
  blit(ctx, ox, oy, dir, 4, 2 + drop, 2, 3)
  blit(ctx, ox, oy, dir, 3, 3 + drop, 1, 1)
  ctx.fillStyle = pal.bubbleLit
  blit(ctx, ox, oy, dir, 4, 2 + drop, 1, 1)            // the glint on the glass

  // The bolted collar the helmet screws down onto, and the air hose leaving
  // the back of it. The hose is what says the suit is fed from somewhere and
  // is the one line on the sprite that trails, so it also reads as motion.
  ctx.fillStyle = pal.helmetDark
  blit(ctx, ox, oy, dir, 1, 6 + drop, 6, 1)
  ctx.fillStyle = pal.airline
  var hoseWave = Math.sin(ag.anim * 0.18) * 1.4
  blit(ctx, ox, oy, dir, 0, 4 + drop, 1, 1)
  blit(ctx, ox, oy, dir, -1, 4 + drop + Math.round(hoseWave), 1, 1)
  blit(ctx, ox, oy, dir, -2, 5 + drop + Math.round(hoseWave * 1.6), 1, 1)
}

// Exhaust. Every diver on the board is breathing, so every diver trails a
// column of bubbles that wobbles as it climbs and gets bigger as the pressure
// drops — which is the only thing on the board that reports depth continuously
// and the reason the biome reads as under water even in a still frame.
//
// Derived from the agent's id and the tick rather than stored, for the same
// reason the fish are: scenery with state is scenery with bugs. The id offsets
// the phase so fifteen divers are not one diver drawn fifteen times.
function drawDiverBubbles(ctx, w, pal, ag, ox, oy, drop) {
  var phase = w.ticks * 0.9 + ag.id * 41
  for (var b = 0; b < 4; b++) {
    // Each bubble climbs its own 40-tick cycle and starts again at the helmet.
    var life = ((phase + b * 27) % 108) / 108
    var rise = life * 26
    var wob = Math.sin(life * 7 + ag.id) * 2.5
    // Bigger as it rises: gas expands on the way up, and it is a two-pixel
    // difference that nonetheless makes the column look like it is going
    // somewhere rather than scrolling.
    var size = life > 0.62 ? 2 : 1
    ctx.globalAlpha = 0.65 * (1 - life * 0.75)
    ctx.fillStyle = life > 0.5 ? pal.bubbleLit : pal.bubble
    ctx.fillRect(Math.round(ox + 2 + wob), Math.round(oy + drop - rise), size, size)
  }
  ctx.globalAlpha = 1
}

function drawAgent(ctx, w, pal, ag, opts) {
  if (ag.state === "hooked") return drawHookedAgent(ctx, w, pal, ag, opts)
  var k = w.k
  var C = k.CELL
  var ox = Math.round(ag.x * C) - SPRITE_W / 2
  var dir = ag.dir
  var st = ag.state
  // At page resolution the body stays outside the face, with palms on it.
  if ((w.res || 1) >= 2 && st === "climb" && !libraryShelfPose(w, ag))
    ox += dir * (climbContacts(w, ag, ox, dir).x - 8)
  // A rider hangs off the car's own position, not its stale one: agents step
  // before lifts within a tick, so ag.y trails a descending car by a whole
  // LIFT_SPEED and the sprite floats above the floor plate. Stair riders walk
  // themselves, so they keep their own coordinates. (`st` is read here, which
  // is why it is assigned above: with the assignment below it, the var was
  // hoisted-but-undefined and a rider never took this branch at all.)
  var rideCar = st === "ride" && w.lifts && w.lifts[ag.liftIx] && !w.lifts[ag.liftIx].stairs
  var oy = rideCar
    ? Math.round(w.lifts[ag.liftIx].car * C) - SPRITE_PX
    : Math.round((ag.y + 1) * C) - SPRITE_PX
  oy += eventFloatBob(w, ag)

  if (st === "saved") {
    // A short rise and fade into the portal, so getting home reads as an
    // arrival rather than an agent simply blinking out.
    ctx.globalAlpha = Math.max(0, 1 - ag.fade / 14)
    oy -= ag.fade + (ag.fade < 7 ? Math.round(Math.sin(ag.fade / 7 * Math.PI) * 2) : 0)
  }

  var colors = agentDrawColors(w, pal, ag, st)
  var robe = colors.robe, hair = colors.hair, skin = colors.skin

  drawAgentEffects(ctx, w, pal, ag, ox, oy, dir, hair, st, C)

  drawUmbrella(ctx, w, pal, ag, ox, oy, st)

  // Ada Blocker's plate. Drawn in front of the body on the side it is facing,
  // tall enough to cover an agent standing behind it, with the lee it protects
  // marked by a faint bar along the floor — otherwise the one thing the shield
  // does for everybody else is invisible, and looks like an agent carrying a
  // door for its own reasons.
  drawShieldPlate(ctx, pal, ag, ox, oy, dir, robe, hair, skin, w.k.CELL)

  // Something stopped on the plate: a hard spark at the point of impact, and
  // three shards coming off it. This is the only feedback that the shield did
  // anything at all, so it is deliberately louder than the plate itself.
  drawShieldSpark(ctx, pal, ag, ox, oy, dir, hair)

  // The trick: a flash of whatever it is doing, thrown out in front. Each act
  // gets its own shape for the same reason each danger does — a special you
  // cannot tell from the last one is the same special.
  drawAgentTrick(ctx, w, pal, ag, ox, oy, dir, robe, hair)
  if (ag.throttleFor > 0) drawThrottleSignal(ctx, pal, ag, ox, oy, dir, robe)
  drawReleaseRing(ctx, pal, ag, ox, oy, w.ticks)
  if (ag.netFor > 0) drawNetThrow(ctx, w, ag, ox, oy, dir, hair)
  if (ag.reloadFor > 0) drawReloadSign(ctx, ag, ox, oy, hair)
  if (ag.debugFor > 0) drawDuck(ctx, ag, ox, oy, dir)
  drawCampShot(ctx, w, pal, ag, ox, oy, dir, st, w.k.CELL)

  // No special borrows the colony's umbrella. At a lethal height each carries
  // a device with its own silhouette; the movement is deliberately readable
  // at panel scale before the label has to explain it.
  drawAgentHeightGear(ctx, w, pal, ag, ox, oy, dir, robe, hair)
  var heightBodySaved = drawAgentTransform(ctx, ag, ox, oy, st)

  // Upside down: the whole sprite is mirrored vertically, so the one that
  // walks on ceilings reads as hanging rather than as floating.
  spriteFlip = (st === "ceil")

  // The walk cycle, worked out up here because the head rides it. On the
  // passing frames, legs together, the body is at the top of its stride and
  // everything above the hips comes up a pixel; for a few ticks after a real
  // drop it goes the other way, knees taking the landing.
  var idle = agentIdle(w, ag)
  var motion = agentDrawMotion(w, ag, st, idle)
  var walkLead = motion.lead, squash = motion.squash, bodyDrop = motion.drop

  drawAgentHead(ctx, w, pal, ag, ox, oy, dir, hair, skin, st, bodyDrop)

  // Shoulder line. A dark suit has to sit on a dark board: too light and it is
  // not a suit, too dark and the agent is a face floating in a corridor. What
  // makes it read either way is one lighter pixel row along the top of the
  // torso — the sprite carries its own edge instead of borrowing contrast from
  // whatever happens to be behind it.
  var lapel = ag.special ? hair : pal.lapel

  // --- body + limbs ------------------------------------------------------
  ctx.fillStyle = robe
  // (the shoulder line is laid over the torso once it is drawn, below)

  drawAgentBody(ctx, w, pal, ag, ox, oy, dir, robe, skin, st, bodyDrop, walkLead, squash, idle)

  // --- bomber countdown --------------------------------------------------
  if (st === "bomb") {
    ctx.fillStyle = pal.urgent
    ctx.font = "bold 9px monospace"
    ctx.textAlign = "center"
    ctx.fillText(String(Math.ceil(ag.fuse / 30)), ox + SPRITE_W / 2, oy - 3)
  }

  // The shoulder tips, laid over whichever torso the pose drew. A full lighter
  // row across the chest was the first attempt and it read as a bib: with the
  // white shirt directly under it the whole front of the agent went pale. Two
  // pixels at the corners give the same edge and leave the middle to the shirt.
  // Upright poses only — on a slide or a sprawl the shoulders are not up there.
  if (st !== "saved" && st !== "slide" && st !== "stunned" && st !== "webup") {
    ctx.fillStyle = lapel
    blit(ctx, ox, oy, dir, 1, 7 + bodyDrop, 1, 1)
    blit(ctx, ox, oy, dir, 6, 7 + bodyDrop, 1, 1)
  }

  drawAgentDetail(ctx, w, pal, ag, ox, oy, dir, bodyDrop, walkLead, squash, robe, idle)
  drawIdleGesture(ctx, w, pal, ag, ox, oy, dir, robe, bodyDrop, idle)

  if (libraryShelfPose(w, ag)) drawShelfGrip(ctx, w, pal, ag, ox, oy, dir, robe)

  drawAgentMarks(ctx, w, pal, ag, ox, oy, dir, st, bodyDrop)

  if (heightBodySaved) ctx.restore()

  drawAgentLabel(ctx, w, pal, ag, ox, oy, st, opts)

  ctx.globalAlpha = 1
}

function agentDrawColors(w, pal, ag, st) {
  var robe = pal.robe
  var hair = pal.hair
  var skin = pal.skin

  // A special wears its own colours. Every other agent on the board is the same
  // green and blue on purpose — the silhouette is the joke — so the one that
  // isn't reads as the one that isn't from across the room, which is the entire
  // requirement. It also carries a bright pip on the shoulder, because at this
  // size a robe colour alone is a few pixels and easy to miss on a busy board.
  if (ag.special) {
    var sp = w.specialSpec
    if (sp) { robe = sp.robe; hair = sp.hair }
  }

  if (st === "bomb") {
    // Flash between the theme's urgent color and white on the last seconds.
    var fast = ag.fuse < 40
    var on = Math.floor(ag.fuse / (fast ? 3 : 7)) % 2 === 0
    robe = on ? pal.urgent : pal.robe
    hair = on ? pal.urgent : pal.hair
    skin = on ? "#ffffff" : pal.skin
  }

  return { robe: robe, hair: hair, skin: skin }
}

function agentDrawMotion(w, ag, st, idle) {
  var walkLead = [0, 1, 0, -1][(ag.anim >> 2) % 4]
  var squash = st === "walk" ? landSquash(w, ag) : 0
  var bob = st === "walk" && !w.submerged && !squash && walkLead === 0 ? 1 : 0
  var bodyDrop = st === "slide" ? 4 : ((st === "dig" || st === "camp") ? 2 : squash - bob)

  if (idle && st === "walk") { walkLead = 0; squash = 0; bodyDrop = 0 }
  if ((w.res || 1) >= 2 && st === "bomb") bodyDrop = bombCrouch(ag)

  return { lead: walkLead, squash: squash, drop: bodyDrop }
}

function drawAgentDetail(ctx, w, pal, ag, ox, oy, dir, drop, lead, squash, robe, idle) {
  if ((w.res || 1) < 2) return
  if (!w.submerged) {
    if (idle) drawIdleFine(ctx, pal, ag, ox, oy, dir, drop, idle, w)
    else drawAgentFine(ctx, pal, ag, ox, oy, dir, drop, lead, squash, robe, w)
  } else if (ag.state !== "saved") {
    var swimming = !idle && (ag.state === "walk" || ag.state === "swim")
    drawDiverFine(ctx, pal, ag, ox, oy, dir, drop + (swimming ? Math.round(Math.sin(ag.anim * 0.22) * 1.2) : 0) - (idle && idle.pose === "glance" ? 1 : 0))
  }
  drawTraitDetail(ctx, w, pal, ag, ox, oy, dir, drop, lead, idle)
  drawWorkTools(ctx, w, pal, ag, ox, oy, dir)
  drawSkillDetail(ctx, w, pal, ag, ox, oy, dir)
}

function drawAgentEffects(ctx, w, pal, ag, ox, oy, dir, hair, st, C) {
  // A degraded copy keeps the palette but loses fidelity generation by
  // generation. Missing pixels and displaced fragments read more clearly at
  // this scale than simply tinting it a different colour.
  if (ag.modelGen > 0) {
    ctx.globalAlpha = Math.max(0.42, 1 - ag.modelGen * 0.16)
    ctx.fillStyle = hair
    for (var mg = 0; mg < ag.modelGen + 1; mg++)
      ctx.fillRect(ox - 2 + ((ag.id + mg * 5) % 13), oy + ((ag.anim + mg * 7) % 16), 1, 1)
  }

  if (st === "stunned") {
    ctx.fillStyle = pal.warn
    ctx.fillRect(ox + 1 + ((ag.stunFor >> 2) % 6), oy - 3, 2, 2)
    ctx.fillRect(ox + 6 - ((ag.stunFor >> 3) % 5), oy - 6, 1, 1)
  }

  if (ag.special && w.specialSpec && w.specialSpec.act === "complete" && ag.shotFor > 0) {
    ctx.fillStyle = hair
    var cursorX = Math.round(ag.specialX * C)
    var cursorY = Math.round((ag.specialY + 1) * C) - 8
    ctx.fillRect(cursorX, cursorY, 2, 9)
    for (var trail = 0; trail < 4; trail++)
      ctx.fillRect(cursorX - dir * (trail * 5 + 3), cursorY + 10, 3, 1)
  }

  drawAgentRopes(ctx, w, pal, ag, ox, oy, dir, hair, st, C)
}

function drawAgentRopes(ctx, w, pal, ag, ox, oy, dir, hair, st, C) {
  // The crawler's web stays fixed to the roof while the sprite descends. Draw
  // it behind the body so the raised hand appears to be holding the line.
  if (st === "rappel") {
    ctx.fillStyle = ag.special ? hair : pal.umbrellaStem
    var ropeX = Math.round(ag.x * C)
    var ropeTop = Math.round((ag.ropeY + 1) * C)
    var ropeBottom = oy + 7
    ctx.fillRect(ropeX, ropeTop, 1, Math.max(1, ropeBottom - ropeTop))
  }


  if (st === "webup") {
    ctx.fillStyle = ag.special ? hair : pal.umbrellaStem
    var webAnchorX = Math.round(ag.specialX * C)
    var webAnchorY = Math.round((ag.specialY + 1) * C)
    var webHandX = Math.round(ag.x * C)
    var webHandY = oy + 5
    var webSteps = Math.max(1, Math.round(Math.max(Math.abs(webAnchorX - webHandX), Math.abs(webAnchorY - webHandY))))
    for (var ws = 0; ws <= webSteps; ws++)
      ctx.fillRect(Math.round(webHandX + (webAnchorX - webHandX) * ws / webSteps),
                   Math.round(webHandY + (webAnchorY - webHandY) * ws / webSteps), 1, 1)
  }

}

function drawAgentTransform(ctx, ag, ox, oy, st) {
  var heightBodySaved = st === "height" && (ag.heightMode === "cushion" || ag.heightMode === "helicopter")
  if (heightBodySaved) {
    ctx.save()
    if (ag.heightMode === "cushion") {
      var salto = ag.heightTicks ? Math.max(0, (ag.heightTick / ag.heightTicks - 0.18) / 0.82) : 0
      salto = Math.min(1, salto)
      // Eased, not linear. Turning at a constant rate the whole way down is
      // what made this read as a plank being rotated rather than somebody
      // throwing a salto: a flip is slow off the lip, quick through the
      // middle and slow again into the landing, and it is the two slow ends
      // that sell the push-off and the spotting of the ground.
      var spin = salto * salto * salto * (salto * (salto * 6 - 15) + 10)
      ctx.translate(ox + SPRITE_W / 2, oy + SPRITE_PX / 2)
      ctx.rotate(spin * Math.PI * 2)
      ctx.translate(-ox - SPRITE_W / 2, -oy - SPRITE_PX / 2)
    } else {
      // The cabin drawn above replaces the ordinary body completely.
      ctx.globalAlpha = 0
    }
  }

  return heightBodySaved
}

function drawAgentHead(ctx, w, pal, ag, ox, oy, dir, hair, skin, st, bodyDrop) {
  var idle = agentIdle(w, ag)
  if (idle && idle.pose === "glance") bodyDrop--
  // --- hair + head -------------------------------------------------------
  // Which way it is looking has to survive the shades. The old sprite said it
  // with one eye pixel sitting on the leading side; a band across the whole
  // face is symmetrical and says nothing at all. So the head gets a front and
  // a back instead: hair bulging behind, and brow, lens and nose stepping out
  // in front. Three pixels, but they are the three that make a colony walking
  // left look different from a colony walking right.
  //
  // Under water the whole head is replaced by the helmet — see drawDiverHead.
  // The bubbles go on before it so they leave from behind the crown.
  if (w.submerged && st !== "saved") {
    // The helmet rides the kick with the torso, off the same sine as the legs
    // below: a head that stays level while the body bobs has come off.
    var headLift = !agentIdleKind(ag) && (st === "walk" || st === "swim")
      ? Math.round(Math.sin(ag.anim * 0.22) * 1.2) : 0
    drawDiverBubbles(ctx, w, pal, ag, ox, oy, bodyDrop + headLift)
    drawDiverHead(ctx, w, pal, ag, ox, oy, dir, bodyDrop + headLift)
  } else {
    drawAgentDryHead(ctx, w, pal, ag, ox, oy, dir, hair, skin, bodyDrop)
  }

  // --- collar ------------------------------------------------------------
  // Drawn before the body so each pose's own torso closes over it, leaving a
  // white notch at the throat. One mark, and it works in every pose, which a
  // shirt front painted per-pose would not: there are a dozen torsos below.
  if (st !== "saved") {
    ctx.fillStyle = pal.shirt
    var collarLift = (!agentIdleKind(ag) && w.submerged && (st === "walk" || st === "swim"))
      ? Math.round(Math.sin(ag.anim * 0.22) * 1.2) : 0
    blit(ctx, ox, oy, dir, 3, 6 + bodyDrop + collarLift, 2, 4)
  }

}

function drawAgentDryHead(ctx, w, pal, ag, ox, oy, dir, hair, skin, bodyDrop) {
  var look = traitHeadOffset(w, ag)
  var pixel = agentTraitLook(w, ag) ? blitFine : blit
  ox += dir * look.x
  bodyDrop += look.y
  ctx.fillStyle = hair
  pixel(ctx, ox, oy, dir, 2, 0 + bodyDrop, 4, 3)
  pixel(ctx, ox, oy, dir, 0, 1 + bodyDrop, 2, 3)        // the back of the head

  ctx.fillStyle = skin
  pixel(ctx, ox, oy, dir, 2, 3 + bodyDrop, 4, 4)
  pixel(ctx, ox, oy, dir, 6, 5 + bodyDrop, 1, 1)        // the nose

  // Shades, not an eye. A band reads as somebody wearing something, which is
  // the difference between a little person and an agent. It runs one pixel out
  // over the nose, so the glasses lead the face the way glasses do.
  ctx.fillStyle = pal.eye
  pixel(ctx, ox, oy, dir, 2, 4 + bodyDrop, 5, 1)
  ctx.fillStyle = pal.lens
  pixel(ctx, ox, oy, dir, 5, 4 + bodyDrop, 1, 1)        // the lit lens, in front
}

function drawAgentMarks(ctx, w, pal, ag, ox, oy, dir, st, bodyDrop) {
  // A pip on the shoulder in the special's second colour. The robe alone is a
  // handful of pixels on a board that already has a lot going on.
  if (ag.special && st !== "saved") {
    var psp = w.specialSpec
    ctx.fillStyle = psp ? psp.hair : pal.label
    blit(ctx, ox, oy, dir, 1, 5 + bodyDrop, 2, 2)
  }

  if (ag.wounds > 0 && st !== "saved") {
    ctx.fillStyle = pal.blood
    blit(ctx, ox, oy, dir, 5, 8, 2, 3)
  }

  // Nothing at all for the first two thirds of an incubation — that is the
  // point of it. Then something under the skin starts keeping its own time,
  // and it is deliberately small: the reward for watching one agent closely
  // rather than a klaxon that plays the ending early.
  if (ag.infected > 0 && ag.infected < w.k.INCUBATION_TELL && st !== "saved") {
    var pulse = 0.35 + 0.45 * Math.sin(w.ticks * 0.32)
    if (pulse > 0.45) {
      ctx.globalAlpha = Math.min(1, (w.k.INCUBATION_TELL - ag.infected) / 60) * pulse
      ctx.fillStyle = "#7de37a"
      blit(ctx, ox, oy, dir, 3, 9, 2, 2)
      ctx.globalAlpha = 1
    }
  }

}

function drawAgentLabel(ctx, w, pal, ag, ox, oy, st, opts) {
  // --- optional label ----------------------------------------------------
  // What it's doing when it's doing something, and who it is the rest of the
  // time. The trait is the more interesting half: watching two agents reach
  // the same ledge and disagree about it only reads as personality once you
  // can see which one is the cautious one.
  if (opts && opts.labels && st !== "saved") {
    // An agent in somebody's lee is doing something no pose can show: walking
    // through ground it would otherwise have turned round at. A special keeps
    // its name — it is the one holding the plate, and the name says so.
    var action = ag.coveredFor > 0 && !ag.special ? "covered" : actionLabel(st)
    // A special is named rather than described. Its personality never comes up
    // — it cannot use the toolbar, so the choices a trait would colour are not
    // choices it gets to make — and the name is the useful thing to know.
    var nsp = ag.special ? w.specialSpec : null
    var text = nsp ? nsp.name : (action !== "" ? action : (ag.trait || ""))
    if (text !== "") {
      ctx.fillStyle = nsp ? nsp.robe : (action !== "" ? pal.label : pal.labelFaint)
      ctx.font = "7px monospace"
      ctx.textAlign = "center"
      ctx.fillText(text, ox + SPRITE_W / 2, oy - 4)
    }
  }

}

function actionLabel(st) {
  if (st === "climb") return "climb"
  if (st === "build") return "build"
  if (st === "bash") return "bash"
  if (st === "dig") return "dig"
  if (st === "block") return "block"
  if (st === "bomb") return "bomb"
  if (st === "jump") return "hop"
  if (st === "ceil") return "ceiling"
  if (st === "rappel") return "rappel"
  if (st === "height") return "height move"
  if (st === "webup") return "web climb"
  if (st === "stunned") return "wounded"
  if (st === "trick") return "!"
  if (st === "camp") return "camped"
  return ""
}

// Library: quiet stacks behind the walkable shelves. Back shades keep the
// distant books from being mistaken for terrain; placement uses only the level.
function backLibrary(ctx, r, b, pal) {
  for (var x = -8; x < b.w; x += 30) {
    ctx.fillStyle = pal.backDim
    ctx.fillRect(x, b.y, 25, b.h)
    ctx.fillStyle = pal.backLit
    ctx.fillRect(x, b.y, 2, b.h)
    ctx.fillRect(x + 23, b.y, 2, b.h)
    for (var y = b.y + 9; y < b.y + b.h - 8; y += 12) {
      ctx.fillStyle = pal.backLit
      ctx.fillRect(x + 2, y + 7, 21, 1)
      for (var book = 3; book < 22; book += 3) {
        var h = 3 + Math.floor(r() * 4)
        ctx.fillStyle = book % 2 ? pal.back : pal.backLit
        ctx.fillRect(x + book, y + 7 - h, 2, h)
      }
    }
  }
}

function backLibraryFine(ctx, b, pal) {
  ctx.fillStyle = pal.backDim
  ctx.fillRect(b.x + b.w - 0.5, b.y + 0.5, 0.5, b.h - 0.5)
  if (b.w > 1 && b.h > 2) {
    ctx.fillStyle = pal.backLit
    ctx.fillRect(b.x + 0.5, b.y + 1.5, b.w - 1, 0.5) // far spine's label
  }
}

// Cloth bindings, faded rather than luminous. Hash each cell and book, never
// Math.random: a repaint after digging must leave every remaining spine alone.
var LIBRARY_BINDINGS = ["#79504a", "#52655b", "#526079", "#8a734f", "#705971", "#93836b"]
function drawLibraryStacks(ctx, w, pal) {
  var k = w.k, C = k.CELL, fine = (w.res || 1) >= 2
  for (var y = k.SKY; y < k.ROWS; y++) for (var x = 0; x < k.COLS; x++) {
    var m = w.terrain[y * k.COLS + x], px = x * C, py = y * C
    if (m === k.ORE) drawLibraryBooks(ctx, pal, px, py, C, ((x * 73856093) ^ (y * 19349663)) >>> 0, fine)
    else if (m === k.DIRT) {
      ctx.fillStyle = pal.dirtShade
      ctx.fillRect(px + 2, py, fine ? 0.5 : 1, C) // timber grain down the upright
    } else if (m === k.ROCK) {
      ctx.fillStyle = pal.dirt
      ctx.fillRect(px, py + 1, C, C - 1) // timber board over its structural rock
      ctx.fillStyle = pal.dirtEdge
      ctx.fillRect(px, py, C, fine ? 0.5 : 1)
    }
  }
}

function drawLibraryBooks(ctx, pal, px, py, C, hash, fine) {
  ctx.fillStyle = pal.oreShade
  ctx.fillRect(px, py, C, C)
  var width = fine ? 1 : 2, gap = fine ? 0.5 : 1
  for (var b = 0; b < C; b += width + gap) {
    var n = (hash >>> (b * 2)) + b * 7
    var h = fine ? 2 + (n % 4) * 0.5 : 2 + n % 2
    ctx.fillStyle = LIBRARY_BINDINGS[n % LIBRARY_BINDINGS.length]
    ctx.fillRect(px + b, py + C - h, Math.min(width, C - b), h)
    ctx.fillStyle = pal.oreEdge
    if (fine) ctx.fillRect(px + b, py + C - 1, width, 0.5) // gilt title band
  }
}

function drawLibraryDecor(ctx, pal, d, x, y, C) {
  var base = y + C
  if (d.kind === "spire") {
    var h = fineSpireHeight(d)
    ctx.fillStyle = pal.dirtEdge
    ctx.fillRect(x, base - h, 1, h); ctx.fillRect(x + 5, base - h, 1, h)
    for (var r = 2; r < h; r += 3) ctx.fillRect(x + 1, base - r, 4, 1)
    ctx.fillStyle = pal.decorDim
    ctx.fillRect(x - 1, base - 1, 2, 1); ctx.fillRect(x + 5, base - 1, 2, 1)
  } else if (d.kind === "clump") {
    for (var b = 0; b < 2 + d.size; b++) {
      ctx.fillStyle = LIBRARY_BINDINGS[(d.seed + b) % LIBRARY_BINDINGS.length]
      ctx.fillRect(x + b % 2, base - 2 - b * 2, 6 - b % 2, 2)
      ctx.fillStyle = pal.decorLit
      ctx.fillRect(x + 1 + b % 2, base - 1 - b * 2, 4 - b % 2, 1)
    }
  } else drawLibraryLamp(ctx, pal, x, d.kind === "hang" ? y + 5 : base - 6, d.kind === "hang" ? y : base)
}

function drawLibraryLamp(ctx, pal, x, shade, anchor) {
  ctx.fillStyle = pal.decorDim
  ctx.fillRect(x + 2, Math.min(shade, anchor), 1, Math.abs(anchor - shade))
  ctx.fillStyle = pal.decor
  ctx.fillRect(x, shade, 5, 2); ctx.fillRect(x - 1, shade + 2, 7, 1)
  ctx.fillStyle = pal.oreEdge
  ctx.fillRect(x, shade + 3, 5, 1)
  if (anchor > shade) { ctx.fillStyle = pal.decorDim; ctx.fillRect(x, anchor - 1, 5, 1) }
}

function fineLibraryLadder(ctx, pal, d, x, base) {
  var h = fineSpireHeight(d)
  ctx.fillStyle = pal.decorLit
  ctx.fillRect(x + 0.5, base - h, 0.5, h)
  for (var r = 2; r < h; r += 3) ctx.fillRect(x + 1, base - r, 4, 0.5)
}
function fineLibraryPile(ctx, pal, d, x, base) {
  ctx.fillStyle = pal.decorDim
  for (var b = 0; b < 2 + d.size; b++) ctx.fillRect(x + 2 + b % 2, base - 1 - b * 2, 3 - b % 2, 0.5)
}
function fineLibraryLamp(ctx, pal, d, x, base, top) {
  var shade = d.kind === "hang" ? top + 5 : base - 6
  ctx.fillStyle = pal.decorLit
  ctx.fillRect(x + 0.5, shade + 0.5, 3.5, 0.5)
  ctx.fillStyle = pal.dust
  ctx.fillRect(x + 1, shade + 3, 3, 0.5)
}

// An oak arch, with card catalogue drawers in the jambs and a quiet plaque.
function drawExitLibrary(ctx, pal, x, y, ww, hh) {
  ctx.fillStyle = pal.dirt
  ctx.fillRect(x - 5, y - 2, 4, hh + 2); ctx.fillRect(x + ww + 1, y - 2, 4, hh + 2)
  for (var r = 0; r < 4; r++) ctx.fillRect(x - 5 + r, y - 3 - r, ww + 10 - r * 2, 1)
  ctx.fillStyle = pal.dirtEdge
  ctx.fillRect(x - 6, y + hh - 1, ww + 12, 1)
  ctx.fillRect(x - 2, y - 10, ww + 4, 4)
  ctx.fillStyle = pal.hatchMouth
  ctx.font = "bold 3px monospace"; ctx.textAlign = "center"
  ctx.fillText("SILENCE", x + ww / 2, y - 7)
  ctx.textAlign = "left"
}
function drawExitLibraryFine(ctx, pal, x, y, ww, hh) {
  ctx.fillStyle = pal.oreEdge
  for (var r = 0; r < 4; r++) ctx.fillRect(x - 4.5 + r, y - 2.5 - r, ww + 9 - r * 2, 0.5)
  ctx.fillRect(x - 1.5, y - 9.5, ww + 3, 0.5)
  for (var j = 0; j < 2; j++) {
    var dx = j ? x + ww + 1 : x - 5
    for (var drawer = y; drawer + 3 < y + hh; drawer += 4) {
      ctx.fillStyle = pal.dirtShade
      ctx.fillRect(dx + 0.5, drawer + 3, 3, 0.5)
      ctx.fillStyle = pal.oreEdge
      ctx.fillRect(dx + 1, drawer + 1, 2, 0.5)
    }
  }
}
function drawLibraryBoothTop(ctx, pal, x, y) {
  ctx.fillRect(x - 10, y - 18, 20, 3)
  ctx.fillStyle = pal.oreEdge
  for (var b = 0; b < 4; b++) {
    ctx.fillRect(x - 8 + b * 4, y - 22 + b % 2, 3, 4 - b % 2)
    ctx.fillStyle = pal.dirtEdge
  }
}
function drawMoteLibraryFine(ctx, w, pal, x, y) {
  moteFineRect(ctx, w, x, y, 0.5, 0.5)
  moteFineRect(ctx, w, x + 0.5, y + 0.5, 0.5, 0.5)
}

// No extra simulation flag: read the book face beside the climbing body.
// A paid climb on bare wood and a downward climb keep their usual pose. Shelves get a side-on grip and knees braced against the books.
function libraryShelfPose(w, ag) {
  if (w.biome !== "Library" || ag.state !== "climb" || ag.climbDown) return false
  var k = w.k, x = Math.floor(ag.x) + ag.dir, y = Math.floor(ag.y)
  var face = w.terrain[y * k.COLS + x]
  return face === k.ORE || (face === k.ROCK && w.terrain[(y + 1) * k.COLS + x] === k.ORE)
}
function drawPoseShelf(ctx, w, pal, ag, ox, oy, dir, robe) {
  blit(ctx, ox, oy, dir, 2, 7, 4, 6)
  var reach = (ag.anim >> 3) % 2
  blit(ctx, ox, oy, dir, 5, 5 + reach * 3, 3, 2)
  blit(ctx, ox, oy, dir, 2, 12, 2, 4)
  blit(ctx, ox, oy, dir, 4, 12 - reach, 4, 2) // knee lifted onto a shelf
}
function drawShelfGrip(ctx, w, pal, ag, ox, oy, dir, robe) {
  var k = w.k, C = k.CELL, wall = (Math.floor(ag.x) + ag.dir + (dir < 0 ? 1 : 0)) * C
  var hand = oy + 5 + ((ag.anim >> 3) % 2) * 3
  // Grip the nearest actual shelf board above the waist, within arm's reach.
  for (var row = Math.floor((oy + 3) / C); row <= Math.floor((oy + 11) / C); row++) {
    var cell = Math.floor(ag.x) + dir
    if (w.terrain[row * k.COLS + cell] === k.ROCK) { hand = row * C; break }
  }
  ctx.fillStyle = robe
  ctx.fillRect(Math.min(ox + 4, wall), hand + 1, Math.abs(wall - ox - 4) + 1, 1)
  ctx.fillStyle = pal.skin
  ctx.fillRect(wall - (dir > 0 ? 1 : 0), hand, 2, 1)
  if ((w.res || 1) >= 2) {
    ctx.fillStyle = pal.shirt
    ctx.fillRect(wall - dir, hand + 1, 1, 0.5)
    ctx.fillStyle = pal.eye
    blitFine(ctx, ox, oy, dir, 5, 12.5 - ((ag.anim >> 3) % 2), 2.5, 0.5)
  }
}

// Light belongs to the fixture. Clip the warm pool and its floating dust to
// open air every tick, so a dug-away support takes its lamp light with it.
function drawLibraryLamplight(ctx, w, pal) {
  ctx.save()
  for (var i = 0; i < w.decor.length; i++) {
    var d = w.decor[i]
    if (d.kind !== "hang" && d.kind !== "tuft") continue
    var C = w.k.CELL, x = d.x * C, y = d.y * C
    var support = d.kind === "hang" ? d.y - 1 : d.y + 1
    if (!w.terrain[support * w.k.COLS + d.x] || !mechanismAir(w, x, y)) continue
    drawLibraryLightPool(ctx, w, pal, x + 2, d.kind === "hang" ? y + 9 : y + C - 2, d.seed)
  }
  ctx.restore()
}
function drawLibraryLightPool(ctx, w, pal, x, y, seed) {
  ctx.fillStyle = pal.oreEdge
  for (var row = 0; row < 9; row++) for (var dx = -2 - (row >> 1); dx <= 2 + (row >> 1); dx++) {
    if (!mechanismAir(w, x + dx, y + row)) continue
    ctx.globalAlpha = 0.09 * (1 - row / 10)
    ctx.fillRect(x + dx, y + row, 1, 1)
  }
  ctx.globalAlpha = 0.55
  ctx.fillStyle = pal.dust
  for (var i = 0; i < 3; i++) {
    var mx = x + Math.round(Math.sin(w.ticks * 0.018 + seed + i * 2) * 3)
    var my = y + (w.ticks * 0.035 + seed + i * 3) % 8
    if ((w.res || 1) >= 2) moteFineRect(ctx, w, mx, Math.floor(my * 2) / 2, 0.5, 0.5)
    else if (mechanismAir(w, mx, Math.floor(my))) ctx.fillRect(mx, Math.floor(my), 1, 1)
  }
}

function drawExitDataBack(ctx, pal, x, y, ww, hh) {
    // A rack door: a heavy frame, a strip of status lights across the top,
    // and a badge reader by the handle.
    ctx.fillRect(x - 4, y - 6, ww + 8, 4)
    ctx.fillRect(x - 4, y - 2, 3, hh + 2)
    ctx.fillRect(x + ww + 1, y - 2, 3, hh + 2)
    ctx.fillStyle = pal.decorLit
    for (var sl = 0; sl < ww + 4; sl += 3) ctx.fillRect(x - 2 + sl, y - 5, 1, 1)
    ctx.fillStyle = pal.rigDark
    ctx.fillRect(x + ww + 1, y + hh / 2 - 2, 3, 4)
}

// Mail Room: recessed pigeonholes on the far wall, address cards and a red
// sorting stripe. Foreground letters belong to solid cells, never to scenery.
function backMailRoom(ctx, r, b, pal) {
  for (var x = -4; x < b.w; x += 24) for (var y = b.y; y < b.y + b.h; y += 12) {
    ctx.fillStyle = pal.backDim
    ctx.fillRect(x, y, 22, 10)
    ctx.fillStyle = pal.back
    ctx.fillRect(x + 1, y + 1, 20, 7)
    ctx.fillStyle = pal.backLit
    ctx.fillRect(x, y + 9, 22, 1)
    ctx.fillRect(x + 2, y + 5, 5, 2)
    ctx.fillRect(x + 12, y + 3, 6 + Math.floor(r() * 3), 4)
  }
}
function backMailRoomFine(ctx, b, pal) {
  ctx.fillStyle = pal.backDim
  ctx.fillRect(b.x + 0.5, b.y + b.h - 0.5, b.w - 0.5, 0.5)
  if (b.w >= 5 && b.h >= 2) {
    ctx.fillStyle = pal.backLit
    ctx.fillRect(b.x + 1.5, b.y + 0.5, 2, 0.5) // address label
  }
}
function drawMailSlots(ctx, w, pal) {
  var k = w.k, C = k.CELL, fine = (w.res || 1) >= 2
  for (var y = k.SKY; y < k.ROWS; y++) for (var x = 0; x < k.COLS; x++) {
    var m = w.terrain[y * k.COLS + x], px = x * C, py = y * C
    if (m === k.ORE) drawMailLetter(ctx, pal, px, py, ((x * 73856093) ^ (y * 19349663)) >>> 0, fine)
    else if (m === k.DIRT) {
      ctx.fillStyle = pal.dirtShade
      ctx.fillRect(px, py + C - 1, C, 1)
      if (fine) { ctx.fillStyle = pal.dirtEdge; ctx.fillRect(px + 0.5, py, 0.5, C - 1) }
    } else if (m === k.ROCK) {
      ctx.fillStyle = pal.steelShade
      ctx.fillRect(px, py + 1, C, 2)
      ctx.fillStyle = pal.steelEdge
      ctx.fillRect(px, py + 1, C, fine ? 0.5 : 1) // trolley rail
    }
  }
}
function drawMailLetter(ctx, pal, x, y, hash, fine) {
  ctx.fillStyle = pal.dirtShade
  ctx.fillRect(x, y, 4, 4)
  ctx.fillStyle = pal.oreEdge
  ctx.fillRect(x + 1, y + 1, 3, 2)
  ctx.fillStyle = pal.oreShade
  ctx.fillRect(x + 2, y + 2, 1, 1) // envelope's folded end
  if (hash % 4 === 0) {
    ctx.fillStyle = pal.dirtEdge
    ctx.fillRect(x + 1, y, 3, 3)
    ctx.fillStyle = pal.oreEdge
    ctx.fillRect(x + 2, y, 1, 3); ctx.fillRect(x + 1, y + 1, 3, 1) // parcel string
  }
  if (fine) {
    ctx.fillStyle = pal.oreShade
    ctx.fillRect(x + 1.5, y + 1.5, 1.5, 0.5)
    ctx.fillStyle = pal.urgent
    ctx.fillRect(x + 3, y + 1, 0.5, 0.5) // red stamp
  }
}

function drawMailDecor(ctx, pal, d, x, y, C) {
  var base = y + C
  if (d.kind === "spire") {
    if (d.seed % 3 === 0) drawMailFrank(ctx, pal, x, base)
    else drawMailSack(ctx, pal, x, base, d.size)
  } else if (d.kind === "clump") drawMailParcels(ctx, pal, d, x, base)
  else if (d.kind === "tuft") drawMailFrank(ctx, pal, x, base)
  else {
    ctx.fillStyle = pal.steelShade
    ctx.fillRect(x + 2, y, 1, 4)
    ctx.fillStyle = pal.urgent
    ctx.fillRect(x - 3, y + 4, 12, 5)
    ctx.fillStyle = pal.oreEdge
    ctx.fillRect(x - 1, y + 6, 7, 1) // hanging sorting-lane sign
  }
}
function drawMailSack(ctx, pal, x, base, size) {
  var h = 6 + size * 2
  ctx.fillStyle = pal.dirtShade
  ctx.fillRect(x, base - h + 3, 8, h - 3)
  ctx.fillStyle = pal.dirtEdge
  ctx.fillRect(x + 1, base - h + 1, 6, h - 2)
  ctx.fillRect(x + 2, base - h, 4, 1)
  ctx.fillStyle = pal.oreEdge
  ctx.fillRect(x + 2, base - h + 2, 4, 1) // tied neck
  ctx.fillStyle = pal.urgent
  ctx.fillRect(x + 3, base - 4, 2, 2) // postal mark on the cloth
}
function drawMailParcels(ctx, pal, d, x, base) {
  for (var b = 0; b < 2 + d.size; b++) {
    var bx = x + b % 2, by = base - 3 - b * 3
    ctx.fillStyle = b % 2 ? pal.ore : pal.dirtEdge
    ctx.fillRect(bx, by, 8 - b % 2, 3)
    ctx.fillStyle = pal.oreEdge
    ctx.fillRect(bx + 3, by, 1, 3); ctx.fillRect(bx, by + 1, 8 - b % 2, 1)
  }
}
function drawMailFrank(ctx, pal, x, base) {
  ctx.fillStyle = pal.steelShade
  ctx.fillRect(x - 2, base - 2, 14, 2); ctx.fillRect(x, base - 7, 10, 5)
  ctx.fillStyle = pal.urgent
  ctx.fillRect(x + 1, base - 9, 7, 5)
  ctx.fillStyle = pal.rigDark
  ctx.fillRect(x + 3, base - 6, 5, 2) // stamp roller
  ctx.fillStyle = pal.oreEdge
  ctx.fillRect(x - 3, base - 3, 6, 1); ctx.fillRect(x + 9, base - 3, 5, 1)
  ctx.fillStyle = pal.urgent
  ctx.fillRect(x + 11, base - 3, 1, 1) // franked envelope
}
function fineMailSack(ctx, pal, d, x, base) {
  if (d.seed % 3 === 0) return fineMailFrank(ctx, pal, d, x, base)
  var h = 6 + d.size * 2
  ctx.fillStyle = pal.dirtShade
  ctx.fillRect(x + 1.5, base - h + 3, 0.5, h - 4)
  ctx.fillRect(x + 6, base - h + 3.5, 0.5, h - 4.5)
  ctx.fillStyle = pal.oreEdge
  ctx.fillRect(x + 1.5, base - h + 2, 1, 0.5); ctx.fillRect(x + 6, base - h + 2, 1, 0.5)
}
function fineMailParcels(ctx, pal, d, x, base) {
  ctx.fillStyle = pal.dirtShade
  for (var b = 0; b < 2 + d.size; b++) {
    ctx.fillRect(x + b % 2 + 0.5, base - 0.5 - b * 3, 6 - b % 2, 0.5)
    ctx.fillRect(x + b % 2 + 5, base - 2.5 - b * 3, 1.5, 0.5) // address label
  }
}
function fineMailFrank(ctx, pal, d, x, base) {
  ctx.fillStyle = pal.oreEdge
  ctx.fillRect(x + 1.5, base - 8.5, 5, 0.5)
  ctx.fillStyle = pal.rigDark
  ctx.fillRect(x + 1, base - 6, 0.5, 0.5); ctx.fillRect(x + 8.5, base - 6, 0.5, 0.5)
  ctx.fillStyle = pal.urgent
  ctx.fillRect(x + 10, base - 2.5, 3, 0.5) // cancellation bars
}
function fineMailSign(ctx, pal, d, x, base, top) {
  ctx.fillStyle = pal.oreEdge
  ctx.fillRect(x - 2.5, top + 4.5, 10, 0.5)
  ctx.fillStyle = pal.rigDark
  ctx.fillRect(x - 0.5, top + 7.5, 6, 0.5)
}

// A red dispatch door with a letter slot above its lit mouth and a parcel
// counter at the side. The beacon itself remains the common exit glow.
function drawExitMail(ctx, pal, x, y, ww, hh) {
  ctx.fillStyle = pal.urgent
  ctx.fillRect(x - 4, y - 3, 3, hh + 3); ctx.fillRect(x + ww + 1, y - 3, 3, hh + 3)
  ctx.fillRect(x - 5, y - 9, ww + 10, 6)
  ctx.fillStyle = pal.rigDark
  ctx.fillRect(x, y - 7, ww, 2)
  ctx.fillStyle = pal.oreEdge
  ctx.fillRect(x + 2, y - 7, ww - 4, 1) // letter in the slot
  ctx.fillRect(x + ww + 1, y + hh - 7, 6, 2) // collection counter
  ctx.fillStyle = pal.steelShade
  ctx.fillRect(x - 5, y + hh - 1, ww + 10, 1)
}
function drawExitMailFine(ctx, pal, x, y, ww, hh) {
  ctx.fillStyle = pal.oreEdge
  ctx.fillRect(x - 4.5, y - 8.5, ww + 9, 0.5)
  ctx.fillRect(x - 3.5, y - 2.5, 0.5, hh + 2.5)
  ctx.fillRect(x + ww + 1.5, y - 2.5, 0.5, hh + 2.5)
  ctx.fillStyle = pal.rigDark
  ctx.fillRect(x + ww + 2, y + hh - 6.5, 4.5, 0.5)
  ctx.fillRect(x + 3, y - 6.5, ww - 6, 0.5) // envelope flap
}
function drawMailBoothTop(ctx, pal, x, y) {
  ctx.fillRect(x - 10, y - 19, 20, 4)
  ctx.fillStyle = pal.rigDark
  ctx.fillRect(x - 5, y - 18, 10, 2)
  ctx.fillStyle = pal.oreEdge
  ctx.fillRect(x - 4, y - 18, 7, 1) // daemon's inbox
}
function drawMailMote(ctx, w, pal, x, y, spec) {
  moteFineRect(ctx, w, x, y, spec.size + 1, 1)
  moteFineRect(ctx, w, x + 1, y + 1, spec.size, 1)
}
function drawMoteMailFine(ctx, w, pal, x, y, spec) {
  var curl = Math.floor(w.ticks / 12) % 2 * 0.5
  moteFineRect(ctx, w, x, y + curl, spec.size + 1, 0.5)
  moteFineRect(ctx, w, x + 0.5, y + 0.5, spec.size + 0.5, 1)
  ctx.fillStyle = pal.oreShade
  moteFineRect(ctx, w, x + 1, y + 1, 1, 0.5) // fold or stamp perforation
  ctx.fillStyle = pal[spec.col]
}

// Pneumatic post shares only the transporter's state. The simulation has
// already sent the passenger; hide that body during the recharge and draw it
// in a glass capsule. No clocks or particles are added to the world.
var TUBE_TRAVEL = 8
var TUBE_BRASS = "#b58a52", TUBE_SHADE = "#5d4935", TUBE_GLASS = "#485e60", TUBE_GLINT = "#b1cebf"
function tubeRoute(w, p) {
  var C = w.k.CELL, ax = (p.ax + 0.5) * C, bx = (p.bx + 0.5) * C
  var ay = (p.ay + 1) * C - 9, by = (p.by + 1) * C - 9
  return [{ x: ax, y: ay }, { x: ax, y: ay - 18 }, { x: bx, y: ay - 18 }, { x: bx, y: by }]
}
function drawTubePair(ctx, w, pal, p) {
  var route = tubeRoute(w, p), age = w.ticks - p.usedAt
  ctx.save()
  for (var i = 1; i < route.length; i++) drawTubeSegment(ctx, w, route[i - 1], route[i])
  drawTubePort(ctx, w, pal, p.ax, p.ay, true, age)
  drawTubePort(ctx, w, pal, p.bx, p.by, false, age)
  if (p.usedAt >= 0 && age >= 0 && age < PAD_FX_TICKS) drawTubeSend(ctx, w, pal, p, route, age)
  ctx.restore()
}
function drawTubeSegment(ctx, w, a, b) {
  var vertical = a.x === b.x, x = Math.min(a.x, b.x), y = Math.min(a.y, b.y)
  var length = vertical ? Math.abs(a.y - b.y) : Math.abs(a.x - b.x)
  ctx.fillStyle = TUBE_SHADE
  ctx.fillRect(x - 4, y - 4, vertical ? 8 : length + 8, vertical ? length + 8 : 8)
  ctx.fillStyle = TUBE_BRASS
  ctx.fillRect(x - 3, y - 3, vertical ? 6 : length + 6, vertical ? length + 6 : 6)
  ctx.fillStyle = TUBE_GLASS
  ctx.fillRect(x - 2, y - 2, vertical ? 4 : length + 4, vertical ? length + 4 : 4)
  ctx.fillStyle = TUBE_GLINT
  ctx.globalAlpha = 0.6
  ctx.fillRect(x - 2, y - 2, vertical ? 1 : length + 4, vertical ? length + 4 : 1)
  ctx.globalAlpha = 1
  drawTubeCollar(ctx, w, a.x, a.y, vertical)
  drawTubeCollar(ctx, w, b.x, b.y, vertical)
}
function drawTubeCollar(ctx, w, x, y, vertical) {
  ctx.fillStyle = TUBE_SHADE
  ctx.fillRect(x - 4, y - 4, 8, 8)
  ctx.fillStyle = TUBE_BRASS
  ctx.fillRect(x - 4, y - 3, 8, 6)
  ctx.fillStyle = TUBE_GLASS
  ctx.fillRect(x - 2, y - 2, 4, 4)
  if ((w.res || 1) >= 2) {
    ctx.fillStyle = TUBE_GLINT
    ctx.fillRect(x - 3.5, y - 2.5, vertical ? 0.5 : 7, vertical ? 5 : 0.5)
  }
}
function drawTubePort(ctx, w, pal, x, y, intake, age) {
  var C = w.k.CELL, px = (x + 0.5) * C, base = (y + 1) * C
  ctx.fillStyle = TUBE_SHADE
  ctx.fillRect(px - 6, base - 8, 12, 8)
  ctx.fillStyle = pal.urgent
  ctx.fillRect(px - 5, base - 6, 10, 5)
  ctx.fillStyle = pal.rigDark
  ctx.fillRect(px - 4, base - 6, 8, 3)
  ctx.fillStyle = TUBE_BRASS
  ctx.fillRect(px - 7, base - 9, 14, 2) // flared hopper
  ctx.fillStyle = pal.oreEdge
  ctx.fillRect(px - 3, base - 5, 6, 1) // flap / delivery tray
  ctx.fillStyle = age < PAD_CHARGE ? pal.urgent : pal.oreEdge
  ctx.fillRect(px + (intake ? -4 : 3), base - 2, 1, 1)
  if ((w.res || 1) >= 2) {
    ctx.fillStyle = TUBE_GLINT
    ctx.fillRect(px - 6.5, base - 8.5, 12, 0.5)
    ctx.fillStyle = pal.rigDark
    ctx.fillRect(px - 2.5, base - 4.5, 5, 0.5)
  }
}
// Constant speed along the three legs, including the bends. Distance, not a
// separate timer per leg, makes short and long installations land together.
function tubePosition(route, progress) {
  var lengths = [], total = 0
  for (var i = 1; i < route.length; i++) {
    var n = Math.abs(route[i].x - route[i - 1].x) + Math.abs(route[i].y - route[i - 1].y)
    lengths.push(n); total += n
  }
  var distance = Math.max(0, Math.min(1, progress)) * total
  for (var j = 0; j < lengths.length; j++) {
    if (distance > lengths[j] && j < lengths.length - 1) { distance -= lengths[j]; continue }
    var a = route[j], b = route[j + 1], ratio = distance / Math.max(1, lengths[j])
    return { x: Math.round(a.x + (b.x - a.x) * ratio), y: Math.round(a.y + (b.y - a.y) * ratio), horizontal: a.y === b.y }
  }
}
function drawTubeSend(ctx, w, pal, p, route, age) {
  if (age < TUBE_TRAVEL) drawTubeCapsule(ctx, w, pal, p, tubePosition(route, age / (TUBE_TRAVEL - 1)))
  drawTubePuff(ctx, w, pal, route[0], age)
  drawTubePuff(ctx, w, pal, route[3], age - TUBE_TRAVEL + 1)
}
function drawTubeCapsule(ctx, w, pal, p, pos) {
  var passenger = null
  for (var i = 0; i < w.agents.length; i++) if (w.agents[i].id === p.who) { passenger = w.agents[i]; break }
  var colors = passenger ? agentDrawColors(w, pal, passenger, "walk") : pal
  ctx.save()
  ctx.translate(pos.x, pos.y)
  if (pos.horizontal) ctx.rotate(Math.PI / 2)
  ctx.fillStyle = TUBE_SHADE
  ctx.fillRect(-3, -6, 6, 12)
  ctx.fillStyle = TUBE_BRASS
  ctx.fillRect(-3, -6, 6, 2); ctx.fillRect(-3, 4, 6, 2)
  ctx.fillStyle = TUBE_GLINT
  ctx.fillRect(-2, -4, 4, 8) // glass capsule window
  ctx.fillStyle = colors.hair
  ctx.fillRect(-1, -4, 2, 1)
  ctx.fillStyle = colors.skin
  ctx.fillRect(-1, -3, 2, 2)
  ctx.fillStyle = pal.eye
  ctx.fillRect(-1, -3, 2, 1)
  ctx.fillStyle = colors.robe
  ctx.fillRect(-1, 0, 2, 3)
  ctx.fillStyle = pal.shirt
  ctx.fillRect(-1, -1, 2, 1) // white collar survives the squeeze
  ctx.fillStyle = pal.eye
  ctx.fillRect(-1, 3, 1, 1); ctx.fillRect(1, 3, 1, 1)
  if ((w.res || 1) >= 2) { ctx.fillStyle = pal.shirt; ctx.fillRect(0, 0, 0.5, 1.5) }
  ctx.restore()
}
function drawTubePuff(ctx, w, pal, port, age) {
  if (age < 0 || age >= 7) return
  ctx.fillStyle = pal.dust
  ctx.globalAlpha = 0.65 * (1 - age / 7)
  for (var i = 0; i < 5; i++) {
    var x = port.x + Math.round((i - 2) * (1 + age * 0.7)), y = port.y + 4 - Math.round(age * 0.7) - i % 2
    ctx.fillRect(x, y, (w.res || 1) >= 2 ? 1.5 : 2, 1)
  }
  ctx.globalAlpha = 1
}

// Building Site: the far scaffold is depth; the concrete frame is ground.
// All scenery is a recipe of the level and tick, with no renderer-owned state.
function backBuildingSite(ctx, r, b, pal) {
  var offset = Math.floor(r() * 20)
  for (var x = offset - 40; x < b.w; x += 40) {
    ctx.fillStyle = pal.back
    ctx.fillRect(x, b.y, 2, b.h)
    ctx.fillRect(x + 32, b.y, 2, b.h)
    for (var y = b.y + 12; y < b.y + b.h - 3; y += 28) {
      ctx.fillStyle = pal.backDim
      ctx.fillRect(x - 3, y, 40, 3) // scaffold boards
      ctx.fillStyle = pal.backLit
      ctx.fillRect(x, y - 12, 34, 1) // guardrail, well behind the walkers
      ctx.fillRect(x - 1, y - 1, 4, 2); ctx.fillRect(x + 31, y - 1, 4, 2)
      ctx.fillStyle = pal.back
      for (var d = 0; d < 24; d++) ctx.fillRect(x + 3 + d, y - 24 + d, 1, 1)
    }
  }
}
function backBuildingSiteFine(ctx, b, pal) {
  ctx.fillStyle = pal.backDim
  ctx.fillRect(b.x + b.w - 0.5, b.y, 0.5, b.h)
  if (b.w > 4) {
    ctx.fillStyle = pal.backLit
    ctx.fillRect(b.x + 0.5, b.y + 0.5, b.w - 1, 0.5) // board grain and clamp edge
  }
}

function drawSiteMaterials(ctx, w, pal) {
  var k = w.k, C = k.CELL, fine = (w.res || 1) >= 2
  for (var y = k.SKY; y < k.ROWS; y++) for (var x = 0; x < k.COLS; x++) {
    var m = w.terrain[y * k.COLS + x]
    if (m === k.EMPTY || m === k.STEEL) continue
    drawSiteCell(ctx, k, pal, m, x * C, y * C, x, y, fine)
  }
}
function drawSiteCell(ctx, k, pal, m, px, py, x, y, fine) {
  if (m === k.DIRT) {
    // Quiet grey blockwork. The braces keep
    // the hi-vis colour; filling every bay with it hid the concrete columns.
    ctx.fillStyle = pal.rockShade
    ctx.fillRect(px, py, 4, 4)
    ctx.fillStyle = pal.rock
    ctx.fillRect(px, py + 3, 4, 1)
    ctx.fillRect(px + (y % 2 ? 1 : 3), py + 1, 1, 2)
  } else if (m === k.ROCK) {
    ctx.fillStyle = pal.rockShade
    if (y % 3 === 0) ctx.fillRect(px, py + 3, 4, 1) // formwork joins
    if ((x + y) % 3 === 0) ctx.fillRect(px + 2, py + 1, 1, 1) // tie holes
  } else {
    ctx.fillStyle = pal.oreShade
    ctx.fillRect(px, py + 2, 4, 2)
    ctx.fillStyle = pal.steelEdge
    if ((x + y) % 3 === 0) ctx.fillRect(px + 1, py + 1, 1, 1) // steel fixing
  }
  if (fine) drawSiteCellFine(ctx, k, pal, m, px, py)
}
function drawSiteCellFine(ctx, k, pal, m, x, y) {
  ctx.fillStyle = materialEdge(k, pal, m)
  ctx.fillRect(x + 0.5, y + 0.5, 3, 0.5)
  ctx.fillStyle = materialShade(k, pal, m)
  ctx.fillRect(x + 3.5, y + 1, 0.5, 2)
  if (m === k.ROCK) {
    ctx.fillStyle = pal.rockEdge
    ctx.fillRect(x + 2, y + 1, 0.5, 0.5) // edge of the form tie
  }
}

function siteStripes(ctx, pal, x, y, width, height) {
  ctx.fillStyle = pal.oreEdge
  ctx.fillRect(x, y, width, height)
  ctx.fillStyle = pal.rigDark
  for (var row = 0; row < height; row++) for (var col = 0; col < width; col++)
    if ((col + row) % 6 < 3) ctx.fillRect(x + col, y + row, 1, 1)
}
function drawSiteDecor(ctx, pal, d, x, y, C) {
  var base = y + C
  if (d.kind === "spire") drawSiteCone(ctx, pal, x, base, d.size)
  else if (d.kind === "clump") drawSitePallet(ctx, pal, x, base, d.size)
  else if (d.kind === "hang") siteSignAt(d) ? drawSiteSign(ctx, pal, x, y) : drawSiteLamp(ctx, pal, x, y)
  else drawSiteEquipment(ctx, pal, d, x, base)
}
function drawSiteCone(ctx, pal, x, base, size) {
  var h = 5 + size * 2
  ctx.fillStyle = pal.rigDark
  ctx.fillRect(x - 2, base - 1, 9, 1)
  ctx.fillStyle = pal.oreEdge
  for (var row = 0; row < h - 1; row++) {
    var half = Math.floor(row * 3 / h)
    ctx.fillRect(x + 2 - half, base - h + row, half * 2 + 1, 1)
  }
  ctx.fillStyle = pal.shirt
  ctx.fillRect(x + 1, base - h + 3, 3, 1)
}
function drawSitePallet(ctx, pal, x, base, size) {
  ctx.fillStyle = pal.decorDim
  ctx.fillRect(x - 2, base - 2, 13, 1)
  ctx.fillRect(x - 1, base - 1, 2, 1); ctx.fillRect(x + 7, base - 1, 2, 1)
  for (var row = 0; row <= size; row++) {
    var top = base - 5 - row * 3, shift = row % 2
    ctx.fillStyle = pal.rockEdge
    ctx.fillRect(x + shift, top, 9, 2)
    ctx.fillStyle = pal.rockShade
    ctx.fillRect(x + shift + 4, top, 1, 2)
  }
  ctx.fillStyle = pal.ore
  ctx.fillRect(x + 1, base - 5 - size * 3, 1, size * 3 + 3) // packing strap
}
// One hanging fitting in three is the safety board; a board on every one read
// as wallpaper, four to a level. The rest are caged work lamps.
function siteSignAt(d) { return d.seed % 3 === 0 }
function drawSiteLamp(ctx, pal, x, y) {
  ctx.fillStyle = pal.steelShade
  ctx.fillRect(x + 2, y, 1, 4)
  ctx.fillRect(x, y + 4, 5, 1); ctx.fillRect(x, y + 8, 5, 1)
  ctx.fillRect(x, y + 5, 1, 3); ctx.fillRect(x + 4, y + 5, 1, 3)
  ctx.fillStyle = pal.oreEdge
  ctx.fillRect(x + 1, y + 5, 3, 3)
  ctx.fillStyle = pal.decorLit
  ctx.fillRect(x + 2, y + 6, 1, 1)
}
function drawSiteSign(ctx, pal, x, y) {
  ctx.fillStyle = pal.steelShade
  ctx.fillRect(x + 1, y, 1, 4); ctx.fillRect(x + 26, y, 1, 4)
  ctx.fillRect(x - 5, y + 4, 44, 13)
  ctx.fillStyle = pal.rockEdge
  ctx.fillRect(x - 4, y + 5, 42, 11)
  siteStripes(ctx, pal, x - 5, y + 4, 44, 2)
  ctx.fillStyle = pal.rigDark
  drawTransitionGlyph(ctx, TRANSITION_GLYPHS["0"], x, y + 9, 1)
  ctx.fillRect(x + 6, y + 9, 24, 1); ctx.fillRect(x + 6, y + 12, 16, 1)
}
function drawSiteEquipment(ctx, pal, d, x, base) {
  if (d.seed % 3 === 0) return drawSiteMixer(ctx, pal, x, base)
  if (d.seed % 3 === 2) return drawSiteGrinder(ctx, pal, x, base)
  ctx.fillStyle = pal.steelEdge
  ctx.fillRect(x, base - 7, 1, 7); ctx.fillRect(x + 10, base - 7, 1, 7)
  siteStripes(ctx, pal, x - 2, base - 7, 15, 3)
  ctx.fillStyle = pal.rigDark
  ctx.fillRect(x - 2, base - 1, 5, 1); ctx.fillRect(x + 8, base - 1, 5, 1)
}
function drawSiteMixer(ctx, pal, x, base) {
  ctx.fillStyle = pal.rigDark
  ctx.fillRect(x - 1, base - 2, 3, 2); ctx.fillRect(x + 8, base - 2, 3, 2)
  ctx.fillStyle = pal.steelEdge
  ctx.fillRect(x + 1, base - 5, 1, 4); ctx.fillRect(x + 8, base - 5, 1, 4)
  ctx.fillStyle = pal.ore
  ctx.fillRect(x, base - 9, 8, 5); ctx.fillRect(x + 1, base - 11, 5, 2)
  ctx.fillStyle = pal.oreEdge
  ctx.fillRect(x, base - 9, 7, 1)
  ctx.fillStyle = pal.rigDark
  ctx.fillRect(x + 7, base - 9, 2, 4) // tilted mouth, separate from the wheel
  ctx.fillStyle = pal.steelEdge
  ctx.fillRect(x + 11, base - 8, 1, 5); ctx.fillRect(x + 9, base - 7, 5, 1)
}
function drawSiteGrinder(ctx, pal, x, base) {
  ctx.fillStyle = pal.steelShade
  ctx.fillRect(x - 2, base - 6, 14, 2)
  ctx.fillRect(x - 1, base - 4, 1, 4); ctx.fillRect(x + 10, base - 4, 1, 4)
  ctx.fillStyle = pal.rockEdge
  ctx.fillRect(x + 1, base - 8, 5, 2)
  ctx.fillStyle = pal.oreEdge
  ctx.fillRect(x + 6, base - 10, 4, 3)
  ctx.fillStyle = pal.rigDark
  ctx.fillRect(x + 7, base - 9, 2, 2)
}
function fineSiteCone(ctx, pal, d, x, base) {
  ctx.fillStyle = pal.decorDim
  ctx.fillRect(x + 2.5, base - 5 - d.size * 2, 0.5, 3)
  ctx.fillStyle = pal.shirt
  ctx.fillRect(x + 0.5, base - 2.5, 4, 0.5)
}
function fineSitePallet(ctx, pal, d, x, base) {
  ctx.fillStyle = pal.rockShade
  for (var row = 0; row <= d.size; row++)
    ctx.fillRect(x + row % 2 + 0.5, base - 3.5 - row * 3, 8, 0.5)
  ctx.fillStyle = pal.decorLit
  ctx.fillRect(x - 1.5, base - 2, 11, 0.5)
}
// The lamp's cage wires and a glint on the bulb, at half pixels.
function fineSiteLamp(ctx, pal, x, top) {
  ctx.fillStyle = pal.rigDark
  ctx.fillRect(x + 2, top + 5, 0.5, 3)
  ctx.fillStyle = pal.decorLit
  ctx.fillRect(x + 1.5, top + 5.5, 0.5, 0.5)
}
function fineSiteSign(ctx, pal, d, x, base, top) {
  if (!siteSignAt(d)) return fineSiteLamp(ctx, pal, x, top)
  ctx.fillStyle = pal.rockEdge
  ctx.fillRect(x - 4, top + 7, 42, 9)
  ctx.fillStyle = pal.rigDark
  drawTransitionText(ctx, "SAFETY FIRST", x + 17, top + 8, 0.5)
  drawTransitionText(ctx, "0 DAYS SAFE", x + 17, top + 12, 0.5)
  ctx.fillStyle = pal.steelEdge
  ctx.fillRect(x - 4.5, top + 6.5, 0.5, 9)
  ctx.fillStyle = pal.rigDark
  ctx.fillRect(x + 36, top + 7.5, 0.5, 0.5); ctx.fillRect(x + 36, top + 14.5, 0.5, 0.5)
}
function fineSiteEquipment(ctx, pal, d, x, base) {
  ctx.fillStyle = pal.steelEdge
  ctx.fillRect(x + 0.5, base - 5, 0.5, 3)
  ctx.fillStyle = pal.oreEdge
  ctx.fillRect(x + 1, base - 6.5, 8, 0.5)
}

function drawExitSite(ctx, pal, x, y, ww, hh) {
  // A scaffold gate under the site's yellow lintel. The common lit mouth is
  // kept clear, with a small hard hat on its sign rather than a second beacon.
  ctx.fillStyle = pal.steelShade
  ctx.fillRect(x - 4, y - 8, 2, hh + 8); ctx.fillRect(x + ww + 2, y - 8, 2, hh + 8)
  ctx.fillStyle = pal.steelEdge
  ctx.fillRect(x - 4, y - 2, 2, 2); ctx.fillRect(x + ww + 2, y - 2, 2, 2)
  siteStripes(ctx, pal, x - 6, y - 7, ww + 12, 3)
  ctx.fillStyle = pal.rockShade
  ctx.fillRect(x - 1, y - 4, ww + 2, 4)
  ctx.fillStyle = pal.oreEdge
  ctx.fillRect(x + ww / 2 - 2, y - 4, 4, 2)
  ctx.fillRect(x + ww / 2 - 3, y - 2, 6, 1)
  ctx.fillStyle = pal.steelShade
  ctx.fillRect(x - 6, y + hh - 1, ww + 12, 1)
}
function drawExitSiteFine(ctx, pal, x, y, ww, hh) {
  ctx.fillStyle = pal.steelEdge
  ctx.fillRect(x - 3.5, y - 7.5, 0.5, hh + 7.5)
  ctx.fillRect(x + ww + 2.5, y - 7.5, 0.5, hh + 7.5)
  ctx.fillStyle = pal.oreEdge
  ctx.fillRect(x - 5.5, y - 6.5, ww + 11, 0.5)
  ctx.fillStyle = pal.rigDark
  ctx.fillRect(x + ww / 2 + 1, y - 3.5, 0.5, 1.5)
}
function drawSiteBoothTop(ctx, pal, x, y) {
  siteStripes(ctx, pal, x - 10, y - 18, 20, 3)
  ctx.fillStyle = pal.steelEdge
  ctx.fillRect(x + 5, y - 23, 1, 5); ctx.fillRect(x + 4, y - 23, 3, 1) // exposed rebar
}
function drawMoteSiteFine(ctx, w, pal, x, y) {
  moteFineRect(ctx, w, x, y, 1, 0.5)
  moteFineRect(ctx, w, x + 0.5, y + 0.5, 0.5, 1) // crumbling concrete flake
}

function drawSiteMachines(ctx, w, pal) {
  for (var i = 0; i < w.cranes.length; i++) drawCrane(ctx, w, pal, w.cranes[i])
  for (var j = 0; j < w.decor.length; j++) {
    var d = w.decor[j]
    if (d.kind !== "tuft" || !lightDecorAlive(w, d)) continue
    if (d.seed % 3 === 2) drawSiteSparks(ctx, w, pal, d)
    if (d.seed % 3 === 0) drawSiteMixerTurn(ctx, w, pal, d)
  }
}
function drawSiteSparks(ctx, w, pal, d) {
  if ((w.ticks + d.seed) % 100 > 28) return
  var x = d.x * w.k.CELL + 8, y = (d.y + 1) * w.k.CELL - 7
  ctx.save()
  for (var i = 0; i < 8; i++) {
    var age = (w.ticks + i * 5 + d.seed) % 16
    var sx = x + Math.floor(age * (0.5 + i % 3 * 0.2)), sy = y - 2 + Math.floor(age * age / 32)
    ctx.fillStyle = i % 3 ? pal.warn : pal.fireHot
    ctx.globalAlpha = 1 - age / 20
    if (mechanismAir(w, sx, sy)) ctx.fillRect(sx, sy, 1, 1)
    if ((w.res || 1) >= 2 && mechanismAir(w, sx - 0.5, sy)) ctx.fillRect(sx - 0.5, sy, 0.5, 0.5)
  }
  ctx.restore()
}
function drawSiteMixerTurn(ctx, w, pal, d) {
  var x = d.x * w.k.CELL + 3, y = (d.y + 1) * w.k.CELL - 7
  var angle = w.ticks / 16 + d.seed
  ctx.fillStyle = pal.oreShade
  ctx.fillRect(x + Math.round(Math.cos(angle) * 2), y + Math.round(Math.sin(angle)), 1, 1)
}

// The simulation's lift is two rows. Its drop measures the rider's feet,
// so the hook's tip meets the collar ten art pixels above them, not the feet.
var SITE_HOIST = 2
function craneRailY(w, crane) {
  var C = w.k.CELL, roof = crane.y - 5
  for (var x = Math.min(crane.ax, crane.hx); x <= Math.max(crane.ax, crane.hx); x++) {
    var row = crane.y - 4
    while (row > w.k.SKY && w.terrain[(row - 1) * w.k.COLS + x] === w.k.EMPTY) row--
    roof = Math.max(roof, row)
  }
  return roof * C
}
function craneDrawing(w, crane) {
  var C = w.k.CELL, grid = (w.res || 1) >= 2 ? 2 : 1
  var moving = crane.phase === "across" || crane.phase === "back"
  var sway = moving ? Math.round(Math.sin(w.ticks / 9) * grid) / grid : 0
  var x = Math.round((crane.hookX + 0.5) * C * grid) / grid
  var feet = Math.round((crane.y - SITE_HOIST + crane.drop + 1) * C * grid) / grid
  return { x: x, tipX: x + sway, tipY: feet - 10, feet: feet, railY: craneRailY(w, crane) }
}
function drawCrane(ctx, w, pal, crane) {
  var g = craneDrawing(w, crane), C = w.k.CELL
  var left = Math.min(crane.ax, crane.hx) * C
  var width = (Math.abs(crane.ax - crane.hx) + 1) * C
  ctx.save()
  drawCraneRail(ctx, w, pal, left, g.railY, width)
  drawCraneCable(ctx, w, pal, g)
  ctx.fillStyle = pal.rigDark
  ctx.fillRect(g.x - 3, g.railY + 1, 6, 3) // trolley straddles the girder
  ctx.fillStyle = pal.oreEdge
  ctx.fillRect(g.x - 2, g.railY + 2, 4, 2)
  ctx.fillStyle = pal.steelEdge
  ctx.fillRect(g.x - 3, g.railY + 1, 1, 1); ctx.fillRect(g.x + 2, g.railY + 1, 1, 1)
  drawCraneHook(ctx, w, pal, g)
  ctx.fillStyle = Math.floor(w.ticks / 12) % 2 ? pal.warn : pal.oreShade
  ctx.fillRect(g.x + 3, g.railY + 3, 1, 2) // warning lamp, including while waiting
  drawCraneLanding(ctx, w, pal, crane)
  ctx.restore()
}
function drawCraneRail(ctx, w, pal, x, y, width) {
  ctx.fillStyle = pal.steelShade
  ctx.fillRect(x, y, width, 3)
  ctx.fillStyle = pal.ore
  ctx.fillRect(x, y, width, 1); ctx.fillRect(x, y + 2, width, 1)
  ctx.fillStyle = pal.rigDark
  ctx.fillRect(x, y, 2, 4); ctx.fillRect(x + width - 2, y, 2, 4) // end stops
  if ((w.res || 1) < 2) return
  ctx.fillStyle = pal.oreEdge
  ctx.fillRect(x + 2, y, width - 4, 0.5)
  ctx.fillStyle = pal.steelEdge
  for (var bolt = 4; bolt < width - 2; bolt += 8) ctx.fillRect(x + bolt, y + 1, 0.5, 0.5)
}
function drawCraneCable(ctx, w, pal, g) {
  var start = g.railY + 4, end = g.tipY - 3, length = end - start
  if (length <= 0) return
  ctx.fillStyle = pal.steelEdge
  for (var y = start; y < end; y++) {
    var grid = (w.res || 1) >= 2 ? 2 : 1
    var x = Math.round((g.x + (g.tipX - g.x) * (y - start) / length) * grid) / grid
    ctx.fillRect(x, y, 1 / grid, 1)
  }
}
function drawCraneHook(ctx, w, pal, g) {
  ctx.fillStyle = pal.ore
  ctx.fillRect(g.tipX - 2, g.tipY - 4, 4, 3)
  ctx.fillStyle = pal.rigDark
  ctx.fillRect(g.tipX - 1, g.tipY - 3, 2, 1)
  ctx.fillStyle = pal.steelEdge
  ctx.fillRect(g.tipX, g.tipY - 1, 1, 2)
  ctx.fillRect(g.tipX - 1, g.tipY + 1, 2, 1)
  ctx.fillRect(g.tipX - 1, g.tipY, 1, 1)
  if ((w.res || 1) < 2) return
  ctx.fillStyle = pal.oreEdge
  ctx.fillRect(g.tipX - 1.5, g.tipY - 4, 3, 0.5)
}
function drawCraneLanding(ctx, w, pal, crane) {
  // Release has no timestamp. The empty hook's reel-in distance gives the
  // age of a normal set-down; a stalled release is too high to emit this puff.
  if (crane.phase !== "back" || crane.hookX !== crane.hx || crane.usedAt < 0) return
  var age = (crane.land - (crane.y - SITE_HOIST) - crane.drop) / 0.8
  if (age < 0 || age >= 10) return
  var x = (crane.hx + 0.5) * w.k.CELL, floor = (crane.land + 1) * w.k.CELL
  ctx.save()
  ctx.fillStyle = pal.dust
  ctx.globalAlpha = (1 - age / 10) * 0.55
  for (var i = 0; i < 6; i++) {
    var px = Math.round(x + (i - 2.5) * (1 + age / 3)), py = floor - 1 - Math.floor(age / 3) - i % 2
    if (mechanismAir(w, px, py)) ctx.fillRect(px, py, 1, 1)
  }
  ctx.restore()
}
function hookedDrawing(w, ag) {
  for (var i = 0; i < w.cranes.length; i++) if (w.cranes[i].who === ag.id) return craneDrawing(w, w.cranes[i])
  return { tipX: Math.round(ag.x * w.k.CELL), feet: Math.round((ag.y + 1) * w.k.CELL) }
}
function drawHookedAgent(ctx, w, pal, ag, opts) {
  var g = hookedDrawing(w, ag), ox = g.tipX - 4, oy = g.feet - SPRITE_PX
  var colors = agentDrawColors(w, pal, ag, "hooked"), dir = ag.dir
  ctx.save()
  spriteFlip = false
  drawAgentHead(ctx, w, pal, ag, ox, oy, dir, colors.hair, colors.skin, "hooked", 0)
  ctx.fillStyle = colors.robe
  blit(ctx, ox, oy, dir, 2, 7, 4, 5)
  blit(ctx, ox, oy, dir, 0, 4, 1, 5); blit(ctx, ox, oy, dir, 7, 4, 1, 5) // arms up
  blit(ctx, ox, oy, dir, 1, 3, 2, 1); blit(ctx, ox, oy, dir, 5, 3, 2, 1)
  var kick = Math.round(Math.sin(w.ticks / 7))
  blit(ctx, ox, oy, dir, 2 + kick, 12, 1, 4); blit(ctx, ox, oy, dir, 5 - kick, 12, 1, 4)
  ctx.fillStyle = colors.skin
  blit(ctx, ox, oy, dir, 2, 4, 1, 1); blit(ctx, ox, oy, dir, 5, 4, 1, 1)
  ctx.fillStyle = pal.lapel
  blit(ctx, ox, oy, dir, 2, 7, 1, 1); blit(ctx, ox, oy, dir, 5, 7, 1, 1)
  ctx.fillStyle = pal.oreEdge
  blit(ctx, ox, oy, dir, 2, 0, 4, 2); blit(ctx, ox, oy, dir, 1, 2, 6, 1) // hard hat
  ctx.fillStyle = pal.steelEdge
  blit(ctx, ox, oy, dir, 4, 6, 1, 2) // collar caught by the hook
  if ((w.res || 1) >= 2) drawHookedFine(ctx, pal, ag, ox, oy, dir, kick)
  drawAgentLabel(ctx, w, pal, ag, ox, oy, "hooked", opts)
  ctx.restore()
}
function drawHookedFine(ctx, pal, ag, ox, oy, dir, kick) {
  ctx.fillStyle = pal.oreShade
  blitFine(ctx, ox, oy, dir, 4.5, 0.5, 0.5, 1.5)
  ctx.fillStyle = pal.shirt
  blitFine(ctx, ox, oy, dir, 3.5, 8, 1, 2)
  ctx.fillStyle = pal.rigDark
  blitFine(ctx, ox, oy, dir, 2 + kick, 15.5, 1, 0.5)
  blitFine(ctx, ox, oy, dir, 5 - kick, 15.5, 1, 0.5)
}
function drawSiteEventMarker(ctx, w, pal, fx) {
  if (w.ticks >= fx.fireAt) return
  var C = w.k.CELL, x = fx.x * C, y = fx.floorY * C
  ctx.save()
  ctx.globalAlpha = 0.65 + 0.25 * Math.sin(w.ticks / 7)
  ctx.fillStyle = pal.steelEdge
  ctx.fillRect(x, y - 7, 1, 7); ctx.fillRect(x + fx.span * C - 1, y - 7, 1, 7)
  siteStripes(ctx, pal, x, y - 7, fx.span * C, 2)
  ctx.fillStyle = pal.oreEdge
  ctx.font = "bold 3px monospace"
  ctx.fillText(fx.mech === "growth" ? "SCOPE +1" : "POUR PENDING", x + 2, y - 9)
  ctx.restore()
}

// Clock Tower: the back of the dial, stonework and the brass movement.
// The clock's scenery is a pure tick recipe. Moving pieces are clipped to
// air on the actor pass; the static face stays behind the terrain.
var CLOCK_BRASS = "#ad8850", CLOCK_GLINT = "#d8b878", CLOCK_DARK = "#5d4b31"
// Visual mirrors only: the simulation owns timing and occupancy deferrals.
var CLOCK_GATE_PERIOD = 240
var CLOCK_GATE_OPEN = 150
var CLOCK_SHUTTER_TICKS = 10

function clockFace(w) {
  return { x: Math.round(w.k.COLS * w.k.CELL * 0.53), y: w.k.SKY * w.k.CELL + 68, r: 64 }
}
function clockRing(ctx, x, y, r, size) {
  var count = Math.ceil(r * 5)
  for (var i = 0; i < count; i++) {
    var a = i * Math.PI * 2 / count
    ctx.fillRect(x + Math.round(Math.cos(a) * r), y + Math.round(Math.sin(a) * r), size, size)
  }
}
function backClockTower(ctx, r, b, pal) {
  var f = clockFace(b.world)
  ctx.fillStyle = pal.backDim
  // Translucent glass behind the works; a clock face, never walkable ground.
  for (var y = -f.r; y <= f.r; y += 2) {
    var half = Math.floor(Math.sqrt(f.r * f.r - y * y))
    ctx.fillRect(f.x - half, f.y + y, Math.max(1, half * 2), 2)
  }
  ctx.fillStyle = pal.backLit
  clockRing(ctx, f.x, f.y, f.r, 2)
  clockRing(ctx, f.x, f.y, f.r - 6, 1)
  for (var n = 0; n < 12; n++) backClockHour(ctx, pal, f, n)
  ctx.fillStyle = pal.back
  ctx.fillRect(f.x - 2, f.y - 2, 5, 5)
  ctx.fillRect(f.x - 3, f.y + 3, 2, b.y + b.h - f.y - 3) // pendulum suspension
  for (var x = 24; x < b.w; x += 76) {
    ctx.fillRect(x, b.y, 3, b.h) // distant timber frame
    ctx.fillStyle = pal.backLit
    ctx.fillRect(x + 3, b.y, 1, b.h)
    ctx.fillStyle = pal.back
  }
}
function backClockHour(ctx, pal, f, n) {
  var a = n * Math.PI / 6 - Math.PI / 2
  var x = f.x + Math.round(Math.cos(a) * 50), y = f.y + Math.round(Math.sin(a) * 50)
  ctx.fillStyle = pal.backLit
  // Roman strokes reversed as seen from inside. Four quarters have crossbars.
  for (var i = 0; i < n % 3 + 1; i++) ctx.fillRect(x - i * 3, y - 3, 1, 7)
  if (n % 3 === 0) {
    ctx.fillRect(x - 3, y - 3, 7, 1); ctx.fillRect(x - 3, y + 3, 7, 1)
  }
}
function backClockTowerFine(ctx, b, pal) {
  ctx.fillStyle = pal.backLit
  ctx.fillRect(b.x, b.y, b.w, 0.5) // glass leading and engraved hour strokes
  if (b.h > 2) {
    ctx.fillStyle = pal.backDim
    ctx.fillRect(b.x + b.w - 0.5, b.y + 0.5, 0.5, b.h - 0.5)
  }
}
function drawClockMaterials(ctx, w, pal) {
  var k = w.k, C = k.CELL, fine = (w.res || 1) >= 2
  for (var y = k.SKY; y < k.ROWS; y++) for (var x = 0; x < k.COLS; x++) {
    var m = w.terrain[y * k.COLS + x]
    if (m === k.EMPTY || m === k.STEEL) continue
    drawClockCell(ctx, k, pal, m, x * C, y * C, x, y, fine)
  }
}
function drawClockCell(ctx, k, pal, m, px, py, x, y, fine) {
  if (m === k.DIRT) {
    ctx.fillStyle = pal.dirtShade
    if (y % 2 === 0) ctx.fillRect(px, py + 3, 4, 1)
    if ((x + Math.floor(y / 2)) % 3 === 0) ctx.fillRect(px, py, 1, 3)
  } else if (m === k.ORE) {
    ctx.fillStyle = CLOCK_BRASS
    ctx.fillRect(px, py, 4, 4)
    ctx.fillStyle = CLOCK_DARK
    ctx.fillRect(px, py + 3, 4, 1)
  }
  if (fine) drawClockCellFine(ctx, k, pal, m, px, py, x, y)
}
function drawClockCellFine(ctx, k, pal, m, px, py, x, y) {
  ctx.fillStyle = m === k.DIRT ? pal.dirtEdge : CLOCK_GLINT
  ctx.fillRect(px + 0.5, py + 0.5, 3, 0.5)
  ctx.fillStyle = m === k.DIRT ? pal.dirtShade : CLOCK_DARK
  if ((x + y) % 3 === 0) ctx.fillRect(px + 3, py + 1, 0.5, 2)
  if (m === k.ORE) {
    ctx.fillStyle = pal.rigDark
    ctx.fillRect(px + 1.5, py + 1.5, 1, 1) // axle fixing
    ctx.fillStyle = CLOCK_GLINT
    ctx.fillRect(px + 1.5, py + 1.5, 0.5, 0.5)
  }
}
function drawClockDecor(ctx, pal, d, x, y, C) {
  var base = y + C
  if (d.kind === "spire") drawClockWeight(ctx, pal, d, x, base)
  else if (d.kind === "clump") drawClockParts(ctx, pal, d, x, base)
  else if (d.kind === "hang") drawClockChain(ctx, pal, d, x, y)
  else drawClockOiler(ctx, pal, d, x, base)
}
function drawClockWeight(ctx, pal, d, x, base) {
  var h = 5 + d.size * 2
  ctx.fillStyle = pal.rigDark
  ctx.fillRect(x, base - h - 3, 4, 3)
  ctx.fillStyle = CLOCK_DARK
  ctx.fillRect(x - 1, base - h, 6, h)
  ctx.fillStyle = CLOCK_BRASS
  ctx.fillRect(x, base - h, 4, h - 1)
}
function drawClockParts(ctx, pal, d, x, base) {
  ctx.fillStyle = CLOCK_DARK
  ctx.fillRect(x - 3, base - 2, 10, 2) // spare pinions, on a tray
  ctx.fillStyle = CLOCK_BRASS
  clockRing(ctx, x, base - 4, 2, 1)
  clockRing(ctx, x + 5, base - 3, 1, 1)
  ctx.fillRect(x + 1, base - 6, 1, 5)
}
function drawClockChain(ctx, pal, d, x, top) {
  ctx.fillStyle = CLOCK_BRASS
  for (var y = 0; y < 7 + d.size * 2; y += 2) ctx.fillRect(x + y / 2 % 2, top + y, 2, 2)
  ctx.fillStyle = CLOCK_DARK
  ctx.fillRect(x - 1, top + 7 + d.size * 2, 5, 3)
}
function drawClockOiler(ctx, pal, d, x, base) {
  ctx.fillStyle = CLOCK_BRASS
  ctx.fillRect(x, base - 4, 5, 4)
  ctx.fillRect(x + 1, base - 6, 2, 2)
  ctx.fillRect(x + 5, base - 5, 2, 1); ctx.fillRect(x + 7, base - 6, 1, 1)
  ctx.fillStyle = pal.rigDark
  ctx.fillRect(x - 2, base - 4, 2, 3)
}
function fineClockWeight(ctx, pal, d, x, base) {
  ctx.fillStyle = CLOCK_GLINT
  ctx.fillRect(x + 0.5, base - 5 - d.size * 2, 0.5, 4 + d.size * 2)
}
function fineClockParts(ctx, pal, d, x, base) {
  ctx.fillStyle = CLOCK_GLINT
  ctx.fillRect(x - 1.5, base - 5.5, 1, 0.5)
  ctx.fillRect(x + 4.5, base - 3.5, 0.5, 0.5)
}
function fineClockChain(ctx, pal, d, x, base, top) {
  ctx.fillStyle = pal.rigDark
  for (var y = 0; y < 7 + d.size * 2; y += 2) ctx.fillRect(x + y / 2 % 2 + 0.5, top + y + 0.5, 0.5, 1)
}
function fineClockOiler(ctx, pal, d, x, base) {
  ctx.fillStyle = CLOCK_GLINT
  ctx.fillRect(x + 0.5, base - 3.5, 3.5, 0.5)
  ctx.fillStyle = pal.rigDark
  ctx.fillRect(x + 3.5, base - 2, 0.5, 1.5)
}
function drawExitClock(ctx, pal, x, y, ww, hh) {
  ctx.fillStyle = pal.dirtShade
  ctx.fillRect(x - 4, y - 8, ww + 8, 8)
  ctx.fillRect(x - 4, y, 3, hh); ctx.fillRect(x + ww + 1, y, 3, hh)
  ctx.fillStyle = pal.dirtEdge
  ctx.fillRect(x - 5, y - 7, ww + 10, 2)
  ctx.fillStyle = pal.oreEdge
  clockRing(ctx, x + ww / 2, y - 5, 4, 1)
  ctx.fillRect(x + ww / 2, y - 7, 1, 3); ctx.fillRect(x + ww / 2 - 2, y - 5, 3, 1)
  ctx.fillRect(x - 3, y, 1, hh); ctx.fillRect(x + ww + 2, y, 1, hh)
}
function drawExitClockFine(ctx, pal, x, y, ww, hh) {
  ctx.fillStyle = pal.dirtEdge
  ctx.fillRect(x - 4.5, y - 6.5, ww + 9, 0.5)
  ctx.fillStyle = pal.oreShade
  ctx.fillRect(x - 2.5, y + 1, 0.5, hh - 1)
  ctx.fillRect(x + ww + 2.5, y + 1, 0.5, hh - 1)
  ctx.fillStyle = pal.oreEdge
  ctx.fillRect(x + ww / 2 + 0.5, y - 6.5, 0.5, 1.5)
}
function drawClockBoothTop(ctx, pal, x, y) {
  ctx.fillStyle = CLOCK_DARK
  ctx.fillRect(x - 10, y - 18, 20, 3)
  ctx.fillStyle = CLOCK_BRASS
  clockRing(ctx, x, y - 20, 3, 1)
  ctx.fillRect(x, y - 22, 1, 3); ctx.fillRect(x, y - 20, 2, 1)
}
function drawMoteClockFine(ctx, w, pal, x, y, spec) {
  if (spec.size === 2) {
    moteFineRect(ctx, w, x, y + 0.5, 1.5, 1)
    moteFineRect(ctx, w, x + 0.5, y, 0.5, 0.5) // a loose cog tooth
  } else {
    moteFineRect(ctx, w, x, y, 0.5, 0.5)
    moteFineRect(ctx, w, x + 0.5, y + 0.5, 0.5, 0.5)
  }
}
function clockAirMark(ctx, w, x, y, size) {
  var res = (w.res || 1) >= 2 ? 2 : 1
  x = Math.round(x * res) / res; y = Math.round(y * res) / res
  moteFineRect(ctx, w, x, y, size, size)
}
function clockAirLine(ctx, w, x, y, angle, length, size) {
  for (var d = 0; d < length; d += size)
    clockAirMark(ctx, w, x + Math.cos(angle) * d, y + Math.sin(angle) * d, size)
}
function drawClockWheel(ctx, w, pal, x, y, radius, spin) {
  var size = (w.res || 1) >= 2 ? 0.5 : 1
  ctx.fillStyle = pal.backLit
  for (var i = 0; i < radius * 5; i++) {
    var a = i / (radius * 5) * Math.PI * 2
    clockAirMark(ctx, w, x + Math.cos(a) * radius, y + Math.sin(a) * radius, 1)
  }
  for (var tooth = 0; tooth < 12; tooth++) {
    var t = tooth * Math.PI / 6 + spin
    clockAirMark(ctx, w, x + Math.cos(t) * (radius + 1), y + Math.sin(t) * (radius + 1), 1)
  }
  for (var s = 0; s < 4; s++) clockAirLine(ctx, w, x, y, spin + s * Math.PI / 2, radius, size)
  ctx.fillStyle = pal.back
  clockAirMark(ctx, w, x, y, 2)
}
function drawClockMovement(ctx, w, pal) {
  var f = clockFace(w), beat = Math.sin(w.ticks * Math.PI / 30)
  ctx.save()
  ctx.globalAlpha = 0.7
  ctx.fillStyle = pal.backLit
  // Hands reverse because the audience is behind the glass.
  clockAirLine(ctx, w, f.x, f.y, -w.ticks / 1500 - 1.2, 52, 1)
  clockAirLine(ctx, w, f.x, f.y, -w.ticks / 18000 - 2.5, 34, 1)
  clockAirLine(ctx, w, f.x - 2, f.y + 5, Math.PI / 2 + beat * 0.09, 108, 1)
  var bx = f.x - 2 - Math.round(beat * 10), by = f.y + 112
  for (var row = -5; row <= 5; row++) {
    var width = 6 - Math.abs(row)
    for (var col = -width; col <= width; col++) clockAirMark(ctx, w, bx + col, by + row, 1)
  }
  drawClockWheel(ctx, w, pal, f.x - 78, f.y + 28, 21, w.ticks / 600)
  drawClockWheel(ctx, w, pal, f.x - 47, f.y + 51, 16, -w.ticks / 450)
  drawClockWheel(ctx, w, pal, f.x + 77, f.y + 70, 25, w.ticks / 700)
  // The escapement rocks on alternate beats, above the pinion.
  ctx.fillStyle = pal.backLit
  clockAirLine(ctx, w, f.x - 48, f.y + 26, Math.PI / 2 + beat * 0.25, 12, 1)
  clockAirLine(ctx, w, f.x - 48, f.y + 38, beat * 0.25, 9, 1)
  ctx.restore()
}
function drawClockShafts(ctx, w, pal) {
  var f = clockFace(w), size = (w.res || 1) >= 2 ? 0.5 : 1
  ctx.save()
  ctx.fillStyle = pal.dust
  ctx.globalAlpha = 0.07
  for (var shaft = 0; shaft < 3; shaft++) {
    var x = f.x - 44 + shaft * 37, y = f.y - 42 + shaft * 8
    for (var d = 0; d < 110; d += 2) for (var width = 0; width < 3; width++)
      clockAirMark(ctx, w, x - d * 0.32 + width * 2, y + d, size)
  }
  ctx.restore()
}
function drawClockMachines(ctx, w, pal) {
  drawClockMovement(ctx, w, pal)
  drawClockShafts(ctx, w, pal)
  for (var i = 0; i < w.gates.length; i++) drawClockGate(ctx, w, pal, w.gates[i])
}
function clockGateDrawing(w, g) {
  var C = w.k.CELL, res = (w.res || 1) >= 2 ? 2 : 1
  var age = g.changedAt < 0 ? CLOCK_SHUTTER_TICKS : Math.max(0, w.ticks - g.changedAt)
  var p = Math.min(1, age / CLOCK_SHUTTER_TICKS), h = (g.bottom - g.top + 1) * C
  var cycle = (w.ticks + g.phase) % CLOCK_GATE_PERIOD
  return { x: g.x0 * C, y: g.top * C, width: (g.x1 - g.x0 + 1) * C, height: h,
    drop: Math.round(h * (g.open ? 1 - p : p) * res) / res,
    left: cycle < CLOCK_GATE_OPEN ? CLOCK_GATE_OPEN - cycle : CLOCK_GATE_PERIOD - cycle,
    span: cycle < CLOCK_GATE_OPEN ? CLOCK_GATE_OPEN : CLOCK_GATE_PERIOD - CLOCK_GATE_OPEN }
}
function drawClockGate(ctx, w, pal, g) {
  var b = clockGateDrawing(w, g)
  ctx.save()
  // Mask the steel cells while the bars retract; the slot remains a dark
  // recess. Agents are drawn afterwards, so a passing body is never erased.
  ctx.fillStyle = pal.backDim
  ctx.fillRect(b.x, b.y, b.width, b.height)
  ctx.fillStyle = CLOCK_DARK
  ctx.fillRect(b.x - 1, b.y - 3, 1, b.height + 3)
  ctx.fillRect(b.x + b.width, b.y - 3, 1, b.height + 3)
  ctx.fillRect(b.x - 2, b.y - 4, b.width + 4, 4) // shutter cassette
  drawClockShutter(ctx, w, b)
  drawClockGateDial(ctx, w, pal, g, b)
  ctx.restore()
}
function drawClockShutter(ctx, w, b) {
  if (b.drop <= 0) return
  ctx.fillStyle = CLOCK_BRASS
  for (var x = b.x; x < b.x + b.width; x += 3) ctx.fillRect(x, b.y, 1, b.drop)
  var rail = Math.min(1, b.drop)
  ctx.fillRect(b.x, b.y + b.drop - rail, b.width, rail)
  for (var y = b.y + b.drop - 5; y > b.y; y -= 4) ctx.fillRect(b.x, y, b.width, 1)
  if ((w.res || 1) < 2) return
  ctx.fillStyle = CLOCK_GLINT
  for (var fx = b.x; fx < b.x + b.width; fx += 3) ctx.fillRect(fx, b.y, 0.5, b.drop)
  ctx.fillRect(b.x, b.y + b.drop - 0.5, b.width, 0.5)
}
function drawClockGateDial(ctx, w, pal, g, b) {
  var x = b.x + Math.floor(b.width / 2), y = b.y - 5
  ctx.fillStyle = CLOCK_BRASS
  ctx.fillRect(x - 3, y - 3, 7, 7)
  ctx.fillStyle = pal.rigDark
  ctx.fillRect(x - 2, y - 2, 5, 5)
  ctx.fillStyle = g.open ? pal.exitLight : CLOCK_GLINT
  var angle = -Math.PI / 2 + (1 - b.left / b.span) * Math.PI * 2
  ctx.fillRect(x, y, 1, 1)
  ctx.fillRect(x + Math.round(Math.cos(angle) * 2), y + Math.round(Math.sin(angle) * 2), 1, 1)
  // Two alternately lit pawls: a visible tick-tock even while waiting shut.
  var beat = Math.floor((w.ticks + g.phase) / 15) % 2
  ctx.fillRect(b.x - 1 + beat * (b.width + 1), b.y - 2, 1, 1)
  if ((w.res || 1) < 2) return
  ctx.fillStyle = CLOCK_GLINT
  ctx.fillRect(x - 2.5, y - 2.5, 5, 0.5)
  for (var n = 0; n < 4; n++) {
    var a = n * Math.PI / 2
    ctx.fillRect(x + Math.round(Math.cos(a) * 2), y + Math.round(Math.sin(a) * 2), 0.5, 0.5)
  }
}
function drawClockEventMarker(ctx, w, pal, fx) {
  if (w.ticks >= fx.fireAt) return
  var x = (fx.x + fx.span / 2) * w.k.CELL, y = fx.floorY * w.k.CELL - 8
  ctx.save()
  ctx.fillStyle = CLOCK_GLINT
  clockRing(ctx, x, y, 3, 1)
  ctx.fillRect(x, y - 2, 1, 3)
  ctx.fillRect(x + 2, y - 1, 1, 2) // broken second hand: the missing second
  if ((w.res || 1) >= 2) {
    ctx.fillStyle = CLOCK_DARK
    ctx.fillRect(x + 2.5, y - 1, 0.5, 1)
  }
  ctx.restore()
}
function drawClockHazardStatus(ctx, w, pal, h, fade) {
  var C = w.k.CELL, x = Math.round((h.zx0 + h.zx1 + 1) * C / 2)
  var y = h.mount === "ceiling" ? h.zy0 * C + 3 : (h.zy1 + 1) * C - 5
  var stopped = w.eventMult === 0, angle = stopped ? -Math.PI / 2 : w.ticks / 3
  ctx.save()
  ctx.globalAlpha = fade
  ctx.fillStyle = pal.rigDark
  ctx.fillRect(x - 4, y - 4, 9, 9)
  ctx.fillStyle = stopped ? pal.labelFaint : CLOCK_GLINT
  clockRing(ctx, x, y, 3, 1)
  ctx.fillRect(x, y, 1, 1)
  ctx.fillRect(x + Math.round(Math.cos(angle) * 2), y + Math.round(Math.sin(angle) * 2), 1, 1)
  if (stopped) {
    ctx.fillStyle = pal.urgent
    ctx.fillRect(x - 1, y + 2, 3, 1) // locked movement
  } else {
    ctx.fillStyle = pal.fireHot
    ctx.fillRect(x - Math.round(Math.sin(angle) * 2), y + Math.round(Math.cos(angle) * 2), 1, 1)
    drawEventHeat(ctx, w, pal, x, y, fade, h.mount === "ceiling" ? 1 : -1)
  }
  if ((w.res || 1) >= 2) {
    ctx.fillStyle = CLOCK_GLINT
    ctx.fillRect(x - 2, y - 2.5, 1.5, 0.5)
  }
  ctx.restore()
}
