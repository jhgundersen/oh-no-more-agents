import test from "node:test"
import assert from "node:assert/strict"
import { parseArgs, judge } from "../tools/soak.js"

// tools/soak.js: the judging of a long watch's samples.
const flat = (n, over = {}) => Array.from({ length: n }, (_, i) => ({ t: i * 30, heapMB: 6, nodes: 520, listeners: 70, canvases: 22, storage: 400, audio: 3, frameMs: 16.7, ...(typeof over === "function" ? over(i) : over) }))

test("arguments: twenty minutes at 30 s by default", () => {
  assert.deepEqual(parseArgs([]), { minutes: 20, every: 30, json: false })
  assert.deepEqual(parseArgs(["--minutes", "5", "--every", "10", "--json"]), { minutes: 5, every: 10, json: true })
})

test("a flat curve passes; a climb at start-up that levels off passes", () => {
  assert.deepEqual(judge(flat(30), []), [])
  assert.deepEqual(judge(flat(30, i => ({ heapMB: i < 6 ? 3 + i : 9 })), []), [])
})

test("growth that keeps going fails, each measure on its own", () => {
  assert.match(judge(flat(30, i => ({ heapMB: 4 + i * 0.5 })), []).join(), /heapMB keeps growing/)
  assert.match(judge(flat(30, i => ({ nodes: 500 + i * 40 })), []).join(), /nodes keeps growing/)
  assert.match(judge(flat(30, i => ({ listeners: 60 + i * 5 })), []).join(), /listeners keeps growing/)
  assert.match(judge(flat(30, i => ({ canvases: 22 + Math.floor(i / 5) })), []).join(), /canvases keeps growing/)
  assert.match(judge(flat(30, i => ({ storage: 400 + i * 4000 })), []).join(), /storage keeps growing/)
  assert.match(judge(flat(30, i => ({ frameMs: 16.7 + i * 1.5 })), []).join(), /frame time creeps/)
  assert.match(judge(flat(30, { audio: 500 }), []).join(), /audio nodes pile up/)
  assert.match(judge(flat(3), ["boom"]).join(), /page error: boom/)
})

import { execSync } from "node:child_process"
import { soak, verdict, line } from "../tools/soak.js"
let chromium = true
try { execSync("command -v chromium", { stdio: "ignore" }) } catch { chromium = false }

test("a short real soak samples the page and says how it went", { skip: !chromium && "no chromium", timeout: 60000 }, async () => {
  const logged = []
  const r = await soak({ minutes: 0.1, every: 3, log: l => logged.push(l) })
  assert.ok(r.samples.length >= 1)
  const s = r.samples[0]
  for (const k of ["heapMB", "nodes", "listeners", "canvases", "storage", "audio", "frameMs", "level"]) assert.equal(typeof s[k], "number", k)
  assert.ok(s.canvases > 0 && s.level >= 1)
  assert.deepEqual(r.errors, [])
  assert.match(logged[0], /^soak +3 s  level \d+  heap /)
  assert.match(verdict(r, 0.1), /^soak passed: \d+ samples over 0.1 min, levels \d+-\d+$/)
  assert.match(verdict({ problems: ["x"], samples: [] }, 1), /^soak FAILED:\n  x$/)
  assert.match(line({ t: 30, level: 2, heapMB: 3, nodes: 1, listeners: 1, canvases: 1, storage: 1, audio: 0, made: 0, frameMs: 16.7, frameP95: 17 }), /frame 16.7\/17 ms$/)
})
