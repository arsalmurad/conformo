/**
 * What an agent loop does, without the LLM: spawn the Conformo MCP server over stdio, list its tools, call create_invoice,
 * then validate_invoice on the result. No network. Run: npx tsx examples/agent-mcp/client.ts. Exits non-zero if the invoice does not validate.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

/** The server's bin file next to its entry point. In the repo that is TypeScript (run through tsx); from npm it is plain JS. */
function serverCommand(): { command: string; args: string[] } {
  const entry = require.resolve('@conformo/mcp-server');
  const bin = path.join(path.dirname(entry), entry.endsWith('.ts') ? 'server.ts' : 'server.js');
  return bin.endsWith('.ts')
    ? { command: process.execPath, args: [require.resolve('tsx/cli'), bin] }
    : { command: process.execPath, args: [bin] };
}

export interface AgentRun { tools: string[]; xml: string; valid: boolean; ruleSets: string[]; summary: string }

export async function runAgentLoop(invoice: unknown = JSON.parse(readFileSync(path.join(here, 'invoice.json'), 'utf8'))): Promise<AgentRun> {
  const { command, args } = serverCommand();
  const client = new Client({ name: 'scripted-agent', version: '0.0.0' });
  await client.connect(new StdioClientTransport({
    command, args, cwd: here, stderr: 'ignore',
    env: { ...(Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== undefined)) as Record<string, string>), TSX_TSCONFIG_PATH: path.resolve(here, '..', '..', 'tsconfig.json') },
  }));
  try {
    const tools = (await client.listTools()).tools.map((t) => t.name);
    for (const need of ['create_invoice', 'validate_invoice']) if (!tools.includes(need)) throw new Error(`the server does not offer ${need}`);

    const created = await client.callTool({ name: 'create_invoice', arguments: { invoice, format: 'xrechnung-ubl' } });
    if (created.isError) throw new Error(`create_invoice failed: ${JSON.stringify(created.content)}`);
    const xml = (created.structuredContent as { xml: string }).xml;

    const checked = await client.callTool({ name: 'validate_invoice', arguments: { xml } });
    if (checked.isError) throw new Error(`validate_invoice failed: ${JSON.stringify(checked.content)}`);
    const r = checked.structuredContent as { valid: boolean; ruleSets: { id: string }[] };
    const text = (checked.content as { type: string; text: string }[])[0]?.text ?? '';
    return { tools, xml, valid: r.valid, ruleSets: r.ruleSets.map((s) => s.id), summary: text.split('\n')[0] ?? '' };
  } finally {
    await client.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const r = await runAgentLoop();
  console.log(`tools: ${r.tools.join(', ')}`);
  console.log(r.summary);
  if (!r.valid) process.exit(1);
}
