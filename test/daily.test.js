import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import vm from "node:vm"
import { execSync } from "node:child_process"
import { loadCore } from "../tools/load-core.js"
import { serve, browser } from "../tools/phone.js"

// Colony of the day: the UTC date alone picks the level and the colony, the
// same for everyone, strictly checked, carried by the share link, named on
// the report card.
const sandbox = { URLSearchParams, Date, Math }
vm.runInNewContext(fs.readFileSync(new URL("../public/agents/share.js", import.meta.url), "utf8"), sandbox)
const A = sandbox.AgentShare
const S = loadCore("Sim.js"), D = loadCore("Draw.js")

test("the same date gives the same level and colony, and plays out identically; another date differs", () => {
  const a = A.daily("2026-10-15"), b = A.daily("2026-10-15"), c = A.daily("2026-10-16")
  assert.deepEqual({ ...a }, { ...b })
  assert.notDeepEqual([a.level, a.seed], [c.level, c.seed])
  assert.ok(a.level >= 1 && a.level <= 200 && a.seed >= 0 && a.seed <= A.MAX_SEED)
  const run = d => { const w = S.generate(d.level, 0, d.seed); while (!w.done && w.ticks < 6000) S.step(w); return JSON.stringify([w.saved, w.lost, w.ticks, w.agents.map(g => [g.id, g.state, g.x, g.y])]) }
  assert.equal(run(a), run(b))
  assert.notEqual(run(a), run(c))
  const days = new Set(); for (let d = 1; d <= 28; d++) days.add(A.daily(`2026-02-${String(d).padStart(2, "0")}`).level)
  assert.ok(days.size > 20, "a month visits many levels")
})

test("only a real date in exactly YYYY-MM-DD is accepted; today is the UTC date", () => {
  assert.equal(A.parse("?daily=2026-10-15").level, A.daily("2026-10-15").level)
  assert.equal(A.parse("?daily=2026-10-15").daily, "2026-10-15")
  for (const q of ["?daily=", "?daily=2026-2-15", "?daily=2026-02-30", "?daily=2026-13-01", "?daily=1999-01-01", "?daily=2026-10-15x", "?daily=2026-10-15&level=3"]) {
    const r = A.parse(q)
    assert.ok(r === null || (q.endsWith("&level=3") && r.daily === "2026-10-15"), q)
  }
  assert.equal(A.today(Date.UTC(2026, 9, 15, 23, 59)), "2026-10-15")
  assert.equal(A.today(Date.UTC(2026, 9, 16, 0, 1)), "2026-10-16")
  assert.equal(A.dailyUrl("https://x/?level=3#f", "2026-10-15"), "https://x/?daily=2026-10-15")
  assert.equal(A.dailyUrl("https://x/", "2026-10-32"), null)
})

test("the report card's heading names the day", () => {
  const w = S.generate(3, 0, 5)
  assert.equal(D.reportHeading(w), "LEVEL 3 · REPORT")
  w.daily = "2026-10-15"
  assert.equal(D.reportHeading(w), "COLONY OF THE DAY · 2026-10-15")
})

let chromium = true
try { execSync("command -v chromium", { stdio: "ignore" }) } catch { chromium = false }
test("on the page: the button plays today's colony, copy link carries ?daily, and a ?daily link opens it", { skip: !chromium && "no chromium", timeout: 60000 }, async () => {
  const server = await serve(), b = await browser(), sleep = ms => new Promise(r => setTimeout(r, ms))
  const ev = async e => (await b.cmd("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true })).result.value
  try {
    const base = `http://127.0.0.1:${server.address().port}/`
    await b.cmd("Page.navigate", { url: base }); await sleep(1200)
    const today = await ev(`AgentShare.today()`)
    assert.equal(await ev(`document.getElementById("dailyDate").textContent`), today)
    await ev(`document.getElementById("daily").click()`); await sleep(200)
    const d = await ev(`AgentShare.daily(AgentShare.today())`)
    assert.deepEqual(await ev(`[AgentWorld().level, AgentWorld().colonySeed, AgentWorld().daily]`), [d.level, d.seed, today])
    assert.equal(await ev(`document.getElementById("lifetime").textContent`), "0 home, 0 levels", "a move, not a clear")
    await b.cmd("Page.navigate", { url: base + "?daily=2026-10-15" }); await sleep(1200)
    const want = await ev(`AgentShare.daily("2026-10-15")`)
    assert.deepEqual(await ev(`[AgentWorld().level, AgentWorld().colonySeed, AgentWorld().daily]`), [want.level, want.seed, "2026-10-15"])
    assert.deepEqual(b.errors, [])
  } finally { await b.close(); server.close() }
})
