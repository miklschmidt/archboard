import type { CheckResult, InspectionFinding } from "../schemas.js";

const assertNever = (value: never): never => { throw new Error(`Unhandled inspection finding: ${JSON.stringify(value)}`); };

function verifyClosedFinding(finding: InspectionFinding): void {
	switch (finding.code) {
		case "INVALID_RENDER_GEOMETRY":
			return;
		case "STALE_LINEAR_DIMENSIONS":
			return;
		case "BROKEN_REFERENCE":
			switch (finding.reason) {
				case "invalid-element-identity": case "duplicate-element-id": case "missing-binding-target":
				case "invalid-binding-target-type": case "missing-binding-reciprocal": case "malformed-start-binding":
				case "malformed-end-binding": case "malformed-bound-elements": case "malformed-container-id":
				case "dangling-bound-text": case "dangling-bound-arrow": case "conflicting-bound-label-owner":
				case "persisted-agent-endpoint": case "invalid-node-metadata": case "invalid-code-binding":
				case "derived-link-persisted": case "invalid-library-attribution": return;
			}
			return;
		case "LABEL_CORRUPTION":
			switch (finding.reason) { case "orphan": case "duplicate": case "missing-reciprocal": case "conflicting-owner": case "drift": case "persisted-seed": return; }
			return;
		case "FONT_POLICY_VIOLATION":
			return;
		case "UNSUPPORTED_GEOMETRY":
			return;
		case "AMBIGUOUS_GEOMETRY":
			switch (finding.reason) { case "points-missing": case "points-not-array": case "points-empty": case "points-one-point": case "malformed-point": case "zero-length": case "collinear-overlap": return; }
			return;
		case "INSPECTION_LIMIT_EXCEEDED": case "CONNECTOR_PENETRATES_NODE":
		case "CONNECTOR_PENETRATES_OBSTACLE": case "CONNECTOR_INTERSECTION_UNMARKED":
		case "NODE_OVERLAP": case "LABEL_OVERLAP": return;
		default: return assertNever(finding);
	}
}

const bbox = (value: CheckResult["findings"][number]["affectedBBox"]): string =>
	value ? `${value.x},${value.y},${value.width},${value.height}` : "null";

export function formatInspectionText(result: CheckResult): string {
	const allowed = result.policy.allowedFontFamilies === "any" ? "any" : result.policy.allowedFontFamilies.join(",");
	const lines = [
		`board: ${result.board}`,
		`coverage: ${result.coverage}`,
		`clean: ${result.clean}`,
		`severity: error=${result.counts.bySeverity.error} warning=${result.counts.bySeverity.warning}`,
		`broad-phase: ${result.broadPhaseComparisons}/${result.limits.broadPhaseComparisons}`,
		`policy: fonts=${allowed} dimension=${result.policy.dimensionTolerance} intersection=${result.policy.intersectionTolerance} overlap=${result.policy.overlapTolerance}`,
	];
	for (const finding of result.findings) {
		verifyClosedFinding(finding);
		const identities = [
			...finding.elements.map((ref) => ref.id ?? `sourceIndex:${ref.sourceIndex}`),
			...finding.nodes.map((ref) => `node:${ref.id}`),
			...finding.obstacles.map((ref) => ref.id),
		].join(",") || "none";
		const points = finding.points.map((entry) => `${entry.x},${entry.y}`).join(";") || "none";
		lines.push(`${finding.severity} ${finding.code}/${finding.reason}: ${finding.message}`);
		lines.push(`  identities=${identities} points=${points} affectedBBox=${bbox(finding.affectedBBox)} focusBBox=${bbox(finding.focusBBox)}`);
	}
	return lines.join("\n");
}
