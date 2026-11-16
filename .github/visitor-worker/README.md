# Visitor map service — Free plan only

This independent Worker supplies the existing GitHub Pages globe. Website hosting and the private CV publishing workflow are unchanged.

## Billing boundary

- Deploy only after confirming this account is on **Workers Free**. Never upgrade the subscription to make a request succeed.
- Cloudflare Free daily request/D1 limits fail closed; no paid overage option is enabled. Other account activity shares these quotas.
- This application additionally accepts at most **5,000 page-visit events per UTC day**, with a database trigger enforcing the cap under concurrent requests.
- No R2, KV, Queues, AI, Containers, paid monitoring, custom domain, or scheduled jobs are required. Worker observability is disabled.
- If a platform quota is reached, return an unavailable state and keep the website usable. Do not retry indefinitely or change plans.

Official limits: https://developers.cloudflare.com/workers/platform/pricing/ and https://developers.cloudflare.com/d1/platform/pricing/.

## Interface and data

- `POST /visit`: accepts `{eventId: UUIDv4}` only from the public website Origin; duplicate event IDs are ignored. `{eventId, dryRun: true}` validates connectivity without recording a visit.
- `GET /stats`: read-only public aggregate snapshot, compatible with the existing globe. Cache lifetime is 60 seconds.
- `GET /health`: simple service readiness endpoint; also verify `/stats` to check the database.
- Metric: **page visits**, not unique people. Only actual known approximate locations get markers. Unknown locations contribute to the total without a fabricated coordinate.
- Request IPs, cookies and persistent person identifiers are not stored. Locations come from Cloudflare request metadata and are rounded to one decimal place.
- Deduplication UUIDs expire after seven days; cumulative region counts remain. At most 25 old event records are cleaned up per accepted event.
- `localhost`, preview hosts, archived v1 and DNT/GPC visitors do not report visits. GET requests and globe interactions never count as visits.

## Local verification

```sh
node --test .github/visitor-worker/test.mjs .github/visitor-worker/tracker.test.mjs
```

Tests use Node's built-in SQLite module and do not call the production service. Deployment uses the official Wrangler CLI with account/user read and Worker/D1 write permissions; OAuth credentials stay in the OS keychain, not in this repository.
