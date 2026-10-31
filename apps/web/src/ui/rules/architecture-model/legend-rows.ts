// What the legend lists. Its rows come from the whole reading, not from what the picture draws at
// this moment: a hidden kind takes its lines off the picture, and the doors that only those lines
// reached, with their part kinds and groups. Each list keeps one order, the policy's, so hiding a
// kind or showing it again moves no row.

import { LINE_MARKS } from "@archboard/renderer/picture";
import type { Model, projectModel } from "@archboard/board/content";
import type {
	AppliedAppearance,
	PictureKey,
} from "#ui/clients/semantic-board-canvas/reads/semantic-boards.ts";
import { kindLookOf } from "#ui/rules/semantic-board-canvas/board/kind-look.ts";

type Projection = ReturnType<typeof projectModel>;
type Connection = Projection["connections"][number];
type Module = Projection["children"][number];

/** How a kind looks when the vault's policy no longer names it. */
const UNKNOWN_KIND = { color: "neutral", dash: "solid", arrowhead: "filled" } as const;

/** What the legend reads. */
interface LegendReading {
	readonly model: Model;
	readonly projection: Projection;
	readonly picture: PictureKey;
	readonly hideKinds: readonly string[] | undefined;
}

/** A row that keys a mark. */
interface LegendRow {
	readonly item: AppliedAppearance;
	/** Whether the picture leaves it out for now. */
	readonly dimmed: boolean;
}

/** One line type. */
interface LegendLine extends LegendRow {
	/** Whether a reader left it out. */
	readonly hidden: boolean;
	/** Whether a reader can leave it out: a mixed line is no kind of relationship. */
	readonly hideable: boolean;
}

/** One mark that lines wear beside their kinds. */
type LegendMark = (typeof LINE_MARKS)[number] & { readonly dimmed: boolean };

/** One group of the reading. */
interface LegendGroup {
	readonly id: string;
	readonly name: string;
	readonly color: string | undefined;
	/** What the picture draws of it, doors included. */
	readonly parts: readonly string[];
}

/**
 * The order of a policy's keys, and after them the keys that it does not name.
 * @param policy The policy's entries.
 * @returns A comparison of two keys.
 */
function policyOrder(policy: Readonly<Record<string, unknown>>) {
	const order = new Map(Object.keys(policy).map((id, index) => [id, index]));
	return (one: string, other: string): number =>
		(order.get(one) ?? order.size) - (order.get(other) ?? order.size) || one.localeCompare(other);
}

/**
 * Every module of the reading while a reader hides nothing: its parts, and the doors at the ends of
 * all its lines. The open module is the frame, which a line can end on, and no part.
 * @param projection The reading.
 * @returns The modules.
 */
function modulesOf(projection: Projection): readonly Module[] {
	const ends = new Set(projection.allConnections.flatMap(({ line }) => [line.from, line.to]));
	const parts = new Map(
		[
			...projection.children,
			...projection.context,
			...projection.depicted.nodes.filter(
				(node) => ends.has(node.id) && node.id !== projection.opened,
			),
		].map((module) => [module.id, module]),
	);
	return [...parts.values()];
}

/**
 * How a part kind looks according to the vault's policy, because the picture has no sample of what
 * it does not draw. Its chip has no icon until the caller reads the one that the policy names.
 * @param model The reading.
 * @param id The kind.
 * @returns Its appearance.
 */
function policyPart(model: Model, id: string): AppliedAppearance {
	return {
		id,
		typeName: kindLookOf(model.policy, new Map()).nodeName(id),
		typeKind: id,
		iconSvg: "",
		depiction: "card",
		typeColor: model.policy.nodeKinds[id]?.color ?? UNKNOWN_KIND.color,
		lineColor: UNKNOWN_KIND.color,
		dash: UNKNOWN_KIND.dash,
		arrowhead: UNKNOWN_KIND.arrowhead,
	};
}

/**
 * How a relationship kind looks according to the vault's policy, because the picture has no sample
 * of what it does not draw.
 * @param model The reading.
 * @param id The kind.
 * @returns Its appearance.
 */
function policyLine(model: Model, id: string): AppliedAppearance {
	const look = { ...UNKNOWN_KIND, ...model.policy.relationshipKinds[id] };
	return {
		id,
		typeName: kindLookOf(model.policy, new Map()).relationship(id).name,
		typeKind: id,
		iconSvg: "",
		depiction: "",
		typeColor: UNKNOWN_KIND.color,
		lineColor: look.color ?? UNKNOWN_KIND.color,
		dash: look.dash,
		arrowhead: look.arrowhead,
	};
}

/**
 * The kinds of part in the reading. The picture samples a kind as a card and as a container, and
 * the two are one kind to a reader.
 * @param reading The reading.
 * @returns One row for each, in the policy's order.
 */
function kindRows(reading: LegendReading): readonly LegendRow[] {
	const { model, projection, picture } = reading;
	const drawn = new Map(picture.kinds.map((item) => [item.typeKind, item]));
	const kinds = new Set([...drawn.keys(), ...modulesOf(projection).map((module) => module.kind)]);
	return [...kinds].toSorted(policyOrder(model.policy.nodeKinds)).map((id) => ({
		item: drawn.get(id) ?? policyPart(model, id),
		dimmed: !drawn.has(id),
	}));
}

/**
 * Each kind that lines carry, a mixed line's kinds among them.
 * @param connections The lines.
 * @returns Their relationship kinds.
 */
function joinedKinds(connections: readonly Connection[]): readonly string[] {
	return connections.flatMap(({ joins }) => joins.map((edge) => edge.kind));
}

/**
 * The line types of the reading. A kind can lie inside a mixed line without a line of its own.
 * @param reading The reading.
 * @returns One row for each, in the policy's order, with the mixed line after them.
 */
function lineRows(reading: LegendReading): readonly LegendLine[] {
	const { model, projection, picture } = reading;
	const hide = new Set(reading.hideKinds);
	const drawn = new Map(picture.relationships.map((item) => [item.typeKind, item]));
	const hideable = new Set(joinedKinds(projection.allConnections));
	const shown = new Set([...drawn.keys(), ...joinedKinds(projection.listed)]);
	const lines = projection.allConnections.map(({ line }) => line.kind);
	const kinds = new Set([...drawn.keys(), ...hideable, ...lines]);
	return [...kinds].toSorted(policyOrder(model.policy.relationshipKinds)).map((id) => ({
		item: drawn.get(id) ?? policyLine(model, id),
		hidden: hide.has(id),
		hideable: hideable.has(id),
		dimmed: hide.has(id) || !shown.has(id),
	}));
}

/**
 * Whether a line wears a mark beside its kind.
 * @param line The line.
 * @param mark The mark.
 * @returns True when the picture draws it so.
 */
function wears(line: Connection["line"], mark: LegendMark["mark"]): boolean {
	return mark === "emphasis" ? line.emphasis === "hero" : line.traffic !== undefined;
}

/**
 * The marks that the lines of the reading wear.
 * @param projection The reading.
 * @returns One row for each.
 */
function markRows(projection: Projection): readonly LegendMark[] {
	return LINE_MARKS.filter(({ mark }) =>
		projection.allConnections.some(({ line }) => wears(line, mark)),
	).map((entry) => ({
		...entry,
		dimmed: !projection.connections.some(({ line }) => wears(line, entry.mark)),
	}));
}

/**
 * The groups of the reading.
 * @param model The reading, whose policy names them.
 * @param projection What it draws.
 * @returns One row for each, in the policy's order.
 */
function groupRows(model: Model, projection: Projection): readonly LegendGroup[] {
	const { groups } = model.policy;
	const drawn = [...projection.children, ...projection.context];
	const ids = new Set(modulesOf(projection).flatMap((module) => module.groups ?? []));
	return [...ids].toSorted(policyOrder(groups)).map((id) => ({
		id,
		name: groups[id]?.name ?? id,
		color: groups[id]?.color,
		parts: drawn
			.filter((module) => module.groups?.includes(id) === true)
			.map(({ id: part }) => part),
	}));
}

export {
	groupRows,
	kindRows,
	lineRows,
	markRows,
	type LegendGroup,
	type LegendLine,
	type LegendMark,
	type LegendReading,
	type LegendRow,
};
