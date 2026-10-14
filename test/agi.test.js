import test from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { loadCore } from "../tools/load-core.js"
import { canvas, themeOf } from "../tools/render.js"

// The golden AGI agent: about one colony in eight, an ordinary agent in gold,
// a report-card line and a ticker line either way. See crownAgi in Sim.js.
const S = loadCore("Sim.js"), D = loadCore("Draw.js"), P = loadCore("Palette.js"), O = loadCore("Outcome.js")

function play(level, seed, limit = 6000) {
  const w = S.generate(level, 0, seed)
  while (!w.done && w.ticks < limit) S.step(w)
  return w
}

test("about one colony in eight has one, and never more than one", () => {
  let with_ = 0, runs = 0
  for (let seed = 1; seed <= 400; seed++) {
    const w = S.generate(1 + seed % 19, 0, seed * 7919)
    while (w.released < w.toRelease) S.step(w)
    const golden = w.agents.filter(a => a.agi)
    assert.ok(golden.length <= 1)
    if (golden.length) { with_++; assert.equal(golden[0].id, w.agiId); assert.ok(!golden[0].special) }
    runs++
  }
  const share = with_ / runs
  assert.ok(share > 0.07 && share < 0.19, `share ${share}`)
})

test("deciding it moves nothing else: the colony's traits and the level are the same either way", () => {
  for (const seed of [11, 12, 13]) {
    const a = S.generate(4, 0, seed), b = S.generate(4, 0, seed)
    b.agiRng = () => 0                         // force an AGI into b
    for (let t = 0; t < 400; t++) { S.step(a); S.step(b) }
    assert.deepEqual(a.agents.map(x => x.trait), b.agents.map(x => x.trait))
    assert.equal(b.agents.filter(x => x.agi).length, 1)
  }
})

test("played to the end, the AGI is either home or lost, exactly once, with its own ticker line", () => {
  let home = 0, lost = 0
  for (let level = 1; level <= 24; level++) {
    const w = S.generate(level, 0, level * 104729)
    w.agiRng = () => 0                         // always one, at the first release
    while (!w.done && w.ticks < 6000) S.step(w)
    assert.ok(w.done, `level ${level} hung`)
    assert.ok(w.agiHome !== w.agiLost, `level ${level}: home or lost, not both, not neither`)
    const notes = w.feed.map(f => f.text)
    if (w.agiHome) { home++; assert.ok(notes.some(t => /AGI ACHIEVED/.test(t))) }
    if (w.agiLost) { lost++; assert.ok(notes.some(t => /AGI LOST/.test(t))) }
    assert.ok(w.saved + w.lost <= w.released)
  }
  assert.ok(home > 0, "it gets home sometimes")
})

test("a hero never wears the gold: the next one through the hatch does", () => {
  const w = S.generate(2, 0, 21)               // a level with a hero
  assert.ok(w.special)
  w.agiAt = w.specialAt
  while (w.released < w.toRelease) S.step(w)
  const golden = w.agents.filter(a => a.agi)
  assert.equal(golden.length, 1)
  assert.ok(!golden[0].special)
})

test("Reload brings the gold back with the agent", () => {
  const w = S.generate(1, 0, 3)
  const dead = Object.assign(S.spawn(w), { agi: true, gone: true }), back = S.spawn(w)
  w.agiId = dead.id; w.agiLost = true
  S.restoreAgi(w, dead, back)
  assert.equal(back.agi, true); assert.equal(w.agiId, back.id); assert.equal(w.agiLost, false)
  assert.match(w.feed.at(-1).text, /RESTORED/)
  const plain = S.spawn(w)
  S.restoreAgi(w, { agi: false }, plain)
  assert.equal(plain.agi, undefined)
})

test("drawn in gold with a sparkle at both resolutions; ordinary agents unchanged; read-only", () => {
  const pal = P.build(themeOf("tokyo-night").theme, 1), w = S.generate(1, 0, 99)
  const pixels = (ag, res, ticks) => {
    const img = canvas(48 * res, 40 * res, "#1a1b26")
    img.ctx.setTransform(res, 0, 0, res, 0, 0)
    const before = JSON.stringify(ag)
    D.drawAgent(img.ctx, { ...w, res, ticks }, pal, ag, {})
    assert.equal(JSON.stringify(ag), before)
    return createHash("sha256").update(img.buf).digest("hex")
  }
  const base = { id: 3, trait: "steady", x: 5, y: 7, state: "walk", anim: 4, dir: 1, still: 0, waitFor: 0 }
  for (const res of [1, 2]) {
    assert.notEqual(pixels({ ...base, agi: true }, res, 10), pixels(base, res, 10), "gold")
    const frames = new Set([0, 3, 9, 17, 25, 30].map(t => pixels({ ...base, agi: true }, res, t)))
    assert.ok(frames.size > 1, "the sparkle twinkles")
    assert.equal(pixels(base, res, 3), pixels(base, res, 30), "nobody else twinkles")
  }
})

test("the report card gets a gold bonus line or an obituary, and the plate grows to fit", () => {
  const pal = P.build(themeOf("tokyo-night").theme, 1), w = S.generate(1, 0, 3)
  const rows = over => D.reportRows({ ...w, ...over }, pal)
  assert.ok(!rows({}).some(r => /AGI/.test(r.text || "")))
  const home = rows({ agiHome: true }).find(r => /AGI ACHIEVED/.test(r.text || ""))
  assert.equal(home.colour, D.AGI_GOLD)
  assert.match(home.text, /\+1 BONUS/)
  const lost = rows({ agiLost: true }).find(r => /AGI LOST/.test(r.text || ""))
  assert.equal(lost.colour, pal.urgent)
  for (const ch of "AGI ACHIEVED. IT WENT HOME.  +1 BONUS") assert.ok(D.TRANSITION_GLYPHS[ch], `glyph ${ch}`)
  const draw = over => {
    const img = canvas(400, 248), world = { ...w, done: true, doneTicks: 20, saved: 5, toRelease: 10, ...over }
    D.drawLevelResults(img.ctx, world, pal)
    return createHash("sha256").update(img.buf).digest("hex")
  }
  assert.notEqual(draw({ agiHome: true }), draw({}))
})

test("outcome lines for the AGI only when there was one, and only the right kind", () => {
  const base = { saved: 5, toRelease: 10, nuking: false, lastUsed: {}, hazardKills: 0, bombsUsed: 0, rescues: 0,
    pits: [], lost: 0, enemyRoster: [], eventMechs: {}, carrierHome: false }
  const home = new Set(O.EVENT_LINES.agiHome), lost = new Set(O.EVENT_LINES.agiLost)
  const random = Math.random
  try {
    let hits = 0
    for (let i = 0; i < 100; i++) {
      let n = 0
      Math.random = () => (n++ % 2 === 0 ? 0 : i / 100)
      const plain = O.outcomeLine(base); n = 0
      assert.ok(!home.has(plain) && !lost.has(plain))
      const won = O.outcomeLine({ ...base, agiHome: true }); n = 0
      assert.ok(!lost.has(won))
      if (home.has(won)) hits++
      assert.ok(!home.has(O.outcomeLine({ ...base, agiLost: true })))
    }
    assert.ok(hits > 0)
  } finally { Math.random = random }
})
