import test from "node:test"
import assert from "node:assert/strict"
import { loadCore } from "../tools/load-core.js"
import { canvas } from "../tools/render.js"

// The Library's librarian (Sim's placeLibrarian): a shush is a short pause,
// never a turn or a stop, with a cooldown, on a stream of its own.
const S = loadCore("Sim.js"), D = loadCore("Draw.js"), P = loadCore("Palette.js")

test("every Library level has one librarian on the first corridor's open floor; no other biome has one", () => {
  for (const level of [13, 33, 53, 93, 113]) {
    const w = S.generate(level, 0, 5)
    assert.equal(w.biome, "Library")
    assert.equal(w.librarians.length, 1)
    const lib = w.librarians[0]
    assert.ok(S.solid(w, lib.x, lib.y + 1) && !S.solid(w, lib.x, lib.y))
  }
  for (const level of [1, 12, 14, 19]) assert.equal(S.generate(level, 0, 5).librarians.length, 0)
})

function bench() {
  const w = S.generate(13, 0, 5), lib = w.librarians[0]
  w.agents = []
  const ag = Object.assign(S.spawn(w), { x: lib.x + 2.5, y: lib.y, dir: 1, state: "bash", timer: 0, trait: "steady" })
  w.agents = [ag]
  w.ticks = 1000
  return { w, lib, ag }
}

test("a noisy tool within earshot is shushed: it holds still, says sorry, then carries on as it was", () => {
  const { w, lib, ag } = bench()
  S.stepLibrarians(w)
  assert.equal(lib.shushAt, 1000)
  assert.equal(ag.hushedFor, S.HUSH_TICKS)
  assert.match(w.feed[w.feed.length - 1].text, /^SHHH! AGENT \d{3} WAS TOO LOUD$/)
  const x = ag.x, dir = ag.dir
  for (let i = 0; i < S.HUSH_TICKS; i++) assert.equal(S.hushed(w, ag), true)
  assert.equal(S.hushed(w, ag), false, "and then it is free")
  assert.deepEqual([ag.x, ag.dir, ag.state], [x, dir, "bash"], "same place, same way, same job")
  assert.equal(D.quipFor(Object.assign(w, { ticks: ag.shushedAt + 1 }), ag).text, "SORRY")
})

test("she needs a while between shushes; quiet walkers, specials and anyone out of earshot are left alone", () => {
  const { w, lib, ag } = bench()
  S.stepLibrarians(w)
  ag.hushedFor = 0
  w.ticks += S.LIB_COOL - 1; S.stepLibrarians(w)
  assert.equal(lib.shushAt, 1000, "still composing herself")
  w.ticks += 1
  Object.assign(ag, { state: "walk", trait: "steady" }); S.stepLibrarians(w)
  assert.equal(lib.shushAt, 1000, "a quiet walker")
  Object.assign(ag, { trait: "brave" }); S.stepLibrarians(w)
  assert.equal(lib.shushAt, w.ticks, "a brave one stomps")
  w.ticks += S.LIB_COOL; ag.hushedFor = 0
  Object.assign(ag, { state: "dig", x: lib.x + S.LIB_REACH + 1 }); S.stepLibrarians(w)
  assert.notEqual(lib.shushAt, w.ticks, "too far to hear")
  Object.assign(ag, { x: lib.x + 2, special: "beamsearch" }); S.stepLibrarians(w)
  assert.notEqual(lib.shushAt, w.ticks, "not a hero")
})

test("a shushed agent whose floor goes falls as it would have", () => {
  const { w, lib, ag } = bench()
  S.stepLibrarians(w)
  for (let x = Math.floor(ag.x) - 1; x <= Math.floor(ag.x) + 1; x++) w.terrain[(lib.y + 1) * w.k.COLS + x] = w.k.EMPTY
  assert.equal(S.hushed(w, ag), false)
  assert.equal(ag.hushedFor, 0)
})

test("she is drawn at both resolutions, with the SHHH at page resolution", () => {
  const { w, lib } = bench()
  const pal = P.build({ background: "#1a1b26", foreground: "#c0caf5", accent: "#7aa2f7", urgent: "#f7768e", muted: "#565f89" }, 13)
  lib.shushAt = w.ticks - 5
  for (const res of [1, 2]) {
    w.res = res
    const fills = []
    const img = canvas(800, 496, "#000"), ctx = new Proxy(img.ctx, { get: (t, k) => k === "fillRect" ? ((...a) => { fills.push(t.fillStyle); return t.fillRect(...a) }) : (typeof t[k] === "function" ? t[k].bind(t) : t[k]), set: (t, k, v) => { t[k] = v; return true } })
    D.drawLibrarians(ctx, w, pal)
    assert.ok(fills.includes(D.LIBRARIAN.cardigan))
    assert.equal(fills.includes("#f4f4ec"), res === 2, "the bubble only at page resolution")
  }
})
