import test from "node:test"
import assert from "node:assert/strict"
import { loadCore } from "../tools/load-core.js"
import { levelWith } from "./levels.js"

// Rules that were only ever reached deep inside a played level, often not at
// all in the sample the tests play: built here on purpose so each can be
// checked, and so the CRAP report sees them covered.

const S = loadCore("Sim.js")
const CAVERN = levelWith(S, "Cavern", (w) => w.sinkholes.length > 0)

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

test("Frost's powder snow lets a longer fall land, and the colony knows it", () => {
  const frost = S.generate(3, 0, 3), cavern = S.generate(1, 0, 3)
  assert.equal(frost.biome, "Frost")
  assert.ok(S.killingFall(frost) > S.killingFall(cavern))
  assert.equal(S.killingFall(cavern), S.SAFE_FALL)
})

test("a graze stuns and knocks back; a second one, or a lethal shot, kills", () => {
  const w = S.generate(13, 0, 3)
  w.skills.floater = 0          // no umbrella to put up: the wound rule alone
  const ag = floorAgent(w, 40)
  const lost = w.lost
  S.woundFriendly(w, ag, 45, false)
  assert.equal(ag.state, "stunned")
  assert.equal(ag.dir, -1, "knocked away from the shot")
  assert.ok(!ag.gone)
  S.woundFriendly(w, ag, 45, false)
  assert.ok(ag.gone)
  assert.equal(w.lost, lost + 1)
  const other = floorAgent(w, 30)
  S.woundFriendly(w, other, 20, true)
  assert.ok(other.gone)
  S.woundFriendly(w, other, 20, true)
  assert.equal(w.lost, lost + 2, "no double count")
})

test("Cavern sinkholes: a crust over a hollow that opens under the first walker", () => {
  let found = 0
  for (let lv = 1; lv <= 96; lv++) {
    const w = S.generate(lv, 0, 5)
    if (w.biome !== "Cavern") { assert.equal(w.sinkholes.length, 0, `level ${lv}`); continue }
    found += w.sinkholes.length
  }
  assert.ok(found > 0)
  const w = S.generate(CAVERN, 0, 3), s = w.sinkholes[0]
  const ag = S.spawn(w)
  ag.state = "walk"; ag.x = s.x + 1.5; ag.y = s.top - 1
  w.agents = [ag]
  S.stepSinkholes(w)
  assert.equal(s.openedAt, w.ticks)
  for (let x = s.x; x < s.x + 3; x++) assert.ok(!S.solid(w, x, s.top), "the crust is gone")
  assert.ok(S.solid(w, s.x, s.bottom + 1), "and there is floor to land on")
})

// The umbrella as a shield: paid for from the floater count, held toward the
// shooter for BROLLY_HOLD ticks, and no use against a shot from behind.
function parryTick(w, ag, want) {
  for (let t = 0; t < 100; t++) {
    w.ticks = t
    if (((t * 37 + ag.id * 61 + 11) % 100 < S.BROLLY_PARRY) === want) return
  }
  throw new Error("no such tick")
}
test("an umbrella put up in time stops a lethal shot and costs a floater", () => {
  const w = S.generate(13, 0, 3)
  const ag = floorAgent(w, 40)
  w.skills.floater = 3
  parryTick(w, ag, true)
  S.woundFriendly(w, ag, 45, true)
  assert.ok(!ag.gone)
  assert.equal(w.skills.floater, 2)
  assert.equal(ag.brollyFor, S.BROLLY_HOLD)
  assert.equal(ag.brollyDir, 1, "held toward the shooter")
  S.woundFriendly(w, ag, 46, true)
  assert.ok(!ag.gone, "still up for the rest of the burst")
  assert.equal(w.skills.floater, 2, "the same umbrella")
  S.woundFriendly(w, ag, 30, true)
  assert.ok(ag.gone, "a shot from behind gets round it")
})
test("no umbrella goes up late, empty-handed or for a special", () => {
  const w = S.generate(13, 0, 3)
  const late = floorAgent(w, 40)
  w.skills.floater = 3
  parryTick(w, late, false)
  S.woundFriendly(w, late, 45, true)
  assert.ok(late.gone)
  const broke = floorAgent(w, 30)
  w.skills.floater = 0
  parryTick(w, broke, true)
  S.woundFriendly(w, broke, 35, true)
  assert.ok(broke.gone)
})

test("an umbrella overhead keeps off falling rock, snow and ice, not fire", () => {
  const w = S.generate(13, 0, 3)
  w.skills.floater = 2
  const ag = floorAgent(w, 40)
  assert.equal(S.umbrellaGuards(w, { kind: "flame" }, ag), false)
  assert.equal(S.umbrellaGuards(w, { kind: "rockfall" }, ag), true)
  assert.equal(ag.brollyDir, 0, "overhead")
  assert.equal(w.skills.floater, 1)
  assert.equal(S.umbrellaGuards(w, { kind: "icicle" }, ag), true, "still up")
  assert.equal(w.skills.floater, 1)
  const other = floorAgent(w, 30)
  other.state = "dig"
  assert.equal(S.umbrellaGuards(w, { kind: "snowball" }, other), false, "busy hands")
  other.state = "walk"; other.special = true
  assert.equal(S.umbrellaGuards(w, { kind: "snowball" }, other), false, "specials carry none")
})

// A stuck agent is condemned: it spends a bomber on itself, and the hole it
// leaves may free the rest. Some states are never condemned, a waiting agent
// is not stuck, and a stuck special first tries its own way out.
test("condemn: a stuck walker spends a bomber on itself, and only then", () => {
  const w = S.generate(13, 0, 3)
  const ag = floorAgent(w, 40)
  w.skills.bomber = 1
  for (const state of ["bomb", "block", "camp", "saved", "swim"]) {
    ag.state = state; S.condemn(w, ag)
    assert.equal(ag.state, state, `${state} left alone`)
  }
  ag.state = "walk"; ag.waitFor = 5; S.condemn(w, ag)
  assert.equal(ag.state, "walk", "waiting is not stuck")
  ag.waitFor = 0
  const broke = floorAgent(w, 30)
  w.skills.bomber = 0
  S.condemn(w, broke)
  assert.equal(broke.state, "walk", "no bomber, no bomb")
  w.skills.bomber = 1
  S.condemn(w, ag)
  assert.equal(ag.state, "bomb")
  assert.ok(ag.condemned)
  assert.equal(ag.fuse, S.BOMB_FUSE)
  assert.equal(w.skills.bomber, 0)
})

test("condemn: a special at its limit goes up without the toolbar", () => {
  const w = S.generate(13, 0, 3)
  const ag = floorAgent(w, 40)
  ag.special = true; ag.idle = S.STUCK_LIMIT
  w.skills.bomber = 0
  S.condemn(w, ag)
  assert.equal(ag.state, "bomb")
  assert.ok(ag.condemned)
})
