// What the legend lists. Its rows come from the whole scope, not from what the picture draws at
// this moment: a hidden kind or effect takes its lines off the picture, and the cards and doors that
// only those lines reached, with their part kinds and their groups. Each list keeps one order, the
// policy's or the effect key's, so hiding a row or showing it again moves no row. A relationship
// row that the lens leaves out stands apart, with no switch, because only another lens draws it.

import {
	effectKey,
	lineMarks,
	markCounts,
	type EffectKeyEntry,
	type LineMarkEntry,
	type SubjectStanding,
} from "@archboard/renderer/picture";
import { readingLens, type Model, type projectModel } from "@archboard/model/content";
import { drawnEffect, hiddenKinds } from "@archboard/model/policy";
import type {
	AppliedAppearance,
	PictureLegend,
} from "#ui/architecture-drawing/canvas/picture/reads/clients/drawings.ts";
import { openModules } from "#ui/architecture-drawing/model-reader/rules/expansion.ts";
import { kindLookOf } from "#ui/architecture-drawing/canvas/picture/rules/kind-look.ts";

type Projection = ReturnType<typeof projectModel>;
type Connection = Projection["connections"][number];
type Edge = Connection["joins"][number];
type Module = Projection["children"][number];

/** How a kind looks when the vault's policy no longer names it. */
const UNKNOWN_KIND = { color: "neutral", dash: "solid", arrowhead: "filled" } as const;

/** What the legend reads of a reading's parts. */
interface LegendReading {
	readonly model: Model;
	readonly projection: Projection;
	readonly picture: PictureLegend;
}

/** What the legend reads of a reading's relationships, and what a reader hid besides the lens. */
interface RelationshipReading {
	readonly model: Model;
	readonly projection: Projection;
	readonly hideKinds?: readonly string[] | undefined;
	readonly hideEffects?: readonly string[] | undefined;
}

/** A row that keys a part kind. */
interface LegendRow {
	readonly item: AppliedAppearance;
	/** Whether the picture leaves it out for now. */
	readonly dimmed: boolean;
}

/** A relationship row: a kind or an effect. */
interface LegendSwitch {
	/** The kind's id, or the effect's token. */
	readonly id: string;
	readonly name: string;
	/** Whether a reader hid it. */
	readonly hidden: boolean;
	/** Whether the picture draws none of it now. */
	readonly dimmed: boolean;
	/** Whether the lens leaves out every relationship of it in the scope, so no switch brings it back. */
	readonly leftOut: boolean;
}

/** A relationship kind, sampled in its own ink. */
interface LegendKind extends LegendSwitch {
	/** The palette colour its lines are drawn in. */
	readonly color: string;
	/** Its dash: solid, or what a reading from before effects recorded. */
	readonly dash: string;
}

/** An effect, sampled in neutral ink with its head. */
type LegendEffect = LegendSwitch & { readonly entry: EffectKeyEntry };

/** The relationship rows of a reading. */
interface RelationshipRows {
	readonly kinds: readonly LegendKind[];
	readonly effects: readonly LegendEffect[];
}

/** One mark that lines wear beside their kinds. */
type LegendMark = LineMarkEntry & { readonly dimmed: boolean };

/** One standing a comparison colours lines with. */
interface LegendStanding {
	readonly standing: SubjectStanding;
	readonly word: string;
}

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
	const open = openModules(projection);
	const parts = new Map(
		[
			...projection.children,
			...projection.context,
			...projection.depicted.nodes.filter((node) => ends.has(node.id)),
		]
			.filter((module) => !open.has(module.id))
			.map((module) => [module.id, module]),
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
		effect: "",
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
	// A flowchart's frame is the flow on screen, and it shows no kind.
	const shown = picture.kinds.filter((item) => item.typeKind !== "flow");
	const drawn = new Map(shown.map((item) => [item.typeKind, item]));
	const kinds = new Set([...drawn.keys(), ...modulesOf(projection).map((module) => module.kind)]);
	return [...kinds].toSorted(policyOrder(model.policy.nodeKinds)).map((id) => ({
		item: drawn.get(id) ?? policyPart(model, id),
		dimmed: !drawn.has(id),
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
	return lineMarks()
		.filter(({ mark }) => projection.allConnections.some(({ line }) => wears(line, mark)))
		.map((entry) => ({
			...entry,
			dimmed: !projection.connections.some(({ line }) => wears(line, entry.mark)),
		}));
}

/**
 * Every relationship of the scope, whatever the lens and the reader hide.
 * @param projection The reading.
 * @returns The relationships.
 */
function scopeEdges(projection: Projection): readonly Edge[] {
	return projection.allConnections.flatMap(({ joins }) => joins);
}

/**
 * The relationship rows of a reading: its kinds in the policy's order, and the effects its lines
 * say in the key's order. A reading whose kinds record their dash says no effect.
 * @param reading The reading and what a reader hid.
 * @returns The kinds and the effects.
 */
function relationshipRows(reading: RelationshipReading): RelationshipRows {
	const { model, projection } = reading;
	const { policy } = model;
	const every = scopeEdges(projection);
	const drawn = projection.connections.flatMap(({ joins }) => joins);
	const lens = readingLens(policy, projection.lens.id);
	const look = kindLookOf(policy, new Map());
	const hidden = new Set(hiddenKinds(reading.hideKinds, policy));
	const muted = new Set(reading.hideEffects);
	/**
	 * How a row of some relationships stands.
	 * @param of Whether a relationship belongs to the row.
	 * @param off Whether a reader hid the row.
	 * @returns Its standing.
	 */
	const standing = (of: (edge: Edge) => boolean, off: boolean) => ({
		hidden: off,
		dimmed: off || !drawn.some(of),
		leftOut: !every.some((edge) => of(edge) && lens.draws(edge)),
	});
	const kinds = [...new Set(every.map((edge) => edge.kind))]
		.toSorted(policyOrder(policy.relationshipKinds))
		.map((id) => ({
			id,
			name: look.relationship(id).name,
			color: policy.relationshipKinds[id]?.color ?? UNKNOWN_KIND.color,
			dash: policy.relationshipKinds[id]?.dash ?? UNKNOWN_KIND.dash,
			...standing((edge) => edge.kind === id, hidden.has(id)),
		}));
	/**
	 * What a relationship's line says it does under the policy.
	 * @param edge The relationship.
	 * @returns Its effect, or undefined.
	 */
	const said = (edge: Edge) => drawnEffect(edge, policy);
	const effects = effectKey()
		.filter((entry) => every.some((edge) => said(edge) === entry.effect))
		.map((entry) => ({
			id: entry.effect,
			name: entry.word,
			entry,
			...standing((edge) => said(edge) === entry.effect, muted.has(entry.effect)),
		}));
	return { kinds, effects };
}

/**
 * What a row's eye hides next: the row joins the list, or leaves it.
 * @param rows The rows of one list, kinds or effects.
 * @param id The row.
 * @returns The ids hidden next.
 */
function toggled(rows: readonly LegendSwitch[], id: string): readonly string[] {
	const hidden = rows.filter((row) => row.hidden).map((row) => row.id);
	return hidden.includes(id) ? hidden.filter((one) => one !== id) : [...hidden, id];
}

/**
 * What a row's name hides next: every other row a reader can switch, so the picture draws that row
 * alone. A row already drawn alone shows every row again.
 * @param rows The rows of one list, kinds or effects.
 * @param id The row.
 * @returns The ids hidden next.
 */
function soloed(rows: readonly LegendSwitch[], id: string): readonly string[] {
	const switchable = rows.filter((row) => !row.leftOut);
	const alone = switchable.every((row) => row.hidden === (row.id !== id));
	return alone ? [] : switchable.filter((row) => row.id !== id).map((row) => row.id);
}

/**
 * The standings a comparison colours the scope's lines with.
 * @param projection The reading.
 * @returns One row for each, in the order a reader is told them.
 */
function comparisonRows(projection: Projection): readonly LegendStanding[] {
	const { standing } = projection;
	if (standing === undefined) return [];
	const lines = Object.fromEntries(
		scopeEdges(projection).flatMap((edge) => {
			const one = standing[edge.id];
			return one === undefined ? [] : [[edge.id, one]];
		}),
	);
	return markCounts(lines).map(({ standing: one, word }) => ({ standing: one, word }));
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
	comparisonRows,
	groupRows,
	kindRows,
	markRows,
	relationshipRows,
	soloed,
	toggled,
	type LegendEffect,
	type LegendGroup,
	type LegendKind,
	type LegendMark,
	type LegendRow,
	type LegendStanding,
	type LegendSwitch,
	type RelationshipRows,
};
