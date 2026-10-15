import test from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { loadCore } from "../tools/load-core.js"
import { canvas, themeOf, THEMES } from "../tools/render.js"

const S = loadCore("Sim.js"), D = loadCore("Draw.js"), P = loadCore("Palette.js")
const levels = [19, 38, 57, 76], layers = [D.drawPortNight, D.drawPortQuay, D.drawPortLife, D.drawPortWater]
const MAX_CALLS = 20000
function sample(level = 19, name = "tokyo-night") {
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

test("port additions require Harbour page resolution", () => {
  for (let level = 1; level <= S.BIOMES.length; level++) for (const res of [undefined, 1, 2]) {
    const { w } = sample(level); w.res = res
    const visible = level === 19 && res === 2
    assert.equal(D.portPage(w), visible)
    for (const draw of layers) {
      const img = picture(ctx => draw(ctx, w))
      if (!visible) assert.equal(img.calls.length, 0)
      assert.equal(img.ctx.fillStyle, "#123456"); assert.equal(img.ctx.globalAlpha, 0.8)
    }
    if (visible) assert.ok(picture(ctx => D.drawPortNight(ctx, w)).calls.length > 0)
  }
})
test("port art is deterministic, RNG-free, read-only, half-pixel and state balanced", () => {
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
test("quay fittings are whole, supported, varied and cached outside original pieces", () => {
  for (const level of levels) {
    const { w } = sample(level), layout = D.portLayout(w), boxes = D.portReserved(w)
    assert.equal(D.portLayout(w), layout)
    assert.ok(layout.moorings.length > 0)
    assert.ok(layout.moorings.length <= w.corridors.length * 4)
    for (const b of layout.moorings) {
      assert.ok(D.postalBoxClear(w, b, boxes)); boxes.push(b)
      for (const dx of [2, 15]) assert.notEqual(w.terrain[Math.floor((b.y + 9) / 4) * 100 + Math.floor((b.x + dx) / 4)], w.k.EMPTY)
    }
    const frame = picture(ctx => D.drawPortQuay(ctx, w))
    w.ticks += 271
    assert.equal(picture(ctx => D.drawPortQuay(ctx, w)).buf, frame.buf)
    assert.equal(D.portLayout(w), layout)
    w.terrain.fill(w.k.STEEL); w.terrainVersion++
    assert.equal(D.portLayout(w).moorings.length, 0)
    assert.equal(D.portLayout(w).glints.length, 0)
    assert.notEqual(D.portLayout(w), layout)
    assert.equal(picture(ctx => D.drawPortQuay(ctx, w)).calls.length, 0)
  }
  const { w } = sample(); w.terrain.fill(w.k.EMPTY); w.terrainVersion++
  assert.equal(D.portLayout(w).moorings.length, 0, "no floating bollards when the entire quay is removed")
})
test("each container colour, full stencil, stepped hull, solid gantry and perched gull is visible", () => {
  const { w } = sample(); w.terrain.fill(w.k.EMPTY)
  const colours = new Set(), labels = new Set()
  for (let seed = 0; seed < 10; seed++) {
    const a = picture(ctx => D.drawPortContainer(ctx, w, 40, 60, seed, []))
    colours.add(a.calls[1][4]); labels.add(a.buf)
    const stencil = a.calls.filter(c => c[4] === "#a3a28b")
    assert.ok(stencil.length > 15)
    assert.ok(stencil.every(c => c[0] >= 44 && c[0] + c[2] <= 58 && c[1] >= 63 && c[1] + c[3] <= 66))
    const blocked = picture(ctx => D.drawPortContainer(ctx, w, 40, 60, seed, [{ x: 45, y: 63, width: 1, height: 1 }]))
    assert.equal(blocked.calls.filter(c => c[4] === "#a3a28b").length, 0, "reject the complete stencil if a fixture clips it")
  }
  assert.equal(colours.size, 5); assert.equal(labels.size, 10)
  const a = picture(ctx => D.drawPortHull(ctx, 100, 90, 0)), b = picture(ctx => D.drawPortHull(ctx, 100, 90, 1))
  assert.notEqual(a.buf, b.buf)
  assert.ok(a.calls.some(c => c[2] >= 39 && c[3] >= 3), "solid hull, not wireframe")
  const crane = picture(ctx => D.drawPortGantry(ctx, 220, 160, 77))
  assert.ok(crane.calls.some(c => c[2] === 5 && c[3] === 77))
  const plain = picture(ctx => D.drawPortMooring(ctx, { x: 40, y: 60, height: 9, bird: false }))
  const gull = picture(ctx => D.drawPortMooring(ctx, { x: 40, y: 60, height: 9, bird: true }))
  assert.notEqual(plain.buf, gull.buf)
  assert.ok(gull.calls.some(c => c[4] === "#b3b7a6"))
})
test("live beam and water shimmer use bounded small accents, air checks and separate reservations", () => {
  for (const level of levels) {
    const { w } = sample(level), layout = D.portLayout(w)
    for (const ticks of [0, 77, 160, 400, 476]) {
      w.ticks = ticks
      const img = picture(ctx => { D.drawPortLife(ctx, w); D.drawPortWater(ctx, w) })
      assert.ok(img.calls.length <= 200)
      for (const c of img.calls) {
        const water = c[4] === "#6b9293"
        assert.ok(water || c[4] === D.PORT_LIGHT)
        assert.ok(D.abyssClear(w, ...c.slice(0, 4), water ? layout.waterBoxes : layout.boxes))
        footprint(c, (x, y) => assert.ok(D.mechanismAir(w, x, y)))
        if (water) assert.ok(w.pits.some(p => c[0] >= p.x0 * 4 && c[0] + c[2] <= (p.x1 + 1) * 4 && c[1] >= p.surfaceY * 4 + 20), "below ferry and within real water")
      }
    }
    w.terrain.fill(w.k.STEEL)
    assert.equal(picture(ctx => { D.drawPortLife(ctx, w); D.drawPortWater(ctx, w) }).calls.length, 0, "fresh air checks protect stale geometry")
    w.terrainVersion++
    assert.equal(picture(ctx => { D.drawPortLife(ctx, w); D.drawPortWater(ctx, w) }).calls.length, 0)
  }
})
test("lighthouse sweeps slowly and shimmer changes without moving static quay scenery", () => {
  const { w } = sample(); w.terrain.fill(w.k.EMPTY); w.hazards = []; w.decor = []; w.mission = null; w.enemyHatch = null; w.terrainVersion++
  const layout = D.portLayout(w), beams = new Set(), waters = new Set()
  for (const ticks of [0, 66, 210, 420, 800]) {
    w.ticks = ticks
    beams.add(picture(ctx => D.drawPortBeam(ctx, w, layout)).buf)
    waters.add(picture(ctx => D.drawPortShimmer(ctx, w, layout)).buf)
  }
  assert.ok(beams.size >= 4); assert.ok(waters.size >= 4)
  assert.ok(layout.glints.length > 0)
  const staticFrame = picture(ctx => D.drawPortNight(ctx, w)).buf
  w.ticks += 400
  assert.equal(picture(ctx => D.drawPortNight(ctx, w)).buf, staticFrame)
})
test("original nets, lanterns, pots, crates, ropes, booth, captives and exit have full reserved bounds", () => {
  const { w, pal } = sample(); w.terrain.fill(w.k.EMPTY); w.hazards = []; w.pits = []
  for (const kind of ["hang", "tuft", "clump", "spire"]) for (const seed of [0, 1]) {
    const d = { kind, seed, x: 45, y: 30 }; w.decor = [d]
    const boxes = D.portReserved(w), img = picture(ctx => D.drawHarbourDecor(ctx, w, pal, d, 180, 120))
    for (const c of img.calls) assert.equal(D.assemblyUnreserved(boxes, ...c.slice(0, 4)), false)
  }
  w.decor = []; w.enemyHatch = { x: 45, y: 30, biome: "Harbour" }
  const booth = picture(ctx => D.drawEnemyHatch(ctx, w, pal, {})), boxes = D.portReserved(w)
  for (const c of booth.calls) assert.equal(D.assemblyUnreserved(boxes, ...c.slice(0, 4)), false)
  const e = w.exit, exit = picture(ctx => D.drawExitHarbour(ctx, pal, e.x * 4, e.y * 4, e.w * 4, e.h * 4))
  for (const c of exit.calls) assert.equal(D.assemblyUnreserved(boxes, ...c.slice(0, 4)), false)
  w.mission = { targets: [{ x: 70, y: 30, freed: false, dead: false }, { x: 80, y: 30, freed: true }] }
  assert.equal(D.assemblyUnreserved(D.portReserved(w), 280, 110, 1, 1), false)
  assert.equal(D.assemblyUnreserved(D.portReserved(w), 320, 110, 1, 1), true)
})
test("night containers remain lower contrast than walkable quay in every theme", () => {
  const luminance = colour => {
    const img = canvas(1, 1); img.ctx.fillStyle = colour; img.ctx.fillRect(0, 0, 1, 1)
    return img.buf[0] * 0.2126 + img.buf[1] * 0.7152 + img.buf[2] * 0.0722
  }
  for (const name of Object.keys(THEMES)) {
    const { pal } = sample(19, name)
    for (const colour of D.PORT_CONTAINERS) assert.ok(luminance(colour) < luminance(pal.dirtEdge) * 0.8, name)
    assert.ok(luminance(D.PORT_SHADOW) < luminance(pal.dirt))
  }
})
test("night backdrop precedes terrain and live light precedes ferries, exit and umbrellas", () => {
  const { w, pal } = sample(), ctx = canvas(800, 496).ctx
  let serial = 0, marks = {}
  ctx.fillRect = () => {
    assert.ok(++serial < 100000)
    if (D.PORT_CONTAINERS.includes(ctx.fillStyle)) marks.back = serial
    if (ctx.fillStyle === pal.dirtEdge) marks.ground = serial
    if (ctx.fillStyle === D.PORT_LIGHT) marks.beam = serial
    if (ctx.fillStyle === D.HARBOUR_CREAM) marks.ferry = serial
    if (ctx.fillStyle === pal.exitLight) marks.exit = serial
    if (ctx.fillStyle === pal.umbrellaStem) marks.umbrella = serial
  }
  D.drawTerrain(ctx, w, pal)
  assert.ok(marks.back > 0 && marks.ground > marks.back)
  const ag = S.spawn(w)
  Object.assign(ag, { x: 70, y: w.corridors[0].floorY - 3, state: "fall", floater: true, ownBrolly: true, fall: 9, special: false })
  w.agents = [ag]; w.ticks = 400; serial = 0; marks = {}
  D.drawActors(ctx, w, pal, {})
  assert.ok(marks.beam > 0 && marks.ferry > marks.beam && marks.exit > marks.beam && marks.umbrella > marks.beam)
})
test("harbour beam preserves opaque faces, shirts, eyes and umbrellas", () => {
  for (const name of Object.keys(THEMES)) for (const state of ["walk", "fall"]) {
    const { w, pal } = sample(19, name), mixer = { x: 210 }, ag = S.spawn(w)
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
test("original Harbour ground, nets, lamps, sea, ferries, hazards and exit retain bytes", () => {
  for (const [resolutions, expected] of [
    [[undefined, 1], "a31ef40b535e630222b4d5eb6f8d16dac6887922ee55a52a78727071e2c08812"], [[2], "1ca2f57228fe882f88ca902b637487166bcf85723817a09d5ba64fcb2aa00130"]
  ]) {
    const hash = createHash("sha256")
    for (const name of Object.keys(THEMES)) for (const level of levels)
      for (const res of resolutions) for (const ticks of [0, 77, 240]) {
        const { w, pal } = sample(level, name); w.res = res; w.ticks = ticks
        const img = canvas(400, 248, themeOf(name).background)
        D.drawBackdrop(img.ctx, w, pal); D.drawTerrainMaterials(img.ctx, w, pal)
        D.drawDecor(img.ctx, w, pal); D.drawHarbourMaterials(img.ctx, w, pal); D.drawHarbourMachines(img.ctx, w, pal); D.drawHarbourFerries(img.ctx, w, pal)
        D.drawAmbience(img.ctx, w, pal); D.drawPits(img.ctx, w, pal)
        D.drawExitBack(img.ctx, w, pal); D.drawEnemyHatch(img.ctx, w, pal, {})
        for (const h of w.hazards) D.drawHazard(img.ctx, w, pal, h, {})
        hash.update(img.buf)
      }
    assert.equal(hash.digest("hex"), expected)
  }
})
test("drawing the port leaves real ferry playthroughs identical", () => {
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



test("deep-water shimmer remains visible after the original sea fill and beneath ferries", () => {
  const { w, pal } = sample(); w.ticks = 400
  const layout = D.portLayout(w), img = canvas(800, 496)
  const calls = picture(ctx => D.drawPortWater(ctx, w)).calls
  assert.ok(calls.length > 0)
  D.drawActors(img.ctx, w, pal, {})
  const withWater = createHash("sha256").update(img.buf).digest("hex")
  const changed = canvas(800, 496)
  // Painting the unchanged opaque water after the completed frame must remove
  // our deep glints; this catches accidentally placing shimmer before pits.
  D.drawActors(changed.ctx, w, pal, {}); D.drawPits(changed.ctx, w, pal)
  assert.notEqual(createHash("sha256").update(changed.buf).digest("hex"), withWater)
  let visible = 0
  const baseline = canvas(800, 496); baseline.ctx.setTransform(2, 0, 0, 2, 0, 0)
  D.drawPits(baseline.ctx, w, pal)
  for (const c of calls) {
    const i = (Math.round(c[1] * 2) * 800 + c[0] * 2) * 3
    if (img.buf.subarray(i, i + 3).join(",") !== baseline.buf.subarray(i, i + 3).join(",")) visible++
  }
  assert.ok(visible > 0, "actual completed actor layer contains new water glints")
  assert.ok(layout.glints.length >= calls.length)
})
