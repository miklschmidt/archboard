// A diagnostic as the CLI prints it on one line: `vault check` and the code
// check both write their findings this way.

import { describeSubject } from "@archboard/model-rules";
import type { VaultDiagnostic } from "@archboard/model-contract";

/**
 * A diagnostic as a line of text reads it. A finding of the code check has
 * the same shape with the severity `information` beside `warning` (ADR 0046).
 */
type DiagnosticOfAnySeverity = Omit<VaultDiagnostic, "severity"> & {
	severity: VaultDiagnostic["severity"] | "information";
};
/**
 * One diagnostic as a line of text: severity, where, the node, relationship or
 * step it is about when it names one, and what is wrong.
 * @param issue The diagnostic, or a finding of the code check.
 * @returns The line.
 */
function diagnosticLine(issue: DiagnosticOfAnySeverity): string {
	const where = `${issue.file}${issue.path === undefined ? "" : `:${issue.path}`}`;
	const about = issue.subject === undefined ? "" : `${describeSubject(issue.subject)}: `;
	return `${issue.severity}: ${where}: ${about}${issue.message}`;
}

export { diagnosticLine };
