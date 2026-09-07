import type { DecodedRecord } from "@/runtime/board-inspection/lib/decode";
import { aggregateBoxes, contains, type ExactBox } from "@/runtime/board-inspection/lib/geometry";
import {
	OBSTACLE_BODY,
	groupIds,
	libraryAttribution,
	orderedIdentities,
	positiveBox,
	unrotated,
	validBoundary,
	type AggregateCoordinateFailure,
	type InspectionModel,
	type InspectionNode,
	type InspectionObstacle,
} from "@/runtime/board-inspection/lib/inspection-model";
import { sweepIntervalPairs, type SweepWork } from "@/runtime/board-inspection/lib/interval-sweep";
import { compareIdentity, obstacleIdentity } from "@/runtime/board-inspection/lib/ordering";

/**
 * Find closed boundaries outside every node that fully contain some node body.
 * @param live the live decoded records
 * @param nodes the semantic nodes
 * @param nodeOfElement the node of each member element
 * @returns the container-only element ids and the sweep work
 */
function findContainerOnlyIds(
	live: readonly DecodedRecord[],
	nodes: ReadonlyMap<string, InspectionNode>,
	nodeOfElement: ReadonlyMap<string, string>,
): { ids: Set<string>; work: SweepWork } {
	const containerOnlyIds = new Set<string>();
	const boundaries = live.filter(
		(record) => !nodeOfElement.has(record.id ?? "") && validBoundary(record),
	);
	const work = sweepIntervalPairs(
		boundaries.map((record) => ({
			id: record.id!,
			min: record.box!.x,
			max: record.box!.x + record.box!.width,
			value: record,
			semantics: { partition: record.id!, excludedPartitions: new Set<string>() },
		})),
		[...nodes.values()].map((node) => ({
			id: node.id,
			min: node.body.x,
			max: node.body.x + node.body.width,
			value: node,
			semantics: { partition: node.id, excludedPartitions: new Set<string>() },
		})),
		false,
		(boundary, node) => {
			if (contains(boundary.value.box!, node.value.body)) {
				containerOnlyIds.add(boundary.value.id!);
			}
		},
	);
	return { ids: containerOnlyIds, work };
}

type ObstacleBody = DecodedRecord & { id: string; type: string; box: ExactBox };

/**
 * Whether a record is an identified, unrotated obstacle body shape with a positive box.
 * @param record the decoded record
 * @returns true for usable rectangle, ellipse and diamond bodies
 */
function obstacleBodyShape(record: DecodedRecord): record is ObstacleBody {
	return (
		record.usableId &&
		record.id !== null &&
		record.type !== null &&
		OBSTACLE_BODY.has(record.type) &&
		positiveBox(record) &&
		unrotated(record)
	);
}

/**
 * The live records that may form obstacles: body shapes outside nodes, labels and containers.
 * @param live the live decoded records
 * @param nodeOfElement the node of each member element
 * @param confirmedLabels container id per confirmed label id
 * @param containerOnlyIds boundaries that only contain nodes
 * @returns the eligible bodies in input order
 */
function eligibleObstacleBodies(
	live: readonly DecodedRecord[],
	nodeOfElement: ReadonlyMap<string, string>,
	confirmedLabels: ReadonlyMap<string, string>,
	containerOnlyIds: ReadonlySet<string>,
): ObstacleBody[] {
	return live.filter(
		(record): record is ObstacleBody =>
			obstacleBodyShape(record) &&
			!nodeOfElement.has(record.id) &&
			!confirmedLabels.has(record.id) &&
			!containerOnlyIds.has(record.id),
	);
}

/** Union-find over element ids whose roots are the identity-first member. */
class IdentityComponents {
	readonly #parent = new Map<string, string>();

	/**
	 * Register an id as its own component.
	 * @param id the element id
	 */
	add(id: string): void {
		this.#parent.set(id, id);
	}

	/**
	 * The root of an id's component, compressing the path on the way.
	 * @param id a registered element id
	 * @returns the component root id
	 */
	find(id: string): string {
		let root = id;
		for (let next = this.#parent.get(root); next !== undefined && next !== root;) {
			root = next;
			next = this.#parent.get(root);
		}
		let current = id;
		while (current !== root) {
			const next = this.#parent.get(current)!;
			this.#parent.set(current, root);
			current = next;
		}
		return root;
	}

	/**
	 * Merge two components under the identity-first root.
	 * @param a an element id
	 * @param b another element id
	 */
	join(a: string, b: string): void {
		const aa = this.find(a);
		const bb = this.find(b);
		if (aa === bb) {
			return;
		}
		if (compareIdentity(aa, bb) < 0) {
			this.#parent.set(bb, aa);
		} else {
			this.#parent.set(aa, bb);
		}
	}
}

/**
 * Join every pair of bodies that share a group id, so one group becomes one component.
 * @param eligible the eligible bodies
 * @param groupsById the readable group ids per body id
 * @param components the accumulating components, joined in place
 */
function joinSharedGroups(
	eligible: readonly ObstacleBody[],
	groupsById: ReadonlyMap<string, readonly string[]>,
	components: IdentityComponents,
): void {
	const firstByGroup = new Map<string, string>();
	for (const record of eligible) {
		for (const group of groupsById.get(record.id) ?? []) {
			const first = firstByGroup.get(group);
			if (first === undefined) {
				firstByGroup.set(group, record.id);
			} else {
				components.join(first, record.id);
			}
		}
	}
}

/**
 * Whether a body carries library attribution that reads cleanly.
 * @param record the body
 * @returns true when the attribution is valid
 */
function hasValidLibraryAttribution(record: ObstacleBody): boolean {
	return libraryAttribution(record)?.valid === true;
}

/**
 * Connect eligible bodies that share a group id into components.
 * @param eligible the eligible bodies
 * @param groupsById the readable group ids per body id
 * @returns members per component root, in first-member order
 */
function connectedComponents(
	eligible: readonly ObstacleBody[],
	groupsById: ReadonlyMap<string, readonly string[]>,
): Map<string, ObstacleBody[]> {
	const components = new IdentityComponents();
	for (const record of eligible) {
		components.add(record.id);
	}
	joinSharedGroups(eligible, groupsById, components);
	const membersByRoot = new Map<string, ObstacleBody[]>();
	for (const record of eligible) {
		const root = components.find(record.id);
		const members = membersByRoot.get(root) ?? [];
		members.push(record);
		membersByRoot.set(root, members);
	}
	return membersByRoot;
}

/**
 * The ordered, unique group ids across a component's members.
 * @param members the component members
 * @param groupsById the readable group ids per body id
 * @returns the group ids in identity order
 */
function componentGroupIds(
	members: readonly ObstacleBody[],
	groupsById: ReadonlyMap<string, readonly string[]>,
): string[] {
	const uniqueGroups = new Set<string>();
	for (const member of members) {
		for (const group of groupsById.get(member.id) ?? []) {
			uniqueGroups.add(group);
		}
	}
	return orderedIdentities([...uniqueGroups]);
}

/**
 * The library attribution entries of a component's validly attributed members.
 * @param validLibrary the members with valid library attribution
 * @returns attribution entries in element identity order
 */
function componentLibrary(
	validLibrary: readonly ObstacleBody[],
): InspectionObstacle["ref"]["library"] {
	return validLibrary
		.map((record) => {
			const attribution = libraryAttribution(record)!;
			return {
				elementId: record.id,
				item: attribution.item!,
				...(attribution.source ? { source: attribution.source } : {}),
			};
		})
		.toSorted((a, b) => compareIdentity(a.elementId, b.elementId));
}

type ObstacleBuild = Pick<
	InspectionModel,
	"obstacles" | "qualifyingGroupedObstacleElementIds" | "aggregateFailures"
>;

/**
 * Record every member of a component that qualifies as an obstacle through a shared group,
 * which is the evidence a grouped obstacle rests on.
 * @param members the component members
 * @param sharedGroup whether the component qualifies through a group at all
 * @param output the accumulating obstacle build, updated in place
 */
function recordQualifyingGroup(
	members: readonly ObstacleBody[],
	sharedGroup: boolean,
	output: ObstacleBuild,
): void {
	if (!sharedGroup) {
		return;
	}
	for (const member of members) {
		output.qualifyingGroupedObstacleElementIds.add(member.id);
	}
}

/**
 * Turn one component into an obstacle, or record why its box has no finite span.
 * @param members the component members
 * @param groupsById the readable group ids per body id
 * @param output the accumulating obstacle build, updated in place
 */
function admitComponent(
	members: readonly ObstacleBody[],
	groupsById: ReadonlyMap<string, readonly string[]>,
	output: ObstacleBuild,
): void {
	const validLibrary = members.filter(hasValidLibraryAttribution);
	const sharedGroup = members.length >= 2;
	if (validLibrary.length === 0 && !sharedGroup) {
		return;
	}
	recordQualifyingGroup(members, sharedGroup, output);
	const elementIds = orderedIdentities(members.map((record) => record.id));
	const id = obstacleIdentity(elementIds);
	const obstacleResult = aggregateBoxes(members.map((record) => record.box));
	if (obstacleResult.kind !== "representable") {
		output.aggregateFailures.push({
			scope: "obstacle-component",
			subjectId: id,
			members: [...members],
		});
		return;
	}
	const kind = validLibrary.length > 0 ? "library-component" : "grouped-component";
	output.obstacles.push({
		id,
		kind,
		members: [...members],
		box: obstacleResult.box,
		ref: {
			id,
			kind,
			elementIds,
			groupIds: componentGroupIds(members, groupsById),
			library: componentLibrary(validLibrary),
		},
	});
}

/**
 * Build the obstacles of a board: library-attributed shapes and grouped shape components.
 * @param live the live decoded records
 * @param nodeOfElement the node of each member element
 * @param confirmedLabels container id per confirmed label id
 * @param containerOnlyIds boundaries that only contain nodes
 * @returns obstacles in identity order, the grouped member ids, and aggregate failures
 */
function buildObstacles(
	live: readonly DecodedRecord[],
	nodeOfElement: ReadonlyMap<string, string>,
	confirmedLabels: ReadonlyMap<string, string>,
	containerOnlyIds: ReadonlySet<string>,
): ObstacleBuild {
	const eligible = eligibleObstacleBodies(live, nodeOfElement, confirmedLabels, containerOnlyIds);
	const groupsById = new Map(eligible.map((record) => [record.id, groupIds(record)]));
	const output: ObstacleBuild = {
		obstacles: [],
		qualifyingGroupedObstacleElementIds: new Set<string>(),
		aggregateFailures: [] as AggregateCoordinateFailure[],
	};
	for (const members of connectedComponents(eligible, groupsById).values()) {
		admitComponent(members, groupsById, output);
	}
	return {
		obstacles: output.obstacles.toSorted((a, b) => compareIdentity(a.id, b.id)),
		qualifyingGroupedObstacleElementIds: output.qualifyingGroupedObstacleElementIds,
		aggregateFailures: output.aggregateFailures,
	};
}

export { findContainerOnlyIds, buildObstacles };
