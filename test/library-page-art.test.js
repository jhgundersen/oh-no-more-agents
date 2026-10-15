import test from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { loadCore } from "../tools/load-core.js"
import { canvas, themeOf, THEMES } from "../tools/render.js"

const S = loadCore("Sim.js"), D = loadCore("Draw.js"), P = loadCore("Palette.js")
const levels = [13, 33, 53, 73], layers = [D.drawReadingHall, D.drawReadingDust]
const MAX_CALLS = 20000
function sample(level = 13, name = "tokyo-night") {
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

test("reading-room additions require Library page resolution", () => {
  for (let level = 1; level <= S.BIOMES.length; level++) for (const res of [undefined, 1, 2]) {
    const { w } = sample(level); w.res = res
    const visible = level === 13 && res === 2
    assert.equal(D.libraryPage(w), visible)
    for (const draw of layers) {
      const img = picture(ctx => draw(ctx, w))
      assert.equal(img.calls.length > 0, visible)
      assert.equal(img.ctx.fillStyle, "#123456"); assert.equal(img.ctx.globalAlpha, 0.8)
    }
  }
})

test("reading art is deterministic, read-only, RNG-free, half-pixel and canvas-state balanced", () => {
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

test("tall stacks, lamps and ladders are cached and keep their original anchors", () => {
  for (const level of levels) {
    const { w } = sample(level), back = picture(ctx => D.drawReadingHall(ctx, w))
    const anchors = [D.readingCases(w), D.readingLamps(w)]
    w.ticks += 271
    assert.equal(picture(ctx => D.drawReadingHall(ctx, w)).buf, back.buf)
    w.terrain.fill(w.k.EMPTY)
    assert.deepEqual([D.readingCases(w), D.readingLamps(w)], anchors)
    assert.equal(picture(ctx => D.drawReadingHall(ctx, w)).buf, back.buf)
    assert.ok(back.calls.some(c => c[2] === 42 && c[3] > 200 && c[4] === D.READING_BACK))
    assert.ok(back.calls.some(c => c[2] === 0.5 && c[3] === 26 && c[4] === D.READING_EDGE), "ladder rails")
    assert.ok(!back.calls.some(c => c[2] === 36 && c[3] === 8), "clipped extra sign removed")
    const pool = back.calls.filter(c => c[4] === D.READING_LIGHT && c[3] === 2.5)
    assert.equal(pool.length, D.readingLamps(w).length * 12)
    assert.ok(pool.every(c => c[5] <= 0.18 && c[5] >= 0.04))
  }
  const spines = Array.from({ length: 24 }, (_, seed) => picture(ctx => D.drawReadingSpine(ctx, 40, 60, seed)))
  assert.equal(new Set(spines.map(img => img.calls[0][4])).size, 6)
  assert.ok(new Set(spines.map(img => img.calls[0][2])).size > 1)
  assert.ok(new Set(spines.map(img => img.calls[0][3])).size > 1)
})

test("dust moves within lamp pools at a fixed cheap budget and clears all original terrain and fixtures", () => {
  for (const level of levels) {
    const { w } = sample(level), lamps = D.readingLamps(w)
    for (const ticks of [0, 77, 160, 476]) {
      w.ticks = ticks
      const img = picture(ctx => D.drawReadingDust(ctx, w)), boxes = D.abyssReserved(w)
      assert.ok(img.calls.length > 0 && img.calls.length <= lamps.length * 6 && img.calls.length <= 72)
      for (const c of img.calls) {
        assert.ok(D.abyssClear(w, ...c.slice(0, 4), boxes))
        assert.ok(lamps.some(b => {
          if (c[1] < b.y + 6 || c[1] + c[3] > b.y + 20) return false
          const half = 3 + Math.floor((c[1] - b.y - 5) / 2.5) * 1.5
          return c[0] >= b.x - half && c[0] + c[2] <= b.x + half
        }), "entire mote lies within an actual warm pool band")
        footprint(c, (x, y) => assert.ok(D.mechanismAir(w, x, y)))
      }
    }
    const old = picture(ctx => D.drawReadingDust(ctx, w)).buf
    w.ticks += 48
    assert.notEqual(picture(ctx => D.drawReadingDust(ctx, w)).buf, old)
    for (const material of [w.k.DIRT, w.k.ROCK, w.k.ORE, w.k.STEEL]) {
      w.terrain.fill(material)
      assert.equal(picture(ctx => D.drawReadingDust(ctx, w)).calls.length, 0)
    }
  }
})

test("warm backgrounds and motes precede original book walls, props, umbrellas and exit", () => {
  const { w, pal } = sample(33), ctx = canvas(800, 496).ctx
  let serial = 0, marks = {}
  // The Library has many original shelf strokes. Check order as a stream,
  // rather than storing a complete terrain recording just to find four marks.
  ctx.fillRect = () => {
    assert.ok(++serial <= 100000, "bounded complete pass")
    if (ctx.fillStyle === D.READING_DUST) marks.reading = serial
    if (D.LIBRARY_BINDINGS.includes(ctx.fillStyle)) marks.books = serial
    if (ctx.fillStyle === pal.umbrellaStem) marks.umbrella = serial
    if (ctx.fillStyle === pal.exitLight) marks.exit = serial
  }
  D.drawTerrain(ctx, w, pal)
  assert.ok(marks.reading > 0 && marks.books > marks.reading)
  const ag = S.spawn(w)
  Object.assign(ag, { x: 70, y: w.corridors[0].floorY - 3, state: "fall", floater: true, ownBrolly: true, fall: 9, special: false })
  w.agents = [ag]; w.ticks = 400; serial = 0; marks = {}
  D.drawActors(ctx, w, pal, {})
  assert.ok(marks.reading > 0)
  assert.ok(marks.umbrella > marks.reading && marks.exit > marks.reading)
})

test("warm pools preserve opaque face, shirt, eye and umbrella pixels in all five themes", () => {
  for (const name of Object.keys(THEMES)) for (const state of ["walk", "fall"]) {
    const { w, pal } = sample(13, name), lamp = D.readingLamps(w)[0], ag = S.spawn(w)
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
    assert.ok(checked >= 30, "real opaque actor pixels compared under a reading lamp")
  }
})

test("original Library books, stacks, lamp dust, props, pits, hazards and exit retain bytes", () => {
  for (const [resolutions, expected] of [
    [[undefined, 1], "24d63043bac6994d83d4634d44bc4d23e4ff5c6193156420993a17b83fde0ce4"], [[2], "ac7d028ea26b9ec3df8c616beef3126d4a4910f2595f7f7ed56dda444949bba4"]
  ]) {
    const hash = createHash("sha256")
    for (const name of Object.keys(THEMES)) for (const level of levels)
      for (const res of resolutions) for (const ticks of [0, 77, 240]) {
        const { w, pal } = sample(level, name); w.res = res; w.ticks = ticks
        const img = canvas(400, 248, themeOf(name).background)
        D.drawBackdrop(img.ctx, w, pal); D.drawTerrainMaterials(img.ctx, w, pal)
        D.drawDecor(img.ctx, w, pal); D.drawLibraryStacks(img.ctx, w, pal); D.drawLibraryLamplight(img.ctx, w, pal)
        D.drawAmbience(img.ctx, w, pal); D.drawPits(img.ctx, w, pal)
        D.drawExitBack(img.ctx, w, pal); D.drawEnemyHatch(img.ctx, w, pal, {})
        for (const h of w.hazards) D.drawHazard(img.ctx, w, pal, h, {})
        hash.update(img.buf)
      }
    assert.equal(hash.digest("hex"), expected)
  }
})

test("Deprecation Notice and Reindexing still edit terrain without relocating the reading room", () => {
  for (const id of ["weeding", "reindex"]) {
    const { w, pal } = sample(33), c = w.corridors[0], ev = S.EVENTS.find(e => e.id === id)
    const site = { c, x: 30 }, fx = { ...ev, x: 30, floorY: c.floorY, warnAt: 0, fireAt: 60, firedAt: -1 }
    w.ticks = 24
    const img = canvas(800, 496)
    D.drawEventSite(img.ctx, w, pal, fx)
    const old = createHash("sha256").update(w.terrain).digest("hex"), anchors = D.readingLamps(w)
    S.fireEvent(w, ev, site)
    assert.notEqual(createHash("sha256").update(w.terrain).digest("hex"), old)
    assert.deepEqual(D.readingLamps(w), anchors)
    w.ticks = 70; fx.firedAt = 60
    D.drawEventSite(img.ctx, w, pal, fx)
    for (const call of picture(ctx => D.drawReadingDust(ctx, w)).calls)
      footprint(call, (x, y) => assert.ok(D.mechanismAir(w, x, y)))
  }
})
test("drawing the reading room leaves real shelf-climb playthroughs identical", () => {
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



test("distant bindings fade with depth and stay darker than the original walkable shelves", () => {
  const luminance = image => {
    let total = 0
    for (let i = 0; i < image.buf.length; i += 3) total += image.buf[i] * 0.2126 + image.buf[i + 1] * 0.7152 + image.buf[i + 2] * 0.0722
    return total / (image.W * image.H)
  }
  for (const name of Object.keys(THEMES)) for (let seed = 0; seed < 12; seed++) {
    const { pal } = sample(13, name), front = canvas(4, 4, D.READING_BACK)
    D.drawLibraryBooks(front.ctx, pal, 0, 0, 4, seed, true)
    const backs = [0, 1].map(depth => {
      const img = canvas(4, 4, D.READING_BACK)
      D.drawReadingSpine(img.ctx, 1, 4, seed, depth)
      return luminance(img)
    })
    assert.ok(backs[1] < backs[0], "depth dims the same binding")
    assert.ok(backs[0] < luminance(front) * 0.8, `${name}: original terrain binding pops`)
  }
  const { w } = sample(), lamps = D.readingLamps(w)
  const calls = picture(ctx => D.drawReadingHall(ctx, w)).calls
  for (const b of lamps) {
    const centre = calls.filter(c => c[4] === D.READING_LIGHT && c[0] === b.x - 3 && c[1] === b.y + 5 && c[3] === 2.5)
    const edge = calls.filter(c => c[4] === D.READING_LIGHT && c[0] === b.x - 5 && c[1] === b.y + 5 && c[3] === 2.5)
    assert.equal(centre.length, 1); assert.equal(edge.length, 1)
    assert.ok(centre[0][5] >= 0.18 && edge[0][5] < centre[0][5], "visible centre with feathered edge")
  }
})
