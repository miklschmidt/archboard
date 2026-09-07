import type { DecodedRecord } from "@/runtime/board-inspection/lib/decode";
import { aggregateBoxes, contains, type ExactBox } from "@/runtime/board-inspection/lib/geometry";
import {
	nodeId,
	orderedIdentities,
	validBoundary,
	type AggregateCoordinateFailure,
	type InspectionModel,
	type InspectionNode,
} from "@/runtime/board-inspection/lib/inspection-model";
import { sweepIntervalPairs, type SweepWork } from "@/runtime/board-inspection/lib/interval-sweep";
import { compareIdentity } from "@/runtime/board-inspection/lib/ordering";

type NodeMembership = Pick<InspectionModel, "nodes" | "nodeOfElement" | "aggregateFailures">;

/**
 * Whether a record can be a node member at all: uniquely identified, and locatable.
 * @param record the live record
 * @returns true when the record can join a node
 */
function isLocatableMember(record: DecodedRecord): boolean {
	return record.usableId && record.id !== null && record.box !== null;
}

/**
 * The node a record declares membership of, when the record can be a member at all: it must
 * be uniquely identified and locatable.
 * @param record the live record
 * @returns the node id, or null when the record cannot join one
 */
function declaredNodeId(record: DecodedRecord): string | null {
	const node = nodeId(record);
	if (node === null || !isLocatableMember(record)) {
		return null;
	}
	return node;
}

/**
 * Group live records by the semantic node they declare, keeping only locatable, uniquely identified members.
 * @param live the live decoded records
 * @returns members per node id and the node of each member element
 */
function groupDeclaredMembers(live: readonly DecodedRecord[]): {
	grouped: Map<string, DecodedRecord[]>;
	nodeOfElement: Map<string, string>;
} {
	const grouped = new Map<string, DecodedRecord[]>();
	const nodeOfElement = new Map<string, string>();
	for (const record of live) {
		const node = declaredNodeId(record);
		if (node === null) {
			continue;
		}
		const members = grouped.get(node) ?? [];
		members.push(record);
		grouped.set(node, members);
		nodeOfElement.set(record.id!, node);
	}
	return { grouped, nodeOfElement };
}

/**
 * Attach confirmed labels to the node of their container.
 * @param grouped members per node id, updated in place
 * @param nodeOfElement the node of each member element, updated in place
 * @param byId live records by usable id
 * @param confirmedLabels container id per confirmed label id
 */
function attachConfirmedLabels(
	grouped: Map<string, DecodedRecord[]>,
	nodeOfElement: Map<string, string>,
	byId: ReadonlyMap<string, DecodedRecord>,
	confirmedLabels: ReadonlyMap<string, string>,
): void {
	for (const [labelId, containerId] of confirmedLabels) {
		const owner = nodeOfElement.get(containerId);
		const label = byId.get(labelId);
		if (!owner || !label || nodeOfElement.has(labelId) || !label.box) {
			continue;
		}
		grouped.get(owner)!.push(label);
		nodeOfElement.set(labelId, owner);
	}
}

/**
 * Forget that a set of records belonged to a node, which is what happens when the node's body
 * turns out to have no finite span: nothing may be analysed against a node that does not exist.
 * @param members the node's member records
 * @param nodeOfElement the node of each member element, pruned in place
 */
function forgetMembership(
	members: readonly DecodedRecord[],
	nodeOfElement: Map<string, string>,
): void {
	for (const member of members) {
		if (member.id !== null) {
			nodeOfElement.delete(member.id);
		}
	}
}

/**
 * Build one node from its members, or record why its body has no finite span.
 * @param id the node id
 * @param members the node's member records, labels included
 * @param confirmedLabels container id per confirmed label id
 * @param nodeOfElement the node of each member element, pruned when the body fails
 * @returns the node, or the body aggregate failure
 */
function buildNode(
	id: string,
	members: readonly DecodedRecord[],
	confirmedLabels: ReadonlyMap<string, string>,
	nodeOfElement: Map<string, string>,
):
	| { node: InspectionNode; failure: AggregateCoordinateFailure | null }
	| { failure: AggregateCoordinateFailure } {
	const labels = members.filter((record) => confirmedLabels.has(record.id ?? ""));
	const bodies = members.filter((record) => !confirmedLabels.has(record.id ?? ""));
	const bodyMembers = bodies.length > 0 ? bodies : members;
	const bodyResult = aggregateBoxes(bodyMembers.map((record) => record.box!));
	if (bodyResult.kind !== "representable") {
		forgetMembership(members, nodeOfElement);
		return { failure: { scope: "semantic-node-body", subjectId: id, members: [...bodyMembers] } };
	}
	const aggregateResult = aggregateBoxes(members.map((record) => record.box!));
	const aggregate = aggregateResult.kind === "representable" ? aggregateResult.box : null;
	const elementIds = orderedIdentities(bodies.map((record) => record.id!));
	const labelElementIds = orderedIdentities(labels.map((record) => record.id!));
	return {
		node: {
			id,
			members: [...members],
			bodies,
			labels,
			aggregate,
			body: bodyResult.box,
			boundaries: bodies.filter(validBoundary),
			parentId: null,
			children: [],
			ref: { id, elementIds, labelElementIds },
		},
		failure: aggregate
			? null
			: { scope: "semantic-node-aggregate", subjectId: id, members: [...members] },
	};
}

/**
 * Build the semantic nodes of a board from declared membership and confirmed labels.
 * @param live the live decoded records
 * @param byId live records by usable id
 * @param confirmedLabels container id per confirmed label id
 * @returns the nodes, the node of each member, and any aggregate failures
 */
function buildNodes(
	live: readonly DecodedRecord[],
	byId: ReadonlyMap<string, DecodedRecord>,
	confirmedLabels: ReadonlyMap<string, string>,
): NodeMembership {
	const { grouped, nodeOfElement } = groupDeclaredMembers(live);
	attachConfirmedLabels(grouped, nodeOfElement, byId, confirmedLabels);
	const nodes = new Map<string, InspectionNode>();
	const aggregateFailures: AggregateCoordinateFailure[] = [];
	for (const [id, members] of grouped) {
		const built = buildNode(id, members, confirmedLabels, nodeOfElement);
		if (built.failure) {
			aggregateFailures.push(built.failure);
		}
		if ("node" in built) {
			nodes.set(id, built.node);
		}
	}
	return { nodes, nodeOfElement, aggregateFailures };
}

interface BinaryFactor {
	significand: bigint;
	exponent: number;
}

/**
 * Decompose a finite double into an exact integer significand and binary exponent.
 * @param value the double
 * @returns significand and exponent such that value = significand × 2^exponent
 */
function binaryFactor(value: number): BinaryFactor {
	if (value === 0) {
		return { significand: 0n, exponent: 0 };
	}
	const view = new DataView(new ArrayBuffer(8));
	view.setFloat64(0, value, false);
	const bits = view.getBigUint64(0, false);
	const storedExponent = Number((bits >> 52n) & 0x7ffn);
	const fraction = bits & 0x000f_ffff_ffff_ffffn;
	return storedExponent === 0
		? { significand: fraction, exponent: -1074 }
		: {
				significand: (1n << 52n) | fraction,
				exponent: storedExponent - 1023 - 52,
			};
}

/**
 * The exact area of a box as a binary factor, so areas compare without rounding.
 * @param box the box
 * @returns the exact product of width and height
 */
function areaFactor(box: ExactBox): BinaryFactor {
	const width = binaryFactor(box.width);
	const height = binaryFactor(box.height);
	return {
		significand: width.significand * height.significand,
		exponent: width.exponent + height.exponent,
	};
}

/**
 * The number of binary digits in a non-negative bigint.
 * @param value the bigint
 * @returns its bit length, zero for zero
 */
function bitLength(value: bigint): number {
	return value === 0n ? 0 : value.toString(2).length;
}

/**
 * Compare two bigints.
 * @param a the first value
 * @param b the second value
 * @returns -1, 0 or 1
 */
const compareBigints = (a: bigint, b: bigint): number => (a === b ? 0 : a < b ? -1 : 1);

/**
 * Compare two exact areas.
 * @param aa the first area
 * @param bb the second area
 * @returns -1, 0 or 1 as aa is smaller than, equal to or larger than bb
 */
function compareAreaFactors(aa: BinaryFactor, bb: BinaryFactor): number {
	if (aa.significand === 0n || bb.significand === 0n) {
		return compareBigints(aa.significand, bb.significand);
	}
	const aMagnitude = bitLength(aa.significand) + aa.exponent;
	const bMagnitude = bitLength(bb.significand) + bb.exponent;
	if (aMagnitude !== bMagnitude) {
		return aMagnitude < bMagnitude ? -1 : 1;
	}
	const commonExponent = Math.min(aa.exponent, bb.exponent);
	const alignedA = aa.significand << BigInt(aa.exponent - commonExponent);
	const alignedB = bb.significand << BigInt(bb.exponent - commonExponent);
	return compareBigints(alignedA, alignedB);
}

interface BoundaryCandidate {
	owner: InspectionNode;
	boundary: DecodedRecord;
}

/**
 * Every closed boundary of every node, paired with its owner.
 * @param children the nodes
 * @returns boundary candidates in node then boundary order
 */
function boundaryCandidates(children: readonly InspectionNode[]): BoundaryCandidate[] {
	const boundaries: BoundaryCandidate[] = [];
	for (const owner of children) {
		for (const boundary of owner.boundaries) {
			boundaries.push({ owner, boundary });
		}
	}
	return boundaries;
}

/**
 * Select, per node, the smallest enclosing boundary of another node as its parent.
 * @param children the nodes
 * @param boundaries every boundary candidate
 * @returns the selected parent candidate per child id, and the sweep work
 */
function selectParents(
	children: readonly InspectionNode[],
	boundaries: readonly BoundaryCandidate[],
): { selectedByChild: Map<string, BoundaryCandidate>; work: SweepWork } {
	const childAreas = new Map(children.map((child) => [child.id, areaFactor(child.body)]));
	const boundaryAreas = new Map(
		boundaries.map(({ boundary }) => [boundary, areaFactor(boundary.box!)]),
	);
	const selectedByChild = new Map<string, BoundaryCandidate>();
	/**
	 * Order boundary candidates by area, then by identity, so selection is deterministic.
	 * @param a the first candidate
	 * @param b the second candidate
	 * @returns -1, 0 or 1
	 */
	const candidateOrder = (a: BoundaryCandidate, b: BoundaryCandidate): number =>
		compareAreaFactors(boundaryAreas.get(a.boundary)!, boundaryAreas.get(b.boundary)!) ||
		compareIdentity(a.boundary.id!, b.boundary.id!) ||
		compareIdentity(a.owner.id, b.owner.id);
	/**
	 * Whether a boundary is strictly larger than a child node and contains its body.
	 * @param candidate the boundary candidate
	 * @param child the child node
	 * @returns true when the boundary encloses the child
	 */
	const encloses = (candidate: BoundaryCandidate, child: InspectionNode): boolean =>
		compareAreaFactors(boundaryAreas.get(candidate.boundary)!, childAreas.get(child.id)!) > 0 &&
		contains(candidate.boundary.box!, child.body);
	const work = sweepIntervalPairs(
		children.map((child) => ({
			id: child.id,
			min: child.body.x,
			max: child.body.x + child.body.width,
			value: child,
			semantics: { partition: child.id, excludedPartitions: new Set([child.id]) },
		})),
		boundaries.map((candidate) => ({
			id: candidate.boundary.id!,
			min: candidate.boundary.box!.x,
			max: candidate.boundary.box!.x + candidate.boundary.box!.width,
			value: candidate,
			semantics: {
				partition: candidate.owner.id,
				excludedPartitions: new Set([candidate.owner.id]),
			},
		})),
		false,
		(childInterval, boundaryInterval) => {
			const child = childInterval.value;
			const candidate = boundaryInterval.value;
			if (boundaryInterval.min > childInterval.min || boundaryInterval.max < childInterval.max) {
				return;
			}
			if (!encloses(candidate, child)) {
				return;
			}
			const selected = selectedByChild.get(child.id);
			if (!selected || candidateOrder(candidate, selected) < 0) {
				selectedByChild.set(child.id, candidate);
			}
		},
	);
	return { selectedByChild, work };
}

/**
 * Assign each node its parent and ordered children from enclosing boundaries.
 * @param nodes the nodes, updated in place
 * @returns the sweep work of the hierarchy pass
 */
function assignNodeHierarchy(nodes: Map<string, InspectionNode>): SweepWork {
	const children = [...nodes.values()];
	const { selectedByChild, work } = selectParents(children, boundaryCandidates(children));
	for (const child of children) {
		const selected = selectedByChild.get(child.id);
		if (selected) {
			child.parentId = selected.owner.id;
		}
	}
	work.peakSelections = selectedByChild.size;
	for (const node of nodes.values()) {
		if (node.parentId) {
			nodes.get(node.parentId)!.children.push(node.id);
		}
	}
	for (const node of nodes.values()) {
		node.children = orderedIdentities(node.children);
	}
	return work;
}

export { buildNodes, assignNodeHierarchy };
