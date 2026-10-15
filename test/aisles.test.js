import test from "node:test"
import assert from "node:assert/strict"
import { loadCore } from "../tools/load-core.js"
import { canvas } from "../tools/render.js"

// The Data Center's hot and cold aisles (Sim's placeAisles): pace only, both
// ways, on its own stream; nothing else in any level moves.
const S = loadCore("Sim.js"), D = loadCore("Draw.js"), P = loadCore("Palette.js")
const DC = [12, 31, 50, 69, 88]

test("Data Center levels get aisle pairs on corridor floors; no other biome has any", () => {
  let pairs = 0
  for (const level of DC) {
    const w = S.generate(level, 0, 5)
    assert.equal(w.biome, "Data Center")
    for (const a of w.aisles) {
      assert.equal(a.mid - a.x0, a.x1 - a.mid, "a hot and a cold run of one length")
      for (let x = a.x0; x < a.x1; x++) {
        assert.ok(S.solid(w, x, a.y + 1) && !S.solid(w, x, a.y), "on open floor")
        assert.equal(w.aisleAt[a.y * w.k.COLS + x], (x < a.mid) === a.hotFirst ? 1 : -1)
      }
    }
    pairs += w.aisles.length
  }
  assert.ok(pairs >= DC.length)
  for (const level of [1, 8, 13, 18, 19]) assert.equal(S.generate(level, 0, 5).aisles.length, 0)
})

test("hot hurries and cold slows, whichever way the agent faces; off the grate nothing changes", () => {
  const w = S.generate(12, 0, 5), a = w.aisles[0]
  const ag = Object.assign(S.spawn(w), { y: a.y, state: "walk" })
  const pace = (x, dir) => { ag.x = x + 0.5; ag.dir = dir; return S.walkStep(ag, w) }
  const hotX = a.hotFirst ? a.x0 : a.mid, coldX = a.hotFirst ? a.mid : a.x0
  const plain = pace(a.x0 - 3, 1)
  for (const dir of [1, -1]) {
    assert.ok(Math.abs(pace(hotX, dir) / plain - S.AISLE_HOT) < 1e-9)
    assert.ok(Math.abs(pace(coldX, dir) / plain - S.AISLE_COLD) < 1e-9)
  }
})

test("the ticker names the first agent on each kind, once each per level", () => {
  const seen = []
  for (const level of DC) {
    const w = S.generate(level, 0, 5), lines = []
    while (!w.done && w.ticks < 3000) {
      S.step(w)
      for (const f of w.feed) if (/AISLE/.test(f.text) && !lines.includes(f.text)) lines.push(f.text)
    }
    assert.ok(lines.length <= 2, lines.join(" | "))
    assert.equal(lines.length, Object.keys(w.aisleNoted || {}).length)
    seen.push(...lines)
  }
  assert.ok(seen.length >= 2, "some colony walks an aisle")
  for (const l of seen) assert.match(l, /^(HOT AISLE: [A-Z0-9 ]+ IS RUNNING HOT|COLD AISLE: [A-Z0-9 ]+ HAS BEEN THROTTLED)$/)
})

test("the grates are drawn at both resolutions and the drawing changes nothing", () => {
  const w = S.generate(12, 0, 5); for (let i = 0; i < 100; i++) S.step(w)
  const pal = P.build({ background: "#1a1b26", foreground: "#c0caf5", accent: "#7aa2f7", urgent: "#f7768e", muted: "#565f89" }, 12)
  const before = JSON.stringify(w.agents.map(a => [a.x, a.y, a.state]))
  for (const res of [1, 2]) {
    w.res = res
    const fills = []
    const img = canvas(800, 496, "#000"), ctx = new Proxy(img.ctx, { get: (t, k) => k === "fillRect" ? ((...a) => { fills.push(t.fillStyle); return t.fillRect(...a) }) : (typeof t[k] === "function" ? t[k].bind(t) : t[k]), set: (t, k, v) => { t[k] = v; return true } })
    D.drawAisles(ctx, w, pal)
    assert.ok(fills.includes(D.AISLE_HOT_LIT) && fills.includes(D.AISLE_COLD_LIT), "res " + res)
  }
  assert.equal(JSON.stringify(w.agents.map(a => [a.x, a.y, a.state])), before)
})
