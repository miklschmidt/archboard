// The deterministic outcome checks: what a scenario says must be true of the
// vault after the author ran, decided from the saved boards, the vault
// configuration, the checker's report and the renders and inspections the
// harness ran on the checks' behalf. Every verdict carries what was found.

import { boardCheck } from "@/runtime/skill-evaluation/lib/outcomes-board";
import { familyCheck } from "@/runtime/skill-evaluation/lib/outcomes-family";
import {
	finding,
	type CheckVerdict,
	type Finding,
	type InspectedGroup,
	type Reading,
} from "@/runtime/skill-evaluation/lib/reading";
import { CHECK_KINDS, type OutcomeCheck } from "@/runtime/skill-evaluation/lib/suite";

/** A render the harness must attempt before the checks run. */
interface RenderRequest {
	readonly board: string;
	readonly variant?: string | undefined;
	readonly view?: string | undefined;
}

/** An inspection the harness must run before the checks run. */
interface InspectionRequest {
	readonly board: string;
	readonly group: string;
	readonly variant?: string | undefined;
}

/**
 * The renders a scenario's checks ask for.
 * @param checks The scenario's checks.
 * @returns One request per render-ok check.
 */
function renderRequests(checks: readonly OutcomeCheck[]): RenderRequest[] {
	return checks
		.filter((check) => check.check === "render-ok")
		.map((check) => ({ board: check.board ?? "", variant: check.variant, view: check.view }));
}

/**
 * The inspections a scenario's checks ask for.
 * @param checks The scenario's checks.
 * @returns One request per inspect-group check.
 */
function inspectionRequests(checks: readonly OutcomeCheck[]): InspectionRequest[] {
	return checks
		.filter((check) => check.check === "inspect-group")
		.map((check) => ({
			board: check.board ?? "",
			group: check.group ?? "",
			variant: check.variant,
		}));
}

/**
 * Whether the render a check asked for was drawn.
 * @param check The render check.
 * @param reading The reading.
 * @returns The finding.
 */
function renderOk(check: OutcomeCheck, reading: Reading): Finding {
	const attempt = reading.renders.find(
		(render) =>
			render.board === check.board &&
			render.variant === check.variant &&
			render.view === check.view,
	);
	return attempt === undefined
		? finding(false, "the harness did not attempt this render")
		: finding(attempt.ok, attempt.detail);
}

/**
 * Whether the checker reported nothing.
 * @param _check Unused.
 * @param reading The reading.
 * @returns The finding.
 */
function checkClean(_check: OutcomeCheck, reading: Reading): Finding {
	const count = reading.diagnostics.length;
	return finding(
		count === 0,
		count === 0
			? "archboard check reports nothing"
			: `${count} diagnostics: ${reading.diagnostics
					.map((issue) => issue.message)
					.slice(0, 3)
					.join(" | ")}`,
	);
}

/**
 * How an inspection's members compare with what the check wants.
 * @param result The inspection.
 * @param check The check.
 * @returns Names wrongly missing and wrongly present.
 */
function membershipGaps(
	result: InspectedGroup,
	check: OutcomeCheck,
): { readonly missing: string[]; readonly wrongly: string[] } {
	const members = new Set(result.members.map((member) => member.name));
	return {
		missing: (check.membersInclude ?? []).filter((name) => !members.has(name)),
		wrongly: (check.membersExclude ?? []).filter((name) => members.has(name)),
	};
}

/**
 * One line saying what an inspection found.
 * @param result The inspection.
 * @param gaps What was wrong about the members.
 * @returns The line.
 */
function inspectionDetail(result: InspectedGroup, gaps: ReturnType<typeof membershipGaps>): string {
	const members = result.members.map((member) => member.name).join(", ");
	const wrong = [
		...(gaps.missing.length === 0 ? [] : [`missing ${gaps.missing.join(", ")}`]),
		...(gaps.wrongly.length === 0 ? [] : [`wrongly included ${gaps.wrongly.join(", ")}`]),
	];
	return `members [${members}], ${result.internalEdges.length} internal, ${result.boundaryEdges.length} boundary, ${result.neighbors.length} neighbours${wrong.length === 0 ? "" : `; ${wrong.join("; ")}`}`;
}

/**
 * Whether a group inspection named the expected members and excluded the rest.
 * @param check The inspection check.
 * @param reading The reading.
 * @returns The finding.
 */
function inspectGroup(check: OutcomeCheck, reading: Reading): Finding {
	const attempt = reading.inspections.find(
		(inspection) =>
			inspection.board === check.board &&
			inspection.group === check.group &&
			inspection.variant === check.variant,
	);
	if (attempt === undefined) return finding(false, "the harness did not run this inspection");
	if (attempt.result === null) return finding(false, attempt.detail);
	const gaps = membershipGaps(attempt.result, check);
	return finding(
		gaps.missing.length + gaps.wrongly.length === 0,
		inspectionDetail(attempt.result, gaps),
	);
}

/**
 * Whether a value is a plain record.
 * @param value The value.
 * @returns True for a non-null object.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

/**
 * The keys of a wanted record whose configured entry is missing or differs.
 * @param actual The configured record.
 * @param wanted What must be there.
 * @returns The mismatched keys.
 */
function policyMismatches(
	actual: Record<string, unknown>,
	wanted: Record<string, Record<string, unknown>> | undefined,
): string[] {
	return Object.entries(wanted ?? {}).flatMap(([key, fields]) => {
		const entry = actual[key];
		if (!isRecord(entry)) return [key];
		return Object.entries(fields).every(([field, value]) => entry[field] === value) ? [] : [key];
	});
}

/**
 * Whether the configuration holds the stated vocabulary.
 * @param check The relationship kinds, node kinds and groups wanted.
 * @param reading The reading.
 * @returns The finding.
 */
function configHas(check: OutcomeCheck, reading: Reading): Finding {
	const mismatched = [
		...policyMismatches(reading.policy.relationshipKinds, check.relationshipKinds),
		...policyMismatches(reading.policy.nodeKinds, check.nodeKinds),
		...policyMismatches(reading.policy.groups, check.configuredGroups),
	];
	return finding(
		mismatched.length === 0,
		mismatched.length === 0
			? "the configuration holds every stated definition"
			: `not configured as stated: ${mismatched.join(", ")}`,
	);
}

const VAULT_OWNERS: Partial<
	Record<OutcomeCheck["check"], (check: OutcomeCheck, reading: Reading) => Finding>
> = {
	"render-ok": renderOk,
	"check-clean": checkClean,
	"inspect-group": inspectGroup,
	"config-has": configHas,
};

/**
 * Runs every check a scenario states and says what each found. A check no
 * owner claims fails loudly rather than passing by absence.
 * @param checks The scenario's checks.
 * @param reading The reading.
 * @returns One verdict per check, in order.
 */
function evaluateOutcomes(checks: readonly OutcomeCheck[], reading: Reading): CheckVerdict[] {
	return checks.map((check) => {
		const found =
			VAULT_OWNERS[check.check]?.(check, reading) ??
			boardCheck(check, reading) ??
			familyCheck(check, reading);
		return {
			check: check.check,
			...(found ?? finding(false, `no owner for check "${check.check}"`)),
		};
	});
}

/** The check kinds the dispatcher knows, for the suite's own validation. */
const KNOWN_CHECKS = CHECK_KINDS;

export {
	KNOWN_CHECKS,
	evaluateOutcomes,
	inspectionRequests,
	renderRequests,
	type InspectionRequest,
	type OutcomeCheck,
	type RenderRequest,
};
