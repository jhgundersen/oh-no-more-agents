// Levels are addressed by biome, not by number: appending a biome reshuffles
// which biome every level number is (BIOMES[(level - 1) % BIOMES.length]), and
// a test pinned to "level 38 is the Ruins" breaks on the next biome. This finds
// the first level of a biome whose generated world satisfies `pred`.
export function levelWith(S, biome, pred = () => true, seed = 3, tries = 60) {
  const first = S.BIOMES.indexOf(biome) + 1
  if (first < 1) throw new Error("no biome " + biome)
  for (let k = 0; k < tries; k++) {
    const level = first + k * S.BIOMES.length
    const w = S.generate(level, 0, seed)
    if (pred(w, level)) return level
  }
  throw new Error(`no ${biome} level satisfies the predicate`)
}
