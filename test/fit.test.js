import test from "node:test"
import assert from "node:assert/strict"
import { execSync } from "node:child_process"
import { loadSim } from "../tools/simcheck.js"
import { serve, browser } from "../tools/phone.js"

// ?fit: a level generated as wide as a strip of a monitor (a 2560x720 XENEON
// EDGE), drawn at the scale that fills its height, with nothing but the board.

test("setBoardCols widens the board and its clock, and clamps", () => {
  const S = loadSim()
  try {
    const narrow = S.generate(5, 0, 11)
    assert.equal(S.setBoardCols(244), 244)
    const wide = S.generate(5, 0, 11)
    assert.equal(wide.k.COLS, 244)
    assert.equal(wide.terrain.length, 244 * S.ROWS)
    assert.equal(wide.timeLimit, Math.round(narrow.timeLimit * 2.44))
    assert.equal(S.setBoardCols(40), 100, "never narrower than the normal board")
    assert.equal(S.setBoardCols(9999), S.MAX_COLS)
    assert.equal(S.setBoardCols(NaN), 100)
  } finally { S.setBoardCols(100) }
})

let chromium = true
try { execSync("command -v chromium", { stdio: "ignore" }) } catch { chromium = false }
const sleep = ms => new Promise(r => setTimeout(r, ms))

test("?fit fills a 32:9 strip with a wider level and hides the page around it", { skip: !chromium && "no chromium", timeout: 60000 }, async () => {
  const server = await serve(), b = await browser()
  const ev = async e => (await b.cmd("Runtime.evaluate", { expression: e, returnByValue: true })).result.value
  const ready = async () => { for (let i = 0; i < 40 && !(await ev(`!!(window.AgentWorld && AgentWorld())`)); i++) await sleep(100) }
  const shape = `(() => { const r = document.getElementById("board").getBoundingClientRect()
    return { cols: AgentWorld().k.COLS, w: r.width, h: r.height, tick: AgentWorld().ticks,
      hud: getComputedStyle(document.querySelector(".hud")).display, controls: getComputedStyle(document.querySelector(".controls")).display } })()`
  try {
    await b.cmd("Emulation.setDeviceMetricsOverride", { width: 2048, height: 520, deviceScaleFactor: 1.25, mobile: false })
    await b.cmd("Page.navigate", { url: `http://127.0.0.1:${server.address().port}/?full&fit` })
    await ready(); await sleep(300)
    let s = await ev(shape)
    assert.equal(s.cols, Math.floor(2048 / (520 / 248 * 4)))
    assert.ok(Math.abs(s.h - 520) < 1, "fills the height: " + s.h)
    assert.ok(s.w <= 2048 && s.w > 2048 - 10, "and the width to within a column: " + s.w)
    assert.equal(s.hud, "none"); assert.equal(s.controls, "none")
    assert.equal(await ev(`location.search`), "?full&fit")

    // A new shape gets a level at the new width.
    await b.cmd("Emulation.setDeviceMetricsOverride", { width: 1600, height: 520, deviceScaleFactor: 1.25, mobile: false })
    for (let i = 0; i < 30 && (await ev(`AgentWorld().k.COLS`)) === s.cols; i++) await sleep(100)
    s = await ev(shape)
    assert.equal(s.cols, Math.floor(1600 / (520 / 248 * 4)))
    assert.ok(s.w <= 1600 && Math.abs(s.h - 520) < 1)
    assert.deepEqual(b.errors, [])
  } finally { await b.close(); server.close() }
})
