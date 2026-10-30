import test from "node:test"
import assert from "node:assert/strict"
import { load } from "../tools/render.js"

// The last cells to the door: each agent goes home its own way, at page
// resolution only, and only on the door's floor while walking at it.
const D = load("Draw.js")
const exit = { x: 50, y: 20, w: 4, h: 5 }
const world = over => Object.assign({ res: 2, level: 3, exit, ticks: 0 }, over)
const agent = over => Object.assign({ id: 1, x: 46, y: 24, dir: 1, state: "walk", anim: 0 }, over)

test("only the last stretch to the door, walking at it, at page resolution", () => {
  assert.ok(D.doorStretch(world(), agent()))
  assert.equal(D.doorStretch(world({ res: 1 }), agent()), null, "the panel keeps its walk")
  assert.equal(D.doorStretch(world({ reducedMotion: true }), agent()), null)
  assert.equal(D.doorStretch(world(), agent({ dir: -1 })), null, "walking away")
  assert.equal(D.doorStretch(world(), agent({ x: 30 })), null, "too far off")
  assert.equal(D.doorStretch(world(), agent({ y: 14 })), null, "another floor")
  assert.equal(D.doorStretch(world(), agent({ state: "fall" })), null)
  assert.equal(D.doorStretch(world(), agent({ special: "hero" })), null)
  assert.equal(D.doorStretch(world({ exit: null }), agent()), null)
})

test("a colony mixes its arrivals, and an umbrella in hand only skips", () => {
  const kinds = new Set()
  for (let id = 0; id < 12; id++) kinds.add(D.doorStretch(world(), agent({ id })).kind)
  assert.equal(kinds.size, D.DOOR_STRETCH.length)
  for (let id = 0; id < 12; id++) assert.equal(D.doorStretch(world(), agent({ id, ownBrolly: true })).kind, "skip")
  for (let anim = 0; anim < 16; anim++) {
    const s = D.doorStretch(world(), agent({ anim, ownBrolly: true }))
    assert.ok(s.hop >= 0 && s.hop <= 2.5 && Number.isInteger(s.hop * 2), "a half-pixel hop")
  }
})

test("through the door the same way: the skipper bounds, the twirler spins", () => {
  const kinds = {}
  for (let id = 0; id < 12; id++) {
    const ag = agent({ id, state: "saved", fade: 2 })
    kinds[D.homeArrivalKind(world(), ag)] = ag
  }
  assert.ok(D.agentHomeLift(world(), kinds.skip) >= 2, "a bound, not a step")
  assert.ok(D.homeSpin(world(), kinds.twirl) && D.homeSpin(world(), kinds.moon))
  assert.ok(!D.homeSpin(world(), Object.assign({}, kinds.twirl, { fade: 0 })), "a half turn at a time")
  assert.equal(D.homeArrivalKind(world(), agent({ state: "saved", ownBrolly: true })), "", "the umbrella keeps its one-handed wave")
  assert.equal(D.homeArrivalKind(world({ res: 1 }), agent({ state: "saved" })), "")
})

test("a glint crosses the shades now and then, back to front", () => {
  const seen = []
  for (let t = 0; t < 217; t++) { const g = D.shadesGlint(world({ ticks: t }), agent()); if (g >= 0) seen.push(g) }
  assert.equal(seen.length, D.GLINT_TICKS)
  assert.deepEqual(seen, [...seen].sort((a, b) => a - b))
  assert.ok(Math.max(...seen) <= 4.5)
  assert.equal(D.shadesGlint(world({ reducedMotion: true }), agent()), -1)
})
