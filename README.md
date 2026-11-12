# dpoc-argon.zinc

TEMPLATE (drills 1-2) — not pushed until the drill creates the repos. Minimal bun service:
`GET /healthz`, `GET /api/info` `{cluster, landscape, version}`, one Database module
`main {type: neon, version: 17}`. Same lifecycle as tin: `x-dpoc-cluster` on every response,
secret polled every 2 s with client swap on generation change (`src/lib/pgapp.ts` verbatim
from spike m-pgmoves; rotations appear as `db-generation` log events), SIGTERM drain
(readiness 503, serve 10 s, exit). The database Secret volume is NOT optional (G3). No
auth, no notes endpoints.

- `infra/app` chart `dpoc-argon-zinc` (Deployment/Service/Ingress `zinc.argon.<l>.<root>`)
- `infra/primordial` chart `dpoc-argon-zinc-primordial` (Database record)

## Release
Push a tag `vX.Y.Z` (needs `DPOC_REG_PASSWORD`): image `reg.dpoc.specpenguin.dev/dpoc-argon-zinc:X.Y.Z`,
then the primordial chart, then the app chart (LAST).
