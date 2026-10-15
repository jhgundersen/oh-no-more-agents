#!/usr/bin/env node
// One heavy test run at a time across every worktree of this repo. The full
// check, coverage and the CRAP report each take the machine for a minute or
// more; two at once (the loop's and Codex's, from their own worktrees) slowed
// both and interrupted each other's final checks. This is the queue they share.
//
//   node tools/testlock.js run -- <command ...>   wait your turn, run, release
//   node tools/testlock.js status                 who holds it, who is waiting
//
// npm run check / coverage / crap go through it. A run started from inside a
// locked run (crap runs coverage) passes straight through: the environment
// says the lock is already held.
//
// Where: <git common dir>/testlock/, which every worktree of the repo shares.
// `lock` is the holder (owner, pid, command, start), created with O_EXCL so
// only one process can win it. `queue/` has one ticket per waiter, named by
// arrival time, so turns are first come, first served. Holder and waiters
// touch their file every few seconds; a file nobody has touched for STALE_MS,
// or whose pid is gone on this machine, is a crashed run and is cleared.

import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { execFileSync, spawn } from "node:child_process"
import { fileURLToPath } from "node:url"

export const STALE_MS = 90000       // no heartbeat for this long: the run is gone
const BEAT_MS = 5000                // how often holder and waiters prove they are alive
const POLL_MS = 1000
const SAY_MS = 30000                // how often a waiter says who it is waiting for
const HELD = "TESTLOCK_HELD"

export function lockDir(cwd = process.cwd()) {
  if (process.env.TESTLOCK_DIR) return process.env.TESTLOCK_DIR      // tests
  const common = execFileSync("git", ["rev-parse", "--git-common-dir"], { cwd, encoding: "utf8" }).trim()
  return path.join(path.resolve(cwd, common), "testlock")
}

function alive(pid) {
  try { process.kill(pid, 0); return true } catch (e) { return e.code === "EPERM" }
}

// A lock or ticket left behind by a run that died: its heartbeat has stopped,
// or it was ours (this host) and its process is gone.
export function stale(file, now = Date.now()) {
  let st, info
  try { st = fs.statSync(file); info = JSON.parse(fs.readFileSync(file, "utf8")) } catch { return true }
  if (now - st.mtimeMs > STALE_MS) return true
  return info.host === os.hostname() && !alive(info.pid)
}

export function ticketName(now, pid) { return String(now).padStart(15, "0") + "-" + pid + ".json" }

// Clear the dead, then: is it this ticket's turn, and is the lock free?
export function myTurn(dir, ticket, now = Date.now()) {
  const queue = path.join(dir, "queue"), lock = path.join(dir, "lock")
  for (const t of fs.readdirSync(queue)) if (t !== ticket && stale(path.join(queue, t), now)) rm(path.join(queue, t))
  if (fs.existsSync(lock) && stale(lock, now)) rm(lock)
  const first = fs.readdirSync(queue).sort()[0]
  return first === ticket && !fs.existsSync(lock)
}

function rm(file) { try { fs.unlinkSync(file) } catch { /* someone else cleared it */ } }

function record(cmd) {
  return JSON.stringify({ owner: path.basename(process.cwd()), pid: process.pid, host: os.hostname(), cmd: cmd.join(" "), start: new Date().toISOString() })
}

// O_EXCL: of everyone who saw the lock free, exactly one creates it.
export function take(dir, body) {
  try { fs.writeFileSync(path.join(dir, "lock"), body, { flag: "wx" }); return true } catch { return false }
}

export function release(dir, pid = process.pid) {
  const lock = path.join(dir, "lock")
  try { if (JSON.parse(fs.readFileSync(lock, "utf8")).pid === pid) rm(lock) } catch { /* not ours, or gone */ }
}

function touch(file) { try { const t = new Date(); fs.utimesSync(file, t, t) } catch { /* cleared */ } }

export function status(dir) {
  const lock = path.join(dir, "lock"), queue = path.join(dir, "queue"), lines = []
  if (fs.existsSync(lock)) { const l = JSON.parse(fs.readFileSync(lock, "utf8")); lines.push(`held by ${l.owner} (pid ${l.pid}) since ${l.start}: ${l.cmd}`) }
  else lines.push("free")
  if (fs.existsSync(queue)) for (const t of fs.readdirSync(queue).sort()) {
    try { const q = JSON.parse(fs.readFileSync(path.join(queue, t), "utf8")); lines.push(`  waiting: ${q.owner} (pid ${q.pid}): ${q.cmd}`) } catch { /* gone */ }
  }
  return lines.join("\n")
}

export async function run(cmd, { dir = lockDir(), say = console.error } = {}) {
  if (process.env[HELD]) return exec(cmd)
  fs.mkdirSync(path.join(dir, "queue"), { recursive: true })
  const ticket = ticketName(Date.now(), process.pid), mine = path.join(dir, "queue", ticket)
  fs.writeFileSync(mine, record(cmd))
  const body = record(cmd)
  let said = 0
  const cleanup = () => { rm(mine); release(dir) }
  const bail = sig => { cleanup(); process.exit(sig === "SIGINT" ? 130 : 143) }
  process.on("SIGINT", bail); process.on("SIGTERM", bail)
  try {
    for (let waited = 0; !(myTurn(dir, ticket) && take(dir, body)); waited += POLL_MS) {
      if (waited % BEAT_MS === 0) touch(mine)
      if (waited - said >= SAY_MS || waited === 0) { said = waited; say("testlock: waiting — " + status(dir).split("\n").join("; ")) }
      await new Promise(r => setTimeout(r, POLL_MS))
    }
    rm(mine)
    const beat = setInterval(() => touch(path.join(dir, "lock")), BEAT_MS)
    try { return await exec(cmd) } finally { clearInterval(beat) }
  } finally { cleanup() }
}

function exec(cmd) {
  return new Promise(resolve => {
    const child = spawn(cmd[0], cmd.slice(1), { stdio: "inherit", env: { ...process.env, [HELD]: "1" } })
    child.on("exit", (code, signal) => resolve(code === null ? (signal === "SIGINT" ? 130 : 1) : code))
  })
}

async function main(argv) {
  if (argv[0] === "status") { console.log(status(lockDir())); return }
  const at = argv.indexOf("--")
  if (argv[0] !== "run" || at < 0 || at === argv.length - 1) {
    console.error("usage: node tools/testlock.js run -- <command ...> | status"); process.exitCode = 2; return
  }
  process.exitCode = await run(argv.slice(at + 1))
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2))
