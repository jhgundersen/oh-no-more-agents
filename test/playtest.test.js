import test from "node:test"
import assert from "node:assert/strict"
import { loadSim } from "../tools/simcheck.js"
import { playtestRun, summarise, problems } from "../tools/playtest.js"

// tools/playtest.js: one level, two colonies, end to end — and the report's
// judgement on rows built by hand.
const S = loadSim()

test("a run reports what happened and is repeatable", () => {
  const a = playtestRun(S, 3, 1), b = playtestRun(S, 3, 1)
  assert.deepEqual(a, b)
  assert.equal(a.level, 3); assert.equal(a.hung, false)
  assert.ok(a.saved + a.lost <= a.total)
  for (const k of ["nuked", "stalled", "stranded", "condemned", "dreams", "limited", "agi", "longestQueue"]) assert.ok(k in a, k)
})

test("rows summarise per level and problems come worst first", () => {
  const rows = summarise([playtestRun(S, 1, 1), playtestRun(S, 1, 2)])
  assert.equal(rows.length, 1); assert.equal(rows[0].runs, 2)
  const found = problems([
    { level: 4, runs: 2, home: 50, hung: 0, nuked: 1, stalled: 0, nobody: 0, stranded: 0, condemned: 0, queuedAtEnd: 0 },
    { level: 5, runs: 2, home: 90, hung: 1, nuked: 0, stalled: 0, nobody: 0, stranded: 0, condemned: 0, queuedAtEnd: 0 }
  ])
  assert.match(found[0].text, /level 5: 1 run\(s\) hung/)
  assert.ok(found.some(p => /level 4: ran out the clock/.test(p.text)))
  assert.ok(found.some(p => /level 4: 50% home/.test(p.text)))
})

test("arguments: ranges, lists, seeds and json", async () => {
  const { parseArgs, parseLevels } = await import("../tools/playtest.js")
  assert.deepEqual(parseLevels("1-3,7"), [1, 2, 3, 7])
  assert.deepEqual(parseLevels(), Array.from({ length: 20 }, (_, i) => i + 1))
  assert.deepEqual(parseArgs(["--seeds", "3", "4-5", "--json"]), { levels: [4, 5], seeds: 3, json: true })
  assert.deepEqual(parseArgs([]).seeds, 6)
})

test("worker threads run every pair, and the report prints and judges", async () => {
  const { runAll, report } = await import("../tools/playtest.js")
  const runs = await runAll([1, 2], 2, 2)
  assert.equal(runs.length, 4)
  const lines = []
  assert.equal(report(runs, { json: false }, l => lines.push(l), 0.5), true)
  assert.match(lines[0], /^level biome/)
  assert.ok(lines.some(l => /4 runs, \d+% home, 0\.5 s/.test(l)))
  const json = []
  report(runs, { json: true }, l => json.push(l), 0)
  assert.equal(JSON.parse(json[0]).runs.length, 4)
  assert.equal(report([{ ...runs[0], hung: true }], { json: false }, () => {}, 0), false, "a hang fails the command")
})
