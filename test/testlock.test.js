import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawn } from "node:child_process"
import { STALE_MS, stale, ticketName, myTurn, take, release, status, lockDir } from "../tools/testlock.js"

// tools/testlock.js: one heavy run at a time across worktrees, first come
// first served, and nothing left wedged by a run that died.
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "testlock-")); fs.mkdirSync(path.join(d, "queue")); return d }
const entry = (pid, extra = {}) => JSON.stringify({ owner: "x", pid, host: os.hostname(), cmd: "c", start: "s", ...extra })

test("the lock lives in the git common dir, so every worktree shares it", () => {
  const dir = lockDir()
  assert.match(dir, /\.git[\\/]testlock$/)
})

test("tickets sort by arrival; the first in line gets the lock when it is free, and only one taker wins", () => {
  const dir = tmp()
  const a = ticketName(1000, process.pid), b = ticketName(2000, process.pid)
  assert.ok(a < b)
  fs.writeFileSync(path.join(dir, "queue", b), entry(process.pid))
  fs.writeFileSync(path.join(dir, "queue", a), entry(process.pid))
  assert.equal(myTurn(dir, b), false, "not first")
  assert.equal(myTurn(dir, a), true)
  assert.equal(take(dir, entry(process.pid)), true)
  assert.equal(take(dir, entry(process.pid)), false, "O_EXCL: the second taker loses")
  fs.unlinkSync(path.join(dir, "queue", a))
  assert.equal(myTurn(dir, b), false, "first now, but the lock is held")
  assert.match(status(dir), /^held by x \(pid \d+\)/)
  release(dir, process.pid + 1)
  assert.ok(fs.existsSync(path.join(dir, "lock")), "only the holder releases")
  release(dir, process.pid)
  assert.equal(myTurn(dir, b), true)
})

test("a dead or silent holder is cleared; a live one is not", () => {
  const dir = tmp(), lock = path.join(dir, "lock")
  fs.writeFileSync(lock, entry(process.pid))
  assert.equal(stale(lock), false, "alive and beating")
  fs.writeFileSync(lock, entry(2147483646))
  assert.equal(stale(lock), true, "its process is gone")
  fs.writeFileSync(lock, entry(process.pid, { host: "another-machine" }))
  const old = new Date(Date.now() - STALE_MS - 1000); fs.utimesSync(lock, old, old)
  assert.equal(stale(lock), true, "nobody has touched it for STALE_MS")
  const t = ticketName(1, process.pid)
  fs.writeFileSync(path.join(dir, "queue", t), entry(process.pid))
  assert.equal(myTurn(dir, t), true, "the stale lock was cleared")
})

test("two runs at once take turns: the second starts after the first ends", { timeout: 30000 }, async () => {
  const dir = tmp(), log = path.join(dir, "log")
  const one = (name, ms) => new Promise(resolve => {
    const script = `const fs=require("fs");fs.appendFileSync(${JSON.stringify(log)},"start ${name}\\n");setTimeout(()=>{fs.appendFileSync(${JSON.stringify(log)},"end ${name}\\n")},${ms})`
    const p = spawn(process.execPath, ["tools/testlock.js", "run", "--", process.execPath, "-e", script], { env: { ...process.env, TESTLOCK_DIR: dir, TESTLOCK_HELD: "" }, stdio: "ignore" })
    p.on("exit", resolve)
  })
  const first = one("a", 1200)
  await new Promise(r => setTimeout(r, 300))
  const codes = await Promise.all([first, one("b", 100)])
  assert.deepEqual(codes, [0, 0])
  assert.deepEqual(fs.readFileSync(log, "utf8").trim().split("\n"), ["start a", "end a", "start b", "end b"])
  assert.equal(status(dir), "free")
})
