import { inspectBoard } from "./index.js";
import type { InspectionPolicyInput, InspectionReport } from "./schemas.js";
import { decodeRecords } from "./lib/decode.js";
import { detectBoard } from "./lib/detectors.js";
import { sweepIntervalPairs } from "./lib/interval-sweep.js";

export interface InspectionWorkDiagnostics {
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
	broadPhaseCompatibilityTests: number;
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
			broadPhaseCompatibilityTests: work.broadPhaseCompatibilityTests,
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
