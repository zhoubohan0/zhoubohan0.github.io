# Visitor service delivery

- Account verified in the live Cloudflare dashboard: Workers Free, US$0, Current plan. No plan upgrade or paid add-on enabled.
- Worker: https://bohan-visitor-map.3459783348.workers.dev
- Worker version: 032b240e-d518-4119-9098-f7f7bf29a57b
- D1: bohan-visitor-map, 25521d6d-1eed-4d77-aa77-1d38f1d7fe77, APAC, initial size 49,152 bytes.
- Official Wrangler OAuth authorized through the user's signed-in Chrome session; encrypted credential file uses a key stored in macOS Keychain. Only user/account read and Workers/Worker Scripts/D1 write plus background access were requested. No credentials in the repository.
- The browser-control plugin was unavailable. Native Chrome accessibility supplied current controls; native mouse events completed authorization. Initial callback/device attempts expired before the working input method was established; no cloud resources were created until the Free plan was explicitly confirmed.
- Real endpoint verification: health/stats 200; non-recording POST dry run 200 with geolocation available; localhost POST 403; production CORS preflight 204. SQL confirmed zero visits and zero event records.
- 10 Node/SQLite/tracker tests and 83 browser checks passed. Browser network checks confirmed no production POST from localhost. Static website validation passed.
- App cap: 5,000 accepted events per UTC day; 7-day event UUID deduplication; aggregate counts retained; no raw IP/cookie/person ID stored. Platform Free quotas stop operations without overage billing.
- Existing local preview at http://127.0.0.1:59766/#visitors now reads the live endpoint. This frontend connection has not been pushed to GitHub Pages, so it will start counting public website visits only after publication.
- Preserve unrelated in-progress light-theme-only edits in v2 HTML/theme.js and their browser checks. Commit only the visitor integration hunks.
