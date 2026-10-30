import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';

/** Thrown for a refused output path; surfaced to the agent as a tool error. */
export class PathPolicyError extends Error {}

export const allowAnyPath = (): boolean => process.env.CONFORMO_MCP_ALLOW_ANY_PATH === '1';

const inside = (root: string, target: string): boolean => {
  const rel = path.relative(root, target);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
};

/** Nearest existing ancestor, resolved through symlinks. */
function realAncestor(p: string): string {
  let cur = p;
  while (!existsSync(cur)) {
    const up = path.dirname(cur);
    if (up === cur) break;
    cur = up;
  }
  return realpathSync(cur);
}

/**
 * Resolves a requested PDF output path. Relative paths resolve against the working directory. Unless
 * CONFORMO_MCP_ALLOW_ANY_PATH=1, the path must stay inside the working directory (symlinks included) and end in .pdf.
 */
export function resolveOutputPath(requested: string, cwd: string = process.cwd()): string {
  if (requested.includes('\0')) throw new PathPolicyError('outputPath contains a NUL byte.');
  const abs = path.resolve(cwd, requested);
  if (!/\.pdf$/i.test(abs)) throw new PathPolicyError('outputPath must end in .pdf.');
  if (allowAnyPath()) return abs;
  const root = realpathSync(cwd);
  if (!inside(path.resolve(cwd), abs) || !inside(root, path.join(realAncestor(path.dirname(abs)), path.basename(abs)))) {
    throw new PathPolicyError(
      `outputPath "${requested}" is outside the server's working directory (${cwd}). Use a relative path inside it, or start the server with CONFORMO_MCP_ALLOW_ANY_PATH=1.`,
    );
  }
  return abs;
}
