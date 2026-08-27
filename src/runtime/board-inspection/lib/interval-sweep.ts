import {
	PreprocessingOperations,
	type PreprocessingBudget,
	type PreprocessingPass,
	type PreprocessingPhase,
} from "./preprocessing-budget.js";

export interface SweepInterval<T> {
	id: string;
	min: number;
	max: number;
	value: T;
	semantics: SweepPartition;
}

export interface SweepPartition {
	partition: string;
	excludedPartitions: ReadonlySet<string>;
	/** Nodes whose semantic ancestors are excluded. The hierarchy owns the relation. */
	ancestorTargets?: readonly string[];
	hierarchy?: SweepHierarchy;
}

export interface SweepWork {
	events: number;
	activeVisits: number;
	expiryPops: number;
	partitionChecks: number;
	bucketScans: number;
	bucketIndexOperations: number;
	bucketLookups: number;
	bucketUpdates: number;
	bucketDeletes: number;
	compatibilityIndexUpdates: number;
	compatibilityProfiles: number;
	profileSnapshotEntries: number;
	profileSortComparisons: number;
	profileTerminalLookups: number;
	profileCreations: number;
	profileTrieSteps: number;
	compatibilityQueries: number;
	compatibilityQuerySteps: number;
	exactIndexUpdates: number;
	exactQuerySteps: number;
	exactMembershipTests: number;
	identityIntersectionComparisons: number;
	summaryMergeSteps: number;
	hierarchySummarySteps: number;
	compatibilityTests: number;
	hierarchyMembershipTests: number;
	hierarchyPathQueries: number;
	hierarchyPathSteps: number;
	hierarchySubtreeQueries: number;
	hierarchySubtreeSteps: number;
	hierarchyIndexUpdateSteps: number;
	peakRetainedBuckets: number;
	peakRetainedProfiles: number;
	peakRetainedProfileTrieNodes: number;
	peakRetainedHierarchyIndexCells: number;
	peakRetainedExclusionRefs: number;
	peakRetainedIndexRefs: number;
	/** Candidate references held only for the current compatibility query. */
	peakRetainedQueryRefs: number;
	peakRetainedExactIndexNodes: number;
	peakRetainedExactSummaryRefs: number;
	/** All sweep-owned event, profile, trie, active-node, bucket, index, and hierarchy references. */
	peakRetainedTotalStateRefs: number;
	peakRetainedSelections: number;
}

export interface SweepOptions {
	budget?: PreprocessingBudget;
	pass?: PreprocessingPass;
}

type RuntimeSweepWork = SweepWork & { runtime?: Required<SweepOptions> };

function spend(work: SweepWork, phase: PreprocessingPhase, units = 1): void {
	const runtime = (work as RuntimeSweepWork).runtime;
	if (runtime) runtime.budget.charge(runtime.pass, phase, units);
}

function spendOptions(
	options: SweepOptions | undefined,
	phase: PreprocessingPhase,
	units = 1,
): void {
	if (options?.budget && options.pass) options.budget.charge(options.pass, phase, units);
}

function comparedIdentity(left: string, right: string, charge: (units: number) => void): number {
	const shared = Math.min(left.length, right.length);
	for (let index = 0; index < shared; index += 1) {
		charge(1);
		const aa = left.charCodeAt(index);
		charge(1);
		const bb = right.charCodeAt(index);
		if (aa !== bb) return aa < bb ? -1 : 1;
	}
	return left.length < right.length ? -1 : left.length > right.length ? 1 : 0;
}

function stableSorted<T>(
	values: readonly T[],
	compare: (left: T, right: T) => number,
	charge: (units: number) => void,
): T[] {
	const operations = new PreprocessingOperations(() => charge(1));
	let source = operations.copy(values);
	if (values.length < 2) return source;
	let target = operations.arrayWithLength<T>(values.length);
	for (let width = 1; width < values.length; width *= 2) {
		for (let start = 0; start < values.length; start += width * 2) {
			const middle = Math.min(start + width, values.length),
				end = Math.min(start + width * 2, values.length);
			let left = start,
				right = middle,
				output = start;
			while (left < middle && right < end) {
				const leftValue = operations.read(source, left)!,
					rightValue = operations.read(source, right)!;
				operations.stableComparison();
				const takeLeft = compare(leftValue, rightValue) <= 0;
				operations.write(target, output++, takeLeft ? leftValue : rightValue);
				if (takeLeft) left += 1;
				else right += 1;
			}
			while (left < middle) {
				const value = operations.read(source, left++)!;
				operations.write(target, output++, value);
			}
			while (right < end) {
				const value = operations.read(source, right++)!;
				operations.write(target, output++, value);
			}
		}
		[source, target] = [target, source];
	}
	return source;
}

interface HierarchyNode {
	id: string;
	parent: string | null;
	children: string[];
	size: number;
	heavy: string | null;
	head: string;
	position: number;
}

/** Immutable hierarchy coordinates shared by compatibility profiles in one inspection. */
export interface SweepHierarchy {
	readonly size: number;
	position(id: string, step?: () => void): number | undefined;
	subtree(id: string, step?: () => void): readonly [number, number] | null;
	pathToRoot(id: string, step?: () => void): readonly (readonly [number, number])[];
	isAncestor(ancestor: string, descendant: string, step?: () => void): boolean;
	lca(left: string, right: string, step?: () => void): string | null;
}

/** Build deterministic heavy-light coordinates without retaining per-profile ancestor copies. */
export function buildSweepHierarchy(
	parents: ReadonlyMap<string, string | null | undefined>,
	options?: SweepOptions,
): SweepHierarchy {
	const prepare = new PreprocessingOperations(() => spendOptions(options, "prepare-events"));
	const hierarchyWork = new PreprocessingOperations(() => spendOptions(options, "hierarchy-query"));
	const nodes = prepare.map<string, HierarchyNode>();
	prepare.forEachMap(parents, (_parent, id) => {
		spendOptions(options, "prepare-events", id.length);
		prepare.mapSet(nodes, id, {
			id,
			parent: null,
			children: prepare.array<string>(),
			size: 1,
			heavy: null,
			head: id,
			position: -1,
		});
	});
	prepare.forEachMap(parents, (parent, id) => {
		if (!parent || !prepare.mapHas(nodes, parent) || parent === id) return;
		prepare.mapGet(nodes, id)!.parent = parent;
		prepare.push(prepare.mapGet(nodes, parent)!.children, id);
	});
	prepare.forEachMap(nodes, (node) => {
		node.children = stableSorted(
			node.children,
			(left, right) => {
				return comparedIdentity(left, right, (units) =>
					spendOptions(options, "order-events", units),
				);
			},
			(units) => spendOptions(options, "order-events", units),
		);
	});
	const rootIds = prepare.array<string>();
	prepare.forEachMap(nodes, (node) => {
		if (node.parent !== null) return;
		prepare.push(rootIds, node.id);
	});
	const roots = stableSorted(
		rootIds,
		(left, right) => {
			return comparedIdentity(left, right, (units) => spendOptions(options, "order-events", units));
		},
		(units) => spendOptions(options, "order-events", units),
	);
	const order = hierarchyWork.array<string>();
	const stack = hierarchyWork.array<string>();
	for (let index = roots.length - 1; index >= 0; index -= 1) {
		hierarchyWork.push(stack, hierarchyWork.read(roots, index)!);
	}
	while (stack.length > 0) {
		const id = hierarchyWork.pop(stack)!;
		hierarchyWork.push(order, id);
		const children = hierarchyWork.mapGet(nodes, id)!.children;
		for (let index = children.length - 1; index >= 0; index -= 1)
			hierarchyWork.push(stack, hierarchyWork.read(children, index)!);
	}
	for (let index = order.length - 1; index >= 0; index -= 1) {
		const node = hierarchyWork.mapGet(nodes, hierarchyWork.read(order, index)!)!;
		let heavy: HierarchyNode | null = null;
		for (let childIndex = 0; childIndex < node.children.length; childIndex += 1) {
			const childId = hierarchyWork.read(node.children, childIndex)!;
			const child = hierarchyWork.mapGet(nodes, childId)!;
			node.size += child.size;
			if (
				!heavy ||
				child.size > heavy.size ||
				(child.size === heavy.size &&
					comparedIdentity(child.id, heavy.id, (units) =>
						spendOptions(options, "hierarchy-query", units),
					) < 0)
			)
				heavy = child;
		}
		node.heavy = heavy?.id ?? null;
	}
	let nextPosition = 0;
	const chains = hierarchyWork.array<{ id: string; head: string }>();
	for (let index = roots.length - 1; index >= 0; index -= 1) {
		const id = hierarchyWork.read(roots, index)!;
		hierarchyWork.push(chains, { id, head: id });
	}
	while (chains.length > 0) {
		let { id, head } = hierarchyWork.pop(chains)!;
		while (true) {
			const node = hierarchyWork.mapGet(nodes, id)!;
			node.head = head;
			node.position = nextPosition;
			nextPosition += 1;
			for (let index = node.children.length - 1; index >= 0; index -= 1) {
				const child = hierarchyWork.read(node.children, index)!;
				if (child !== node.heavy) hierarchyWork.push(chains, { id: child, head: child });
			}
			if (!node.heavy) break;
			id = node.heavy;
		}
	}
	return {
		size: nodes.size,
		position: (id, step) => {
			return new PreprocessingOperations(() => step?.()).mapGet(nodes, id)?.position;
		},
		subtree: (id, step) => {
			const node = new PreprocessingOperations(() => step?.()).mapGet(nodes, id);
			return node ? [node.position, node.position + node.size - 1] : null;
		},
		pathToRoot: (id, step) => {
			const operations = new PreprocessingOperations(() => step?.());
			const ranges = operations.array<readonly [number, number]>();
			let node = operations.mapGet(nodes, id);
			while (node) {
				const head = operations.mapGet(nodes, node.head)!;
				operations.push(ranges, [head.position, node.position]);
				node = head.parent ? operations.mapGet(nodes, head.parent) : undefined;
			}
			return ranges;
		},
		isAncestor: (ancestor, descendant, step) => {
			const operations = new PreprocessingOperations(() => step?.());
			const aa = operations.mapGet(nodes, ancestor);
			const dd = operations.mapGet(nodes, descendant);
			return (
				aa !== undefined &&
				dd !== undefined &&
				aa.position <= dd.position &&
				dd.position < aa.position + aa.size
			);
		},
		lca: (left, right, step) => {
			const operations = new PreprocessingOperations(() => step?.());
			let aa = operations.mapGet(nodes, left),
				bb = operations.mapGet(nodes, right);
			if (!aa || !bb) return null;
			while (aa.head !== bb.head) {
				const aHead: HierarchyNode = operations.mapGet(nodes, aa.head)!,
					bHead: HierarchyNode = operations.mapGet(nodes, bb.head)!;
				if (aHead.position > bHead.position) {
					if (!aHead.parent) return null;
					aa = operations.mapGet(nodes, aHead.parent)!;
				} else {
					if (!bHead.parent) return null;
					bb = operations.mapGet(nodes, bHead.parent)!;
				}
			}
			return aa.position <= bb.position ? aa.id : bb.id;
		},
	};
}

interface CompatibilityProfile {
	exclusions: readonly string[];
	excluded: ReadonlySet<string>;
	ancestorTargets: readonly string[];
	hierarchy: SweepHierarchy | undefined;
}

interface ProfileNode {
	children: Map<string, ProfileNode>;
	profiles: Map<SweepHierarchy | null, ProfileNode>;
	profile: CompatibilityProfile | null;
}

interface ActiveNode<T> {
	interval: SweepInterval<T>;
	order: number;
	active: boolean;
	previous: ActiveNode<T> | null;
	next: ActiveNode<T> | null;
	list: ActiveList<T>;
}

interface ActiveList<T> {
	partition: string;
	profile: CompatibilityProfile;
	head: ActiveNode<T> | null;
	tail: ActiveNode<T> | null;
	index: BucketIndex<T>;
	exactRank: number;
}

interface BucketIndex<T> {
	buckets: Map<string, Map<CompatibilityProfile, ActiveList<T>>>;
	activeLists: Set<ActiveList<T>>;
	profileCounts: Map<CompatibilityProfile, number>;
	excludedByPartition: Map<string, Set<ActiveList<T>>>;
	hierarchy: SweepHierarchy | undefined;
	partitionCounts: RangeCount;
	targetCounts: RangeMaximum;
	targetPositionCounts: RangeCount;
	partitionLists: Map<number, Set<ActiveList<T>>>;
	targetLists: Map<number, Set<ActiveList<T>>>;
	unpositionedLists: Set<ActiveList<T>>;
	untargetedLists: Set<ActiveList<T>>;
	exact: ExactCompatibilityIndex<T>;
	totalBuckets: number;
	retainedExclusionRefs: number;
	retainedIndexRefs: number;
	activeNodes: number;
}

const EMPTY_IDENTITIES: readonly string[] = Object.freeze([]);

function identityIntersection(
	left: readonly string[],
	right: readonly string[],
	work: SweepWork,
): readonly string[] {
	if (left === right) return left;
	const operations = new PreprocessingOperations(() => spend(work, "compatibility-query"));
	const intersection = operations.array<string>();
	let aa = 0,
		bb = 0;
	while (aa < left.length && bb < right.length) {
		spend(work, "compatibility-query");
		work.identityIntersectionComparisons += 1;
		const leftValue = operations.read(left, aa)!;
		const rightValue = operations.read(right, bb)!;
		const compared = comparedIdentity(leftValue, rightValue, (units) =>
			spend(work, "compatibility-query", units),
		);
		if (compared === 0) {
			operations.push(intersection, leftValue);
			aa += 1;
			bb += 1;
		} else if (compared < 0) aa += 1;
		else bb += 1;
	}
	if (intersection.length === left.length) return left;
	if (intersection.length === right.length) return right;
	return intersection.length === 0 ? EMPTY_IDENTITIES : intersection;
}

function includesIdentity(values: readonly string[], wanted: string, work: SweepWork): boolean {
	const query = new PreprocessingOperations(() => spend(work, "compatibility-query"));
	let min = 0,
		max = values.length - 1;
	while (min <= max) {
		work.exactMembershipTests += 1;
		const middle = Math.floor((min + max) / 2);
		const compared = comparedIdentity(query.read(values, middle)!, wanted, (units) =>
			spend(work, "compatibility-query", units),
		);
		if (compared === 0) return true;
		if (compared < 0) min = middle + 1;
		else max = middle - 1;
	}
	return false;
}

interface ExactSummary<T> {
	count: number;
	list: ActiveList<T> | null;
	partition: string | null;
	commonExclusions: readonly string[] | null;
	commonTargetCoverage: readonly string[] | null;
}

class ExactCompatibilityIndex<T> {
	readonly size: number;
	readonly summaries: Array<ExactSummary<T>>;
	readonly hierarchy: SweepHierarchy | undefined;
	retainedSummaryRefs = 0;

	constructor(length: number, hierarchy: SweepHierarchy | undefined, work: SweepWork) {
		let size = 1;
		while (size < Math.max(1, length)) size *= 2;
		this.size = size;
		const operations = new PreprocessingOperations(() => spend(work, "prepare-events"));
		const empty: ExactSummary<T> = {
			count: 0,
			list: null,
			partition: null,
			commonExclusions: null,
			commonTargetCoverage: null,
		};
		this.summaries = operations.arrayFilled(size * 2, empty);
		this.hierarchy = hierarchy;
	}

	/** Diagnostic-only observer: these reads do not participate in preprocessing decisions. */
	private diagnosticSummaryRefs(node: number): number {
		// preprocessing-unmetered: retained-state observation must not change the product ceiling.
		const summary = this.summaries[node]!;
		if (summary.count === 0) return 0;
		return (
			(summary.list ? 1 : 0) +
			(summary.partition === null ? 0 : 1) +
			(summary.commonExclusions?.length ?? 0) +
			(summary.commonTargetCoverage?.length ?? 0)
		);
	}

	private reducedCoverage(values: readonly string[], work: SweepWork): readonly string[] {
		if (!this.hierarchy || values.length < 2) return values;
		const operations = new PreprocessingOperations(() => spend(work, "hierarchy-query"));
		const kept = operations.array<string>();
		for (let valueIndex = 0; valueIndex < values.length; valueIndex += 1) {
			const value = operations.read(values, valueIndex)!;
			work.summaryMergeSteps += 1;
			let redundant = false;
			for (let candidateIndex = 0; candidateIndex < kept.length; candidateIndex += 1) {
				const candidate = operations.read(kept, candidateIndex)!;
				work.hierarchyMembershipTests += 1;
				if (this.hierarchy.isAncestor(value, candidate, () => spend(work, "hierarchy-query"))) {
					redundant = true;
					break;
				}
			}
			if (redundant) continue;
			for (let index = kept.length - 1; index >= 0; index -= 1) {
				work.hierarchyMembershipTests += 1;
				if (
					this.hierarchy.isAncestor(operations.read(kept, index)!, value, () =>
						spend(work, "hierarchy-query"),
					)
				)
					operations.spliceOne(kept, index);
			}
			operations.push(kept, value);
		}
		return stableSorted(
			kept,
			(left, right) => {
				return comparedIdentity(left, right, (units) => spend(work, "order-events", units));
			},
			(units) => spend(work, "order-events", units),
		);
	}

	private intersectCoverage(
		left: readonly string[],
		right: readonly string[],
		work: SweepWork,
	): readonly string[] {
		if (left === right) return left;
		if (!this.hierarchy || left.length === 0 || right.length === 0) return EMPTY_IDENTITIES;
		const operations = new PreprocessingOperations(() => spend(work, "hierarchy-query"));
		const lcas = operations.set<string>();
		for (let aaIndex = 0; aaIndex < left.length; aaIndex += 1) {
			const aa = operations.read(left, aaIndex)!;
			for (let bbIndex = 0; bbIndex < right.length; bbIndex += 1) {
				const bb = operations.read(right, bbIndex)!;
				work.summaryMergeSteps += 1;
				work.hierarchySummarySteps += 1;
				const lca = this.hierarchy.lca(aa, bb, () => spend(work, "hierarchy-query"));
				if (lca) operations.setAdd(lcas, lca);
			}
		}
		const lcaValues = operations.array<string>();
		const retainedLcas = operations.setValues(lcas);
		for (let index = 0; index < retainedLcas.length; index += 1)
			operations.push(lcaValues, operations.read(retainedLcas, index)!);
		return this.reducedCoverage(lcaValues, work);
	}

	updateRank(rank: number, list: ActiveList<T> | null, work: SweepWork): void {
		const operations = new PreprocessingOperations(() => spend(work, "activate-or-expire"));
		let node = this.size + rank;
		this.retainedSummaryRefs -= this.diagnosticSummaryRefs(node);
		operations.write(this.summaries, node, {
			count: list ? 1 : 0,
			list,
			partition: list?.partition ?? null,
			commonExclusions: list?.profile.exclusions ?? null,
			commonTargetCoverage: list ? this.reducedCoverage(list.profile.ancestorTargets, work) : null,
		});
		this.retainedSummaryRefs += this.diagnosticSummaryRefs(node);
		work.exactIndexUpdates += 1;
		while (node > 1) {
			node = Math.floor(node / 2);
			this.retainedSummaryRefs -= this.diagnosticSummaryRefs(node);
			const left = node * 2,
				right = left + 1,
				leftSummary = operations.read(this.summaries, left)!,
				rightSummary = operations.read(this.summaries, right)!;
			let next: ExactSummary<T>;
			if (leftSummary.count === 0) {
				next = {
					count: rightSummary.count,
					list: null,
					partition: rightSummary.partition,
					commonExclusions: rightSummary.commonExclusions,
					commonTargetCoverage: rightSummary.commonTargetCoverage,
				};
			} else if (rightSummary.count === 0) {
				next = {
					count: leftSummary.count,
					list: null,
					partition: leftSummary.partition,
					commonExclusions: leftSummary.commonExclusions,
					commonTargetCoverage: leftSummary.commonTargetCoverage,
				};
			} else {
				next = {
					count: leftSummary.count + rightSummary.count,
					list: null,
					partition:
						leftSummary.partition !== null && leftSummary.partition === rightSummary.partition
							? leftSummary.partition
							: null,
					commonExclusions: identityIntersection(
						leftSummary.commonExclusions ?? EMPTY_IDENTITIES,
						rightSummary.commonExclusions ?? EMPTY_IDENTITIES,
						work,
					),
					commonTargetCoverage: this.intersectCoverage(
						leftSummary.commonTargetCoverage ?? EMPTY_IDENTITIES,
						rightSummary.commonTargetCoverage ?? EMPTY_IDENTITIES,
						work,
					),
				};
			}
			operations.write(this.summaries, node, next);
			this.retainedSummaryRefs += this.diagnosticSummaryRefs(node);
			work.exactIndexUpdates += 1;
		}
	}

	query(
		eventProfile: CompatibilityProfile,
		eventPartition: string,
		work: SweepWork,
	): Set<ActiveList<T>> {
		const operations = new PreprocessingOperations(() => spend(work, "compatibility-query"));
		const candidates = operations.set<ActiveList<T>>();
		const walk = (node: number): void => {
			const query = new PreprocessingOperations(() => spend(work, "compatibility-query"));
			work.exactQuerySteps += 1;
			const summary = query.read(this.summaries, node)!;
			if (summary.count === 0) return;
			const partition = summary.partition;
			if (partition != null && partitionExcluded(eventProfile, partition, work)) return;
			const common = summary.commonExclusions;
			if (common && includesIdentity(common, eventPartition, work)) return;
			const commonTargets = summary.commonTargetCoverage;
			if (this.hierarchy && commonTargets)
				for (let targetIndex = 0; targetIndex < commonTargets.length; targetIndex += 1) {
					const target = query.read(commonTargets, targetIndex)!;
					work.hierarchyMembershipTests += 1;
					if (
						this.hierarchy.isAncestor(eventPartition, target, () => spend(work, "hierarchy-query"))
					)
						return;
				}
			if (node >= this.size) {
				const list = summary.list!;
				work.compatibilityQuerySteps += 1;
				new PreprocessingOperations(() => spend(work, "candidate-intersection")).setAdd(
					candidates,
					list,
				);
				return;
			}
			walk(node * 2);
			walk(node * 2 + 1);
		};
		walk(1);
		return candidates;
	}
}

function mergedRanges(
	ranges: readonly (readonly [number, number])[],
	work: SweepWork,
): Array<[number, number]> {
	const prepare = new PreprocessingOperations(() => spend(work, "prepare-events"));
	const copied = prepare.array<[number, number]>();
	for (let index = 0; index < ranges.length; index += 1) {
		const [min, max] = prepare.read(ranges, index)!;
		prepare.push(copied, [min, max]);
	}
	const order = new PreprocessingOperations(() => spend(work, "order-events"));
	const ordered = stableSorted(
		copied,
		(a, b) => {
			return order.read(a, 0)! - order.read(b, 0)! || order.read(a, 1)! - order.read(b, 1)!;
		},
		(units) => spend(work, "order-events", units),
	);
	const merged = prepare.array<[number, number]>();
	for (let index = 0; index < ordered.length; index += 1) {
		const range = prepare.read(ordered, index)!;
		const previous = merged.length === 0 ? undefined : prepare.read(merged, merged.length - 1);
		const rangeMin = prepare.read(range, 0)!;
		const rangeMax = prepare.read(range, 1)!;
		if (!previous || rangeMin > prepare.read(previous, 1)! + 1) prepare.push(merged, range);
		else {
			prepare.write(previous, 1, Math.max(prepare.read(previous, 1)!, rangeMax));
		}
	}
	return merged;
}

class RangeCount {
	readonly size: number;
	readonly values: number[];
	constructor(size: number, work: SweepWork) {
		let treeSize = 1;
		while (treeSize < Math.max(1, size)) treeSize *= 2;
		this.size = treeSize;
		this.values = new PreprocessingOperations(() => spend(work, "prepare-events")).arrayFilled(
			treeSize * 2,
			0,
		);
	}
	adjust(position: number, delta: number, work: SweepWork): number {
		const operations = new PreprocessingOperations(() => spend(work, "activate-or-expire"));
		let steps = 0;
		for (let index = this.size + position; index > 0; index = Math.floor(index / 2)) {
			operations.write(this.values, index, operations.read(this.values, index)! + delta);
			steps += 1;
		}
		return steps;
	}
	range(min: number, max: number, work: SweepWork): { value: number; steps: number } {
		let left = min + this.size,
			right = max + this.size,
			value = 0,
			steps = 0;
		const operations = new PreprocessingOperations(() => spend(work, "hierarchy-query"));
		while (left <= right) {
			steps += 1;
			if (left % 2 === 1) value += operations.read(this.values, left++)!;
			if (right % 2 === 0) value += operations.read(this.values, right--)!;
			left = Math.floor(left / 2);
			right = Math.floor(right / 2);
		}
		return { value, steps };
	}
	positive(min: number, max: number, visit: (position: number) => void, work: SweepWork): number {
		let steps = 0;
		const operations = new PreprocessingOperations(() => spend(work, "hierarchy-query"));
		const walk = (node: number, nodeMin: number, nodeMax: number): void => {
			steps += 1;
			if (operations.read(this.values, node) === 0 || nodeMax < min || nodeMin > max) return;
			if (nodeMin === nodeMax) {
				visit(nodeMin);
				return;
			}
			const middle = Math.floor((nodeMin + nodeMax) / 2);
			walk(node * 2, nodeMin, middle);
			walk(node * 2 + 1, middle + 1, nodeMax);
		};
		walk(1, 0, this.size - 1);
		return steps;
	}
}

class RangeMaximum {
	readonly size: number;
	readonly values: number[];
	constructor(length: number, work: SweepWork) {
		let size = 1;
		while (size < Math.max(1, length)) size *= 2;
		this.size = size;
		this.values = new PreprocessingOperations(() => spend(work, "prepare-events")).arrayFilled(
			size * 2,
			0,
		);
	}
	adjust(position: number, delta: number, work: SweepWork): number {
		const operations = new PreprocessingOperations(() => spend(work, "activate-or-expire"));
		let index = this.size + position;
		operations.write(this.values, index, operations.read(this.values, index)! + delta);
		let steps = 1;
		while (index > 1) {
			index = Math.floor(index / 2);
			operations.write(
				this.values,
				index,
				Math.max(
					operations.read(this.values, index * 2)!,
					operations.read(this.values, index * 2 + 1)!,
				),
			);
			steps += 1;
		}
		return steps;
	}
	max(min: number, max: number, work: SweepWork): { value: number; steps: number } {
		let left = min + this.size,
			right = max + this.size,
			value = 0,
			steps = 0;
		const operations = new PreprocessingOperations(() => spend(work, "hierarchy-query"));
		while (left <= right) {
			steps += 1;
			if (left % 2 === 1) value = Math.max(value, operations.read(this.values, left++)!);
			if (right % 2 === 0) value = Math.max(value, operations.read(this.values, right--)!);
			left = Math.floor(left / 2);
			right = Math.floor(right / 2);
		}
		return { value, steps };
	}
}

function emptyWork(options?: SweepOptions): SweepWork {
	const work: RuntimeSweepWork = {
		events: 0,
		activeVisits: 0,
		expiryPops: 0,
		partitionChecks: 0,
		bucketScans: 0,
		bucketIndexOperations: 0,
		bucketLookups: 0,
		bucketUpdates: 0,
		bucketDeletes: 0,
		compatibilityIndexUpdates: 0,
		compatibilityProfiles: 0,
		profileSnapshotEntries: 0,
		profileSortComparisons: 0,
		profileTerminalLookups: 0,
		profileCreations: 0,
		profileTrieSteps: 0,
		compatibilityQueries: 0,
		compatibilityQuerySteps: 0,
		exactIndexUpdates: 0,
		exactQuerySteps: 0,
		exactMembershipTests: 0,
		identityIntersectionComparisons: 0,
		summaryMergeSteps: 0,
		hierarchySummarySteps: 0,
		compatibilityTests: 0,
		hierarchyMembershipTests: 0,
		hierarchyPathQueries: 0,
		hierarchyPathSteps: 0,
		hierarchySubtreeQueries: 0,
		hierarchySubtreeSteps: 0,
		hierarchyIndexUpdateSteps: 0,
		peakRetainedBuckets: 0,
		peakRetainedProfiles: 0,
		peakRetainedProfileTrieNodes: 1,
		peakRetainedHierarchyIndexCells: 0,
		peakRetainedExclusionRefs: 0,
		peakRetainedIndexRefs: 0,
		peakRetainedQueryRefs: 0,
		peakRetainedExactIndexNodes: 0,
		peakRetainedExactSummaryRefs: 0,
		peakRetainedTotalStateRefs: 0,
		peakRetainedSelections: 0,
	};
	if (options?.budget && options.pass)
		Object.defineProperty(work, "runtime", {
			value: { budget: options.budget, pass: options.pass },
			enumerable: false,
		});
	return work;
}

function compareNode<T>(a: ActiveNode<T>, b: ActiveNode<T>, work: SweepWork): number {
	new PreprocessingOperations(() => spend(work, "activate-or-expire")).stableComparison();
	return a.interval.max - b.interval.max || a.order - b.order;
}

function heapPush<T>(heap: ActiveNode<T>[], node: ActiveNode<T>, work: SweepWork): void {
	const operations = new PreprocessingOperations(() => spend(work, "activate-or-expire"));
	operations.push(heap, node);
	let index = heap.length - 1;
	while (index > 0) {
		const parent = Math.floor((index - 1) / 2);
		const parentNode = operations.read(heap, parent)!;
		if (compareNode(parentNode, node, work) <= 0) break;
		operations.write(heap, index, parentNode);
		index = parent;
	}
	operations.write(heap, index, node);
}

function heapPop<T>(heap: ActiveNode<T>[], work: SweepWork): ActiveNode<T> | undefined {
	const operations = new PreprocessingOperations(() => spend(work, "activate-or-expire"));
	const first = operations.read(heap, 0);
	const last = operations.pop(heap);
	if (!first || !last || heap.length === 0) return first;
	let index = 0;
	while (true) {
		const left = index * 2 + 1;
		if (left >= heap.length) break;
		const right = left + 1;
		const leftNode = operations.read(heap, left)!;
		const child =
			right < heap.length && compareNode(operations.read(heap, right)!, leftNode, work) < 0
				? right
				: left;
		const childNode = child === left ? leftNode : operations.read(heap, child)!;
		if (compareNode(last, childNode, work) <= 0) break;
		operations.write(heap, index, childNode);
		index = child;
	}
	operations.write(heap, index, last);
	return first;
}

function lookup(work: SweepWork, count = 1): void {
	work.bucketLookups += count;
	work.bucketIndexOperations += count;
}

function update(work: SweepWork, count = 1): void {
	work.bucketUpdates += count;
	work.bucketIndexOperations += count;
}

function deleted(work: SweepWork, count = 1): void {
	work.bucketDeletes += count;
	work.bucketIndexOperations += count;
}

function append<T>(list: ActiveList<T>, node: ActiveNode<T>, work: SweepWork): void {
	const wasEmpty = list.head === null;
	spend(work, "activate-or-expire", 3);
	node.previous = list.tail;
	if (list.tail) list.tail.next = node;
	else list.head = node;
	list.tail = node;
	list.index.activeNodes += 1;
	if (wasEmpty) activateList(list, work);
}

function indexRefDelta<T>(list: ActiveList<T>, delta: 1 | -1, work: SweepWork): void {
	const index = list.index;
	const operations = new PreprocessingOperations(() => spend(work, "activate-or-expire"));
	for (const exclusion of list.profile.exclusions) {
		lookup(work);
		let lists = operations.mapGet(index.excludedByPartition, exclusion);
		if (delta === 1) {
			if (!lists) {
				lists = operations.set();
				update(work);
				operations.mapSet(index.excludedByPartition, exclusion, lists);
			}
			operations.setAdd(lists, list);
			work.compatibilityIndexUpdates += 1;
		} else {
			if (lists) operations.setDelete(lists, list);
			work.compatibilityIndexUpdates += 1;
			if (lists?.size === 0) {
				deleted(work);
				operations.mapDelete(index.excludedByPartition, exclusion);
			}
		}
	}
	index.retainedExclusionRefs +=
		delta * (list.profile.exclusions.length + list.profile.ancestorTargets.length);
	index.retainedIndexRefs +=
		delta * (3 + list.profile.exclusions.length + Math.max(1, list.profile.ancestorTargets.length));
	const hierarchy = index.hierarchy;
	if (!hierarchy) return;
	const position = hierarchy.position(list.partition, () => spend(work, "activate-or-expire"));
	if (position !== undefined) {
		work.hierarchyIndexUpdateSteps += index.partitionCounts.adjust(position, delta, work);
		lookup(work);
		let lists = operations.mapGet(index.partitionLists, position);
		if (delta === 1) {
			if (!lists) {
				lists = operations.set();
				update(work);
				operations.mapSet(index.partitionLists, position, lists);
			}
			operations.setAdd(lists, list);
			work.compatibilityIndexUpdates += 1;
		} else {
			if (lists) operations.setDelete(lists, list);
			work.compatibilityIndexUpdates += 1;
			if (lists?.size === 0) {
				deleted(work);
				operations.mapDelete(index.partitionLists, position);
			}
		}
	} else {
		if (delta === 1) operations.setAdd(index.unpositionedLists, list);
		else operations.setDelete(index.unpositionedLists, list);
		work.compatibilityIndexUpdates += 1;
	}
	for (const target of list.profile.ancestorTargets) {
		const targetPosition = hierarchy.position(target, () => spend(work, "activate-or-expire"));
		if (targetPosition !== undefined) {
			work.hierarchyIndexUpdateSteps += index.targetCounts.adjust(targetPosition, delta, work);
			work.hierarchyIndexUpdateSteps += index.targetPositionCounts.adjust(
				targetPosition,
				delta,
				work,
			);
			lookup(work);
			let lists = operations.mapGet(index.targetLists, targetPosition);
			if (delta === 1) {
				if (!lists) {
					lists = operations.set();
					update(work);
					operations.mapSet(index.targetLists, targetPosition, lists);
				}
				operations.setAdd(lists, list);
				work.compatibilityIndexUpdates += 1;
			} else {
				if (lists) operations.setDelete(lists, list);
				work.compatibilityIndexUpdates += 1;
				if (lists?.size === 0) {
					deleted(work);
					operations.mapDelete(index.targetLists, targetPosition);
				}
			}
		}
	}
	if (list.profile.ancestorTargets.length === 0) {
		if (delta === 1) operations.setAdd(index.untargetedLists, list);
		else operations.setDelete(index.untargetedLists, list);
		work.compatibilityIndexUpdates += 1;
	}
}

function activateList<T>(list: ActiveList<T>, work: SweepWork): void {
	const operations = new PreprocessingOperations(() => spend(work, "activate-or-expire"));
	update(work);
	operations.setAdd(list.index.activeLists, list);
	list.index.totalBuckets += 1;
	lookup(work);
	update(work);
	operations.mapSet(
		list.index.profileCounts,
		list.profile,
		(operations.mapGet(list.index.profileCounts, list.profile) ?? 0) + 1,
	);
	indexRefDelta(list, 1, work);
	list.index.exact.updateRank(list.exactRank, list, work);
}

function retireEmptyList<T>(list: ActiveList<T>, work: SweepWork): void {
	if (list.head) return;
	const operations = new PreprocessingOperations(() => spend(work, "activate-or-expire"));
	lookup(work);
	const profiles = operations.mapGet(list.index.buckets, list.partition)!;
	deleted(work);
	operations.mapDelete(profiles, list.profile);
	if (profiles.size === 0) {
		deleted(work);
		operations.mapDelete(list.index.buckets, list.partition);
	}
	deleted(work);
	operations.setDelete(list.index.activeLists, list);
	list.index.totalBuckets -= 1;
	lookup(work);
	const profileCount = operations.mapGet(list.index.profileCounts, list.profile)! - 1;
	if (profileCount === 0) {
		deleted(work);
		operations.mapDelete(list.index.profileCounts, list.profile);
	} else {
		update(work);
		operations.mapSet(list.index.profileCounts, list.profile, profileCount);
	}
	indexRefDelta(list, -1, work);
	list.index.exact.updateRank(list.exactRank, null, work);
}

function remove<T>(node: ActiveNode<T>, work: SweepWork): void {
	if (!node.active) return;
	const list = node.list;
	spend(work, "activate-or-expire", 4);
	if (node.previous) node.previous.next = node.next;
	else list.head = node.next;
	if (node.next) node.next.previous = node.previous;
	else list.tail = node.previous;
	node.active = false;
	list.index.activeNodes -= 1;
	retireEmptyList(list, work);
}

function bucketFor<T>(
	index: BucketIndex<T>,
	partition: string,
	profile: CompatibilityProfile,
	exactRank: number,
	work: SweepWork,
): ActiveList<T> {
	const operations = new PreprocessingOperations(() => spend(work, "activate-or-expire"));
	lookup(work);
	let profiles = operations.mapGet(index.buckets, partition);
	if (!profiles) {
		profiles = operations.map();
		update(work);
		operations.mapSet(index.buckets, partition, profiles);
	}
	lookup(work);
	const existing = operations.mapGet(profiles, profile);
	if (existing) return existing;
	const list: ActiveList<T> = {
		partition,
		profile,
		head: null,
		tail: null,
		index,
		exactRank,
	};
	update(work);
	operations.mapSet(profiles, profile, list);
	return list;
}

function canonicalProfile(
	root: ProfileNode,
	semantics: SweepPartition,
	work: SweepWork,
): CompatibilityProfile {
	const prepare = new PreprocessingOperations(() => spend(work, "prepare-events"));
	const profileOrder = (a: string, b: string) => {
		work.profileSortComparisons += 1;
		return comparedIdentity(a, b, (units) => spend(work, "order-events", units));
	};
	const exclusionInput = prepare.array<string>();
	for (const exclusion of semantics.excludedPartitions) {
		spend(work, "prepare-events", 1 + exclusion.length);
		prepare.push(exclusionInput, exclusion);
	}
	const exclusions = stableSorted(exclusionInput, profileOrder, (units) =>
		spend(work, "order-events", units),
	);
	const ancestorInput = prepare.array<string>();
	const seenAncestors = prepare.set<string>();
	for (const target of semantics.ancestorTargets ?? []) {
		spend(work, "prepare-events", target.length);
		if (prepare.setHas(seenAncestors, target)) continue;
		prepare.setAdd(seenAncestors, target);
		prepare.push(ancestorInput, target);
	}
	const ancestorTargets = stableSorted(ancestorInput, profileOrder, (units) =>
		spend(work, "order-events", units),
	);
	work.profileSnapshotEntries += exclusions.length + ancestorTargets.length;
	let node = root;
	for (const exclusion of exclusions) {
		spend(work, "prepare-events");
		work.profileTrieSteps += 1;
		let child = prepare.mapGet(node.children, exclusion);
		if (!child) {
			child = { children: prepare.map(), profiles: prepare.map(), profile: null };
			prepare.mapSet(node.children, exclusion, child);
			work.peakRetainedProfileTrieNodes += 1;
		}
		node = child;
	}
	const hierarchyKey = semantics.hierarchy ?? null;
	let hierarchyNode = prepare.mapGet(node.profiles, hierarchyKey);
	if (!hierarchyNode) {
		hierarchyNode = { children: prepare.map(), profiles: prepare.map(), profile: null };
		prepare.mapSet(node.profiles, hierarchyKey, hierarchyNode);
		work.peakRetainedProfileTrieNodes += 1;
	}
	let targetNode = hierarchyNode;
	for (const target of ancestorTargets) {
		spend(work, "prepare-events");
		work.profileTrieSteps += 1;
		let child = prepare.mapGet(targetNode.children, target);
		if (!child) {
			child = { children: prepare.map(), profiles: prepare.map(), profile: null };
			prepare.mapSet(targetNode.children, target, child);
			work.peakRetainedProfileTrieNodes += 1;
		}
		targetNode = child;
	}
	work.profileTerminalLookups += 1;
	if (!targetNode.profile) {
		const excluded = prepare.set<string>();
		for (let index = 0; index < exclusions.length; index += 1)
			prepare.setAdd(excluded, prepare.read(exclusions, index)!);
		targetNode.profile = {
			exclusions,
			excluded,
			ancestorTargets,
			hierarchy: semantics.hierarchy,
		};
		work.compatibilityProfiles += 1;
		work.profileCreations += 1;
	}
	return targetNode.profile;
}

function partitionExcluded(
	profile: CompatibilityProfile,
	partition: string,
	work?: SweepWork,
	chargeBudget = true,
): boolean {
	if (work) work.exactMembershipTests += 1;
	const excluded = new PreprocessingOperations(() => {
		if (chargeBudget && work) spend(work, "compatibility-query");
	}).setHas(profile.excluded, partition);
	if (excluded) return true;
	if (!profile.hierarchy) return false;
	const hierarchyOperations = new PreprocessingOperations(() => {
		if (chargeBudget && work) spend(work, "hierarchy-query");
	});
	for (let index = 0; index < profile.ancestorTargets.length; index += 1) {
		const target = hierarchyOperations.read(profile.ancestorTargets, index)!;
		if (work) {
			work.hierarchyMembershipTests += 1;
		}
		if (
			profile.hierarchy.isAncestor(partition, target, () =>
				chargeBudget ? spend(work!, "hierarchy-query") : undefined,
			)
		)
			return true;
	}
	return false;
}

function hierarchyEventExcludesAll<T>(
	index: BucketIndex<T>,
	profile: CompatibilityProfile,
	work: SweepWork,
): boolean {
	if (!index.hierarchy || profile.hierarchy !== index.hierarchy) return false;
	const hierarchyOperations = new PreprocessingOperations(() => spend(work, "hierarchy-query"));
	for (let targetIndex = 0; targetIndex < profile.ancestorTargets.length; targetIndex += 1) {
		const target = hierarchyOperations.read(profile.ancestorTargets, targetIndex)!;
		work.hierarchyPathQueries += 1;
		let count = 0;
		const path = index.hierarchy.pathToRoot(target, () => spend(work, "hierarchy-query"));
		for (let pathIndex = 0; pathIndex < path.length; pathIndex += 1) {
			const [min, max] = hierarchyOperations.read(path, pathIndex)!;
			const measured = index.partitionCounts.range(min, max, work);
			count += measured.value;
			work.hierarchyPathSteps += measured.steps + 1;
		}
		// This is deliberately per target: summing different target paths can count
		// one bucket twice and incorrectly suppress an eligible pair.
		if (count >= index.totalBuckets) return true;
	}
	return false;
}

function pairAllowed(
	event: CompatibilityProfile,
	eventPartition: string,
	active: ActiveList<unknown>,
	work: SweepWork,
): boolean {
	return (
		!partitionExcluded(event, active.partition, work, false) &&
		!partitionExcluded(active.profile, eventPartition, work, false)
	);
}

function hierarchyCandidates<T>(
	index: BucketIndex<T>,
	profile: CompatibilityProfile,
	work: SweepWork,
): Set<ActiveList<T>> | null {
	const hierarchy = index.hierarchy;
	if (!hierarchy || profile.hierarchy !== hierarchy || profile.ancestorTargets.length === 0)
		return null;
	const hierarchyOperations = new PreprocessingOperations(() => spend(work, "hierarchy-query"));
	const queryOperations = new PreprocessingOperations(() => spend(work, "compatibility-query"));
	const ranges = hierarchyOperations.array<readonly [number, number]>();
	for (let targetIndex = 0; targetIndex < profile.ancestorTargets.length; targetIndex += 1) {
		const target = hierarchyOperations.read(profile.ancestorTargets, targetIndex)!;
		work.hierarchyPathQueries += 1;
		const path = hierarchy.pathToRoot(target, () => spend(work, "hierarchy-query"));
		work.hierarchyPathSteps += path.length;
		for (let pathIndex = 0; pathIndex < path.length; pathIndex += 1)
			hierarchyOperations.push(ranges, hierarchyOperations.read(path, pathIndex)!);
	}
	for (let exclusionIndex = 0; exclusionIndex < profile.exclusions.length; exclusionIndex += 1) {
		const exclusion = hierarchyOperations.read(profile.exclusions, exclusionIndex)!;
		const position = hierarchy.position(exclusion, () => spend(work, "hierarchy-query"));
		if (position !== undefined) hierarchyOperations.push(ranges, [position, position]);
	}
	const excluded = mergedRanges(ranges, work);
	const candidates = queryOperations.set<ActiveList<T>>();
	let cursor = 0;
	const collect = (min: number, max: number) => {
		if (min > max) return;
		work.hierarchySubtreeQueries += 1;
		work.hierarchySubtreeSteps += index.partitionCounts.positive(
			min,
			max,
			(position) => {
				work.bucketLookups += 1;
				work.bucketIndexOperations += 1;
				const lists = queryOperations.mapGet(index.partitionLists, position)!;
				for (const list of lists) {
					work.compatibilityQuerySteps += 1;
					queryOperations.setAdd(candidates, list);
				}
			},
			work,
		);
	};
	for (let rangeIndex = 0; rangeIndex < excluded.length; rangeIndex += 1) {
		const [min, max] = hierarchyOperations.read(excluded, rangeIndex)!;
		collect(cursor, min - 1);
		cursor = Math.max(cursor, max + 1);
	}
	collect(cursor, hierarchy.size - 1);
	// Partitions outside the hierarchy cannot be excluded by ancestor paths.
	for (const list of index.unpositionedLists) {
		work.compatibilityQuerySteps += 1;
		queryOperations.setAdd(candidates, list);
	}
	return candidates;
}

/** Enumerate every semantically permitted closed x-overlap once in stable start-event order. */
export function sweepIntervalPairs<A, B>(
	left: readonly SweepInterval<A>[],
	right: readonly SweepInterval<B>[],
	sameSet: boolean,
	visit: (left: SweepInterval<A>, right: SweepInterval<B>) => boolean | void,
	options?: SweepOptions,
): SweepWork {
	type Value = A | B;
	const work = emptyWork(options);
	options?.budget?.attachDiagnosticState(work);
	const prepare = new PreprocessingOperations(() => spend(work, "prepare-events"));
	const profileRoot: ProfileNode = {
		children: prepare.map(),
		profiles: prepare.map(),
		profile: null,
	};
	const profileBySemantics = prepare.map<SweepPartition, CompatibilityProfile>();
	let events = prepare.array<{
		interval: SweepInterval<Value>;
		set: 0 | 1;
		ordinal: number;
		profile: CompatibilityProfile;
	}>();
	let retainedCanonicalProfileRefs = 0;
	const addEvent = (interval: SweepInterval<Value>, set: 0 | 1, ordinal: number) => {
		let profile = prepare.mapGet(profileBySemantics, interval.semantics);
		if (!profile) {
			profile = canonicalProfile(profileRoot, interval.semantics, work);
			prepare.mapSet(profileBySemantics, interval.semantics, profile);
		}
		prepare.push(events, {
			interval,
			set,
			ordinal,
			profile,
		});
	};
	for (let ordinal = 0; ordinal < left.length; ordinal += 1) {
		addEvent(prepare.read(left, ordinal)!, 0, ordinal);
	}
	if (!sameSet)
		for (let ordinal = 0; ordinal < right.length; ordinal += 1) {
			addEvent(prepare.read(right, ordinal)!, 1, ordinal);
		}
	const retainedProfiles = prepare.set<CompatibilityProfile>();
	for (let eventIndex = 0; eventIndex < events.length; eventIndex += 1) {
		const event = prepare.read(events, eventIndex)!;
		if (prepare.setHas(retainedProfiles, event.profile)) continue;
		prepare.setAdd(retainedProfiles, event.profile);
		// Arrays and the exact Set retain their entries separately.
		retainedCanonicalProfileRefs +=
			1 + event.profile.exclusions.length * 2 + event.profile.ancestorTargets.length;
	}
	const orderedEvents = stableSorted(
		events,
		(a, b) => {
			const order = new PreprocessingOperations(() => spend(work, "order-events"));
			const numeric =
				a.interval.min - b.interval.min || a.interval.max - b.interval.max || a.set - b.set;
			if (numeric) return numeric;
			const identity = comparedIdentity(a.interval.id, b.interval.id, (units) =>
				spend(work, "order-events", units),
			);
			if (identity) return identity;
			const compareLists = (first: readonly string[], second: readonly string[]) => {
				for (let index = 0; index < Math.min(first.length, second.length); index += 1) {
					const compared = comparedIdentity(
						order.read(first, index)!,
						order.read(second, index)!,
						(units) => spend(work, "order-events", units),
					);
					if (compared) return compared;
				}
				return first.length - second.length;
			};
			return (
				compareLists(a.profile.exclusions, b.profile.exclusions) ||
				compareLists(a.profile.ancestorTargets, b.profile.ancestorTargets) ||
				a.ordinal - b.ordinal
			);
		},
		(units) => spend(work, "order-events", units),
	);
	events = orderedEvents;
	let hierarchy: SweepHierarchy | undefined;
	for (let eventIndex = 0; eventIndex < events.length; eventIndex += 1) {
		const event = prepare.read(events, eventIndex)!;
		if (!event.profile.hierarchy) continue;
		hierarchy = event.profile.hierarchy;
		break;
	}
	spend(work, "prepare-events", 3);
	const rankSpecs = prepare.array<{ partition: string; profile: CompatibilityProfile }>();
	const seenRanks = prepare.map<string, Set<CompatibilityProfile>>();
	for (let eventIndex = 0; eventIndex < events.length; eventIndex += 1) {
		const event = prepare.read(events, eventIndex)!;
		const partition = event.interval.semantics.partition;
		let profiles = prepare.mapGet(seenRanks, partition);
		if (!profiles) {
			profiles = prepare.set();
			prepare.mapSet(seenRanks, partition, profiles);
		}
		if (!prepare.setHas(profiles, event.profile)) {
			prepare.setAdd(profiles, event.profile);
			prepare.push(rankSpecs, { partition, profile: event.profile });
		}
	}
	// Events are already in the public stable enumeration order. Ranking buckets by
	// first occurrence lets an in-order index query preserve that order without a
	// per-query sort.
	const ranks = prepare.map<string, Map<CompatibilityProfile, number>>();
	for (let rank = 0; rank < rankSpecs.length; rank += 1) {
		const spec = prepare.read(rankSpecs, rank)!;
		let profiles = prepare.mapGet(ranks, spec.partition);
		if (!profiles) {
			profiles = prepare.map();
			prepare.mapSet(ranks, spec.partition, profiles);
		}
		prepare.mapSet(profiles, spec.profile, rank);
	}
	const seenRankProfiles = rankSpecs.length;
	const retainedRanks = rankSpecs.length;
	const retainedRankAndProfileIndexRefs =
		profileBySemantics.size * 2 +
		retainedProfiles.size +
		seenRanks.size +
		seenRankProfiles +
		rankSpecs.length +
		ranks.size +
		retainedRanks;
	const makeIndex = (): BucketIndex<Value> => ({
		buckets: prepare.map(),
		activeLists: prepare.set(),
		profileCounts: prepare.map(),
		excludedByPartition: prepare.map(),
		hierarchy,
		partitionCounts: new RangeCount(hierarchy?.size ?? 0, work),
		targetCounts: new RangeMaximum(hierarchy?.size ?? 0, work),
		targetPositionCounts: new RangeCount(hierarchy?.size ?? 0, work),
		partitionLists: prepare.map(),
		targetLists: prepare.map(),
		unpositionedLists: prepare.set(),
		untargetedLists: prepare.set(),
		exact: new ExactCompatibilityIndex(rankSpecs.length, hierarchy, work),
		totalBuckets: 0,
		retainedExclusionRefs: 0,
		retainedIndexRefs: 0,
		activeNodes: 0,
	});
	const indexValues = prepare.array<BucketIndex<Value>>();
	prepare.push(indexValues, makeIndex());
	prepare.push(indexValues, makeIndex());
	const indexes = indexValues as [BucketIndex<Value>, BucketIndex<Value>];
	const leftIndex = prepare.read(indexes, 0)!;
	const rightIndex = prepare.read(indexes, 1)!;
	work.peakRetainedHierarchyIndexCells = 0;
	for (let index = 0; index < indexes.length; index += 1) {
		const owned = prepare.read(indexes, index)!;
		work.peakRetainedHierarchyIndexCells +=
			owned.partitionCounts.values.length +
			owned.targetCounts.values.length +
			owned.targetPositionCounts.values.length;
	}
	const heap = prepare.array<ActiveNode<Value>>();
	const sampleRetainedState = (queryRefs: number): void => {
		const buckets = leftIndex.totalBuckets + rightIndex.totalBuckets;
		const exclusionRefs = leftIndex.retainedExclusionRefs + rightIndex.retainedExclusionRefs;
		const indexRefs = leftIndex.retainedIndexRefs + rightIndex.retainedIndexRefs;
		const profiles = leftIndex.profileCounts.size + rightIndex.profileCounts.size;
		let hierarchyCells = 0,
			exactNodes = 0,
			exactSummaryRefs = 0,
			activeState = 0;
		const includeOwnedState = (owned: BucketIndex<Value>) => {
			hierarchyCells +=
				owned.partitionCounts.values.length +
				owned.targetCounts.values.length +
				owned.targetPositionCounts.values.length;
			exactNodes += owned.exact.summaries.length;
			exactSummaryRefs += owned.exact.retainedSummaryRefs;
			activeState +=
				owned.activeNodes + owned.totalBuckets + owned.profileCounts.size + owned.retainedIndexRefs;
		};
		includeOwnedState(leftIndex);
		includeOwnedState(rightIndex);
		work.peakRetainedBuckets = Math.max(work.peakRetainedBuckets, buckets);
		work.peakRetainedExclusionRefs = Math.max(work.peakRetainedExclusionRefs, exclusionRefs);
		work.peakRetainedIndexRefs = Math.max(work.peakRetainedIndexRefs, indexRefs);
		work.peakRetainedProfiles = Math.max(work.peakRetainedProfiles, profiles);
		work.peakRetainedQueryRefs = Math.max(work.peakRetainedQueryRefs, queryRefs);
		work.peakRetainedExactIndexNodes = Math.max(work.peakRetainedExactIndexNodes, exactNodes);
		work.peakRetainedExactSummaryRefs = Math.max(
			work.peakRetainedExactSummaryRefs,
			exactSummaryRefs,
		);
		work.peakRetainedTotalStateRefs = Math.max(
			work.peakRetainedTotalStateRefs,
			events.length * 2 +
				work.peakRetainedProfileTrieNodes +
				retainedCanonicalProfileRefs +
				retainedRankAndProfileIndexRefs +
				hierarchyCells +
				exactNodes +
				exactSummaryRefs +
				activeState +
				queryRefs,
		);
	};
	for (let order = 0; order < events.length; order += 1) {
		const lifecycle = new PreprocessingOperations(() => spend(work, "activate-or-expire"));
		const event = lifecycle.read(events, order)!;
		work.events += 1;
		let nextExpiry = lifecycle.read(heap, 0);
		while (nextExpiry && nextExpiry.interval.max < event.interval.min) {
			remove(heapPop(heap, work)!, work);
			work.expiryPops += 1;
			nextExpiry = lifecycle.read(heap, 0);
		}
		const opposite = sameSet ? leftIndex : event.set === 0 ? rightIndex : leftIndex;
		work.compatibilityQueries += 1;
		if (opposite.totalBuckets > 0 && !hierarchyEventExcludesAll(opposite, event.profile, work)) {
			const query = new PreprocessingOperations(() => spend(work, "compatibility-query"));
			const eventCandidates = hierarchyCandidates(opposite, event.profile, work);
			let activeHierarchyExclusions = false;
			const subtree = opposite.hierarchy?.subtree(event.interval.semantics.partition, () =>
				spend(work, "hierarchy-query"),
			);
			if (subtree) {
				work.hierarchySubtreeQueries += 1;
				const measured = opposite.targetPositionCounts.range(
					query.read(subtree, 0)!,
					query.read(subtree, 1)!,
					work,
				);
				work.hierarchySubtreeSteps += measured.steps;
				activeHierarchyExclusions = measured.value > 0;
			}
			let eventExcludesActivePartition = false;
			for (
				let exclusionIndex = 0;
				exclusionIndex < event.profile.exclusions.length;
				exclusionIndex += 1
			) {
				const exclusion = query.read(event.profile.exclusions, exclusionIndex)!;
				work.bucketLookups += 1;
				work.bucketIndexOperations += 1;
				work.exactQuerySteps += 1;
				work.exactMembershipTests += 1;
				if (query.mapHas(opposite.buckets, exclusion)) {
					eventExcludesActivePartition = true;
					break;
				}
			}
			work.bucketLookups += 1;
			work.bucketIndexOperations += 1;
			work.exactQuerySteps += 1;
			work.exactMembershipTests += 1;
			const needsExactQuery =
				eventExcludesActivePartition ||
				(query.mapGet(opposite.excludedByPartition, event.interval.semantics.partition)?.size ??
					0) > 0 ||
				activeHierarchyExclusions;
			const activeCandidates = needsExactQuery
				? opposite.exact.query(event.profile, event.interval.semantics.partition, work)
				: null;
			let intersection: Set<ActiveList<Value>> | null = null;
			if (eventCandidates && activeCandidates) {
				const candidateOperations = new PreprocessingOperations(() =>
					spend(work, "candidate-intersection"),
				);
				intersection = candidateOperations.set();
				const [smaller, larger] =
					eventCandidates.size <= activeCandidates.size
						? [eventCandidates, activeCandidates]
						: [activeCandidates, eventCandidates];
				for (const candidate of smaller) {
					work.compatibilityQuerySteps += 1;
					if (candidateOperations.setHas(larger, candidate))
						candidateOperations.setAdd(intersection, candidate);
				}
			}
			const currentQueryRefs =
				(eventCandidates?.size ?? 0) + (activeCandidates?.size ?? 0) + (intersection?.size ?? 0);
			sampleRetainedState(currentQueryRefs);
			const candidates =
				intersection ?? eventCandidates ?? activeCandidates ?? opposite.activeLists;
			for (const list of candidates) {
				work.bucketScans += 1;
				work.partitionChecks += 1;
				work.compatibilityTests += 1;
				if (!pairAllowed(event.profile, event.interval.semantics.partition, list, work))
					throw new Error("compatibility index admitted an excluded interval bucket");
				for (let active: ActiveNode<Value> | null = list.head; active; active = active.next) {
					work.activeVisits += 1;
					const shouldContinue =
						event.set === 0
							? visit(event.interval as SweepInterval<A>, active.interval as SweepInterval<B>)
							: visit(active.interval as SweepInterval<A>, event.interval as SweepInterval<B>);
					if (shouldContinue === false) {
						sampleRetainedState(currentQueryRefs);
						return work;
					}
				}
			}
		}
		const eventIndex = event.set === 0 ? leftIndex : rightIndex;
		const partitionRanks = prepare.mapGet(ranks, event.interval.semantics.partition)!;
		const list = bucketFor(
			eventIndex,
			event.interval.semantics.partition,
			event.profile,
			prepare.mapGet(partitionRanks, event.profile)!,
			work,
		);
		const node: ActiveNode<Value> = {
			interval: event.interval,
			order,
			active: true,
			previous: null,
			next: null,
			list,
		};
		append(list, node, work);
		heapPush(heap, node, work);
		sampleRetainedState(0);
	}
	return work;
}
