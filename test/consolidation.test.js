import test from "node:test"
import assert from "node:assert/strict"
import { loadCore } from "../tools/load-core.js"
import { canvas, themeOf } from "../tools/render.js"

// The consolidation pass: the report card fits, bubbles do not pile up or
// cover the way home, and the outage never hides a warning or the card.
const S = loadCore("Sim.js"), D = loadCore("Draw.js"), P = loadCore("Palette.js")
const pal = P.build(themeOf("tokyo-night").theme, 13)

function busy(w) {
  Object.assign(w, { done: true, doneTicks: 20, saved: 16, toRelease: 17, lost: 1, agiHome: true, agiId: 3, enemiesKilled: 3,
    umbrellaSaves: 2, brollyLandings: 5, hallucinations: 2, conflicts: 1, rateLimited: 5, escortsHome: 2, eventLog: ["x"],
    sightings: { seen: ["agi", "dreamer", "queue", "duck", "conflict"], fresh: ["conflict"] } })
  return w
}

test("the busiest realistic report card stays on the board, every row inside the plate", () => {
  for (const level of [6, 13, 47]) {
    const w = busy(S.generate(level, 0, 42))
    const rows = D.reportRows(w, pal), { y, extra } = D.reportTop(w, rows)
    assert.ok(y >= 4 && y + 62 + extra <= w.k.ROWS * w.k.CELL - 2, `level ${level}: ${y}+${62 + extra}`)
    for (const r of rows) if (r.text) assert.ok(r.text.length <= D.REPORT_CHARS, r.text)
    assert.ok(!rows.some(r => /AGI ACHIEVED/.test(r.text || "") && /^[0-9A-F]{7} /.test(r.text)), "the AGI is said once")
  }
})

test("at most two speakers at once, newest first; a merge conflict's pair counts once", () => {
  const w = { ...S.generate(1, 0, 3), ticks: 100 }
  const a = { id: 1, wonAt: 90 }, b = { id: 2, wonAt: 92 }, c = { id: 3, wonAt: 95 }
  w.agents = [a, b, c]
  assert.equal(D.quipAllowed(w, c, D.quipFor(w, c)), true)
  assert.equal(D.quipAllowed(w, b, D.quipFor(w, b)), true)
  assert.equal(D.quipAllowed(w, a, D.quipFor(w, a)), false, "the oldest of three waits")
  const p = { id: 4, conflictAt: 96, conflictSide: 1 }, q = { id: 5, conflictAt: 96, conflictSide: -1 }
  w.agents = [p, q, c]
  assert.equal(D.quipAllowed(w, p, D.quipFor(w, p)), true)
  assert.equal(D.quipAllowed(w, q, D.quipFor(w, q)), true, "both halves of the conflict")
  assert.equal(D.quipAllowed(w, c, D.quipFor(w, c)), true, "and one more")
})

test("a bubble is lifted clear of the exit and of a hazard, and not shown if it cannot be", () => {
  const w = S.generate(1, 0, 3), C = w.k.CELL
  w.exit = { x: 50, y: 40, w: 6, h: 5 }; w.hazards = []
  const over = D.bubbleClear(w, 50 * C, 40 * C + 4, 30)
  assert.ok(over + 10 <= w.exit.y * C - 4, "above the exit's frame")
  assert.equal(D.bubbleClear(w, 0, 100, 30), 100, "elsewhere it stays put")
  w.exit = { x: 50, y: 1, w: 6, h: 5 }
  assert.ok(D.bubbleClear(w, 50 * C, 6, 30) < 1, "no room above: not shown")
  w.hazards = [{ zx0: 10, zx1: 14, zy0: 20, zy1: 24, wrecked: false }]
  assert.ok(D.bubbleClear(w, 10 * C, 20 * C, 20) + 10 <= 20 * C)
})

test("no quips over the report card", () => {
  const calls = []
  const ctx = { globalAlpha: 1, fillStyle: "", save() {}, restore() {}, fillRect(...a) { calls.push(a) } }
  D.drawQuip(ctx, { ticks: 100, res: 2, done: true, k: { CELL: 4 } }, pal, { wonAt: 95 }, 50, 50)
  assert.equal(calls.length, 0)
})

test("the outage stays under an event's warning, and off the report card", () => {
  const w = S.generate(9, 0, 3)
  for (let t = 0; t < 360; t++) S.step(w)
  w.outage = { at: 300, len: 120 }; w.eventWarn = "BUFFER OVERFLOW"; w.eventWarnFor = 40; w.res = 2
  const order = []
  const img = canvas(800, 496), fill = img.ctx.fillRect.bind(img.ctx)
  img.ctx.fillRect = (...a) => { order.push(img.ctx.fillStyle); fill(...a) }
  D.drawActors(img.ctx, w, pal, {})
  const dark = order.indexOf("#04050a"), lastInk = order.length - 1
  assert.ok(dark >= 0, "the outage drew")
  assert.ok(lastInk > dark, "something drew after it")
  const banner = canvas(800, 496), bannerInks = []
  const bf = banner.ctx.fillRect.bind(banner.ctx)
  banner.ctx.fillRect = (...a) => { bannerInks.push(banner.ctx.fillStyle); bf(...a) }
  D.drawEventBanner(banner.ctx, w, pal)
  assert.ok(bannerInks.length > 0)
  const firstBannerInk = bannerInks.find(c => c !== "#04050a")
  assert.ok(order.lastIndexOf(firstBannerInk) > dark, "the warning is drawn after the dark")
  assert.equal(D.outageLevel({ ...w, ticks: 360 }) > 0, true)
  const doneCalls = []
  const ctx2 = canvas(800, 496).ctx, f2 = ctx2.fillRect.bind(ctx2)
  ctx2.fillRect = (...a) => { doneCalls.push(ctx2.fillStyle); f2(...a) }
  D.drawOutage(ctx2, { ...w, ticks: 360, done: true }, pal)
  assert.equal(doneCalls.length, 0, "not over the report card")
})
