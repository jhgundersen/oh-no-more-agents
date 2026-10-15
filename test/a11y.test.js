import test from "node:test"
import assert from "node:assert/strict"
import { execSync } from "node:child_process"
import { serve, browser } from "../tools/phone.js"
import { CONTRAST } from "../tools/contrast.js"

// Accessibility on the page: what a screen reader hears, what a keyboard can
// do, reduced motion reaching the drawing, and text contrast in every theme.
let chromium = true
try { execSync("command -v chromium", { stdio: "ignore" }) } catch { chromium = false }
const sleep = ms => new Promise(r => setTimeout(r, ms))

test("screen reader and keyboard: announced levels and results, named canvas, pressed toggles, Space on a focused button", { skip: !chromium && "no chromium", timeout: 60000 }, async () => {
  const server = await serve(), b = await browser()
  const ev = async e => (await b.cmd("Runtime.evaluate", { expression: e, returnByValue: true })).result.value
  const press = async (key, code, vk, text) => { await b.cmd("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode: vk, text }); await b.cmd("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: vk }) }
  try {
    await b.cmd("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] })
    await b.cmd("Page.navigate", { url: `http://127.0.0.1:${server.address().port}/?level=3&seed=42` })
    for (let i = 0; i < 40 && !(await ev(`!!(window.AgentWorld && AgentWorld())`)); i++) await sleep(100)
    assert.equal(await ev(`document.getElementById("announce").getAttribute("aria-live")`), "polite")
    assert.match(await ev(`document.getElementById("announce").textContent`), /^Level 3, Frost\. \d+ agents\.$/)
    assert.equal(await ev(`document.getElementById("terrain").getAttribute("role")`), "img")
    assert.ok((await ev(`document.getElementById("terrain").getAttribute("aria-label")`)).length > 10)
    assert.equal(await ev(`document.getElementById("actors").getAttribute("aria-hidden")`), "true")
    assert.equal(await ev(`AgentWorld().reducedMotion`), true, "reduced motion reaches the drawing")
    // A toggle says whether it is on.
    await ev(`document.getElementById("who").focus()`)
    await press("Enter", "Enter", 13, "\r")
    for (let i = 0; i < 20 && (await ev(`document.getElementById("who").getAttribute("aria-pressed")`)) !== "true"; i++) await sleep(50)
    assert.equal(await ev(`document.getElementById("who").getAttribute("aria-pressed")`), "true")
    assert.deepEqual(await ev(`[...document.querySelectorAll("#themes button")].filter(b => b.getAttribute("aria-pressed") === "true").length`), 1)
    // Space on a focused button presses it, rather than pausing the game.
    const level = await ev(`AgentWorld().level`)
    await ev(`document.getElementById("c-next").focus()`)
    await press(" ", "Space", 32, " ")
    for (let i = 0; i < 20 && (await ev(`AgentWorld().level`)) === level; i++) await sleep(50)
    assert.equal(await ev(`AgentWorld().level`), level + 1)
    assert.equal(await ev(`document.getElementById("overlay").style.display`), "none", "not paused")
    // The result, once, when the level ends.
    await ev(`(() => { const w = AgentWorld(); while (!w.done) step(w) })()`)
    for (let i = 0; i < 40 && !/report/.test(await ev(`document.getElementById("announce").textContent`)); i++) await sleep(50)
    assert.match(await ev(`document.getElementById("announce").textContent`), /^Level \d+ report: \d+ of \d+ home(, \d+ lost)?\.$/)
    assert.deepEqual(b.errors, [])
  } finally { await b.close(); server.close() }
})

test("page text is at least 4.5:1 against its background in every theme", { skip: !chromium && "no chromium", timeout: 60000 }, async () => {
  const server = await serve(), b = await browser()
  const ev = async e => (await b.cmd("Runtime.evaluate", { expression: e, returnByValue: true })).result.value
  try {
    await b.cmd("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false })
    await b.cmd("Page.navigate", { url: `http://127.0.0.1:${server.address().port}/` })
    for (let i = 0; i < 40 && !(await ev(`document.querySelectorAll("#themes button").length`)); i++) await sleep(100)
    const themes = await ev(`[...document.querySelectorAll("#themes button")].map(b => b.textContent)`)
    assert.ok(themes.length >= 9)
    for (const t of themes) {
      await ev(`[...document.querySelectorAll("#themes button")].find(b => b.textContent === ${JSON.stringify(t)}).click()`)
      await sleep(50)
      const low = (await ev(CONTRAST)).filter(r => r.ratio < 4.5)
      assert.deepEqual(low, [], t)
    }
  } finally { await b.close(); server.close() }
})
