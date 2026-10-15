import test from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { loadCore } from "../tools/load-core.js"
import { canvas, themeOf, THEMES } from "../tools/render.js"

const S = loadCore("Sim.js"), D = loadCore("Draw.js"), P = loadCore("Palette.js")
const levels = [18, 37, 56, 75], layers = [D.drawStationHall, D.drawStationPanels, D.drawStationEdge, D.drawStationPulse]
const MAX_CALLS = 20000
function sample(level = 18, name = "tokyo-night") {
  const w = S.generate(level, 0, level * 7919 + 13)
  w.res = 2; w.ticks = 77
  return { w, pal: P.build(themeOf(name).theme, level) }
}
function picture(draw) {
  const img = canvas(800, 496, "#000000"), calls = []
  img.ctx.setTransform(2, 0, 0, 2, 0, 0)
  const fill = img.ctx.fillRect.bind(img.ctx)
  img.ctx.fillRect = (...args) => {
    assert.ok(args.slice(2).every(n => n > 0), "positive rectangles")
    for (const n of args) assert.equal(n * 2, Math.round(n * 2), "half-pixel grid")
    assert.ok(calls.length < MAX_CALLS, "bounded draw recording")
    calls.push([...args, img.ctx.fillStyle, img.ctx.globalAlpha]); fill(...args)
  }
  img.ctx.fillStyle = "#123456"; img.ctx.globalAlpha = 0.8
  draw(img.ctx)
  return { ...img, buf: createHash("sha256").update(img.buf).digest("hex"), calls }
}
function readonly(value, cache = new WeakMap()) {
  if (!value || typeof value !== "object") return value
  if (cache.has(value)) return cache.get(value)
  const proxy = new Proxy(value, {
    get(target, key) { return readonly(Reflect.get(target, key), cache) },
    set() { throw new Error("world write") },
    defineProperty() { throw new Error("world define") },
    deleteProperty() { throw new Error("world delete") }
  })
  cache.set(value, proxy); return proxy
}
function footprint(c, visit) {
  assert.ok(c.slice(0, 4).every(Number.isFinite))
  assert.ok(c[0] >= 0 && c[1] >= 0 && c[0] + c[2] <= 400 && c[1] + c[3] <= 248)
  assert.ok(c[2] <= 4 && c[3] <= 4, "one-cell accent footprint")
  for (let y = c[1]; y < c[1] + c[3]; y += 0.5)
    for (let x = c[0]; x < c[0] + c[2]; x += 0.5) visit(x, y)
}

test("station additions require Subway page resolution", () => {
  for (let level = 1; level <= S.BIOMES.length; level++) for (const res of [undefined, 1, 2]) {
    const { w } = sample(level); w.res = res
    const visible = level === 18 && res === 2
    assert.equal(D.stationPage(w), visible)
    for (const draw of layers) {
      const img = picture(ctx => draw(ctx, w))
      if (!visible) assert.equal(img.calls.length, 0)
      assert.equal(img.ctx.fillStyle, "#123456"); assert.equal(img.ctx.globalAlpha, 0.8)
    }
    if (visible) assert.ok(picture(ctx => D.drawStationHall(ctx, w)).calls.length > 0)
  }
})
test("station art is deterministic, RNG-free, read-only, half-pixel and state balanced", () => {
  for (const level of levels) for (const name of Object.keys(THEMES)) {
    const { w, pal } = sample(level, name), before = JSON.stringify(w), frozen = readonly(w)
    const random = Math.random; Math.random = () => { throw new Error("render RNG") }
    try {
      for (const draw of layers) {
        const a = picture(ctx => draw(ctx, frozen)), b = picture(ctx => draw(ctx, frozen))
        assert.equal(a.buf, b.buf)
        assert.equal(a.ctx.fillStyle, "#123456"); assert.equal(a.ctx.globalAlpha, 0.8)
      }
      D.drawTerrain(canvas(800, 496).ctx, frozen, pal)
      D.drawActors(canvas(800, 496).ctx, frozen, pal, {})
    } finally { Math.random = random }
    assert.equal(JSON.stringify(w), before)
  }
})
test("maps, torn paper, board housings and lamp spill stay cached and fully separate", () => {
  for (const level of levels) {
    const { w } = sample(level), layout = D.stationLayout(w), boxes = D.stationReserved(w)
    assert.equal(layout.panels.filter(b => b.kind === "map").length, 1)
    assert.equal(layout.panels.filter(b => b.kind === "board").length, 1)
    assert.ok(layout.tubes.length <= 2)
    for (const b of [...layout.panels, ...layout.tubes]) {
      assert.ok(D.postalBoxClear(w, b, boxes), "complete fitting fits air outside original fixture bounds")
      boxes.push(b)
    }
    const hall = picture(ctx => D.drawStationHall(ctx, w)), panels = picture(ctx => D.drawStationPanels(ctx, w))
    w.ticks += 271
    assert.equal(picture(ctx => D.drawStationHall(ctx, w)).buf, hall.buf)
    assert.equal(picture(ctx => D.drawStationPanels(ctx, w)).buf, panels.buf)
    w.terrain.fill(w.k.ROCK)
    assert.equal(D.stationLayout(w).panels.length, 0)
    assert.equal(D.stationLayout(w).tubes.length, 0)
  }
})
test("station labels include exact colon and dash glyphs; the shared ROM font keeps its own (main added a colon)", () => {
  assert.equal(D.TRANSITION_GLYPHS["—"], undefined)
  const colon = picture(ctx => D.stationText(ctx, ":", 10, 10, 1)).calls
  const dash = picture(ctx => D.stationText(ctx, "—", 10, 10, 1)).calls
  assert.deepEqual(colon.map(c => c.slice(0, 4)), [[9.5, 11, 1, 1], [9.5, 13, 1, 1]])
  assert.deepEqual(dash.map(c => c.slice(0, 4)), [[8.5, 12, 1, 1], [9.5, 12, 1, 1], [10.5, 12, 1, 1]])
  assert.equal(picture(ctx => D.stationText(ctx, "@", 10, 10, 1)).buf, picture(ctx => D.stationText(ctx, "?", 10, 10, 1)).buf)
  const { w } = sample(), b = D.stationLayout(w).panels.find(b => b.kind === "map")
  const calls = picture(ctx => D.drawStationMap(ctx, b)).calls
  assert.equal(calls.filter(c => c[4] === D.STATION_PAPER && c[5] === 1 && c[2] === 2 && c[3] === 2).length, 4, "four clear station dots")
  assert.ok(calls.every(c => c[0] >= b.x && c[1] >= b.y && c[0] + c[2] <= b.x + b.width && c[1] + c[3] <= b.y + b.height), "all tiny labels remain in the frame")
})
test("reported station has full readable board and map, varied paper and two independent tubes", () => {
  const w = S.generate(18, 0, 3); w.res = 2; w.ticks = 400
  const layout = D.stationLayout(w), board = layout.panels.find(b => b.kind === "board")
  assert.ok(board.x >= 20 && board.x + board.width <= 188, "board lies in shoot.js crop")
  assert.ok(board.y >= 49.5 && board.y + board.height <= 153.5)
  const frame = picture(ctx => D.drawStationBoard(ctx, board))
  assert.ok(frame.calls.some(c => c[4] === D.STATION_AMBER && c[5] > 0.8 && c[2] === 1 && c[3] === 1), "full art-pixel NEXT: HOME text")
  assert.ok(layout.panels.some(b => b.kind === "poster"))
  assert.equal(layout.tubes.length, 2)
  D.drawStationPanels(canvas(800, 496).ctx, w)
  const first = [], second = [], boardAlpha = []
  for (const ticks of [0, 15, 48, 55, 75, 90]) {
    w.ticks = ticks
    const calls = picture(ctx => D.drawStationPulse(ctx, w)).calls
    for (const [i, values] of [[0, first], [1, second]]) {
      const b = layout.tubes[i]
      values.push(calls.find(c => c[4] === D.STATION_LAMP && c[0] === b.x + 2)[5])
    }
    boardAlpha.push(calls.find(c => c[4] === D.STATION_AMBER)[5])
  }
  assert.equal(new Set(first).size, 2); assert.equal(new Set(second).size, 2)
  assert.notDeepEqual(first, second, "different tube periods")
  assert.equal(new Set(boardAlpha).size, 2)
  w.eventBoost = 200; w.eventMult = 0
  assert.ok(picture(ctx => D.drawStationPulse(ctx, w)).calls.filter(c => c[4] === D.STATION_LAMP).every(c => c[5] === 0.12), "signal failure dims added tubes too")
})
test("cached live geometry invalidates and cannot paint through carved or replaced terrain", () => {
  const { w } = sample(), ctx = canvas(800, 496).ctx
  D.drawStationPanels(ctx, w)
  const cached = D.STATION_CACHE.get(w)
  assert.equal(cached.version, w.terrainVersion)
  assert.deepEqual(cached.layout, D.stationLayout(w))
  assert.ok(picture(ctx => D.drawStationPulse(ctx, w)).calls.length > 0)
  w.terrain.fill(w.k.STEEL)
  assert.equal(picture(ctx => D.drawStationPulse(ctx, w)).calls.length, 0, "fresh air check even without version bump")
  w.terrainVersion++
  assert.equal(picture(ctx => D.drawStationPulse(ctx, w)).calls.length, 0, "invalid geometry rebuilt")
})
test("live work is bounded to board pixels and filaments and respects whole original silhouettes", () => {
  for (const level of levels) {
    const { w } = sample(level)
    D.drawStationPanels(canvas(800, 496).ctx, w)
    for (const ticks of [0, 77, 160, 400, 476]) {
      w.ticks = ticks
      const img = picture(ctx => D.drawStationPulse(ctx, w)), boxes = D.stationReserved(w)
      assert.ok(img.calls.length <= 150)
      for (const c of img.calls) {
        assert.ok([D.STATION_AMBER, D.STATION_LAMP].includes(c[4]), "no live wall/map/paper repaint")
        assert.ok(D.abyssClear(w, ...c.slice(0, 4), boxes))
        footprint(c, (x, y) => assert.ok(D.mechanismAir(w, x, y)))
      }
    }
  }
})
test("added tile walls stay lower contrast than walkable tile in all themes", () => {
  const mean = img => {
    let sum = 0
    for (let i = 0; i < img.buf.length; i += 3) sum += img.buf[i] * 0.2126 + img.buf[i + 1] * 0.7152 + img.buf[i + 2] * 0.0722
    return sum / (img.W * img.H)
  }
  for (const name of Object.keys(THEMES)) {
    const { w, pal } = sample(18, name), far = canvas(400, 248, D.STATION_WALL), near = canvas(400, 248, D.STATION_WALL)
    D.drawStationHall(far.ctx, w)
    near.ctx.fillStyle = pal.dirt; near.ctx.fillRect(0, 0, 400, 248)
    w.terrain.fill(w.k.DIRT); D.drawSubwayMaterials(near.ctx, w, pal)
    assert.ok(mean(far) < mean(near) * 0.8, `${name}: terrain remains the stronger plane`)
  }
})
test("yellow edge follows intact exposed non-steel ground, never gaps or walls", () => {
  const { w } = sample()
  for (const m of [w.k.DIRT, w.k.ROCK, w.k.ORE]) {
    w.terrain.fill(w.k.EMPTY)
    for (let x = 0; x < 100; x++) w.terrain[30 * 100 + x] = m
    const img = picture(ctx => D.drawStationEdge(ctx, w))
    assert.ok(img.calls.length > 0)
    for (const c of img.calls) footprint(c, (x, y) => {
      const col = Math.floor(x / 4), row = Math.floor(y / 4)
      assert.equal(w.terrain[row * 100 + col], m)
      assert.equal(w.terrain[(row - 1) * 100 + col], w.k.EMPTY)
    })
  }
  for (const m of [w.k.EMPTY, w.k.STEEL, w.k.DIRT]) {
    w.terrain.fill(m)
    assert.equal(picture(ctx => D.drawStationEdge(ctx, w)).calls.length, 0)
  }
})
test("original furniture, camera LEDs, poster titles, roundels and booth remain reserved", () => {
  const { w, pal } = sample(); w.terrain.fill(w.k.EMPTY); w.hazards = []; w.pits = []
  for (const kind of ["hang", "tuft", "clump", "spire"]) for (const seed of [0, 1]) {
    const d = { kind, size: 3, seed, x: 45, y: 30 }; w.decor = [d]
    const boxes = D.stationReserved(w), img = picture(ctx => D.drawSubwayDecor(ctx, w, pal, d, 180, 120))
    for (const c of img.calls) assert.equal(D.assemblyUnreserved(boxes, ...c.slice(0, 4)), false)
    if (kind === "spire") assert.equal(D.assemblyUnreserved(boxes, 179, 102, 22, 4), false, "complete ETA/TRY CACHE title")
  }
  w.decor = []; w.enemyHatch = { x: 45, y: 30, biome: "Subway" }
  const boxes = D.stationReserved(w), booth = picture(ctx => D.drawEnemyHatch(ctx, w, pal, {}))
  for (const c of booth.calls) assert.equal(D.assemblyUnreserved(boxes, ...c.slice(0, 4)), false)
  const c = w.corridors[0], mid = Math.round((c.x0 + c.x1) * 2), sx = D.subwaySignX(w, c, mid)
  const roundel = picture(ctx => D.drawSubwayRoundel(ctx, pal.oreShade, pal.backDim, sx, c.floorY * 4 - 14))
  for (const p of roundel.calls) assert.equal(D.assemblyUnreserved(boxes, ...p.slice(0, 4)), false)
  w.mission = { targets: [{ x: 70, y: 30, freed: false, dead: false }, { x: 80, y: 30, freed: true }] }
  assert.equal(D.assemblyUnreserved(D.stationReserved(w), 280, 110, 1, 1), false)
  assert.equal(D.assemblyUnreserved(D.stationReserved(w), 320, 110, 1, 1), true)
})
test("walls precede terrain and added flicker precedes trains, umbrellas and exit", () => {
  const { w, pal } = sample(), ctx = canvas(800, 496).ctx
  let serial = 0, marks = {}
  ctx.fillRect = () => {
    assert.ok(++serial <= 100000)
    if (ctx.fillStyle === D.STATION_TILE) marks.wall = serial
    if (ctx.fillStyle === pal.dirtEdge) marks.ground = serial
    if (ctx.fillStyle === D.STATION_AMBER) marks.board = serial
    if (ctx.fillStyle === D.SUBWAY_CREAM) marks.train = serial
    if (ctx.fillStyle === pal.umbrellaStem) marks.umbrella = serial
    if (ctx.fillStyle === pal.exitLight) marks.exit = serial
  }
  D.drawTerrain(ctx, w, pal)
  assert.ok(marks.wall > 0 && marks.ground > marks.wall)
  const ag = S.spawn(w)
  Object.assign(ag, { x: 70, y: w.corridors[0].floorY - 3, state: "fall", floater: true, ownBrolly: true, fall: 9, special: false })
  w.agents = [ag]; w.ticks = 400; serial = 0; marks = {}
  D.drawActors(ctx, w, pal, {})
  assert.ok(marks.board > 0 && marks.train > marks.board && marks.umbrella > marks.board && marks.exit > marks.board)
})
test("station glow preserves opaque faces, shirts, eyes and umbrellas", () => {
  for (const name of Object.keys(THEMES)) for (const state of ["walk", "fall"]) {
    const { w, pal } = sample(18, name), mixer = { x: 210 }, ag = S.spawn(w)
    Object.assign(ag, { x: mixer.x / 4, y: w.corridors[0].floorY - (state === "fall" ? 3 : 1), state,
      special: false, ownBrolly: true, floater: state === "fall", fall: 9, dir: 1, anim: 5 })
    w.agents = [ag]; w.ticks = 400
    let px = ag.x * 4, py = ag.y * 4
    const mask = canvas(800, 496, "#000000"), scene = canvas(800, 496)
    mask.ctx.setTransform(2, 0, 0, 2, 0, 0)
    D.drawAgent(mask.ctx, w, pal, ag, {})
    D.drawTerrain(scene.ctx, w, pal); D.drawActors(scene.ctx, w, pal, {})
    const colours = new Set([pal.skin, pal.shirt, pal.eye, pal.umbrellaStem, D.brollyColour(w, pal, ag)].map(colour => {
      const dot = canvas(1, 1); dot.ctx.fillStyle = colour; dot.ctx.fillRect(0, 0, 1, 1); return dot.buf.join(",")
    }))
    let checked = 0
    const x0 = Math.floor(px * 2) - 40, y0 = Math.floor(py * 2) - 60
    for (let y = y0; y < y0 + 70; y++) for (let x = x0; x < x0 + 80; x++) {
      const i = (y * 800 + x) * 3, pixel = mask.buf.subarray(i, i + 3)
      if (!colours.has(pixel.join(","))) continue
      assert.equal(scene.buf.subarray(i, i + 3).join(","), pixel.join(","), `${name} ${state} opaque actor pixel`)
      checked++
    }
    assert.ok(checked >= 30, "real opaque actor pixels compared")
  }
})
test("original Subway ground, fixtures, lights, rails and trains, pits, hazards and exit retain bytes", () => {
  for (const [resolutions, expected] of [
    [[undefined, 1], "923045468b1d4035fa30f19f8235ec32f34e1790419a2e92ef1e23ecd3e8e2c4"], [[2], "c481c45fbfe3c46917ce02f096cb49fe19644e2d9b28b9893c622956f26ba0c1"]
  ]) {
    const hash = createHash("sha256")
    for (const name of Object.keys(THEMES)) for (const level of levels)
      for (const res of resolutions) for (const ticks of [0, 77, 240]) {
        const { w, pal } = sample(level, name); w.res = res; w.ticks = ticks
        const img = canvas(400, 248, themeOf(name).background)
        D.drawBackdrop(img.ctx, w, pal); D.drawTerrainMaterials(img.ctx, w, pal)
        D.drawDecor(img.ctx, w, pal); D.drawSubwayMaterials(img.ctx, w, pal); D.drawSubwayMachines(img.ctx, w, pal)
        D.drawAmbience(img.ctx, w, pal); D.drawPits(img.ctx, w, pal)
        D.drawExitBack(img.ctx, w, pal); D.drawEnemyHatch(img.ctx, w, pal, {})
        for (const h of w.hazards) D.drawHazard(img.ctx, w, pal, h, {})
        hash.update(img.buf)
      }
    assert.equal(hash.digest("hex"), expected)
  }
})
test("drawing the station leaves real train playthroughs identical", () => {
  const random = Math.random
  const jitter = seed => { let n = seed; return () => ((n = (Math.imul(n, 1664525) + 1013904223) >>> 0) / 4294967296) }
  try {
    for (const level of levels) {
      const seed = level * 7919 + 13
      const a = S.generate(level, 0, seed), b = S.generate(level, 0, seed)
      a.res = 2; b.res = 2
      const pal = P.build(themeOf("tokyo-night").theme, level), img = canvas(800, 496)
      for (let tick = 0; tick < 600; tick++) {
        // Spawn animation/blood jitter is outside the colony stream. Pin it
        // per step so a complete world digest also compares cosmetic fields.
        Math.random = jitter(seed + tick); S.step(a)
        Math.random = jitter(seed + tick); S.step(b)
        if (tick % 60 !== 0) continue
        Math.random = () => { throw new Error("render RNG during live play") }
        D.drawTerrain(img.ctx, a, pal); D.drawActors(img.ctx, a, pal, {})
        const digest = world => createHash("sha256").update(JSON.stringify(world)).digest("hex")
        assert.equal(digest(a), digest(b), `simulation replay ${level}, tick ${tick}`)
      }
    }
  } finally { Math.random = random }
})



