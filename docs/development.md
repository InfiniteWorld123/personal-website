# Local Development

Requires Bun and Docker.

## First run

```bash
cp .env.example .env          # then fill in the blanks
bun install
bun run db:up                 # PostgreSQL in Docker
bun run db:migrate
bun run db:seed:admin         # creates the single administrator
bun run dev
```

`.env` is gitignored and never committed.

- `BETTER_AUTH_SECRET` — generate with `openssl rand -base64 32`
- `BETTER_AUTH_URL` and `BASE_URL` must match the URL the app is actually
  served from, including the port. A mismatch breaks session cookies.
- `ADMIN_EMAIL` / `ADMIN_PASSWORD` are read only by `db:seed:admin`.
  The password must be at least 12 characters with upper, lower, and a digit.

## Commands

| Command | Purpose |
| --- | --- |
| `bun run dev` | Dev server |
| `bun run build` | Production build; also regenerates the route tree |
| `bun run typecheck` | `tsc --noEmit` |
| `bun run test` | Vitest |
| `bun run db:up` / `db:down` | Start / stop the local database |
| `bun run db:migrate` | Apply pending migrations |
| `bun run db:seed:admin` | Create or update the administrator |

## Notes

- The database port is `POSTGRES_PORT` (default `5433`, not 5432) so it does not
  collide with a PostgreSQL already installed on the host. It is bound to
  `127.0.0.1` only.
- Re-running `db:seed:admin` updates the existing administrator's name, email,
  and password. It never creates a second one — the database enforces that.
- Migrations run in filename order inside a transaction. Never edit an applied
  migration; add a new numbered file.
