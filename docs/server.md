# Conformo HTTP API (`@conformo/server`)

An optional, stateless HTTP API over [`@conformo/toolkit`](../packages/toolkit): create e-invoice XML and Factur-X / ZUGFeRD PDFs, validate, convert, parse, look up country requirements and explain validation rules. It is for people who cannot or do not want to run Node in-process (a PHP, Python or Java back end, a no-code tool). If you can call the toolkit directly, do that.

It keeps no state: no database, no accounts, no sessions, nothing written to disk. Every request is computed and forgotten. The OpenAPI 3.1 description is generated from the same schemas the server validates with and is committed as [`docs/openapi.json`](openapi.json).

## Run it

From a checkout:

```bash
npx tsx packages/server/src/server.ts --port 8788
```

Or, once installed from npm:

```bash
npx conformo-server --port 8788
```

Flags: `--port N` (default 8788, `0` picks a free port), `--host H` (default `127.0.0.1`), `--max-body BYTES` (default 8388608), `--cors ORIGINS`.
Environment: `CONFORMO_SERVER_PORT`, `CONFORMO_SERVER_HOST`, `CONFORMO_SERVER_MAX_BODY`, `CONFORMO_SERVER_CORS_ORIGINS` (comma-separated origins, `*` for any; the default is no CORS headers at all).

Embed it in your own process:

```ts
import { createApp, start } from '@conformo/server';

const app = createApp({ maxBodyBytes: 2_000_000, cors: ['https://app.example'] }); // a Hono app: app.fetch, app.request
const running = await start({ port: 0 });                                         // { url, host, port, close() }
```

## Docker

```bash
docker build -f Dockerfile.server -t conformo-server .
```

```bash
docker run --rm -p 127.0.0.1:8788:8788 conformo-server
```

The container holds no data: no volume is needed and nothing is written inside it. The image runs the TypeScript sources through `tsx`. Publish the port on `127.0.0.1` (as above) or behind a reverse proxy; see Deployment.

## Endpoints

| Method and path | Body | Returns |
| --- | --- | --- |
| `POST /v1/invoices/xml` | `{invoice, format}` | `{xml, format, warnings}` |
| `POST /v1/invoices/pdf` | `{invoice, profile?, template?}` | `application/pdf` bytes; with `Accept: application/json`: `{pdfBase64, xml, xmlFilename, conformanceLevel}` |
| `POST /v1/validate` | `{xml}` or `{pdfBase64}`, plus `options?: {country?, profile?, xsd?}` | the full validation result; HTTP 200 whether valid or not |
| `POST /v1/convert` | `{source}` or `{sourcePdfBase64}`, plus `to` | `{xml, from, to, warnings, totalsCheck}` |
| `POST /v1/parse` | `{xml}` or `{pdfBase64}` | `{invoice, format, origin, totalsCheck, ...}` |
| `GET /v1/requirements` | | `{countries: [{country, name}]}` |
| `GET /v1/requirements/:country` | | the sourced country record plus `conformoSupport` |
| `GET /v1/rules/:id` | | the rule explained (publisher wording, plain language, fix) |
| `GET /healthz` | | `{status: "ok", version}` |
| `GET /openapi.json` | | the OpenAPI 3.1 document |
| `GET /docs` | | a static page linking to `openapi.json` |

`format` is one of `cii`, `cii-extended`, `ubl`, `xrechnung-cii`, `xrechnung-ubl`, `peppol-ubl`. `profile` is `en16931`, `xrechnung` or `extended`. `template` is `classic`, `modern` or `compact`. The invoice is the [Invoice schema](../packages/schema/invoice.schema.json): every money field ends in `Minor` and is an integer in minor units (EUR 12.34 is `1234`); totals and the VAT breakdown are computed, never sent.

### Errors

Every non-2xx response is `{error, message, issues?}`; stack traces are never returned.

| Status | `error` | When |
| --- | --- | --- |
| 400 | `malformed_json` | the body is not JSON |
| 404 | `not_found` | unknown route, country or rule |
| 413 | `payload_too_large` | body over the limit (default 8 MiB) |
| 422 | `invalid_invoice` | the invoice cannot be written; `issues` lists every bad field as `{path, bt, severity, message}` |
| 422 | `invalid_request` | a missing, conflicting or unknown field, bad base64, or not a PDF |
| 422 | `unprocessable_document` | the XML or PDF is not a supported invoice |
| 500 | `internal_error` | a bug; the message is fixed text |

## Examples

These use `fixtures/xrechnung-public-sector.json` from the repository as the invoice. Create XRechnung (UBL):

```bash
curl -s http://127.0.0.1:8788/v1/invoices/xml -H 'content-type: application/json' -d "{\"invoice\": $(cat fixtures/xrechnung-public-sector.json), \"format\": \"xrechnung-ubl\"}" > created.json
```

Validate what you just made (needs `jq`):

```bash
jq '{xml: .xml}' created.json | curl -s http://127.0.0.1:8788/v1/validate -H 'content-type: application/json' -d @- | jq '{valid, ruleSets: [.ruleSets[].id]}'
```

A Factur-X / ZUGFeRD PDF, as bytes:

```bash
curl -s http://127.0.0.1:8788/v1/invoices/pdf -H 'content-type: application/json' -d "{\"invoice\": $(cat fixtures/xrechnung-public-sector.json), \"profile\": \"xrechnung\"}" -o invoice.pdf
```

Validate that PDF (the embedded XML is checked):

```bash
curl -s http://127.0.0.1:8788/v1/validate -H 'content-type: application/json' -d "{\"pdfBase64\": \"$(base64 -w0 invoice.pdf)\"}" | jq .valid
```

Convert to another syntax:

```bash
jq '{source: .xml, to: "xrechnung-cii"}' created.json | curl -s http://127.0.0.1:8788/v1/convert -H 'content-type: application/json' -d @- | jq '{from, to, totalsCheck}'
```

What Germany and Italy require, and what Conformo supports of it:

```bash
curl -s http://127.0.0.1:8788/v1/requirements/IT | jq .conformoSupport
```

Explain a rule from a validation result:

```bash
curl -s http://127.0.0.1:8788/v1/rules/BR-CO-15 | jq .plainLanguage
```

(`base64 -w0` is GNU; on macOS use `base64 -i invoice.pdf`.)

## Deployment

- **There is no authentication.** Do not bind it to a public interface as is. Put it behind a reverse proxy (nginx, Caddy, Traefik, a cloud load balancer) that terminates TLS and enforces your auth, rate limiting and request size limits. The default bind is `127.0.0.1` for that reason.
- It is CPU-bound and holds each request in memory (the 8 MiB body limit applies; PDFs and validation of large documents take a moment). Scale it horizontally; instances share nothing.
- CORS is off unless you set `CONFORMO_SERVER_CORS_ORIGINS`. Enable it only for origins you control; there is no credential handling, so do not put it in front of a browser app as a substitute for your own back end.
- Invoices contain personal and commercial data. The server does not log request bodies and writes nothing to disk, but your proxy and platform logging are yours to configure.

## Limits, stated plainly

- Conformo produces, reads and checks documents. **It does not transmit anything**: no Peppol access point, no French PA/PDP, no KSeF, no SdI. Getting a document to a recipient or a tax authority is outside this API.
- **FatturaPA, KSeF FA(3) and Facturae are not supported** (not generated, read or validated). `/v1/requirements/IT` and `/v1/requirements/PL` say so per format in `conformoSupport`.
- `valid: true` means the rule sets listed in `ruleSets` (and XSD, if it ran) passed. It is not a statement that a tax authority or a Peppol network will accept the invoice. Report what ran, not more.
- Country data is information, not legal advice; entries marked `unverified` are not confirmed from an official source.
