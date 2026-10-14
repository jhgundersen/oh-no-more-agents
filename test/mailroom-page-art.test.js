import test from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { loadCore } from "../tools/load-core.js"
import { canvas, themeOf, THEMES } from "../tools/render.js"

const S = loadCore("Sim.js"), D = loadCore("Draw.js"), P = loadCore("Palette.js")
const levels = [14, 33, 52, 71], layers = [D.drawPostalHall, D.drawPostalCycle]
const MAX_CALLS = 20000
function sample(level = 14, name = "tokyo-night") {
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

test("postal additions require Mail Room page resolution", () => {
  for (let level = 1; level <= S.BIOMES.length; level++) for (const res of [undefined, 1, 2]) {
    const { w } = sample(level); w.res = res
    const visible = level === 14 && res === 2
    assert.equal(D.mailroomPage(w), visible)
    for (const draw of layers) {
      const img = picture(ctx => draw(ctx, w))
      assert.equal(img.calls.length > 0, visible)
      assert.equal(img.ctx.fillStyle, "#123456"); assert.equal(img.ctx.globalAlpha, 0.8)
    }
  }
})

test("postal art is deterministic, read-only, RNG-free, half-pixel and canvas-state balanced", () => {
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

test("sorting walls, chutes and presses are cached and keep fixed anchors through carving", () => {
  for (const level of levels) {
    const { w } = sample(level), back = picture(ctx => D.drawPostalHall(ctx, w))
    const anchors = [w.corridors.map((_, row) => D.postalBays(w, row)), D.postalStations(w), D.postalReturnBox(w)]
    w.ticks += 271
    assert.equal(picture(ctx => D.drawPostalHall(ctx, w)).buf, back.buf)
    const b = D.postalBays(w, 0)[0], bay = picture(ctx => D.drawPostalBay(ctx, b)).buf
    w.terrain.fill(w.k.EMPTY)
    assert.deepEqual([w.corridors.map((_, row) => D.postalBays(w, row)), D.postalStations(w), D.postalReturnBox(w)], anchors)
    assert.equal(picture(ctx => D.drawPostalBay(ctx, b)).buf, bay)
    assert.ok(back.calls.some(c => c[2] === 48 && c[3] === 20 && c[4] === D.POST_BACK))
    assert.ok(back.calls.some(c => c[2] === 14 && c[3] === 9 && c[4] === D.POST_MACHINE))
    assert.ok(back.calls.some(c => c[2] === 12 && c[3] === 6 && c[4] === D.POST_METAL))
  }
})

test("far envelopes are varied and lower contrast than original playable letters", () => {
  const mean = img => {
    let sum = 0
    for (let i = 0; i < img.buf.length; i += 3) sum += img.buf[i] * 0.2126 + img.buf[i + 1] * 0.7152 + img.buf[i + 2] * 0.0722
    return sum / (img.W * img.H)
  }
  for (const name of Object.keys(THEMES)) for (let seed = 0; seed < 12; seed++) {
    const { pal } = sample(14, name), near = canvas(48, 20, D.POST_BACK), far = canvas(48, 20, D.POST_BACK)
    for (let y = 0; y < 20; y += 4) for (let x = 0; x < 48; x += 4)
      D.drawMailLetter(near.ctx, pal, x, y, seed, true)
    D.drawPostalBay(far.ctx, { x: 0, y: 0, seed })
    assert.ok(mean(far) < mean(near) * 0.8, `${name}: walkable letter remains the stronger plane`)
  }
  const { w } = sample(), calls = picture(ctx => D.drawPostalBay(ctx, D.postalBays(w, 0)[0])).calls
  const letters = calls.filter(c => c[4] === D.POST_PAPER && c[2] === 5)
  assert.ok(letters.length > 0 && letters.length < 12, "some pigeonholes are empty")
  assert.ok(new Set(letters.map(c => c[5])).size > 1, "lower shelves fade")
  assert.ok(calls.some(c => c[4] === D.POST_STAMP))
})

test("live paper and press heads move cheaply and clear terrain, hazards, exit, props, pits and tubes", () => {
  for (const level of levels) {
    const { w } = sample(level), stations = D.postalStations(w)
    for (const ticks of [0, 77, 160, 476]) {
      w.ticks = ticks
      const img = picture(ctx => D.drawPostalCycle(ctx, w)), boxes = D.postalReserved(w)
      assert.ok(img.calls.length > 0 && img.calls.length <= stations.length * 5 && img.calls.length <= 30)
      for (const c of img.calls) {
        assert.ok(D.abyssClear(w, ...c.slice(0, 4), boxes))
        footprint(c, (x, y) => assert.ok(D.mechanismAir(w, x, y)))
      }
    }
    const old = picture(ctx => D.drawPostalCycle(ctx, w)).buf
    w.ticks += 30
    assert.notEqual(picture(ctx => D.drawPostalCycle(ctx, w)).buf, old)
    for (const material of [w.k.DIRT, w.k.ROCK, w.k.ORE, w.k.STEEL]) {
      w.terrain.fill(material)
      assert.equal(picture(ctx => D.drawPostalCycle(ctx, w)).calls.length, 0)
    }
  }
  const { w } = sample(), old = D.postalReserved(w)
  w.pads.push({ ...w.pads[0], tube: false })
  assert.deepEqual(D.postalReserved(w), old, "only postal tubes reserve their path")
  const route = D.tubeRoute(w, w.pads[0])
  for (const point of route)
    assert.equal(D.assemblyUnreserved(old, point.x, point.y, 1, 1), false)
  for (const port of [route[0], route.at(-1)])
    assert.equal(D.assemblyUnreserved(old, port.x + 6, port.y + 8, 1, 1), false, "full hopper including lower flap")
  w.terrain.fill(w.k.EMPTY); w.decor = []; w.hazards = []; w.pits = []; w.pads = []
  w.corridors = w.corridors.slice(0, 1)
  const station = D.postalStations(w)[0]
  w.ticks = (120 - station.seed % 120) % 120
  const paperX = station.x - 11, paperY = station.base - 7
  w.terrain[Math.floor(paperY / 4) * w.k.COLS + Math.floor((paperX + 3) / 4)] = w.k.ROCK
  const partial = picture(ctx => D.drawPostalCycle(ctx, w))
  assert.ok(!partial.calls.some(c => [D.POST_PAPER, D.POST_FOLD, D.POST_STAMP].includes(c[4]) && c[1] >= paperY && c[1] < paperY + 2), "no orphan fold or stamp after partial occlusion")
  w.terrain.fill(w.k.EMPTY)
  w.decor = [{ kind: "hang", x: 40, y: 30, size: 1, seed: 2 },
    { kind: "tuft", x: 50, y: 30, size: 1, seed: 2 },
    { kind: "spire", x: 60, y: 30, size: 1, seed: 3 },
    { kind: "spire", x: 70, y: 30, size: 1, seed: 5 },
    { kind: "clump", x: 80, y: 30, size: 2, seed: 5 }]
  const props = D.postalReserved(w), pal = sample().pal
  for (const d of w.decor) {
    const img = picture(ctx => {
      D.drawMailDecor(ctx, pal, d, d.x * 4, d.y * 4, 4)
      D.drawDecorFine(ctx, pal, d, d.x * 4, d.y * 4, (d.y + 1) * 4, "mail")
    })
    for (const c of img.calls) assert.equal(D.assemblyUnreserved(props, ...c.slice(0, 4)), false, "complete original postal prop is reserved")
  }
})

test("RETURN TO SENDER bin appears whole or is omitted, never clipped through terrain or fixtures", () => {
  const { w } = sample(); w.terrain.fill(w.k.EMPTY); w.decor = []; w.hazards = []; w.pits = []; w.pads = []
  const b = D.postalReturnBox(w), C = w.k.CELL
  assert.ok(D.postalBoxClear(w, b, []))
  const bin = picture(ctx => D.drawPostalReturn(ctx, w))
  assert.ok(bin.calls.length > 50, "all three raster label lines drawn")
  assert.equal(D.postalBoxClear(w, b, [b]), false)
  for (const [x, y] of [[b.x, b.y], [b.x + 13, b.y + 8], [b.x + 27, b.y + 17]]) {
    w.terrain.fill(w.k.EMPTY)
    w.terrain[Math.floor(y / C) * w.k.COLS + Math.floor(x / C)] = w.k.ROCK
    assert.equal(D.postalBoxClear(w, b, []), false)
    assert.equal(picture(ctx => D.drawPostalReturn(ctx, w)).calls.length, 0)
  }
})

test("postal scenery precedes original terrain and live paper precedes tubes, umbrellas and exit", () => {
  const { w, pal } = sample(33), ctx = canvas(800, 496).ctx
  let serial = 0, marks = {}
  ctx.fillRect = () => {
    assert.ok(++serial <= 100000, "bounded complete pass")
    if (ctx.fillStyle === D.POST_PAPER) marks.postal = serial
    if (ctx.fillStyle === pal.oreEdge) marks.letters = serial
    if (ctx.fillStyle === pal.umbrellaStem) marks.umbrella = serial
    if (ctx.fillStyle === pal.exitLight) marks.exit = serial
    if (ctx.fillStyle === D.TUBE_BRASS) marks.tube = serial
  }
  D.drawTerrain(ctx, w, pal)
  assert.ok(marks.postal > 0 && marks.letters > marks.postal)
  const ag = S.spawn(w)
  Object.assign(ag, { x: 70, y: w.corridors[0].floorY - 3, state: "fall", floater: true, ownBrolly: true, fall: 9, special: false })
  w.agents = [ag]; w.ticks = 400; serial = 0; marks = {}
  D.drawActors(ctx, w, pal, {})
  assert.ok(marks.postal > 0)
  assert.ok(marks.umbrella > marks.postal && marks.exit > marks.postal && marks.tube > marks.postal)
})
test("postal scenery preserves opaque face, shirt, eye and umbrella pixels in all five themes", () => {
  for (const name of Object.keys(THEMES)) for (const state of ["walk", "fall"]) {
    const { w, pal } = sample(14, name), lamp = D.postalStations(w)[0], ag = S.spawn(w)
    Object.assign(ag, { x: lamp.x / 4, y: w.corridors[0].floorY - (state === "fall" ? 3 : 1), state,
      special: false, ownBrolly: true, floater: state === "fall", fall: 9, dir: 1, anim: 5 })
    w.agents = [ag]; w.ticks = 400
    const mask = canvas(800, 496, "#000000"), scene = canvas(800, 496)
    mask.ctx.setTransform(2, 0, 0, 2, 0, 0)
    D.drawAgent(mask.ctx, w, pal, ag, {})
    D.drawTerrain(scene.ctx, w, pal); D.drawActors(scene.ctx, w, pal, {})
    const colours = new Set([pal.skin, pal.shirt, pal.eye, pal.umbrellaStem].map(colour => {
      const dot = canvas(1, 1); dot.ctx.fillStyle = colour; dot.ctx.fillRect(0, 0, 1, 1); return dot.buf.join(",")
    }))
    let checked = 0
    const x0 = Math.floor(ag.x * 8) - 40, y0 = Math.floor(ag.y * 8) - 60
    for (let y = y0; y < y0 + 70; y++) for (let x = x0; x < x0 + 80; x++) {
      const i = (y * 800 + x) * 3, pixel = mask.buf.subarray(i, i + 3)
      if (!colours.has(pixel.join(","))) continue
      assert.equal(scene.buf.subarray(i, i + 3).join(","), pixel.join(","), `${name} ${state} opaque actor pixel`)
      checked++
    }
    assert.ok(checked >= 30, "real opaque actor pixels compared by a franking machine")
  }
})

test("original Mail Room letters, tubes, props, pits, hazards and exit retain bytes", () => {
  for (const [resolutions, expected] of [
    [[undefined, 1], "94047997b18a0835def27944b21a3705c78f5f2768356e40b48d793b36db6e5e"], [[2], "32679374231d4450de20e7832e670dbc760337aaa8d4331f2952ebd65db29677"]
  ]) {
    const hash = createHash("sha256")
    for (const name of Object.keys(THEMES)) for (const level of levels)
      for (const res of resolutions) for (const ticks of [0, 77, 240]) {
        const { w, pal } = sample(level, name); w.res = res; w.ticks = ticks
        const img = canvas(400, 248, themeOf(name).background)
        D.drawBackdrop(img.ctx, w, pal); D.drawTerrainMaterials(img.ctx, w, pal)
        D.drawDecor(img.ctx, w, pal); D.drawMailSlots(img.ctx, w, pal); for (const p of w.pads) D.drawPadPair(img.ctx, w, pal, p)
        D.drawAmbience(img.ctx, w, pal); D.drawPits(img.ctx, w, pal)
        D.drawExitBack(img.ctx, w, pal); D.drawEnemyHatch(img.ctx, w, pal, {})
        for (const h of w.hazards) D.drawHazard(img.ctx, w, pal, h, {})
        hash.update(img.buf)
      }
    assert.equal(hash.digest("hex"), expected)
  }
})

test("Dead Letter Queue and Backlog still edit terrain without relocating the sorting office", () => {
  for (const id of ["deadletter", "backlog"]) {
    const { w, pal } = sample(52), c = w.corridors[1], ev = S.EVENTS.find(e => e.id === id)
    // A floor event needs an intact span, not the hole at the old pinned x.
    let x = c.x0 + 4
    for (; x + ev.span < c.x1 - 3; x++) {
      if (!S.eventSafeX(w, x) || !S.eventSafeX(w, x + ev.span)) continue
      let clear = true
      for (let col = x; col < x + ev.span; col++) {
        const floor = w.terrain[c.floorY * w.k.COLS + col]
        if (floor === w.k.EMPTY || floor === w.k.STEEL) clear = false
        if (w.terrain[(c.floorY - 1) * w.k.COLS + col] !== w.k.EMPTY) clear = false
      }
      if (clear) break
    }
    assert.ok(x + ev.span < c.x1 - 3, "real eligible event span found")
    const site = { c, x }, fx = { ...ev, x, floorY: c.floorY, warnAt: 0, fireAt: 60, firedAt: -1 }
    w.ticks = 24
    const img = canvas(800, 496)
    D.drawEventSite(img.ctx, w, pal, fx)
    const old = createHash("sha256").update(w.terrain).digest("hex"), anchors = D.postalStations(w)
    S.fireEvent(w, ev, site)
    assert.notEqual(createHash("sha256").update(w.terrain).digest("hex"), old)
    assert.deepEqual(D.postalStations(w), anchors)
    w.ticks = 70; fx.firedAt = 60
    D.drawEventSite(img.ctx, w, pal, fx)
    for (const call of picture(ctx => D.drawPostalCycle(ctx, w)).calls)
      footprint(call, (x, y) => assert.ok(D.mechanismAir(w, x, y)))
  }
})
test("drawing the sorting office leaves real pneumatic-tube playthroughs identical", () => {
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



