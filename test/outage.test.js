import test from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { loadCore } from "../tools/load-core.js"
import { canvas, themeOf } from "../tools/render.js"

// Outages: the lights go out for a few seconds on about one level in twelve.
// Purely visual.
const S = loadCore("Sim.js"), D = loadCore("Draw.js"), P = loadCore("Palette.js")

test("about one level in twelve, never before level six, from the colony seed", () => {
  let n = 0, total = 0
  for (let level = 1; level <= 200; level++) for (let s = 1; s <= 6; s++) {
    const w = S.generate(level, 0, level * 101 + s); total++
    if (!w.outage) continue
    n++
    assert.ok(level >= S.OUTAGE_FROM)
    assert.ok(w.outage.at >= 300 && w.outage.at < 900); assert.equal(w.outage.len, S.OUTAGE_LEN)
    assert.deepEqual(S.generate(level, 0, level * 101 + s).outage, w.outage, "a shared link replays it")
  }
  assert.ok(n / total > 0.05 && n / total < 0.12, `${n}/${total}`)
})

test("the simulation plays the same with the lights on or off", () => {
  for (const level of [7, 19, 33]) {
    const a = S.generate(level, 0, 4242), b = S.generate(level, 0, 4242)
    a.outage = { at: 320, len: 120 }; b.outage = null
    while (!a.done && a.ticks < 6000) S.step(a)
    while (!b.done && b.ticks < 6000) S.step(b)
    assert.deepEqual([a.saved, a.lost, a.ticks], [b.saved, b.lost, b.ticks])
  }
})

test("dark only inside its window, a status banner through it and after, gentler with reduced motion; read-only", () => {
  const pal = P.build(themeOf("tokyo-night").theme, 9), w = S.generate(9, 0, 3)
  for (let t = 0; t < 360; t++) S.step(w)
  w.outage = { at: 300, len: 120 }
  const frame = (ticks, over = {}) => {
    const img = canvas(400, 248), calls = []
    const fill = img.ctx.fillRect.bind(img.ctx)
    img.ctx.fillRect = (...a) => { calls.push([img.ctx.fillStyle, img.ctx.globalAlpha, ...a]); fill(...a) }
    const world = { ...w, ticks, ...over }, before = JSON.stringify(world.outage)
    D.drawOutage(img.ctx, world, pal)
    assert.equal(JSON.stringify(world.outage), before)
    return calls
  }
  assert.equal(frame(299).length, 0, "before: nothing")
  const dark = frame(360).find(c => c[0] === "#04050a")
  assert.ok(dark && dark[1] > 0.8, "near-black")
  const gentle = frame(360, { reducedMotion: true }).find(c => c[0] === "#04050a")
  assert.ok(gentle[1] < dark[1], "gentler with reduced motion")
  assert.ok(frame(360).some(c => c[0] === pal.warn), "the INVESTIGATING dot")
  const after = frame(430)
  assert.ok(!after.some(c => c[0] === "#04050a"), "lights back on")
  assert.ok(after.some(c => c[0] === "#57d36b"), "RESOLVED")
  assert.equal(frame(300 + 120 + D.OUTAGE_RESOLVED).length, 0, "and then gone")
  assert.equal(frame(360, { done: true }).length, 0, "not over the report card")
  assert.equal(D.outageLevel({ ...w, ticks: 305 }), 0.5, "fades in")
  for (const ch of "INVESTIGATING - DEGRADED PERFORMANCE RESOLVED") assert.ok(D.TRANSITION_GLYPHS[ch])
})

test("the status banner sits below the sky band, clear of event warnings and the hero's card", () => {
  const pal = P.build(themeOf("tokyo-night").theme, 9), w = S.generate(9, 0, 3)
  w.outage = { at: 300, len: 120 }
  const img = canvas(400, 248), rows = []
  const fill = img.ctx.fillRect.bind(img.ctx)
  img.ctx.fillRect = (x, y, a, b) => { if (img.ctx.fillStyle === pal.rigDark) rows.push(y); fill(x, y, a, b) }
  D.drawOutage(img.ctx, { ...w, ticks: 360 }, pal)
  assert.ok(rows.length && rows.every(y => y >= w.k.SKY * w.k.CELL), `banner at ${rows}`)
})
