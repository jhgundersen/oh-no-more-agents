import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import vm from "node:vm"
import { loadCore } from "../tools/load-core.js"
import { canvas } from "../tools/render.js"

// season.js: a seasonal coat of paint, by the viewer's date or ?season=, that
// never touches the simulation.
const source = fs.readFileSync(new URL("../public/agents/season.js", import.meta.url), "utf8")
function loadSeason(search = "", date = new Date(2026, 5, 1)) {
  class FixedDate extends Date { constructor() { super(date.getTime()) } }
  const sandbox = { window: { location: { search } }, Date: FixedDate, Object, Math, String }
  vm.runInNewContext(source, sandbox)
  return sandbox.window.AgentSeason
}
const S = loadCore("Sim.js"), D = loadCore("Draw.js"), P = loadCore("Palette.js")

test("Halloween runs Oct 24 to Nov 1 by the local date; ?season= previews it or forces it off", () => {
  const { pick } = loadSeason()
  assert.equal(pick("", new Date(2026, 9, 23)), null)
  assert.equal(pick("", new Date(2026, 9, 24)), "halloween")
  assert.equal(pick("", new Date(2026, 10, 1)), "halloween")
  assert.equal(pick("", new Date(2026, 10, 2)), null)
  assert.equal(pick("?season=halloween", new Date(2026, 5, 1)), "halloween")
  assert.equal(pick("?season=none", new Date(2026, 9, 31)), null)
  for (const q of ["?season=HALLOWEEN", "?season=halloween2", "?season=constructor", "?season=__proto__", "?season=", "?seasons=halloween"])
    assert.equal(pick(q, new Date(2026, 5, 1)), null, q)
  assert.equal(loadSeason("?season=halloween").name, "halloween")
  assert.equal(loadSeason("").name, null)
})

test("the dressing is display-only: a dressed colony plays out exactly like a plain one", () => {
  const season = loadSeason("?season=halloween")
  const plain = S.generate(14, 0, 777), dressed = S.generate(14, 0, 777)
  const img = canvas(800, 496, "#000")
  while (!plain.done) {
    S.step(plain); S.step(dressed)
    season.dress(dressed); season.paint(img.ctx, dressed)
  }
  const strip = w => JSON.stringify(w.agents.map(a => [a.id, a.state, a.x, a.y]).concat([w.saved, w.lost, w.ticks]))
  assert.equal(strip(dressed), strip(plain))
  assert.ok(dressed.season && dressed.seasonLanterns.length > 0)
})

test("a death leaves a ghost and a pun on the ticker; the card says trick or treat", () => {
  const season = loadSeason("?season=halloween")
  const w = S.generate(3, 0, 5); while (w.agents.length < 3) S.step(w)
  season.dress(w)
  Object.assign(w.agents[1], { state: "dead", gone: true }); w.lost = 1
  season.paint(canvas(800, 496, "#000").ctx, w)
  assert.equal(w.seasonGhosts.length, 1)
  assert.match(w.season.note.text, /^AGENT 00\d (WAS GHOSTED|IS NOW A BACKGROUND PROCESS|404: BODY NOT FOUND|WENT TO THE GREAT \/DEV\/NULL)$/)
  const pal = season.tint(P.build({ background: "#1a1b26", foreground: "#c0caf5", accent: "#7aa2f7", urgent: "#f7768e", muted: "#565f89" }, 3))
  assert.equal(pal.decorLit, "#ff8a1e")
  assert.equal(D.homeTitle(w), "TRICK OR TREAT: 0 / " + w.toRelease + " HOME")
  assert.equal(D.homeTitle(S.generate(3, 0, 5)), "0 / " + w.toRelease + " HOME", "no season, no greeting")
})

test("Christmas runs Dec 1 to 26; ?season=christmas previews it", () => {
  const { pick } = loadSeason()
  assert.equal(pick("", new Date(2026, 10, 30)), null)
  assert.equal(pick("", new Date(2026, 11, 1)), "christmas")
  assert.equal(pick("", new Date(2026, 11, 26)), "christmas")
  assert.equal(pick("", new Date(2026, 11, 27)), null)
  assert.equal(pick("?season=christmas", new Date(2026, 5, 1)), "christmas")
  assert.equal(pick("?season=none", new Date(2026, 11, 24)), null)
})

test("Christmas: HO HO HOME on the card, a festive line for the first one home, snow and a wrapped exit, and the colony unchanged", () => {
  const season = loadSeason("?season=christmas")
  const plain = S.generate(17, 0, 99), dressed = S.generate(17, 0, 99)
  const img = canvas(800, 496, "#000"), notes = []
  while (!plain.done) {
    S.step(plain); S.step(dressed)
    season.dress(dressed); season.paint(img.ctx, dressed)
    if (dressed.season.note && !notes.includes(dressed.season.note.text)) notes.push(dressed.season.note.text)
  }
  const strip = w => JSON.stringify(w.agents.map(a => [a.id, a.state, a.x, a.y]).concat([w.saved, w.lost, w.ticks]))
  assert.equal(strip(dressed), strip(plain))
  assert.equal(D.homeTitle(dressed), "HO HO HOME: " + dressed.saved + " / " + dressed.toRelease)
  assert.ok(notes.length >= 1)
  assert.match(notes[0], /^(AGENT \d{3}|[A-Z ]+) (IS HOME FOR THE HOLIDAYS|MADE THE NICE LIST|DELIVERED\. NO CHIMNEY REQUIRED)$/)
  assert.ok(notes.length <= 1 + Math.floor(dressed.saved / 5) + dressed.lost, "a line for the first, every fifth, and each loss")
})

test("Christmas hats and candy-striped umbrellas are drawn; without a season, neither", () => {
  const season = loadSeason("?season=christmas")
  const pal = P.build({ background: "#1a1b26", foreground: "#c0caf5", accent: "#7aa2f7", urgent: "#f7768e", muted: "#565f89" }, 3)
  const fills = w => {
    const seen = new Set(), img = canvas(800, 496, "#000")
    const ctx = new Proxy(img.ctx, { get: (t, k) => k === "fillRect" ? ((...a) => { seen.add(t.fillStyle); return t.fillRect(...a) }) : (typeof t[k] === "function" ? t[k].bind(t) : t[k]), set: (t, k, v) => { t[k] = v; return true } })
    D.drawActors(ctx, w, pal, {})
    return seen
  }
  const w = S.generate(3, 0, 5); w.res = 2
  while (w.agents.length < 4) S.step(w)
  // One of them floating, on an umbrella the season stripes.
  const floater = w.agents.find(a => (a.id + (w.colonySeed || 0)) % 3 === 0) || w.agents[0]
  Object.assign(floater, { floater: true, state: "fall", fall: 5, y: floater.y - 6 })
  const plain = fills(w)
  season.dress(w)
  const dressed = fills(w)
  assert.ok(dressed.has("#d42a3c") && !plain.has("#d42a3c"), "santa red: hats and stripes")
  assert.ok(dressed.has("#f4f4ec"), "a white canopy under the stripes")
})
