import { inspectBoard } from "./index.js";
import type { InspectionPolicyInput, InspectionReport } from "./schemas.js";
import { decodeRecords } from "./lib/decode.js";
import { detectBoard } from "./lib/detectors.js";

export interface InspectionWorkDiagnostics {
	broadPhaseEvents: number;
	broadPhaseCompatibleVisits: number;
	broadPhaseExpiryPops: number;
	broadPhasePartitionChecks: number;
	hierarchyEvents: number;
	hierarchyCandidateVisits: number;
	hierarchyExpiryPops: number;
	hierarchyPartitionChecks: number;
	pathSegmentChecks: number;
}

export interface BoardInspectionDiagnostics {
	report: InspectionReport;
	work: InspectionWorkDiagnostics;
}

/** Pure development evidence for the production inspector's preprocessing work. */
export function inspectBoardDiagnostics(
	records: readonly unknown[],
	policyInput?: InspectionPolicyInput,
): BoardInspectionDiagnostics {
	const report = inspectBoard(records, policyInput);
	const detection = detectBoard(decodeRecords(records), report.policy);
	const work = detection.preprocessingWork;
	return {
		report,
		work: {
			broadPhaseEvents: work.broadPhaseEvents,
			broadPhaseCompatibleVisits: work.broadPhaseActiveVisits,
			broadPhaseExpiryPops: work.broadPhaseExpiryPops,
			broadPhasePartitionChecks: work.broadPhasePartitionChecks,
			hierarchyEvents: work.hierarchyEvents,
			hierarchyCandidateVisits: work.hierarchyCandidateVisits,
			hierarchyExpiryPops: work.hierarchyExpiryPops,
			hierarchyPartitionChecks: work.hierarchyPartitionChecks,
			pathSegmentChecks: work.pathSegmentChecks,
		},
	};
}
