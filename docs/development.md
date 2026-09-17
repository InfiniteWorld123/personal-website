# Local Development

Requires Bun. The database is Neon — there is no local database to start.

## First run

```bash
cp .env.example .env          # then fill in the blanks
bun install
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
| `bun run db:migrate` | Apply pending migrations |
| `bun run db:seed:admin` | Create or update the administrator |

## Notes

- `DATABASE_URL` is the Neon pooled connection string, the same one production
  uses. `db:migrate` and the seeds therefore run against the live database —
  there is no separate local copy to practise on.
- Re-running `db:seed:admin` updates the existing administrator's name, email,
  and password. It never creates a second one — the database enforces that.
- Migrations run in filename order inside a transaction. Never edit an applied
  migration; add a new numbered file.
