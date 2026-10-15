import test from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { loadCore } from "../tools/load-core.js"
import { canvas, themeOf, THEMES } from "../tools/render.js"

const S = loadCore("Sim.js"), D = loadCore("Draw.js"), P = loadCore("Palette.js")
const levels = [17, 37, 57, 77], layers = [D.drawNightCity, D.drawNightFixtures, D.drawNightSigns, D.drawNightSheen, D.drawNightWisps]
const MAX_CALLS = 20000
function sample(level = 17, name = "tokyo-night") {
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

test("night additions require Rooftops page resolution", () => {
  for (let level = 1; level <= S.BIOMES.length; level++) for (const res of [undefined, 1, 2]) {
    const { w } = sample(level); w.res = res
    const visible = level === 17 && res === 2
    assert.equal(D.rooftopsPage(w), visible)
    for (const draw of layers) {
      const img = picture(ctx => draw(ctx, w))
      if (!visible) assert.equal(img.calls.length, 0)
      assert.equal(img.ctx.fillStyle, "#123456"); assert.equal(img.ctx.globalAlpha, 0.8)
    }
    if (visible) assert.ok(picture(ctx => D.drawNightCity(ctx, w)).calls.length > 0)
  }
})
test("night art is deterministic, read-only, RNG-free, half-pixel and state balanced", () => {
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
test("city and varied fixtures are cached at fixed anchors with different neighbours", () => {
  for (const level of levels) {
    const { w } = sample(level), roofs = D.nightRoofs(w), before = picture(ctx => D.drawNightCity(ctx, w))
    w.ticks += 271
    assert.equal(picture(ctx => D.drawNightCity(ctx, w)).buf, before.buf)
    w.terrain.fill(w.k.EMPTY)
    assert.deepEqual(D.nightRoofs(w), roofs)
    const variants = new Set()
    for (const row of new Set(roofs.map(b => b.row))) {
      const group = roofs.filter(b => b.row === row)
      group.forEach((b, i) => {
        if (i) assert.notEqual(b.kind, group[i - 1].kind)
        const a = picture(ctx => D.drawNightFixture(ctx, b)); variants.add(a.buf)
        assert.equal(a.ctx.fillStyle, "#123456"); assert.equal(a.ctx.globalAlpha, 0.8)
      })
    }
    assert.ok(variants.size >= 5)
    assert.ok(before.calls.some(c => c[4] === D.NIGHT_WINDOW))
  }
})
test("solid service fittings are fully supported, separate and disappear when their roofs go", () => {
  let seen = 0
  for (const level of levels) {
    const { w } = sample(level), fixtures = D.nightFixtures(w), boxes = D.nightReserved(w)
    seen += fixtures.length
    for (const b of fixtures) {
      const box = D.nightFixtureBox(b)
      assert.ok(D.nightSupported(w, box, boxes))
      boxes.push(box)
      const calls = picture(ctx => D.drawNightFixture(ctx, b)).calls
      assert.ok(calls.some(c => c[5] === 1), "filled bodies, not translucent outlines")
      assert.ok(calls.every(c => c[0] >= box.x && c[1] >= box.y && c[0] + c[2] <= box.x + box.width && c[1] + c[3] <= box.y + box.height))
    }
    w.terrain.fill(w.k.EMPTY)
    assert.equal(D.nightFixtures(w).length, 0)
    assert.equal(picture(ctx => D.drawNightFixtures(ctx, w)).calls.length, 0)
  }
  assert.ok(seen >= 12)
})
test("reported frame has readable pink/cyan neon, colour spill and reflections on solid roof", () => {
  const w = S.generate(17, 0, 3); w.res = 2; w.ticks = 400
  const signs = D.nightSigns(w)
  assert.equal(signs.length, 2)
  assert.deepEqual(new Set(signs.map(b => b.colour)), new Set([D.NIGHT_NEON, D.NIGHT_CYAN]))
  const calls = picture(ctx => D.drawNightSigns(ctx, w)).calls
  assert.ok(calls.some(c => c[5] >= 0.9 && c[2] === 1 && c[3] === 1), "full art-pixel letters")
  assert.ok(calls.some(c => c[5] < 0.2 && signs.some(b => c[0] < b.x)), "soft spill beyond sign")
  const reflection = picture(ctx => D.drawNightSheen(ctx, w)).calls.filter(c => c[4] !== D.NIGHT_EDGE)
  assert.ok(reflection.length >= 12)
  for (const c of reflection) {
    assert.ok(c[3] === 0.5 && c[5] < 0.5)
    for (let x = c[0]; x < c[0] + c[2]; x += 0.5)
      assert.notEqual(w.terrain[Math.floor(c[1] / 4) * 100 + Math.floor(x / 4)], w.k.EMPTY)
  }
})
test("live wisps reuse terrain-cache fittings and reject removed supports after invalidation", () => {
  const w = S.generate(17, 0, 3); w.res = 2; w.ticks = 400
  const ctx = canvas(800, 496).ctx
  D.drawNightFixtures(ctx, w)
  const cached = D.NIGHT_FITTINGS.get(w)
  assert.equal(cached.version, w.terrainVersion)
  assert.deepEqual(cached.fixtures, D.nightFixtures(w))
  assert.ok(picture(ctx => D.drawNightWisps(ctx, w)).calls.length > 0)
  w.terrain.fill(w.k.EMPTY)
  assert.equal(picture(ctx => D.drawNightWisps(ctx, w)).calls.length, 0, "fresh support checks even without a version bump")
  w.terrainVersion++
  assert.equal(picture(ctx => D.drawNightWisps(ctx, w)).calls.length, 0, "invalidated geometry is rebuilt")
})
test("night skyline remains darker than playable brick in every theme", () => {
  const mean = img => {
    let sum = 0
    for (let i = 0; i < img.buf.length; i += 3) sum += img.buf[i] * 0.2126 + img.buf[i + 1] * 0.7152 + img.buf[i + 2] * 0.0722
    return sum / (img.W * img.H)
  }
  for (const name of Object.keys(THEMES)) {
    const { w, pal } = sample(17, name), far = canvas(400, 248, D.NIGHT_BACK), near = canvas(400, 248, D.NIGHT_BACK)
    D.drawNightCity(far.ctx, w)
    near.ctx.fillStyle = pal.dirt; near.ctx.fillRect(0, 0, 400, 248)
    w.terrain.fill(w.k.DIRT); D.drawRoofMaterials(near.ctx, w, pal)
    assert.ok(mean(far) < mean(near) * 0.8, `${name}: brick is the stronger plane`)
  }
})
test("complete neon signs reject terrain and original fixtures instead of clipping their text", () => {
  const { w } = sample(); w.decor = []; w.hazards = []; w.pits = []; w.ziplines = []
  const signCalls = () => picture(ctx => D.drawNightSigns(ctx, w)).calls
  assert.ok(signCalls().length > 20, "two visible OPEN signs")
  for (const c of signCalls()) assert.ok(D.abyssClear(w, ...c.slice(0, 4), D.nightReserved(w)))
  w.terrain.fill(w.k.STEEL)
  assert.equal(signCalls().length, 0)
  w.terrain.fill(w.k.EMPTY)
  for (const c of w.corridors) for (let x = 0; x < 100; x++) w.terrain[c.floorY * 100 + x] = w.k.DIRT
  w.hazards = [{ zx0: 0, zx1: 99, zy0: 0, zy1: 61 }]
  assert.equal(signCalls().length, 0)
})
test("wet glints occur only on surviving exposed non-steel ledges", () => {
  const { w } = sample()
  for (const material of [w.k.DIRT, w.k.ROCK, w.k.ORE]) {
    w.terrain.fill(w.k.EMPTY)
    for (let x = 0; x < w.k.COLS; x++) w.terrain[30 * w.k.COLS + x] = material
    const calls = picture(ctx => D.drawNightSheen(ctx, w)).calls
    assert.ok(calls.length > 0)
    for (const c of calls.filter(c => c[4] === D.NIGHT_EDGE)) footprint(c, (x, y) => {
      assert.equal(w.terrain[Math.floor(y / 4) * 100 + Math.floor(x / 4)], material)
      assert.equal(w.terrain[(Math.floor(y / 4) - 1) * 100 + Math.floor(x / 4)], w.k.EMPTY)
    })
    w.terrain.fill(material)
    assert.equal(picture(ctx => D.drawNightSheen(ctx, w)).calls.length, 0)
  }
  for (const material of [w.k.EMPTY, w.k.STEEL]) {
    w.terrain.fill(material)
    assert.equal(picture(ctx => D.drawNightSheen(ctx, w)).calls.length, 0)
  }
})
test("chimney wisps are bounded, slow and clipped to terrain and reserved silhouettes", () => {
  let seen = 0
  for (const level of levels) {
    const { w } = sample(level)
    for (const ticks of [0, 77, 160, 400, 476]) {
      w.ticks = ticks
      const img = picture(ctx => D.drawNightWisps(ctx, w)), boxes = D.nightReserved(w)
      seen += img.calls.length
      assert.ok(img.calls.length <= 32, "no per-frame skyline/window/fixture repaint")
      for (const c of img.calls) {
        assert.ok(c[5] <= 0.13)
        assert.ok(D.abyssClear(w, ...c.slice(0, 4), boxes))
        footprint(c, (x, y) => assert.ok(D.mechanismAir(w, x, y)))
      }
    }
    w.terrain.fill(w.k.EMPTY); w.decor = []; w.hazards = []; w.pits = []; w.ziplines = []
    for (const c of w.corridors) for (let x = 0; x < 100; x++) w.terrain[c.floorY * 100 + x] = w.k.DIRT
    const old = picture(ctx => D.drawNightWisps(ctx, w)).buf
    w.ticks += 15
    assert.notEqual(picture(ctx => D.drawNightWisps(ctx, w)).buf, old)
    for (const material of [w.k.DIRT, w.k.ROCK, w.k.ORE, w.k.STEEL]) {
      w.terrain.fill(material)
      assert.equal(picture(ctx => D.drawNightWisps(ctx, w)).calls.length, 0)
    }
  }
  assert.ok(seen > 0)
})
test("original props, full washing and entire zipline/rider lanes remain reserved", () => {
  const { w, pal } = sample(); w.terrain.fill(w.k.EMPTY); w.hazards = []; w.pits = []
  for (const kind of ["hang", "tuft", "clump", "spire"]) for (const size of [0, 1, 2, 3]) for (const seed of [3, 4]) {
    const d = { kind, size, seed, x: 45, y: 30 }; w.decor = [d]
    const boxes = D.nightReserved(w), img = picture(ctx => {
      D.drawRoofDecor(ctx, pal, d, d.x * 4, d.y * 4, 4)
      D.drawDecorFine(ctx, pal, d, d.x * 4, d.y * 4, (d.y + 1) * 4, "rooftops")
    })
    for (const c of img.calls) assert.equal(D.assemblyUnreserved(boxes, ...c.slice(0, 4)), false, "complete original prop")
  }
  w.decor = []
  for (const dir of [-1, 1]) {
    const z = { ax: dir === 1 ? 25 : 55, lx: dir === 1 ? 55 : 25, ay: 30, ly: 42, dir }
    w.ziplines = [z]; const boxes = D.nightReserved(w)
    const ag = S.spawn(w); Object.assign(ag, { state: "zip", zip: 0, zipS: 10, zipV: 0.2, special: false })
    for (const zipS of [0, 8, 15, 29]) {
      ag.zipS = zipS; w.agents = [ag]
      assert.deepEqual(D.nightReserved(w), boxes)
      const img = picture(ctx => { D.drawRoofLine(ctx, w, pal, z, 0); D.drawZipAgent(ctx, w, pal, ag, {}) })
      for (const c of img.calls) assert.equal(D.assemblyUnreserved(boxes, ...c.slice(0, 4)), false, "posts, cable, closed umbrella and rider")
    }
  }
})
test("neon and fittings avoid complete guard booths and captive containers", () => {
  const { w, pal } = sample(74); w.terrain.fill(w.k.EMPTY); w.decor = []; w.hazards = []; w.pits = []
  w.enemyHatch = { x: 45, y: 30, biome: "Rooftops" }; w.backupAt = 10; w.reinforcements = 1; w.ticks = 24
  const booth = picture(ctx => D.drawEnemyHatch(ctx, w, pal, {}))
  let boxes = D.nightReserved(w)
  for (const c of booth.calls) assert.equal(D.assemblyUnreserved(boxes, ...c.slice(0, 4)), false)
  w.mission = { targets: [{ x: 70, y: 30, freed: false, dead: false }, { x: 80, y: 30, freed: true }] }
  boxes = D.nightReserved(w)
  const captive = picture(ctx => D.drawMissionContainer(ctx, "civilian", 280, 120, pal))
  for (const c of captive.calls) assert.equal(D.assemblyUnreserved(boxes, ...c.slice(0, 4)), false)
  assert.equal(D.assemblyUnreserved(boxes, 320, 110, 1, 1), true)
  for (const level of levels) {
    const { w } = sample(level)
    for (const b of D.nightSigns(w)) assert.ok(D.postalBoxClear(w, b, D.nightReserved(w)))
  }
})
test("city precedes ground and chimney wisps precede umbrellas and the exit", () => {
  const { w, pal } = sample(), ctx = canvas(800, 496).ctx
  let serial = 0, marks = {}
  ctx.fillRect = () => {
    assert.ok(++serial <= 100000, "bounded streaming paint-order check")
    if (ctx.fillStyle === D.NIGHT_WINDOW) marks.city = serial
    if (ctx.fillStyle === pal.dirtEdge) marks.ground = serial
    if (ctx.fillStyle === D.NIGHT_SMOKE) marks.smoke = serial
    if (ctx.fillStyle === pal.umbrellaStem) marks.umbrella = serial
    if (ctx.fillStyle === pal.exitLight) marks.exit = serial
  }
  D.drawTerrain(ctx, w, pal)
  assert.ok(marks.city > 0 && marks.ground > marks.city)
  w.decor = []; w.pits = []; w.hazards = []
  const ag = S.spawn(w)
  Object.assign(ag, { x: 70, y: w.corridors[0].floorY - 3, state: "fall", floater: true, ownBrolly: true, fall: 9, special: false })
  w.agents = [ag]; w.ticks = 400; serial = 0; marks = {}
  D.drawActors(ctx, w, pal, {})
  assert.ok(marks.smoke > 0 && marks.umbrella > marks.smoke && marks.exit > marks.smoke)
})
test("rainy city preserves opaque faces, shirts, eyes and umbrellas", () => {
  for (const name of Object.keys(THEMES)) for (const state of ["walk", "fall"]) {
    const { w, pal } = sample(17, name), mixer = { x: 210 }, ag = S.spawn(w)
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
test("original Rooftops ground, fixtures, rain, washing, ziplines, pits, hazards and exit retain bytes", () => {
  for (const [resolutions, expected] of [
    [[undefined, 1], "347f75442b58cb0f1fd065aeb45810c1bb6897fe1645bbcc0c2823a42c2c11e2"], [[2], "41f69eda661472423d8fae799fc249b0dee0e77651696cf254f8e782d91b7354"]
  ]) {
    const hash = createHash("sha256")
    for (const name of Object.keys(THEMES)) for (const level of levels)
      for (const res of resolutions) for (const ticks of [0, 77, 240]) {
        const { w, pal } = sample(level, name); w.res = res; w.ticks = ticks
        const img = canvas(400, 248, themeOf(name).background)
        D.drawBackdrop(img.ctx, w, pal); D.drawTerrainMaterials(img.ctx, w, pal)
        D.drawDecor(img.ctx, w, pal); D.drawRoofMaterials(img.ctx, w, pal); D.drawRoofMachines(img.ctx, w, pal)
        D.drawAmbience(img.ctx, w, pal); D.drawPits(img.ctx, w, pal)
        D.drawExitBack(img.ctx, w, pal); D.drawEnemyHatch(img.ctx, w, pal, {})
        for (const h of w.hazards) D.drawHazard(img.ctx, w, pal, h, {})
        hash.update(img.buf)
      }
    assert.equal(hash.digest("hex"), expected)
  }
})
test("drawing the city leaves real rainy rooftop playthroughs identical", () => {
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



