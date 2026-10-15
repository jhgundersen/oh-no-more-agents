import test from "node:test"
import assert from "node:assert/strict"
import { execSync } from "node:child_process"
import { loadCore } from "../tools/load-core.js"
import { canvas, themeOf } from "../tools/render.js"
import { serve, browser } from "../tools/phone.js"

// The sweepstake: the watcher picks who gets home first.
const S = loadCore("Sim.js"), D = loadCore("Draw.js"), P = loadCore("Palette.js")

test("Sim keeps the order they got home, and it changes nothing", () => {
  const w = S.generate(3, 0, 5)
  while (!w.done) S.step(w)
  assert.equal(w.homeOrder.length, w.saved)
  assert.equal(new Set(w.homeOrder).size, w.saved)
  const v = S.generate(3, 0, 5); v.homeOrder = null
  while (!v.done) S.step(v)
  assert.deepEqual([v.saved, v.ticks], [w.saved, w.ticks])
})

test("the line: called it, came home Nth, or did not make it; with the tally when there is one", () => {
  const w = { homeOrder: [7, 3, 9, 1, 2, 4, 5, 6, 8, 10, 11, 12, 13], bet: 7 }
  assert.equal(D.betLine(w), "CALLED IT: AGENT 007 FIRST HOME")
  assert.equal(D.betLine({ ...w, bet: 9 }), "YOUR PICK AGENT 009 CAME HOME 3RD")
  assert.equal(D.betLine({ ...w, bet: 3 }), "YOUR PICK AGENT 003 CAME HOME 2ND")
  assert.equal(D.betLine({ ...w, bet: 11 }), "YOUR PICK AGENT 011 CAME HOME 11TH")
  assert.equal(D.betLine({ ...w, bet: 42 }), "YOUR PICK AGENT 042 DID NOT MAKE IT")
  assert.equal(D.betLine({ ...w, betTally: { right: 3, total: 9 } }), "CALLED IT: AGENT 007 FIRST HOME · CALLED 3 OF 9")
  assert.equal(D.ordinal(1), "1ST"); assert.equal(D.ordinal(12), "12TH"); assert.equal(D.ordinal(22), "22ND"); assert.equal(D.ordinal(113), "113TH")
  for (const line of [D.betLine({ ...w, betTally: { right: 99, total: 999 } }), D.betLine({ ...w, bet: 11, betTally: { right: 99, total: 999 } })]) {
    assert.ok(line.length <= D.REPORT_CHARS, line)
    for (const ch of line) assert.ok(D.TRANSITION_GLYPHS[ch], ch)
  }
})

test("the card shows the pick in gold when called; the coin marks the pick until it is home", () => {
  const pal = P.build(themeOf("tokyo-night").theme, 3)
  const w = { ...S.generate(3, 0, 5), done: true, doneTicks: 20, homeOrder: [4, 2], bet: 4, saved: 2, toRelease: 10 }
  const row = D.reportRows(w, pal).find(r => /CALLED IT/.test(r.text || ""))
  assert.equal(row.colour, D.AGI_GOLD)
  assert.ok(!D.reportRows({ ...w, bet: undefined }, pal).some(r => /PICK|CALLED/.test(r.text || "")), "no pick, no line")
  const inks = []
  const img = canvas(400, 248), f = img.ctx.fillRect.bind(img.ctx)
  img.ctx.fillRect = (...a) => { inks.push(img.ctx.fillStyle); f(...a) }
  D.drawAgentGlitter(img.ctx, { ...w, done: false, ticks: 40 }, { id: 4, x: 20, y: 20, state: "walk" }, 80, 60)
  assert.ok(inks.includes(D.AGI_GOLD))
  inks.length = 0
  D.drawAgentGlitter(img.ctx, { ...w, ticks: 40 }, { id: 4, x: 20, y: 20, state: "saved" }, 80, 60)
  assert.equal(inks.length, 0, "home: no coin")
})

const chromium = (() => { try { execSync("command -v chromium", { stdio: "ignore" }); return true } catch { return false } })()
test("on the page: the first tap is the pick (no nudge), later taps are pep talks, and the result is tallied", { skip: !chromium && "no chromium", timeout: 60000 }, async () => {
  const server = await serve(), b = await browser(), sleep = ms => new Promise(r => setTimeout(r, ms))
  const ev = async e => (await b.cmd("Runtime.evaluate", { expression: e, returnByValue: true })).result.value
  try {
    await b.cmd("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false })
    await b.cmd("Page.navigate", { url: `http://127.0.0.1:${server.address().port}/?level=3&seed=5` })
    let where = null
    for (let i = 0; i < 40 && !where; i++, await sleep(150)) where = await ev(`(() => { const w = AgentWorld(), a = w.agents.find(a => !a.gone && a.state === "walk" && a.y > 4); if (!a) return null; const r = document.getElementById("board").getBoundingClientRect(), s = r.width / (w.k.COLS * w.k.CELL); return { id: a.id, x: r.left + a.x * w.k.CELL * s, y: r.top + ((a.y + 1) * w.k.CELL - 7) * s } })()`)
    assert.ok(where)
    // A first visit: the board's tip says "tap an agent", so the ticker does not
    // say it too (log 249). A returning visitor gets the ticker line.
    assert.equal(await ev(`!document.getElementById("tip").hidden`), true)
    assert.ok(!(await ev(`AgentWorld().feed.map(f => f.text).join("|")`)).includes("WHO GETS HOME FIRST"))
    await ev(`localStorage.setItem("oh-no-more-agents-tip", "1")`)
    await b.cmd("Page.navigate", { url: `http://127.0.0.1:${server.address().port}/?level=3&seed=5` })
    where = null
    for (let i = 0; i < 40 && !where; i++, await sleep(150)) where = await ev(`(() => { const w = AgentWorld(), a = w.agents.find(a => !a.gone && a.state === "walk" && a.y > 4); if (!a) return null; const r = document.getElementById("board").getBoundingClientRect(), s = r.width / (w.k.COLS * w.k.CELL); return { id: a.id, x: r.left + a.x * w.k.CELL * s, y: r.top + ((a.y + 1) * w.k.CELL - 7) * s } })()`)
    assert.ok(where)
    assert.equal(await ev(`!document.getElementById("tip").hidden`), false)
    assert.ok((await ev(`AgentWorld().feed.map(f => f.text).join("|")`)).includes("WHO GETS HOME FIRST"))
    const click = async (x, y) => { await b.cmd("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 }); await b.cmd("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 }); await sleep(100) }
    for (let i = 0; i < 6 && (await ev(`AgentWorld().bet`)) == null; i++) {
      await click(where.x, where.y)
      if ((await ev(`AgentWorld().bet`)) == null) { await sleep(300); where = { ...where, ...(await ev(`(() => { const w = AgentWorld(), a = w.agents.find(a => a.id === ${where.id}); const r = document.getElementById("board").getBoundingClientRect(), s = r.width / (w.k.COLS * w.k.CELL); return { x: r.left + a.x * w.k.CELL * s, y: r.top + ((a.y + 1) * w.k.CELL - 7) * s } })()`)) } }
    }
    const bet = await ev(`AgentWorld().bet`)
    assert.ok(bet != null, "picked")
    assert.equal(await ev(`AgentWorld().peps || 0`), 0, "a pick is not a pep talk")
    await ev(`(() => { const w = AgentWorld(); while (!w.done) step(w) })()`)
    await sleep(400)
    const tally = await ev(`localStorage.getItem("oh-no-more-agents-sweepstake")`)
    assert.equal(JSON.parse(tally).total, 1)
    assert.deepEqual(b.errors, [])
  } finally { await b.close(); server.close() }
})
