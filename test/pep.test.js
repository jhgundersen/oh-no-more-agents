import test from "node:test"
import assert from "node:assert/strict"
import { execSync } from "node:child_process"
import { loadCore } from "../tools/load-core.js"
import { serve, browser } from "../tools/phone.js"

// Pep talks: a watcher taps an agent; it hears how right it is, glows, and gets
// a small, rate-limited nudge. Nothing happens unless somebody taps.
const S = loadCore("Sim.js"), D = loadCore("Draw.js")

function scene() {
  const w = S.generate(1, 0, 3)
  const ag = Object.assign(S.spawn(w), { x: 40.5, y: w.corridors[0].floorY - 1, dir: 1, state: "walk", idle: 0 })
  w.agents = [ag]; w.ticks = 500
  return { w, ag }
}

test("a walker making progress gets a short, faster walk", () => {
  const { w, ag } = scene(), before = S.walkStep(ag, w)
  assert.equal(S.pepTalk(w, ag), true)
  assert.equal(ag.dir, 1)
  assert.ok(S.walkStep(ag, w) > before)
  w.ticks += S.PEP_BOOST
  assert.equal(S.walkStep(ag, w), before, "and only for a moment")
})

test("a stuck walker tries the other way", () => {
  const { w, ag } = scene()
  ag.idle = S.PEP_STUCK + 1; ag.turns = 2
  S.pepTalk(w, ag)
  assert.equal(ag.dir, -1); assert.equal(ag.turns, 0)
  assert.equal(ag.idle, S.PEP_STUCK + 1, "the stall rules still see how long it has been stuck")
})

test("rate-limited per agent and across the board; never for the gone, the saved, or a finished level", () => {
  const { w, ag } = scene()
  const other = Object.assign(S.spawn(w), { x: 50.5, y: ag.y, dir: 1, state: "walk" }); w.agents.push(other)
  assert.equal(S.pepTalk(w, ag), true)
  assert.equal(S.pepTalk(w, other), false, "board-wide gap")
  w.ticks += S.PEP_GAP
  assert.equal(S.pepTalk(w, other), true)
  w.ticks += S.PEP_GAP
  assert.equal(S.pepTalk(w, ag), false, "per-agent cooldown")
  w.ticks = ag.pepReadyAt
  assert.equal(S.pepTalk(w, ag), true)
  for (const over of [{ gone: true }, { state: "saved" }]) assert.equal(S.pepTalk({ ...w, ticks: 1e6 }, { ...ag, ...over, pepReadyAt: 0 }), false)
  assert.equal(S.pepTalk({ ...w, ticks: 1e6, done: true }, { ...ag, pepReadyAt: 0 }), false)
  assert.equal(S.pepTalk(w, null), false)
})

test("the bubble rotates through the lines, every one fits the font, and it glows", () => {
  const { w, ag } = scene(), seen = new Set()
  for (let i = 0; i < S.PEP_LINES; i++) {
    w.ticks += S.PEP_COOL
    S.pepTalk(w, ag)
    const q = D.quipFor(w, ag)
    seen.add(q.text)
    for (const ch of q.text) assert.ok(D.TRANSITION_GLYPHS[ch], `glyph ${ch}`)
    assert.ok(q.text.length <= 24)
  }
  assert.equal(seen.size, S.PEP_LINES)
  assert.ok(seen.has("YOU'RE ABSOLUTELY RIGHT!"))
  assert.equal(D.PEP_TEXT.length, S.PEP_LINES)
})

test("nobody tapping: a played level is the same level", () => {
  const a = S.generate(7, 0, 77), b = S.generate(7, 0, 77)
  while (!a.done) S.step(a)
  while (!b.done) S.step(b)
  assert.equal(a.saved, b.saved); assert.equal(a.ticks, b.ticks)
  assert.equal(a.peps, undefined)
})

const chromium = (() => { try { execSync("command -v chromium", { stdio: "ignore" }); return true } catch { return false } })()
test("on the page, with touch: a tap on an agent is a pep talk, a tap on empty board pauses", { skip: !chromium && "no chromium" }, async () => {
  const server = await serve(), b = await browser(), sleep = ms => new Promise(r => setTimeout(r, ms))
  try {
    await b.cmd("Emulation.setDeviceMetricsOverride", { width: 844, height: 390, deviceScaleFactor: 2, mobile: true })
    await b.cmd("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 })
    await b.cmd("Page.navigate", { url: `http://127.0.0.1:${server.address().port}/` })
    await sleep(1500)
    let where = null
    for (let i = 0; i < 40 && !where; i++, await sleep(250)) where = (await b.cmd("Runtime.evaluate", { returnByValue: true, expression: `(() => {
      const w = window.AgentWorld && AgentWorld(), ag = w && w.agents.find(a => !a.gone && a.state === "walk" && a.y > 4)
      if (!ag) return null
      const r = document.getElementById("board").getBoundingClientRect()
      const s = r.width / (w.k.COLS * w.k.CELL)
      return { id: ag.id, x: r.left + ag.x * w.k.CELL * s, y: r.top + ((ag.y + 1) * w.k.CELL - 7) * s, sky: { x: r.left + 4, y: r.top + 4 } }
    })()` })).result.value
    assert.ok(where, "an agent to tap")
    const tap = async (x, y) => {
      await b.cmd("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] })
      await b.cmd("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
      await sleep(150)
    }
    // The agent keeps walking between reading where it is and the tap
    // landing, and under a loaded test run that can be a body-width: retry with
    // a fresh position, a few times.
    for (let i = 0; i < 6; i++) {
      await tap(where.x, where.y)
      if ((await b.cmd("Runtime.evaluate", { returnByValue: true, expression: `AgentWorld().peps || 0` })).result.value) break
      await sleep(400)
      where = { ...where, ...(await b.cmd("Runtime.evaluate", { returnByValue: true, expression: `(() => {
        const w = AgentWorld(), ag = w.agents.find(a => a.id === ${where.id}) || w.agents.find(a => !a.gone && a.state === "walk")
        const r = document.getElementById("board").getBoundingClientRect(), s = r.width / (w.k.COLS * w.k.CELL)
        return { x: r.left + ag.x * w.k.CELL * s, y: r.top + ((ag.y + 1) * w.k.CELL - 7) * s }
      })()` })).result.value }
    }
    const after = (await b.cmd("Runtime.evaluate", { returnByValue: true, expression: `(() => { const w = AgentWorld(); return { peps: w.peps || 0, overlay: document.getElementById("overlay").style.display } })()` })).result.value
    assert.equal(after.peps, 1, "pep talk given")
    assert.equal(after.overlay, "none", "and the game kept running")
    await tap(where.sky.x, where.sky.y)
    const paused = (await b.cmd("Runtime.evaluate", { returnByValue: true, expression: `document.getElementById("overlay").style.display` })).result.value
    assert.notEqual(paused, "none", "a tap on empty board still pauses")
    assert.deepEqual(b.errors, [])
  } finally { await b.close(); server.close() }
})
