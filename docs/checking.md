# Checking

Moved out of AGENTS.md: staying current across deploys, and how to check gameplay, looks and the page itself.

## Staying current

A tab is left open for days, so a deploy has to reach it without anyone pressing
reload.

- **The version is the page's own content hash.** `stamp-assets.js` hashes
  `index.html` with the build slot blanked — a hash cannot contain itself — and
  writes the result to both `<meta name="build">` and `src/version.js`. Script
  stamps are inside that hash, so it moves for a code change and for a
  markup-only change alike. The deploy build preserves that meta hash and
  rewrites only its script URLs to filenames hashed from the actual emitted
  bytes. Exact `dist/_headers` rules make those names immutable; bare source
  paths revalidate. An uncertain JavaScript scan prints an “unchanged” notice
  and copies the entire original; invalid JavaScript still fails `node --check`.
- **`reporting` was a latch with nothing to open it.** It stops two reports
  going up at once and was cleared only by the fetch settling — and a fetch is
  not obliged to settle. A request in flight when the tab is backgrounded, or
  on a network that goes away without closing the socket, can hang for the life
  of the page; the latch then stayed shut for the rest of the session and every
  later report was queued and never sent. The page kept playing and kept
  counting, so nothing looked wrong locally: a screen left running for a day
  rescued thirteen thousand agents and posted about nine hundred. It is now
  aborted on a timer *and* treated as stale past `REPORT_STALE` regardless of
  what the promise did, because the failure is silent and there is no way to
  notice it from inside the page.
- **The reload that recovers a backlog was throwing most of it away.** The
  queue was trimmed to the last fifty reports on load — about three thousand
  rescues kept out of however many had piled up. `REPORT_QUEUE_CAP` is four
  hundred now, and `packReports` merges a run of part-batches, though not full
  ones: two five-level batches are 130 against a `MAX_SAVED_PER_REPORT` of 90,
  so on a stalled day of full batches it merges nothing. The cap is what saves
  that day; the packing is for a browser that keeps being closed mid-run.
- **A limit written in two places drifted, and the database won.** 0001 capped
  `rescue_events.saved` at 30, back when a report was one finished level and the
  biggest colony was eighteen. Batching then made a report up to five levels and
  raised `MAX_SAVED_PER_REPORT` to 90 — in `src/counter.js`, not in the schema.
  The Worker accepted what the table then refused: the INSERT raised a CHECK
  violation, the D1 batch is one transaction so the whole thing rolled back, and
  the client queued the report and retried it forever. In 7,712 rows the largest
  `saved` ever stored was 29. Anybody finishing three or more levels between
  reports had those rescues refused for as long as they kept playing, and a
  screen left running reported about seven per cent of what it rescued.
  Migration 0002 rebuilds the table around the right bound — SQLite cannot alter
  a CHECK — and `npm test` now fails if the two numbers ever disagree again,
  which is the only guard available when one of them lives in a .sql file.
- **Every retry trigger was an event that might never come again.** The report
  queue was flushed when a level completed, when a send succeeded, and when the
  browser came back online — and nothing else. So any wedge at the head of the
  queue (a 429, a reload that killed the request in flight, a stalled socket)
  parked the whole backlog until somebody finished another level, and if the
  wedge also stopped the game there was no next level. There is a 20-second
  timer now that owes nothing to any of that, and a head that fails
  `REPORT_MAX_TRIES` times rotates to the back so one poisoned report cannot
  hold everything behind it — safe, because the server dedupes on event id.
- **A live ticker has to tick.** The rescue counter was compacted to two
  significant digits ("96k") and the site earns about nine hundred rescues a
  day, so the number on screen changed once per thousand — it stood still for a
  whole day at a time and was reported as the API being down. That is the right
  reading: a counter that does not move is broken, whatever the database says.
  It shows the exact figure below a million now and two decimals above
  ("8.04m"), which moves every ten thousand. Fit was never the constraint —
  measured at seven widths from 1400px down, the long form wraps the controls
  row in exactly the same places as the short one.
- **Nothing polls for it.** `readStats` puts `build` on every counter reply, and
  `web.js` compares it with its own meta tag, so a deploy is noticed on a request
  the page was already making — about one per batch of levels. The 20-minute
  `STATS_IDLE` poll exists for a paused game, which makes no requests at all.
- **The reload happens between levels**, right after `advance(1)` has written the
  next level to localStorage, so it costs the player nothing.
- **A build gets one attempt** (`BUILD_KEY`). If the reload comes back the same
  stale page — a proxy, an over-eager cache — trying again would be a loop.


## Checking gameplay changes

```bash
npm run sim play      # 200 levels, the way the page plays them
npm run sim biomes    # the same, broken down per biome
npm run sim inert     # materials must not affect behaviour
npm run sim gravity   # planted things must fall when their floor goes
npm run sim heights   # every special must be a distinct height device
npm run sim spread    # the same level played by several different colonies
npm run sim hazards   # kills per placement for every fixture kind
```

`hazards` averages about 0.27. A kind far above it is usually one level where
it landed on a spot the queue cannot leave — a lip, or in front of a wall —
not a bad spec; read that level before touching the numbers. Keeping fixtures
off such spots in `placeHazard` was tried and measured: it removed a fifth of
all hazards and left kills per placement where they were. What fixed it was
behaviour: an agent inside a known zone while it winds up leaves by an open
side (`fleeHazard`), where the old rule picked a side from the fixture's
reach, walked a plate's queue at a lip, and the edge rule walked it back.

Every one pins the colony seed, so the numbers are repeatable and comparable
with the baselines below. A run that varies between invocations means something
has picked up entropy.

`play` is the one to watch. A change that improves the look should leave it
roughly alone; a change that moves it several points has done something to the
gameplay, intended or not. `hangs` must stay at zero. The game has no pass mark,
so `cleared` is measured against `CLEAR_SHARE`, a fixed fraction of the colony
defined in `simcheck.js`.

Every simcheck command is also an export that takes its sizes and an `out`
and returns what it found; `test/simcheck.test.js` runs `heights` and the
ladder checks in full and the rest on a level or two, so `npm test` would
catch a special that lost its height device or a ladder left in mid air.

Baselines, 200 levels (as of iteration 327, 15 October 2026 — twenty
biomes): **100% of levels cleared, 2,976 of 3,129 agents home (95%) in 208
attempts, average attempt 40 s, no hangs.** `npm run playtest -- 1-200
--seeds 8` was then 95% home with no level flagged for loops or for under
70% home; what it still flags is single stragglers ending on the stall
cutoff. `npm run sim hazards` was 0.14 kills per placement over 440 levels,
the Hot Aisle highest at 0.73. Iteration 93 (fourteen biomes, patience 900 /
8 passes) was 99% cleared, 94% home. As of iteration 70 it was 97 / 90 / 47s; before the sidearm
change 96 / 88 / 46s.
Earlier, as of the twelve-biome catalogue: 95% cleared, 89% home, 44s. The
pinned 200 are a small sample: adding the twelfth biome moved them from 99% to
95% with the failures spread over seven biomes, while the wide sweep moved 1.4.
Earlier figures below are from the ten-biome catalogue and are kept as they
were measured. Per biome nothing is an outlier — 95–100% cleared and 77–93%
home across all ten, with the Trench at 100/92 and the Skyscraper at 95/77. On
the wider 300×6 sweep the band is 87–93% cleared and 86–92% home, the Trench at
91/92. On a 24-level
sample a two-level swing is nine points, so widen the sweep before believing a
biome has moved.

`play` pins one colony per level, which is too narrow to see a change in how the
colony copes. The wider sweep — 200 levels × 8 colonies, played the way the page
plays them — is the one to run for anything touching recovery or the toolbar;
`tools/` has no command for it, so write the loop against `generate`/`step` and
pin the seeds. It sat at **88% cleared, 89% home, 44s** on the nine-biome
catalogue and **91% cleared, 90% home, 45s** on the ten-biome one.

Adding the Trench changed the length of `BIOMES`, so nothing before it is
like-for-like with anything after it. The isolation AGENTS.md asks for was run
and is the number that matters: with `"Trench"` spliced back out of `BIOMES`,
the branch measures 88.0/89.05 against main's 88.2/89.14 over 1600 runs — the
other nine biomes and the shared physics changes cost nothing.

- Events are close to free: with `stepEvents` stubbed out over 240 levels,
  overall home was 84% either way. Measure a change with events both on and off
  before concluding one of them did something.
- A random colony costs the game nothing: played the way the page plays it, the
  same sweep lands within a point or two of the pinned-seed figure.
- `spread` watches the personalities rather than the levels: over 60 levels with
  8 colonies each, agents home varies by about 4, and on about a third of levels
  the colony is the difference between clearing and not.
- A fire escape costs about three points of cleared and two of home against lifts
  on both sides — the bashers to get out against the queue it saves — which is
  the width a variant should be.
- The bottom pit is worth breaking numbers down by, and `tools/` has no command
  for it: generate a level, look at `w.pits`, bucket by whether anything is
  `crossing`. No pit runs at about 87% home, a shaft at 81%, a crossing at 80%. A
  change that opens a gap between those three has changed how the colony handles
  a hole in the floor, whatever else it was meant to do.

## Checking looks

Looks are checked by rendering, not by reading code:

```bash
npm run shot level 8          # one level, as the page draws it
npm run shot crop 8           # a close crop, for texture rather than layout
npm run shot biomes           # one of each biome, stacked
npm run shot themes 8         # one level in every theme
npm run shot dusk 14          # one colony at four moments of the dusk
```

A shot is what the page shows: page resolution (2), with the page's own
`drawActors` options, so the dusk and every page-only pass are in it.
`--res 1` is the Omarchy panel and `--res 3` share art, and neither has the
dusk. `--clock N` draws the frame at tick N after `--ticks` of play, which is
how to see one colony under another light.

`tools/render.js` rasterises `Draw.js` straight to a PNG with no browser and no
dependencies — the core files only call `fillRect` and a few no-ops, so a
recording canvas plus zlib is the whole of it. Shots land in `shots/`, which is
not committed, and every command pins the colony seed, so a diff between two
runs is a real change. Text is skipped and gradients collapse to their middle
stop.

The Factory shipped noisy — seventeen identical cogs at random heights, a dashed
roller line on every floor — and none of it was visible from the code, where each
piece looked reasonable alone. One render made it obvious. Contact sheets are the
way to check a set of things against each other: every hazard in all three
phases, or every special, side by side. That is how eight dangers were found
sharing one graphic.

Each hazard kind is drawn by its own function, listed in `HAZARD_DRAW` in
`Draw.js`; `test/hazards.test.js` fails if a kind in `HAZARDS` has no row there
and would fall back to the generic box.

## Checking the page itself, headlessly

Layout, controls and anything using the browser's own APIs have to be checked in
a browser, and there may not be one to drive. Chromium's remote debugging
protocol needs no display and no dependencies — Node has a global `WebSocket`,
so a throwaway script is enough:

```bash
chromium --headless=new --remote-debugging-port=9222 \
         --window-size=1920,1200 --screen-info='{1920x1200}' \
         --user-data-dir=/tmp/probe-$$ --hide-scrollbars http://127.0.0.1:8788/
```

Then `GET http://127.0.0.1:9222/json` for the page target, open its
`webSocketDebuggerUrl`, and send CDP commands: `Runtime.evaluate` to read the DOM
back as JSON, `Input.dispatchKeyEvent` and `Input.dispatchMouseEvent` to drive
it, `Page.captureScreenshot` to look at it. `clip` with `scale: 2` crops to one
element and doubles it, which is how to read an 11px label.

- **`--screen-info` is not optional when fullscreen is involved.** Headless
  reports a 600px-tall screen regardless of `--window-size`, so a fullscreen
  element gets a 600px viewport and every scale calculation comes out wrong.
- **A fullscreen request needs a user gesture.** A dispatched key or mouse event
  is one; `Runtime.evaluate` is not, unless called with `userGesture: true`.
- **Use a fresh `--user-data-dir` per run.** A reused profile can leave the
  target list empty and the script waiting for a page that never appears.
- **Measure, don't eyeball.** Compare bounding boxes — a screenshot will not tell
  you two rows are eight pixels out of alignment; `getBoundingClientRect()` will.

Kill the browser when finished. Nothing on screen says it is still running.
