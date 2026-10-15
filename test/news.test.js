import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import vm from "node:vm"

// news.js: the patch notes and the first-visit tip, remembered when storage
// works and harmless when it does not.
const sandbox = { window: {} }
vm.runInNewContext(fs.readFileSync(new URL("../public/agents/news.js", import.meta.url), "utf8"), sandbox)
const N = sandbox.window.AgentNews

function memory() { const m = new Map(); return { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)) } }
const broken = { getItem() { throw new Error("denied") }, setItem() { throw new Error("denied") } }

test("the notes are short dry lines, newest first, with unique ids", () => {
  assert.ok(N.NEWS.length >= 5 && N.NEWS.length <= 8)
  assert.equal(new Set(N.NEWS.map(n => n.id)).size, N.NEWS.length)
  const dates = [...N.NEWS].map(n => n.id.slice(0, 10))
  assert.deepEqual([...dates].sort().reverse(), dates, "newest first")
  for (const n of N.NEWS) assert.ok(n.text.length <= 100 && /^Added: /.test(n.text), n.text)
})

test("the NEW dot shows until the newest line is seen, and again when a line is added", () => {
  const s = memory()
  assert.equal(N.unseen(s), true)
  N.markSeen(s)
  assert.equal(N.unseen(s), false)
  s.setItem("oh-no-more-agents-news", "an-older-id")
  assert.equal(N.unseen(s), true)
})

test("the tip shows once; without storage everything still works", () => {
  const s = memory()
  assert.equal(N.tipDue(s), true)
  N.tipDone(s)
  assert.equal(N.tipDue(s), false)
  assert.doesNotThrow(() => { N.markSeen(broken); N.tipDone(broken) })
  assert.equal(N.unseen(broken), true)
  assert.equal(N.unseen(null), true)
})

test("the tip goes when its first level is over, or the page moves to another", () => {
  const sb = { window: {} }
  vm.runInNewContext(fs.readFileSync(new URL("../public/agents/news.js", import.meta.url), "utf8"), sb)
  const { tipOver } = sb.window.AgentNews
  assert.equal(tipOver({ level: 4, done: false }), false)
  assert.equal(tipOver({ level: 4, done: true }), true)
  assert.equal(tipOver({ level: 5, done: false }), true)
})
