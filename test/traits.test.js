import test from "node:test"
import assert from "node:assert/strict"
import { loadCore } from "../tools/load-core.js"
import { canvas, themeOf } from "../tools/render.js"

const S = loadCore("Sim.js"), D = loadCore("Draw.js"), P = loadCore("Palette.js")
const theme = themeOf("tokyo-night"), pal = P.build(theme.theme, 1)
const w = S.generate(1, 0, 99)
function sample(trait, state = "walk", anim = 4, dir = 1) {
  return { id: 0, trait, x: 5, y: 7, state, anim, dir, still: 0, waitFor: 0 }
}
function pixels(ag, options = {}) {
  const { ticks = 80, wet = false, special = false } = options
  const res = Object.hasOwn(options, "res") ? options.res : 2
  const world = { ...w, res, ticks, submerged: wet }
  const img = canvas(48 * (res || 1), 40 * (res || 1), theme.background)
  img.ctx.setTransform(res || 1, 0, 0, res || 1, 0, 0)
  D.drawAgent(img.ctx, world, pal, { ...ag, special }, {})
  return Buffer.from(img.buf)
}

for (const trait of Object.keys(S.TRAITS)) {
  test(`${trait}: a visible res-2 tell in both directions, walking and standing; res 1 unchanged`, () => {
    for (const dir of [1, -1]) for (const state of ["walk", "wait", "block", "ride"]) {
      // Quiet, phone, glance, yawn; trait detail must coexist with idle gestures.
      for (const ticks of [80, 4, 190, 370]) for (const anim of [0, 4, 8, 12]) {
        const ag = sample(trait, state, anim, dir), plain = { ...ag, trait: undefined }
        assert.ok(!pixels(ag, { ticks }).equals(pixels(plain, { ticks })), `${state}/${anim}/${ticks}: tell reaches final pixels`)
        for (const res of [undefined, 1]) {
          assert.deepEqual(pixels(ag, { res, ticks }), pixels(plain, { res, ticks }), `${state}: panel is unchanged`)
        }
        assert.deepEqual(pixels(ag, { ticks, special: true }), pixels(plain, { ticks, special: true }), "hero costume is unchanged")
      }
    }
  })
}

test("the twelve quiet stances and walk cycles remain distinguishable", () => {
  for (const state of ["walk", "wait"]) {
    const silhouettes = Object.keys(S.TRAITS).map(trait =>
      [0, 4, 8, 12, 20, 60, 90].map(anim => pixels(sample(trait, state, anim)).toString("base64")).join("/"))
    assert.equal(new Set(silhouettes).size, Object.keys(S.TRAITS).length)
  }
})

test("folded poses, unknown traits and library climbing keep their original drawing", () => {
  for (const state of ["climb", "build", "dig", "fall", "slide", "stunned", "saved", "bash", "bomb"]) {
    for (const trait of Object.keys(S.TRAITS)) {
      const ag = { ...sample(trait, state), fade: 0, fuse: 40, stunFor: 8 }
      assert.deepEqual(pixels(ag), pixels({ ...ag, trait: undefined }), state)
    }
  }
  assert.deepEqual(pixels(sample("future-trait")), pixels(sample(undefined)))
  assert.equal(D.agentTraitLook({ ...w, res: 2 }, { ...sample("brave", "climb"), shelfClimb: true }), null)
})

test("divers retain their helmets and show suit tells; drawing is read-only and deterministic", () => {
  for (const trait of Object.keys(S.TRAITS)) {
    const ag = sample(trait), world = { ...w, res: 2, submerged: true, ticks: 80 }
    const before = JSON.stringify({ world, ag })
    assert.notDeepEqual(pixels(ag, { wet: true }), pixels({ ...ag, trait: undefined }, { wet: true }))
    assert.deepEqual(D.traitHeadOffset(world, ag), { x: 0, y: 0 })
    const random = Math.random
    try {
      Math.random = () => { throw new Error("trait art must not consume randomness") }
      const first = pixels(ag)
      pixels({ ...ag, anim: 50 }, { ticks: 800 })
      assert.deepEqual(pixels(ag), first)
      const img = canvas(96, 80, theme.background)
      img.ctx.setTransform(2, 0, 0, 2, 0, 0)
      D.drawAgent(img.ctx, world, pal, ag, {})
    } finally { Math.random = random }
    assert.equal(JSON.stringify({ world, ag }), before)
  }
})

test("curious, follower and skittish peek independently; posture never overrides landing knees or fidget hands", () => {
  for (const trait of ["curious", "follower", "skittish"]) {
    const ag = sample(trait, "walk", 0)
    assert.notDeepEqual(D.traitHeadOffset({ ...w, res: 2 }, ag), D.traitHeadOffset({ ...w, res: 2 }, { ...ag, id: 2 }))
  }
  for (const trait of Object.keys(S.TRAITS)) {
    const ag = { ...sample(trait), landedAt: 80, landedFrom: 10 }
    assert.equal(D.agentDrawMotion({ ...w, res: 2, ticks: 80 }, ag, "walk", null).squash, 2)
    assert.notDeepEqual(pixels(ag), pixels({ ...ag, trait: undefined }))
  }
})
