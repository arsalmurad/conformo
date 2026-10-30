# A Hono endpoint over the toolkit

`app.ts` is about 30 lines: `POST /invoice` takes `{invoice, format?}`, creates the XML with `@conformo/toolkit`, validates it, and returns `{xml, warnings, valid, ruleSets}` (HTTP 422 if it does not validate, or if the invoice is not writable).

```bash
npx tsx examples/hono-endpoint/app.ts
```

```bash
curl -s http://127.0.0.1:3000/invoice -H 'content-type: application/json' -d "{\"invoice\": $(cat fixtures/xrechnung-public-sector.json)}"
```

The invoice is Conformo's Invoice JSON (money in integer minor units), here taken from the repository's `fixtures/` folder. This is a starting point, not a hardened service: it has no auth and no body limit. For a ready-made API with all operations, OpenAPI and limits, see `docs/server.md` (`@conformo/server`).
