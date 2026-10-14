import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import vm from "node:vm"
import { loadCore } from "../tools/load-core.js"

// share.js: a link carries level + colony seed; anything not exactly right is
// ignored. And the seed really does replay the colony.
const sandbox = { URLSearchParams }
vm.runInNewContext(fs.readFileSync(new URL("../public/agents/share.js", import.meta.url), "utf8"), sandbox)
const { parse, url, MAX_SEED } = sandbox.AgentShare

test("a well-formed link parses", () => {
  assert.deepEqual({ ...parse("?level=7&seed=12345") }, { level: 7, seed: 12345 })
  assert.deepEqual({ ...parse("?seed=0&level=1&full") }, { level: 1, seed: 0 })
  assert.deepEqual({ ...parse(`?level=9999&seed=${MAX_SEED}`) }, { level: 9999, seed: MAX_SEED })
})

test("anything else is ignored", () => {
  for (const q of ["", "?level=7", "?seed=5", "?level=0&seed=5", "?level=-3&seed=5", "?level=07&seed=5",
    "?level=7&seed=05", "?level=10000&seed=5", `?level=7&seed=${MAX_SEED + 1}`, "?level=7&seed=99999999999",
    "?level=7.5&seed=5", "?level=7&seed=5.0", "?level=1e2&seed=5", "?level=0x10&seed=5", "?level= 7&seed=5",
    "?level=7&seed=5abc", "?level=seven&seed=5", "?level=7&seed=", "?level=%37%00&seed=5"])
    assert.equal(parse(q), null, q)
})

test("the link is the page's address with only these two parameters", () => {
  assert.equal(url("https://oh-no-more-agents.com/?full#x", 12, 345), "https://oh-no-more-agents.com/?level=12&seed=345")
  assert.equal(url("https://a.b/", 0, 1), null)
  assert.equal(url("https://a.b/", 1, -1), null)
  assert.equal(url("https://a.b/", 1.5, 1), null)
  assert.equal(url("https://a.b/", 1, MAX_SEED + 1), null)
  const back = parse(url("https://a.b/x", 33, 2024).split("x")[1])
  assert.deepEqual({ ...back }, { level: 33, seed: 2024 }, "round trip")
})

test("the same level and seed play the same run, whatever the page's own randomness", () => {
  const S = loadCore("Sim.js"), random = Math.random
  try {
    for (const level of [3, 12, 27]) {
      const runs = [0.2, 0.7].map(r => {
        let x = r
        Math.random = () => (x = (x * 9301 + 49297) % 233280 / 233280)
        const w = S.generate(level, 0, 777000 + level)
        while (!w.done && w.ticks < 6000) S.step(w)
        return [w.saved, w.lost, w.ticks, w.agents.map(a => a.trait).join()]
      })
      assert.deepEqual(runs[0], runs[1], `level ${level}`)
    }
  } finally { Math.random = random }
})
