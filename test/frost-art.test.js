import test from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { loadCore } from "../tools/load-core.js"
import { canvas, themeOf, THEMES } from "../tools/render.js"

const S = loadCore("Sim.js"), D = loadCore("Draw.js"), P = loadCore("Palette.js")
const levels = [3, 23, 43]
const layers = [D.drawFrostSurfaces, D.drawFrostWeather]
function sample(level = 3, name = "tokyo-night") {
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
    calls.push([...args, img.ctx.fillStyle, img.ctx.globalAlpha]); fill(...args)
  }
  img.ctx.fillStyle = "#123456"; img.ctx.globalAlpha = 0.8
  draw(img.ctx)
  return { ...img, calls }
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
  cache.set(value, proxy)
  return proxy
}
function footprint(c, visit) {
  for (let y = c[1]; y < c[1] + c[3]; y += 0.5)
    for (let x = c[0]; x < c[0] + c[2]; x += 0.5) visit(x, y)
}

test("Frost additions are absent at panel resolution and in the other eighteen biomes", () => {
  for (let level = 1; level <= S.BIOMES.length; level++) for (const res of [undefined, 1, 2]) {
    const { w } = sample(level); w.res = res
    const visible = level === 3 && res === 2
    assert.equal(D.frostPage(w), visible)
    for (const draw of layers) {
      const img = picture(ctx => draw(ctx, w))
      assert.equal(img.calls.length > 0, visible)
      assert.equal(img.ctx.fillStyle, "#123456"); assert.equal(img.ctx.globalAlpha, 0.8)
    }
  }
})

test("snow, ice, aurora and breath are deterministic, read-only and Math.random-free", () => {
  for (const level of levels) for (const name of Object.keys(THEMES)) {
    const { w, pal } = sample(level, name)
    const ag = S.spawn(w); Object.assign(ag, { x: 50, y: 10, state: "walk" })
    w.agents = [ag]
    const before = JSON.stringify(w), frozen = readonly(w), random = Math.random
    Math.random = () => { throw new Error("render RNG") }
    try {
      for (const draw of layers) {
        const a = picture(ctx => draw(ctx, frozen)), b = picture(ctx => draw(ctx, frozen))
        assert.deepEqual(a.buf, b.buf)
        assert.equal(a.ctx.fillStyle, "#123456"); assert.equal(a.ctx.globalAlpha, 0.8)
      }
      D.drawTerrain(canvas(800, 496).ctx, frozen, pal)
      D.drawActors(canvas(800, 496).ctx, frozen, pal, {})
    } finally { Math.random = random }
    assert.equal(JSON.stringify(w), before)
  }
})

test("snow caps and ice are cached; aurora and snowfall vary with ticks", () => {
  for (const level of levels) {
    const { w } = sample(level)
    const a = picture(ctx => D.drawFrostSurfaces(ctx, w))
    w.ticks += 133
    assert.deepEqual(picture(ctx => D.drawFrostSurfaces(ctx, w)).buf, a.buf)
    for (const draw of [D.drawFrostAurora, D.drawFrostSnow]) {
      const frames = [0, 37, 180, 360, 600].map(t => {
        w.ticks = t
        return picture(ctx => draw(ctx, w)).buf
      })
      for (let i = 1; i < frames.length; i++) assert.notDeepEqual(frames[i], frames[i - 1])
    }
  }
})

test("caps follow surviving top edges; translucent ice leaves original faces exposed", () => {
  const { w } = sample(), cols = w.k.COLS
  w.terrain.fill(w.k.EMPTY)
  assert.equal(picture(ctx => D.drawFrostSurfaces(ctx, w)).calls.length, 0)
  w.terrain.fill(w.k.BRICK)
  assert.equal(picture(ctx => D.drawFrostSurfaces(ctx, w)).calls.length, 0, "bridges stay unchanged")
  w.terrain.fill(w.k.ROCK)
  assert.equal(picture(ctx => D.drawFrostSurfaces(ctx, w)).calls.length, 0, "no exposed face, no repaint")
  w.terrain.fill(w.k.EMPTY)
  for (let y = 20; y < 24; y++) for (let x = 30; x < 34; x++) w.terrain[y * cols + x] = w.k.ROCK
  const img = picture(ctx => D.drawFrostSurfaces(ctx, w))
  assert.ok(img.calls.some(c => c[4] === D.FROST_SNOW && c[2] === 4), "white caps span a whole cell")
  for (const c of img.calls) {
    if (c[4] === D.FROST_SNOW) assert.ok(c[1] >= 78 && c[1] < 80, "caps sit over the top edge")
    if (c[5] < 1) {
      assert.ok(c[2] <= 1.5 && c[5] <= 0.8, "narrow translucent ice, not a replacement fill")
      footprint(c, (x, y) => assert.equal(w.terrain[Math.floor(y / 4) * cols + Math.floor(x / 4)], w.k.ROCK))
    }
  }
  // Even the snowy top cell keeps three of its four original rows.
  assert.ok(img.calls.every(c => c[5] < 1 || c[1] + c[3] <= 81))
  w.terrain.fill(w.k.EMPTY)
  assert.equal(picture(ctx => D.drawFrostSurfaces(ctx, w)).calls.length, 0)
})

test("aurora stays behind every original ridge; flakes and breath stay in open air", () => {
  for (const level of levels) {
    const { w } = sample(), top = w.k.SKY * 4, ridge = []
    D.backFrost({ set fillStyle(v) {}, fillRect(x, y, width, height) {
      if (width === 3 && height > 70) ridge.push([x, y])
    } }, D.backRng(w), { x: 0, y: top, w: 400, h: 248 - top, world: w }, {})
    assert.equal(ridge.length, 134)
    for (const ticks of [0, 180, 600]) {
      w.ticks = ticks
      const img = picture(ctx => D.drawFrostAurora(ctx, w))
      for (const c of img.calls) {
        assert.ok(c[1] + c[3] <= ridge[Math.floor(c[0] / 3)][1], "original peak occludes the aurora")
        footprint(c, (x, y) => assert.equal(D.mechanismAir(w, x, y), true))
      }
      for (const c of picture(ctx => D.drawFrostSnow(ctx, w)).calls)
        footprint(c, (x, y) => assert.equal(D.mechanismAir(w, x, y), true))
    }
    w.terrain.fill(w.k.ROCK)
    assert.equal(picture(ctx => D.drawFrostWeather(ctx, w)).calls.length, 0)
  }
})

test("breath puffs move out of the mouth, fade and stop for absent or nonwalking agents", () => {
  const { w } = sample()
  w.terrain.fill(w.k.EMPTY)
  const ag = S.spawn(w); Object.assign(ag, { x: 50, y: 20, state: "walk", id: 0 })
  w.agents = [ag]
  for (const dir of [-1, 1]) {
    ag.dir = dir
    w.ticks = 0
    const start = picture(ctx => D.drawFrostBreath(ctx, w))
    w.ticks = 16
    const end = picture(ctx => D.drawFrostBreath(ctx, w))
    assert.ok(start.calls.length); assert.ok(end.calls.length)
    assert.ok((end.calls[0][0] - start.calls[0][0]) * dir > 0)
    assert.ok(end.calls[0][5] < start.calls[0][5])
    assert.ok(end.calls[0][1] < start.calls[0][1])
    w.ticks = 24
    assert.equal(picture(ctx => D.drawFrostBreath(ctx, w)).calls.length, 0)
  }
  w.ticks = 0
  for (const state of ["fall", "saved", "bash", "brawl"]) {
    ag.state = state
    assert.equal(picture(ctx => D.drawFrostBreath(ctx, w)).calls.length, 0)
  }
  ag.state = "walk"; ag.gone = true
  assert.equal(picture(ctx => D.drawFrostBreath(ctx, w)).calls.length, 0)
  ag.gone = false; ag.id = 2
  assert.equal(picture(ctx => D.drawFrostBreath(ctx, w)).calls.length, 0, "ids stagger the exhalation")
})

test("Frost weather precedes faces, umbrellas, guards' booth and the exit", () => {
  const { w, pal } = sample(23)
  for (let i = 0; i < 160; i++) S.step(w)
  const ag = S.spawn(w)
  Object.assign(ag, { x: 70, y: 16, state: "fall", floater: true, fall: 9 })
  w.agents = [ag]
  const img = canvas(800, 496), calls = [], fill = img.ctx.fillRect.bind(img.ctx)
  img.ctx.fillRect = (...args) => { calls.push([img.ctx.fillStyle, ...args]); fill(...args) }
  D.drawActors(img.ctx, w, pal, {})
  const weather = calls.findLastIndex(c => [D.FROST_SNOW, D.FROST_BLUE].includes(c[0]))
  assert.ok(weather >= 0)
  for (const colour of [pal.skin, pal.umbrellaStem, pal.exitLight, pal.decor])
    assert.ok(calls.findLastIndex(c => c[0] === colour) > weather, `foreground ${colour} follows weather`)
})

test("original Frost ridge, terrain, icicles, motes, exit and booth retain component bytes", () => {
  // Captured from main before this pass. Separate components, no whole-frame pin.
  for (const [resolutions, expected] of [
    [[undefined, 1], "d6d616cd2b3af7022d7d0432d009a24facfa711241cef8a4318913f24f1258ca"],
    [[2], "a374c9f146a51f258b54395cb7ccc19e5e9d16ac7c88da32ea0a756bfaa0fdec"]
  ]) {
    const hash = createHash("sha256")
    for (const name of Object.keys(THEMES)) for (const level of levels)
      for (const res of resolutions) for (const ticks of [0, 77, 240]) {
        const { w, pal } = sample(level, name); w.res = res; w.ticks = ticks
        const img = canvas(400, 248, themeOf(name).background)
        D.drawBackdrop(img.ctx, w, pal); D.drawTerrainMaterials(img.ctx, w, pal)
        D.drawDecor(img.ctx, w, pal); D.drawAmbience(img.ctx, w, pal)
        D.drawExitBack(img.ctx, w, pal); D.drawEnemyHatch(img.ctx, w, pal, {})
        hash.update(img.buf)
      }
    assert.equal(hash.digest("hex"), expected)
  }
})
