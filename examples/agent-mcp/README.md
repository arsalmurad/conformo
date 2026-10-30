# A scripted MCP client (what an agent loop does)

`client.ts` spawns the Conformo MCP server over stdio with the MCP SDK `Client`, lists its tools, calls `create_invoice`, then `validate_invoice` on the XML it got back, and prints the result. There is no LLM and no network; it is the tool-call sequence an agent performs, written out.

```bash
npx tsx examples/agent-mcp/client.ts
```

The exit code is non-zero if the produced invoice does not validate. `invoice.json` is a small invented German invoice (money in integer minor units: `10000` is EUR 100.00). To use the server from a real agent, point your MCP client at the `conformo-mcp` command instead; see `packages/mcp-server/README.md`.
