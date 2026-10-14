import test from "node:test"
import assert from "node:assert/strict"
import { loadCore } from "../tools/load-core.js"
import { themeOf } from "../tools/render.js"

// Hand to hand: a walker meeting a guard on its floor goes down with it in a
// scuffle; one of them gets up, and the agent's odds grow with company.

const S = loadCore("Sim.js"), D = loadCore("Draw.js"), P = loadCore("Palette.js")

function face(friends = 0) {
  const w = S.generate(5, 0, 1)
  const c = w.corridors[1], y = c.floorY - 1
  const ag = S.spawn(w)
  Object.assign(ag, { x: 40.5, y, dir: 1, state: "walk" })
  w.agents = [ag]
  for (let i = 0; i < friends; i++) {
    const f = S.spawn(w)
    Object.assign(f, { x: 39 - i * 0.5, y, dir: 1, state: "walk" })
    w.agents.push(f)
  }
  const en = S.spawnEnemy(w, "gun")
  Object.assign(en, { x: 40.8, y, dir: -1, state: "walk", timer: 0 })
  w.enemies = [en]
  return { w, ag, en }
}

test("contact starts a scuffle that holds both for BRAWL_TICKS, then settles", () => {
  const { w, ag, en } = face()
  assert.equal(S.stepBrawl(w, en), true)
  assert.equal(en.state, "brawl"); assert.equal(ag.state, "brawl")
  let t = 0
  while (en.state === "brawl" && !en.gone && t++ < 100) { w.ticks++; S.stepBrawl(w, en) }
  assert.equal(t, S.BRAWL_TICKS)
  assert.ok(en.gone !== ag.gone, "exactly one gets up")
  if (en.gone) assert.equal(ag.state, "walk")
  else { assert.equal(en.state, "walk"); assert.equal(w.lost, 1) }
})

test("odds: a coin toss alone, better with each colleague, capped at three", () => {
  const alone = face(0)
  assert.equal(S.brawlOdds(alone.w, alone.ag), S.BRAWL_BASE)
  for (const n of [1, 2, 3, 5]) {
    const { w, ag } = face(n)
    assert.equal(S.brawlOdds(w, ag), S.BRAWL_BASE + S.BRAWL_HELP * Math.min(3, n))
  }
})

test("a hero scuffles at its own odds; no scuffle with a drone or across floors", () => {
  let { w, ag, en } = face(); ag.special = true
  assert.equal(S.brawlOdds(w, ag), S.BRAWL_HERO)
  assert.equal(S.stepBrawl(w, en), true)
  ;({ w, ag, en } = face()); en.kind = "drone"
  assert.equal(S.stepBrawl(w, en), false)
  ;({ w, ag, en } = face()); ag.y -= 3
  assert.equal(S.stepBrawl(w, en), false)
})

test("a guard gone mid-scuffle lets the agent up", () => {
  const { w, ag, en } = face()
  S.stepBrawl(w, en)
  en.gone = true
  S.stepBrawlAgent(w, ag)
  assert.equal(ag.state, "walk")
})

test("the fight cloud draws at both resolutions and hides both fighters", () => {
  for (const res of [1, 2]) {
    const { w, ag, en } = face()
    S.stepBrawl(w, en); w.res = res
    const pal = P.build(themeOf("tokyo-night").theme, 5)
    const calls = []
    const ctx = { globalAlpha: 1, fillStyle: "", save() {}, restore() {},
      fillRect(x, y, ww, hh) { calls.push([x, y, ww, hh]) } }
    for (let t = 0; t < 16; t++) {
      w.ticks = t; calls.length = 0
      D.drawEnemy(ctx, w, pal, en)
      assert.ok(calls.length > 20)
      for (const c of calls) for (const n of c) assert.equal(n * res, Math.round(n * res))
    }
    assert.equal(ctx.globalAlpha, 1)
  }
})

test("a won scuffle leaves the winner a victory pose for a moment, only when walking", () => {
  const pal = P.build(themeOf("tokyo-night").theme, 5)
  const { w, ag } = face()
  const calls = []
  const ctx = { globalAlpha: 1, fillStyle: "", fillRect(x, y, ww, hh) { calls.push([x, y, ww, hh]) } }
  ag.wonAt = 10
  for (const [t, st, want] of [[9, "walk", false], [10, "walk", true], [27, "walk", true], [28, "walk", false], [12, "fall", false]]) {
    w.ticks = t; calls.length = 0
    D.drawVictory(ctx, w, ag, 100, 100, 1, "#111", "#eee", st)
    assert.equal(calls.length > 0, want, `tick ${t} ${st}`)
  }
})

test("the Bouncer throws a lone agent back alive, and takes BOUNCER_HP scuffles to put down", () => {
  const { w, ag, en } = face()
  en.kind = "bouncer"; en.hp = S.BOUNCER_HP
  let thrown = 0, won = 0
  for (let t = 0; t < 400 && !en.gone; t++) {
    Object.assign(ag, { gone: false, state: "walk", x: en.x - 0.3, stunFor: 0 })
    en.state = "walk"
    w.ticks = t * 37
    if (!S.stepBrawl(w, en)) continue
    while (en.state === "brawl") { w.ticks++; S.stepBrawl(w, en) }
    if (ag.state === "stunned") { thrown++; assert.ok(!ag.gone, "thrown, not killed") }
    else won++
  }
  assert.ok(en.gone, "put down in the end")
  assert.equal(won, S.BOUNCER_HP)
  assert.ok(thrown > 0)
  assert.equal(w.lost, 0)
})

test("a thrown agent is drawn flying back along an arc, flipped mid-flight, landing where it is", () => {
  const ag = { state: "stunned", x: 30.5, thrownFrom: 33.5, thrownAt: 100 }
  const w = { ticks: 100 }
  let a = D.throwArc(w, ag, 4)
  assert.equal(a.dx, 12); assert.equal(a.lift, 0); assert.equal(a.over, false)
  w.ticks = 104; a = D.throwArc(w, ag, 4)
  assert.ok(a.lift > 5 && a.over)
  w.ticks = 108; assert.deepEqual(D.throwArc(w, ag, 4), { dx: 0, lift: 0, over: false })
  w.ticks = 102; ag.state = "walk"; assert.equal(D.throwArc(w, ag, 4).dx, 0)
})
