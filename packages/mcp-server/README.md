# @conformo/mcp-server

An MCP server that lets an AI agent create, validate, convert and parse EN 16931 e-invoices:
XRechnung, Peppol BIS Billing 3.0, plain CII and UBL, and Factur-X / ZUGFeRD PDF/A-3. Every tool is a thin wrapper over
[`@conformo/toolkit`](../toolkit); the validation is the official Schematron and XSD, run locally.

Two transports: **stdio** (default, for desktop clients) and **stateless Streamable HTTP** (for a shared deployment).

## Tools

| Tool | What it does | Read-only |
| --- | --- | --- |
| `create_invoice` | Structured invoice (JSON object) to XML: `cii`, `cii-extended`, `ubl`, `xrechnung-cii`, `xrechnung-ubl`, `peppol-ubl`. | yes |
| `create_invoice_pdf` | Same input to a Factur-X / ZUGFeRD PDF/A-3 (`en16931`, `xrechnung`, `extended`). Returns base64, or writes `outputPath`. | no |
| `validate_invoice` | XML text or base64 PDF. Detects syntax and profile, runs XSD and the matching rule sets, reports which ran. Optional `country` `FR` or `DE`. | yes |
| `convert_invoice` | XML or PDF in, another syntax out. | yes |
| `parse_invoice` | XML or PDF to the invoice JSON model. | yes |
| `get_country_requirements` | Mandates, dates, thresholds and sources per country, plus what Conformo itself supports. | yes |
| `explain_validation_rule` | A rule id such as `BR-CO-15`: official wording, plain-language meaning and fix. | yes |

All tools declare an `outputSchema` and return `structuredContent` plus a text fallback. Money is **always integer minor
units** (EUR 12.34 is `1234`). The input schema of `create_invoice` documents every field with its BT/BG identifier.
Input problems come back as an `isError` result listing every issue (path, BT id, message), never a stack trace.

## Install and configure

The commands below use the published package name. From a checkout, replace `npx -y @conformo/mcp-server` with
`npx tsx /absolute/path/to/conformo/packages/mcp-server/src/server.ts`.

### Claude Desktop

Add to `claude_desktop_config.json` (Settings, Developer, Edit Config):

```json
{
  "mcpServers": {
    "conformo": {
      "command": "npx",
      "args": ["-y", "@conformo/mcp-server"]
    }
  }
}
```

On Windows, if `npx` is not found, use `"command": "cmd"` with `"args": ["/c", "npx", "-y", "@conformo/mcp-server"]`.

### Claude Code

```bash
claude mcp add conformo -- npx -y @conformo/mcp-server
# or against a remote deployment
claude mcp add --transport http conformo https://mcp.example.com/mcp
```

### Cursor

`.cursor/mcp.json` in the project, or `~/.cursor/mcp.json` for all projects:

```json
{
  "mcpServers": {
    "conformo": {
      "command": "npx",
      "args": ["-y", "@conformo/mcp-server"]
    }
  }
}
```

### Working directory and `outputPath`

`create_invoice_pdf` can write a file instead of returning base64. The path must end in `.pdf`, stay inside the server's
working directory, and not exist yet unless `overwrite: true`. Set `CONFORMO_MCP_ALLOW_ANY_PATH=1` to lift the directory
limit.

## HTTP mode

```bash
conformo-mcp --http --port 8787 --host 127.0.0.1 --max-body-bytes 8388608
```

| Flag | Env | Default |
| --- | --- | --- |
| `--port` | `CONFORMO_MCP_PORT` | `8787` (`0` picks a free port; the URL is printed on stderr) |
| `--host` | `CONFORMO_MCP_HOST` | `127.0.0.1` |
| `--max-body-bytes` | `CONFORMO_MCP_MAX_BODY_BYTES` | `8388608` (8 MiB); larger bodies get `413` |

Endpoints: `POST /mcp` (JSON-RPC, JSON responses), `GET /healthz` (liveness), `GET`/`DELETE /mcp` answer `405`.
The server is **stateless**: a fresh server and transport per request, no session ids, no data kept between calls.
It has **no authentication and no TLS**.

### Remote deployment

Do not expose the port directly. Run it on a private interface and put a reverse proxy with TLS and authentication in
front (a bearer token check, mTLS, or your identity-aware proxy). Because it is stateless you can run any number of
replicas behind a load balancer with no sticky sessions. Bind to `0.0.0.0` only inside a container or private network.

Dockerfile:

```dockerfile
FROM node:22-slim
WORKDIR /app
RUN npm install -g @conformo/mcp-server
ENV CONFORMO_MCP_HOST=0.0.0.0 CONFORMO_MCP_PORT=8787
EXPOSE 8787
USER node
HEALTHCHECK CMD node -e "fetch('http://127.0.0.1:8787/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["conformo-mcp", "--http"]
```

Caddy example (token auth and TLS in front):

```
mcp.example.com {
  @authed header Authorization "Bearer {env.MCP_TOKEN}"
  handle @authed {
    reverse_proxy 127.0.0.1:8787
  }
  respond "unauthorized" 401
}
```

Note that invoices contain personal and commercial data: whoever can reach the endpoint can send invoices through it,
and you carry the usual obligations for the traffic your proxy logs.

## What it does not do

- It does **not transmit** invoices: no Peppol access point, no French PA/PDP, no KSeF, no SdI. It produces and checks documents only.
- It does **not** support FatturaPA, KSeF FA(3) or Facturae (no serializer, reader or validator).
- A `valid: true` means the rule sets listed in `ruleSets` and the XSD passed. It is not a statement that any tax authority, buyer or network will accept the invoice.
- It does not compute anything you did not supply beyond totals and the VAT breakdown; exchange rates (BT-111) and exemption reasons are your input.
- `get_country_requirements` reports a sourced dataset; entries marked `unverified` are not confirmed from an official source. It is not legal advice.
- No authentication, authorisation, rate limiting or persistence in the server itself.
- Local PDF writing is limited to the working directory unless you opt out; there is no network access from any tool.

Design decisions are recorded in [DECISIONS.txt](./DECISIONS.txt).
