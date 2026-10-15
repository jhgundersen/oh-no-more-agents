import test from "node:test"
import assert from "node:assert/strict"
import { execSync } from "node:child_process"
import { serve, browser } from "../tools/phone.js"

// ?full with a shared or daily link (review 2026-10-15, finding 3): the
// shared-link boot cleaned the address before ?full was read.
let chromium = true
try { execSync("command -v chromium", { stdio: "ignore" }) } catch { chromium = false }
const sleep = ms => new Promise(r => setTimeout(r, ms))

test("a shared or daily link keeps ?full / ?fullscreen, and ?full=0 stays off", { skip: !chromium && "no chromium", timeout: 60000 }, async () => {
  const server = await serve(), b = await browser()
  const ev = async e => (await b.cmd("Runtime.evaluate", { expression: e, returnByValue: true })).result.value
  try {
    const base = `http://127.0.0.1:${server.address().port}/`
    for (const [q, full, level] of [
      ["?level=3&seed=42&full=1", true, 3], ["?daily=2026-10-15&full=1", true, null], ["?level=3&seed=42&fullscreen", true, 3],
      ["?level=3&seed=42&full=0", false, 3], ["?full", true, null]
    ]) {
      await b.cmd("Page.navigate", { url: base + q })
      for (let i = 0; i < 40 && !(await ev(`!!(window.AgentWorld && AgentWorld())`)); i++) await sleep(100)
      await sleep(200)
      assert.equal(await ev(`document.getElementById("stage").classList.contains("faux")`), full, q)
      if (level) assert.equal(await ev(`AgentWorld().level`), level, q)
      if (q.includes("daily")) assert.equal(await ev(`AgentWorld().daily`), "2026-10-15", q)
      if (full && q !== "?full") assert.equal(await ev(`location.search`), "?full", "the cleaned address keeps ?full")
    }
    assert.deepEqual(b.errors, [])
  } finally { await b.close(); server.close() }
})
