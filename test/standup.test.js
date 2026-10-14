import test from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { loadCore } from "../tools/load-core.js"
import { canvas, themeOf } from "../tools/render.js"

// The daily standup: lines from what happened, and the meeting drawn.
const S = loadCore("Sim.js"), D = loadCore("Draw.js"), P = loadCore("Palette.js"), O = loadCore("Outcome.js")

test("facts come from the finished world, and the recap adds them up", () => {
  const w = S.generate(4, 0, 9)
  Object.assign(w, { saved: 9, lost: 2, pits: [{}], hazardKills: 1, hallucinations: 2, rateLimited: 5, ducked: 1,
    agiHome: true, brollyLandings: 3, lastUsed: { blocker: 1 }, eventLog: ["x"] })
  const f = O.standupFacts(w)
  assert.equal(f.pitDeaths, 1); assert.equal(f.hallucinations, 2); assert.equal(f.blocker, 1); assert.equal(f.builder, 0)
  const r = O.standupRecap([f, f])
  assert.equal(r.levels, 2); assert.equal(r.rateLimited, 10); assert.equal(r.agiHome, 2)
})

test("the most specific things are said first, every speaker has a line, and nothing is random", () => {
  const lines = O.standupLines({ pitDeaths: 1, hallucinations: 1, agiLost: 1 }, 5)
  assert.equal(lines.length, 5)
  assert.match(lines[0][0], /LOST THE AGI/)
  assert.match(lines[1][0], /WALKED TO AN EXIT/)
  assert.match(lines[2][0], /FELL IN A PIT/)
  assert.deepEqual(lines[2], ["YESTERDAY: FELL IN A PIT.", "TODAY: NOT THAT.", "BLOCKERS: GRAVITY."])
  assert.deepEqual(O.standupLines({}, 2), O.standupLines({}, 2))
  assert.equal(O.standupLines({}, 7).length, 7, "filler goes round")
})

test("every line fits a bubble and every character has a glyph", () => {
  const all = { agiHome: 1, agiLost: 1, hallucinations: 1, ducked: 1, rateLimited: 1, pitDeaths: 1, hazardKills: 99, blocker: 1, brolly: 99, builder: 1, events: 1 }
  for (const speaker of O.standupLines(all, 16)) for (const line of speaker) {
    assert.ok(line.length <= 32, line)
    for (const ch of line) assert.ok(D.TRANSITION_GLYPHS[ch], `glyph ${JSON.stringify(ch)} in ${line}`)
  }
})

test("the meeting: everyone drawn, the speaker's bubble in turn, read-only and deterministic", () => {
  const w = S.generate(6, 0, 3), pal = P.build(themeOf("tokyo-night").theme, 6)
  const speakers = ["steady", "dreamer", "brave"].map((trait, i) => ({ id: i + 1, trait, agi: i === 1, lines: O.standupLines({}, 3)[i] }))
  const frame = (t, res = 2) => {
    const img = canvas(400 * res, 248 * res), inks = []
    const fill = img.ctx.fillRect.bind(img.ctx)
    img.ctx.fillRect = (...a) => { inks.push(img.ctx.fillStyle); fill(...a) }
    const world = { ...w, res }, before = JSON.stringify({ speakers })
    D.drawStandup(img.ctx, world, pal, { t, speakers })
    assert.equal(JSON.stringify({ speakers }), before)
    return { inks, hash: createHash("sha256").update(img.buf).digest("hex") }
  }
  assert.equal(frame(30).hash, frame(30).hash)
  const intro = frame(1), first = frame(D.STANDUP_INTRO + 1), second = frame(D.STANDUP_INTRO + D.STANDUP_TURN + 1)
  assert.ok(!intro.inks.includes("#f4f4ec"), "nobody talks during the intro")
  assert.ok(first.inks.includes("#f4f4ec"), "a bubble")
  assert.notEqual(first.hash, second.hash, "the turn passes")
  assert.ok(first.inks.includes(D.AGI_GOLD), "the gold one is there too")
  frame(40, 1)
  assert.equal(D.standupLength(3), D.STANDUP_INTRO + 3 * D.STANDUP_TURN)
  assert.ok(D.standupLength(5) * 30 <= 6000, "five speakers fit in six seconds at 30ms a tick")
})
