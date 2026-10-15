# Repository Guide

## Project

Oh No! More Agents is a framework-free, Lemmings-style browser game hosted on
Cloudflare Workers. Static game files live in `public/`; the Worker and global
rescue-counter API live in `src/`; D1 schema changes live in `migrations/`.
Production is `https://oh-no-more-agents.com`.

## Important files

- `public/index.html` — standalone game page and surrounding UI. `?full` opens
  it with the board covering the viewport and nothing else on screen — the
  `faux` CSS path, not the Fullscreen API, which cannot be driven from a URL
  because it refuses any request that did not come from a user gesture. For
  kiosks, second monitors and screenshots. `?full=0` is an explicit no, so the
  parameter can be templated in as a variable.
- `public/agents/Sim.js` — simulation, agents, levels, skills, enemies, hazards.
- `public/agents/Draw.js` — Canvas rendering and animation.
- `public/agents/Palette.js` — biome and visual palettes.
- `public/agents/web.js` — browser integration, controls, audio, rescue reporting.
- `public/agents/sfx.js` — synthesised sound effects (WebAudio, no files), web
  only. It observes the world after each step and plays the differences; nothing
  in the core files calls it, so the panel stays silent. Off by default (`m`).
- `public/agents/Outcome.js` — end-of-level copy, shared with the Omarchy panel.
- `tools/render.js` — draws the game to a PNG from Node, no browser; `tools/shoot.js`
  is the command that uses it (`npm run shot`).
- `src/worker.js` — Worker routes and D1 access.
- `src/counter.js` — validation, JSON responses, counter rate-limit helpers.
- `migrations/` — ordered production migrations; never rewrite one that may
  already have been applied.
- `public/_headers` — cache lifetimes for the assets Workers serves.
- `tools/testlock.js` — one heavy test run at a time across every worktree of
  this repo. `npm run check`, `npm test`, `npm run coverage` and `npm run crap`
  queue for it (first come, first served; `node tools/testlock.js status`
  shows who holds it). For any other heavy run, wrap it:
  `node tools/testlock.js run -- <command>`. Single-file `node --test` runs do
  not need it.
- `tools/ship.js` — `npm run deploy` first builds `dist/` (a copy of `public/`
  whose scripts drop comment-only text and indentation when safely scanned,
  otherwise ship unchanged). The shipped page uses content-hashed script
  filenames with exact immutable cache rules; bare scripts revalidate.
  Wrangler serves that. Edit `public/`, never `dist/`; `npm run dev` serves
  `public/` directly. `npm run loadtime` measures what a throttled phone gets.
- `wrangler.jsonc` — Worker bindings and production custom-domain routes.

## Working conventions

- Keep the game dependency-free and runnable as plain browser JavaScript.
- Keep simulation behaviour in `Sim.js` and rendering-only behaviour in `Draw.js`.
- Match the existing pixel-art look, biome palettes, humour, and agent puns.
- Source script URLs in `index.html` carry `?v=<content hash>`; the build
  rewrites only `dist/index.html` to immutable content-hashed filenames. Bare
  `/agents/*.js` (with or without `?v=`) revalidate. After editing anything under
  `public/agents/`, run `npm run stamp` and
  commit the re-stamped page with the code; `npm run check` fails on a stale
  stamp. The same command stamps the page's own hash into `<meta name="build">`
  and the generated `src/version.js`, which is how an open tab notices a deploy
  (see "Staying current" below), so an edit to `index.html` alone needs a stamp
  too. The soundtrack has no stamp and is cached just as hard, so a replacement
  track gets a new number rather than overwriting an existing file.
- Test gameplay changes on the reported level and on nearby/random levels. Watch
  for trapped agents, repeated turning, unreachable exits, overlaps, and loops.
- Treat the rescue total as a community gimmick, not a secure leaderboard.
  Counter submissions must stay bounded, rate-limited, and idempotent.
- Never commit secrets or Wrangler credentials. `RATE_LIMIT_SALT` is a Worker
  secret.
- Do not edit generated Wrangler state under `.wrangler/` or `node_modules/`.
- Keep the development tools fast and safe. When a step is slow, flaky or
  repeated by hand — a test file that takes minutes, a screenshot or comparison
  done the long way, a check that has to be rerun to see what failed — improve
  the tool rather than living with it, and log what changed. A test must stay
  bounded: compare digests rather than raw frame buffers (a failed `deepEqual`
  on two buffers makes node build a diff and once reached 22 GB), and cap any
  loop over recorded draw calls. A machine-wide guard (`node-test-guard`, a
  systemd user service) kills any `node --test` process over 4 GB, so a test
  that dies with SIGKILL has probably hit it: `journalctl --user -u node-test-guard`.

## Safety rules

Each of these is here because breaking it once cost something real.

- **One heavy test run at a time.** `npm run check`, `npm test`,
  `npm run coverage` and `npm run crap` queue on `tools/testlock.js` (a lock in
  the git common dir, shared by every worktree). Wrap any other heavy run with
  `node tools/testlock.js run -- <command>`; `node tools/testlock.js status`
  shows who holds it. Single-file `node --test` runs don't need it.
- **Memory caps.** A machine-wide node-test-guard kills `node --test` processes
  over 4 GB (`journalctl --user -u node-test-guard`). Run heavy art tests under
  a cap, e.g. `systemd-run --user --scope -p MemoryMax=3G node
  --max-old-space-size=2048 --test <file>`, and never `deepEqual` raw pixel
  buffers: compare digests or bytes.
- **Production checks are read-only.** Any headless script pointed at
  oh-no-more-agents.com must fail every non-GET `/api/*` request before it
  leaves (CDP `Fetch`, `BlockedByClient`) and use a throwaway profile.
  Finishing a level there otherwise writes rescues to the worldwide counter,
  which has no way to take them back.
- **Commit only on a green check.** Gate the commit on `npm run check` exiting
  0 (and `npm run crap -- --threshold 30`); never pipe the check through grep
  and commit regardless.
- **Deploy from a clean tree, about hourly.** `npm run deploy` builds `dist/`
  from the working tree (`tools/ship.js`), so stash or commit first. Batch
  deploys roughly once an hour and log each one with the iterations it covers.
  Before each deploy: the full check, then `npm run smoke` (a 3-minute soak:
  page errors, growing heap/nodes/listeners/storage, piling audio nodes,
  frame-time creep). Not part of the per-commit gate. `npm run soak --
  --minutes 20` is the long version.

## Deeper notes

Read these when the task touches them; they are long, and most work doesn't
need them.

- `docs/biomes.md` — one section per biome: its skin, mechanism, hazards and
  the tuning behind them. Read before changing a biome or adding one.
- `docs/mechanics.md` — how a level is put together, umbrellas, fighting back,
  and "What breaks quietly" (the failures that produced no error). Read before
  changing Sim.js rules or level generation.
- `docs/checking.md` — staying current across deploys, and how to check
  gameplay changes (playtest, A/B), looks (shots, compare) and the page
  headlessly. Read before measuring or verifying anything.
- `docs/log-archive.md` — LOG.md entries 1–149. Read when an old decision's
  reasoning matters; `git log -S` finds where a rule came from.

## Validation

Install with `npm install`, then before committing:

```bash
npm run check     # syntax, core-file self-containment, stamps, unit tests
```

It does **not** cover gameplay. For that, see `docs/checking.md`. `npm test` does play three
levels of every biome to the end and draw them (`test/play.test.js`), so a
missing function or a throw fails it — but it measures nothing.

```bash
npm run crap -- --changed   # CRAP score for functions you touched
```

`npm run crap` is unclebob/crapper (fetched into `.crapper/` on first run) over
the coverage from `npm test`. A function you add or change should come out under
30; the old giants (`drawHazardKind`, `drawAgent`, `generate`) are known and
logged in `LOG.md` — split them when you are in them anyway.

`LOG.md` is the improvement log: one entry per iteration, newest last, ending
with what to do next.

Port 8787 (`npm run dev`) is the human's server — never take it over or kill it.
Agents use:

```bash
npm run db:local
npm run dev:agent     # same server, port 8788
```

Two `wrangler dev --local` instances coexist; they share the local D1 file,
which the rescue counter does not mind.

Use `npm run deploy` only when a production deployment is explicitly requested,
and apply new migrations with `npm run db:remote` first. Gate it on the checks
in the same command — `npm run check && npm run deploy` — never chain it after
a check with `;`: iteration 159 shipped with three failing tests that way.

## Sibling copies, and one real hazard

This repo is the source of truth. The core files are meant to be byte-identical
in the Omarchy plugin copy at
`~/.config/omarchy/plugins/jhgundersen.oh-no-more-agents/`:

```bash
npm run sync:check    # report drift, change nothing
npm run sync          # push the core files out to whichever copies exist
```

`web.js` is deliberately **not** synced — each copy has its own host integration
(this one reports to the rescue counter, the plugin has `Panel.qml`), and that is
the seam where they are allowed to differ. Do not silently edit the sibling from
here: if a fix should be shared, say so, and update it only when the task
includes that scope.

**Do not write into that directory while the screen is locked.** The Omarchy lock
screen is a quickshell plugin, so quickshell *is* the lockscreen app. Copying a
file in makes the shell hot-reload, and a hot-reload while a session lock is held
destroys the lock surface: Hyprland reports the lockscreen app died and the
machine is unusable until someone runs
`hyprctl eval 'hl.clear_crashed_lockscreen()'` from another tty. Afterwards check
`omarchy shell lock status` — it can be left believing it is locked, in which
case the screen silently stops locking until the shell is restarted.

The plugin copy can be tested headlessly, the only way to see QML runtime errors
without a display:

```bash
QT_ASSUME_STDERR_HAS_CONSOLE=1 QT_QPA_PLATFORM=offscreen qml6 main.qml
```

## Conventions

- No `Co-Authored-By` or similar trailers in commit messages.
- Commit freely; **do not push unless asked**.
