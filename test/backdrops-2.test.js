import { biomeTests, BIOME_COUNT } from "./backdrops-biomes.js"

// The second half of the biomes; see backdrops-biomes.js.
biomeTests(Math.ceil(BIOME_COUNT / 2) + 1, BIOME_COUNT)
