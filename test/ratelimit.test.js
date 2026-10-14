import test from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { loadCore } from "../tools/load-core.js"
import { canvas, themeOf } from "../tools/render.js"

// 429 Too Many Requests: a crowd on one floor may be held by a sign and let go
// one at a time from the front. See stepRateLimit in Sim.js.
const S = loadCore("Sim.js"), D = loadCore("Draw.js"), P = loadCore("Palette.js"), O = loadCore("Outcome.js")

// The first stretch of ten cells of flat, open, roofed-over floor away from
// the exit and the hatch. Found rather than pinned, so a layout change does
// not move the crowd into a hole.
function flat(w) {
  for (const c of w.corridors) {
    const y = c.floorY - 1
    for (let x = c.x0 + 2; x < c.x1 - 12; x++) {
      let ok = true
      for (let k = 0; k < 10 && ok; k++)
        ok = S.solid(w, x + k, y + 1) && !S.solid(w, x + k, y) && !S.solid(w, x + k, y - 1) && S.eventSafeX(w, x + k)
      if (ok) return { x, y }
    }
  }
  throw new Error("no flat stretch")
}

// A crowd of `n` walkers bunched on that stretch, with nothing else on the
// level to get in the way.
function crowd(n, dir = 1) {
  const w = S.generate(1, 0, 3)
  w.hazards = []; w.enemies = []; w.pits = []
  w.agents = []
  const { x: at, y } = flat(w)
  for (let i = 0; i < n; i++) w.agents.push(Object.assign(S.spawn(w), { x: at + 1 + i * 0.7, y, state: "walk", dir }))
  w.ticks = S.LIMIT_EARLIEST
  w.released = w.toRelease
  return { w, y }
}

test("a big enough crowd is found; a small one, a hero or one by the exit is not", () => {
  assert.equal(S.findCrowd(crowd(S.LIMIT_CROWD - 1).w), null)
  const { w } = crowd(S.LIMIT_CROWD)
  assert.equal(S.findCrowd(w).length, S.LIMIT_CROWD)
  w.agents[0].special = "hero"
  assert.equal(S.findCrowd(w), null)
  const near = crowd(S.LIMIT_CROWD)
  for (const ag of near.w.agents) ag.x = near.w.exit.x + 1 + (ag.x % 1)
  assert.equal(S.findCrowd(near.w), null, "the exit's own crowd is a crowd going home")
})

test("the queue holds everybody and lets them go front first, one interval apart", () => {
  for (const dir of [1, -1]) {
    const { w } = crowd(6, dir)
    S.queueCrowd(w, S.findCrowd(w))
    const front = [...w.agents].sort((a, b) => (b.x - a.x) * dir)
    front.forEach((ag, n) => assert.equal(ag.queueFor, S.LIMIT_HOLD + n * S.LIMIT_EVERY))
    assert.equal(w.rateLimit.dir, dir)
    assert.equal(w.rateLimited, 6)
    assert.match(w.feed.at(-1).text, /429/)
  }
})

test("a queued agent stands still and is invisible to the stuck watchers, and nothing holds it for good", () => {
  const { w } = crowd(6)
  S.queueCrowd(w, S.findCrowd(w))
  const xs = w.agents.map(a => a.x)
  for (let t = 0; t < S.LIMIT_HOLD - 1; t++) for (const ag of w.agents) S.agentActs(w, ag)
  assert.deepEqual(w.agents.map(a => a.x), xs, "nobody moves while held")
  assert.ok(w.agents.every(a => a.still === 0 && a.state === "walk"))
  for (let t = 0; t < 6 * S.LIMIT_EVERY + 2; t++) { w.ticks++; S.stepRateLimit(w); for (const ag of w.agents) S.agentActs(w, ag) }
  assert.ok(w.agents.every(a => !(a.queueFor > 0)), "everyone released")
  assert.ok(w.agents.some((a, i) => a.x !== xs[i]), "and walking again")
  for (let t = 0; t < S.LIMIT_SIGN + 2; t++) { w.ticks++; S.stepRateLimit(w) }
  assert.equal(w.rateLimit, null, "the sign comes down")
})

test("anything that changes an agent's situation ends its turn in the queue", () => {
  const { w } = crowd(6)
  S.queueCrowd(w, S.findCrowd(w))
  const [a, b, c] = w.agents
  a.state = "fall"; b.special = "hero"
  assert.equal(S.queued(w, a), false); assert.equal(a.queueFor, 0)
  assert.equal(S.queued(w, b), false); assert.equal(b.queueFor, 0)
  w.terrain[(Math.floor(c.y) + 1) * w.k.COLS + Math.floor(c.x)] = w.k.EMPTY
  assert.equal(S.queued(w, c), false, "the floor went")
})

test("once a level at most, after the opening, and only on the coin", () => {
  const { w } = crowd(6)
  w.ticks = S.LIMIT_EARLIEST - 15
  S.stepRateLimit(w)
  assert.equal(w.rateLimitDone, undefined, "too early to look")
  w.ticks = S.LIMIT_EARLIEST
  w.limitRng = () => 0.99
  S.stepRateLimit(w)
  assert.equal(w.rateLimitDone, true); assert.equal(w.rateLimit, null, "the coin said no")
  w.limitRng = () => 0
  w.ticks += 15; S.stepRateLimit(w)
  assert.equal(w.rateLimit, null, "and that was its one chance")

  const yes = crowd(6).w
  yes.limitRng = () => 0
  S.stepRateLimit(yes)
  assert.ok(yes.rateLimit)
})

test("played levels: when it fires it drains, and no level hangs", () => {
  let fired = 0
  for (let level = 1; level <= 30; level++) {
    const w = S.generate(level, 0, level * 1009 + 7)
    w.limitRng = () => 0                    // always take the coin, to meet it often
    let longest = 0
    while (!w.done && w.ticks < 6000) {
      S.step(w)
      for (const ag of w.agents) longest = Math.max(longest, ag.queueFor || 0)
    }
    assert.ok(w.done, `level ${level} hung`)
    assert.ok(longest <= S.LIMIT_HOLD + 40 * S.LIMIT_EVERY)
    if (w.rateLimited) fired++
  }
  // Only real queues qualify (same direction, recent progress), so a forced
  // coin meets one on a couple of levels in thirty.
  assert.ok(fired >= 1, `crowds form often enough to meet the sign (${fired})`)
})

test("the sign pops up, blinks, holds, sinks away on whole pixels, and draws read-only", () => {
  const pal = P.build(themeOf("tokyo-night").theme, 1), w = S.generate(1, 0, 3)
  const rl = { x: 60, y: w.corridors[0].floorY - 1, dir: 1, at: 100, count: 6, clearAt: -1 }
  const draw = (ticks, over = {}) => {
    const img = canvas(400, 248), calls = []
    const fill = img.ctx.fillRect.bind(img.ctx)
    img.ctx.fillRect = (...a) => { calls.push(a); fill(...a) }
    const sign = { ...rl, ...over }, before = JSON.stringify(sign)
    D.drawRateLimitSign(img.ctx, { ...w, ticks }, pal, sign)
    assert.equal(JSON.stringify(sign), before)
    for (const c of calls) assert.ok(c.every(Number.isInteger), "whole art pixels")
    return { calls, hash: createHash("sha256").update(img.buf).digest("hex") }
  }
  assert.equal(draw(100).calls.length, 0, "not yet up")
  assert.ok(draw(110).calls.length > 0)
  assert.notEqual(draw(106).hash, draw(111).hash, "blinks at first")
  assert.equal(draw(140).hash, draw(150).hash, "steady once up")
  assert.ok(draw(200, { clearAt: 190 }).calls.length > 0, "lingers after the queue drains")
  assert.equal(draw(260, { clearAt: 190 }).calls.length, 0, "and is gone")

  // Drawn through the actor pass, once one is up.
  const img = canvas(400, 248), seen = []
  const fill = img.ctx.fillRect.bind(img.ctx)
  img.ctx.fillRect = (...a) => { seen.push(img.ctx.fillStyle); fill(...a) }
  D.drawActorFixtures(img.ctx, { ...w, ticks: 140, rateLimit: rl, mirages: [{ x: 30, y: rl.y, dir: 1, by: 0, born: 120, popped: -1 }] }, pal)
  assert.ok(seen.includes(pal.exitGlow), "the mirage too")
  assert.ok(seen.includes(pal.urgent))
})

test("the end-of-level line can mention the queue only when one happened", () => {
  const base = { saved: 5, toRelease: 10, nuking: false, lastUsed: {}, hazardKills: 0, bombsUsed: 0, rescues: 0,
    pits: [], lost: 0, enemyRoster: [], eventMechs: {}, carrierHome: false }
  const lines = new Set(O.EVENT_LINES.ratelimit)
  const random = Math.random
  try {
    let hit = 0
    for (let i = 0; i < 100; i++) {
      let n = 0
      Math.random = () => (n++ % 2 === 0 ? 0 : i / 100)
      assert.ok(!lines.has(O.outcomeLine({ ...base, rateLimited: 0 })))
      n = 0
      if (lines.has(O.outcomeLine({ ...base, rateLimited: 6 }))) hit++
    }
    assert.ok(hit > 0)
  } finally { Math.random = random }
})

test("the front of the queue says AFTER YOU, and each one let through says 200 OK", () => {
  const { w } = crowd(6)
  S.queueCrowd(w, S.findCrowd(w))
  const front = w.agents.filter(a => a.queuedAt === w.ticks)
  assert.equal(front.length, 1)
  assert.equal(D.quipFor(w, front[0]).text, "AFTER YOU")
  const served = new Set()
  for (let t = 0; t < S.LIMIT_HOLD + 6 * S.LIMIT_EVERY; t++) {
    w.ticks++
    for (const ag of w.agents) { S.agentActs(w, ag); if (ag.servedAt === w.ticks) { served.add(ag.id); assert.equal(D.quipFor(w, ag).text, "200 OK") } }
  }
  assert.equal(served.size, 6)
})
