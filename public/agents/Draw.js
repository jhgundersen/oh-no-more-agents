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

  drawBackdrop(ctx, w, pal)

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

  if ((w.res || 1) >= 2) drawTerrainFine(ctx, w, pal)

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

  var wash = ctx.createLinearGradient(0, k.SKY * C, 0, rows * C)
  wash.addColorStop(0, pal.washTop)
  wash.addColorStop(1, pal.washLow)
  ctx.fillStyle = wash
  ctx.fillRect(0, k.SKY * C, cols * C, (rows - k.SKY) * C)

  drawDecor(ctx, w, pal)
  drawExitBack(ctx, w, pal)
  drawSea(ctx, w, pal)
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
var BUILT = { "Spaceship": true, "Factory": true, "Skyscraper": true, "Data Center": true }

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
  "Desert": backDesert, "Data Center": backDataCenter
}

function drawBackdrop(ctx, w, pal) {
  var fn = BACKDROPS[w.biome]
  if (!fn) return
  var top = w.k.SKY * w.k.CELL
  fn(ctx, backRng(w), { x: 0, y: top, w: w.k.COLS * w.k.CELL, h: w.k.ROWS * w.k.CELL - top, world: w }, pal)
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
function drawDecor(ctx, w, pal) {
  var k = w.k
  var C = k.CELL
  for (var i = 0; i < w.decor.length; i++) {
    var d = w.decor[i]
    var px = d.x * C
    var py = d.y * C

    // Ship fittings. A viewport is only drawn while the hull it is set into is
    // still there, so an agent that bashes through the wall takes the window
    // with it.
    if (d.kind === "window") {
      if (w.terrain[d.y * k.COLS + d.x] === k.EMPTY) continue
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
      continue
    }

    if (d.kind === "strip") {
      if (w.terrain[(d.y - 1) * k.COLS + d.x] === k.EMPTY) continue
      ctx.fillStyle = pal.rigDark
      ctx.fillRect(px - 6, py, 16, 2)
      ctx.fillStyle = pal.decorLit                 // the lit tube
      ctx.fillRect(px - 4, py + 1, 12, 1)
      continue
    }

    if (d.kind === "grate") {
      if (w.terrain[(d.y + 1) * k.COLS + d.x] === k.EMPTY) continue
      ctx.fillStyle = pal.decorDim
      for (var gg = 0; gg < 5; gg++) ctx.fillRect(px + gg * 3, py + C - 2, 2, 2)
      continue
    }

    // A workstation, and the one piece of decor on this board that somebody
    // was sitting at this morning. The chair is pushed back because they left
    // in a hurry, which is the level's premise.
    if (d.kind === "desk") {
      if (w.terrain[(d.y + 1) * k.COLS + d.x] === k.EMPTY) continue
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
      continue
    }

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

  case "Data Center":
    // A rack door: a heavy frame, a strip of status lights across the top,
    // and a badge reader by the handle.
    ctx.fillRect(x - 4, y - 6, ww + 8, 4)
    ctx.fillRect(x - 4, y - 2, 3, hh + 2)
    ctx.fillRect(x + ww + 1, y - 2, 3, hh + 2)
    ctx.fillStyle = pal.decorLit
    for (var sl = 0; sl < ww + 4; sl += 3) ctx.fillRect(x - 2 + sl, y - 5, 1, 1)
    ctx.fillStyle = pal.rigDark
    ctx.fillRect(x + ww + 1, y + hh / 2 - 2, 3, 4)
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
    ctx.fillRect(Math.round(mx), Math.round(my), 1, 1)
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
  if (w.wind) drawGust(ctx, w, pal)
  var fields = AMBIENCE[w.biome]
  if (!fields) return
  for (var f = 0; f < fields.length; f++) drawMotes(ctx, w, pal, fields[f], f)
  ctx.globalAlpha = 1
}

// A gust in the Desert (see `windAt` in Sim.js): streaks of sand down every
// open corridor, more and longer the harder it blows, travelling the way it
// blows. The wind slows and carries the colony, and a force nobody can see is
// a force the audience reads as agents dawdling for no reason.
function drawGust(ctx, w, pal) {
  var k = w.k, C = k.CELL
  var wide = k.COLS * C, top = k.SKY * C, tall = k.ROWS * C - top
  var force = Math.abs(w.wind), sign = w.wind > 0 ? 1 : -1
  var n = Math.round(130 * force), len = 4 + Math.round(force * 6)
  var seed = (w.level * 7121) % 65536
  var next = function () { seed = (seed * 1103515245 + 12345) % 2147483648; return (seed >> 6) / 33554432 }
  ctx.fillStyle = pal.dust
  for (var i = 0; i < n; i++) {
    var x0 = next() * wide, y = Math.floor(top + next() * tall), pace = 2.2 + next() * 1.6
    var x = Math.floor(((x0 + sign * w.ticks * pace) % wide + wide) % wide)
    if (w.terrain[Math.floor(y / C) * k.COLS + Math.floor(x / C)] !== k.EMPTY) continue
    ctx.globalAlpha = 0.25 + 0.4 * force
    ctx.fillRect(sign > 0 ? x - len : x, y, len, 1)
  }
  ctx.globalAlpha = 1
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
    ctx.fillRect(px, py, spec.size, spec.size)
  }
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
    ctx.fillRect(lx, y * C + 1 + (h >> 6) % 2, 1, 1)
  }
}

// The Data Center's updrafts (Sim's `w.updraft`): pale streaks climbing each
// column of rising air, in open air only. A safe way down that the audience
// cannot see is a safe way down that looks like luck.
function drawUpdrafts(ctx, w, pal) {
  var k = w.k, C = k.CELL, T = w.terrain, top = k.SKY * C, tall = k.ROWS * C - top
  ctx.fillStyle = pal.dust
  for (var x = 0; x < k.COLS; x++) {
    if (!w.updraft[x]) continue
    ctx.globalAlpha = 0.06                                  // the column itself
    for (var cy = k.SKY; cy < k.ROWS; cy++)
      if (T[cy * k.COLS + x] === k.EMPTY) ctx.fillRect(x * C, cy * C, C, C)
    ctx.globalAlpha = 0.4
    for (var s = 0; s < 12; s++) {
      var y = top + tall - ((w.ticks * 0.9 + s * tall / 12 + x * 13) % tall)
      if (T[Math.floor(y / C) * k.COLS + x] !== k.EMPTY) continue
      ctx.fillRect(x * C + 0.5 + (s % 3) * 1, y, 0.5, 3)
    }
  }
  ctx.globalAlpha = 1
}

function drawMachines(ctx, w, pal) {
  drawWaterLife(ctx, w, pal)
  if (w.biome === "Data Center") drawRackLights(ctx, w)
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
  if (!(w.stoodDownAt >= 0) || since > 90) return
  var k = w.k
  ctx.save()
  ctx.font = "9px monospace"
  ctx.textAlign = "center"
  ctx.globalAlpha = since < 60 ? 0.95 : 0.95 * (90 - since) / 30
  ctx.fillStyle = pal.exitLight
  ctx.fillText("STAND DOWN \u2014 EVERYBODY HOME", (k.COLS * k.CELL) / 2, (k.SKY + 1) * k.CELL)
  ctx.restore()
  ctx.globalAlpha = 1
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

function drawEventBanner(ctx, w, pal) {
  drawStandDown(ctx, w, pal)
  var warn = w.eventWarnFor > 0
  var flash = w.eventFlash > 0
  if (!warn && !flash) return
  var k = w.k
  var mid = (k.COLS * k.CELL) / 2
  var y = (k.SKY + 1) * k.CELL

  ctx.save()
  ctx.font = "9px monospace"
  ctx.textAlign = "center"
  if (warn) {
    // Blinks while it is coming, and faster as it gets closer.
    var near = w.eventWarnFor < 25
    if (Math.floor(w.ticks / (near ? 3 : 7)) % 2 === 0) {
      ctx.globalAlpha = 0.9
      ctx.fillStyle = pal.warn
      ctx.fillText("\u25b2 " + w.eventWarn + " \u25b2", mid, y)
    }
  } else {
    // Held for a moment after it lands, fading out.
    ctx.globalAlpha = Math.min(1, w.eventFlash / 40)
    ctx.fillStyle = pal.fireHot
    ctx.fillText(w.eventWarn, mid, y)
  }
  ctx.restore()
  ctx.globalAlpha = 1
}

function drawActors(ctx, w, pal, opts) {
  var k = w.k
  clearLayer(ctx, w)
  drawMachines(ctx, w, pal)
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
    if (lad.vine) { drawVine(ctx, pal, stile, lbot, lspan, lad.x); continue }

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
  if (w.prints && w.prints.length) drawPrints(ctx, w, pal)
  if (w.nets) for (var ni = 0; ni < w.nets.length; ni++) drawNet(ctx, w, w.nets[ni])
  if (w.reloadFx) drawReloadTrail(ctx, w, w.reloadFx)

  for (var i = 0; i < w.agents.length; i++) {
    var ag = w.agents[i]
    if (ag.gone) continue
    drawAgent(ctx, w, pal, ag, opts)
    drawAgentSidearm(ctx, w, pal, ag)
  }
  for (var ei = 0; ei < w.enemies.length; ei++) {
    var enemy = w.enemies[ei]
    if (!enemy.gone) {
      drawEnemy(ctx, w, pal, enemy, opts)
      if (enemy.throttled > 0) drawThrottled(ctx, w, enemy.x * w.k.CELL, (enemy.y - 4) * w.k.CELL - 4, enemy.throttled)
    }
  }
  // Last, over everybody: whoever is standing in a fireball is behind it.
  if (w.blasts) for (var bl = 0; bl < w.blasts.length; bl++) drawBlast(ctx, w, pal, w.blasts[bl])
}

function drawMission(ctx, w, pal) {
  var m = w.mission
  if (!m) return
  var C = w.k.CELL

  ctx.save()
  // Share the special's title baseline: the mission is level chrome, not a
  // label attached to whichever cage happened to be placed below it.
  ctx.font = "bold 8px monospace"
  ctx.textAlign = "center"
  var titleAlpha = m.done ? Math.max(0, 1 - (w.ticks - m.openedAt) / 45) : 1
  if (titleAlpha > 0) {
    ctx.globalAlpha = titleAlpha
    ctx.fillStyle = m.done ? pal.exitLight : pal.warn
    ctx.fillText(m.done ? "MISSION COMPLETE — EXIT ONLINE" : "MISSION: " + m.verb,
                 w.k.COLS * C / 2, 12)
    ctx.globalAlpha = 1
  }

  for (var i = 0; i < m.targets.length; i++) {
    var t = m.targets[i]
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
    if (!hunting && ag.shotTo) {
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

function drawMissionSubject(ctx, kind, t, x, y, pal, fine) {
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
  if (!w.special) return
  var sp = w.specialSpec
  if (!sp) return
  var C = w.k.CELL
  var boardW = w.k.COLS * C
  var skyH = w.k.SKY * C

  // The whole sky, edge to edge. Panelling only the part the hatch was not
  // using left a notch of bare sky around it that read as a mistake — the band
  // is one surface, and the hatch is a thing standing on it.
  ctx.fillStyle = pal.cardBack
  ctx.fillRect(0, 0, boardW, skyH)

  // The portrait goes to the outside: hard against whichever wall is furthest
  // from the hatch, with the text between it and the middle of the board. So
  // the two of them never crowd each other, and the layout mirrors when the
  // level does.
  var onRight = w.hatch.x * C < boardW / 2
  var bustW = 16
  var bustX = onRight ? boardW - 8 - bustW : 8

  ctx.fillStyle = sp.robe
  ctx.fillRect(onRight ? boardW - 2 : 0, 0, 2, skyH)   // spine, on the outside

  drawBust(ctx, bustX, 3, sp, pal, w.submerged, (w.res || 1) >= 2)

  var tx = onRight ? bustX - 8 : bustX + bustW + 8
  ctx.textAlign = onRight ? "right" : "left"

  ctx.fillStyle = sp.robe
  ctx.font = "bold 8px monospace"
  ctx.fillText(sp.name, tx, 12)

  // One line, clipped rather than wrapped — the sky is seven rows and there is
  // room for exactly one. The space is whatever is left between the portrait
  // and the hatch.
  var facts = SPECIAL_FACTS[sp.id] || [""]
  var fact = facts[(w.factPick || 0) % facts.length]
  var hatchEdge = onRight ? w.hatch.x * C + 20 : w.hatch.x * C - 20
  var room = Math.floor((onRight ? tx - hatchEdge : hatchEdge - tx) / 4.25)
  if (room < 8) return
  if (fact.length > room) fact = fact.slice(0, Math.max(1, room - 1)) + "\u2026"

  ctx.fillStyle = pal.labelFaint
  ctx.font = "7px monospace"
  ctx.fillText(fact, tx, 22)
  ctx.textAlign = "left"
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
  ctx.fillStyle = releasing && Math.floor(w.ticks / 8) % 2 === 0 ? pal.exitLight : pal.rigDark
  ctx.fillRect(x - 1, y - 13, 3, 3)

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

  // Barely larger than an agent: a sentry booth, not a second landmark. Its
  // materials come from the current theme; biome identity is in the roofline.
  ctx.fillStyle = wall
  ctx.fillRect(x - 9, y - 15, 18, 15)
  ctx.fillStyle = roof
  if (biome === "Frost") {
    ctx.fillRect(x - 6, y - 19, 12, 2); ctx.fillRect(x - 9, y - 17, 18, 2)
  } else if (biome === "Jungle") {
    ctx.fillRect(x - 11, y - 19, 22, 3); ctx.fillRect(x - 7, y - 22, 14, 3)
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

// Each of the thirty-four dangers gets its own fixture and effect; a level may
// now contain several, and shared silhouettes would turn that into visual soup.
// A hazard you cannot tell from the last one is, from where the viewer sits,
// the same hazard.
//
// Three states worth telling apart at a glance: dormant is the fixture and a
// warning stripe, winding up adds a blinking telegraph, and firing shows the
// exact projectile, beam or impact path. The telegraph is the only reason a
// danger sitting on the route is fair, so it is drawn to be unmissable.

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
  var show = live || (winding && Math.floor(t / 4) % 2 === 0)
  var hot = live ? pal.fireHot : pal.warn
  // The frame every drawing below is measured against, worked out once.
  var geo = { C: C, x0: x0, x1: x1, y0: y0, y1: y1, cx: cx, wide: wide, tall: tall,
    live: live, winding: winding, t: t, seed: seed, show: show, hot: hot }
  var draw = HAZARD_DRAW[h.kind] || drawHzDefault
  draw(ctx, w, pal, h, geo)
  var fine = (w.res || 1) >= 2 && HAZARD_FINE[h.kind]
  if (fine) fine(ctx, w, pal, h, geo)
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
    if (g.show && g.live) return
    ctx.fillStyle = "#e9edf7"                                   // teeth along both jaws
    for (var j = 0; j < 5; j += 1) {
      ctx.fillRect(g.x0 + j + 0.5, g.y1 - 3.5 - j, 0.5, 0.5)
      ctx.fillRect(g.x1 - 1.5 - j, g.y1 - 3.5 - j, 0.5, 0.5)
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
    ctx.fillStyle = Math.floor(w.ticks / 9) % 2 ? "#ff5268" : "#5c1424"
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
}

function drawHzSentry(ctx, w, pal, h, geo) {
  var C = geo.C, x0 = geo.x0, y0 = geo.y0, cx = geo.cx, wide = geo.wide,
    live = geo.live, show = geo.show, hot = geo.hot
  ctx.fillStyle = pal.rig
  ctx.fillRect(x0, y0, wide, 6)
  ctx.fillStyle = pal.rigDark
  ctx.fillRect(x0 + 1, y0 + 6, wide - 2, 2)
  ctx.fillStyle = show ? hot : pal.warn
  ctx.fillRect(cx - 2, y0 + 2, 4, 3)             // lens
  if (show) {
    ctx.fillStyle = hot
    var sentryReach = 16 * C * h.dir
    ctx.fillRect(Math.min(cx, cx + sentryReach), y0 + 4, Math.abs(sentryReach), live ? 2 : 1)
  }
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
    ctx.fillRect(cx - 3, y0 + 9, live ? 2 : 1, tall - 9)
    ctx.fillRect(cx + 3, y0 + 9, live ? 2 : 1, tall - 9)
  }
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
      var dartTravel = ((h.t * 4 + dd * 13) % (11 * C)) * h.dir
      var dx2 = cx + dartTravel
      ctx.fillRect(dx2, y0 + 3 + dd * 3, live ? 5 : 2, 1)
    }
  }
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
    for (var f = 0; f < (live ? tall - 7 : 5); f++) {
      var fw = Math.round((wide / 2) * (0.25 + (f / tall) * (live ? 1.5 : 0.5)))
      ctx.fillStyle = f % 3 === Math.floor(t / 3) % 3 ? pal.fireHot : pal.fire
      ctx.fillRect(cx - fw, y0 + 7 + f, fw * 2, 1)
    }
  }
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
    hzBolt(ctx, cx, y0 + 2, x0, y1 - 4, seed + t, live ? 2 : 1)
    hzBolt(ctx, cx, y0 + 2, x1, y1 - 4, seed + t + 3, live ? 2 : 1)
  }
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
}

// --- beam: keeps its own schedule ---------------------------------------
function drawHzLasergrid(ctx, w, pal, h, geo) {
  var x0 = geo.x0, x1 = geo.x1, y0 = geo.y0, wide = geo.wide, tall = geo.tall,
    live = geo.live, show = geo.show, hot = geo.hot
  ctx.fillStyle = pal.rig
  ctx.fillRect(x0, y0, wide, 3)
  ctx.fillStyle = pal.rigDark
  for (var e = x0 + 2; e < x1 - 1; e += 8) ctx.fillRect(e, y0 + 3, 3, 2)
  ctx.fillStyle = pal.warn
  ctx.fillRect(x0, y0 + 1, wide, 1)
  if (show) {
    ctx.fillStyle = hot
    for (var b2 = x0 + 3; b2 < x1 - 1; b2 += 8) ctx.fillRect(b2, y0 + 5, live ? 2 : 1, tall - 5)
  }
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
  ctx.fillStyle = pal.warn
  ctx.fillRect(rail + 1, y0 + 1, 6, 1)
  if (show) {
    ctx.fillStyle = hot
    for (var sv = 0; sv < tall - 5; sv++) {
      var lean = Math.round(sv * Math.sin(t * 0.05) * 0.5)
      ctx.fillRect(rail + 3 + lean, y0 + 5 + sv, live ? 3 : 1, 1)
    }
  }
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
}

// --- plate: armed by being stood on -------------------------------------
function drawHzSpikes(ctx, w, pal, h, geo) {
  var x0 = geo.x0, x1 = geo.x1, y1 = geo.y1, wide = geo.wide, live = geo.live,
    show = geo.show, hot = geo.hot
  ctx.fillStyle = pal.rig
  ctx.fillRect(x0, y1 - 3, wide, 3)                  // the plate
  ctx.fillStyle = pal.warn
  ctx.fillRect(x0 + 1, y1 - 2, wide - 2, 1)
  if (show) {
    ctx.fillStyle = hot
    for (var sp = x0 + 2; sp < x1 - 1; sp += 4) hzTri(ctx, sp, y1 - 3, 2, live ? 10 : 3, -1)
  }
}

function drawHzBeartrap(ctx, w, pal, h, geo) {
  var x0 = geo.x0, x1 = geo.x1, y1 = geo.y1, cx = geo.cx, live = geo.live,
    show = geo.show, hot = geo.hot
  // Jaws: open and waiting, or shut.
  ctx.fillStyle = pal.rig
  ctx.fillRect(cx - 1, y1 - 2, 2, 2)                 // the plate between them
  ctx.fillStyle = show && live ? hot : pal.rigDark
  if (show && live) {
    hzTri(ctx, cx - 3, y1 - 2, 3, 7, -1)
    hzTri(ctx, cx + 3, y1 - 2, 3, 7, -1)
  } else {
    for (var jw = 0; jw < 5; jw++) {
      ctx.fillRect(x0 + jw, y1 - 3 - jw, 2, 1)       // open, leaning out
      ctx.fillRect(x1 - 2 - jw, y1 - 3 - jw, 2, 1)
    }
    ctx.fillStyle = pal.warn
    ctx.fillRect(cx - 2, y1 - 3, 4, 1)
  }
}

function drawHzSawblade(ctx, w, pal, h, geo) {
  var x0 = geo.x0, y1 = geo.y1, cx = geo.cx, wide = geo.wide, live = geo.live,
    t = geo.t, show = geo.show, hot = geo.hot
  ctx.fillStyle = pal.rig
  ctx.fillRect(x0 + 2, y1 - 3, wide - 4, 3)          // slot
  ctx.fillStyle = pal.warn
  ctx.fillRect(x0 + 3, y1 - 2, wide - 6, 1)
  if (show) {
    // A disc rising out of the slot, teeth turning.
    var rise = live ? 9 : 3
    var rad = Math.min(rise, 8)
    ctx.fillStyle = hot
    for (var a2 = 0; a2 < 12; a2++) {
      var ang = (a2 / 12) * Math.PI * 2 + t * 0.25
      ctx.fillRect(Math.round(cx + Math.cos(ang) * rad), Math.round(y1 - 3 - rise / 2 + Math.sin(ang) * rad * 0.6), 2, 2)
    }
    ctx.fillRect(cx - 1, y1 - 4 - rise / 2, 2, 2)
  }
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
    var off = (t * 2 + gr) % 4
    ctx.fillRect(x0 + gr + (gr < wide / 2 ? off : 3 - off), y1 - 7, 2, live ? 4 : 2)
  }
}

// --- cycle: never triggers, never stops ---------------------------------
function drawHzCrusher(ctx, w, pal, h, geo) {
  var x0 = geo.x0, x1 = geo.x1, y0 = geo.y0, wide = geo.wide, tall = geo.tall,
    live = geo.live, winding = geo.winding, hot = geo.hot
  // A block on two rams, hanging high or driven down.
  var drop = live ? tall - 8 : (winding ? 3 : 0)
  ctx.fillStyle = pal.rigDark
  ctx.fillRect(x0 + 3, y0, 2, 4 + drop)
  ctx.fillRect(x1 - 5, y0, 2, 4 + drop)
  ctx.fillStyle = live ? hot : pal.rig
  ctx.fillRect(x0, y0 + 4 + drop, wide, 7)
  ctx.fillStyle = pal.warn
  ctx.fillRect(x0 + 1, y0 + 5 + drop, wide - 2, 1)
}

function drawHzPendulum(ctx, w, pal, h, geo) {
  var y0 = geo.y0, cx = geo.cx, wide = geo.wide, tall = geo.tall, t = geo.t,
    show = geo.show, hot = geo.hot
  // A blade on an arm, swinging from a pivot.
  var sw = Math.sin(t * 0.06) * (wide / 2 - 2)
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
    for (var pu = 0; pu < (live ? tall - 4 : 4); pu++) {
      var pw = Math.round((wide / 2) * (0.3 + (pu / tall) * (live ? 1.4 : 0.4)))
      ctx.fillStyle = (pu + Math.floor(t / 2)) % 4 === 0 ? pal.fireHot : hot
      ctx.fillRect(cx - pw, y1 - 4 - pu, pw * 2, 1)
    }
  }
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
  if (show) {
    // Rocks on their way down, at staggered heights.
    ctx.fillStyle = live ? pal.rig : pal.warn
    for (var rk = 0; rk < 4; rk++) {
      var rockX = (h.zx0 + 0.5 + ((rk * 2.3 + h.fired) % Math.max(1, h.zx1 - h.zx0 + 1))) * C
      var ry = (h.zy0 + ((h.t * 0.55 + rk * 3.1) % Math.max(1, h.zy1 - h.zy0 + 1))) * C
      ctx.fillRect(rockX, ry, live ? 4 : 2, live ? 4 : 2)
    }
  }
}

function drawHzPiston(ctx, w, pal, h, geo) {
  var x0 = geo.x0, y0 = geo.y0, wide = geo.wide, tall = geo.tall,
    live = geo.live, winding = geo.winding, show = geo.show, hot = geo.hot
  // A ram in a housing, driven out sideways.
  var ext = live ? wide - 6 : (winding ? 3 : 0)
  ctx.fillStyle = pal.rig
  ctx.fillRect(x0, y0, 5, tall)                      // housing
  ctx.fillStyle = pal.rigDark
  ctx.fillRect(x0 + 5, y0 + 2, ext, tall - 4)        // the ram
  ctx.fillStyle = show ? hot : pal.warn
  ctx.fillRect(x0 + 5 + ext, y0 + 1, 3, tall - 2)    // the head
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
  hzTri(ctx, cx - 5, y0 + 4, 5, 4, 1)
  hzTri(ctx, cx + 5, y0 + 4, 5, 4, 1)
  // The screech, out to where it actually kills: three rings travelling to
  // the full reach either side. It used to stop at five cells while the
  // lethal zone ran to fifteen — the colony died to something nobody could see.
  if (show) {
    var span = (h.reach || 9) * geo.C
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
}

function drawHzScarab(ctx, w, pal, h, geo) {
  var C = geo.C, x0 = geo.x0, y1 = geo.y1, cx = geo.cx, wide = geo.wide,
    live = geo.live, t = geo.t, show = geo.show, hot = geo.hot
  ctx.fillStyle = pal.rigDark
  ctx.fillRect(x0, y1 - 2, wide, 2)
  for (var sca = 0; sca < 5; sca++) {
    var scx = cx + h.dir * ((sca * 7 + (live ? t * 2 : t >> 2)) % (10 * C))
    ctx.fillStyle = show ? hot : pal.rig
    ctx.fillRect(scx, y1 - 5 - (sca % 2), 3, 2)
    ctx.fillRect(scx + 1, y1 - 7 - (sca % 2), 1, 2)
  }
}

function drawHzSnowball(ctx, w, pal, h, geo) {
  var C = geo.C, x0 = geo.x0, y0 = geo.y0, wide = geo.wide, live = geo.live,
    show = geo.show, hot = geo.hot
  ctx.fillStyle = pal.rigDark
  ctx.fillRect(x0, y0, wide, 2)
  ctx.fillStyle = show ? hot : pal.decorLit
  for (var sn = 0; sn < 4; sn++) {
    var snowX = (h.zx0 + 0.5 + ((sn * 2.3 + h.fired) % Math.max(1, h.zx1 - h.zx0 + 1))) * C
    var sny = (h.zy0 + ((h.t * 0.55 + sn * 3.1) % Math.max(1, h.zy1 - h.zy0 + 1))) * C
    var snr = live ? 4 : 2
    ctx.fillRect(snowX - snr, sny - snr, snr * 2, snr * 2)
  }
}

function drawHzMolten(ctx, w, pal, h, geo) {
  var C = geo.C, x0 = geo.x0, y0 = geo.y0, wide = geo.wide, live = geo.live,
    show = geo.show, hot = geo.hot
  ctx.fillStyle = pal.rigDark
  ctx.fillRect(x0, y0, wide, 3)
  ctx.fillStyle = show ? hot : pal.warn
  for (var ml = 0; ml < 4; ml++) {
    var moltenX = (h.zx0 + 0.5 + ((ml * 2.3 + h.fired) % Math.max(1, h.zx1 - h.zx0 + 1))) * C
    var mly = (h.zy0 + ((h.t * 0.55 + ml * 3.1) % Math.max(1, h.zy1 - h.zy0 + 1))) * C
    ctx.fillRect(moltenX, mly, live ? 3 : 1, live ? 5 : 2)
  }
}

function drawHzVinelock(ctx, w, pal, h, geo) {
  var x0 = geo.x0, y1 = geo.y1, wide = geo.wide, tall = geo.tall,
    live = geo.live, winding = geo.winding, show = geo.show, hot = geo.hot
  ctx.fillStyle = pal.decorDim
  ctx.fillRect(x0, y1 - 2, wide, 2)
  ctx.fillStyle = show ? hot : pal.decor
  for (var vl = 1; vl < wide; vl += 4) {
    var vh = live ? tall - 2 : (winding ? 5 : 2)
    for (var vv = 0; vv < vh; vv++) ctx.fillRect(x0 + vl + ((vv >> 2) % 2), y1 - 3 - vv, 2, 1)
  }
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
}

function drawHzPacketloss(ctx, w, pal, h, geo) {
  var x0 = geo.x0, y0 = geo.y0, wide = geo.wide, tall = geo.tall,
    live = geo.live, t = geo.t, show = geo.show, hot = geo.hot
  ctx.fillStyle = pal.rigDark
  ctx.fillRect(x0, y0, wide, 3)
  ctx.fillStyle = show ? hot : pal.warn
  for (var pk = 0; pk < 18; pk++) {
    if ((pk + Math.floor(t / 3)) % 4 === 0) continue
    var pkx = x0 + ((pk * 7) % Math.max(1, wide))
    var pky = y0 + 4 + ((pk * 11 + t) % Math.max(1, tall - 5))
    ctx.fillRect(pkx, pky, live ? 3 : 1, live ? 2 : 1)
  }
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
  var reach = live ? 1 : (winding ? -0.3 + ((Math.floor(t / 2) % 2) * 0.1) : 0.35)
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
  var spin = t * (live ? 0.9 : (winding ? 0.5 : 0.08))
  ctx.fillStyle = show ? hot : pal.rigDark
  for (var b = 0; b < 3; b++) {
    var a = spin + b * 2.094
    ctx.fillRect(Math.round(cx + Math.cos(a) * 3) - 1, Math.round(cy + Math.sin(a) * 3) - 1, 2, 2)
  }
  ctx.fillRect(cx - 1, cy - 1, 2, 2)
  if (!live) return
  ctx.fillStyle = hot
  var reach = (h.reach || 10) * C
  for (var s = 0; s < 4; s++) {
    var sx = cx + h.dir * (((t * 3 + s * reach / 4) % reach) + 4)
    ctx.globalAlpha = 0.7 * (1 - s / 5)
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
  var rear2 = live ? 0 : (winding ? 4 : 2)
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
    : (winding ? wide * 0.5 : (0.5 + 0.5 * Math.sin(t * 0.018 + seed)) * (wide - 22))
  var shdir = h.zx0 % 2 === 0 ? 1 : -1
  var shx = Math.round(shdir > 0 ? x0 + swim : x1 - swim - 22)
  var shy = Math.round(y0 + tall * 0.42 + Math.sin(t * 0.05) * 2)
  var nose = shdir > 0 ? shx + 22 : shx

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
    var rate = live ? 3.4 : 1.1
    var span = wide + 40
    var head = ((t * rate + fl * 23) % span)
    var fx2 = flowDir > 0 ? x0 - 20 + head : x1 + 20 - head
    var len = live ? 16 : 9
    ctx.globalAlpha = live ? 0.85 : 0.42
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
    var cbx = x0 + (((t * (live ? 4.2 : 1.4)) + cb * 31) % Math.max(1, wide))
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
      var vy = y1 - 4 - vlife * tall
      if (vy < y0) continue
      ctx.globalAlpha = (live ? 0.85 : 0.4) * (1 - vlife * 0.8)
      ctx.fillStyle = live ? pal.bubbleLit : pal.bubble
      var vsz = vlife > 0.6 ? 2 : 1
      ctx.fillRect(Math.round(vx), Math.round(vy), vsz, vsz)
    }
    ctx.globalAlpha = 1
  }
}

function drawHzSpores(ctx, w, pal, h, geo) {
  var x0 = geo.x0, y0 = geo.y0, cx = geo.cx, wide = geo.wide, tall = geo.tall,
    live = geo.live, t = geo.t, show = geo.show, hot = geo.hot
  // A pod that splits, and a drift of spores under it.
  ctx.fillStyle = pal.rigDark
  ctx.fillRect(cx - 4, y0, 8, 4)
  ctx.fillStyle = show ? hot : pal.rig
  ctx.fillRect(cx - 5, y0 + 4, 10, 2)
  if (show) {
    ctx.fillStyle = hot
    for (var sp2 = 0; sp2 < 14; sp2++) {
      var sy3 = y0 + 6 + ((t + sp2 * 9) % Math.max(1, tall - 6))
      var sx3 = x0 + ((sp2 * 5 + Math.floor(t / 6)) % Math.max(1, wide))
      ctx.fillRect(sx3, sy3, live ? 2 : 1, live ? 2 : 1)
    }
  }
}

// --- ice cave -----------------------------------------------------------
function drawHzIcicle(ctx, w, pal, h, geo) {
  var x0 = geo.x0, y0 = geo.y0, wide = geo.wide, tall = geo.tall,
    live = geo.live, winding = geo.winding, t = geo.t, show = geo.show,
    hot = geo.hot
  // Hanging, until it isn't.
  ctx.fillStyle = pal.rigDark
  ctx.fillRect(x0, y0, wide, 2)
  var drop2 = live ? tall - 10 : (winding ? 2 : 0)
  ctx.fillStyle = show ? hot : pal.rig
  for (var ic = 0; ic < 3; ic++) {
    var icx = x0 + 2 + ic * Math.max(3, Math.round((wide - 4) / 3))
    hzTri(ctx, icx, y0 + 2 + drop2, 2, 8, 1)
  }
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
    for (var fj = 0; fj < (live ? 12 * C : 6); fj++) {
      var fh = Math.round(1 + fj * (live ? 0.18 : 0.1))
      ctx.fillRect(cx + h.dir * fj, y0 + 4 - fh / 2, 1, fh + 1)
    }
  }
}

// --- spaceship ----------------------------------------------------------
function drawHzAirlock(ctx, w, pal, h, geo) {
  var x0 = geo.x0, y0 = geo.y0, y1 = geo.y1, wide = geo.wide, tall = geo.tall,
    live = geo.live, winding = geo.winding, show = geo.show, hot = geo.hot
  // Floor plates that part, and everything above them goes.
  var gap2 = live ? Math.round(wide / 2) - 2 : (winding ? 2 : 0)
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
  ctx.fillRect(cx - 2, y0 + 3, 4, live ? tall - 9 : 6)    // the ram
  var headY = live ? y1 - 6 : y0 + 9
  ctx.fillRect(x0 + 2, headY, wide - 4, 6)                // the head
  ctx.fillStyle = pal.rigDark
  for (var sb = 0; sb < wide - 6; sb += 4)                // its bolts
    ctx.fillRect(x0 + 3 + sb, headY + 2, 2, 2)
  if (show) {
    ctx.fillStyle = hot
    ctx.fillRect(x0 + 2, live ? y1 - 1 : headY + 6, wide - 4, 1)
  }
}

function drawHzFlywheel(ctx, w, pal, h, geo) {
  var y0 = geo.y0, cx = geo.cx, wide = geo.wide, tall = geo.tall,
    live = geo.live, winding = geo.winding, t = geo.t, hot = geo.hot
  // A wheel that idles and then runs up. Dormant it turns slowly, live it
  // blurs into a disc and throws its spokes out as a ring.
  var fr = Math.min(wide, tall) / 2 - 1
  var fcx = cx, fcy = y0 + tall / 2
  var rate = live ? 0.42 : (winding ? 0.16 : 0.04)
  ctx.fillStyle = pal.rigDark
  ctx.fillRect(fcx - fr - 1, fcy - 1, fr * 2 + 2, 2)      // the shaft
  ctx.fillStyle = pal.rig
  for (var sp = 0; sp < 6; sp++) {
    var sa = t * rate + sp * Math.PI / 3
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
    for (var jv = 0; jv < tall - 6; jv += 2) {
      var lift = live ? 1 : 0.45
      var wj = 2 + Math.round(jv * 0.22 * lift)
      ctx.globalAlpha = (live ? 0.75 : 0.35) * (1 - jv / (tall - 6))
      ctx.fillStyle = jv % 4 === 0 ? hot : pal.decorLit
      ctx.fillRect(cx - wj / 2 + Math.sin((t * 0.12) + jv * 0.4) * 2,
                   y1 - 7 - jv, wj, 2)
    }
    ctx.globalAlpha = 1
  }
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
      var reach = live ? tall - 8 : 6
      for (var sd = 0; sd < reach; sd += 3) {
        var spread = Math.round(sd * 0.35)
        ctx.globalAlpha = live ? 0.8 - sd / (tall * 1.6) : 0.4
        ctx.fillRect(swx - spread + ((t + sd * 3) % 5) - 2, y0 + 7 + sd, 1, 2)
        ctx.fillRect(swx + spread - ((t + sd * 5) % 5) + 1, y0 + 7 + sd, 1, 2)
      }
    }
    ctx.globalAlpha = 1
  }
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
  ctx.fillStyle = live ? hot : pal.steelShade
  for (var pb = 0; pb < 5; pb++)                          // the pad, spinning
    ctx.fillRect(pcx - 5 + ((pb * 3 + t) % 10), y1 - 1, 2, 1)
  if (show) {
    ctx.globalAlpha = 0.5
    ctx.fillStyle = pal.decorLit
    for (var pf = 0; pf < 4; pf++)
      ctx.fillRect(pcx - 7 + pf * 4, y1 - 6 - ((t + pf * 7) % 5), 2, 1)
    ctx.globalAlpha = 1
  }
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
}

function drawHzServo(ctx, w, pal, h, geo) {
  var x0 = geo.x0, y0 = geo.y0, cx = geo.cx, wide = geo.wide, tall = geo.tall,
    live = geo.live, winding = geo.winding, show = geo.show, hot = geo.hot
  // An arm on a rail that swings down and sweeps.
  var swing2 = live ? 1 : (winding ? 0.5 : 0)
  ctx.fillStyle = pal.rigDark
  ctx.fillRect(x0, y0, wide, 3)
  ctx.fillStyle = pal.rig
  ctx.fillRect(cx - 2, y0 + 3, 4, Math.round(4 + swing2 * (tall - 8)))
  ctx.fillStyle = show ? hot : pal.warn
  var armY = y0 + 3 + Math.round(4 + swing2 * (tall - 8))
  ctx.fillRect(cx - Math.round(wide / 2 * swing2) - 1, armY, Math.round(wide * swing2) + 2, 2)
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
    drawHazardKind(ctx, w, pal, resting)
    drawThrottled(ctx, w, cx, y0 - 6, h.throttled)
  } else {
    drawHazardKind(ctx, w, pal, h)
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

function drawAgentBody(ctx, w, pal, ag, ox, oy, dir, robe, skin, st, bodyDrop, walkLead, squash) {
  if (st === "height" && ag.heightMode === "cushion") return drawPoseTucked(ctx, w, pal, ag, ox, oy, dir, robe, st, bodyDrop)
  if (w.submerged && (st === "walk" || st === "swim")) return drawPoseSwim(ctx, w, pal, ag, ox, oy, dir, robe, st, bodyDrop)
  if (st === "saved") return drawAgentHome(ctx, w, pal, ag, ox, oy, dir, robe, skin)
  var pose = AGENT_POSES[st]
  if (pose) return pose(ctx, w, pal, ag, ox, oy, dir, robe, st, bodyDrop)
  drawAgentWalk(ctx, ag, ox, oy, dir, robe, skin, walkLead, squash, bodyDrop, st === "walk")
}

function drawPoseClimb(ctx, w, pal, ag, ox, oy, dir, robe, st, bodyDrop) {
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
  blit(ctx, ox, oy, dir, 1, 7, 6, 6)
  blit(ctx, ox, oy, dir, -2, 8, 3, 2)
  blit(ctx, ox, oy, dir, 7, 8, 3, 2)
  blit(ctx, ox, oy, dir, 1, 13, 6, 3)
}

function drawPoseBuild(ctx, w, pal, ag, ox, oy, dir, robe, st, bodyDrop) {
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
  var brolly = pal.umbrellas
    ? pal.umbrellas[(ag.id + (w.colonySeed || 0)) % pal.umbrellas.length]
    : pal.umbrella

  if ((w.res || 1) >= 2) drawUmbrellaFine(ctx, pal, ox, oy, flex, brolly)
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
function drawAgentWalk(ctx, ag, ox, oy, dir, robe, skin, walkLead, squash, bodyDrop, walking) {
  var walkTop = 7 + Math.max(bodyDrop, -1)
  blit(ctx, ox, oy, dir, 1, walkTop, 6, 13 - walkTop)
  if (squash) {
    blit(ctx, ox, oy, dir, 1, 13, 2, 3)            // knees out, taking it
    blit(ctx, ox, oy, dir, 5, 13, 2, 3)
  } else {
    blit(ctx, ox, oy, dir, 2 + walkLead, 13, 2, 3)
    blit(ctx, ox, oy, dir, 4 - walkLead, 13, 2, 3)
  }
  // Hands, swinging against the legs: the one in front when the far leg is
  // forward. A pixel each, but a walk with no arms in it is a slide.
  if (walking && walkLead !== 0 && !squash) {
    ctx.fillStyle = skin
    blit(ctx, ox, oy, dir, walkLead < 0 ? 6 : 0, 11 + Math.max(bodyDrop, -1), 1, 1)
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
function drawUmbrellaFine(ctx, pal, ox, oy, flex, brolly) {
  var cx = ox + 4.5, top = oy - 11 - flex * 0.5, base = oy - 7
  var rows = Math.round((base - top) * 2)
  for (var r = 0; r <= rows; r++) {
    var y = top + r * 0.5, q = (r + 1) / (rows + 1)
    var half = Math.round(6.5 * Math.sqrt(1 - (1 - q) * (1 - q)) * 2) / 2
    ctx.fillStyle = brolly
    ctx.fillRect(cx - half, y, half * 2, 0.5)
    ctx.globalAlpha = 0.28                                  // every other panel in shade
    ctx.fillStyle = "#000000"
    ctx.fillRect(cx - half * 0.5, y, half * 0.5, 0.5)
    ctx.fillRect(cx + half * 0.5, y, half * 0.5, 0.5)
    ctx.globalAlpha = 1
  }
  ctx.fillStyle = pal.umbrellaRim
  ctx.fillRect(cx - 6.5, base, 13, 0.5)                     // the rim
  for (var rib = -1; rib <= 1; rib += 2)                    // tips hanging off it
    ctx.fillRect(cx + rib * 6.5 - (rib > 0 ? 0.5 : 0), base + 0.5, 0.5, 1)
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

// A Jungle vine down a wall face (a ladder in everything but looks): a
// wavering stem with leaves off it on alternate sides, so it reads as
// something that grew there and not as something somebody brought.
function drawVine(ctx, pal, stile, lbot, lspan, seed) {
  for (var y = 0; y < lspan; y++) {
    var wob = Math.round(Math.sin((y + seed * 3) * 0.35))
    ctx.fillStyle = pal.decor
    ctx.fillRect(stile + 1 + wob, lbot - y - 1, 1, 1)
    if (y % 4 === seed % 4) {
      ctx.fillStyle = pal.decorLit
      ctx.fillRect(stile + 1 + wob + ((y >> 2) % 2 ? 1 : -2), lbot - y - 1, 2, 1)
    }
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
// Upright poses only — the rest move the parts around.
var FINE_POSES = { walk: true, block: true, ride: true, bash: true, wait: true, camp: true, trick: true }
function drawAgentFine(ctx, pal, ag, ox, oy, dir, drop, lead, squash, robe) {
  if (!FINE_POSES[ag.state]) return
  var hy = drop
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
  var l1 = squash ? 1 : 2 + lead, l2 = squash ? 5 : 4 - lead
  blitFine(ctx, ox, oy, dir, l1, 15, 2.5, 1)
  blitFine(ctx, ox, oy, dir, l2, 15, 2.5, 1)
  ctx.fillStyle = robe
}

function blit(ctx, ox, oy, dir, x, y, bw, bh) {
  var sx = dir > 0 ? ox + x : ox + (SPRITE_W - x - bw)
  var sy = spriteFlip ? oy + (SPRITE_PX - y - bh) : oy + y
  ctx.fillRect(Math.round(sx), Math.round(sy), bw, bh)
}

function drawEnemy(ctx, w, pal, en, opts) {
  var C = w.k.CELL
  var ox = Math.round(en.x * C) - SPRITE_W / 2
  var oy = Math.round((en.y + 1) * C) - SPRITE_PX
  var dir = en.dir
  var red = "#8f1f35"
  var redLit = "#ff5268"
  var pale = "#d9d7cf"

  if (en.kind === "drone") {
    // A compact quadcopter: asymmetric lamp and tail make its direction clear
    // while the alternating rotors keep it alive at this scale.
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
    if (opts && opts.labels) {
      ctx.fillStyle = redLit
      ctx.font = "7px monospace"
      ctx.textAlign = "center"
      ctx.fillText("Remote Execution", ox + 5, oy + 1)
    }
    ctx.globalAlpha = 1
    return
  }

  if (en.kind === "operator") {
    // Four broad shapes survive this scale better than a miniature console:
    // dark helmet, cyan visor, amber coat and square radio pack. The controller
    // is one bright block held out front, not a collection of tiny controls.
    var amber = "#c47a24"
    var amberLit = "#f0b34f"
    ctx.fillStyle = "#34313a"
    ctx.fillRect(ox, oy + 1, 9, 5)                 // broad helmet
    ctx.fillRect(ox - 1, oy + 7, 3, 7)             // square radio pack
    ctx.fillStyle = "#86d8e8"
    ctx.fillRect(ox + (dir > 0 ? 4 : 1), oy + 3, 5, 2) // single visor
    ctx.fillStyle = amber
    ctx.fillRect(ox + 2, oy + 6, 7, 8)              // one-piece coat
    ctx.fillStyle = amberLit
    ctx.fillRect(dir > 0 ? ox + 8 : ox, oy + 9, 4, 3) // controller
    ctx.fillStyle = "#34313a"
    var opStride = en.state === "deploy" ? (en.anim >> 2) % 2 : 0
    ctx.fillRect(ox + 2 + opStride, oy + 14, 2, 3)
    ctx.fillRect(ox + 7 - opStride, oy + 14, 2, 3)
    ctx.fillStyle = redLit
    ctx.fillRect(ox, oy + 9, 1, 2)                  // small red-team lamp
    if ((w.res || 1) >= 2) drawOperatorFine(ctx, w, ox, oy, dir)
    if (opts && opts.labels) {
      ctx.fillStyle = amberLit
      ctx.font = "7px monospace"
      ctx.textAlign = "center"
      ctx.fillText("Drone Operator", ox + 4, oy - 4)
    }
    ctx.globalAlpha = 1
    return
  }

  // The xenomorph. It has to read as not-an-agent at a glance and from a
  // silhouette alone, because the whole event turns on noticing that one of
  // the blue rectangles is now a low, long, wrong-coloured thing. Nothing
  // about it is square: it crouches, it is longer than it is tall, and the
  // head is out in front of the body rather than on top of it.
  if (en.kind === "xeno") {
    var xg = "#3f7d4a"
    var xgLit = "#7de37a"
    var lope = Math.floor(en.anim / 5) % 4
    var bob = lope === 1 || lope === 3 ? 1 : 0

    ctx.fillStyle = xg
    blit(ctx, ox, oy, dir, 1, 11 + bob, 8, 4)        // the long body
    blit(ctx, ox, oy, dir, 7, 8 + bob, 4, 4)         // shoulders, forward
    ctx.fillStyle = xgLit
    blit(ctx, ox, oy, dir, 9, 7 + bob, 5, 3)         // the head, out in front
    ctx.fillStyle = "#0f1a12"
    blit(ctx, ox, oy, dir, 11, 8 + bob, 2, 1)        // no eyes, just the socket

    // The tail: a counterweight that swings against the legs, which is most
    // of what makes it read as moving rather than sliding.
    ctx.fillStyle = xg
    var sway = Math.round(Math.sin(en.anim * 0.22) * 2)
    blit(ctx, ox, oy, dir, -3, 10 + sway, 4, 2)
    blit(ctx, ox, oy, dir, -6, 9 + sway * 2, 3, 2)

    // Legs, out of phase with each other.
    ctx.fillStyle = "#2c5a35"
    blit(ctx, ox, oy, dir, 2, 15 + bob, 2, 3 - bob)
    blit(ctx, ox, oy, dir, 6, 15 + (1 - bob), 2, 3 - (1 - bob))

    if (en.touchCool > 0) {
      // Sated, briefly. The one moment it is not a threat, and it says so.
      ctx.globalAlpha = 0.5
      ctx.fillStyle = xgLit
      blit(ctx, ox, oy, dir, 9, 5 + bob, 2, 1)
      ctx.globalAlpha = 1
    }
    if (opts && opts.labels) {
      ctx.fillStyle = xgLit
      ctx.font = "7px monospace"
      ctx.textAlign = "center"
      ctx.fillText("Adversarial Input", ox + 4, oy - 4)
    }
    return
  }

  // The rival salvage crew. A diver in the same period dress as the colony —
  // that is the joke, and it is why the helmet is the same brass — with a
  // speargun instead of a shovel. Drawn before the shared aim and tracer code
  // below, which it deliberately does not use: a spear is a thing that flies,
  // not a line that appears, so it gets its own projectile with a line paying
  // out behind it.
  if (en.kind === "harpoon") {
    drawEnemyDiver(ctx, w, pal, en, ox, oy, dir, true)
    if (opts && opts.labels) {
      ctx.fillStyle = "#c39a45"
      ctx.font = "7px monospace"
      ctx.textAlign = "center"
      ctx.fillText("Spear Phishing", ox + 4, oy - 4)
    }
    return
  }

  // Trigger Warning announces the shot before it happens. The thin blinking
  // sight is an instruction to flee; the bright tracer is the consequence.
  if ((en.kind === "gun" || en.kind === "sniper") && en.state === "aim") {
    ctx.globalAlpha = 0.35 + ((en.timer >> 2) % 2) * 0.35
    ctx.fillStyle = redLit
    var aimX = Math.round(en.lineTo * C)
    var aimY = Math.round((en.lineY + 0.5) * C)
    var aimFromX = en.kind === "sniper" ? (dir > 0 ? ox + 22 : ox - 12) : ox + 4
    var aimFromY = en.kind === "sniper" ? oy + 12 : oy + 7
    var aimSteps = Math.max(1, Math.round(Math.abs(aimX - aimFromX) / 3))
    for (var ai = 0; ai <= aimSteps; ai++)
      ctx.fillRect(Math.round(aimFromX + (aimX - aimFromX) * ai / aimSteps),
                   Math.round(aimFromY + (aimY - aimFromY) * ai / aimSteps), 1, 1)
    ctx.globalAlpha = 1
  }
  if ((en.kind === "gun" || en.kind === "sniper") && en.shotFor > 0) {
    ctx.globalAlpha = Math.min(1, en.shotFor / 4)
    ctx.fillStyle = "#ffe68a"
    var shotX = Math.round(en.lineTo * C)
    var shotY = Math.round((en.lineY + 0.5) * C)
    var shotFromX = en.kind === "sniper" ? (dir > 0 ? ox + 22 : ox - 12) : ox + 4
    var shotFromY = en.kind === "sniper" ? oy + 12 : oy + 8
    var shotSteps = Math.max(1, Math.round(Math.abs(shotX - shotFromX) / 3))
    for (var si = 0; si <= shotSteps; si++)
      ctx.fillRect(Math.round(shotFromX + (shotX - shotFromX) * si / shotSteps),
                   Math.round(shotFromY + (shotY - shotFromY) * si / shotSteps), 2, 1)
    ctx.globalAlpha = 1
  }

  if (en.kind === "sniper") {
    // Slim while moving, almost horizontal once established. The rifle and
    // body share one low line in camp so this reads as somebody lying down,
    // not another square agent carrying an oversized gun.
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
      ctx.fillRect(ox + 2, oy + 14, 2, 3)
      ctx.fillRect(ox + 5, oy + 14, 2, 3)
    }
    ctx.fillStyle = redLit
    ctx.fillRect(dir > 0 ? rifleX + 2 : rifleX + 11, oy + (posted ? 9 : 7), 1, 1)
    if ((w.res || 1) >= 2) drawSniperFine(ctx, ox, oy, dir, rifleX, posted)
    if (en.shotFor > 5) {
      ctx.fillStyle = "#ffe68a"
      hzTri(ctx, dir > 0 ? rifleX + 13 : rifleX - 4, oy + (posted ? 10 : 7), 3, 5, dir)
    }
    if (opts && opts.labels) {
      ctx.fillStyle = "#a98bd0"
      ctx.font = "7px monospace"
      ctx.textAlign = "center"
      ctx.fillText(posted ? "Long Context" : "Scope Creep", ox + 4, oy - 4)
    }
    ctx.globalAlpha = 1
    return
  }

  spriteFlip = false

  // Nobody stands on the sea floor in a coat. The roster already keeps the
  // drone operator and the planted sniper out of the Trench — a quadcopter at
  // forty atmospheres is not a joke — but the ordinary gunner still turned up
  // in a hood with a rifle, which is the one thing down here wearing no air.
  // It gets the same dress as everyone else in the water, and it is the same
  // enemy underneath: same walk, same aim, same reload, same lethality. Only
  // the kit and the weapon change, which is exactly how the colony itself is
  // handled a few hundred lines down.
  if (w.submerged) {
    drawEnemyDiver(ctx, w, pal, en, ox, oy, dir, false)
    if (opts && opts.labels) {
      ctx.fillStyle = "#c39a45"
      ctx.font = "7px monospace"
      ctx.textAlign = "center"
      ctx.fillText("Salvage Rights", ox + 4, oy - 4)
    }
    ctx.globalAlpha = 1
    return
  }

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

  ctx.fillStyle = "#25252b"
  blit(ctx, ox, oy, dir, 6, 7, 5, 3)                // pistol
  blit(ctx, ox, oy, dir, 7, 10, 2, 3)
  if (en.shotFor > 5) {
    ctx.fillStyle = "#ffe68a"
    hzTri(ctx, dir > 0 ? ox + 13 : ox - 5, oy + 8, 3, 5, dir)
  }
  if (en.state === "jet") {
    // Two uneven exhaust tongues make the tiny pack read even at panel scale.
    var flame = (en.anim >> 1) % 2
    ctx.fillStyle = "#ff8a35"
    blit(ctx, ox, oy, dir, 0, 14, 1, 3 + flame)
    ctx.fillStyle = "#ffe68a"
    blit(ctx, ox, oy, dir, 1, 14, 1, 2 + (1 - flame))
  }

  ctx.fillStyle = red
  var stride = (en.anim >> 2) % 2
  blit(ctx, ox, oy, dir, 1 + stride, 13, 2, 3)
  blit(ctx, ox, oy, dir, 5 - stride, 13, 2, 3)
  if ((w.res || 1) >= 2) drawGunnerFine(ctx, ox, oy, dir, stride, en.state === "jet")

  if (opts && opts.labels) {
    ctx.fillStyle = redLit
    ctx.font = "7px monospace"
    ctx.textAlign = "center"
    var enemyLabel = "Trigger Warning"
    if (en.state === "jet") enemyLabel = en.jetMode === "rise" ? "Stack Ascending"
      : (en.jetMode === "land" ? "Soft Landing" : "Air-gapped")
    ctx.fillText(enemyLabel, ox + 4, oy - 4)
  }
  ctx.globalAlpha = 1
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
function drawOperatorFine(ctx, w, ox, oy, dir) {
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
  ctx.fillRect(cx, oy + 8.5, 0.5, 0.5); ctx.fillRect(cx + 1.5, oy + 8.5, 0.5, 0.5)   // sticks
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

// The gunner's half-pixel detail at res 2 (see drawAgentFine for the colony's
// own): the same rule — all of it inside the coarse silhouette. Where the
// agents got a suit, the red team gets kit: a scarred brow over an eye with a
// hot core, a shadowed crest, a vest with straps and a buckled belt, vents on
// the pack, a lit edge along the pistol's slide, and boots.
function drawGunnerFine(ctx, ox, oy, dir, stride, jet) {
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
  blitFine(ctx, ox, oy, dir, 6.5, 7, 4.5, 0.5)                  // the slide's lit edge
  if (jet) return
  ctx.fillStyle = "#16161b"
  blitFine(ctx, ox, oy, dir, 1 + stride, 15, 2.5, 1)            // boots
  blitFine(ctx, ox, oy, dir, 5 - stride, 15, 2.5, 1)
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
function drawEnemyDiver(ctx, w, pal, en, ox, oy, dir, big) {
  var C = w.k.CELL
  // Red team, in a diving suit. The first version put them in a colder teal
  // than the colony's charcoal and it was not enough: at the scale this is
  // actually played, the difference between two dark blue-greys is nothing and
  // the only tell left was a single red pixel in the port. Every other hostile
  // on the board is read by its colour before anything else, so these are too
  // — the helmet stays brass, because they are the same era and that is the
  // joke, and the suit under it is the same oxblood the dry-land squad wears.
  var suit = "#6b1f2e"
  var suitDark = "#4a1520"
  var kick = Math.sin(en.anim * 0.22)
  var lift = Math.round(kick * 1.2)

  // Exhaust, on the same rule as the colony's: it is what says the thing is
  // breathing, and an enemy diver that did not bubble would read as a statue.
  for (var b = 0; b < 3; b++) {
    var life = (((w.ticks * 0.9 + en.id * 37) + b * 33) % 108) / 108
    ctx.globalAlpha = 0.55 * (1 - life * 0.75)
    ctx.fillStyle = life > 0.5 ? (pal.bubbleLit || "#fff") : (pal.bubble || "#cfe")
    ctx.fillRect(Math.round(ox + 3 + Math.sin(life * 7 + en.id) * 2.5),
                 Math.round(oy + lift - life * 24), life > 0.62 ? 2 : 1, life > 0.62 ? 2 : 1)
  }
  ctx.globalAlpha = 1

  ctx.fillStyle = suit
  ctx.fillRect(ox + 1, oy + 6 + lift, 7, 9)                     // body
  ctx.fillStyle = suitDark
  ctx.fillRect(ox + 1, oy + 6 + lift, 7, 1)                     // the shoulder shadow
  ctx.fillRect(ox + 1, oy + 15 + lift + (kick > 0 ? 1 : 0), 3, 1)   // fins
  ctx.fillRect(ox + 4, oy + 15 + lift + (kick > 0 ? 0 : 1), 3, 1)
  ctx.fillStyle = "#8c6a2a"
  ctx.fillRect(ox + 2, oy + 1 + lift, 5, 5)                     // helmet
  ctx.fillStyle = "#c39a45"
  ctx.fillRect(ox + 2, oy + 1 + lift, 3, 1)
  ctx.fillStyle = "#7fb8c4"
  ctx.fillRect(dir > 0 ? ox + 5 : ox + 2, oy + 3 + lift, 2, 2)  // port
  ctx.fillStyle = "#ff6b6b"
  ctx.fillRect(dir > 0 ? ox + 6 : ox + 2, oy + 3 + lift, 1, 1)  // the eye in it

  var aiming = en.state === "aim"
  var gunY = oy + (aiming ? 7 : 9) + lift
  var len = big ? 11 : 6
  var gunX = dir > 0 ? ox + 7 : ox - (len - 2)
  ctx.fillStyle = "#171920"
  ctx.fillRect(gunX, gunY, len, 2)
  ctx.fillRect(dir > 0 ? gunX : gunX + len - 2, gunY + 2, 2, 3)     // grip
  ctx.fillStyle = "#9aa2b4"
  if (!en.shotFor) ctx.fillRect(dir > 0 ? gunX + 4 : gunX, gunY - 1, len - 2, 1)  // spear, loaded

  // The tell. A speargun's is the rubber going taut, so it is a short bright
  // mark at the muzzle rather than a laser down the corridor — this crew has
  // no lasers, it has forty atmospheres and patience.
  if (aiming) {
    ctx.globalAlpha = 0.4 + ((en.timer >> 2) % 2) * 0.5
    ctx.fillStyle = "#ff6b6b"
    ctx.fillRect(dir > 0 ? gunX + len : gunX - 3, gunY, 3, 1)
    ctx.globalAlpha = 1
  }

  // The shot: a spear in flight with its line paying out behind it. It travels
  // rather than appearing at the far end, which is the whole difference
  // between a spear and a bullet at this scale.
  if (en.shotFor > 0) {
    var spearX = Math.round(en.lineTo * C)
    var spearY = Math.round((en.lineY + 0.5) * C)
    var fromX = dir > 0 ? gunX + len : gunX - 1
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
    ctx.fillRect(tipX - (dir > 0 ? 6 : 0), tipY, 7, 1)            // shaft
    hzTri(ctx, tipX + (dir > 0 ? 1 : -1), tipY, 2, 3, dir)        // barb
  }
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
  var k = w.k
  var C = k.CELL
  var ox = Math.round(ag.x * C) - SPRITE_W / 2
  var dir = ag.dir
  var st = ag.state
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

  if (st === "saved") {
    // A short rise and fade into the portal, so getting home reads as an
    // arrival rather than an agent simply blinking out.
    ctx.globalAlpha = Math.max(0, 1 - ag.fade / 14)
    oy -= ag.fade + (ag.fade < 7 ? Math.round(Math.sin(ag.fade / 7 * Math.PI) * 2) : 0)
  }

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
  drawCampShot(ctx, w, pal, ag, ox, oy, dir, st, w.k.CELL)

  // No special borrows the colony's umbrella. At a lethal height each carries
  // a device with its own silhouette; the movement is deliberately readable
  // at panel scale before the label has to explain it.
  drawAgentHeightGear(ctx, w, pal, ag, ox, oy, dir, robe, hair)
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

  // Upside down: the whole sprite is mirrored vertically, so the one that
  // walks on ceilings reads as hanging rather than as floating.
  spriteFlip = (st === "ceil")

  // The walk cycle, worked out up here because the head rides it. On the
  // passing frames, legs together, the body is at the top of its stride and
  // everything above the hips comes up a pixel; for a few ticks after a real
  // drop it goes the other way, knees taking the landing.
  var walkLead = [0, 1, 0, -1][(ag.anim >> 2) % 4]
  var squash = st === "walk" ? landSquash(w, ag) : 0
  var bob = st === "walk" && !w.submerged && !squash && walkLead === 0 ? 1 : 0
  var bodyDrop = st === "slide" ? 4 : ((st === "dig" || st === "camp") ? 2 : squash - bob)

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
    var headLift = (st === "walk" || st === "swim")
      ? Math.round(Math.sin(ag.anim * 0.22) * 1.2) : 0
    drawDiverBubbles(ctx, w, pal, ag, ox, oy, bodyDrop + headLift)
    drawDiverHead(ctx, w, pal, ag, ox, oy, dir, bodyDrop + headLift)
  } else {
  ctx.fillStyle = hair
  blit(ctx, ox, oy, dir, 2, 0 + bodyDrop, 4, 3)
  blit(ctx, ox, oy, dir, 0, 1 + bodyDrop, 2, 3)        // the back of the head

  ctx.fillStyle = skin
  blit(ctx, ox, oy, dir, 2, 3 + bodyDrop, 4, 4)
  blit(ctx, ox, oy, dir, 6, 5 + bodyDrop, 1, 1)        // the nose

  // Shades, not an eye. A band reads as somebody wearing something, which is
  // the difference between a little person and an agent. It runs one pixel out
  // over the nose, so the glasses lead the face the way glasses do.
  ctx.fillStyle = pal.eye
  blit(ctx, ox, oy, dir, 2, 4 + bodyDrop, 5, 1)
  ctx.fillStyle = pal.lens
  blit(ctx, ox, oy, dir, 5, 4 + bodyDrop, 1, 1)        // the lit lens, in front
  }

  // --- collar ------------------------------------------------------------
  // Drawn before the body so each pose's own torso closes over it, leaving a
  // white notch at the throat. One mark, and it works in every pose, which a
  // shirt front painted per-pose would not: there are a dozen torsos below.
  if (st !== "saved") {
    ctx.fillStyle = pal.shirt
    var collarLift = (w.submerged && (st === "walk" || st === "swim"))
      ? Math.round(Math.sin(ag.anim * 0.22) * 1.2) : 0
    blit(ctx, ox, oy, dir, 3, 6 + bodyDrop + collarLift, 2, 4)
  }

  // Shoulder line. A dark suit has to sit on a dark board: too light and it is
  // not a suit, too dark and the agent is a face floating in a corridor. What
  // makes it read either way is one lighter pixel row along the top of the
  // torso — the sprite carries its own edge instead of borrowing contrast from
  // whatever happens to be behind it.
  var lapel = ag.special ? hair : pal.lapel

  // --- body + limbs ------------------------------------------------------
  ctx.fillStyle = robe
  // (the shoulder line is laid over the torso once it is drawn, below)

  drawAgentBody(ctx, w, pal, ag, ox, oy, dir, robe, skin, st, bodyDrop, walkLead, squash)

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

  if ((w.res || 1) >= 2 && !w.submerged) drawAgentFine(ctx, pal, ag, ox, oy, dir, bodyDrop, walkLead, squash, robe)
  else if ((w.res || 1) >= 2 && st !== "saved") drawDiverFine(ctx, pal, ag, ox, oy, dir, bodyDrop + (headLift || 0))

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

  if (heightBodySaved) ctx.restore()

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

  ctx.globalAlpha = 1
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
