import test from "node:test"
import assert from "node:assert/strict"
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
