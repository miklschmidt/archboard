import { inspectBoard } from "./index.js";
import type { InspectionPolicyInput, InspectionReport } from "./schemas.js";
import { decodeRecords } from "./lib/decode.js";
import { detectBoard } from "./lib/detectors.js";
import { buildSweepHierarchy, sweepIntervalPairs, type SweepWork } from "./lib/interval-sweep.js";
import {
	comparePreprocessingIdentity,
	encodePreprocessingObstacleIdentity,
	PreprocessingBudget,
	PreprocessingCeilingReached,
	stablePreprocessingSort,
	type PreprocessingPass,
	type PreprocessingPhase,
} from "./lib/preprocessing-budget.js";

export interface StableSortDiagnostics {
	ordered: readonly string[];
	preprocessingSteps: number;
}

export interface ObstacleIdentityEncodingDiagnostics {
	id: string;
	preprocessingSteps: number;
}

/** Count the production obstacle identity escaping and joining owner. */
export function diagnoseObstacleIdentityEncoding(
	canonicalElementIds: readonly string[],
): ObstacleIdentityEncodingDiagnostics {
	const budget = new PreprocessingBudget();
	const id = encodePreprocessingObstacleIdentity(canonicalElementIds, budget, "container-boundary");
	return { id, preprocessingSteps: budget.used };
}

/** Count the production stable-order owner's storage and identity work. */
export function diagnoseStablePreprocessingSort(values: readonly string[]): StableSortDiagnostics {
	const budget = new PreprocessingBudget();
	const ordered = stablePreprocessingSort(
		values,
		budget,
		"connector-intersection",
		"order-events",
		(left, right) =>
			comparePreprocessingIdentity(budget, "connector-intersection", "order-events", left, right),
	);
	return { ordered, preprocessingSteps: budget.used };
}

export interface InspectionWorkDiagnostics {
	/** Inspection-owned logical preprocessing units completed before any ceiling. */
	preprocessingSteps: number;
	/** Start events processed across collision passes. */
	broadPhaseEvents: number;
	/** Semantically eligible interval items delivered to the public-comparison visitor. */
	broadPhaseCompatibleVisits: number;
	broadPhaseExpiryPops: number;
	/** Active buckets inspected by the exact fallback; equal to compatibility tests. */
	broadPhasePartitionChecks: number;
	broadPhaseBucketScans: number;
	/** Sum of the separately reported bucket lookups, updates, and deletions. */
	broadPhaseBucketIndexOperations: number;
	broadPhaseBucketLookups: number;
	broadPhaseBucketUpdates: number;
	broadPhaseBucketDeletes: number;
	/** Adds/removes of active bucket references in exact exclusion indexes. */
	broadPhaseCompatibilityIndexUpdates: number;
	/** Canonical exact-content profiles built during event preprocessing. */
	broadPhaseCompatibilityProfiles: number;
	/** Exact exclusion/ancestor entries copied while snapshotting runtime inputs. */
	broadPhaseProfileSnapshotEntries: number;
	broadPhaseProfileSortComparisons: number;
	broadPhaseProfileTerminalLookups: number;
	broadPhaseProfileCreations: number;
	/** Nested exact-string profile-index edges traversed during snapshot interning. */
	broadPhaseProfileTrieSteps: number;
	broadPhaseCompatibilityQueries: number;
	/** Candidate additions and set membership probes performed by compatibility queries. */
	broadPhaseCompatibilityQuerySteps: number;
	/** Segment-tree nodes rewritten while exact compatibility buckets change. */
	broadPhaseExactIndexUpdates: number;
	/** Exact compatibility tree nodes examined by output-sensitive queries. */
	broadPhaseExactQuerySteps: number;
	/** Exact excluded-partition membership probes, including binary summary probes. */
	broadPhaseExactMembershipTests: number;
	/** Exact identity elements compared while reconciling segment summaries. */
	broadPhaseIdentityIntersectionComparisons: number;
	/** Summary values consumed while reducing and merging exact hierarchy coverage. */
	broadPhaseSummaryMergeSteps: number;
	/** Hierarchy-summary intersections performed while maintaining the exact index. */
	broadPhaseHierarchySummarySteps: number;
	broadPhaseCompatibilityTests: number;
	/** Exact hierarchy ancestor predicates evaluated after indexed pruning. */
	broadPhaseHierarchyMembershipTests: number;
	broadPhaseHierarchyPathQueries: number;
	/** Fenwick cells read plus heavy-light ranges visited. */
	broadPhaseHierarchyPathSteps: number;
	broadPhaseHierarchySubtreeQueries: number;
	/** Segment-tree range-loop iterations. */
	broadPhaseHierarchySubtreeSteps: number;
	/** Fenwick and segment-tree cells rewritten by active bucket changes. */
	broadPhaseHierarchyIndexUpdateSteps: number;
	/** Peaks count active state only; preprocessed event records are counted above. */
	broadPhasePeakRetainedBuckets: number;
	broadPhasePeakRetainedProfiles: number;
	broadPhasePeakRetainedProfileTrieNodes: number;
	broadPhasePeakRetainedHierarchyIndexCells: number;
	broadPhasePeakRetainedExclusionRefs: number;
	broadPhasePeakRetainedIndexRefs: number;
	broadPhasePeakRetainedQueryRefs: number;
	broadPhasePeakRetainedExactIndexNodes: number;
	broadPhasePeakRetainedExactSummaryRefs: number;
	/** Peak count of every reference retained by the sweep implementation. */
	broadPhasePeakRetainedTotalStateRefs: number;
	hierarchyEvents: number;
	hierarchyCandidateVisits: number;
	hierarchyExpiryPops: number;
	hierarchyPartitionChecks: number;
	hierarchyBucketScans: number;
	hierarchyBucketIndexOperations: number;
	hierarchyCompatibilityProfiles: number;
	hierarchyPeakRetainedSelections: number;
	containerBoundaryEvents: number;
	containerBoundaryCandidateVisits: number;
	containerBoundaryBucketScans: number;
	containerBoundaryPeakRetainedBuckets: number;
	containerBoundaryPeakRetainedIndexRefs: number;
	pathSegmentChecks: number;
}

export interface BoardInspectionDiagnostics {
	report: InspectionReport;
	work: InspectionWorkDiagnostics;
}

export interface MutableProfileSnapshotDiagnostics {
	excludedPairCount: number;
	includedPairCount: number;
	restoredPairCount: number;
	profileSnapshotEntries: readonly [number, number, number];
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
	preprocessingSteps: number;
	preprocessingLimit: {
		pass: PreprocessingPass;
		phase: PreprocessingPhase;
		attempted: 25_000_001;
	} | null;
}

/** Pure development probe for semantic pair enumeration and its owned work. */
export function diagnoseSweepCompatibility(input: {
	left: readonly SweepDiagnosticInterval[];
	right: readonly SweepDiagnosticInterval[];
	sameSet: boolean;
	hierarchyParents?: ReadonlyMap<string, string | null | undefined>;
	/** Stop after this many emitted pairs to exercise production early-return accounting. */
	stopAfterPairs?: number;
	/** Run the production 25M logical preprocessing budget. */
	enforcePreprocessingLimit?: boolean;
}): SweepCompatibilityDiagnostics {
	const budget = input.enforcePreprocessingLimit ? new PreprocessingBudget() : undefined;
	const hierarchy = input.hierarchyParents
		? buildSweepHierarchy(input.hierarchyParents, {
				budget,
				pass: "node-hierarchy",
			})
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
	let work: SweepWork;
	let preprocessingLimit: SweepCompatibilityDiagnostics["preprocessingLimit"] = null;
	try {
		work = sweepIntervalPairs(
			intervals(input.left),
			intervals(input.right),
			input.sameSet,
			(left, right) => {
				pairs.push([left.value, right.value]);
				return input.stopAfterPairs === undefined || pairs.length < input.stopAfterPairs;
			},
			{ budget, pass: "connector-intersection" },
		);
	} catch (error) {
		if (!(error instanceof PreprocessingCeilingReached) || !budget) throw error;
		work = budget.diagnosticState as SweepWork;
		preprocessingLimit = {
			pass: error.pass,
			phase: error.phase,
			attempted: error.attempted,
		};
	}
	return {
		pairs,
		work,
		preprocessingSteps: budget?.used ?? 0,
		preprocessingLimit,
	};
}

/** Prove that runtime-mutable ReadonlySet inputs are snapshotted by exact current content. */
export function diagnoseMutableProfileSnapshots(): MutableProfileSnapshotDiagnostics {
	const exclusions = new Set(["right"]);
	const run = () => {
		let pairCount = 0;
		const work = sweepIntervalPairs(
			[
				{
					id: "left",
					min: 0,
					max: 1,
					value: null,
					semantics: { partition: "left", excludedPartitions: exclusions },
				},
			],
			[
				{
					id: "right",
					min: 0,
					max: 1,
					value: null,
					semantics: { partition: "right", excludedPartitions: new Set<string>() },
				},
			],
			false,
			() => {
				pairCount += 1;
			},
		);
		return { pairCount, snapshotEntries: work.profileSnapshotEntries };
	};
	const excluded = run();
	exclusions.clear();
	const included = run();
	exclusions.add("right");
	const restored = run();
	return {
		excludedPairCount: excluded.pairCount,
		includedPairCount: included.pairCount,
		restoredPairCount: restored.pairCount,
		profileSnapshotEntries: [
			excluded.snapshotEntries,
			included.snapshotEntries,
			restored.snapshotEntries,
		],
	};
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
			preprocessingSteps: work.preprocessingSteps,
			broadPhaseEvents: work.broadPhaseEvents,
			broadPhaseCompatibleVisits: work.broadPhaseActiveVisits,
			broadPhaseExpiryPops: work.broadPhaseExpiryPops,
			broadPhasePartitionChecks: work.broadPhasePartitionChecks,
			broadPhaseBucketScans: work.broadPhaseBucketScans,
			broadPhaseBucketIndexOperations: work.broadPhaseBucketIndexOperations,
			broadPhaseBucketLookups: work.broadPhaseBucketLookups,
			broadPhaseBucketUpdates: work.broadPhaseBucketUpdates,
			broadPhaseBucketDeletes: work.broadPhaseBucketDeletes,
			broadPhaseCompatibilityIndexUpdates: work.broadPhaseCompatibilityIndexUpdates,
			broadPhaseCompatibilityProfiles: work.broadPhaseCompatibilityProfiles,
			broadPhaseProfileSnapshotEntries: work.broadPhaseProfileSnapshotEntries,
			broadPhaseProfileSortComparisons: work.broadPhaseProfileSortComparisons,
			broadPhaseProfileTerminalLookups: work.broadPhaseProfileTerminalLookups,
			broadPhaseProfileCreations: work.broadPhaseProfileCreations,
			broadPhaseProfileTrieSteps: work.broadPhaseProfileTrieSteps,
			broadPhaseCompatibilityQueries: work.broadPhaseCompatibilityQueries,
			broadPhaseCompatibilityQuerySteps: work.broadPhaseCompatibilityQuerySteps,
			broadPhaseExactIndexUpdates: work.broadPhaseExactIndexUpdates,
			broadPhaseExactQuerySteps: work.broadPhaseExactQuerySteps,
			broadPhaseExactMembershipTests: work.broadPhaseExactMembershipTests,
			broadPhaseIdentityIntersectionComparisons: work.broadPhaseIdentityIntersectionComparisons,
			broadPhaseSummaryMergeSteps: work.broadPhaseSummaryMergeSteps,
			broadPhaseHierarchySummarySteps: work.broadPhaseHierarchySummarySteps,
			broadPhaseCompatibilityTests: work.broadPhaseCompatibilityTests,
			broadPhaseHierarchyMembershipTests: work.broadPhaseHierarchyMembershipTests,
			broadPhaseHierarchyPathQueries: work.broadPhaseHierarchyPathQueries,
			broadPhaseHierarchyPathSteps: work.broadPhaseHierarchyPathSteps,
			broadPhaseHierarchySubtreeQueries: work.broadPhaseHierarchySubtreeQueries,
			broadPhaseHierarchySubtreeSteps: work.broadPhaseHierarchySubtreeSteps,
			broadPhaseHierarchyIndexUpdateSteps: work.broadPhaseHierarchyIndexUpdateSteps,
			broadPhasePeakRetainedBuckets: work.broadPhasePeakRetainedBuckets,
			broadPhasePeakRetainedProfiles: work.broadPhasePeakRetainedProfiles,
			broadPhasePeakRetainedProfileTrieNodes: work.broadPhasePeakRetainedProfileTrieNodes,
			broadPhasePeakRetainedHierarchyIndexCells: work.broadPhasePeakRetainedHierarchyIndexCells,
			broadPhasePeakRetainedExclusionRefs: work.broadPhasePeakRetainedExclusionRefs,
			broadPhasePeakRetainedIndexRefs: work.broadPhasePeakRetainedIndexRefs,
			broadPhasePeakRetainedQueryRefs: work.broadPhasePeakRetainedQueryRefs,
			broadPhasePeakRetainedExactIndexNodes: work.broadPhasePeakRetainedExactIndexNodes,
			broadPhasePeakRetainedExactSummaryRefs: work.broadPhasePeakRetainedExactSummaryRefs,
			broadPhasePeakRetainedTotalStateRefs: work.broadPhasePeakRetainedTotalStateRefs,
			hierarchyEvents: work.hierarchyEvents,
			hierarchyCandidateVisits: work.hierarchyCandidateVisits,
			hierarchyExpiryPops: work.hierarchyExpiryPops,
			hierarchyPartitionChecks: work.hierarchyPartitionChecks,
			hierarchyBucketScans: work.hierarchyBucketScans,
			hierarchyBucketIndexOperations: work.hierarchyBucketIndexOperations,
			hierarchyCompatibilityProfiles: work.hierarchyCompatibilityProfiles,
			hierarchyPeakRetainedSelections: work.hierarchyPeakRetainedSelections,
			containerBoundaryEvents: work.containerBoundaryEvents,
			containerBoundaryCandidateVisits: work.containerBoundaryCandidateVisits,
			containerBoundaryBucketScans: work.containerBoundaryBucketScans,
			containerBoundaryPeakRetainedBuckets: work.containerBoundaryPeakRetainedBuckets,
			containerBoundaryPeakRetainedIndexRefs: work.containerBoundaryPeakRetainedIndexRefs,
			pathSegmentChecks: work.pathSegmentChecks,
		},
	};
}
