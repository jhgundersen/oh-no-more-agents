import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { parseArgs, checkout, render, diffBox, window, compose } from "../tools/compare.js"
import { canvas } from "../tools/render.js"

// tools/compare.js: two refs, one level, one labelled PNG.
test("arguments: ref and level, with the defaults the page uses", () => {
  const o = parseArgs(["codex/x", "8"])
  assert.equal(o.ref, "codex/x"); assert.equal(o.level, 8); assert.equal(o.base, "main")
  assert.equal(o.seed, 8 * 7919 + 13); assert.equal(o.ticks, 400)
  assert.match(o.out, /compare-codex_x-8\.png$/)
  assert.deepEqual([parseArgs(["r", "3", "--seed", "5", "--ticks", "9", "--base", "HEAD"]).seed, parseArgs(["r", "3", "--ticks", "9"]).ticks], [5, 9])
  assert.throws(() => parseArgs(["r"]), /usage/)
})

test("the difference is found, and the crop window stays inside the frame", () => {
  const a = canvas(40, 30, "#000000"), b = canvas(40, 30, "#000000")
  assert.equal(diffBox(a, b), null)
  b.buf[(10 * 40 + 35) * 3] = 255
  assert.deepEqual(diffBox(a, b), { x0: 35, y0: 10, x1: 35, y1: 10 })
  assert.deepEqual(window(a, diffBox(a, b), 20, 20), { x: 20, y: 0 })
  assert.deepEqual(window(a, null, 20, 10), { x: 10, y: 10 })
})

test("end to end from git objects: the same ref twice renders identically, and composes", () => {
  const dir = checkout("HEAD")
  try {
    assert.ok(fs.existsSync(path.join(dir, "Draw.js")))
    const opts = { level: 3, seed: 7, ticks: 60, base: "HEAD", ref: "HEAD" }
    const a = render(dir, opts), b = render(dir, opts)
    assert.equal(diffBox(a.img, b.img), null, "seeded: deterministic")
    const { img, box } = compose(a.img, b.img, opts, a.D)
    assert.equal(box, null)
    assert.equal(img.W, a.img.W * 2 + 8)
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})

test("--out may be a directory: the file goes inside it", async () => {
  const { outPath } = await import("../tools/compare.js")
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-out-"))
  try {
    assert.equal(outPath({ out: dir, ref: "codex/clock tower", level: 16 }), path.join(dir, "codex_clock_tower-L16.png"))
    assert.equal(outPath({ out: "shots/new/", ref: "a", level: 2 }), path.join("shots/new", "a-L2.png"))
    assert.equal(outPath({ out: path.join(dir, "x.png"), ref: "a", level: 2 }), path.join(dir, "x.png"))
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})
