import test from "node:test"
import assert from "node:assert/strict"
import { execSync } from "node:child_process"
import { parseArgs, verify } from "../tools/verify-prod.js"

// tools/verify-prod.js against public/ served here: the behaviour checks pass
// on this build, and every write to the counter is refused on the way.
let chromium = true
try { execSync("command -v chromium", { stdio: "ignore" }) } catch { chromium = false }

test("arguments", () => {
  assert.deepEqual(parseArgs([]), { local: false, json: false, previous: null, base: null })
  assert.deepEqual(parseArgs(["--local", "--previous", "abc12345", "--json"]), { local: true, json: true, previous: "abc12345", base: null })
})

test("the behaviour checks pass on this build, read-only", { skip: !chromium && "no chromium", timeout: 120000 }, async () => {
  const r = await verify({ local: true })
  assert.deepEqual(r.problems, [])
  assert.ok(r.blocked > 0, "finishing levels tried to report rescues, and every one was refused")
})

import { filesShipped, imagesServed, openTab, summary } from "../tools/verify-prod.js"
import { serve } from "../tools/phone.js"
import fs from "node:fs"
import path from "node:path"

test("the deploy checks read a served dist/ the way they read production", { skip: !chromium && "no chromium", timeout: 120000 }, async () => {
  execSync("node tools/ship.js", { stdio: "ignore" })
  const dist = path.resolve("dist"), server = await serve({ root: dist, brotli: true })
  const base = `http://127.0.0.1:${server.address().port}/`
  try {
    const srcs = [...fs.readFileSync(path.join(dist, "index.html"), "utf8").matchAll(/<script src="([^"]+)"/g)].map(m => m[1])
    assert.deepEqual(await filesShipped(base, srcs), [], "every script is dist/ byte for byte, brotli")
    const images = await imagesServed(base)
    assert.equal(images.length, 4, "no cache headers on a plain local server: all four reported")
    assert.match(images[0], /^share-1\.png: 200 image\/png undefined$/)
    const tab = await openTab(base, "00000000")
    assert.ok(tab.some(p => /open tab did not reload/.test(p)), "no API here, so nothing tells the tab to reload")
  } finally { server.close() }
  assert.match(summary({ base: "x", problems: [], blocked: 2 }), /^verify passed: x \(2 counter writes refused\)$/)
  assert.match(summary({ base: "x", problems: ["a"] }), /^verify FAILED:\n  a$/)
})
