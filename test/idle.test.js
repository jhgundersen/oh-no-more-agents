import test from "node:test"
import assert from "node:assert/strict"
import { loadCore } from "../tools/load-core.js"
import { canvas, themeOf } from "../tools/render.js"

const S = loadCore("Sim.js"), D = loadCore("Draw.js"), P = loadCore("Palette.js")
const theme = themeOf("tokyo-night"), pal = P.build(theme.theme, 1)
function sample(kind, id = 5, dir = 1) {
  return { id, x: 4, y: 6, dir, state: ["held", "stuck", "queue"].includes(kind) ? "walk" : kind,
    anim: 11, waitFor: kind === "held" ? 10 : 0, still: kind === "stuck" ? 30 : 0,
    queueFor: kind === "queue" ? 10 : 0 }
}
function render(w, ag) {
  const res = w.res || 1, img = canvas(32 * res, 32 * res, theme.background)
  img.ctx.setTransform(res, 0, 0, res, 0, 0)
  D.drawAgent(img.ctx, w, pal, ag, {})
  return Buffer.from(img.buf).toString("base64")
}

for (const [kind, repertoire] of Object.entries(D.IDLE_REPERTOIRE)) {
  test(`${kind}: every fidget draws through its schedule at res 1 and 2`, () => {
    const w = S.generate(1, 0, 3)
    for (const res of [1, 2]) for (const dir of [1, -1]) for (const id of [0, 5]) {
      w.res = res
      const ag = sample(kind, id, dir), before = structuredClone(ag)
      const period = 180 + id % 3 * 23, frames = new Map(), quiet = new Set()
      for (let ticks = 0; ticks < period * 3; ticks++) {
        w.ticks = ticks
        const idle = D.agentIdle(w, ag), pixels = render(w, ag)
        if (!idle.pose) quiet.add(pixels)
        else {
          if (!frames.has(idle.pose)) frames.set(idle.pose, new Set())
          frames.get(idle.pose).add(pixels)
        }
      }
      assert.deepEqual([...frames.keys()].sort(), [...repertoire].sort())
      // A 429 queue is short and poses throughout; everything else rests between fidgets.
      if (kind === "block" && res === 2) {
        assert.equal(quiet.size, 3, "half-pixel breathing has three bounded hand poses")
        // The new breath only moves the outstretched hands (art rows 19–23).
        // The head, torso below the arms, and both planted feet remain still.
        const bodies = [...quiet].map(frame => {
          const buf = Buffer.from(frame, "base64"), row = 32 * res * 3
          return Buffer.concat([buf.subarray(0, 19 * res * row), buf.subarray(23 * res * row)]).toString("base64")
        })
        assert.equal(new Set(bodies).size, 1, "resting blockers keep their head and boots fixed")
      } else assert.equal(quiet.size, kind === "queue" ? 0 : 1, "quiet stance never walks or bobs")
      for (const [pose, pixels] of frames) {
        assert.ok([...pixels].some(frame => !quiet.has(frame)), `${pose} must read at res ${res}`)
        if ((["tap", "drum", "tie"].includes(pose) || (pose === "phone" && res === 2))) assert.ok(pixels.size > 1, `${pose} moves`)
      }
      assert.deepEqual(ag, before, "drawing never writes simulation state")
      w.ticks = 51
      const first = render(w, ag)
      w.ticks = 905; render(w, ag)
      w.ticks = 51
      assert.equal(render(w, ag), first, "skipped/backward ticks are deterministic")
    }
  })
}

test("fidgets use per-agent timing, long pauses, and only idle states", () => {
  const w = S.generate(1, 0, 3), ag = sample("wait", 0)
  let active = 0, differing = 0
  for (w.ticks = 0; w.ticks < 1000; w.ticks++) {
    if (D.agentIdle(w, ag).pose) active++
    if (D.agentIdle(w, ag).pose !== D.agentIdle(w, sample("wait", 1)).pose) differing++
  }
  assert.ok(active < 250 && active > 150, "occasional gestures, mostly quiet")
  assert.ok(differing > 200, "the queue does not fidget in unison")
  for (const state of ["walk", "ride", "fall", "climb", "build", "bash", "dig", "bomb", "swim", "trick", "saved"]) {
    assert.equal(D.agentIdle(w, { ...ag, state }), null, `${state} remains active`)
  }
  assert.equal(D.agentIdle(w, { ...ag, shotFor: 6 }), null, "a shot takes precedence")
  assert.equal(D.agentIdle(w, { ...ag, id: undefined }), null, "frozen colleagues have no idle schedule")
})

test("idle divers and the unspecified panel resolution draw without world mutation", () => {
  const w = S.generate(1, 0, 3)
  w.submerged = true
  const before = JSON.stringify(w)
  for (const res of [undefined, 1, 2]) for (const kind of Object.keys(D.IDLE_REPERTOIRE)) {
    w.res = res
    const ag = sample(kind)
    for (w.ticks = 0; w.ticks < 678; w.ticks += 8) render(w, ag)
  }
  delete w.res; w.ticks = 0
  assert.equal(JSON.stringify(w), before)
})
