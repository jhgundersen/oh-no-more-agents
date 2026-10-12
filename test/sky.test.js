import test from "node:test"
import assert from "node:assert/strict"
import { loadCore } from "../tools/load-core.js"
import { canvas, themeOf } from "../tools/render.js"

const S = loadCore("Sim.js"), D = loadCore("Draw.js"), P = loadCore("Palette.js")
const theme = themeOf("tokyo-night"), pal = P.build(theme.theme, 1)
const fresh = () => {
  const w = S.generate(1, 0, 8128)
  w.ticks = 200; w.events = []; w.stoodDownAt = -1; w.mission = null
  w.special = S.SPECIALS[0].id; w.specialSpec = S.SPECIALS[0]
  return w
}

// Record actual text and context state, which tools/render deliberately skips.
// Monospace metrics include the font size so fitting is tested at both sizes.
function recording() {
  const img = canvas(400, 40, "#101119"), ctx = img.ctx
  const texts = [], shifts = [], clips = [], stack = []
  let font = "10px monospace", align = "left", dy = 0
  Object.defineProperty(ctx, "font", { get: () => font, set: v => { font = v } })
  Object.defineProperty(ctx, "textAlign", { get: () => align, set: v => { align = v } })
  const save = ctx.save.bind(ctx), restore = ctx.restore.bind(ctx), translate = ctx.translate.bind(ctx)
  ctx.save = () => { stack.push({ font, align, dy }); save() }
  ctx.restore = () => { const s = stack.pop(); ({ font, align, dy } = s); restore() }
  ctx.translate = (x, y) => { shifts.push([x, y]); dy += y; translate(x, y) }
  ctx.rect = (...rect) => clips.push(rect)
  ctx.measureText = text => ({ width: text.length * Number(font.match(/([0-9]+)px/)[1]) * 0.61 })
  ctx.fillText = (text, x, y) => texts.push({ text, x, y: y + dy, font, align, width: ctx.measureText(text).width, alpha: ctx.globalAlpha })
  return { img, ctx, texts, shifts, clips, stack }
}

function below(img) { return Buffer.from(img.buf).subarray(28 * 400 * 3) }
function mission(done = false) {
  return { verb: "RAISE THE SUNKEN HOARD", done, openedAt: 195, targets: [], progress: 0 }
}

test("sky chrome fits away from either hatch, and restores context without writing world state", () => {
  for (const res of [undefined, 1, 2]) for (const hx of [10, 90]) for (const spec of S.SPECIALS) {
    const w = fresh(); w.res = res; w.hatch.x = hx; w.special = spec.id; w.specialSpec = spec
    w.submerged = spec.id === "submarine"; w.mission = mission()
    const before = JSON.stringify(w), r = recording(), blank = below(r.img)
    const box = D.skyLayout(w)
    if (box.right) assert.ok(box.x >= hx * 4 + 20)
    else assert.ok(box.x + box.width <= hx * 4 - 20)
    r.ctx.fillStyle = "#abcdef"; r.ctx.font = "10px monospace"; r.ctx.textAlign = "center"; r.ctx.globalAlpha = 0.8
    D.drawSpecialCard(r.ctx, w, pal); D.drawSkyMission(r.ctx, w, pal)
    assert.equal(JSON.stringify(w), before)
    assert.equal(r.ctx.fillStyle, "#abcdef"); assert.equal(r.ctx.font, "10px monospace")
    assert.equal(r.ctx.textAlign, "center"); assert.equal(r.ctx.globalAlpha, 0.8)
    assert.equal(r.stack.length, 0)
    assert.deepEqual(below(r.img), blank, "no rectangles spill onto the first earth row")
    assert.ok(r.texts.some(t => t.text.startsWith("MISSION:")))
    for (const t of r.texts) {
      assert.equal(t.align, "left"); assert.ok(t.y === 11 || t.y === 22)
      assert.ok(t.x >= box.x && t.x + t.width <= box.x + box.width)
    }
    const name = r.texts[0], title = r.texts[2]
    assert.ok(name.x + name.width < title.x, "mission has its own slot")
    assert.ok(r.clips.every(c => c[1] === 0 && c[3] === 28))
  }
})

test("card and notices slide on existing ticks, and return after the notice", () => {
  const w = fresh()
  const offsets = [0, 3, 6, 9, 12, 20].map(t => {
    w.ticks = t; const r = recording(); D.drawSpecialCard(r.ctx, w, pal)
    return r.shifts[0][1] + 0
  })
  assert.equal(offsets[0], -27); assert.equal(offsets.at(-1), 0)
  assert.ok(offsets.every((v, i) => i === 0 || v >= offsets[i - 1]))
  w.events = [{ at: 575, spec: { name: "PROMPT INJECTION" } }]; w.eventWarn = "PROMPT INJECTION"
  for (const [ticks, cardOffset, eventOffset] of [[500, 0, -27], [506, -14, -14], [512, -27, 0], [609, -14, -14], [615, 0, null]]) {
    w.ticks = ticks; w.events[0].fired = ticks >= 575
    const c = recording(), e = recording()
    D.drawSpecialCard(c.ctx, w, pal); D.drawEventBanner(e.ctx, w, pal)
    assert.equal(c.shifts[0][1] + 0, cardOffset)
    assert.equal(e.shifts.length ? e.shifts[0][1] + 0 : null, eventOffset)
  }
})

test("Sim's actual telegraph, zero-counter gap, firing and expiry keep one continuous banner", () => {
  const w = fresh(), at = 300
  w.events = [{ at, spec: { name: "BLACKOUT", mech: "blackout", ticks: 30, mult: 1 }, fired: false }]
  for (let ticks = at - 75; ticks <= at + 40; ticks++) {
    w.ticks = ticks; S.stepEvents(w)
    const event = D.skyEvent(w, pal), r = recording()
    D.drawEventBanner(r.ctx, w, pal)
    if (ticks === at + 40) { assert.equal(event, null); assert.equal(r.texts.length, 0); continue }
    assert.ok(event, `tick ${ticks} keeps the notice`)
    assert.equal(event.age, ticks - at + 75)
    assert.equal(event.warn, ticks < at)
    assert.equal(event.countdown, Math.max(0, at - ticks))
    const message = r.texts.find(t => t.font === "9px monospace")
    assert.equal(message.text, ticks < at ? "BLACKOUT".slice(0, ticks - at + 75) : "BLACKOUT")
    assert.deepEqual(below(r.img), below(recording().img))
  }
})

test("notice typewriter, warning lamp and countdown are stable apart from their intended changes", () => {
  const w = fresh(); w.eventWarn = "A VERY LONG INCOMING EVENT NAME".repeat(4)
  const box = D.skyLayout(w)
  for (const remaining of [75, 69, 60, 30, 24, 1]) {
    w.eventWarnFor = remaining
    const event = D.skyEvent(w, pal), r = recording(), before = JSON.stringify(w)
    D.drawSkyNotice(r.ctx, w, pal, event)
    assert.equal(JSON.stringify(w), before)
    const text = r.texts.find(t => t.font === "9px monospace")
    assert.ok(text.width <= box.width - 14)
    assert.equal(r.texts.at(-1).text, Math.ceil(remaining / 30) + "s")
    assert.equal(r.texts.at(-1).align, "right")
    const a = recording(), b = recording()
    const near = remaining < 25 ? 3 : 7
    D.drawSkyNoticeText(a.ctx, { ticks: 0 }, pal, box, event)
    D.drawSkyNoticeText(b.ctx, { ticks: near }, pal, box, event)
    assert.notDeepEqual(a.img.buf, b.img.buf, "only the lamp blinks; text never vanishes")
    assert.deepEqual(a.texts.map(t => t.text), b.texts.map(t => t.text))
  }
  w.eventWarnFor = 0; w.eventFlash = 10
  assert.equal(D.skyEvent(w, pal).age, 105)
  w.events = [{ at: 100, spec: { name: w.eventWarn }, fired: false }]
  w.ticks = 105; w.eventFlash = 0; w.eventWarnFor = 5
  assert.equal(D.skyEvent(w, pal).warn, true, "an unfired event does not announce it has landed")
})

test("stand-down and mission completion have bounded lifetimes; absent and tight chrome is safe", () => {
  const w = fresh()
  for (const age of [-1, 0, 12, 60, 89, 90]) {
    w.stoodDownAt = 200; w.ticks = 200 + age
    const r = recording(); D.drawEventBanner(r.ctx, w, pal)
    assert.equal(r.texts.length > 0, age >= 0 && age < 90)
    assert.equal(D.skyNoticeAmount(w, pal) > 0, age > 0 && age < 90)
  }
  w.stoodDownAt = -1; w.ticks = 200
  for (const done of [false, true]) for (const withSpecial of [false, true]) {
    w.mission = mission(done); w.special = withSpecial ? w.specialSpec.id : null
    const r = recording(); D.drawSkyMission(r.ctx, w, pal)
    assert.equal(r.texts.length, 1)
    assert.ok(r.texts[0].text.startsWith(done ? "MISSION COMPLETE" : "MISSION:"))
  }
  w.ticks = 240
  assert.equal(D.skyMissionAlpha(w), 0)
  const r = recording(); D.drawSkyMission(r.ctx, w, pal); assert.equal(r.texts.length, 0)
  w.mission = null; D.drawMission(r.ctx, w, pal)
  w.special = null; D.drawSpecialCard(r.ctx, w, pal)
  w.special = "unknown"; w.specialSpec = null; D.drawSpecialCard(r.ctx, w, pal)
  assert.equal(r.texts.length, 0)
  w.specialSpec = { id: "unknown", name: "???", robe: pal.warn, hair: pal.warn }
  D.drawSpecialCard(r.ctx, w, pal)
  assert.equal(r.texts.at(-1).text, "")
  w.k = { ...w.k, COLS: 20 }; w.hatch.x = 10; w.mission = mission()
  const tight = recording()
  D.drawSpecialCard(tight.ctx, w, pal); D.drawSkyMission(tight.ctx, w, pal)
  D.drawSkyNotice(tight.ctx, w, pal, { age: 12, left: 30 })
  assert.equal(tight.texts.length, 0)
  const fitted = recording()
  assert.equal(D.skyFitText(fitted.ctx, "too long", 1), "")
  assert.equal(D.skyFitText(fitted.ctx, "two", 30), "two")
})
