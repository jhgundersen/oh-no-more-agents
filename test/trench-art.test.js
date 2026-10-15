import test from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { loadCore } from "../tools/load-core.js"
import { canvas, themeOf, THEMES } from "../tools/render.js"

const S = loadCore("Sim.js"), D = loadCore("Draw.js"), P = loadCore("Palette.js")
const levels = [10, 30, 50, 70], layers = [D.drawAbyssBackdrop, D.drawAbyssLife]
const MAX_CALLS = 20000
function sample(level = 10, name = "tokyo-night") {
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

test("abyss art requires page resolution and the submerged Trench", () => {
  for (let level = 1; level <= S.BIOMES.length; level++) for (const res of [undefined, 1, 2]) {
    const { w } = sample(level); w.res = res
    const visible = level === 10 && res === 2
    assert.equal(D.trenchPage(w), visible)
    for (const draw of layers) {
      const img = picture(ctx => draw(ctx, w))
      assert.equal(img.calls.length > 0, visible)
      assert.equal(img.ctx.fillStyle, "#123456"); assert.equal(img.ctx.globalAlpha, 0.8)
    }
  }
  const { w } = sample()
  for (const wet of [false, undefined]) {
    w.submerged = wet
    assert.equal(D.trenchPage(w), false)
    for (const draw of layers) assert.equal(picture(ctx => draw(ctx, w)).calls.length, 0)
  }
})

test("abyss layers are deterministic, read-only, RNG-free, half-pixel and canvas-state balanced", () => {
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

test("depth, shafts, whale and kelp are cached and stay anchored after carving", () => {
  for (const level of levels) {
    const { w } = sample(level), back = picture(ctx => D.drawAbyssBackdrop(ctx, w))
    const old = picture(ctx => D.drawAbyssBackdrop(ctx, w)).buf
    const positions = [D.abyssShafts(w), D.abyssWhale(w), D.abyssKelpBeds(w)]
    w.ticks += 271
    assert.equal(picture(ctx => D.drawAbyssBackdrop(ctx, w)).buf, old)
    w.terrain.fill(w.k.EMPTY)
    assert.deepEqual([D.abyssShafts(w), D.abyssWhale(w), D.abyssKelpBeds(w)], positions)
    assert.equal(picture(ctx => D.drawAbyssBackdrop(ctx, w)).buf, old)
    assert.ok(back.calls.some(c => c[2] === 400 && c[3] >= 20), "large explicit depth planes")
    assert.ok(back.calls.some(c => c[2] >= 50 && c[4] === D.ABYSS_WHALE), "distant large silhouette")
  }
  assert.equal(new Set(D.ABYSS_DEPTH).size, 12)
  // Both orientations retain the blunt head, flukes and deep belly.
  const a = picture(ctx => D.drawAbyssWhale(ctx, { x: 40, y: 60, dir: 1 }))
  const b = picture(ctx => D.drawAbyssWhale(ctx, { x: 40, y: 60, dir: -1 }))
  assert.notEqual(a.buf, b.buf)
})

test("live abyss art moves subtly, stays bounded, and clears original terrain, hazards, pits and exit", () => {
  for (const level of levels) {
    const { w } = sample(level)
    for (const ticks of [0, 77, 160, 476]) {
      w.ticks = ticks
      const img = picture(ctx => D.drawAbyssLife(ctx, w)), boxes = D.abyssReserved(w)
      assert.ok(img.calls.length > 0 && img.calls.length <= 68, "fixed cheap live budget")
      for (const c of img.calls) {
        assert.ok(D.abyssClear(w, ...c.slice(0, 4), boxes))
        footprint(c, (x, y) => assert.ok(D.mechanismAir(w, x, y)))
      }
    }
    const old = picture(ctx => D.drawAbyssLife(ctx, w)).buf
    w.ticks += 45
    assert.notEqual(picture(ctx => D.drawAbyssLife(ctx, w)).buf, old)
    for (const material of [w.k.DIRT, w.k.ROCK, w.k.ORE, w.k.STEEL]) {
      w.terrain.fill(material)
      assert.equal(picture(ctx => D.drawAbyssLife(ctx, w)).calls.length, 0)
    }
  }
  const { w } = sample(), C = w.k.CELL
  w.terrain.fill(w.k.EMPTY)
  for (const [cx, cy] of [[10, 10], [11, 10], [10, 11], [11, 11]]) {
    w.terrain.fill(w.k.EMPTY); w.terrain[cy * w.k.COLS + cx] = w.k.ROCK
    assert.equal(D.abyssClear(w, 43.5, 43.5, 1, 1, []), false, "every crossed cell is checked")
  }
  w.terrain.fill(w.k.EMPTY)
  assert.equal(D.abyssClear(w, -0.5, 0, 1, 1, []), false)
  assert.equal(D.abyssClear(w, 0, -0.5, 1, 1, []), false)
  const boxes = D.abyssReserved(w), e = w.exit
  assert.equal(D.abyssClear(w, e.x * C, e.y * C, 1, 1, boxes), false)
  for (const pit of w.pits) assert.equal(D.abyssClear(w, pit.x0 * C, pit.floorY * C, 1, 1, boxes), false)
})

test("large backdrop stays behind original spires; live accents precede fish, divers, umbrellas and exit", () => {
  const { w, pal } = sample(30), calls = [], ctx = canvas(800, 496).ctx
  ctx.fillRect = (...args) => {
    assert.ok(calls.length < MAX_CALLS)
    calls.push([ctx.fillStyle, ...args])
  }
  D.drawTerrain(ctx, w, pal)
  const last = calls.findLastIndex(c => [D.ABYSS_WHALE, D.ABYSS_LEAF].includes(c[0]))
  assert.ok(last >= 0)
  assert.ok(calls.findIndex((c, i) => i > last && c[0] === pal.back) > last)
  for (let i = 0; i < 240; i++) S.step(w)
  const ag = S.spawn(w)
  Object.assign(ag, { x: 70, y: 16, state: "fall", floater: true, fall: 9, special: false })
  w.agents = [ag]; calls.length = 0
  D.drawActors(ctx, w, pal, {})
  const live = calls.findLastIndex(c => [D.ABYSS_BUBBLE, D.ABYSS_LEAF, D.ABYSS_RIM].includes(c[0]))
  assert.ok(live >= 0)
  for (const colour of [pal.fish, pal.umbrellaStem, pal.exitLight])
    assert.ok(calls.findLastIndex(c => c[0] === colour) > live, `original ${colour} after accents`)
})

test("original Trench materials, spires, sea, kelp, fish, snow, pits, hazards and exit retain bytes", () => {
  for (const [resolutions, expected] of [
    [[undefined, 1], "e3bace3d5c5c296a59c936fbea4673619a993b89ccafddf11adc39a25c7cd634"], [[2], "ab546b94d0e3b4adeafc8e2c955ee7439865fd1904d9fc205e956e49fff3fc1f"]
  ]) {
    const hash = createHash("sha256")
    for (const name of Object.keys(THEMES)) for (const level of levels)
      for (const res of resolutions) for (const ticks of [0, 77, 240]) {
        const { w, pal } = sample(level, name); w.res = res; w.ticks = ticks
        const img = canvas(400, 248, themeOf(name).background)
        D.drawBackdrop(img.ctx, w, pal); D.drawTerrainMaterials(img.ctx, w, pal)
        D.drawDecor(img.ctx, w, pal); D.drawSea(img.ctx, w, pal)
        D.drawWaterLife(img.ctx, w, pal); D.drawAmbience(img.ctx, w, pal); D.drawPits(img.ctx, w, pal)
        D.drawExitBack(img.ctx, w, pal); D.drawEnemyHatch(img.ctx, w, pal, {})
        for (const h of w.hazards) D.drawHazard(img.ctx, w, pal, h, {})
        hash.update(img.buf)
      }
    assert.equal(hash.digest("hex"), expected)
  }
})

test("drawing deep-water scenery leaves real swimming/sinking/current playthroughs identical", () => {
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
