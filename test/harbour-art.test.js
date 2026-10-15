import test from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { loadCore } from "../tools/load-core.js"
import { canvas, themeOf, THEMES } from "../tools/render.js"
import { levelWith } from "./levels.js"

const S = loadCore("Sim.js"), D = loadCore("Draw.js"), P = loadCore("Palette.js")
const HAR = levelWith(S, "Harbour", w => w.trains.some(t => t.boat))
function sample(res, level = HAR, name = "tokyo-night") {
  const w = S.generate(level, 0, 99)
  w.res = res; w.ticks = 240
  return { w, tr: w.trains.find(t => t.boat), pal: P.build(themeOf(name).theme, level) }
}
function picture(w, draw) {
  const img = canvas(800, 496, "#000000"), calls = [], words = []
  img.ctx.setTransform(2, 0, 0, 2, 0, 0)
  const fill = img.ctx.fillRect.bind(img.ctx)
  img.ctx.fillRect = (...args) => { calls.push([...args, img.ctx.fillStyle]); fill(...args) }
  img.ctx.fillText = (...args) => words.push(args)
  img.ctx.fillStyle = "#123456"; img.ctx.globalAlpha = 0.8
  draw(img.ctx)
  return { ...img, calls, words }
}

// No whole-frame pins: geometry, passenger visibility and layering are the
// contract. All phases use generated quays and both directions of crossing.
test("ferries draw all phases at both resolutions, read only and on the sea surface", () => {
  for (const res of [undefined, 1, 2]) for (const level of [19, 59]) for (const name of Object.keys(THEMES)) {
    const { w, tr, pal } = sample(res, level, name)
    for (const phase of ["wait", "run", "drop", "back"]) {
      Object.assign(tr, { phase, riders: phase === "back" ? [] : [1, 2, 3], v: 0.35,
        x: phase === "wait" ? tr.ax : phase === "drop" ? tr.bx : (tr.ax + tr.bx) / 2 })
      const before = JSON.stringify(w), g = D.harbourFerryDrawing(w, tr)
      const p = w.pits[tr.pit], C = 4
      const lo = p.x0 * C + 18, hi = (p.x1 + 1) * C - 18
      assert.ok(lo > hi ? Math.abs(g.x - (lo + hi) / 2) <= 0.5 : g.x >= lo - 0.5 && g.x <= hi + 0.5, "moored within the dock's water")
      assert.ok(Math.abs(g.y - w.pits[tr.pit].surfaceY * 4) <= 1)
      assert.equal(g.open, ["wait", "drop"].includes(phase))
      const img = picture(w, ctx => D.drawHarbourFerry(ctx, w, pal, tr))
      assert.ok(img.calls.length > 0)
      assert.ok(img.calls.every(c => typeof c[4] === "string" && c[2] > 0 && c[3] > 0 && c.slice(0, 4).every(Number.isFinite)))
      assert.equal(JSON.stringify(w), before)
      assert.equal(img.ctx.fillStyle, "#123456"); assert.equal(img.ctx.globalAlpha, 0.8)
      if ((res || 1) === 1) for (const c of img.calls) for (const n of c.slice(0, 4)) assert.equal(n, Math.round(n))
    }
  }
})

test("lit ferry portholes show separate silhouettes for every rider", () => {
  for (const count of [0, 1, 3, 6, 12, 18]) {
    const calls = [], tr = { riders: Array.from({ length: count }, (_, i) => i) }
    D.drawHarbourPassengers({ fillRect: (...c) => calls.push(c) }, tr, 100, 180)
    const heads = calls.filter(c => c[2] === 1)
    assert.equal(heads.length, count)
    assert.equal(new Set(heads.map(c => c.slice(0, 2).join(","))).size, count)
    assert.ok(calls.every(c => c[1] >= 168 && c[1] + c[3] <= 174), "inside lit portholes")
  }
  for (const res of [1, 2]) {
    const { w, tr, pal } = sample(res)
    tr.x = (tr.ax + tr.bx) / 2; tr.phase = "run"
    w.terrain.fill(w.k.EMPTY)
    const frames = [0, 1, 3, 6, 12, 18].map(count => {
      tr.riders = Array.from({ length: count }, (_, i) => i)
      return picture(w, ctx => D.drawHarbourFerry(ctx, w, pal, tr)).buf
    })
    for (let i = 1; i < frames.length; i++) assert.notDeepEqual(frames[i], frames[i - 1], "passengers visible in assembled boat")
  }
})

test("gangway meets the boarding point at either quay; wake is confined to the sea", () => {
  for (const res of [1, 2]) {
    const { w, tr, pal } = sample(res)
    w.terrain.fill(w.k.EMPTY)
    for (const phase of ["wait", "drop"]) {
      tr.phase = phase; tr.x = phase === "wait" ? tr.ax : tr.bx
      const g = D.harbourFerryDrawing(w, tr)
      const gangway = picture(w, ctx => D.drawHarbourGangway(ctx, g, true))
      assert.ok(gangway.calls.some(c => c[0] === g.x - 2 && c[1] === g.dockY - 1 && c[2] === 4))
      assert.notDeepEqual(gangway.buf, picture(w, ctx => D.drawHarbourGangway(ctx, g, false)).buf)
    }
    tr.x = (tr.ax + tr.bx) / 2
    for (const phase of ["run", "back", "wait", "drop"]) for (const v of [0, 0.4]) {
      tr.phase = phase; tr.v = v
      const p = w.pits[tr.pit], g = D.harbourFerryDrawing(w, tr)
      const wake = picture(w, ctx => D.drawHarbourFerryWake(ctx, w, pal, tr, g))
      if (v > 0 && ["run", "back"].includes(phase)) assert.ok(wake.calls.length > 0)
      else assert.equal(wake.calls.length, 0)
      assert.ok(wake.calls.every(c => c[0] >= p.x0 * 4 && c[0] + c[2] <= (p.x1 + 1) * 4))
    }
  }
})

test("ferry detail is gated, the quay occludes its hull, and walkers are in front", () => {
  const { w, tr, pal } = sample()
  tr.x = (tr.ax + tr.bx) / 2
  const coarse = picture(w, ctx => D.drawHarbourFerry(ctx, w, pal, tr))
  w.res = 2
  assert.notDeepEqual(picture(w, ctx => D.drawHarbourFerry(ctx, w, pal, tr)).buf, coarse.buf)
  const ag = S.spawn(w)
  Object.assign(ag, { x: tr.ax + 0.5, y: tr.y, dir: tr.dir, state: "walk" })
  w.agents = [ag]; tr.x = tr.ax
  const img = picture(w, ctx => D.drawActors(ctx, w, pal, {}))
  const boat = img.calls.findIndex(c => c[4] === D.HARBOUR_CREAM)
  const head = img.calls.findLastIndex(c => c[4] === pal.skin)
  assert.ok(boat >= 0 && head > boat)
  const ferry = picture(w, ctx => D.drawHarbourFerry(ctx, w, pal, tr))
  for (const c of ferry.calls) for (let y = c[1]; y < c[1] + c[3]; y += 0.5) for (let x = c[0]; x < c[0] + c[2]; x += 0.5)
    assert.equal(w.terrain[Math.floor(y / 4) * w.k.COLS + Math.floor(x / 4)], w.k.EMPTY)
  w.terrain.fill(w.k.ROCK)
  assert.equal(picture(w, ctx => D.drawHarbourFerry(ctx, w, pal, tr)).calls.length, 0)
})

test("Harbour scenery, materials and event markers are read-only and animate", () => {
  for (const res of [1, 2]) {
    const { w, tr, pal } = sample(res)
    const before = JSON.stringify(w)
    for (const kind of ["tuft", "clump", "spire", "hang"]) for (const seed of [0, 1])
      assert.ok(picture(w, ctx => D.drawHarbourDecor(ctx, w, pal, { kind, seed }, 100, 160)).calls.length)
    for (const kind of ["boost", "sight"]) assert.equal(D.eventVisualSpan(w, kind), kind === "boost" ? 300 : 420)
    const fx = { x: 20, floorY: 30, span: 4, fireAt: 300 }
    assert.ok(picture(w, ctx => D.drawHarbourHighWater(ctx, w, pal, fx)).words.some(c => c[0] === "STACK OVERFLOW"))
    assert.ok(picture(w, ctx => D.drawHarbourStrike(ctx, w, pal, { zx0: 20, zx1: 23, zy0: 30 }, 1)).words.some(c => c[0] === "PORT BLOCKED"))
    const first = picture(w, ctx => D.drawHarbourMachines(ctx, w, pal))
    w.ticks = 301
    assert.equal(picture(w, ctx => D.drawHarbourHighWater(ctx, w, pal, fx)).calls.length, 0)
    assert.notDeepEqual(picture(w, ctx => D.drawHarbourMachines(ctx, w, pal)).buf, first.buf)
    const p = w.pits[tr.pit]
    for (const ticks of [0, 100, 300]) { w.ticks = ticks; assert.ok(picture(w, ctx => D.drawHarbourSea(ctx, w, pal, p)).calls.length) }
    for (const patch of [{ x0: 20, x1: 21 }, { surfaceY: w.k.ROWS - 1 }])
      assert.equal(picture(w, ctx => D.drawHarbourFish(ctx, w, pal, { ...p, ...patch }, 80, (patch.x1 ? 8 : 30), (patch.surfaceY || p.surfaceY) * 4)).calls.length, 0)
    D.drawHarbourMaterials(picture(w, () => {}).ctx, w, pal)
    w.ticks = 240; assert.equal(JSON.stringify(w), before)
  }
})

test("metro car art retains its seeded component bytes in every phase and resolution", () => {
  // Captured from the saved pre-Harbour renderer on current Subway geometry.
  const hash = createHash("sha256")
  const first = S.BIOMES.indexOf("Subway") + 1
  for (const level of [first, first + S.BIOMES.length]) for (const res of [1, 2]) {
    const { w, pal } = sample(res, level)
    const tr = w.trains[0]
    for (const phase of ["wait", "run", "drop", "back"]) {
      Object.assign(tr, { phase, t: 2, riders: [1, 2, 3], v: 0.4 })
      hash.update(picture(w, ctx => D.drawSubwayTrain(ctx, w, pal, tr)).buf)
    }
  }
  assert.equal(hash.digest("hex"), "0fa73ded5eabdb2d820599f5512c83eda31503edaa203e620246f8e5872e0f52")
})
