import test from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { loadCore } from "../tools/load-core.js"
import { canvas, themeOf, THEMES } from "../tools/render.js"

const S = loadCore("Sim.js"), D = loadCore("Draw.js"), P = loadCore("Palette.js")
const levels = [4, 23, 42]
function sample(level = 4, name = "tokyo-night", res = 2) {
  const w = S.generate(level, 0, level * 7919 + 13)
  w.res = res; w.ticks = 77
  return { w, pal: P.build(themeOf(name).theme, level) }
}
function picture(draw) {
  const img = canvas(800, 496, "#000000"), calls = []
  img.ctx.setTransform(2, 0, 0, 2, 0, 0)
  const fill = img.ctx.fillRect.bind(img.ctx)
  img.ctx.fillRect = (...args) => {
    assert.ok(args.slice(2).every(n => n > 0), "positive rectangles")
    for (const n of args) assert.equal(n * 2, Math.round(n * 2), "hard half-pixel grid")
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
const layers = [D.drawFoundryBackdrop, D.drawFoundryMaterials, D.drawFoundryHeat]

test("Foundry additions are inert at panel and unspecified resolution", () => {
  for (const level of levels) for (const res of [undefined, 1]) {
    const { w, pal } = sample(level); w.res = res
    for (const draw of layers) {
      const img = picture(ctx => draw(ctx, w, pal))
      assert.equal(img.calls.length, 0)
      assert.equal(img.ctx.fillStyle, "#123456"); assert.equal(img.ctx.globalAlpha, 0.8)
    }
  }
})

test("Foundry art is deterministic, read only, RNG free and preserves canvas state", () => {
  for (const level of levels) for (const name of Object.keys(THEMES)) {
    const { w, pal } = sample(level, name), frozen = readonly(w), before = JSON.stringify(w)
    const random = Math.random
    Math.random = () => { throw new Error("render RNG") }
    try {
      for (const draw of layers) {
        const a = picture(ctx => draw(ctx, frozen, pal)), b = picture(ctx => draw(ctx, frozen, pal))
        assert.ok(a.calls.length > 0)
        assert.deepEqual(a.buf, b.buf)
        assert.equal(a.ctx.fillStyle, "#123456"); assert.equal(a.ctx.globalAlpha, 0.8)
      }
      // Exercise the host's complete integration, including the existing chain,
      // exit and motes. There are no simulation particles in this fresh world.
      D.drawTerrain(canvas(800, 496).ctx, frozen, pal)
      D.drawActors(canvas(800, 496).ctx, frozen, pal, {})
    } finally { Math.random = random }
    assert.equal(JSON.stringify(w), before)
  }
})

test("Foundry back wall and floor lighting belong to the cached layer", () => {
  for (const level of levels) {
    const { w, pal } = sample(level)
    for (const draw of layers.slice(0, 2)) {
      const first = picture(ctx => draw(ctx, w, pal))
      w.ticks += 137
      assert.deepEqual(picture(ctx => draw(ctx, w, pal)).buf, first.buf)
    }
    const b = D.foundryBay(w, 1)
    w.terrain.fill(w.k.EMPTY)
    assert.deepEqual(D.foundryBay(w, 1), b, "digging reveals fixed machinery")
    const empty = picture(ctx => D.drawFoundryMaterials(ctx, w, pal))
    // Ambient light can spill into an empty bay; no iron/brick courses survive.
    assert.ok(empty.calls.every(c => c[4] === D.FOUNDRY_HEAT))
  }
})

test("molten pours and sparks animate behind terrain and stop between pours", () => {
  const { w } = sample(), b = D.foundryBay(w, 0)
  w.terrain.fill(w.k.EMPTY)
  const frames = []
  for (const age of [0, 14, 40, 104, 105, 160, 210]) {
    w.ticks = (210 - b.phase % 210) % 210 + age
    const img = picture(ctx => D.drawFoundryPour(ctx, w, b))
    frames.push(img)
    for (const c of img.calls) for (let y = c[1]; y < c[1] + c[3]; y += 0.5)
      for (let x = c[0]; x < c[0] + c[2]; x += 0.5) assert.ok(D.mechanismAir(w, x, y))
  }
  assert.notDeepEqual(frames[0].buf, frames[1].buf)
  assert.notDeepEqual(frames[1].buf, frames[2].buf)
  assert.ok(frames[3].calls.length > frames[4].calls.length)
  assert.equal(frames[4].calls.length, 1, "only the furnace mouth remains")
  assert.equal(frames[5].calls.length, 1)
  assert.ok(frames[6].calls.length > 1, "the next pour begins")
  w.terrain.fill(w.k.ROCK)
  assert.equal(picture(ctx => D.drawFoundryPour(ctx, w, b)).calls.length, 0)
})

test("molten seams pulse only inside surviving earth and never mark steel or air", () => {
  const { w } = sample()
  w.terrain.fill(w.k.ROCK)
  const first = picture(ctx => D.drawFoundrySeams(ctx, w))
  w.ticks += 27
  assert.notDeepEqual(picture(ctx => D.drawFoundrySeams(ctx, w)).buf, first.buf)
  assert.ok(first.calls.length > 0)
  for (const material of [w.k.DIRT, w.k.ORE, w.k.STEEL, w.k.EMPTY]) {
    w.terrain.fill(material)
    const img = picture(ctx => D.drawFoundrySeams(ctx, w))
    assert.equal(img.calls.length > 0, material !== w.k.STEEL && material !== w.k.EMPTY)
    for (const c of img.calls) for (let y = c[1]; y < c[1] + c[3]; y += 0.5)
      for (let x = c[0]; x < c[0] + c[2]; x += 0.5)
        assert.equal(w.terrain[Math.floor(y / 4) * w.k.COLS + Math.floor(x / 4)], material)
  }
  for (const i of [0, 3, 9, 17]) {
    w.terrain.fill(w.k.EMPTY)
    const x = 6 + (i * 23 + w.level * 7) % (w.k.COLS - 12)
    const y = w.k.SKY + 3 + (i * 13 + w.level * 3) % (w.k.ROWS - w.k.SKY - 6)
    w.terrain[y * w.k.COLS + x] = w.k.DIRT
    const img = picture(ctx => D.drawFoundrySeams(ctx, w))
    assert.ok(img.calls.length > 0)
    for (const c of img.calls) assert.equal(w.terrain[Math.floor(c[1] / 4) * w.k.COLS + Math.floor(c[0] / 4)], w.k.DIRT)
  }
})

test("Foundry heat is drawn before agents, umbrellas, guards and the exit", () => {
  const { w, pal } = sample(42)
  for (var i = 0; i < 160; i++) S.step(w)
  const ag = S.spawn(w)
  Object.assign(ag, { x: 70, y: 16, state: "fall", floater: true, fall: 9 })
  w.agents = [ag]
  const img = canvas(800, 496), calls = [], fill = img.ctx.fillRect.bind(img.ctx)
  img.ctx.fillRect = (...args) => { calls.push(img.ctx.fillStyle); fill(...args) }
  D.drawActors(img.ctx, w, pal, {})
  const heat = calls.findLastIndex(c => c === D.FOUNDRY_HEAT || c === D.FOUNDRY_HOT)
  assert.ok(heat >= 0)
  assert.ok(calls.findLastIndex(c => c === pal.skin) > heat)
  assert.ok(calls.findLastIndex(c => c === pal.umbrellaStem) > heat)
  assert.ok(calls.findLastIndex(c => c === D.BOSS_GOLD) > heat)
  assert.ok(calls.findLastIndex(c => c === pal.exitLight) > heat)
})

test("Foundry backdrop, motes, blast door and chain retain their panel component bytes", () => {
  // Captured from the saved pre-change Draw, not a whole-frame pixel pin.
  const hash = createHash("sha256")
  for (const name of Object.keys(THEMES)) for (const level of levels)
    for (const res of [undefined, 1]) for (const ticks of [0, 77, 240]) {
      const { w, pal } = sample(level, name); w.res = res; w.ticks = ticks
      const img = canvas(400, 248, themeOf(name).background)
      D.drawBackdrop(img.ctx, w, pal); D.drawAmbience(img.ctx, w, pal)
      D.drawExitBack(img.ctx, w, pal); D.drawChain(img.ctx, w, pal, 100, 140, 32)
      hash.update(img.buf)
    }
  assert.equal(hash.digest("hex"), "1ee1514c29dbbb39e14f93245588abba4af0b3437c0f26c56d5332405e4beb16")
})
