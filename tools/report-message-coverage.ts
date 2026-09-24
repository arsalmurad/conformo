/** CLI wrapper around @conformo/validate's computeCoverage() — see
 * that module for what it measures and why it reads the compiled artefact
 * rather than a hardcoded count. */
import { computeCoverage } from '@conformo/validate/coverage';

const report = computeCoverage();
console.log(`${report.writtenRules} of ${report.totalRules} EN 16931 rules have a hand-written plain-language message (${report.percent}%).`);
if (report.missingRuleIds.length > 0) {
  console.log(`\nStill raw-Schematron-only (${report.missingRuleIds.length}): ${report.missingRuleIds.join(', ')}`);
}
