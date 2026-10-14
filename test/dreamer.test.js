import test from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { loadCore } from "../tools/load-core.js"
import { canvas, themeOf } from "../tools/render.js"

// The dreamer: once a level it lands, walks toward an exit that is not there,
// and turns back when the door comes apart. See dreamSteer in Sim.js.
const S = loadCore("Sim.js"), D = loadCore("Draw.js"), P = loadCore("Palette.js"), O = loadCore("Outcome.js")

// Play a level to the end, watching every mirage the tick it appears.
function play(level, seed, each = () => {}) {
  const w = S.generate(level, 0, seed), born = []
  for (let t = 0; t < 6000 && !w.done; t++) {
    const before = w.mirages.length
    S.step(w)
    for (const m of w.mirages.slice(before)) { born.push(m); each(w, m) }
  }
  return { w, born }
}

test("a dreamer only ever imagines an exit down a clear, flat, safe stretch of its own floor", () => {
  let seen = 0
  for (let level = 1; level <= 24; level++) play(level, level * 1009 + 7, (w, m) => {
    seen++
    const ag = S.agentById(w, m.by)
    assert.equal(ag.trait, "dreamer")
    assert.equal(ag.dir, m.dir, "faces the door it saw")
    assert.ok(S.eventSafeX(w, m.x), "never on the real exit or the hatch")
    for (let x = Math.floor(ag.x) + m.dir; x !== m.x + m.dir; x += m.dir) {
      assert.ok(!S.solid(w, x, m.y) && !S.solid(w, x, m.y - 1), "headroom all the way")
      assert.ok(S.solid(w, x, m.y + 1), "ground all the way")
      assert.equal(S.hazardZoneAt(w, x, m.y, true), null, "nothing lethal on the way")
      assert.ok(!S.pitAt(w, x), "no pit on the way")
    }
  })
  assert.ok(seen >= 5, `mirages are met often enough to notice (${seen})`)
})

test("one mirage per dreamer; arrival turns it back and the door comes apart", () => {
  let reached = 0
  for (let level = 1; level <= 24; level++) {
    const { w, born } = play(level, level * 1009 + 7)
    const by = born.map(m => m.by)
    assert.equal(new Set(by).size, by.length, "one per agent per level")
    assert.equal(w.hallucinations, born.length)
    assert.equal(w.mirages.length, 0, "nothing left standing at the end")
    for (const m of born) {
      assert.ok(m.popped >= m.born)
      assert.ok(m.popped - m.born <= S.MIRAGE_LIFE + 1, "never outlives its patience")
      if (m.reached) reached++
    }
  }
  assert.ok(reached >= 3, `dreamers usually get there (${reached})`)
})

test("arriving at the mirage reverses the dreamer; turning away early simply lets it go", () => {
  const w = S.generate(1, 0, 5)
  const ag = S.spawn(w)
  Object.assign(ag, { x: 20.5, y: 10, state: "walk", dir: 1 })
  w.agents = [ag]
  w.mirages = [{ x: 20, y: 10, dir: 1, by: ag.id, born: w.ticks, popped: -1, reached: false }]
  S.stepMirages(w)
  assert.equal(ag.dir, -1)
  assert.equal(w.mirages[0].reached, true)
  assert.equal(w.mirages[0].popped, w.ticks)
  assert.match(w.feed.at(-1).text, /HALLUCINATION DETECTED/)

  ag.dir = 1
  w.mirages = [{ x: 60, y: 10, dir: -1, by: ag.id, born: w.ticks, popped: -1, reached: false }]
  S.stepMirages(w)
  assert.equal(w.mirages[0].reached, false)
  assert.equal(w.mirages[0].popped, w.ticks, "faced away: gone")
  assert.equal(ag.dir, 1, "and nobody was turned")
  w.ticks += S.MIRAGE_FADE + 1
  S.stepMirages(w)
  assert.equal(w.mirages.length, 0)
})

test("non-dreamers, heroes and agents in the air never see one", () => {
  const w = S.generate(3, 0, 11)
  for (const over of [{ trait: "steady" }, { trait: "dreamer", special: "hero" },
    { trait: "dreamer", state: "fall" }, { trait: "dreamer", dreamt: true }]) {
    const ag = Object.assign(S.spawn(w), { x: 30, y: w.corridors[0].floorY - 1, state: "walk" }, over)
    w.dreamRng = () => 0
    S.dreamSteer(w, ag)
  }
  assert.equal(w.mirages.length, 0)
})

test("the mirage draws read-only and deterministic, swims, fades out, and leaves the panel on whole pixels", () => {
  const pal = P.build(themeOf("tokyo-night").theme, 1)
  const w = S.generate(1, 0, 99)
  const m = { x: 30, y: w.corridors[0].floorY - 1, dir: 1, by: 0, born: 0, popped: -1, reached: false }
  const draw = (ticks, res = 1) => {
    const img = canvas(400 * res, 248 * res), calls = []
    img.ctx.setTransform(res, 0, 0, res, 0, 0)
    const fill = img.ctx.fillRect.bind(img.ctx)
    img.ctx.fillRect = (...a) => { calls.push(a); fill(...a) }
    const world = { ...w, ticks, res }, before = JSON.stringify(m)
    D.drawMirage(img.ctx, world, pal, m)
    assert.equal(JSON.stringify(m), before)
    return { hash: createHash("sha256").update(img.buf).digest("hex"), calls }
  }
  assert.equal(draw(40).hash, draw(40).hash)
  assert.notEqual(draw(40).hash, draw(43).hash, "heat haze moves")
  for (const c of draw(40).calls) assert.ok(c.every(Number.isInteger), "whole art pixels")
  assert.ok(draw(40).calls.length > 0)
  m.popped = 50
  assert.ok(draw(60).calls.length > 0, "still coming apart")
  assert.equal(draw(50 + 24).calls.length, 0, "gone once the fade is over")
})

test("the end-of-level line can mention the hallucination only when one happened", () => {
  const base = { saved: 5, toRelease: 10, nuking: false, lastUsed: {}, hazardKills: 0, bombsUsed: 0, rescues: 0,
    pits: [], lost: 0, enemyRoster: [], eventMechs: {}, carrierHome: false }
  const lines = new Set(O.EVENT_LINES.mirage)
  const random = Math.random
  try {
    let hit = 0
    for (let i = 0; i < 400; i++) {
      // First draw picks the fact pool, second picks the line.
      let n = 0
      Math.random = () => (n++ % 2 === 0 ? 0 : (i % 100) / 100)
      assert.ok(!lines.has(O.outcomeLine({ ...base, hallucinations: 0 })))
      n = 0
      if (lines.has(O.outcomeLine({ ...base, hallucinations: 1 }))) hit++
    }
    assert.ok(hit > 0)
  } finally { Math.random = random }
})

test("the dreamer says so: EXIT! when it sees the mirage, OH. when it gets there", () => {
  const w = { ...S.generate(1, 0, 3), ticks: 100 }
  assert.equal(D.quipFor(w, { dreamtAt: 95 }).text, "EXIT!")
  assert.equal(D.quipFor(w, { dreamtAt: 60, wokeAt: 98 }).text, "OH.", "the newest wins")
  assert.equal(D.quipFor(w, { wokeAt: 100 - D.QUIP_TICKS }), null, "and it fades")
  for (const ch of "EXIT!OH.") assert.ok(D.TRANSITION_GLYPHS[ch], ch)
})
