import test from "node:test"
import assert from "node:assert/strict"
import { loadCore } from "../tools/load-core.js"
import { colonySeed } from "../tools/simcheck.js"

// Employee of the Level: Sim tallies each agent's working ticks (bookkeeping
// only), and the page's report names whoever put in the most.
const S = loadCore("Sim.js"), D = loadCore("Draw.js")

function played(level, salt) {
  const w = S.generate(level, 0, colonySeed(level, 0, salt))
  while (!w.done && w.ticks < 6000) S.step(w)
  return w
}

test("the tally is bookkeeping: a level plays out the same with or without reading it", () => {
  const a = played(58, 1), b = played(58, 1)
  assert.deepEqual([a.saved, a.lost, a.ticks], [b.saved, b.lost, b.ticks])
  assert.ok(a.agents.some(ag => ag.workTicks > 0), "somebody worked")
})

test("the page names the hardest worker, with a citation for its main job, and a level of meetings has none", () => {
  const w = played(58, 1)
  w.res = 2
  const line = D.employeeLine(w)
  assert.match(line, /^EMPLOYEE OF THE LEVEL: (AGENT \d{3}|[A-Z ]+)\. [A-Z ,]+( \(POSTHUMOUS\))?\.$/)
  const best = D.employeeOfLevel(w)
  assert.ok(w.agents.every(ag => (ag.workTicks || 0) <= best.workTicks))
  for (const ag of w.agents) ag.workTicks = 0
  assert.equal(D.employeeLine(w), "", "nobody lifted a finger")
})

test("a fight's MVP takes the row; the panel's small card never gets one", () => {
  const w = played(58, 1), pal = { decorLit: "#fff", warn: "#f00", umbrellaRim: "#0ff", label: "#ccc", decor: "#999", urgent: "#f00" }
  w.res = 1
  assert.ok(!D.reportRows(w, pal).some(r => /EMPLOYEE/.test(r.text || "")))
  w.res = 2
  assert.ok(D.reportRows(w, pal).some(r => /EMPLOYEE/.test(r.text || "")))
})

test("floating counts for a quarter: an umbrella is not a shift", () => {
  const ag = { state: "fall", floater: true }
  for (let i = 0; i < 8; i++) S.tallyWork(ag)
  assert.equal(ag.workTicks, 2)
  ag.state = "build"; S.tallyWork(ag)
  assert.deepEqual(ag.work, { float: 2, build: 1 })
})
