import fs from 'node:fs';
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { Invoice } from '@conformo/core';

type ToolText = { content: { type: string; text: string }[] };

let client: Client;

beforeAll(async () => {
  client = new Client({ name: 'mcp-server-test', version: '0.0.0' });
  const transport = new StdioClientTransport({ command: 'npx', args: ['tsx', 'packages/mcp-server/src/server.ts'] });
  await client.connect(transport);
}, 30_000);

afterAll(async () => {
  await client.close();
});

describe('mcp-server: create/validate/convert over real MCP stdio transport', () => {
  it('lists exactly the three tools the phase brief asks for', async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(['convert_invoice', 'create_invoice', 'validate_invoice']);
  });

  it('create_invoice serializes a fixture Invoice to CII that validates clean', async () => {
    const invoice = JSON.parse(fs.readFileSync('fixtures/sample-invoice.json', 'utf8')) as Invoice;
    const created = await client.callTool({
      name: 'create_invoice',
      arguments: { invoiceJson: JSON.stringify(invoice), format: 'cii' },
    }) as ToolText;
    expect(created.content[0]!.text).toContain('<rsm:CrossIndustryInvoice');

    const validated = await client.callTool({ name: 'validate_invoice', arguments: { xml: created.content[0]!.text } }) as ToolText;
    expect(validated.content[0]!.text).toMatch(/^VALID —/);
  });

  it('create_invoice reports a structural error rather than throwing raw', async () => {
    const result = await client.callTool({
      name: 'create_invoice',
      arguments: { invoiceJson: '{ not valid json', format: 'cii' },
    }) as ToolText & { isError?: boolean };
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toMatch(/not valid JSON/);
  });

  it('convert_invoice round-trips CII to UBL for the same invoice', async () => {
    const invoice = JSON.parse(fs.readFileSync('fixtures/sample-invoice.json', 'utf8')) as Invoice;
    const cii = (await client.callTool({
      name: 'create_invoice',
      arguments: { invoiceJson: JSON.stringify(invoice), format: 'cii' },
    }) as ToolText).content[0]!.text;

    const converted = await client.callTool({
      name: 'convert_invoice',
      arguments: { source: cii, targetFormat: 'ubl' },
    }) as ToolText;
    expect(converted.content[0]!.text).toContain('Converted from cii to ubl');
    expect(converted.content[0]!.text).toContain('urn:oasis:names:specification:ubl:schema:xsd:Invoice-2');
  });
});
