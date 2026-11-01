# MCP server

`@conformo/mcp-server` gives an AI agent seven tools: `create_invoice`, `create_invoice_pdf`, `validate_invoice`, `convert_invoice`, `parse_invoice`, `get_country_requirements` and `explain_validation_rule`. Validation is the official Schematron and XSD, run on your machine. Money is always integer minor units. The full reference, including HTTP mode and remote deployment, is in [the package README](../../packages/mcp-server/README.md).

## Claude Desktop

Settings, Developer, Edit Config, then add to `claude_desktop_config.json`:

```json file=claude_desktop_config.json
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

## Claude Code

```bash
claude mcp add conformo -- npx -y @conformo/mcp-server
```

Or check it into the project as `.mcp.json`:

```json file=.mcp.json
{
  "mcpServers": {
    "conformo": {
      "command": "npx",
      "args": ["-y", "@conformo/mcp-server"]
    }
  }
}
```

## Cursor

`.cursor/mcp.json` in the project, or `~/.cursor/mcp.json` for every project:

```json file=.cursor/mcp.json
{
  "mcpServers": {
    "conformo": {
      "command": "npx",
      "args": ["-y", "@conformo/mcp-server"]
    }
  }
}
```

Then ask, for example: "Make an XRechnung for 8 hours of maintenance at EUR 95 for Stadt Beispielhausen, Leitweg-ID 04011000-1234512345-06, and check it."
