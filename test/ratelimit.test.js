// The Worker's real SQL on a real SQLite (node:sqlite) with both migrations
// applied, behind a small stand-in for the D1 API, and a clock that can be
// moved a minute at a time: how many rate-limit rows outlive their minute,
// and that the quota and the event-id dedupe still hold while they go.
import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import { DatabaseSync } from "node:sqlite"
import worker from "../src/worker.js"
import { LIMIT_KEEP_MINUTES, MAX_REPORTS_PER_MINUTE } from "../src/counter.js"

function d1() {
  const db = new DatabaseSync(":memory:")
  for (const f of fs.readdirSync("migrations").sort()) db.exec(fs.readFileSync("migrations/" + f, "utf8"))
  const prepare = sql => {
    const stmt = { sql, args: [],
      bind(...args) { stmt.args = args; return stmt },
      all() { return db.prepare(sql).all(...stmt.args) },
      async first() { return stmt.all()[0] ?? null },
      async run() { return { results: stmt.all() } } }
    return stmt
  }
  return { sqlite: db, prepare,
    async batch(stmts) {
      db.exec("BEGIN")
      try { const out = stmts.map(s => ({ results: s.all() })); db.exec("COMMIT"); return out }
      catch (e) { db.exec("ROLLBACK"); throw e }
    } }
}
const count = (db, table) => db.sqlite.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n
const report = (ip, eventId = "level_42_abcdefghijkl") => new Request("https://oh-no-more-agents.com/api/saves",
  { method: "POST", body: JSON.stringify({ eventId, saved: 1 }), headers: { "CF-Connecting-IP": ip } })

function clock(t) {
  let now = Date.UTC(2026, 9, 15)
  t.mock.method(Date, "now", () => now)
  return { tick() { now += 60000 } }
}

test("a minute's quota still holds: eight reports, then 429", async t => {
  clock(t)
  const db = d1(), env = { DB: db, RATE_LIMIT_SALT: "x" }, codes = []
  for (let i = 0; i < MAX_REPORTS_PER_MINUTE + 2; i++) codes.push((await worker.fetch(report("1.2.3.4", "level_42_abcdefgh" + String(i).padStart(4, "0")), env)).status)
  assert.deepEqual(codes, [...Array(MAX_REPORTS_PER_MINUTE).fill(200), 429, 429])
})

test("old rate-limit buckets are retired as the clock moves; the dedupe history is kept", async t => {
  const c = clock(t), db = d1(), env = { DB: db, RATE_LIMIT_SALT: "x" }
  for (let m = 0; m < 1001; m++) {
    assert.equal((await worker.fetch(report("1.2.3.4"), env)).status, 200)
    c.tick()
  }
  const stats = db.sqlite.prepare("SELECT total_saved, reports FROM rescue_stats").get()
  assert.deepEqual({ ...stats }, { total_saved: 1, reports: 1 }, "one event counted once across 1001 minutes")
  assert.equal(count(db, "rescue_events"), 1)
  assert.ok(count(db, "submission_limits") <= LIMIT_KEEP_MINUTES + 1, `${count(db, "submission_limits")} rate-limit rows kept`)
})

test("many callers: the table stays about one window of them", async t => {
  const c = clock(t), db = d1(), env = { DB: db, RATE_LIMIT_SALT: "x" }, callers = 20
  for (let m = 0; m < 40; m++) {
    for (let i = 0; i < callers; i++) await worker.fetch(report("10.0.0." + i, `level_${m}_caller${String(i).padStart(6, "0")}`), env)
    c.tick()
  }
  assert.ok(count(db, "submission_limits") <= callers * (LIMIT_KEEP_MINUTES + 1), `${count(db, "submission_limits")} rows`)
  assert.equal(count(db, "rescue_events"), 40 * callers, "every event kept")
})
