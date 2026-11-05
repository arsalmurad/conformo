import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTools } from './tools.js';
import { SERVER_VERSION } from './version.js';

const INSTRUCTIONS =
  'Conformo creates, validates, converts and parses EN 16931 e-invoices (CII, UBL, XRechnung, Peppol BIS, Factur-X/ZUGFeRD PDF). '
  + 'Money is always integer minor units (EUR 12.34 = 1234). Typical flow: create_invoice (or create_invoice_pdf), then validate_invoice and report which rule sets ran. '
  + 'It does not transmit invoices over Peppol, a French PA, KSeF or SdI. It does not support FatturaPA or Facturae, and handles KSeF FA(3) only as domestic PLN invoices it writes and schema-checks (it cannot read them).';

/** A fresh server with every tool registered. The HTTP mode builds one per request (stateless). */
export function createMcpServer(): McpServer {
  const server = new McpServer({ name: 'conformo', version: SERVER_VERSION }, { instructions: INSTRUCTIONS });
  registerTools(server);
  return server;
}
