import type { InspectionFinding, InspectionPolicy } from "@/runtime/board-inspection/schemas";
import { type DecodedRecord } from "@/runtime/board-inspection/lib/decode";
import { aggregateBoxes, type Segment } from "@/runtime/board-inspection/lib/geometry";
import {
	type InspectionModel,
	type InspectionNode,
	type InspectionObstacle,
} from "@/runtime/board-inspection/lib/model";
import type { ValidBridgeDecoration } from "@/runtime/board-inspection/bridge";
import {
	BROAD_PHASE_COMPARISON_LIMIT,
	make,
	uniqueRefs,
	type CollisionResult,
} from "@/runtime/board-inspection/lib/finding-builder";
import {
	type ComparisonCounter,
	type PairItem,
} from "@/runtime/board-inspection/lib/collision-sweep";
import {
	connectorEndsOf,
	connectorNodePartitionsOf,
	labelItemsOf,
	nodeItem,
	obstacleItemsOf,
	segmentItemsOf,
	sweepHierarchyOf,
	textItemsOf,
} from "@/runtime/board-inspection/lib/collision-items";
import {
	connectorIntersectionPass,
	connectorNodePass,
	connectorObstaclePass,
	connectorTextPass,
	labelLabelPass,
	labelNodePass,
	nodeOverlapPass,
	type PassContext,
} from "@/runtime/board-inspection/lib/collision-passes";

/** The count the ceiling finding reports, one past the limit the run stops at. */
const CEILING_ATTEMPTED = 2_000_001;

/**
 * Every item set the run built, kept so the ceiling finding can name everything the run was
 * looking at when it ran out of budget. A pass that never ran leaves its set empty.
 */
interface CollisionItems {
	segmentItems: PairItem<Segment>[];
	leafNodeItems: PairItem<InspectionNode>[];
	allNodeItems: PairItem<InspectionNode>[];
	obstacleItems: PairItem<InspectionObstacle>[];
	textItems: PairItem<DecodedRecord>[];
	labelItems: PairItem<DecodedRecord>[];
	textRecords: DecodedRecord[];
	labelRecords: DecodedRecord[];
	leaves: InspectionNode[];
}

/**
 * The finding that says the run stopped comparing rather than finishing, naming the pass that
 * ran out of budget and everything it was looking at, so a reader knows what was not checked.
 * @param counter the exhausted budget
 * @param items the item sets the run built
 * @param model the inspection model
 * @param segments the run's segments
 * @returns the finding
 */
function ceilingFinding(
	counter: ComparisonCounter,
	items: CollisionItems,
	model: InspectionModel,
	segments: readonly Segment[],
): InspectionFinding {
	const everything = [
		...items.segmentItems,
		...items.allNodeItems,
		...items.obstacleItems,
		...items.textItems,
		...items.labelItems,
	];
	const aggregate = aggregateBoxes(everything.map((item) => item.box));
	return make({
		code: "INSPECTION_LIMIT_EXCEEDED",
		reason: "broad-phase-comparison-ceiling",
		severity: "warning",
		affectsCoverage: true,
		details: {
			limit: BROAD_PHASE_COMPARISON_LIMIT,
			attempted: CEILING_ATTEMPTED,
			pass: counter.pass!,
			segmentCount: segments.length,
			nodeCount: items.leaves.length,
			obstacleCount: model.obstacles.length,
			labelCount: items.labelRecords.length,
			textCount: items.textRecords.length,
		},
		message: `Inspection stopped pair analysis at comparison ${counter.value}.`,
		elements: uniqueRefs(everything.flatMap((item) => item.records)),
		affected: aggregateBoxOrNull(aggregate),
	});
}

/**
 * The box the ceiling finding is drawn around, when the things it names have one.
 * @param aggregate what the aggregate of their boxes came to
 * @returns the box, or null when nothing finite stands for them
 */
function aggregateBoxOrNull(
	aggregate: ReturnType<typeof aggregateBoxes>,
): InspectionFinding["affectedBBox"] {
	if (aggregate.kind === "representable") {
		return aggregate.box;
	}
	return aggregate.kind === "unrepresentable" ? aggregate.representative : null;
}

/**
 * The item sets the connector passes work from, built before any comparison is spent.
 * @param records the decoded records
 * @param model the inspection model
 * @param segments the run's segments
 * @returns the item sets, with the ones later passes build left empty
 */
function initialItems(
	records: readonly DecodedRecord[],
	model: InspectionModel,
	segments: readonly Segment[],
): CollisionItems {
	const leaves = [...model.nodes.values()].filter((node) => node.children.length === 0);
	const { textRecords, textItems } = textItemsOf(records, model);
	return {
		segmentItems: segmentItemsOf(segments, model),
		leafNodeItems: leaves.map((node) => nodeItem(node)),
		allNodeItems: [],
		obstacleItems: [],
		textItems,
		labelItems: [],
		textRecords,
		labelRecords: [],
		leaves,
	};
}

/**
 * Run the label passes, which need the node and label item sets the earlier passes did not
 * build. They are only reached when the run still has comparison budget left.
 * @param context the pass context
 * @param items the item sets, filled in place with what these passes build
 * @param records the decoded records
 */
function runLabelPasses(
	context: PassContext,
	items: CollisionItems,
	records: readonly DecodedRecord[],
): void {
	const model = context.model;
	items.allNodeItems = [...model.nodes.values()].map((node) => nodeItem(node));
	const hierarchy = sweepHierarchyOf(model);
	const { labelRecords, labelItems, labelPartitions } = labelItemsOf(records, model, hierarchy);
	items.labelRecords = labelRecords;
	items.labelItems = labelItems;
	labelNodePass(context, labelItems, items.allNodeItems, labelPartitions);
	if (context.counter.limited) {
		return;
	}
	labelLabelPass(
		context,
		labelItems.filter((item) => model.confirmedLabels.has(item.id)),
	);
}

/**
 * Compare everything on the board against everything it could collide with, one pass at a
 * time, and stop the moment the run's comparison budget is spent. The passes run in a fixed
 * order so one board always reports the same ceiling, and each one is skipped once the budget
 * is gone rather than being allowed to report a partial result as a whole one.
 * @param records the decoded records
 * @param model the inspection model
 * @param segments the run's connector segments
 * @param policy the run's policy
 * @param result the run's findings and sweep totals, added to in place
 * @param validBridges the bridge decorations the board carries
 * @param comparisonLimit how many comparisons the run may spend
 * @returns the findings, the comparisons spent, the sweep totals, and any terminal limit
 */
function collisionFindings(
	records: readonly DecodedRecord[],
	model: InspectionModel,
	segments: readonly Segment[],
	policy: InspectionPolicy,
	result: CollisionResult,
	validBridges: readonly ValidBridgeDecoration[],
	comparisonLimit: number,
): CollisionResult {
	const counter: ComparisonCounter = { value: 0, limited: false, pass: null, comparisonLimit };
	const context: PassContext = {
		findings: result.findings,
		counter,
		sweepWork: result.sweepWork,
		model,
		policy,
	};
	const items = initialItems(records, model, segments);
	const hierarchy = sweepHierarchyOf(model);
	const passes: (() => void)[] = [
		() =>
			connectorNodePass(
				context,
				items.segmentItems.filter(
					(item) => connectorEndsOf(model, item.value.connectorId).nodeAnalysisEligible,
				),
				items.leafNodeItems,
				connectorNodePartitionsOf(segments, model, hierarchy),
			),
		() => {
			items.obstacleItems = obstacleItemsOf(model);
			connectorObstaclePass(context, items.segmentItems, items.obstacleItems);
		},
		() => connectorTextPass(context, items.segmentItems, items.textItems),
		() => connectorIntersectionPass(context, items.segmentItems, segments, validBridges),
		() => nodeOverlapPass(context, items.leafNodeItems, items.leaves),
		() => runLabelPasses(context, items, records),
	];
	for (const pass of passes) {
		if (counter.limited) {
			break;
		}
		pass();
	}
	if (counter.limited) {
		result.findings.push(ceilingFinding(counter, items, model, segments));
	}
	return {
		findings: result.findings,
		broadPhaseComparisons: counter.value,
		sweepWork: result.sweepWork,
		terminalLimit: counter.limited ? "comparison" : null,
	};
}

export { collisionFindings };
