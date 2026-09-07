import type { CheckResult, InspectionFinding } from "@/runtime/board-inspection/schemas";

type FindingCode = InspectionFinding["code"];
type ReasonsOf<Code extends FindingCode> = Extract<InspectionFinding, { code: Code }>["reason"];

/**
 * Every finding reason the text format knows, per code. The mapped type requires a
 * key for each schema reason, so adding a reason to the schema fails here at
 * compile time until the formatter acknowledges it.
 */
const CLOSED_REASONS: {
	readonly [Code in FindingCode]: { readonly [Reason in ReasonsOf<Code>]: true };
} = {
	INVALID_RENDER_GEOMETRY: {
		"non-data-input": true,
		"invalid-render-fields": true,
		"unlocatable-record": true,
	},
	STALE_LINEAR_DIMENSIONS: { width: true, height: true, "width-and-height": true },
	BROKEN_REFERENCE: {
		"invalid-element-identity": true,
		"duplicate-element-id": true,
		"missing-binding-target": true,
		"invalid-binding-target-type": true,
		"missing-binding-reciprocal": true,
		"malformed-start-binding": true,
		"malformed-end-binding": true,
		"malformed-bound-elements": true,
		"malformed-container-id": true,
		"dangling-bound-text": true,
		"dangling-bound-arrow": true,
		"bound-element-target-type-mismatch": true,
		"conflicting-bound-label-owner": true,
		"persisted-agent-endpoint": true,
		"invalid-node-metadata": true,
		"invalid-code-binding": true,
		"derived-link-persisted": true,
		"invalid-library-attribution": true,
	},
	LABEL_CORRUPTION: {
		orphan: true,
		duplicate: true,
		"missing-reciprocal": true,
		"conflicting-owner": true,
		drift: true,
		"persisted-seed": true,
	},
	FONT_POLICY_VIOLATION: {
		"missing-font-family": true,
		"disallowed-font-family": true,
		"invalid-font-family": true,
	},
	UNSUPPORTED_GEOMETRY: {
		"unsupported-type": true,
		rotation: true,
		curve: true,
		"rounded-or-elbowed": true,
	},
	AMBIGUOUS_GEOMETRY: {
		"points-missing": true,
		"points-not-array": true,
		"points-empty": true,
		"points-one-point": true,
		"malformed-point": true,
		"absolute-point-overflow": true,
		"unrepresentable-coordinate-span": true,
		"unrepresentable-focus-padding": true,
		"zero-length": true,
		"collinear-overlap": true,
	},
	INSPECTION_LIMIT_EXCEEDED: {
		"broad-phase-comparison-ceiling": true,
		"input-complexity-ceiling": true,
	},
	CONNECTOR_PENETRATES_NODE: { "leaf-footprint-interior": true },
	CONNECTOR_PENETRATES_OBSTACLE: { "obstacle-footprint-interior": true },
	CONNECTOR_PENETRATES_TEXT: { "text-interior": true },
	CONNECTOR_INTERSECTION_UNMARKED: { "proper-interior-crossing": true },
	NODE_OVERLAP: { "leaf-footprint-overlap": true },
	LABEL_OVERLAP: { "label-node-overlap": true, "label-label-overlap": true },
	BRIDGE_PROVENANCE_INVALID: { "incomplete-decoration": true, "stale-decoration": true },
};

/**
 * Refuse to format a finding whose code and reason the closed table does not know.
 * @param finding the schema-parsed finding
 */
function verifyClosedFinding(finding: InspectionFinding): void {
	const reasons: Readonly<Record<string, true>> = CLOSED_REASONS[finding.code];
	if (!Object.hasOwn(reasons, finding.reason)) {
		throw new Error(`Unhandled inspection finding: ${JSON.stringify(finding)}`);
	}
}

/**
 * Render a report box as comma-separated numbers.
 * @param value the box, or null
 * @returns `x,y,width,height` or `null`
 */
const bbox = (value: CheckResult["findings"][number]["affectedBBox"]): string =>
	value ? `${value.x},${value.y},${value.width},${value.height}` : "null";

/**
 * Render the identities a finding names: element ids, node ids and obstacle ids.
 * @param finding the finding
 * @returns the comma-joined identities, or `none`
 */
function identitiesOf(finding: InspectionFinding): string {
	return (
		[
			...finding.elements.map((ref) => ref.id ?? `sourceIndex:${ref.sourceIndex}`),
			...finding.nodes.map((ref) => `node:${ref.id}`),
			...finding.obstacles.map((ref) => ref.id),
		].join(",") || "none"
	);
}

/**
 * Format a check result as the stable line-oriented text the CLI prints.
 * @param result the check result including its board name
 * @returns the text report
 */
export function formatInspectionText(result: CheckResult): string {
	const allowed =
		result.policy.allowedFontFamilies === "any"
			? "any"
			: result.policy.allowedFontFamilies.join(",");
	const lines = [
		`board: ${result.board}`,
		`coverage: ${result.coverage}`,
		`clean: ${result.clean}`,
		`severity: error=${result.counts.bySeverity.error} warning=${result.counts.bySeverity.warning}`,
		`limits: input=${result.limits.inputComplexityUnits} broad-phase=${result.broadPhaseComparisons}/${result.limits.broadPhaseComparisons}`,
		`policy: fonts=${allowed} dimension=${result.policy.dimensionTolerance} intersection=${result.policy.intersectionTolerance} overlap=${result.policy.overlapTolerance}`,
	];
	for (const finding of result.findings) {
		verifyClosedFinding(finding);
		const points = finding.points.map((entry) => `${entry.x},${entry.y}`).join(";") || "none";
		lines.push(`${finding.severity} ${finding.code}/${finding.reason}: ${finding.message}`);
		lines.push(
			`  identities=${identitiesOf(finding)} points=${points} affectedBBox=${bbox(finding.affectedBBox)} focusBBox=${bbox(finding.focusBBox)}`,
		);
	}
	return lines.join("\n");
}
