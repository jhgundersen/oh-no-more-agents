import test from "node:test"
import assert from "node:assert/strict"
import { execSync } from "node:child_process"
import { loadCore } from "../tools/load-core.js"
import { canvas, themeOf } from "../tools/render.js"
import { serve, browser } from "../tools/phone.js"

// The page fast-forwards through dead time (web.js fastForward): more steps
// per tick once nothing has happened for eight seconds. The run must be the
// run it would have been; only how long it takes to watch changes.
const S = loadCore("Sim.js"), D = loadCore("Draw.js"), P = loadCore("Palette.js")
let chromium = true
try { execSync("command -v chromium", { stdio: "ignore" }) } catch { chromium = false }
const sleep = ms => new Promise(r => setTimeout(r, ms))

test("a stalled colony fast-forwards, ends exactly as the plain simulation does, and takes fewer page ticks", { skip: !chromium && "no chromium", timeout: 60000 }, async () => {
  const level = 109, seed = 93778362                      // a colony that ends on the stall cutoff
  const plain = S.generate(level, 0, seed)
  while (!plain.done && plain.ticks < 6000) S.step(plain)
  const server = await serve(), b = await browser()
  const ev = async e => (await b.cmd("Runtime.evaluate", { expression: e, returnByValue: true })).result.value
  try {
    await b.cmd("Page.navigate", { url: `http://127.0.0.1:${server.address().port}/?level=${level}&seed=${seed}` })
    for (let i = 0; i < 40 && !(await ev(`!!(window.AgentWorld && AgentWorld())`)); i++) await sleep(100)
    const r = await ev(`(() => {
      const w = generate(${level}, 0, ${seed}); let ticks = 0, ff = 0
      while (!w.done && w.ticks < 6000) { step(w); AgentFastForward.check(w); ticks++; if (w.fastForward) ff++ }
      return { saved: w.saved, lost: w.lost, ticks: w.ticks, pageTicks: ticks, ff }
    })()`)
    assert.deepEqual([r.saved, r.lost, r.ticks], [plain.saved, plain.lost, plain.ticks], "the same run")
    assert.ok(r.ff > 0, "it did fast-forward")
    assert.ok(r.pageTicks < r.ticks * 0.9, `fewer page ticks: ${r.pageTicks} of ${r.ticks}`)
    assert.equal(await ev(`AgentFastForward.quiet`), 240)
  } finally { await b.close(); server.close() }
})

test("the tag shows only while fast-forwarding and never over a replay", () => {
  const w = S.generate(3, 0, 5); w.res = 2
  const pal = P.build(themeOf("tokyo-night").theme, 3)
  const fills = flag => {
    Object.assign(w, flag)
    const img = canvas(800, 496), fills = [], fill = img.ctx.fillRect.bind(img.ctx)
    img.ctx.fillRect = (...a) => { fills.push(img.ctx.fillStyle); fill(...a) }
    D.drawActors(img.ctx, w, pal, {})
    return fills.length
  }
  const none = fills({ fastForward: false, replaying: false }), ff = fills({ fastForward: true, replaying: false })
  assert.ok(ff > none, "the tag draws")
  assert.equal(fills({ fastForward: true, replaying: true }), fills({ fastForward: false, replaying: true }), "the replay tag wins")
})
