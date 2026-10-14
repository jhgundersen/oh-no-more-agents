import test from "node:test"
import assert from "node:assert/strict"
import { loadCore } from "../tools/load-core.js"
import { canvas, themeOf } from "../tools/render.js"

// The report card's last line: the level as a git commit. See commitLine.
const S = loadCore("Sim.js"), D = loadCore("Draw.js"), P = loadCore("Palette.js")
const base = () => Object.assign(S.generate(1, 0, 1), { saved: 12, toRelease: 15, lost: 3, done: true,
  hallucinations: 0, rateLimited: 0, hazardKills: 0, brollyLandings: 0, eventLog: [], agiHome: false, agiLost: false, nuking: false })

test("the type follows the outcome", () => {
  assert.match(D.commitLine({ ...base(), saved: 15 }), /^[0-9A-F]{7} FEAT: SHIP ALL 15 AGENTS HOME$/)
  assert.match(D.commitLine(base()), / FIX: 12\/15 AGENTS WENT HOME$/)
  assert.match(D.commitLine({ ...base(), saved: 0 }), / REVERT: 0\/15/)
  assert.match(D.commitLine({ ...base(), nuking: true }), / HOTFIX: 12\/15/)
})

test("up to two notes, most interesting first, and the 429 as an issue number", () => {
  const w = { ...base(), agiLost: true, hallucinations: 3, rateLimited: 5 }
  const line = D.commitLine(w)
  assert.match(line, /; AGI POSTPONED/)
  assert.match(line, /\(#429\)$/)
  assert.match(D.commitLine({ ...base(), hazardKills: 2, brollyLandings: 1 }), /; 2 LOST IN PROD, 1 UMBRELLA$/)
  assert.match(D.commitLine({ ...base(), hallucinations: 3, hazardKills: 2 }), /; 3 HALLUCINATED AN EXIT$/, "a second note that does not fit is left off")
  assert.match(D.commitLine({ ...base(), brollyLandings: 1 }), /; 1 UMBRELLA$/)
  assert.match(D.commitLine({ ...base(), eventLog: ["thaw"] }), /SCOPE CHANGED MID-SPRINT/)
})

test("deterministic, never longer than the plate, and every character has a glyph", () => {
  for (let level = 1; level <= 30; level++) {
    const w = S.generate(level, 0, level * 31)
    while (!w.done) S.step(w)
    const line = D.commitLine(w)
    assert.equal(D.commitLine(w), line)
    assert.ok(line.length <= D.COMMIT_MAX, line)
    for (const ch of line) assert.ok(D.TRANSITION_GLYPHS[ch], `glyph ${JSON.stringify(ch)} in ${line}`)
  }
  const worst = { ...base(), saved: 123, toRelease: 456, agiLost: true, hallucinations: 99, hazardKills: 99, brollyLandings: 99, rateLimited: 9, eventLog: ["x"] }
  assert.ok(D.commitLine(worst).length <= D.COMMIT_MAX)
  assert.notEqual(D.commitHash(base()), D.commitHash({ ...base(), saved: 11 }), "the hash follows the outcome")
})

test("it is the last row on the card and is drawn inside the plate", () => {
  const pal = P.build(themeOf("tokyo-night").theme, 1), w = { ...base(), doneTicks: 20 }
  const rows = D.reportRows(w, pal)
  assert.equal(rows.at(-1).text, D.commitLine(w))
  const img = canvas(400, 248), xs = []
  const fill = img.ctx.fillRect.bind(img.ctx)
  img.ctx.fillRect = (x, y, a, b) => { if (img.ctx.fillStyle === pal.decor) xs.push(x, x + a); fill(x, y, a, b) }
  D.drawLevelResults(img.ctx, w, pal)
  assert.ok(xs.length > 0)
  assert.ok(Math.min(...xs) >= 200 - 136 && Math.max(...xs) <= 200 + 136, "inside the plate")
})
