import test from "node:test"
import assert from "node:assert/strict"
import crypto from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { lean, lineStarts, SRC } from "../tools/ship.js"
import { loadCoreFrom } from "../tools/load-core.js"
import { frame } from "../tools/render.js"

// tools/ship.js: what goes on the wire is the source minus comment lines and
// indentation, and it behaves byte for byte the same.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ship-"))
for (const name of ["Sim.js", "Draw.js", "Palette.js", "Outcome.js"])
  fs.writeFileSync(path.join(dir, name), lean(fs.readFileSync(path.join(SRC, "agents", name), "utf8")))
const AGENTS = path.join(SRC, "agents")
const shipped = name => loadCoreFrom(dir, name, path.join(AGENTS, name))
const source = name => loadCoreFrom(AGENTS, name)

// One frame with page Math.random pinned, as tools/compare.js does.
function picture(load, opts) {
  const S = load("Sim.js"), D = load("Draw.js"), P = load("Palette.js"), random = Math.random
  let x = 0.5
  Math.random = () => (x = (x * 9301 + 49297) % 233280 / 233280)
  try { return frame(S, D, P, { ...opts, res: 2, theme: "tokyo-night" }).img }
  finally { Math.random = random }
}

test("comment lines and indentation go; strings, templates and regexes stay as written", () => {
  const src = [
    "// a comment line",
    "    var a = 1   // trailing comments stay",
    "  var s = \"// not a comment\"",
    "var t = `line one",
    "  // inside a template: kept",
    "  ${a}`",
    "var r = /\\/\\/[\"'`]/g",
    "  /* a block",
    "  // still in it */",
    "var b = a / 2 // division, then a comment",
    ""
  ].join("\n")
  assert.deepEqual(lineStarts(src), [true, true, true, true, false, false, true, true, false, true, true])
  assert.equal(lean(src), [
    "var a = 1   // trailing comments stay",
    "var s = \"// not a comment\"",
    "var t = `line one",
    "  // inside a template: kept",
    "  ${a}`",
    "var r = /\\/\\/[\"'`]/g",
    "/* a block",
    "  // still in it */",
    "var b = a / 2 // division, then a comment",
    ""
  ].join("\n"))
})

test("every page script scans cleanly to the end and keeps the same exported names", () => {
  for (const name of fs.readdirSync(AGENTS).filter(n => n.endsWith(".js"))) {
    const src = fs.readFileSync(path.join(AGENTS, name), "utf8")
    assert.doesNotThrow(() => lineStarts(src), name)
    const names = s => [...s.matchAll(/^\s*function\s+(\w+)/gm)].map(m => m[1]).join(",")
    assert.equal(names(lean(src)), names(src), name)
  }
})

test("the shipped Sim plays out exactly like the source", () => {
  const A = source("Sim.js"), B = shipped("Sim.js")
  for (const level of [1, 6, 9, 14, 21, 38, 57, 84, 101, 138]) {
    const a = A.generate(level, 0, level * 7919), b = B.generate(level, 0, level * 7919)
    while (!a.done && a.ticks < 6000) A.step(a)
    while (!b.done && b.ticks < 6000) B.step(b)
    const digest = w => JSON.stringify([w.saved, w.lost, w.ticks, w.agents.map(g => [g.id, g.state, g.x, g.y])])
    assert.equal(digest(b), digest(a), "level " + level)
  }
})

test("the shipped Draw paints the same bytes in every biome", () => {
  const S = source("Sim.js"), seen = new Set(), levels = []
  for (let level = 1; level <= 60 && levels.length < 20; level++) {
    const biome = S.generate(level, 0, 1).biome
    if (!seen.has(biome)) { seen.add(biome); levels.push(level) }
  }
  assert.equal(levels.length, 19, "one level per biome")
  const hash = img => crypto.createHash("sha1").update(img.data || img.buf || img.pixels).digest("hex")
  for (const level of levels) {
    const opts = { level, seed: 4242, ticks: 300 }
    assert.equal(hash(picture(shipped, opts)), hash(picture(source, opts)), "level " + level)
  }
})

test("build: a full copy of the page with every script shipped lean and passing node --check", async () => {
  const { build } = await import("../tools/ship.js")
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "ship-out-"))
  try {
    const sizes = build(SRC, out)
    assert.ok(fs.existsSync(path.join(out, "index.html")))
    const sim = sizes.find(s => s.name === "Sim.js")
    assert.ok(sim.after < sim.before * 0.7, "Sim.js loses its prose")
    assert.equal(fs.readFileSync(path.join(out, "agents", "Sim.js"), "utf8"), lean(fs.readFileSync(path.join(AGENTS, "Sim.js"), "utf8")))
  } finally { fs.rmSync(out, { recursive: true, force: true }) }
})
