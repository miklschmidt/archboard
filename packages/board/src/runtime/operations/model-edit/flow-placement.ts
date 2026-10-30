import { nestedSteps, type FlatStep } from "#shared/rules/flow-steps.ts";
import {
	conflict,
	entryOf,
	type Flow,
	type Entry,
	type Placement,
} from "#runtime/operations/model-edit/flow-state.ts";

/**
 * Identify an exact ordered holder, including its decision label.
 * @param place The requested holder.
 * @returns Its private grouping key.
 */
function placeKey(place: Placement): string {
	return JSON.stringify([place.holder, place.alternative]);
}
/**
 * Refuse missing holders before the legacy tree assembler can promote an orphan.
 * @param flowIds The surviving flow roots.
 * @param entries All continuing step records.
 * @param place The requested placement.
 * @returns Whether the exact destination exists.
 */
function validHolder(flowIds: Set<string>, entries: Map<string, Entry>, place: Placement): boolean {
	if (flowIds.has(place.holder)) return place.alternative === undefined;
	const parent = entries.get(place.holder);
	if (parent === undefined) return false;
	switch (parent.value.kind) {
		case "loop":
			return place.alternative === undefined;
		case "decision":
			return parent.value.alternatives.includes(place.alternative ?? "");
		default:
			return false;
	}
}
/**
 * Preserve unaffected sibling order before applying relative placements.
 * @param flows The surviving roots.
 * @param entries All continuing step records.
 * @param moves The explicit placements.
 * @returns The ordered unaffected siblings by exact holder.
 */
function holderGroups(flows: Flow[], entries: Map<string, Entry>, moves: Map<string, Placement>) {
	const groups = new Map<string, string[]>();
	const flowIds = new Set(flows.map((flow) => flow.id));
	for (const [id, entry] of entries) {
		if (!validHolder(flowIds, entries, entry.place))
			conflict("The placement holder or exact alternative is missing.", [id, entry.place.holder]);
		const key = placeKey(entry.place);
		const group = groups.get(key) ?? [];
		groups.set(key, group);
		if (!moves.has(id)) group.push(id);
	}
	return groups;
}
/**
 * Apply stable relative order independently of statement order.
 * @param groups The unaffected sibling lists.
 * @param entries All continuing step records.
 * @param moves The explicit placements.
 */
function orderMoves(
	groups: Map<string, string[]>,
	entries: Map<string, Entry>,
	moves: Map<string, Placement>,
): void {
	const active = new Set<string>();
	const done = new Set<string>();
	/**
	 * Insert a sibling after resolving its explicit ordering dependency.
	 * @param id The moved step identity.
	 */
	const insert = (id: string): void => {
		if (done.has(id)) return;
		if (active.has(id)) conflict("Relative step ordering contains a cycle.", [...active, id]);
		active.add(id);
		const entry = entryOf(entries, id);
		const before = moves.get(id)!.before;
		const group = groups.get(placeKey(entry.place))!;
		if (before !== undefined) {
			const sibling = entryOf(entries, before);
			if (placeKey(sibling.place) !== placeKey(entry.place))
				conflict("The before identity is not a sibling in the destination holder.", [id, before]);
			if (moves.has(before)) insert(before);
			group.splice(group.indexOf(before), 0, id);
		} else group.push(id);
		active.delete(id);
		done.add(id);
	};
	for (const id of [...moves.keys()].toSorted()) insert(id);
}
/**
 * Build validated trees through the existing flow assembler.
 * @param flows The surviving flow roots.
 * @param entries All continuing step records.
 * @param groups The fully ordered holders.
 */
function nestFlows(
	flows: Flow[],
	entries: Map<string, Entry>,
	groups: Map<string, string[]>,
): void {
	const flowIds = new Set(flows.map((flow) => flow.id));
	const reached = new Set<string>();
	/**
	 * Emit each reachable holder before its children.
	 * @param holder The next flow or control step.
	 * @param alternative The exact decision label, when applicable.
	 * @returns Its ordered flat subtree.
	 */
	const flatten = (holder: string, alternative?: string): FlatStep[] => {
		const place = { holder, ...(alternative === undefined ? {} : { alternative }) };
		return (groups.get(placeKey(place)) ?? []).flatMap((id) => {
			if (reached.has(id)) conflict("Step containment contains a cycle.", [id, holder]);
			reached.add(id);
			const value = entryOf(entries, id).value;
			const within = flowIds.has(holder)
				? {}
				: { within: { step: holder, ...(alternative === undefined ? {} : { alternative }) } };
			return [
				{ ...value, ...within },
				...(value.kind === "loop"
					? flatten(id)
					: value.kind === "decision"
						? value.alternatives.flatMap((label) => flatten(id, label))
						: []),
			];
		});
	};
	for (const flow of flows) flow.steps = nestedSteps(flatten(flow.id));
	if (reached.size !== entries.size)
		conflict(
			"Step placements contain an unreachable holder or containment cycle.",
			[...entries.keys()].filter((id) => !reached.has(id)),
		);
}
/**
 * Refuse invalid destinations and ordering before materializing one candidate.
 * @param flows The surviving flow roots.
 * @param entries All continuing step records.
 * @param moves The explicit placements.
 */
function materialize(
	flows: Flow[],
	entries: Map<string, Entry>,
	moves: Map<string, Placement>,
): void {
	const groups = holderGroups(flows, entries, moves);
	orderMoves(groups, entries, moves);
	nestFlows(flows, entries, groups);
}
export { materialize };
