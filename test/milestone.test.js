import test from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { execSync } from "node:child_process"
import { loadCore } from "../tools/load-core.js"
import { canvas, themeOf } from "../tools/render.js"
import { serve, browser } from "../tools/phone.js"

// Community milestones: the worldwide total crossing a round number dresses
// the colony for the session. Cosmetic only.
const S = loadCore("Sim.js"), D = loadCore("Draw.js"), P = loadCore("Palette.js"), O = loadCore("Outcome.js")

test("crossing a round number while watching, or opening just after one", () => {
  assert.equal(O.milestoneFor(489990, 490010).n, 490000)
  assert.equal(O.milestoneFor(null, 490120).n, 490000, "only just passed at first sight")
  assert.equal(O.milestoneFor(null, 486570), null, "long past: no party")
  assert.equal(O.milestoneFor(490010, 490500), null, "already past while watching")
  assert.equal(O.milestoneFor(499990, 500003).kind, "hundred")
  assert.equal(O.milestoneFor(999999, 1000000).kind, "million")
  assert.equal(O.milestoneFor(null, 490050).kind, "ten")
  for (const t of [null, undefined, "490000", NaN, -5, 9999]) assert.equal(O.milestoneFor(null, t), null, String(t))
  assert.equal(O.milestoneFor(null, 1000020).line, "COMMUNITY MILESTONE: 1,000,000 AGENTS HOME")
  assert.equal(O.withCommas(1234567), "1,234,567"); assert.equal(O.withCommas(999), "999")
})

test("hats on the colony and confetti at the first release, only with a milestone; read-only", () => {
  const pal = P.build(themeOf("tokyo-night").theme, 1)
  const w = S.generate(1, 0, 42)
  while (!(w.firstReleaseAt >= 0)) S.step(w)
  assert.equal(w.firstReleaseAt, w.lastReleaseAt)
  const draw = over => {
    const img = canvas(400, 248), inks = []
    const fill = img.ctx.fillRect.bind(img.ctx)
    img.ctx.fillRect = (...a) => { inks.push(img.ctx.fillStyle); fill(...a) }
    const world = { ...w, ...over, ticks: w.firstReleaseAt + 10 }, before = JSON.stringify(world.milestone || null)
    D.drawActors(img.ctx, world, pal, {})
    assert.equal(JSON.stringify(world.milestone || null), before)
    return { inks, hash: createHash("sha256").update(img.buf).digest("hex") }
  }
  const plain = draw({}), party = draw({ milestone: O.milestoneFor(null, 490050) }), gold = draw({ milestone: O.milestoneFor(null, 500050) })
  assert.ok(!plain.inks.some(c => D.PARTY.includes(c)), "no milestone, no party")
  assert.ok(party.inks.filter(c => D.PARTY.includes(c)).length > 10, "hats and confetti")
  assert.notEqual(party.hash, gold.hash)
  const late = { ...w, milestone: O.milestoneFor(null, 490050), ticks: w.firstReleaseAt + D.CONFETTI_TICKS }
  const img = canvas(400, 248), seen = []
  const fill = img.ctx.fillRect.bind(img.ctx)
  img.ctx.fillRect = (...a) => { seen.push(a); fill(...a) }
  D.drawConfetti(img.ctx, late)
  assert.equal(seen.length, 0, "the confetti is over")
})

const chromium = (() => { try { execSync("command -v chromium", { stdio: "ignore" }); return true } catch { return false } })()
test("on the page: a fresh milestone in the stats puts hats and a ticker line on the colony; offline, nothing", { skip: !chromium && "no chromium" }, async () => {
  for (const total of [490050, null]) {
    const server = await serve(), b = await browser(), sleep = ms => new Promise(r => setTimeout(r, ms))
    try {
      const base = `http://127.0.0.1:${server.address().port}/`
      if (total !== null) {
        // Answer the page's counter calls with a total just past a round number.
        await b.cmd("Fetch.enable", { patterns: [{ urlPattern: "*/api/*" }] })
        const answer = async () => {
          for (let i = 0; i < 40; i++) {
            const ev = b.paused && b.paused.shift()
            if (ev) await b.cmd("Fetch.fulfillRequest", { requestId: ev.requestId, responseCode: 200,
              responseHeaders: [{ name: "content-type", value: "application/json" }],
              body: Buffer.from(JSON.stringify({ totalSaved: total })).toString("base64") })
            await sleep(100)
          }
        }
        b.paused = []
        b.onEvent = e => { if (e.method === "Fetch.requestPaused") b.paused.push(e.params) }
        await b.cmd("Page.navigate", { url: base })
        await answer()
      } else {
        await b.cmd("Page.navigate", { url: base })
        await sleep(3000)
      }
      const r = (await b.cmd("Runtime.evaluate", { returnByValue: true, expression: `(() => { const w = AgentWorld(); return { m: w.milestone || null, feed: w.feed.map(f => f.text) } })()` })).result.value
      if (total === null) { assert.equal(r.m, null); assert.ok(!r.feed.some(t => /MILESTONE/.test(t))) }
      else { assert.equal(r.m && r.m.n, 490000); assert.ok(r.feed.some(t => /COMMUNITY MILESTONE: 490,000/.test(t))) }
      assert.deepEqual(b.errors, [])
    } finally { await b.close(); server.close() }
  }
})
