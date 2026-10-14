import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import { execSync } from "node:child_process"
import { loadCore } from "../tools/load-core.js"
import { canvas, themeOf } from "../tools/render.js"
import { serve, browser } from "../tools/phone.js"

// Instant replay: Sim notes the level's best moments; the page re-simulates the
// best one from the seed and plays it back before the report card.
const S = loadCore("Sim.js"), D = loadCore("Draw.js"), P = loadCore("Palette.js")

test("moments are noted with their score and the state at the time; bookkeeping only", () => {
  const w = S.generate(1, 0, 2)
  while (!w.done) S.step(w)
  const agi = w.moments.find(m => m.kind === "agi")
  assert.ok(agi && agi.score === 5 && agi.t > 0)
  assert.ok(w.moments.length <= S.MOMENTS_KEEP)
  const plain = S.generate(1, 0, 2); plain.moments = null
  while (!plain.done) S.step(plain)
  assert.deepEqual([plain.saved, plain.lost, plain.ticks], [w.saved, w.lost, w.ticks], "noting moments changes nothing")
})

test("re-simulating from the seed arrives at every replay-worthy moment with the same score", () => {
  let checked = 0
  for (let level = 1; level <= 30; level++) for (const seed of [2, 21, 26]) {
    const w = S.generate(level, 0, seed)
    while (!w.done && w.ticks < 6000) S.step(w)
    for (const m of w.moments.filter(m => m.score >= 3)) {
      const r = S.generate(level, 0, w.colonySeed)
      while (r.ticks < m.t) S.step(r)
      assert.ok(r.moments.some(o => o.t === m.t && o.kind === m.kind && o.saved === m.saved && o.lost === m.lost), `level ${level} seed ${seed} ${m.kind}@${m.t}`)
      checked++
    }
  }
  assert.ok(checked >= 10, `checked ${checked}`)
})

test("the tag: letterbox and INSTANT REPLAY under the sky band, only while replaying", () => {
  const pal = P.build(themeOf("tokyo-night").theme, 1), w = S.generate(1, 0, 2)
  const draw = over => { const img = canvas(400, 248), ys = []; const f = img.ctx.fillRect.bind(img.ctx); img.ctx.fillRect = (x, y, a, b) => { ys.push(y); f(x, y, a, b) }; D.drawActors(img.ctx, { ...w, ...over }, pal, {}); return ys }
  const plain = draw({}), tagged = draw({ replaying: true })
  assert.ok(tagged.length > plain.length)
  for (const ch of "INSTANT REPLAY") assert.ok(D.TRANSITION_GLYPHS[ch])
})

const chromium = (() => { try { execSync("command -v chromium", { stdio: "ignore" }); return true } catch { return false } })()
test("on the page: a level ending with a moment replays it, then the report card; a tap skips; no moment, no replay", { skip: !chromium && "no chromium" }, async () => {
  const server = await serve(), b = await browser(), sleep = ms => new Promise(r => setTimeout(r, ms))
  const ev = async e => (await b.cmd("Runtime.evaluate", { expression: e, returnByValue: true })).result.value
  try {
    await b.cmd("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false })
    const base = `http://127.0.0.1:${server.address().port}/`
    // Level 1, seed 2: the AGI gets home at tick 570 and the level ends at 668.
    await b.cmd("Page.navigate", { url: base + "?level=1&seed=2" }); await sleep(1200)
    await ev(`(() => { const w = AgentWorld(); while (!w.done) step(w) })()`)
    let seen = null
    for (let i = 0; i < 60 && !(seen && seen.t > seen.from); i++) { await sleep(100); seen = await ev(`AgentReplay()`) }
    assert.equal(seen.kind, "agi")
    assert.ok(seen.t > seen.from && seen.t <= seen.to, "playing the window")
    fs.mkdirSync("shots", { recursive: true })
    const shot = await b.cmd("Page.captureScreenshot", { format: "png" }); fs.writeFileSync("shots/replay.png", Buffer.from(shot.data, "base64"))
    const held = await ev(`AgentWorld().doneTicks`)
    await sleep(300)
    if (await ev(`AgentReplay()`)) assert.equal(await ev(`AgentWorld().doneTicks`), held, "the report card waits while it plays")
    const r = await ev(`(() => { const b = document.getElementById("board").getBoundingClientRect(); return [b.left + 40, b.top + 60] })()`)
    await b.cmd("Input.dispatchMouseEvent", { type: "mousePressed", x: r[0], y: r[1], button: "left", clickCount: 1 })
    await b.cmd("Input.dispatchMouseEvent", { type: "mouseReleased", x: r[0], y: r[1], button: "left", clickCount: 1 })
    await sleep(200)
    assert.equal(await ev(`AgentReplay()`), null, "skipped")
    assert.equal(await ev(`document.getElementById("overlay").style.display`), "none", "and not paused")
    const after = await ev(`AgentWorld().doneTicks`)
    await sleep(200)
    assert.ok(await ev(`AgentWorld().doneTicks`) > after, "on to the report card")
    // A level whose moments are all small: straight to the report card.
    await b.cmd("Page.navigate", { url: base + "?level=2&seed=3" }); await sleep(1200)
    await ev(`(() => { const w = AgentWorld(); while (!w.done) step(w); w.moments = [] })()`)
    await sleep(400)
    assert.equal(await ev(`AgentReplay()`), null)
    assert.deepEqual(b.errors, [])
  } finally { await b.close(); server.close() }
})
