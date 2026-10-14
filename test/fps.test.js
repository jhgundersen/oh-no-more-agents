import test from "node:test"
import assert from "node:assert/strict"
import { execSync } from "node:child_process"
import { parseArgs, summarise, measure } from "../tools/fps.js"
import { serve, browser } from "../tools/phone.js"

// tools/fps.js: the numbers, the arguments, and one short real measurement.
test("frame intervals become fps, the stutter, the worst frame and the long-task share", () => {
  const gaps = [...Array(95).fill(1000 / 60), ...Array(5).fill(50)]
  assert.deepEqual(summarise(gaps, 500, 10), { frames: 100, fps: 60, p5: 20, worstMs: 50, busy: 5 })
  assert.deepEqual(summarise([], 0, 1), { frames: 0, fps: 0, p5: 0, worstMs: 0, busy: 0 })
})

test("arguments: levels, seconds, speed, json; the busy levels by default", () => {
  assert.deepEqual(parseArgs(["8", "9", "--seconds", "3", "--speed", "2", "--json"]), { levels: [8, 9], seconds: 3, speed: 2, json: true })
  assert.deepEqual(parseArgs([]).levels, [8, 9, 10, 12, 18])
  assert.deepEqual(parseArgs(["--seconds", "4"]).levels, [8, 9, 10, 12, 18], "a flag's value is not a level")
})

const chromium = (() => { try { execSync("command -v chromium", { stdio: "ignore" }); return true } catch { return false } })()
test("one second of level 3 in Chromium", { skip: !chromium && "no chromium" }, async () => {
  const server = await serve(), b = await browser()
  try {
    const r = await measure(b, `http://127.0.0.1:${server.address().port}/`, 3, 1, 0)
    assert.equal(r.level, 3)
    assert.ok(r.frames > 20 && r.fps > 0)
    assert.ok(r.cpu >= 0)
  } finally { await b.close(); server.close() }
})
