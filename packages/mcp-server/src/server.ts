#!/usr/bin/env node
/**
 * MCP server exposing create/validate/convert 
 * so an agent can issue an EN 16931 electronic invoice, check one against the
 * official Schematron, or convert between syntaxes — without shelling out to
 * the CLI or importing this project's packages directly. Stdio transport,
 * the standard for a locally-spawned MCP server.
 *
 * Every tool wraps an existing, independently-tested library function
 * (packages/formats, packages/validate, packages/parse) rather than
 * reimplementing anything: this file is glue, not logic.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createInvoice, createInvoiceSchema } from './tools/createInvoice.js';
import { validateInvoice, validateInvoiceSchema } from './tools/validateInvoice.js';
import { convertInvoice, convertInvoiceSchema } from './tools/convertInvoice.js';

const server = new McpServer({ name: 'invoice-engine', version: '0.1.0' });

server.registerTool(
  'create_invoice',
  {
    title: 'Create an electronic invoice',
    description: 'Serializes an EN 16931 Invoice (as JSON) into CII, UBL, XRechnung or Peppol BIS XML.',
    inputSchema: createInvoiceSchema,
  },
  createInvoice,
);

server.registerTool(
  'validate_invoice',
  {
    title: 'Validate an electronic invoice',
    description: "Validates CII XML against the official EN 16931 Schematron (and a country's CIUS layer, if given).",
    inputSchema: validateInvoiceSchema,
  },
  validateInvoice,
);

server.registerTool(
  'convert_invoice',
  {
    title: 'Convert an electronic invoice between syntaxes',
    description: 'Reads a CII/UBL/XRechnung XML file or a Factur-X/ZUGFeRD PDF and re-serializes it into a different target syntax.',
    inputSchema: convertInvoiceSchema,
  },
  convertInvoice,
);

const transport = new StdioServerTransport();
await server.connect(transport);
