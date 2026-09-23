import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { runValidate } from '../packages/cli/src/commands/validate.js';

// Regression: `validate <file>` used to let the Node validate()'s
// non-CII-input error escape unwrapped from `runValidate`, so a caller
// (a shell, a CI job, an agent) saw a raw stack trace instead of the clean
// one-line message the error already carries — inconsistent with `parse`,
// which has always handled this the right way. Found by an independent
// review that actually ran the command against a non-invoice file.
describe('cli validate: non-CII input', () => {
  let dir: string | undefined;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = undefined;
    vi.restoreAllMocks();
  });

  it('reports a clean one-line error and a non-zero exit code, not a thrown exception', async () => {
    dir = mkdtempSync(path.join(tmpdir(), 'invoice-engine-cli-test-'));
    const file = path.join(dir, 'not-an-invoice.xml');
    writeFileSync(file, '<hello><world/></hello>');

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const originalExitCode = process.exitCode;
    process.exitCode = undefined;

    await expect(runValidate([file])).resolves.toBeUndefined();

    expect(process.exitCode).toBe(1);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0]![0]).toMatch(/CrossIndustryInvoice/);
    expect(errorSpy.mock.calls[0]![0]).not.toMatch(/at\s+\S+\s+\(/); // no stack trace frame

    process.exitCode = originalExitCode;
  });
});
