import test from "node:test"
import assert from "node:assert/strict"
import { loadCore } from "../tools/load-core.js"

// The safety sign: the page counts levels in a row with nobody lost
// (web.js noteIncidents sets w.incidents), the page's report card says so
// when it is news (Draw.incidentLine), and the panel's card never does.
const S = loadCore("Sim.js"), D = loadCore("Draw.js")
const pal = { decorLit: "#fff", warn: "#f00", umbrellaRim: "#0ff", label: "#ccc", decor: "#999", urgent: "#f00" }

test("the sign is news only from two clean levels, marks a record, and mourns a run of three or more", () => {
  const w = { incidents: { streak: 1, best: 5, broke: 0 } }
  assert.equal(D.incidentLine(w), "")
  w.incidents = { streak: 2, best: 5, broke: 0 }
  assert.equal(D.incidentLine(w), "2 LEVELS WITHOUT AN INCIDENT")
  w.incidents = { streak: 6, best: 6, broke: 0 }
  assert.equal(D.incidentLine(w), "6 LEVELS WITHOUT AN INCIDENT · RECORD")
  w.incidents = { streak: 0, best: 6, broke: 4 }
  assert.equal(D.incidentLine(w), "INCIDENT COUNTER RESET. IT WAS 4.")
  assert.equal(D.incidentLine({}), "")
})

test("it is a page row, in the warning colour when it resets", () => {
  const w = S.generate(3, 0, 5)
  w.incidents = { streak: 0, best: 6, broke: 4 }
  w.res = 1
  assert.ok(!D.reportRows(w, pal).some(r => /INCIDENT/.test(r.text || "")))
  w.res = 2
  const row = D.reportRows(w, pal).find(r => /INCIDENT/.test(r.text || ""))
  assert.equal(row.colour, pal.urgent)
})
