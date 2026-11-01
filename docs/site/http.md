# HTTP API

`@conformo/server` is an optional, stateless HTTP API over the toolkit, for back ends that are not Node (PHP, Python, Java) and for no-code tools. No database, no accounts, nothing written to disk. It has no authentication: keep it on a private network or behind your own proxy. The OpenAPI 3.1 description is [openapi.json](../openapi.json); the full reference is [docs/server.md](../server.md).

```bash
npm install --global @conformo/server
conformo-server --port 8788
```

Request bodies are JSON. To create an XRechnung, save this as `create.json`:

```json file=create.json
{
  "format": "xrechnung-cii",
  "invoice": {
    "number": "RE-2027-0001", "issueDate": "2027-01-15", "currency": "EUR", "buyerReference": "04011000-1234512345-06",
    "seller": { "name": "Muster Software GmbH", "vatId": "DE123456789", "street": "Hauptstrasse 1", "postcode": "10115", "city": "Berlin", "country": "DE",
      "electronicAddress": "rechnung@muster.example", "contact": { "name": "Erika Mustermann", "phone": "+49 30 1234567", "email": "erika@muster.example" } },
    "buyer": { "name": "Stadt Beispielhausen", "street": "Rathausplatz 1", "postcode": "50667", "city": "Beispielhausen", "country": "DE",
      "electronicAddress": "04011000-1234512345-06", "electronicAddressScheme": "0204" },
    "payment": { "meansCode": "58", "iban": "DE89370400440532013000" },
    "lines": [{ "name": "Wartung Dezember", "quantity": 8, "unitCode": "HUR", "unitPriceMinor": 9500, "taxCategory": "S", "taxRate": 19 }]
  }
}
```

```bash
curl -s -X POST http://127.0.0.1:8788/v1/invoices/xml -H "content-type: application/json" -d @create.json
curl -s http://127.0.0.1:8788/v1/requirements/DE
curl -s http://127.0.0.1:8788/v1/rules/BR-DE-15
curl -s http://127.0.0.1:8788/openapi.json -o openapi.json
curl -s http://127.0.0.1:8788/healthz
```

| Method and path | Body | Returns |
| --- | --- | --- |
| `POST /v1/invoices/xml` | `{invoice, format}` | `{xml, format, warnings}` |
| `POST /v1/invoices/pdf` | `{invoice, profile?, template?}` | the PDF, or JSON with `Accept: application/json` |
| `POST /v1/validate` | `{xml}` or `{pdfBase64}`, `options?` | the full validation result (HTTP 200 whether valid or not) |
| `POST /v1/convert` | `{source}` or `{sourcePdfBase64}`, `to` | `{xml, from, to, warnings, totalsCheck}` |
| `POST /v1/parse` | `{xml}` or `{pdfBase64}` | `{invoice, format, origin, totalsCheck}` |
| `GET /v1/requirements/:country` | | the sourced country record and what Conformo supports |
| `GET /v1/rules/:id` | | a rule explained |

Errors are `{error, message, issues?}` with HTTP 400, 404, 413 or 422; an invoice that cannot be written lists every bad field with its BT id.
