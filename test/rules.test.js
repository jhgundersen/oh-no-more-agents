import test from "node:test"
import assert from "node:assert/strict"
import { loadCore } from "../tools/load-core.js"

// Rules that were only ever reached deep inside a played level, often not at
// all in the sample the tests play: built here on purpose so each can be
// checked, and so the CRAP report sees them covered.

const S = loadCore("Sim.js")

function floorAgent(w, x) {
  const ag = S.spawn(w)
  const c = w.corridors[1]
  ag.x = x; ag.y = c.floorY - 1; ag.dir = 1; ag.state = "walk"
  w.agents.push(ag)
  return ag
}

test("a threat ahead: a hazard on its floor within reach, or the red team a little further", () => {
  const w = S.generate(13, 0, 3)
  w.hazards = []; w.enemies = []
  const ag = floorAgent(w, 30)
  assert.equal(S.threatAhead(w, ag, 14), false)
  w.hazards.push({ kind: "gun", zx0: 40, zx1: 41, zy0: ag.y - 2, zy1: ag.y })
  assert.equal(S.threatAhead(w, ag, 14), true, "hazard 10 ahead")
  ag.dir = -1
  assert.equal(S.threatAhead(w, ag, 14), false, "behind it")
  w.hazards[0].wrecked = true; ag.dir = 1
  assert.equal(S.threatAhead(w, ag, 14), false, "wrecked")
  w.enemies.push({ x: 50, y: ag.y, gone: false })
  assert.equal(S.threatAhead(w, ag, 14), true, "red team 20 ahead counts")
  w.enemies[0].y -= 20
  assert.equal(S.threatAhead(w, ag, 14), false, "another floor")
})

test("a web escape finds open floor above and heads for it", () => {
  const w = S.generate(13, 0, 3)
  const ag = floorAgent(w, w.corridors[1].startX + w.corridors[1].dir * 4)
  ag.special = "chainthought"
  const found = S.startWebEscape(w, ag)
  if (found) {
    assert.equal(ag.state, "webup")
    assert.ok(ag.specialY < ag.y)
    assert.ok(!S.solid(w, Math.floor(ag.specialX), ag.specialY))
  }
  // Sealed in: nothing above but rock.
  for (let y = 0; y < ag.y; y++) for (let x = 0; x < S.COLS; x++) w.terrain[y * S.COLS + x] = S.ROCK
  ag.state = "walk"
  assert.equal(S.startWebEscape(w, ag), false)
})

test("a falling hostile lands on floor, and one that falls off the world is gone", () => {
  const w = S.generate(13, 0, 3)
  const c = w.corridors[1]
  const en = { kind: "gun", x: c.startX + 0.5, y: c.floorY - 4, state: "fall", fall: 0, gone: false }
  w.enemies = [en]
  for (let t = 0; t < 40 && en.state === "fall"; t++) S.stepEnemyFall(w, en)
  assert.equal(en.state, "walk")
  assert.equal(en.y, c.floorY - 1)
  const lost = { kind: "sniper", x: 5, y: S.ROWS - 0.2, state: "fall", fall: 0, gone: false }
  const killed = w.enemiesKilled
  S.stepEnemyFall(w, lost)
  assert.ok(lost.gone)
  assert.equal(w.enemiesKilled, killed + 1)
})

test("a camped sniper takes aim at a target in range, and falls if its floor goes", () => {
  const w = S.generate(13, 0, 3)
  const c = w.corridors[1]
  const sn = { kind: "sniper", x: c.startX + 0.5, y: c.floorY - 1, dir: 1, state: "camp", timer: 9, gone: false }
  w.enemies = [sn]; w.agents = []
  S.stepSniperCamp(w, sn)
  assert.equal(sn.state, "camp", "nobody to shoot")
  w.terrain[(sn.y + 1) * S.COLS + Math.floor(sn.x)] = S.EMPTY
  S.stepSniperCamp(w, sn)
  assert.equal(sn.state, "fall")
})

test("every special tries its own way out of a stuck spot without throwing", () => {
  for (const spec of S.SPECIALS) for (const level of [13, 19, 21]) {
    const w = S.generate(level, 0, 3)
    for (let t = 0; t < 150; t++) S.step(w)
    const ag = floorAgent(w, w.corridors[1].startX + w.corridors[1].dir * 6)
    ag.special = spec.id; ag.cool = 0; ag.idle = 1000
    S.specialEscape(w, ag)
    // Again from the same spot: the floor's dig is used up, so it tunnels,
    // and then neither is left.
    ag.state = "walk"; S.specialEscape(w, ag)
    ag.state = "walk"; S.specialEscape(w, ag)
    assert.equal(typeof ag.state, "string", spec.id)
  }
})
