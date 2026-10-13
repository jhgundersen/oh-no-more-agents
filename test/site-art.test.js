import test from "node:test"
import assert from "node:assert/strict"
import { loadCore } from "../tools/load-core.js"
import { canvas, themeOf, THEMES } from "../tools/render.js"

const S = loadCore("Sim.js"), D = loadCore("Draw.js"), P = loadCore("Palette.js")
const level = S.BIOMES.indexOf("Building Site") + 1
function sample(name = "tokyo-night") {
  const w = S.generate(level, 0, 99)
  w.ticks = 200
  return { w, pal: P.build(themeOf(name).theme, level) }
}
function picture(res, draw) {
  const img = canvas(400 * res, 248 * res, "#000000"), calls = []
  img.ctx.setTransform(res, 0, 0, res, 0, 0)
  const fill = img.ctx.fillRect.bind(img.ctx)
  img.ctx.fillRect = (x, y, width, height) => {
    assert.equal(typeof img.ctx.fillStyle, "string")
    for (const n of [x, y, width, height]) assert.ok(Number.isFinite(n) && n * 2 === Math.round(n * 2), "pixel grid")
    assert.ok(width > 0 && height > 0)
    calls.push({ x, y, width, height, colour: img.ctx.fillStyle }); fill(x, y, width, height)
  }
  draw(img.ctx)
  return { ...img, calls }
}
function pickup(w) {
  const crane = w.cranes[0], ag = S.spawn(w)
  ag.state = "walk"; ag.x = crane.ax + 0.5; ag.y = crane.y; ag.dir = crane.dir
  w.agents = [ag]; S.stepCranes(w)
  assert.equal(ag.state, "hooked")
  return { crane, ag }
}
function advance(w) { w.ticks++; S.stepCranes(w) }

// Property checks, not frame snapshots: the simulation is the source of every
// hook position, and rendering may neither advance it nor attach a passenger.
test("cranes draw every phase at both resolutions without writing world state", () => {
  for (const name of Object.keys(THEMES)) for (const res of [undefined, 1, 2]) {
    const { w, pal } = sample(name); w.res = res
    const crane = w.cranes[0], phases = new Set()
    const wait = picture(res || 1, ctx => D.drawCrane(ctx, w, pal, crane))
    assert.ok(wait.calls.length > 0)
    const { ag } = pickup(w)
    for (let t = 0; t < 200 && (t === 0 || crane.phase !== "wait"); t++) {
      if (!phases.has(crane.phase)) {
        phases.add(crane.phase)
        const before = JSON.stringify(w)
        const draw = ctx => { D.drawCrane(ctx, w, pal, crane); D.drawAgent(ctx, w, pal, ag, {}) }
        const a = picture(res || 1, draw), b = picture(res || 1, draw)
        assert.deepEqual(a.buf, b.buf)
        assert.equal(JSON.stringify(w), before)
        assert.equal(a.ctx.globalAlpha, 1)
        assert.equal(a.calls.some(c => c.width === 0.5 || c.height === 0.5), res === 2)
      }
      advance(w)
    }
    assert.deepEqual([...phases].sort(), ["across", "back", "down", "up"])
    const before = JSON.stringify(w)
    D.drawTerrain(canvas(400 * (res || 1), 248 * (res || 1)).ctx, w, pal)
    D.drawActors(canvas(400 * (res || 1), 248 * (res || 1)).ctx, w, pal, {})
    assert.equal(JSON.stringify(w), before)
  }
})

test("the girder and end stops stay in air under every generated roof", () => {
  let cranes = 0
  for (let lv = level; lv <= 300; lv += S.BIOMES.length) {
    const w = S.generate(lv, 0, 99), pal = P.build(themeOf("tokyo-night").theme, lv)
    for (const crane of w.cranes) for (const res of [1, 2]) {
      cranes++; w.res = res
      const left = Math.min(crane.ax, crane.hx) * 4, width = (Math.abs(crane.ax - crane.hx) + 1) * 4
      const roof = D.craneRailY(w, crane)
      const img = picture(res, ctx => D.drawCraneRail(ctx, w, pal, left, roof, width))
      for (const c of img.calls) {
        assert.ok(c.y >= roof && c.y + c.height <= roof + 4)
        for (let x = c.x; x < c.x + c.width; x += 0.5) for (let y = c.y; y < c.y + c.height; y += 0.5)
          assert.ok(D.mechanismAir(w, x, y), `level ${lv}: rail penetrated roof at ${x},${y}`)
      }
    }
  }
  assert.ok(cranes > 10)
})

test("hook meets the rider's collar and the lowering cable grows down the hole", () => {
  for (const res of [1, 2]) {
    const { w, pal } = sample(); w.res = res
    const { crane, ag } = pickup(w)
    for (let i = 0; i < 25; i++) advance(w)
    const top = D.craneDrawing(w, crane)
    const short = picture(res, ctx => D.drawCraneCable(ctx, w, pal, top))
    while (crane.phase !== "down") advance(w)
    for (let i = 0; i < 12; i++) advance(w)
    const low = D.craneDrawing(w, crane)
    assert.ok(low.tipY > top.tipY + 12)
    assert.equal(low.feet, Math.round((ag.y + 1) * 4 * res) / res)
    assert.equal(low.tipY, low.feet - 10)
    const long = picture(res, ctx => D.drawCraneCable(ctx, w, pal, low))
    assert.ok(long.calls.length > short.calls.length + 12)
    assert.equal(long.calls[0].y, low.railY + 4)
    assert.ok(long.calls.at(-1).y + 1 <= low.tipY - 3 + 1)
    const pose = picture(res, ctx => D.drawAgent(ctx, w, pal, ag, {}))
    picture(res, ctx => D.drawAgent(ctx, w, pal, { ...ag, state: "ceil" }, {}))
    assert.deepEqual(picture(res, ctx => D.drawAgent(ctx, w, pal, ag, {})).buf, pose.buf, "a ceiling walker cannot flip the next rider")
    assert.ok(pose.calls.some(c => c.height === 5 && c.width === 1), "raised arms")
    assert.ok(pose.calls.some(c => c.height === 4 && c.width === 1), "dangling legs")
    const walk = picture(res, ctx => D.drawAgent(ctx, w, pal, { ...ag, state: "walk" }, {}))
    assert.notDeepEqual(pose.buf, walk.buf)
    const sway = [100, 108, 116].map(t => { w.ticks = t; return D.craneDrawing(w, { ...crane, phase: "across" }).tipX })
    assert.ok(new Set(sway).size > 1)
    assert.ok(sway.every(x => Math.abs(x - low.x) <= 1))
  }
})

test("landing dust follows set-down and expires during reel-in, with none at stalled release", () => {
  const { w, pal } = sample(), { crane, ag } = pickup(w)
  while (ag.state === "hooked") advance(w)
  assert.ok(picture(1, ctx => D.drawCraneLanding(ctx, w, pal, crane)).calls.length > 0)
  for (let i = 0; i < 11; i++) advance(w)
  assert.equal(picture(1, ctx => D.drawCraneLanding(ctx, w, pal, crane)).calls.length, 0)
  for (const patch of [{ phase: "wait" }, { usedAt: -1 }, { drop: 0 }, { drop: 99 }, { hookX: crane.ax }])
    assert.equal(picture(1, ctx => D.drawCraneLanding(ctx, w, pal, { ...crane, ...patch })).calls.length, 0)
})

test("site surfaces follow surviving cells and fine detail is resolution-gated", () => {
  const { w, pal } = sample()
  assert.ok(D.BUILT[w.biome])
  w.terrain.fill(w.k.EMPTY)
  for (const [i, material] of [w.k.DIRT, w.k.ROCK, w.k.ORE, w.k.STEEL].entries())
    w.terrain[20 * w.k.COLS + 30 + i] = material
  for (const res of [1, 2]) {
    w.res = res
    const before = JSON.stringify(w)
    const img = picture(res, ctx => D.drawSiteMaterials(ctx, w, pal))
    assert.equal(JSON.stringify(w), before)
    for (const c of img.calls) for (let x = c.x; x < c.x + c.width; x += 0.5) for (let y = c.y; y < c.y + c.height; y += 0.5)
      assert.notEqual(w.terrain[Math.floor(y / 4) * w.k.COLS + Math.floor(x / 4)], w.k.EMPTY)
    assert.equal(img.calls.some(c => c.width === 0.5 || c.height === 0.5), res === 2)
  }
  w.terrain.fill(w.k.EMPTY)
  assert.equal(picture(2, ctx => D.drawSiteMaterials(ctx, w, pal)).calls.length, 0)
})

test("site props, sparks and build-failed booth have their own art at both resolutions", () => {
  const { w, pal } = sample()
  for (const kind of ["spire", "clump", "tuft", "hang"]) for (const seed of [3, 4, 5]) for (const size of [0, 1, 2]) {
    const d = { kind, seed, size }
    const coarse = picture(2, ctx => D.drawSiteDecor(ctx, pal, d, 40, 40, 4))
    const fine = picture(2, ctx => {
      D.drawSiteDecor(ctx, pal, d, 40, 40, 4); D.drawDecorFine(ctx, pal, d, 40, 40, 44, "site")
    })
    assert.notDeepEqual(coarse.buf, fine.buf)
  }
  w.enemyHatch = { x: 30, y: 20, biome: w.biome }
  const labels = [], img = canvas(400, 248)
  img.ctx.fillText = text => labels.push(text)
  D.drawEnemyHatch(img.ctx, w, pal, { labels: true })
  assert.ok(labels.includes("BUILD FAILED"))
  w.terrain.fill(w.k.EMPTY)
  const d = { kind: "tuft", seed: 5, x: 30, y: 20 }
  for (const res of [1, 2]) {
    w.res = res; w.ticks = 100
    const sparks = picture(res, ctx => D.drawSiteSparks(ctx, w, pal, d))
    assert.ok(sparks.calls.length > 0)
    assert.equal(sparks.calls.some(c => c.width === 0.5), res === 2)
    w.ticks = 140
    assert.equal(picture(res, ctx => D.drawSiteSparks(ctx, w, pal, d)).calls.length, 0)
    w.terrain.fill(w.k.ROCK); w.ticks = 100
    assert.equal(picture(res, ctx => D.drawSiteSparks(ctx, w, pal, d)).calls.length, 0)
    w.terrain.fill(w.k.EMPTY)
  }
})

test("Scope Creep and Missed Deadline mark their site until firing; Crunch Time mirrors its duration", () => {
  const { w, pal } = sample()
  const events = S.EVENTS.filter(e => e.biome === w.biome)
  assert.equal(events.length, 3)
  assert.equal(D.EVENT_VISUAL_SPANS.boost[w.biome], events.find(e => e.mech === "blackout").ticks)
  for (const mech of ["growth", "collapse"]) for (const res of [1, 2]) {
    w.res = res
    const fx = { mech, at: "floor", x: 40, span: 6, floorY: 30, deep: 2, warnAt: 190, fireAt: 210, firedAt: -1 }
    const before = JSON.stringify(w)
    assert.ok(picture(res, ctx => D.drawEventSite(ctx, w, pal, fx)).calls.length > 0)
    assert.equal(JSON.stringify(w), before)
    w.ticks = 210
    assert.equal(picture(res, ctx => D.drawSiteEventMarker(ctx, w, pal, fx)).calls.length, 0)
    w.ticks = 200
  }
})
