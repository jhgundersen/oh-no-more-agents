import test from "node:test"
import assert from "node:assert/strict"
import { loadCore } from "../tools/load-core.js"

// The heroes' own moves, on constructed scenes. `npm run sim heights` checks
// the same first two things across the roster; here they fail the build.
const S = loadCore("Sim.js")
const fresh = () => S.generate(1, 0, 1 * 7919 + 13)
const clear = (w, x0, x1, y0, y1) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) w.terrain[y * S.COLS + x] = S.EMPTY }
const floor = (w, x0, x1, y) => { for (let x = x0; x <= x1; x++) w.terrain[y * S.COLS + x] = S.DIRT }

for (const spec of S.SPECIALS) {
  test(`${spec.name} survives a lethal drop by its own ${spec.height}`, () => {
    const w = fresh(), x = 20, top = 20, bottom = 42
    clear(w, x - 2, x + 3, top - 10, bottom); floor(w, x - 2, x + 3, bottom + 1)
    const ag = { special: spec.id, x: x + 0.5, y: top, dir: 1, state: "walk", anim: 0, turns: 0, floater: false, fall: 0, timer: 0 }
    S.specialAtEdge(w, ag, ag.x + S.WALK_SPEED, bottom - top, -1)
    for (let t = 0; (ag.state === "height" || ag.state === "rappel") && t < 500; t++)
      ag.state === "height" ? S.stepSpecialHeight(w, ag) : S.stepRappel(w, ag)
    assert.equal(ag.state, "walk"); assert.equal(ag.y, bottom)
  })
}

test("no two heroes share a way down", () => {
  assert.equal(new Set(S.SPECIALS.map(s => s.height)).size, S.SPECIALS.length)
})

const UPWARD = new Set(["recoil", "balloon", "helicopter", "ghost", "gunwing", "tractor", "chain", "jetpack"])
for (const spec of S.SPECIALS.filter(s => UPWARD.has(s.height))) {
  test(`${spec.name} goes up to a ledge by ${spec.height}`, () => {
    const w = fresh()
    clear(w, 5, 35, 5, 45); floor(w, 5, 35, 43); floor(w, 26, 30, 26)
    const ag = { special: spec.id, x: 20.5, y: 42, dir: 1, state: "walk", anim: 0, timer: 0, still: 0, turns: 0 }
    assert.ok(S.startSpecialAscent(w, ag))
    for (let t = 0; ag.state === "height" && t < 500; t++) S.stepSpecialHeight(w, ag)
    assert.equal(ag.state, "walk"); assert.equal(ag.y, 25)
  })
}

test("nothing goes up without a ledge to go to", () => {
  const w = fresh()
  clear(w, 5, 35, 5, 45); floor(w, 5, 35, 43)
  const jet = S.SPECIALS.find(s => s.height === "jetpack")
  const ag = { special: jet.id, x: 20.5, y: 42, dir: 1, state: "walk", anim: 0, timer: 0, still: 0, turns: 0 }
  assert.ok(!S.startSpecialAscent(w, ag))
})

// Chain of Thought, Speculative Decoder and Model Collapse go through a wall
// to the first place on the far side there is room to stand.
for (const act of ["chain", "speculate", "collapse"]) {
  test(`${act} crosses a wall to standing room`, () => {
    const w = fresh()
    w.agents = []
    clear(w, 10, 50, 30, 42); floor(w, 10, 50, 43)
    for (let y = 36; y <= 42; y++) for (let x = 24; x <= 26; x++) w.terrain[y * S.COLS + x] = S.DIRT
    const spec = S.SPECIALS.find(s => s.act === act)
    const ag = { id: 1, special: spec.id, x: 22.5, y: 42, dir: 1, state: "walk", anim: 0, timer: 0, modelGen: 0 }
    const friend = { id: 2, x: 20.5, y: 42, dir: -1, state: "walk", gone: false }
    w.agents.push(ag, friend)
    assert.ok(S.specialTraverse(w, ag, act, true), "a dry run sees the landing")
    assert.ok(S.specialTraverse(w, ag, act, false))
    assert.ok(ag.x > 26, "landed past the wall")
    if (act === "chain") assert.ok(friend.x > 24 && friend.dir === 1, "and brought a colleague")
    if (act === "collapse") assert.ok(w.agents.length > 2, "and left a cheaper copy")
  })
}

test("no traversal into steel", () => {
  const w = fresh()
  clear(w, 10, 50, 30, 42); floor(w, 10, 50, 43)
  for (let y = 36; y <= 42; y++) w.terrain[y * S.COLS + 24] = S.STEEL
  const ag = { id: 1, special: "chainthought", x: 22.5, y: 42, dir: 1, state: "walk" }
  assert.ok(!S.specialTraverse(w, ag, "chain", true))
})

test("Web Crawler goes up the wall, along the ceiling, and comes down past it", () => {
  const w = fresh()
  w.agents = []
  clear(w, 10, 60, 30, 42); floor(w, 10, 60, 43)
  floor(w, 10, 60, 33)                                         // the ceiling
  for (let y = 38; y <= 42; y++) for (let x = 24; x <= 25; x++) w.terrain[y * S.COLS + x] = S.DIRT   // the wall
  const spider = S.SPECIALS.find(s => s.act === "ceiling")
  const ag = { id: 1, special: spider.id, x: 23.5, y: 42, dir: 1, state: "walk", anim: 0, timer: 0, turns: 0, fall: 0 }
  w.agents.push(ag)
  S.startCeiling(w, ag)
  assert.equal(ag.state, "ceil", "on the ceiling")
  assert.equal(ag.y, 34)
  for (let t = 0; t < 600 && ag.state !== "walk"; t++) {
    if (ag.state === "ceil") S.stepCeiling(w, ag)
    else if (ag.state === "fall") S.stepFall(w, ag)
    else if (ag.state === "height") S.stepSpecialHeight(w, ag)
    else if (ag.state === "rappel") S.stepRappel(w, ag)
    else break
  }
  assert.ok(ag.x > 26, "past the wall")
  assert.ok(!ag.gone, "in one piece")
})

test("no ceiling walk without five cells of ceiling to walk", () => {
  const w = fresh()
  clear(w, 10, 60, 20, 42); floor(w, 10, 60, 43)
  const spider = S.SPECIALS.find(s => s.act === "ceiling")
  const ag = { id: 1, special: spider.id, x: 23.5, y: 42, dir: 1, state: "walk", anim: 0, timer: 0, turns: 0 }
  w.terrain[33 * S.COLS + 23] = S.DIRT                         // one cell of roof and nothing beyond it
  S.startCeiling(w, ag)
  assert.notEqual(ag.state, "ceil")
})

test("a Jungle vine is a ladder anybody climbs", () => {
  let found = null
  for (let lv = 5; lv <= 200 && !found; lv += 12) {
    const w = S.generate(lv, 0, 99)
    const v = w.ladders.find(l => l.vine)
    if (v) found = { w, v }
  }
  assert.ok(found, "some Jungle level has a vine")
  const { w, v } = found
  assert.equal(w.biome, "Jungle")
  assert.ok(S.ladderAt(w, v.x, v.side, v.bottom), "the climb rule sees it")
})
