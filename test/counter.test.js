import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import { MAX_REPORTS_PER_MINUTE, MAX_SAVED_PER_REPORT, parseSaveReport } from "../src/counter.js"

test("accepts a bounded rescue report", () => {
  assert.deepEqual(parseSaveReport({ eventId: "level_42_abcdefghijkl", saved: 17 }), {
    eventId: "level_42_abcdefghijkl",
    saved: 17
  })
})

test("rejects malformed and abusive reports", () => {
  assert.equal(parseSaveReport(null), null)
  assert.equal(parseSaveReport({ eventId: "short", saved: 4 }), null)
  assert.equal(parseSaveReport({ eventId: "abcdefghijklmnop", saved: 0 }), null)
  assert.equal(parseSaveReport({ eventId: "abcdefghijklmnop", saved: MAX_SAVED_PER_REPORT + 1 }), null)
  assert.equal(parseSaveReport({ eventId: "abcdefghijklmnop", saved: 2.5 }), null)
})

test("accepts a full batch of five levels", () => {
  assert.deepEqual(parseSaveReport({ eventId: "batch_abcdefghijkl", saved: 90 }), {
    eventId: "batch_abcdefghijkl",
    saved: 90
  })
})

test("rate limit leaves room for normal batch retries", () => {
  assert.equal(MAX_REPORTS_PER_MINUTE, 8)
})

// The bound in the schema and the bound in the code are the same bound, and
// they drifted: 0001 was written when a report was one level and capped `saved`
// at 30, batching raised MAX_SAVED_PER_REPORT to 90, and for as long as the two
// disagreed the Worker accepted reports the database then refused. Every batch
// of three or more levels was lost that way. There is no way to import a JS
// constant into a .sql file, so the guard is this test.
test("the schema accepts every report the validator does", () => {
  const migrations = fs.readdirSync(new URL("../migrations/", import.meta.url))
    .filter(f => f.endsWith(".sql")).sort()
  // The live definition is whichever migration last rebuilt the table.
  let bound = null
  for (const file of migrations) {
    const sql = fs.readFileSync(new URL(`../migrations/${file}`, import.meta.url), "utf8")
    const match = [...sql.matchAll(/saved\s+INTEGER\s+NOT\s+NULL\s+CHECK\s*\(\s*saved\s+BETWEEN\s+1\s+AND\s+(\d+)\s*\)/gi)].pop()
    if (match) bound = Number(match[1])
  }
  assert.ok(bound !== null, "no rescue_events.saved CHECK found in migrations/")
  assert.strictEqual(bound, MAX_SAVED_PER_REPORT,
    `schema caps saved at ${bound} but the Worker accepts up to ${MAX_SAVED_PER_REPORT}`)
})
