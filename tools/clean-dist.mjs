// Empties <package>/dist before a build, so a release can never contain files from an earlier build.
import { rmSync } from 'node:fs';
rmSync('dist', { recursive: true, force: true });
