import test from "node:test"
import assert from "node:assert/strict"
import { loadCore } from "../tools/load-core.js"
import { canvas, themeOf } from "../tools/render.js"

// Backup: deeper down, a guard post that loses a guard radios for more —
// sidearm guards out of the same booth BACKUP_DELAY ticks later.

const S = loadCore("Sim.js"), D = loadCore("Draw.js"), P = loadCore("Palette.js")

test("no backup before the ramp or at a boss post; every ordinary post has it by the end of the ramp", () => {
  for (let lv = 1; lv <= 200; lv++) {
    const w = S.generate(lv, 0, 3)
    if (!w.enemyHatch || w.bossPost || lv < S.BACKUP_FROM) assert.equal(w.reinforcements, 0, `level ${lv}`)
    else if (lv >= S.BACKUP_FROM + S.BACKUP_RAMP) assert.ok(w.reinforcements >= 1, `level ${lv}`)
    assert.ok(w.reinforcements <= 2)
  }
  for (let lv = 1; lv < 400; lv++) assert.equal(S.reinforcementsFor(lv), S.reinforcementsFor(lv), "deterministic")
})

function posted(from) {
  for (let lv = from; ; lv++) {
    const w = S.generate(lv, 0, 3)
    if (w.reinforcements) return w
  }
}

test("a downed guard calls backup, which arrives BACKUP_DELAY ticks later as sidearm guards", () => {
  const w = posted(150), roster = w.enemyRoster.length, more = w.reinforcements
  w.ticks = 100; w.enemiesKilled = 1
  S.callBackup(w)
  assert.equal(w.backupAt, 100 + S.BACKUP_DELAY)
  assert.equal(w.enemyRoster.length, roster)
  w.ticks = w.backupAt - 1; S.callBackup(w)
  assert.equal(w.enemyRoster.length, roster)
  w.ticks = w.backupAt; S.callBackup(w)
  assert.deepEqual(w.enemyRoster.slice(roster), Array(more).fill("gun"))
  assert.equal(w.reinforcements, 0)
  assert.equal(w.feed.at(-1).text, "BACKUP ARRIVES AT THE GUARD POST")
  S.callBackup(w)
  assert.equal(w.enemyRoster.length, roster + more, "only once")
})

test("with nobody down, backup is called at the deadline anyway", () => {
  const w = posted(150)
  w.ticks = S.BACKUP_DEADLINE - 1; S.callBackup(w)
  assert.equal(w.backupAt, 0)
  w.ticks = S.BACKUP_DEADLINE; S.callBackup(w)
  assert.equal(w.backupAt, S.BACKUP_DEADLINE + S.BACKUP_DELAY)
})

test("backup guards walk out of the booth during real play", () => {
  const w = posted(150)
  let arrived = false
  while (!w.done && w.ticks < 9000) { S.step(w); if (w.lastEvent === "backup") arrived = true }
  if (arrived) assert.ok(w.enemyReleased > 1 || w.enemies.length > 1)
})

test("the booth lamp flashes only while backup is on its way, drawing without touching the world", () => {
  const theme = themeOf("tokyo-night"), pal = P.build(theme.theme, 8)
  const w = posted(150)
  const shot = (res, ticks) => {
    w.res = res; w.ticks = ticks
    const img = canvas(400 * res, 248 * res, theme.background)
    img.ctx.setTransform(res, 0, 0, res, 0, 0)
    const before = JSON.stringify(w)
    D.drawEnemyHatch(img.ctx, w, pal, {})
    assert.equal(JSON.stringify(w), before)
    return img.buf
  }
  for (const res of [1, 2]) {
    const quiet = shot(res, 12)
    w.backupAt = 200
    assert.notDeepEqual(shot(res, 12), quiet, "lit")
    assert.notDeepEqual(shot(res, 12), shot(res, 18), "flashing")
    w.done = true
    assert.deepEqual(shot(res, 12), quiet, "dark once the level is over")
    w.done = false; w.backupAt = 0
  }
})
