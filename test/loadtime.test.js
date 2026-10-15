import test from "node:test"
import assert from "node:assert/strict"
import { parseArgs, pageScripts, scriptCost, summariseRuns, print, NETWORKS } from "../tools/loadtime.js"

// tools/loadtime.js: the parts that turn a trace and a few runs into a report.
test("arguments: production by default, both networks, 4x CPU; unknown networks dropped", () => {
  assert.deepEqual(parseArgs([]), { local: false, dist: false, json: false, runs: 1, cpu: 4, networks: ["fast3g", "fast4g"] })
  const o = parseArgs(["--local", "--dist", "--runs", "3", "--cpu", "6", "--net", "fast4g,dialup", "--json"])
  assert.deepEqual(o, { local: true, dist: true, json: true, runs: 3, cpu: 6, networks: ["fast4g"] })
  assert.equal(NETWORKS.fast3g.latency, 562.5)
})

test("the page's scripts, in order, from index.html", () => {
  assert.deepEqual(pageScripts('<script src="agents/Sim.js?v=1"></script>\n<script src="agents/web.js?v=2"></script>'), ["agents/Sim.js?v=1", "agents/web.js?v=2"])
})

test("trace events become per-file main-thread compile, streamed compile and evaluate", () => {
  const ev = [
    { ph: "M", name: "thread_name", pid: 1, tid: 7, args: { name: "CrRendererMain" } },
    { ph: "X", name: "v8.compile", pid: 1, tid: 7, dur: 4000, args: { data: { url: "https://x/agents/Draw.js?v=1" } } },
    { ph: "X", name: "v8.parseOnBackground", pid: 1, tid: 9, dur: 90000, args: { data: { url: "https://x/agents/Draw.js?v=1" } } },
    { ph: "X", name: "EvaluateScript", pid: 1, tid: 7, dur: 2500, args: { data: { url: "https://x/agents/Draw.js?v=1" } } },
    { ph: "X", name: "RunTask", pid: 1, tid: 7, dur: 99000, args: {} }
  ]
  assert.deepEqual(scriptCost(ev), { "Draw.js": { compile: 4, background: 90, evaluate: 3 } })
})

test("several runs report their medians; the printed report names each heavy script", () => {
  const run = (firstFrame, scripts) => ({ network: "fast3g", firstFrame, fcp: 100, dcl: firstFrame - 20, longTasks: 0, longest: 0, blocked: 0, scripts, errors: [] })
  const s = summariseRuns([run(3000, {}), run(2000, { "Sim.js": { compile: 1, background: 900, evaluate: 2 } }), run(2500, {}), { network: "fast3g", error: "x" }])
  assert.equal(s.firstFrame, 2500)
  assert.equal(s.runs, 3)
  assert.equal(summariseRuns([{ network: "fast3g", error: "no first frame" }]).error, "no first frame")
  const lines = []
  print({ cpu: 4, transfer: [{ file: "agents/Sim.js", raw: 2048, wire: 1024, encoding: "br" }], load: [{ ...run(2000, { "Sim.js": { compile: 1, background: 900, evaluate: 2 } }), runs: 1 }, { network: "fast4g", error: "no first frame" }] }, l => lines.push(l))
  const text = lines.join("\n")
  assert.match(text, /agents\/Sim.js\s+2.0 KB\s+1.0 KB\s+br/)
  assert.match(text, /fast3g \(cpu ×4, 1 run\): first frame 2000 ms/)
  assert.match(text, /Sim.js\s+main-thread compile\s+1 ms\s+evaluate\s+2 ms\s+streamed\s+900 ms/)
  assert.match(text, /fast4g: no first frame/)
})

test("a real local load: the board's first frame arrives and the trace names the core scripts", { timeout: 60000 }, async () => {
  const { run } = await import("../tools/loadtime.js")
  const report = await run({ local: true, dist: false, runs: 1, cpu: 1, networks: ["none"] })
  const l = report.load[0]
  assert.equal(l.error, undefined)
  assert.ok(l.firstFrame > 0 && l.firstFrame < 20000)
  assert.ok(l.scripts["Sim.js"] && l.scripts["Draw.js"], Object.keys(l.scripts).join(","))
  assert.deepEqual(l.errors, [])
  assert.equal(report.transfer, undefined, "no wire sizes for a local copy")
})

test("a load that never draws says so", async () => {
  const { result } = await import("../tools/loadtime.js")
  assert.equal(result("fast3g", null, [], []).error, "no first frame in 30 s")
  const r = result("fast3g", { firstFrame: 900, fcp: 300, dcl: 880, longTasks: [[100, 120], [2000, 300]] }, [], [])
  assert.deepEqual([r.longTasks, r.longest, r.blocked], [1, 120, 70])
})
