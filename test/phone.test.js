import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import { judge, parseArgs, print, VIEWS } from "../tools/phone.js"

// tools/phone.js: the judgement and the report. The browser half needs
// Chromium and is exercised by running `npm run phone`.
const phone = VIEWS.find(v => v.name === "portrait"), desk = VIEWS.find(v => v.name === "desktop")
const fine = { viewport: { w: 390, h: 844 }, scrollWidth: 390, board: { y: 200, h: 248 }, stage: { y: 150, h: 600 }, small: [], hoverOnly: [] }

test("a page that fits a thumb passes", () => assert.deepEqual(judge(fine, phone), []))

test("each thing a thumb runs into is named", () => {
  const notes = judge({ ...fine, scrollWidth: 420, small: [{ id: "c-pause", w: 60, h: 30 }],
    board: { y: 700, h: 248 }, stage: { y: 100, h: 900 }, hoverOnly: [".menu:hover .sub"] }, phone)
  assert.ok(notes.some(n => /scrolls sideways/.test(n)))
  assert.ok(notes.some(n => /small target #c-pause: 60×30/.test(n)))
  assert.ok(notes.some(n => /board ends below the fold/.test(n)))
  assert.ok(notes.some(n => /game runs below the fold/.test(n)))
  assert.ok(notes.some(n => /hover-only UI/.test(n)))
})

test("the desktop is not held to phone sizes", () => {
  assert.deepEqual(judge({ ...fine, viewport: { w: 1280, h: 900 }, scrollWidth: 1280, small: [{ id: "x", w: 30, h: 30 }], stage: { y: 0, h: 2000 } }, desk), [])
})

test("arguments and the printed report", () => {
  assert.deepEqual(parseArgs([]), { out: "shots", json: false })
  assert.deepEqual(parseArgs(["--out", "x", "--json"]), { out: "x", json: true })
  const lines = [], report = [{ view: "portrait", file: "a.png", notes: [] }, { view: "landscape", file: "b.png", notes: ["small target #x: 1×1"] }]
  assert.equal(print(report, [], { json: false }, l => lines.push(l)), true, "small targets are advice, not failure")
  assert.match(lines[0], /portrait +a\.png\n  fine/)
  assert.equal(print([{ ...report[0], notes: ["scrolls sideways: 420px in 390px"] }], [], { json: false }, () => {}), false)
  assert.equal(print(report, ["boom"], { json: false }, l => lines.push(l)), false)
  const json = []
  print(report, [], { json: true }, l => json.push(l))
  assert.equal(JSON.parse(json[0]).report.length, 2)
})

test("the landscape layout is phone-only: coarse pointer, on its side, short", () => {
  const html = fs.readFileSync(new URL("../public/index.html", import.meta.url), "utf8")
  assert.match(html, /@media \(pointer: coarse\) and \(orientation: landscape\) and \(max-height: 500px\)/)
})

test("the local server serves the page and refuses what is not there", async () => {
  const { serve } = await import("../tools/phone.js")
  const server = await serve(), base = `http://127.0.0.1:${server.address().port}`
  try {
    const page = await fetch(base + "/?x=1")
    assert.equal(page.status, 200)
    assert.match(page.headers.get("content-type"), /text\/html/)
    assert.equal((await fetch(base + "/agents/Sim.js")).headers.get("content-type"), "text/javascript")
    assert.equal((await fetch(base + "/nope.txt")).status, 404)
    assert.equal((await fetch(base + "/agents")).status, 404, "a directory is not a file")
  } finally { server.close() }
})

import { execSync } from "node:child_process"
import os from "node:os"
import path from "node:path"
const chromium = (() => { try { execSync("command -v chromium", { stdio: "ignore" }); return true } catch { return false } })()

test("end to end in Chromium: a phone view is captured and measured", { skip: !chromium && "no chromium", timeout: 60000 }, async () => {
  const { serve, browser, capture, VIEWS } = await import("../tools/phone.js")
  const server = await serve(), b = await browser(), out = fs.mkdtempSync(path.join(os.tmpdir(), "phone-test-"))
  try {
    const r = await capture(b, VIEWS[1], `http://127.0.0.1:${server.address().port}/`, out)
    assert.equal(r.view, "landscape")
    assert.ok(fs.statSync(r.file).size > 1000)
    assert.equal(r.metrics.viewport.w, 844)
    assert.deepEqual(r.notes, [], "the landscape layout fits a thumb")
  } finally { await b.close(); server.close(); fs.rmSync(out, { recursive: true, force: true }) }
})
