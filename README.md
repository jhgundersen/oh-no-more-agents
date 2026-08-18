# Oh No! More Agents

Autonomous agents with no supervisor, no plan beyond the next two body-lengths,
and one umbrella each. Nobody is playing. They work it out, or they don't.

This repository contains the standalone web game from [jonh.no](https://jonh.no/agents.html),
plus a tiny global counter showing how many agents everyone has rescued.

## Architecture

- The game is framework-free HTML, Canvas, and JavaScript in `public/`.
- A Cloudflare Worker serves the static game and two same-origin API routes.
- Cloudflare D1 stores the global total with SQLite-compatible SQL.
- Completed levels are reported with unique event IDs. Retrying the same HTTP
  request cannot increment the counter twice.
- Reports are bounded to 1–30 agents and rate-limited per hashed IP/minute.
  This is a fun community number, not a cryptographically trustworthy score.
- Failed reports remain in the browser's local storage and retry later.

## API

### `GET /api/stats`

```json
{
  "totalSaved": 12345,
  "reports": 812,
  "updatedAt": "2026-08-18 12:34:56"
}
```

### `POST /api/saves`

```json
{
  "eventId": "550e8400-e29b-41d4-a716-446655440000",
  "saved": 17
}
```

The response is the updated stats object. Reusing an `eventId` is idempotent.

## Local development

Requires Node.js 20 or newer.

```bash
npm install
npm run db:local
npm run dev
```

Wrangler prints the local URL, normally `http://localhost:8787`.

Run all syntax and unit checks with:

```bash
npm run check
```

## First deployment

1. Authenticate Wrangler:

   ```bash
   npx wrangler login
   ```

2. Create the production database:

   ```bash
   npx wrangler d1 create oh-no-more-agents
   ```

3. Replace the zero UUID in `wrangler.jsonc` with the returned `database_id`.

4. Set a private salt used to hash client addresses for rate limiting:

   ```bash
   npx wrangler secret put RATE_LIMIT_SALT
   ```

5. Apply the schema and deploy:

   ```bash
   npm run db:remote
   npm run deploy
   ```

The first deployment is available on a `workers.dev` address.

## Custom domain

After buying `oh-no-more-agents.com` (or another name), add it as a Cloudflare
zone. In **Workers & Pages → oh-no-more-agents → Settings → Domains & Routes**,
add the domain as a Custom Domain. Cloudflare creates the DNS records and TLS
certificate for the Worker.

## Data maintenance

The total is held in the singleton `rescue_stats` row. `rescue_events` provides
idempotency and an audit trail. Old event rows can be archived later without
changing the total.

To inspect production data:

```bash
npx wrangler d1 execute oh-no-more-agents --remote \
  --command "SELECT * FROM rescue_stats WHERE id = 1"
```
