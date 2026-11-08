// Whether the action's step fails. The CLI's exit status is the authority on findings: 0 passes,
// 1 means a semantic diagnostic or a warning remains (information never fails), and 2 or more is
// a refusal, a usage error or an unreachable server, which no configuration forgives.
// `allow-codes` names findings that are shown and never block: when every error and warning left
// is allowed, an exit status of 1 passes.

/* oxlint-disable archboard/absolute-imports -- actions/ has no # imports; sibling imports stay relative */
import type { Finding } from "./findings.ts";

/** What `fail-on` can say: fail the step when the CLI exits 1, or never fail on findings. */
type FailOn = "warning" | "never";

/** The decision, and the sentence that says why. */
interface Outcome {
	readonly failed: boolean;
	readonly reason: string;
}

/**
 * Read the `fail-on` input.
 * @param value The input.
 * @returns The setting.
 * @throws {Error} When the value is neither `warning` nor `never`.
 */
function parseFailOn(value: string): FailOn {
	if (value === "warning" || value === "never") return value;
	throw new Error(
		`fail-on is "${value}". Use "warning" to fail on findings, or "never" to report only.`,
	);
}

/**
 * Read the `allow-codes` input.
 * @param value Codes separated by newlines or commas.
 * @returns The codes.
 */
function parseAllowCodes(value: string): Set<string> {
	return new Set(
		value
			.split(/[\n,]/u)
			.map((code) => code.trim())
			.filter((code) => code !== ""),
	);
}

/**
 * How many findings still block: errors and warnings whose code is not allowed.
 * @param findings The findings.
 * @param allowed The allowed codes.
 * @returns The count.
 */
function countBlocking(findings: readonly Finding[], allowed: ReadonlySet<string>): number {
	return findings.filter((finding) => finding.level !== "information" && !allowed.has(finding.code))
		.length;
}

/**
 * Decide whether the step fails.
 * @param exitCode The exit status of `archboard check`.
 * @param failOn The `fail-on` setting.
 * @param blocking How many findings are not allowed, when the answer was read and some codes are allowed.
 * @returns Whether to fail, and why.
 */
function decideOutcome(exitCode: number, failOn: FailOn, blocking?: number): Outcome {
	if (exitCode === 0) return { failed: false, reason: "archboard check passed." };
	if (exitCode === 1 && blocking === 0) {
		return {
			failed: false,
			reason: "archboard check found only findings that allow-codes lets through.",
		};
	}
	if (exitCode === 1) {
		return failOn === "warning"
			? { failed: true, reason: "archboard check found a diagnostic or a warning." }
			: {
					failed: false,
					reason:
						"archboard check found a diagnostic or a warning; fail-on is never, so the step passes.",
				};
	}
	return { failed: true, reason: `archboard check could not run: it exited ${String(exitCode)}.` };
}

export { countBlocking, decideOutcome, parseAllowCodes, parseFailOn, type FailOn, type Outcome };
