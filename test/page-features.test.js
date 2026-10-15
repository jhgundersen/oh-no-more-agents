import test from "node:test"
import assert from "node:assert/strict"
import { execSync } from "node:child_process"
import { serve, browser } from "../tools/phone.js"

// The page end to end in headless Chromium: a shared link opens that colony,
// copying one shows the toast, and the standup comes round and can be skipped.
const chromium = (() => { try { execSync("command -v chromium", { stdio: "ignore" }); return true } catch { return false } })()
const sleep = ms => new Promise(r => setTimeout(r, ms))

async function page(b, url) {
  await b.cmd("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false })
  await b.cmd("Page.navigate", { url })
  await sleep(1500)
  return async expr => (await b.cmd("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true })).result.value
}

test("a shared link opens that level with that colony, once, and copying makes a toast", { skip: !chromium && "no chromium", timeout: 60000 }, async () => {
  const server = await serve(), b = await browser(), base = `http://127.0.0.1:${server.address().port}/`
  try {
    let ev = await page(b, base + "?level=7&seed=12345")
    assert.deepEqual(await ev(`[AgentWorld().level, AgentWorld().colonySeed, location.search]`), [7, 12345, ""])
    await ev(`document.getElementById("share").click()`)
    await sleep(200)
    assert.match(await ev(`document.getElementById("toast").className + " " + document.getElementById("toast").textContent`), /on (LINK COPIED|COPY FAILED)/)
    ev = await page(b, base + "?level=7&seed=12345x")
    assert.notEqual(await ev(`AgentWorld().colonySeed`), 12345, "a malformed link is ignored")
    assert.deepEqual(b.errors, [])
  } finally { await b.close(); server.close() }
})

test("every fifth level ends in a standup, which a tap skips", { skip: !chromium && "no chromium", timeout: 60000 }, async () => {
  const server = await serve(), b = await browser(), base = `http://127.0.0.1:${server.address().port}/`
  try {
    const ev = await page(b, base + "?level=3&seed=42")
    // Finish five levels by hand, each with someone home to speak.
    for (let i = 0; i < 5; i++) {
      const before = await ev(`AgentWorld().level`)
      // Somebody has to be out of the hatch to come home and speak.
      for (let k = 0; k < 40 && !(await ev(`AgentWorld().agents.length`)); k++) await sleep(100)
      await ev(`(() => { const w = AgentWorld(); w.agents.forEach(a => { a.state = "saved"; a.gone = false }); w.saved = w.agents.length; w.released = w.toRelease; w.done = true; w.doneTicks = 9999 })()`)
      // Polled, not slept: under the full parallel run the page can take a while.
      if (i < 4) {
        for (let k = 0; k < 100 && (await ev(`AgentWorld().level`)) === before; k++) await sleep(100)
        assert.equal(await ev(`AgentWorld().level`), before + 1, `level ${i} moved on`)
      } else await sleep(250)
    }
    const during = await ev(`AgentWorld().level`)
    await sleep(500)
    assert.equal(await ev(`AgentWorld().level`), during, "held for the standup")
    const r = await ev(`(() => { const b = document.getElementById("board").getBoundingClientRect(); return [b.left + 50, b.top + 50] })()`)
    await b.cmd("Input.dispatchMouseEvent", { type: "mousePressed", x: r[0], y: r[1], button: "left", clickCount: 1 })
    await b.cmd("Input.dispatchMouseEvent", { type: "mouseReleased", x: r[0], y: r[1], button: "left", clickCount: 1 })
    for (let k = 0; k < 40 && (await ev(`AgentWorld().level`)) === during; k++) await sleep(100)
    assert.equal(await ev(`AgentWorld().level`), during + 1, "skipped to the next level")
    assert.equal(await ev(`document.getElementById("overlay").style.display`), "none", "and not paused")
    assert.deepEqual(b.errors, [])
  } finally { await b.close(); server.close() }
})
