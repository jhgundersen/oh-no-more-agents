import test from "node:test"
import assert from "node:assert/strict"
import { execSync } from "node:child_process"
import { serve, browser } from "../tools/phone.js"

// Navigating during an intermission (review 2026-10-15, finding 1): a standup
// or replay left running drew over the new colony, and the standup's own
// finish then advanced again, so Next during a standup skipped a level.
let chromium = true
try { execSync("command -v chromium", { stdio: "ignore" }) } catch { chromium = false }
const sleep = ms => new Promise(r => setTimeout(r, ms))

async function open(b, url) {
  const ev = async e => (await b.cmd("Runtime.evaluate", { expression: e, returnByValue: true })).result.value
  await b.cmd("Page.navigate", { url })
  for (let i = 0; i < 40 && !(await ev(`!!(window.AgentWorld && AgentWorld())`)); i++) await sleep(100)
  return ev
}
const key = (b, k, code, vk) => b.cmd("Input.dispatchKeyEvent", { type: "keyDown", key: k, code, windowsVirtualKeyCode: vk })
  .then(() => b.cmd("Input.dispatchKeyEvent", { type: "keyUp", key: k, code, windowsVirtualKeyCode: vk }))

// Five levels finished by hand: the fifth transition holds a standup.
async function toStandup(ev) {
  for (let i = 0; i < 5; i++) {
    // Reach two real releases in bounded simulation time, not seconds of
    // wall-clock waiting per level; navigation still uses the actual host.
    await ev(`(() => { const w = AgentWorld(); for (let k = 0; k < 400 && w.agents.length < 2 && !w.done; k++) step(w); if (w.agents.length < 2) throw Error("navigation fixture could not release two agents") })()`)
    const before = await ev(`AgentWorld().level`)
    await ev(`(() => { const w = AgentWorld(); w.agents.forEach(a => { a.state = "saved"; a.gone = false }); w.saved = w.agents.length; w.released = w.toRelease; w.done = true; w.doneTicks = 9999 })()`)
    if (i < 4) for (let k = 0; k < 40 && (await ev(`AgentWorld().level`)) === before; k++) await sleep(100)
  }
  await sleep(400)
  return ev(`AgentWorld().level`)
}

test("Next during a standup plays the next level, once; the daily during a standup stays the daily", { skip: !chromium && "no chromium", timeout: 90000 }, async () => {
  const server = await serve(), b = await browser()
  try {
    const base = `http://127.0.0.1:${server.address().port}/`
    let ev = await open(b, base + "?level=3&seed=42")
    const during = await toStandup(ev)
    await key(b, "n", "KeyN", 78)
    await sleep(500)
    assert.equal(await ev(`AgentWorld().level`), during + 1, "one level on")
    assert.ok((await ev(`AgentWorld().ticks`)) > 0, "and it is being played, not drawn over")
    const r = await ev(`(() => { const b = document.getElementById("board").getBoundingClientRect(); return [b.left + 30, b.top + 30] })()`)
    await b.cmd("Input.dispatchMouseEvent", { type: "mousePressed", x: r[0], y: r[1], button: "left", clickCount: 1 })
    await b.cmd("Input.dispatchMouseEvent", { type: "mouseReleased", x: r[0], y: r[1], button: "left", clickCount: 1 })
    await sleep(300)
    assert.equal(await ev(`AgentWorld().level`), during + 1, "no old standup left to advance it again")

    ev = await open(b, base + "?level=3&seed=42")
    await toStandup(ev)
    await ev(`document.getElementById("daily").click()`)
    await sleep(800)
    assert.equal(await ev(`AgentWorld().daily`), await ev(`AgentShare.today()`), "the daily survives the meeting it interrupted")
    assert.deepEqual(b.errors, [])
  } finally { await b.close(); server.close() }
})

test("Next during an instant replay ends the replay and moves on one level", { skip: !chromium && "no chromium", timeout: 60000 }, async () => {
  const server = await serve(), b = await browser()
  try {
    const ev = await open(b, `http://127.0.0.1:${server.address().port}/?level=1&seed=2`)
    await ev(`(() => { const w = AgentWorld(); while (!w.done) step(w) })()`)
    let rp = null
    for (let i = 0; i < 60 && !rp; i++) { await sleep(100); rp = await ev(`AgentReplay()`) }
    assert.ok(rp, "a replay is running")
    await key(b, "n", "KeyN", 78)
    await sleep(300)
    assert.equal(await ev(`AgentReplay()`), null)
    assert.equal(await ev(`AgentWorld().level`), 2)
    assert.ok((await ev(`AgentWorld().ticks`)) > 0)
  } finally { await b.close(); server.close() }
})
