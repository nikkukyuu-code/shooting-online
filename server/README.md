# stb-ranking (Cloudflare Worker + D1)
- Worker: https://stb-ranking.nikkukyuu.workers.dev  (script `stb-ranking`, D1 binding `DB` → database `stb-ranking`)
- Source: `worker.js` (deployed as minified `worker.min.js`), schema: `schema.sql`, cron `5 15 * * *` (00:05 JST) closes periods / awards medals; also closed lazily on requests.
- Endpoints: GET /health, POST /register, POST /nickname, POST /me, POST /match/start, POST /match/submit, GET /ranking?period=day|week|month|year&board=top3|best[&key][&id], GET /medals?ids=
- Anti-cheat: single-use token per COM強い match, min 20 s server-measured, score encrypted+HMAC-signed (no PT cap), 30 tokens/h/player & 60/h/IP, 10 registrations/h/IP, secret key (SHA-256 stored).
