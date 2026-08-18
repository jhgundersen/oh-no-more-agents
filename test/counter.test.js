import test from "node:test"
import assert from "node:assert/strict"
import { MAX_REPORTS_PER_MINUTE, parseSaveReport } from "../src/counter.js"

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
  assert.equal(parseSaveReport({ eventId: "abcdefghijklmnop", saved: 31 }), null)
  assert.equal(parseSaveReport({ eventId: "abcdefghijklmnop", saved: 2.5 }), null)
})

test("rate limit leaves room for normal level completion retries", () => {
  assert.equal(MAX_REPORTS_PER_MINUTE, 8)
})
