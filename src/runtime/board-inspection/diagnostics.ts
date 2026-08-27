import { inspectBoard } from "./index.js";
import type { InspectionPolicyInput, InspectionReport } from "./schemas.js";
import { decodeRecords } from "./lib/decode.js";
import { detectBoard } from "./lib/detectors.js";
import { snapshotInspectionInput } from "./lib/input-snapshot.js";
import {
	buildSweepHierarchy,
	emptySweepWork,
	sweepIntervalPairs,
	type SweepWork,
} from "./lib/interval-sweep.js";

export interface InspectionWorkDiagnostics {
	inputUnits: number;
	broadPhaseEvents: number;
	broadPhaseCompatibleVisits: number;
	broadPhaseExpiryPops: number;
	broadPhaseBucketScans: number;
	broadPhaseExactQuerySteps: number;
	broadPhaseHierarchyNodeVisits: number;
	broadPhasePeakActiveBuckets: number;
	broadPhasePeakActiveProfiles: number;
	broadPhasePeakIndexNodes: number;
	hierarchyCandidateVisits: number;
	containerBoundaryCandidateVisits: number;
	pathSegmentChecks: number;
}

export interface BoardInspectionDiagnostics {
	report: InspectionReport;
	work: InspectionWorkDiagnostics;
}

export interface SweepDiagnosticInterval {
	id: string;
	min: number;
	max: number;
	partition: string;
	excludedPartitions?: readonly string[];
	ancestorTargets?: readonly string[];
}

export interface SweepCompatibilityDiagnostics {
	pairs: readonly (readonly [string, string])[];
	work: SweepWork;
}

/** Pure development probe for semantic pair enumeration and coarse work scaling. */
export function diagnoseSweepCompatibility(input: {
	left: readonly SweepDiagnosticInterval[];
	right: readonly SweepDiagnosticInterval[];
	sameSet: boolean;
	hierarchyParents?: ReadonlyMap<string, string | null | undefined>;
	stopAfterPairs?: number;
}): SweepCompatibilityDiagnostics {
	const work = emptySweepWork();
	const hierarchy = input.hierarchyParents
		? buildSweepHierarchy(input.hierarchyParents)
		: undefined;
	const intervals = (items: readonly SweepDiagnosticInterval[]) =>
		items.map((item) => ({
			id: item.id,
			min: item.min,
			max: item.max,
			value: item.id,
			semantics: {
				partition: item.partition,
				excludedPartitions: new Set(item.excludedPartitions ?? []),
				...(item.ancestorTargets ? { ancestorTargets: item.ancestorTargets } : {}),
				...(hierarchy ? { hierarchy } : {}),
			},
		}));
	const pairs: Array<readonly [string, string]> = [];
	sweepIntervalPairs(
		intervals(input.left),
		intervals(input.right),
		input.sameSet,
		(left, right) => {
			pairs.push([left.value, right.value]);
			return input.stopAfterPairs === undefined || pairs.length < input.stopAfterPairs;
		},
		{ work },
	);
	return { pairs, work };
}

/** Pure module-root development evidence; product report bytes contain no work counters. */
export function inspectBoardDiagnostics(
	records: readonly unknown[],
	policyInput?: InspectionPolicyInput,
): BoardInspectionDiagnostics {
	const report = inspectBoard(records, policyInput);
	const snapshot = snapshotInspectionInput(records);
	const empty = (): InspectionWorkDiagnostics => ({
		inputUnits: snapshot.inputUnits,
		broadPhaseEvents: 0,
		broadPhaseCompatibleVisits: 0,
		broadPhaseExpiryPops: 0,
		broadPhaseBucketScans: 0,
		broadPhaseExactQuerySteps: 0,
		broadPhaseHierarchyNodeVisits: 0,
		broadPhasePeakActiveBuckets: 0,
		broadPhasePeakActiveProfiles: 0,
		broadPhasePeakIndexNodes: 0,
		hierarchyCandidateVisits: 0,
		containerBoundaryCandidateVisits: 0,
		pathSegmentChecks: 0,
	});
	if (snapshot.limit) return { report, work: empty() };
	const detection = detectBoard(
		decodeRecords(snapshot.records, snapshot.blockedSourceIndexes),
		report.policy,
	);
	const work = detection.workDiagnostics;
	return {
		report,
		work: {
			inputUnits: snapshot.inputUnits,
			broadPhaseEvents: work.broadPhaseEvents,
			broadPhaseCompatibleVisits: work.broadPhaseActiveVisits,
			broadPhaseExpiryPops: work.broadPhaseExpiryPops,
			broadPhaseBucketScans: work.broadPhaseBucketScans,
			broadPhaseExactQuerySteps: work.broadPhaseExactQuerySteps,
			broadPhaseHierarchyNodeVisits: work.broadPhaseHierarchyNodeVisits,
			broadPhasePeakActiveBuckets: work.broadPhasePeakActiveBuckets,
			broadPhasePeakActiveProfiles: work.broadPhasePeakActiveProfiles,
			broadPhasePeakIndexNodes: work.broadPhasePeakIndexNodes,
			hierarchyCandidateVisits: work.hierarchyCandidateVisits,
			containerBoundaryCandidateVisits: work.containerBoundaryCandidateVisits,
			pathSegmentChecks: work.pathSegmentChecks,
		},
	};
}
