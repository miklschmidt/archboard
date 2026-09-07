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

/** What a caller may change about one detection run. */
interface DetectionOptions {
	/** The eligible-pair ceiling, when a caller runs under its own rather than the module bound. */
	comparisonLimit?: number;
}

/**
 * Run every detector family over one decoded board and publish what they found. The families
 * run in a fixed order and their findings are ordered once at the end, so one board always
 * produces one report.
 * @param records the decoded records
 * @param policy the inspection policy
 * @param initialFindings findings the input scan and bridge validation already produced
 * @param validBridges the bridge decorations that are current, which detectors read through
 * @param options the eligible-pair ceiling, when a caller sets its own
 * @returns the findings, the comparisons made, and the coarse work counters
 */
function detectBoard(
	records: readonly DecodedRecord[],
	policy: InspectionPolicy,
	initialFindings: readonly InspectionFinding[] = [],
	validBridges: readonly ValidBridgeDecoration[] = [],
	options: DetectionOptions = {},
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
