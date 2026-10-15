import test from "node:test"
import assert from "node:assert/strict"
import { execSync } from "node:child_process"
import { serve, browser } from "../tools/phone.js"

// ?full in a screen too short for the stack: the board's top must be on
// screen and everything else reachable by scrolling the stage. Plain
// centring once put the top 17 px of the board above an 844x390 screen,
// where no scroll could reach. A notch reported by the browser pads the stage.
let chromium = true
try { execSync("command -v chromium", { stdio: "ignore" }) } catch { chromium = false }
const sleep = ms => new Promise(r => setTimeout(r, ms))

const MEASURE = `(() => {
  const s = document.getElementById("stage"), r = q => document.querySelector(q).getBoundingClientRect()
  return { faux: s.classList.contains("faux"), boardTop: r("#board").top, boardLeft: r("#board").left,
    scrolls: s.scrollHeight - s.clientHeight, padLeft: parseFloat(getComputedStyle(s).paddingLeft) }
})()`

test("?full on a short screen keeps the board's top on screen, and a notch pads the stage", { skip: !chromium && "no chromium", timeout: 90000 }, async () => {
  const server = await serve(), b = await browser()
  const ev = async e => (await b.cmd("Runtime.evaluate", { expression: e, returnByValue: true })).result.value
  const open = async () => {
    await b.cmd("Page.navigate", { url: `http://127.0.0.1:${server.address().port}/?level=3&seed=7&full=1` })
    for (let i = 0; i < 60 && !(await ev(`!!(window.AgentWorld && AgentWorld())`)); i++) await sleep(100)
    await sleep(300)
    return ev(MEASURE)
  }
  try {
    for (const [w, h, touch] of [[844, 390, false], [844, 390, true], [932, 430, true]]) {
      await b.cmd("Emulation.setTouchEmulationEnabled", { enabled: touch, maxTouchPoints: touch ? 5 : 1 })
      await b.cmd("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: touch })
      const m = await open()
      assert.ok(m.faux, `${w}x${h}`)
      assert.ok(m.boardTop >= 0, `${w}x${h} ${touch ? "touch" : "mouse"}: board top ${m.boardTop}`)
    }
    const notch = await b.cmd("Emulation.setSafeAreaInsetsOverride", { insets: { left: 59, right: 59, bottom: 21 } }).then(() => true, () => false)
    if (notch) {
      const m = await open()
      assert.equal(m.padLeft, 59, "the notch side is padded")
      assert.ok(m.boardLeft >= 59 && m.boardTop >= 0, JSON.stringify(m))
    }
    assert.deepEqual(b.errors, [])
  } finally { await b.close(); server.close() }
})
