import test from "node:test"
import assert from "node:assert/strict"
import { loadCore } from "../tools/load-core.js"

// The Moderator: every eighth level the guard post is one gunner that takes
// BOSS_HP hits to put down; each hit only staggers it.

const S = loadCore("Sim.js"), D = loadCore("Draw.js")

test("every eighth level (not the Trench) has the boss post, alone", () => {
  for (let lv = 1; lv <= 96; lv++) {
    const w = S.generate(lv, 0, 5)
    if (lv % S.BOSS_EVERY === 0 && !w.submerged) {
      assert.ok(w.bossPost, `level ${lv}`)
      assert.deepEqual(w.enemyRoster, ["gun"])
      assert.ok(w.enemyHatch)
    } else assert.ok(!w.bossPost, `level ${lv}`)
  }
})

test("the boss takes BOSS_HP hits, staggering on each but the last", () => {
  const w = S.generate(8, 0, 5)
  const en = S.spawnEnemy(w, "gun")
  w.enemies = [en]
  assert.equal(en.boss, true)
  assert.equal(en.hp, S.BOSS_HP)
  for (let hit = 1; hit < S.BOSS_HP; hit++) {
    w.ticks = hit * 10
    S.killEnemy(w, en)
    assert.ok(!en.gone)
    assert.equal(en.hp, S.BOSS_HP - hit)
    assert.equal(en.state, "recover")
    assert.equal(en.hurtAt, w.ticks)
  }
  S.killEnemy(w, en)
  assert.ok(en.gone)
  assert.equal(w.enemiesKilled, 1)
  assert.match(D.battleLine(w), /^THE MODERATOR DOWN/)
})

test("an ordinary guard is still one hit", () => {
  const w = S.generate(5, 0, 5)
  const en = S.spawnEnemy(w, "gun")
  assert.ok(!en.boss)
  S.killEnemy(w, en)
  assert.ok(en.gone)
})
