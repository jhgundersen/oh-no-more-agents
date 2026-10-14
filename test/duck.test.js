import test from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { loadCore } from "../tools/load-core.js"
import { canvas, themeOf } from "../tools/render.js"

// Rubber duck debugging: a duck may drop in front of the first agent to get
// stuck; the agent explains the problem to it and walks out of its loop.
const S = loadCore("Sim.js"), D = loadCore("Draw.js"), P = loadCore("Palette.js"), O = loadCore("Outcome.js")

function box() {
  const w = S.generate(1, 0, 3), k = w.k
  w.terrain.fill(k.EMPTY)
  for (let x = 0; x < k.COLS; x++) w.terrain[30 * k.COLS + x] = k.DIRT
  w.pits = []; w.hazards = []; w.enemies = []; w.lifts = []
  w.exit = { x: 90, y: 25, w: 6, h: 5 }
  return w
}
const stuck = (w, x = 40) => Object.assign(S.spawn(w), { x, y: 29, dir: 1, state: "walk", idle: S.RUBBER_IDLE })

test("the first stuck agent may get a duck just ahead of it — once a level, on the coin", () => {
  const w = box(), ag = stuck(w); w.agents = [ag]
  w.duckRng = () => 0
  S.stepDuck(w)
  assert.ok(w.duck)
  assert.equal(w.duck.y, 29)
  assert.ok((w.duck.x - Math.floor(ag.x)) * ag.dir >= 2, "ahead of it")
  assert.match(w.feed.at(-1).text, /RUBBER DUCK/)
  const no = box(); no.agents = [stuck(no)]; no.duckRng = () => 0.99
  S.stepDuck(no)
  assert.equal(no.duck, null); assert.equal(no.duckDone, true, "and that was its chance")
  const calm = box(); calm.agents = [Object.assign(stuck(calm), { idle: 10 })]; calm.duckRng = () => 0
  S.stepDuck(calm)
  assert.equal(calm.duck, null, "nobody stuck, no duck")
})

test("never on a pit, in a hazard, or in mid-air; behind it if there is no room ahead", () => {
  const w = box(), ag = stuck(w)
  for (let x = 42; x <= 46; x++) w.terrain[30 * w.k.COLS + x] = w.k.EMPTY   // nothing to stand on ahead
  const x = S.duckSpot(w, ag)
  assert.ok(x < 40, `behind it (${x})`)
  for (let x2 = 30; x2 <= 50; x2++) w.terrain[30 * w.k.COLS + x2] = w.k.EMPTY
  assert.equal(S.duckSpot(w, ag), -1)
})

test("walking into it: explain, then the loop is wiped and it gets the rescue; nothing holds it for good", () => {
  const w = box(), ag = stuck(w); w.agents = [ag]
  w.duck = { x: 42, y: 29, at: w.ticks, takenBy: -1, takenAt: -1 }
  ag.x = 42.4; ag.passes = { a: 9 }; ag.turns = 3
  S.stepDuck(w)
  assert.equal(w.duck.takenBy, ag.id)
  assert.equal(ag.explainFor, S.RUBBER_TALK)
  assert.equal(w.ducked, 1)
  const x = ag.x
  for (let t = 0; t < S.RUBBER_TALK - 1; t++) { w.ticks++; S.agentActs(w, ag) }
  assert.equal(ag.x, x, "stands still while explaining")
  w.ticks++; S.agentActs(w, ag)
  assert.equal(ag.explainFor, 0)
  assert.equal(ag.idle, 0); assert.deepEqual(ag.passes, {}); assert.equal(ag.turns, 0)
  assert.equal(w.duck, null)
  assert.match(w.feed.at(-1).text, /EXPLAINED IT TO THE DUCK/)
})

test("a fall or a lost floor ends the explanation; an untaken duck goes away", () => {
  const w = box(), ag = Object.assign(stuck(w), { explainFor: 20, state: "fall" })
  assert.equal(S.explaining(w, ag), false); assert.equal(ag.explainFor, 0)
  w.duck = { x: 70, y: 29, at: 0, takenBy: -1, takenAt: -1 }
  w.ticks = S.RUBBER_LIFE + 1
  S.stepDuck(w)
  assert.equal(w.duck, null)
})

test("played levels: ducks turn up, get used, and nothing hangs", () => {
  let used = 0
  for (let level = 1; level <= 20; level++) {
    const w = S.generate(level, 0, level * 271)
    w.duckRng = () => 0
    while (!w.done && w.ticks < 6000) S.step(w)
    assert.ok(w.done, `level ${level} hung`)
    assert.ok(w.agents.every(a => !(a.explainFor > 0) || a.gone || a.state === "saved"))
    used += w.ducked
  }
  assert.ok(used >= 3, `ducks get used (${used})`)
})

test("drawn: a duck drops in and sits on the floor; in hand while explaining; quips; read-only", () => {
  const pal = P.build(themeOf("tokyo-night").theme, 1), w = box()
  const d = { x: 42, y: 29, at: 100, takenBy: -1, takenAt: -1 }
  const frame = ticks => {
    const img = canvas(400, 248), calls = []
    const fill = img.ctx.fillRect.bind(img.ctx)
    img.ctx.fillRect = (...a) => { calls.push(a); fill(...a) }
    const before = JSON.stringify(d)
    D.drawColonyAsides(img.ctx, { ...w, ticks, duck: d, mirages: [] }, pal)
    assert.equal(JSON.stringify(d), before)
    for (const c of calls) assert.ok(c.every(Number.isInteger))
    return { calls, hash: createHash("sha256").update(img.buf).digest("hex") }
  }
  assert.notEqual(frame(101).hash, frame(115).hash, "falls in")
  assert.ok(Math.max(...frame(140).calls.map(c => c[1] + c[3])) <= 30 * 4, "sits on the floor")
  d.takenBy = 3
  assert.equal(frame(140).calls.length, 0, "taken: not on the floor any more")
  const ag = { id: 3, x: 42.5, y: 29, dir: 1, state: "walk", anim: 4, trait: "steady", explainFor: 20, duckAt: 100, still: 0, waitFor: 0 }
  const img = canvas(400, 248), cols = []
  const fill = img.ctx.fillRect.bind(img.ctx)
  img.ctx.fillRect = (...a) => { cols.push(img.ctx.fillStyle); fill(...a) }
  D.drawAgent(img.ctx, { ...w, ticks: 110 }, pal, ag, {})
  assert.ok(cols.includes(D.DUCK_YELLOW), "duck in hand")
  assert.equal(D.quipFor({ ...w, ticks: 105 }, ag).text, "SO BASICALLY")
  assert.equal(D.quipFor({ ...w, ticks: 131 }, ag).text, "OH!")
})

test("report card, outcome and commit line know about the duck", () => {
  const base = { saved: 5, toRelease: 10, nuking: false, lastUsed: {}, hazardKills: 0, bombsUsed: 0, rescues: 0,
    pits: [], lost: 0, enemyRoster: [], eventMechs: {}, carrierHome: false }
  const lines = new Set(O.EVENT_LINES.duck), random = Math.random
  try {
    let hit = 0
    for (let i = 0; i < 100; i++) {
      let n = 0
      Math.random = () => (n++ % 2 === 0 ? 0 : i / 100)
      assert.ok(!lines.has(O.outcomeLine({ ...base, ducked: 0 }))); n = 0
      if (lines.has(O.outcomeLine({ ...base, ducked: 1 }))) hit++
    }
    assert.ok(hit > 0)
  } finally { Math.random = random }
  assert.match(D.commitLine({ ...box(), saved: 9, toRelease: 10, lost: 1, ducked: 1, hallucinations: 0, hazardKills: 0, brollyLandings: 0, eventLog: [] }), /RUBBER-DUCKED/)
})
