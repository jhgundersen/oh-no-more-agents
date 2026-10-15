import test from "node:test"
import assert from "node:assert/strict"
import { execSync } from "node:child_process"
import { loadCore } from "../tools/load-core.js"
import { canvas, themeOf } from "../tools/render.js"
import { serve, browser } from "../tools/phone.js"

// Sightings: the rare things a watcher has seen, kept in their own browser.
const S = loadCore("Sim.js"), D = loadCore("Draw.js"), P = loadCore("Palette.js"), O = loadCore("Outcome.js")

test("a finished level reports what it showed", () => {
  const w = S.generate(4, 0, 1)
  assert.deepEqual(O.sightingsIn(w), [])
  Object.assign(w, { agiId: 3, hallucinations: 1, rateLimited: 5, duckAppeared: true, conflicts: 1, outage: { at: 10, len: 120 }, ticks: 20, milestone: { n: 1 } })
  assert.deepEqual(O.sightingsIn(w), ["agi", "dreamer", "queue", "duck", "conflict", "outage", "milestone"])
  assert.ok(!O.sightingsIn({ ...w, ticks: 5 }).includes("outage"), "an outage not reached yet was not seen")
  assert.deepEqual(D.SIGHTINGS.map(s => s.id), ["agi", "dreamer", "queue", "duck", "conflict", "outage", "milestone"])
})

test("the strip on the report card: N/7, the new one in gold with its pun; every line has glyphs; read-only", () => {
  const pal = P.build(themeOf("tokyo-night").theme, 1), w = { ...S.generate(4, 0, 1), done: true, doneTicks: 20, saved: 5, toRelease: 10 }
  for (const s of D.SIGHTINGS) for (const ch of "NEW: " + D.sightingLine(s.id)) assert.ok(D.TRANSITION_GLYPHS[ch], `${s.id}: ${ch}`)
  assert.ok(D.reportRows(w, pal).every(r => !r.sightings), "no sightings, no strip")
  w.sightings = { seen: ["agi", "duck"], fresh: ["duck"] }
  const rows = D.reportRows(w, pal)
  assert.ok(rows.some(r => r.sightings))
  assert.equal(rows.at(-1).text, "NEW: RUBBER DUCK - IT JUST LISTENED")
  const img = canvas(400, 248), inks = []
  const fill = img.ctx.fillRect.bind(img.ctx)
  img.ctx.fillRect = (...a) => { inks.push(img.ctx.fillStyle); fill(...a) }
  const before = JSON.stringify(w.sightings)
  D.drawLevelResults(img.ctx, w, pal)
  assert.equal(JSON.stringify(w.sightings), before)
  assert.ok(inks.includes(D.AGI_GOLD), "the ring")
  assert.equal(D.reportRows({ ...w, sightings: { seen: ["agi"], fresh: [] } }, pal).at(-1).sightings, true, "nothing new: no pun line")
})

const chromium = (() => { try { execSync("command -v chromium", { stdio: "ignore" }); return true } catch { return false } })()
test("on the page: a finished level records its sightings in this browser; with storage blocked, nothing breaks", { skip: !chromium && "no chromium", timeout: 30000 }, async () => {
  for (const blocked of [false, true]) {
    const server = await serve(), b = await browser(), sleep = ms => new Promise(r => setTimeout(r, ms))
    try {
      await b.cmd("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false })
      if (blocked) await b.cmd("Page.addScriptToEvaluateOnNewDocument", { source: `Object.defineProperty(window, "localStorage", { get() { throw new Error("blocked") } })` })
      await b.cmd("Page.navigate", { url: `http://127.0.0.1:${server.address().port}/?level=3&seed=42` })
      await sleep(1500)
      const ev = async e => (await b.cmd("Runtime.evaluate", { expression: e, returnByValue: true })).result.value
      await ev(`(() => { const w = AgentWorld(); w.agiId = 1; w.duckAppeared = true; w.done = true; w.doneTicks = 0 })()`)
      await sleep(300)
      const r = await ev(`(() => { const w = AgentWorld(); let stored = null; try { stored = localStorage.getItem("oh-no-more-agents-sightings") } catch (e) { stored = "blocked" } return { s: w.sightings || null, stored } })()`)
      if (blocked) { assert.equal(r.s, null); assert.equal(r.stored, "blocked") }
      else { assert.deepEqual(r.s, { seen: ["agi", "duck"], fresh: ["agi", "duck"] }); assert.equal(r.stored, JSON.stringify(["agi", "duck"])) }
      assert.deepEqual(b.errors, [])
    } finally { await b.close(); server.close() }
  }
})
