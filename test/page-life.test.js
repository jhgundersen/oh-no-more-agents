import test from "node:test"
import assert from "node:assert/strict"
import { execSync } from "node:child_process"
import { load, canvas } from "../tools/render.js"
import { serve, browser } from "../tools/phone.js"

// The page around the board (Draw's SKILL_ICON_ACTIONS, logo extras and
// commuter pip; web.js plays them): skill icons act on hover/press and use,
// the logo idles and glows at dusk, a commuter walks the Home bar.
const D = load("Draw.js")
const chromium = (() => { try { execSync("command -v chromium", { stdio: "ignore" }); return true } catch { return false } })()
const sleep = ms => new Promise(r => setTimeout(r, ms))
function marks(fn, W = 400, H = 100) {
  const ctx = canvas(W, H).ctx, calls = []
  ctx.fillRect = (...r) => calls.push([...r, ctx.fillStyle])
  fn(ctx)
  return calls
}

test("every skill icon has four action frames on its own 14x14 grid, ending at rest", () => {
  for (const name of Object.keys(D.SKILL_ICON_PIXELS)) {
    const actions = D.SKILL_ICON_ACTIONS[name]
    assert.equal(actions.length, 4, name)
    const frames = [0, 1, 2, 3].map(f => D.skillIconFrameRows(name, f))
    for (const rows of frames) { assert.equal(rows.length, 14); for (const r of rows) assert.equal(r.length, 14) }
    assert.ok(frames.slice(0, 3).some(rows => rows.join() !== D.SKILL_ICON_PIXELS[name].join()), `${name} moves`)
    assert.deepEqual(frames[3], D.SKILL_ICON_PIXELS[name], `${name} ends at rest`)
    // The outline runs a pixel round the 14x14 drawing: the whole 16px canvas.
    for (const [x, y, w, h] of marks(ctx => D.drawSkillIconFrame(ctx, name, 1), 16, 16)) assert.ok(x >= 0 && y >= 0 && x + w <= 16 && y + h <= 16)
  }
})

test("the logo's idles and dusk glow stay inside the logo, and the glow follows the dusk", () => {
  const colours = { accent: "#7aa2f7", foreground: "#a9b1d6", muted: "#414868", background: "#1a1b26" }
  const inside = calls => calls.every(([x, y, w, h]) => x >= 0 && y >= 0 && x + w <= D.PAGE_LOGO_WIDTH && y + h <= D.PAGE_LOGO_HEIGHT)
  for (const step of [0, 2]) assert.ok(inside(marks(ctx => D.drawLogoTwirl(ctx, colours, step))))
  assert.ok(inside(marks(ctx => D.drawLogoGlance(ctx))))
  for (let s = 0; s < D.LOGO_DROP.length; s++) assert.ok(inside(marks(ctx => D.drawLogoRaindrop(ctx, s))))
  assert.equal(marks(ctx => D.drawLogoExitGlow(ctx, colours, 0)).length, 0, "no glow in daylight")
  assert.ok(inside(marks(ctx => D.drawLogoExitGlow(ctx, colours, 1))) && marks(ctx => D.drawLogoExitGlow(ctx, colours, 1)).length > 4)
})

test("the commuter pip is a little agent on the 8px bar, legs going", () => {
  const colours = { foreground: "#a9b1d6" }, a = marks(ctx => D.drawCommutePip(ctx, 10, 0, colours)), b = marks(ctx => D.drawCommutePip(ctx, 10, 1, colours))
  for (const [x, y, w, h] of a.concat(b)) assert.ok(x >= 10 && x + w <= 14 && y >= 0 && y + h <= 8)
  assert.notDeepEqual(a, b, "a step")
})

test("on the page: hovering a skill plays its action, the commuter walks, nothing moves the layout; reduced motion holds still", { skip: !chromium && "no chromium", timeout: 60000 }, async () => {
  const server = await serve(), b = await browser(), base = `http://127.0.0.1:${server.address().port}/?level=3&seed=42&season=none`
  const ev = async e => (await b.cmd("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true })).result.value
  const open = async reduced => {
    await b.cmd("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: reduced ? "reduce" : "no-preference" }] })
    await b.cmd("Page.navigate", { url: base })
    for (let i = 0; i < 100 && !(await ev("!!(window.AgentWorld && AgentWorld())")); i++) await sleep(50)
    await sleep(400)
  }
  try {
    await b.cmd("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
    await open(false)
    const box = () => ev(`JSON.stringify(["#toolbar",".track","#board"].map(s => { const r = document.querySelector(s).getBoundingClientRect(); return [r.x, r.y, r.width, r.height] }))`)
    const before = await box(), icon = () => ev(`document.querySelector(".skill-icon").toDataURL()`), rest = await icon()
    await ev(`document.querySelector(".skill").dispatchEvent(new PointerEvent("pointerenter"))`)
    await sleep(120)
    assert.notEqual(await icon(), rest, "acting")
    await sleep(500)
    assert.equal(await icon(), rest, "back at rest")
    await ev(`AgentWorld().saved = 3`)
    await sleep(600)
    assert.ok(await ev(`(() => { const c = document.querySelector(".commute-bar"), d = c.getContext("2d").getImageData(0, 0, c.width, 8).data; for (let i = 3; i < d.length; i += 4) if (d[i]) return (i >> 2) % c.width > 4; return false })()`), "walked")
    assert.equal(await box(), before, "no layout shift")
    await open(true)
    const still = await icon()
    await ev(`document.querySelector(".skill").dispatchEvent(new PointerEvent("pointerenter"))`)
    await sleep(120)
    assert.equal(await icon(), still, "reduced motion keeps the still icon")
    assert.deepEqual(b.errors, [])
  } finally { await b.close(); server.close() }
})
