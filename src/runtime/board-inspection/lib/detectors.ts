import type { InspectionFinding, InspectionPolicy } from "@/runtime/board-inspection/schemas";
import { type DecodedRecord } from "@/runtime/board-inspection/lib/decode";
import { buildInspectionModel } from "@/runtime/board-inspection/lib/model";
import type { ValidBridgeDecoration } from "@/runtime/board-inspection/bridge";
import {
	BROAD_PHASE_COMPARISON_LIMIT,
	emptySweepWork,
	terminalFinalizeFindings,
	type DetectionResult,
} from "@/runtime/board-inspection/lib/finding-builder";
import {
	coordinateSpanFindings,
	focusPaddingFindings,
	identityFindings,
	renderFindings,
} from "@/runtime/board-inspection/lib/detect-identity";
import { structuralFindings } from "@/runtime/board-inspection/lib/detect-elements";
import { labelFindings } from "@/runtime/board-inspection/lib/detect-labels";
import { collisionFindings } from "@/runtime/board-inspection/lib/detect-collisions";

function detectBoard(
	records: readonly DecodedRecord[],
	policy: InspectionPolicy,
	initialFindings: readonly InspectionFinding[] = [],
	validBridges: readonly ValidBridgeDecoration[] = [],
	options: { comparisonLimit?: number } = {},
): DetectionResult {
	const findings = [...initialFindings];
	findings.push(...renderFindings(records), ...identityFindings(records));
	const model = buildInspectionModel(records);
	const structural = structuralFindings(records, policy, model);
	findings.push(...structural.findings);
	findings.push(...labelFindings(records, model));
	const collisions = collisionFindings(
		records,
		model,
		structural.segments,
		policy,
		{
			findings: [],
			broadPhaseComparisons: 0,
			sweepWork: emptySweepWork(),
			terminalLimit: null,
		},
		validBridges,
		options.comparisonLimit ?? BROAD_PHASE_COMPARISON_LIMIT,
	);
	findings.push(...collisions.findings);
	findings.push(...coordinateSpanFindings(records, model, findings));
	findings.push(...focusPaddingFindings(findings));
	return {
		findings: terminalFinalizeFindings(findings),
		broadPhaseComparisons: collisions.broadPhaseComparisons,
		workDiagnostics: {
			broadPhaseEvents: collisions.sweepWork.events,
			broadPhaseActiveVisits: collisions.sweepWork.activeVisits,
			broadPhaseExpiryPops: collisions.sweepWork.expiryPops,
			broadPhaseBucketScans: collisions.sweepWork.bucketScans,
			broadPhaseExactQuerySteps: collisions.sweepWork.exactQuerySteps,
			broadPhaseHierarchyNodeVisits: collisions.sweepWork.hierarchyNodeVisits,
			broadPhasePeakActiveBuckets: collisions.sweepWork.peakActiveBuckets,
			broadPhasePeakActiveProfiles: collisions.sweepWork.peakActiveProfiles,
			broadPhasePeakIndexNodes: collisions.sweepWork.peakIndexNodes,
			hierarchyCandidateVisits: model.hierarchyWork.activeVisits,
			containerBoundaryCandidateVisits: model.containerBoundaryWork.activeVisits,
			pathSegmentChecks: structural.pathSegmentChecks,
		},
	};
}

export { BROAD_PHASE_COMPARISON_LIMIT, detectBoard };
