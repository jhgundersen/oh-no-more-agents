import test from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { loadCore } from "../tools/load-core.js"
import { canvas, themeOf, THEMES } from "../tools/render.js"

const S = loadCore("Sim.js"), D = loadCore("Draw.js"), P = loadCore("Palette.js")
const levels = [7, 26, 45]
const layers = [D.drawSpaceshipBackdrop, D.drawSpaceshipMaterials, D.drawSpaceshipInstruments]
function sample(level = 7, name = "tokyo-night", res = 2) {
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

test("Spaceship additions are absent at panel resolution and in every other biome", () => {
  for (let level = 1; level <= S.BIOMES.length; level++) for (const res of [undefined, 1, 2]) {
    const { w, pal } = sample(level); w.res = res
    assert.equal(D.spaceshipPage(w), level === 7 && res === 2)
    for (const draw of layers) {
      const img = picture(ctx => draw(ctx, w, pal))
      assert.equal(img.calls.length > 0, level === 7 && res === 2)
      assert.equal(img.ctx.fillStyle, "#123456"); assert.equal(img.ctx.globalAlpha, 0.8)
    }
  }
})

test("ship art is deterministic, read-only, RNG-free and restores canvas state", () => {
  for (const level of levels) for (const name of Object.keys(THEMES)) {
    const { w, pal } = sample(level, name), before = JSON.stringify(w), frozen = readonly(w)
    const random = Math.random
    Math.random = () => { throw new Error("render RNG") }
    try {
      for (const draw of layers) {
        const a = picture(ctx => draw(ctx, frozen, pal)), b = picture(ctx => draw(ctx, frozen, pal))
        assert.ok(a.calls.length > 0)
        assert.deepEqual(a.buf, b.buf)
        assert.equal(a.ctx.fillStyle, "#123456"); assert.equal(a.ctx.globalAlpha, 0.8)
      }
      D.drawTerrain(canvas(800, 496).ctx, frozen, pal)
      D.drawActors(canvas(800, 496).ctx, frozen, pal, {})
    } finally { Math.random = random }
    assert.equal(JSON.stringify(w), before)
  }
})

test("service bays and hull fixings are cached; only displays use the clock", () => {
  const kinds = new Set()
  for (const level of levels) {
    const { w, pal } = sample(level)
    for (let i = 0; i < w.corridors.length; i++) kinds.add((level + i) % 3)
    for (const draw of layers.slice(0, 2)) {
      const a = picture(ctx => draw(ctx, w, pal))
      w.ticks += 137
      assert.deepEqual(picture(ctx => draw(ctx, w, pal)).buf, a.buf)
    }
    const frames = [0, 9, 45, 80, 130].map(t => {
      w.ticks = t
      return picture(ctx => D.drawSpaceshipInstruments(ctx, w, pal)).buf
    })
    for (let i = 1; i < frames.length; i++) assert.notDeepEqual(frames[i], frames[i - 1])
  }
  assert.deepEqual([...kinds].sort(), [0, 1, 2])
})

test("hull additions occupy surviving terrain; instruments vanish when breached", () => {
  for (const level of levels) {
    const { w, pal } = sample(level)
    for (const draw of layers.slice(1)) {
      const img = picture(ctx => draw(ctx, w, pal))
      for (const c of img.calls) for (let y = c[1]; y < c[1] + c[3]; y += 0.5)
        for (let x = c[0]; x < c[0] + c[2]; x += 0.5)
          assert.ok(w.terrain[Math.floor(y / 4) * w.k.COLS + Math.floor(x / 4)])
    }
    const b = D.spaceshipInstrument(w, 0)
    w.decor = []
    w.terrain.fill(w.k.ROCK)
    assert.equal(D.spaceshipInstrumentAlive(w, b), true)
    for (const [x, y] of [[b.x, b.y], [b.x + 19.5, b.y + 5.5]]) {
      const cell = Math.floor(y / 4) * w.k.COLS + Math.floor(x / 4)
      w.terrain[cell] = w.k.EMPTY
      assert.equal(D.spaceshipInstrumentAlive(w, b), false)
      w.terrain[cell] = w.k.ROCK
    }
    w.terrain.fill(w.k.EMPTY)
    for (const draw of layers.slice(1)) assert.equal(picture(ctx => draw(ctx, w, pal)).calls.length, 0)
    assert.ok(picture(ctx => D.drawSpaceshipBackdrop(ctx, w, pal)).calls.length > 0, "far wall remains behind demolished hull")
    w.terrain.fill(w.k.BRICK)
    const bricks = picture(ctx => D.drawSpaceshipMaterials(ctx, w, pal))
    assert.equal(bricks.calls.length, 0, "player bridges receive no hull or deck overlays")
    assert.equal(picture(ctx => D.drawSpaceshipInstruments(ctx, w, pal)).calls.length, 0)
  }
})

test("seams leave most of every original panel exposed without repainting the face", () => {
  const { w, pal } = sample()
  for (const m of [w.k.DIRT, w.k.ROCK, w.k.ORE, w.k.STEEL]) {
    w.terrain.fill(m)
    for (const [x, y] of [[9, 15], [10, 16], [11, 17]]) {
      const img = picture(ctx => D.drawSpaceshipFixings(ctx, w, pal, x, y, m))
      const covered = new Set()
      for (const c of img.calls) for (let yy = c[1]; yy < c[1] + c[3]; yy += 0.5)
        for (let xx = c[0]; xx < c[0] + c[2]; xx += 0.5) covered.add(`${xx},${yy}`)
      assert.ok(covered.size < 64 / 2, "more than half of each face retains its original pixels")
      assert.ok(img.calls.every(c => [pal.rigDark, D.materialShade(w.k, pal, m), D.materialEdge(w.k, pal, m)].includes(c[4])))
      assert.ok(img.calls.every(c => c[2] <= 1 || c[3] <= 1), "only grooves and fasteners")
    }
  }
})

test("displays precede faces, umbrellas, hostile gear and the airlock", () => {
  const { w, pal } = sample()
  for (let i = 0; i < 160; i++) S.step(w)
  const ag = S.spawn(w)
  Object.assign(ag, { x: 70, y: 16, state: "fall", floater: true, fall: 9 })
  w.agents = [ag]
  const img = canvas(800, 496), order = []
  for (const method of ["save", "restore", "fillRect"]) {
    const fn = img.ctx[method].bind(img.ctx)
    img.ctx[method] = (...args) => { order.push([method, img.ctx.fillStyle, ...args]); fn(...args) }
  }
  D.drawActors(img.ctx, w, pal, {})
  const mounts = w.corridors.flatMap((c, i) => [0, 1, 2].map(slot => D.spaceshipInstrument(w, i, slot)))
  const b = mounts.find(b => D.spaceshipInstrumentAlive(w, b))
  assert.ok(b, "a surviving console in the actor scene")
  const display = order.findIndex(c => c[0] === "fillRect" && c[2] === b.x + 2 && c[3] === b.y + 3)
  assert.ok(display >= 0)
  for (const colour of [pal.skin, pal.umbrellaStem, D.BOSS_GOLD, pal.exitLight])
    assert.ok(order.findLastIndex(c => c[0] === "fillRect" && c[1] === colour) > display, `actor colour ${colour} follows instruments`)
})

test("original portholes, hull, decor, motes, exit and booth retain panel component bytes", () => {
  // Saved pre-change Draw component pixels, not a whole-frame pin.
  const hash = createHash("sha256")
  for (const name of Object.keys(THEMES)) for (const level of levels)
    for (const res of [undefined, 1]) for (const ticks of [0, 77, 240]) {
      const { w, pal } = sample(level, name); w.res = res; w.ticks = ticks
      const img = canvas(400, 248, themeOf(name).background)
      D.drawBackdrop(img.ctx, w, pal); D.drawTerrainMaterials(img.ctx, w, pal)
      D.drawDecor(img.ctx, w, pal); D.drawAmbience(img.ctx, w, pal)
      D.drawExitBack(img.ctx, w, pal); D.drawEnemyHatch(img.ctx, w, pal, {})
      hash.update(img.buf)
    }
  assert.equal(hash.digest("hex"), "ac3647955217bd0cc7d7a972040cbe53ed49857a9f139a0a04bd226a33e7c73a")
})

test("page consoles preserve every original viewport and stay put after a breach", () => {
  for (const level of levels) {
    const { w, pal } = sample(level)
    const mounts = w.corridors.flatMap((c, i) => [0, 1, 2].map(slot => D.spaceshipInstrument(w, i, slot)))
    const img = canvas(800, 496)
    D.drawTerrain(img.ctx, w, pal)
    const before = img.buf.slice()
    // Overlay the live instruments on the cached hull, as the page does.
    D.drawSpaceshipInstruments(img.ctx, w, pal)
    for (const d of w.decor.filter(d => d.kind === "window")) {
      if (!w.terrain[d.y * w.k.COLS + d.x]) continue
      for (let y = (d.y * 4 - 1) * 2; y < ((d.y + d.size + 1) * 4 + 1) * 2; y++) {
        const start = (y * 800 + (d.x * 4 - 1) * 2) * 3
        const end = start + ((d.size + 2) * 4 + 2) * 2 * 3
        assert.deepEqual(img.buf.subarray(start, end), before.subarray(start, end), "viewport and stars retain their pixels")
      }
    }
    const b = mounts.find(b => D.spaceshipInstrumentAlive(w, b))
    assert.ok(b)
    w.terrain[Math.floor(b.y / 4) * w.k.COLS + b.x / 4] = w.k.EMPTY
    assert.equal(D.spaceshipInstrumentAlive(w, b), false)
    assert.deepEqual(w.corridors.flatMap((c, i) => [0, 1, 2].map(slot => D.spaceshipInstrument(w, i, slot))), mounts)
  }
  const { w } = sample()
  // If decor leaves no mounting room, the console is omitted, not placed on a port.
  w.decor = [{ kind: "window", x: 0, y: 0, size: 100 }]
  const b = D.spaceshipInstrument(w, 0)
  assert.equal(D.spaceshipInstrumentAlive(w, b), false)
})

test("saturated status lamps and scanners read at full-frame size", () => {
  const { w, pal } = sample()
  const a = picture(ctx => D.drawSpaceshipInstruments(ctx, w, pal))
  const cyan = "#36e5ed", colours = [cyan, "#76ef96", "#ffbd45", "#f45b69"]
  const lamps = a.calls.filter(c => colours.includes(c[4]) && c[2] === 2 && c[3] === 1)
  assert.ok(lamps.length >= 24, "at least six visible console clusters on level 7")
  assert.deepEqual(new Set(lamps.map(c => c[4])), new Set(colours))
  for (const colour of colours) {
    const frames = [0, 35, 70, 105, 140].map(t => {
      w.ticks = t
      return picture(ctx => D.drawSpaceshipInstruments(ctx, w, pal)).calls
        .filter(c => c[4] === colour && c[2] === 2 && c[3] === 1).map(c => c[5])
    })
    assert.ok(new Set(frames.flat()).size > 1, `${colour} lamps blink`)
  }
  const scanner = ticks => {
    w.ticks = ticks
    return picture(ctx => D.drawSpaceshipInstruments(ctx, w, pal)).calls
      .filter(c => c[4] === cyan && c[2] === 1 && c[3] === 4).map(c => c[0])
  }
  assert.notDeepEqual(scanner(0), scanner(24), "slow scanner moves across the strips")
})

test("deck caution tape marks surviving lips and leaves bridge bricks alone", () => {
  const { w, pal } = sample()
  w.terrain.fill(w.k.EMPTY)
  w.terrain[20 * w.k.COLS + 40] = w.k.STEEL
  let img = picture(ctx => D.drawSpaceshipDeck(ctx, w, pal, 40, 20))
  assert.ok(img.calls.some(c => c[4] === "#ffbd45"), "exposed lip has yellow-black tape")
  w.terrain[20 * w.k.COLS + 39] = w.k.STEEL
  w.terrain[20 * w.k.COLS + 41] = w.k.STEEL
  img = picture(ctx => D.drawSpaceshipDeck(ctx, w, pal, 40, 20))
  assert.ok(img.calls.every(c => c[4] !== "#ffbd45"), "continuous deck has no caution tape")
  assert.ok(img.calls.some(c => c[4] === pal.steelEdge && c[2] === 4), "lit deck edge")
  w.terrain.fill(w.k.BRICK)
  assert.equal(picture(ctx => D.drawSpaceshipMaterials(ctx, w, pal)).calls.length, 0)
})
