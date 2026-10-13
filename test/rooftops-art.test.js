import test from "node:test"
import assert from "node:assert/strict"
import { loadCore } from "../tools/load-core.js"
import { canvas, themeOf, THEMES } from "../tools/render.js"
import { levelWith } from "./levels.js"

const S = loadCore("Sim.js"), D = loadCore("Draw.js"), P = loadCore("Palette.js")
const level = levelWith(S, "Rooftops", w => w.ziplines.length > 0, 99)
function sample(theme = "tokyo-night") {
  const w = S.generate(level, 0, 99)
  w.ticks = 200
  return { w, pal: P.build(themeOf(theme).theme, level) }
}
function picture(w, draw) {
  const res = w.res || 1, img = canvas(400 * res, 248 * res, "#000000"), calls = []
  img.ctx.setTransform(res, 0, 0, res, 0, 0)
  const fill = img.ctx.fillRect.bind(img.ctx)
  img.ctx.fillRect = (x, y, width, height) => {
    for (const n of [x, y, width, height]) assert.equal(n * 2, Math.round(n * 2), "pixel grid")
    assert.ok(width > 0 && height > 0, "positive rectangles")
    assert.equal(typeof img.ctx.fillStyle, "string")
    calls.push({ x, y, width, height, colour: img.ctx.fillStyle }); fill(x, y, width, height)
  }
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
function board(w) {
  const z = w.ziplines[0], ag = S.spawn(w)
  Object.assign(ag, { state: "walk", x: z.ax + 0.5, y: z.ay, dir: z.dir })
  w.agents = [ag]; S.stepZiplines(w)
  assert.equal(ag.state, "zip")
  return { z, ag }
}

test("lines and an actual umbrella ride draw at both resolutions without world writes or RNG", () => {
  for (const theme of Object.keys(THEMES)) for (const res of [undefined, 1, 2]) {
    const { w, pal } = sample(theme); w.res = res
    const z = w.ziplines[0]
    assert.ok(picture(w, ctx => D.drawRoofLine(ctx, readonly(w), pal, readonly(z), 0)).calls.length > 10)
    const { ag } = board(w)
    const pictures = []
    for (let t = 0; t < 400 && ag.state === "zip"; t++) {
      if (t % 8 === 0) {
        const before = JSON.stringify(w), frozen = readonly(w), random = Math.random
        Math.random = () => { throw new Error("render RNG") }
        try {
          const draw = ctx => { D.drawRoofLine(ctx, frozen, pal, frozen.ziplines[0], 0); D.drawAgent(ctx, frozen, pal, frozen.agents[0], {}) }
          const a = picture(w, draw), b = picture(w, draw)
          assert.deepEqual(a.buf, b.buf)
          assert.equal(a.ctx.globalAlpha, 1)
          assert.equal(a.calls.some(c => c.width === 0.5 || c.height === 0.5), res === 2)
          const umbrella = picture(w, ctx => D.drawZipUmbrella(ctx, frozen, pal, frozen.agents[0], D.zipDrawing(frozen, frozen.agents[0])))
          assert.ok(umbrella.calls.some(c => c.colour === D.brollyColour(w, pal, ag)), "the agent's own canopy colour")
          assert.ok(umbrella.calls.some(c => c.colour === pal.umbrellaStem && c.y < D.zipDrawing(w, ag).y), "crook over the cable")
          const cloth = umbrella.calls.filter(c => c.colour === D.brollyColour(w, pal, ag))
          assert.ok(cloth.every(c => c.width <= 3), "closed umbrella, never a floater's broad canopy")
          pictures.push(a.buf)
        } finally { Math.random = random }
        assert.equal(JSON.stringify(w), before)
      }
      w.ticks++; S.stepZiplines(w)
    }
    assert.equal(ag.state, "walk")
    assert.ok(pictures.length > 2)
    assert.notDeepEqual(pictures[0], pictures[1])
    const frozen = readonly(w), before = JSON.stringify(w)
    D.drawTerrain(canvas(400 * (res || 1), 248 * (res || 1)).ctx, frozen, pal)
    D.drawActors(canvas(400 * (res || 1), 248 * (res || 1)).ctx, frozen, pal, {})
    assert.equal(JSON.stringify(w), before)
  }
})

test("loaded cable touches every hook in either direction, sag follows the riders, and endpoints stay fixed", () => {
  assert.equal(D.ROOF_ZIP_LIFT, S.ZIP_LIFT)
  assert.equal(D.ROOF_ZIP_SAG, S.ZIP_SAG)
  const { w, pal } = sample(), { ag } = board(w)
  for (const dir of [-1, 1]) for (const res of [1, 2]) {
    w.res = res
    const z = { ax: dir > 0 ? 20 : 40, lx: dir > 0 ? 40 : 20, ay: 30, ly: 30, dir, riders: 5, usedAt: 100 }
    w.ziplines = [z]; w.terrain.fill(w.k.EMPTY)
    w.agents = []
    const idle = D.roofLineDrawing(w, z, 0)
    assert.equal(D.roofCableSag(idle, 0), 0)
    assert.ok(Math.abs(D.roofCableSag(idle, idle.length)) < 1e-10)
    assert.ok(D.roofCableSag(idle, idle.length / 2) < 1)
    const empty = picture(w, ctx => D.drawRoofLine(ctx, w, pal, z, 0))
    w.agents = [2, 8, 12, 18].map((s, id) => ({ ...ag, dir, id, zipS: s, zipV: 0.5 }))
    const loaded = D.roofLineDrawing(w, z, 0)
    for (const rider of w.agents) {
      const g = D.zipDrawing(w, rider), s = rider.zipS * 4
      const size = res === 2 ? 0.5 : 1
      assert.equal(g.y, Math.round((loaded.y + D.roofCableSag(loaded, s)) / size) * size)
      assert.equal(g.y + D.ROOF_ZIP_HANG, Math.round((S.zipFeet(z, rider.zipS).y + 1) * 4 / size) * size, "smooth feet follow Sim")
      assert.ok(Math.abs(g.x - ((z.ax + dir * rider.zipS + 0.5) * 4)) <= size / 2)
      const pose = picture(w, ctx => D.drawAgent(ctx, readonly(w), pal, readonly(rider), { labels: true }))
      assert.ok(pose.calls.some(c => c.colour === pal.shirt), "suit and shirt under the umbrella")
    }
    assert.notDeepEqual(empty.buf, picture(w, ctx => D.drawRoofLine(ctx, w, pal, z, 0)).buf)
    assert.ok(D.roofCableSag(loaded, 40) > D.roofCableSag(idle, 40) + 2)
    w.agents[0].gone = true
    assert.equal(D.roofLineDrawing(w, z, 0).loads.length, 3)
    // A ceiling walker must not flip a later rider through global spriteFlip.
    const rider = w.agents[1], pose = picture(w, ctx => D.drawAgent(ctx, w, pal, rider, {}))
    picture(w, ctx => D.drawAgent(ctx, w, pal, { ...rider, state: "ceil" }, {}))
    assert.deepEqual(pose.buf, picture(w, ctx => D.drawAgent(ctx, w, pal, rider, {})).buf)
    const swings = [200, 207, 215].map(t => { w.ticks = t; return D.zipDrawing(w, rider).swing })
    assert.ok(new Set(swings).size > 1)
    w.terrain.fill(w.k.ROCK)
    assert.equal(picture(w, ctx => D.drawRoofLine(ctx, w, pal, z, 0)).calls.length, 0, "no cable through a new wall")
  }
})

test("brick and slate detail follows surviving terrain and fine pixels stay gated", () => {
  const { w, pal } = sample()
  assert.ok(D.BUILT.Rooftops)
  for (const res of [1, 2]) {
    w.res = res
    const img = picture(w, ctx => D.drawRoofMaterials(ctx, readonly(w), pal))
    assert.ok(img.calls.length > 10)
    assert.equal(img.calls.some(c => c.width === 0.5 || c.height === 0.5), res === 2)
    for (const c of img.calls) for (let y = c.y; y < c.y + c.height; y += 0.5) for (let x = c.x; x < c.x + c.width; x += 0.5)
      assert.notEqual(w.terrain[Math.floor(y / 4) * w.k.COLS + Math.floor(x / 4)], w.k.EMPTY)
  }
  w.terrain.fill(w.k.EMPTY)
  assert.equal(picture(w, ctx => D.drawRoofMaterials(ctx, w, pal)).calls.length, 0)
})

test("chimney pots, aerials, dishes, washing, pigeons and gutters get coarse and fine art; guard sign says LOCAL HOST", () => {
  const { w, pal } = sample(); w.res = 2
  for (const kind of ["spire", "clump", "hang", "tuft"]) for (const seed of [0, 1, 2, 3]) for (const size of [0, 1, 2]) {
    const d = { kind, seed, size }
    const a = picture(w, ctx => D.drawRoofDecor(ctx, pal, d, 40, 40, 4))
    const b = picture(w, ctx => { D.drawRoofDecor(ctx, pal, d, 40, 40, 4); D.drawDecorFine(ctx, pal, d, 40, 40, 44, "roof") })
    assert.notDeepEqual(a.buf, b.buf)
  }
  w.enemyHatch = { x: 30, y: 20, biome: w.biome }
  const labels = [], img = canvas(400, 248)
  img.ctx.fillText = label => labels.push(label)
  D.drawEnemyHatch(img.ctx, readonly(w), pal, { labels: true })
  assert.ok(labels.includes("LOCAL HOST"))
})

test("rain slants, steam rises and ledge splashes expire; weather never paints through terrain", () => {
  const { w, pal } = sample()
  for (const res of [1, 2]) {
    w.res = res; w.terrain.fill(w.k.EMPTY)
    const rain = picture(w, ctx => res === 2 ? D.drawMoteRoofFine(ctx, w, pal, 80, 80) : D.drawRoofRain(ctx, w, pal, 80, 80, 1))
    assert.equal(rain.calls.length, 4)
    assert.ok(rain.calls.at(-1).x > rain.calls[0].x && rain.calls.at(-1).y < rain.calls[0].y)
    const frames = [100, 125].map(t => { w.ticks = t; return picture(w, ctx => D.drawRoofSteam(ctx, w, pal, 80, 80, 3)).buf })
    assert.notDeepEqual(frames[0], frames[1])
    assert.ok(picture(w, ctx => D.drawRoofSplash(ctx, w, pal, 80, 80, 2)).calls.length > 0)
    w.decor = [{ kind: "spire", seed: 3, size: 1, x: 20, y: 20 }, { kind: "spire", seed: 2, size: 0, x: 30, y: 20 }]
    w.terrain[21 * w.k.COLS + 20] = w.k.ROCK
    w.ticks = 100
    assert.ok(picture(w, ctx => D.drawRoofWeather(ctx, readonly(w), pal)).calls.length > 0)
    w.terrain.fill(w.k.EMPTY); w.decor = []
    w.terrain[20 * w.k.COLS + 5] = w.k.ROCK
    const phase = (47 - (5 * 7 + 20 * 13) % 47) % 47
    w.ticks = phase + 2
    assert.ok(picture(w, ctx => D.drawRoofWeather(ctx, w, pal)).calls.length > 0)
    w.ticks = phase + 6
    assert.equal(picture(w, ctx => D.drawRoofWeather(ctx, w, pal)).calls.length, 0, "splash expired")
    w.terrain.fill(w.k.ROCK)
    assert.equal(picture(w, ctx => { D.drawRoofWeather(ctx, w, pal); D.drawRoofSteam(ctx, w, pal, 80, 80, 3); D.drawMoteRoofFine(ctx, w, pal, 80, 80) }).calls.length, 0)
  }
})

test("Downpour, Loft Conversion and Power Cut mirror their rules and end cleanly", () => {
  const { w, pal } = sample()
  assert.equal(D.EVENT_VISUAL_SPANS.boost.Rooftops, S.EVENTS.find(e => e.id === "powercut").ticks)
  for (const res of [1, 2]) {
    w.res = res; w.terrain.fill(w.k.EMPTY)
    for (const mech of ["collapse", "growth"]) {
      const fx = { mech, at: "floor", x: 40, span: 6, floorY: 30, deep: 2, warnAt: 190, fireAt: 210, firedAt: -1 }
      w.ticks = 200
      assert.ok(picture(w, ctx => D.drawEventSite(ctx, readonly(w), pal, readonly(fx))).calls.length > 0)
      w.ticks = 210
      assert.equal(picture(w, ctx => D.drawRoofEventMarker(ctx, w, pal, fx)).calls.length, 0)
      fx.firedAt = 210; w.ticks = 212
      D.drawEventSite(canvas(400 * res, 248 * res).ctx, readonly(w), pal, readonly(fx))
    }
    const h = { zx0: 40, zx1: 46, zy0: 20, zy1: 23, mount: "floor", throttled: 0 }
    w.eventBoost = 200; w.eventMult = 0
    for (const mount of ["floor", "ceiling"]) {
      h.mount = mount
      const frames = [100, 115].map(t => { w.ticks = t; return picture(w, ctx => D.drawEventHazardStatus(ctx, readonly(w), pal, readonly(h), 1)).buf })
      assert.deepEqual(frames[0], frames[1], "switch stays off")
    }
    w.eventBoost = 0
    assert.equal(picture(w, ctx => D.drawEventHazardStatus(ctx, w, pal, h, 1)).calls.length, 0)
    w.mission = { done: true }
    assert.ok(picture(w, ctx => D.drawExitGlow(ctx, readonly(w), pal)).calls.length > 0)
    w.mission.done = false
    picture(w, ctx => D.drawExitGlow(ctx, readonly(w), pal))
  }
})
