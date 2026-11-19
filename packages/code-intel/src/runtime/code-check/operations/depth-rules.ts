// The vault's module-depth rules (TASK-650, ADR 0082): `codeCheck.rules` sets
// the level of a module-depth code. `information` caps a finding's level and
// says that the vault policy set it; `off` removes the finding. A rule only
// lowers, so an incomplete read that made a finding information never makes
// it a warning.
//
// The run applies a reading's rules to its findings once the pass has found
// them, after `MODULE_SHALLOW` was derived from every export's finding, so
// turning a rule off never changes which modules are shallow. The rules belong
// to the vault, so the answer's severities still never depend on the caller.

import type { SemanticPolicy } from "@archboard/model/policy";

/** The level a vault sets for each module-depth code. */
type DepthRules = NonNullable<NonNullable<SemanticPolicy["codeCheck"]>["rules"]>;

/** What a rule reads and changes of a finding. */
interface Ruled {
	readonly code: string;
	readonly severity: "warning" | "information";
	readonly message: string;
}

/**
 * Apply a reading's rules to its findings.
 * @param findings The findings the pass found on the reading.
 * @param rules The reading's rules, if its vault sets any.
 * @returns The findings, those a rule turns off left out and those it lowers at information.
 */
function ruleFindings<Finding extends Ruled>(
	findings: readonly Finding[],
	rules: DepthRules | undefined,
): Finding[] {
	const levels = new Map<string, string>(Object.entries(rules ?? {}));
	return findings.flatMap((finding) => {
		const level = levels.get(finding.code);
		if (level === "off") return [];
		if (level === undefined || finding.severity === "information") return [finding];
		const message = `${finding.message} The vault policy sets ${finding.code} to information.`;
		return [{ ...finding, severity: "information", message }];
	});
}

export { type DepthRules, ruleFindings };
