import test from "node:test"
import assert from "node:assert/strict"
import { execSync } from "node:child_process"
import { serve, browser } from "../tools/phone.js"

// The biome tour: twenty thumbnails, the current one marked, a jump that goes
// forward to that biome and counts as nothing cleared; a row of its own that
// scrolls on a phone without scrolling the page.
let chromium = true
try { execSync("command -v chromium", { stdio: "ignore" }) } catch { chromium = false }
const sleep = ms => new Promise(r => setTimeout(r, ms))

test("the tour jumps forward to the biome, marks it, clears nothing, and scrolls in its own row on a phone", { skip: !chromium && "no chromium", timeout: 60000 }, async () => {
  const server = await serve(), b = await browser()
  const ev = async e => (await b.cmd("Runtime.evaluate", { expression: e, returnByValue: true })).result.value
  try {
    await b.cmd("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
    await b.cmd("Page.navigate", { url: `http://127.0.0.1:${server.address().port}/?level=3&seed=42` })
    for (let i = 0; i < 40 && !(await ev(`document.querySelectorAll("#tour .tour-stop").length`)); i++) await sleep(100)
    assert.equal(await ev(`document.querySelectorAll("#tour .tour-stop").length`), await ev(`BIOMES.length`))
    assert.equal(await ev(`[...document.querySelectorAll("#tour .tour-stop")].findIndex(b => b.getAttribute("aria-current") === "true")`), 2)
    assert.equal(await ev(`AgentTour.level(3, 0, 20)`), 21, "forward to the next Cavern, not back to level 1")
    assert.equal(await ev(`AgentTour.level(20, 19, 20)`), 40)
    await ev(`document.querySelector("#tour .tour-stop[aria-label='Go to The Cloud']").click()`)
    for (let i = 0; i < 20 && (await ev(`AgentWorld().level`)) === 3; i++) await sleep(50)
    assert.equal(await ev(`AgentWorld().biome`), "The Cloud")
    assert.equal(await ev(`AgentWorld().level`), 20)
    assert.equal(await ev(`document.getElementById("lifetime").textContent`), "0 home, 0 levels", "a jump clears nothing")
    assert.equal(await ev(`document.documentElement.scrollWidth <= innerWidth`), true, "no page scroll")
    assert.equal(await ev(`document.getElementById("tour").scrollWidth > document.getElementById("tour").clientWidth`), true, "the row scrolls")
    assert.ok(await ev(`[...document.querySelectorAll("#tour canvas")].every(c => c.getContext("2d").getImageData(23, 0, 1, 1).data[3] > 0)`), "every thumbnail painted")
    assert.deepEqual(b.errors, [])
  } finally { await b.close(); server.close() }
})
