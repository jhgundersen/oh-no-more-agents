import test from "node:test"
import assert from "node:assert/strict"
import { load, canvas } from "../tools/render.js"

// The red team's guard on patrol at page resolution: an eight-beat march, and
// now and then a glance back, a yawn or a scratch. Drawn only.
const D = load("Draw.js")
const guard = over => Object.assign({ id: 7, kind: "gun", state: "walk", x: 20, y: 30, dir: 1, anim: 0 }, over)
const world = over => Object.assign({ res: 2, ticks: 0 }, over)

test("the march rises as the legs pass, settles as a boot lands, and lifts one boot at a time", () => {
  assert.equal(D.GUARD_GAIT.length, 8)
  for (const [stride, rise, back, front] of D.GUARD_GAIT) {
    for (const n of [stride, back, front]) assert.ok(Number.isInteger(n * 2), "half-pixel grid")
    assert.ok(rise === 0 || rise === 1, "a whole-pixel rise keeps the body on its grid")
    if (stride === -1) assert.equal(rise, 0, "legs widest: weight down")
    if (back || front) assert.equal(rise, 1, "a boot is up only as the legs pass")
    assert.ok(!(back && front))
  }
  const m = D.enemyMotion(world(), guard({ anim: 4 }))
  assert.ok(m.fine && m.lift.length === 2)
})

test("only a walking guard at page resolution marches and fools about", () => {
  assert.ok(D.guardGait(world(), guard()))
  for (const [w, en] of [[world({ res: 1 }), guard()], [world({ reducedMotion: true }), guard()], [world({ submerged: true }), guard()],
    [world(), guard({ kind: "sniper" })], [world(), guard({ state: "aim" })], [world(), guard({ throttled: 5 })]]) {
    assert.equal(D.guardGait(w, en), null)
    for (let t = 0; t < 600; t++) assert.equal(D.guardGag(Object.assign(w, { ticks: t }), en), null)
  }
})

test("gags are brief, rare, every kind turns up, and drawing them writes nothing", () => {
  const kinds = new Set(), en = guard(), frozen = JSON.stringify(en)
  let on = 0
  const T = 6000, img = canvas(64, 64)
  for (let t = 0; t < T; t++) {
    const g = D.guardGag(world({ ticks: t }), en)
    if (!g) continue
    on++; kinds.add(g.kind); assert.ok(g.t < D.GUARD_GAG_TICKS[g.kind])
    D.GUARD_GAG_DRAW[g.kind](img.ctx, 20, 20, 1, g.t)
  }
  assert.equal(kinds.size, D.GUARD_GAGS.length)
  assert.ok(on / T < 0.1, `busy ${(on / T * 100).toFixed(1)}% of the time`)
  assert.equal(JSON.stringify(en), frozen)
})

test("the Moderator marches without fooling about; its eye sweeps the slit and its boots kick grit", () => {
  const boss = guard({ boss: true })
  assert.ok(D.guardGait(world(), boss), "the boss marches")
  for (let t = 0; t < 2000; t++) assert.equal(D.guardGag(world({ ticks: t }), boss), null, "but keeps a straight face")
  assert.deepEqual([...new Set(D.MODERATOR_SCAN)].sort(), [0, 1, 2, 3])
  const calls = [], ctx = { set fillStyle(v) { this.s = v }, get fillStyle() { return this.s }, fillRect: (...a) => calls.push([...a, ctx.s]) }
  D.drawModeratorMarch(ctx, world({ ticks: 0 }), boss, 40, 40, 1, { stride: -1, bob: 0, fine: true })
  assert.ok(calls.some(c => c[4] === "#6b6874"), "grit on a landing")
  calls.length = 0
  D.drawModeratorMarch(ctx, world({ ticks: 0 }), boss, 40, 40, 1, { stride: 0.5, bob: 1, fine: true })
  assert.ok(!calls.some(c => c[4] === "#6b6874"), "none mid-stride")
})

test("drone props sweep from full span through edge-on, a half turn apart", () => {
  const spans = new Set()
  for (let anim = 0; anim < 8; anim++) {
    const calls = [], ctx = { save() {}, restore() {}, globalAlpha: 1, fillRect: (...a) => calls.push([...a, ctx.fillStyle]) }
    D.drawDroneRotors(ctx, { anim }, 40, 40)
    const blades = calls.filter(c => c[4] === "#c4c8d4").map(c => c[2])
    assert.deepEqual(blades, [D.DRONE_BLADE[anim % 4], D.DRONE_BLADE[(anim + 2) % 4]])
    blades.forEach(b => spans.add(b))
  }
  assert.deepEqual([...spans].sort((a, b) => a - b), [1, 4, 6])
})

test("the xeno's head rides its stride, snaps on the hunt and sniffs the floor off it", () => {
  const xeno = over => Object.assign({ id: 3, kind: "xeno", state: "walk", anim: 0 }, over)
  assert.deepEqual(D.xenoHead(world({ res: 1 }), xeno({ targetId: 9 })), { dy: 0, snap: false, sniff: -1 })
  assert.deepEqual(D.xenoHead(world({ reducedMotion: true }), xeno()), { dy: 0, snap: false, sniff: -1 })
  const snaps = new Set(), sniffs = []
  for (let t = 0; t < 300; t++) {
    snaps.add(D.xenoHead(world({ ticks: t }), xeno({ targetId: 9 })).snap)
    assert.equal(D.xenoHead(world({ ticks: t }), xeno({ targetId: 9 })).sniff, -1, "no sniffing on the hunt")
    const h = D.xenoHead(world({ ticks: t }), xeno())
    if (h.sniff >= 0) sniffs.push(h.dy)
    assert.ok(h.dy >= 0 && h.dy <= 2)
  }
  assert.deepEqual([...snaps].sort(), [false, true])
  assert.equal(sniffs.length, 2 * D.XENO_SNIFF, "a sniff every five seconds")
  assert.ok(sniffs.includes(2), "nose to the floor")
  assert.equal(D.xenoHead(world({ ticks: 0 }), xeno({ targetId: 9, touchCool: 20 })).snap, false, "sated")
})
