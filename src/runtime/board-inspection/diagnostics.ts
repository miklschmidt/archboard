import { inspectBoard } from "@/runtime/board-inspection";
import type {
	InspectionFinding,
	InspectionPolicyInput,
	InspectionReport,
} from "@/runtime/board-inspection/schemas";
import { decodeRecords } from "@/runtime/board-inspection/lib/decode";
import { detectBoard } from "@/runtime/board-inspection/lib/detectors";
import { snapshotInspectionInput } from "@/runtime/board-inspection/lib/input-snapshot";
import {
	buildSweepHierarchy,
	emptySweepWork,
	sweepIntervalPairs,
	type SweepWork,
} from "@/runtime/board-inspection/lib/interval-sweep";

interface InspectionWorkDiagnostics {
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

interface BoardInspectionDiagnostics {
	report: InspectionReport;
	work: InspectionWorkDiagnostics;
}

interface SweepDiagnosticInterval {
	id: string;
	min: number;
	max: number;
	partition: string;
	excludedPartitions?: readonly string[];
	ancestorTargets?: readonly string[];
}

interface SweepCompatibilityDiagnostics {
	pairs: readonly (readonly [string, string])[];
	work: SweepWork;
}

interface ComparisonBudgetDiagnostics {
	findings: readonly InspectionFinding[];
	broadPhaseComparisons: number;
}

/** What one sweep probe runs: two interval sets, their semantics, and where to stop. */
interface SweepCompatibilityProbe {
	left: readonly SweepDiagnosticInterval[];
	right: readonly SweepDiagnosticInterval[];
	sameSet: boolean;
	hierarchyParents?: ReadonlyMap<string, string | null | undefined>;
	stopAfterPairs?: number;
}

/**
 * Pure development probe for semantic pair enumeration and coarse work scaling.
 * @param input the two interval sets, whether they are the same set, any hierarchy the
 * exclusions consult, and the pair count to stop after
 * @returns the pairs the sweep enumerated and the work it did
 */
function diagnoseSweepCompatibility(input: SweepCompatibilityProbe): SweepCompatibilityDiagnostics {
	const work = emptySweepWork();
	const hierarchy = input.hierarchyParents
		? buildSweepHierarchy(input.hierarchyParents)
		: undefined;
	/**
	 * Turn probe intervals into sweep intervals carrying the probe's own semantics.
	 * @param items the probe intervals
	 * @returns the sweep intervals
	 */
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

/**
 * Pure development probe for comparison-limit behavior at a representative budget.
 * @param records the caller-owned input records
 * @param comparisonLimit the eligible-pair ceiling to run under
 * @returns the findings the run retained and how many comparisons it made
 */
function diagnoseComparisonBudget(
	records: readonly unknown[],
	comparisonLimit: number,
): ComparisonBudgetDiagnostics {
	const snapshot = snapshotInspectionInput(records);
	if (snapshot.limit) {
		throw new Error("Comparison diagnostics require input below the snapshot limit.");
	}
	const detection = detectBoard(
		decodeRecords(snapshot.records, snapshot.blockedSourceIndexes),
		inspectBoard([]).policy,
		[],
		[],
		{ comparisonLimit },
	);
	return {
		findings: detection.findings,
		broadPhaseComparisons: detection.broadPhaseComparisons,
	};
}

/**
 * Pure module-root development evidence; product report bytes contain no work counters.
 * @param records the caller-owned input records
 * @param policyInput the inspection policy, when the caller supplies one
 * @returns the report together with the coarse semantic work the run did
 */
function inspectBoardDiagnostics(
	records: readonly unknown[],
	policyInput?: InspectionPolicyInput,
): BoardInspectionDiagnostics {
	const report = inspectBoard(records, policyInput);
	const snapshot = snapshotInspectionInput(records);
	/**
	 * The counters a run that did no semantic work reports.
	 * @returns the zeroed counters, carrying the input units the snapshot measured
	 */
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
	if (snapshot.limit) {
		return { report, work: empty() };
	}
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

export {
	type InspectionWorkDiagnostics,
	type BoardInspectionDiagnostics,
	type SweepDiagnosticInterval,
	type SweepCompatibilityDiagnostics,
	type ComparisonBudgetDiagnostics,
	diagnoseSweepCompatibility,
	diagnoseComparisonBudget,
	inspectBoardDiagnostics,
};
