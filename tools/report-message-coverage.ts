/** CLI wrapper around @conformo/validate's computeCoverage() — see
 * that module for what it measures and why it reads the compiled artefact
 * rather than a hardcoded count. */
import { computeCoverage } from '@conformo/validate/coverage';

const report = computeCoverage();
console.log(`${report.writtenRules} of ${report.totalRules} EN 16931 rules have a hand-written plain-language message (${report.percent}%).`);
if (report.missingRuleIds.length > 0) {
  console.log(`\nStill raw-Schematron-only (${report.missingRuleIds.length}): ${report.missingRuleIds.join(', ')}`);
}
const s = report.syntax;
console.log(`\n${s.withMessage} of ${s.totalRules} syntax rules (CII-DT, CII-SR, UBL-CR, UBL-DT, UBL-SR) get a plain-language message, by hand-written entry or by family (${s.percent}%).`);
if (s.missingRuleIds.length > 0) {
  console.log(`Syntax rules that keep the publisher's sentence only (${s.missingRuleIds.length}): ${s.missingRuleIds.join(', ')}`);
}
