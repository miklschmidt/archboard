import type { CheckResult, InspectionFinding } from "../schemas.js";

const assertNever = (value: never): never => {
	throw new Error(`Unhandled inspection finding: ${JSON.stringify(value)}`);
};

type FindingFor<Code extends InspectionFinding["code"]> = Extract<
	InspectionFinding,
	{ code: Code }
>;

function verifyInvalidRender(finding: FindingFor<"INVALID_RENDER_GEOMETRY">): void {
	const { reason } = finding;
	switch (reason) {
		case "invalid-render-fields":
		case "unlocatable-record":
			return;
		default:
			return assertNever(reason);
	}
}

function verifyStaleLinear(finding: FindingFor<"STALE_LINEAR_DIMENSIONS">): void {
	const { reason } = finding;
	switch (reason) {
		case "width":
		case "height":
		case "width-and-height":
			return;
		default:
			return assertNever(reason);
	}
}

function verifyBrokenReference(finding: FindingFor<"BROKEN_REFERENCE">): void {
	const { reason } = finding;
	switch (reason) {
		case "invalid-element-identity":
		case "duplicate-element-id":
		case "missing-binding-target":
		case "invalid-binding-target-type":
		case "missing-binding-reciprocal":
		case "malformed-start-binding":
		case "malformed-end-binding":
		case "malformed-bound-elements":
		case "malformed-container-id":
		case "dangling-bound-text":
		case "dangling-bound-arrow":
		case "bound-element-target-type-mismatch":
		case "conflicting-bound-label-owner":
		case "persisted-agent-endpoint":
		case "invalid-node-metadata":
		case "invalid-code-binding":
		case "derived-link-persisted":
		case "invalid-library-attribution":
			return;
		default:
			return assertNever(reason);
	}
}

function verifyLabelCorruption(finding: FindingFor<"LABEL_CORRUPTION">): void {
	const { reason } = finding;
	switch (reason) {
		case "orphan":
		case "duplicate":
		case "missing-reciprocal":
		case "conflicting-owner":
		case "drift":
		case "persisted-seed":
			return;
		default:
			return assertNever(reason);
	}
}

function verifyFontPolicy(finding: FindingFor<"FONT_POLICY_VIOLATION">): void {
	const { reason } = finding;
	switch (reason) {
		case "missing-font-family":
		case "disallowed-font-family":
		case "invalid-font-family":
			return;
		default:
			return assertNever(reason);
	}
}

function verifyUnsupportedGeometry(finding: FindingFor<"UNSUPPORTED_GEOMETRY">): void {
	const { reason } = finding;
	switch (reason) {
		case "unsupported-type":
		case "rotation":
		case "curve":
		case "rounded-or-elbowed":
			return;
		default:
			return assertNever(reason);
	}
}

function verifyAmbiguousGeometry(finding: FindingFor<"AMBIGUOUS_GEOMETRY">): void {
	const { reason } = finding;
	switch (reason) {
		case "points-missing":
		case "points-not-array":
		case "points-empty":
		case "points-one-point":
		case "malformed-point":
		case "absolute-point-overflow":
		case "unrepresentable-coordinate-span":
		case "unrepresentable-focus-padding":
		case "zero-length":
		case "collinear-overlap":
			return;
		default:
			return assertNever(reason);
	}
}

function verifyInspectionLimit(finding: FindingFor<"INSPECTION_LIMIT_EXCEEDED">): void {
	const { reason } = finding;
	switch (reason) {
		case "broad-phase-comparison-ceiling":
		case "broad-phase-preprocessing-ceiling":
			return;
		default:
			return assertNever(reason);
	}
}

function verifyNodePenetration(finding: FindingFor<"CONNECTOR_PENETRATES_NODE">): void {
	const { reason } = finding;
	switch (reason) {
		case "leaf-footprint-interior":
			return;
		default:
			return assertNever(reason);
	}
}

function verifyObstaclePenetration(finding: FindingFor<"CONNECTOR_PENETRATES_OBSTACLE">): void {
	const { reason } = finding;
	switch (reason) {
		case "obstacle-footprint-interior":
			return;
		default:
			return assertNever(reason);
	}
}

function verifyConnectorIntersection(finding: FindingFor<"CONNECTOR_INTERSECTION_UNMARKED">): void {
	const { reason } = finding;
	switch (reason) {
		case "proper-interior-crossing":
			return;
		default:
			return assertNever(reason);
	}
}

function verifyNodeOverlap(finding: FindingFor<"NODE_OVERLAP">): void {
	const { reason } = finding;
	switch (reason) {
		case "leaf-footprint-overlap":
			return;
		default:
			return assertNever(reason);
	}
}

function verifyLabelOverlap(finding: FindingFor<"LABEL_OVERLAP">): void {
	const { reason } = finding;
	switch (reason) {
		case "label-node-overlap":
		case "label-label-overlap":
			return;
		default:
			return assertNever(reason);
	}
}

function verifyClosedFinding(finding: InspectionFinding): void {
	switch (finding.code) {
		case "INVALID_RENDER_GEOMETRY":
			return verifyInvalidRender(finding);
		case "STALE_LINEAR_DIMENSIONS":
			return verifyStaleLinear(finding);
		case "BROKEN_REFERENCE":
			return verifyBrokenReference(finding);
		case "LABEL_CORRUPTION":
			return verifyLabelCorruption(finding);
		case "FONT_POLICY_VIOLATION":
			return verifyFontPolicy(finding);
		case "UNSUPPORTED_GEOMETRY":
			return verifyUnsupportedGeometry(finding);
		case "AMBIGUOUS_GEOMETRY":
			return verifyAmbiguousGeometry(finding);
		case "INSPECTION_LIMIT_EXCEEDED":
			return verifyInspectionLimit(finding);
		case "CONNECTOR_PENETRATES_NODE":
			return verifyNodePenetration(finding);
		case "CONNECTOR_PENETRATES_OBSTACLE":
			return verifyObstaclePenetration(finding);
		case "CONNECTOR_INTERSECTION_UNMARKED":
			return verifyConnectorIntersection(finding);
		case "NODE_OVERLAP":
			return verifyNodeOverlap(finding);
		case "LABEL_OVERLAP":
			return verifyLabelOverlap(finding);
		default:
			return assertNever(finding);
	}
}

const bbox = (value: CheckResult["findings"][number]["affectedBBox"]): string =>
	value ? `${value.x},${value.y},${value.width},${value.height}` : "null";

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
		`broad-phase: ${result.broadPhaseComparisons}/${result.limits.broadPhaseComparisons} preprocessing-limit=${result.limits.broadPhasePreprocessingSteps}`,
		`policy: fonts=${allowed} dimension=${result.policy.dimensionTolerance} intersection=${result.policy.intersectionTolerance} overlap=${result.policy.overlapTolerance}`,
	];
	for (const finding of result.findings) {
		verifyClosedFinding(finding);
		const identities =
			[
				...finding.elements.map((ref) => ref.id ?? `sourceIndex:${ref.sourceIndex}`),
				...finding.nodes.map((ref) => `node:${ref.id}`),
				...finding.obstacles.map((ref) => ref.id),
			].join(",") || "none";
		const points = finding.points.map((entry) => `${entry.x},${entry.y}`).join(";") || "none";
		lines.push(`${finding.severity} ${finding.code}/${finding.reason}: ${finding.message}`);
		lines.push(
			`  identities=${identities} points=${points} affectedBBox=${bbox(finding.affectedBBox)} focusBBox=${bbox(finding.focusBBox)}`,
		);
	}
	return lines.join("\n");
}
