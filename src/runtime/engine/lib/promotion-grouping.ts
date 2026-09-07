// Which elements make up one node, and what that node is called.
//
// Bound labels are folded into their container by `describe`, so a shape plus
// its label is one thing, not two. Promotion has to agree: promoting a
// container promotes its label element too, and a label whose container is
// also selected never becomes a node of its own.

import path from "node:path";

import { extentOf } from "@/runtime/engine/geometry";
import { nodeIdOf, readElementMetadata } from "@/runtime/engine/metadata";
import type { ResolvedBinding } from "@/runtime/engine/lib/promotion-binding";
import { PromotionError } from "@/runtime/engine/lib/promotion-identity";
import type { ServerElement } from "@/runtime/engine/types";

/** One node's elements, and what to call it. */
interface PromotionGroup {
	elements: ServerElement[];
	name: string;
	nodeId?: string;
}

/** The shapes a promotion is about, and the labels bound to each of them. */
interface Partitioned {
	shapes: ServerElement[];
	labelsByContainer: Map<string, ServerElement[]>;
}

/** The flags that name a single node, as promotion and demotion both spell them. */
interface SingleNodeFlags {
	name?: string;
	nodeId?: string;
	binding?: ResolvedBinding;
}

/**
 * How much canvas an element covers.
 *
 * Measured rather than read off `width` and `height`, because a selection can
 * hold an arrow, whose stored size is the box round its path and whose stored
 * origin is its first point (TASK-038).
 * @param el The element.
 * @returns Its area.
 */
const areaOf = (el: ServerElement): number => {
	const extent = extentOf(el);
	return extent.width * extent.height;
};

/**
 * The container a text element is bound to, when it is bound to one.
 * @param el The element.
 * @returns The container's id, or undefined for anything that is not a bound
 * label.
 */
function labelContainerOf(el: ServerElement): string | undefined {
	const container = el.type === "text" ? el.containerId : undefined;
	return typeof container === "string" && container.length > 0 ? container : undefined;
}

/**
 * Whether one element is a label belonging to a shape the caller selected, and
 * so is already accounted for by that shape.
 * @param el The element.
 * @param targetIds The ids the caller selected.
 * @returns True when it folds into one of them.
 */
function isFoldedLabel(el: ServerElement, targetIds: ReadonlySet<string>): boolean {
	const container = labelContainerOf(el);
	return container !== undefined && targetIds.has(container);
}

/**
 * The selected shape one element is a bound label of.
 * @param el The element.
 * @param targetIds The ids the caller selected.
 * @returns The container's id, or undefined when this is not one of their
 * labels.
 */
function foldedContainerOf(el: ServerElement, targetIds: ReadonlySet<string>): string | undefined {
	const container = labelContainerOf(el);
	return container !== undefined && container !== el.id && targetIds.has(container)
		? container
		: undefined;
}

/**
 * The text bound to one shape, wherever on the board that text element sits.
 *
 * A labelled shape that came back through a frontend sync carries its label as
 * a separate bound text element rather than inline.
 * @param containerId The shape's id.
 * @param board Every element on the board.
 * @returns The words, or undefined when nothing is bound to it.
 */
function boundLabelOf(containerId: string, board: readonly ServerElement[]): string | undefined {
	for (const other of board) {
		if (other.type === "text" && other.containerId === containerId && other.text) {
			return other.text;
		}
	}
	return undefined;
}

/**
 * What one element says on the board: its own text, or the text bound to it.
 * @param el The element.
 * @param board Every element on the board, for the bound label.
 * @returns The words, or undefined when it shows none.
 */
function labelOf(el: ServerElement, board: readonly ServerElement[]): string | undefined {
	const direct = el.type === "text" ? el.text : undefined;
	return direct || boundLabelOf(el.id, board);
}

/**
 * Split a selection into the shapes it is about and the labels bound to them.
 * @param targets The elements the caller named.
 * @param board Every element on the board, because a label can sit outside the
 * selection.
 * @returns The shapes, and each shape's labels.
 */
function partition(targets: ServerElement[], board: ServerElement[]): Partitioned {
	const targetIds = new Set(targets.map((t) => t.id));
	const labelsByContainer = new Map<string, ServerElement[]>();
	for (const el of board) {
		const container = foldedContainerOf(el, targetIds);
		if (container !== undefined) {
			labelsByContainer.set(container, [...(labelsByContainer.get(container) ?? []), el]);
		}
	}
	return { shapes: targets.filter((el) => !isFoldedLabel(el, targetIds)), labelsByContainer };
}

/**
 * One group per shape, each named after its own label.
 *
 * `--each` covers the utterance "these are all services", where the shared
 * thing is the kind and each shape keeps its own identity.
 * @param shapes The shapes being promoted.
 * @param labelsByContainer Each shape's bound labels.
 * @param board Every element on the board, for the labels.
 * @returns The groups.
 * @throws {PromotionError} When a shape carries no label to be named after.
 */
function groupsPerShape(
	shapes: readonly ServerElement[],
	labelsByContainer: ReadonlyMap<string, ServerElement[]>,
	board: ServerElement[],
): PromotionGroup[] {
	return shapes.map((shape) => {
		const label = labelOf(shape, board);
		if (!label) {
			throw new PromotionError(
				`--each derives a node id from each shape's label, and ${shape.id} has none. ` +
					`Label it, or promote the shapes one at a time with --name.`,
			);
		}
		return { elements: [shape, ...(labelsByContainer.get(shape.id) ?? [])], name: label };
	});
}

/**
 * Refuse the flags that name one node when the caller asked for one node per
 * shape: a name, a node id and a binding each belong to a single node, and the
 * caller supplied only one of each.
 * @param request What the caller asked for.
 * @throws {PromotionError} When one of those flags was given.
 */
function refuseSingleNodeFlags(request: SingleNodeFlags): void {
	if (request.name) {
		throw new PromotionError("--name promotes one node; drop it or drop --each.");
	}
	if (request.nodeId) {
		throw new PromotionError("--node names one node; drop it or drop --each.");
	}
	if (request.binding) {
		throw new PromotionError(
			"A binding belongs to one node; promote each shape separately, or drop --each.",
		);
	}
}

/**
 * A name one of these shapes was already promoted under.
 * @param shapes The shapes.
 * @returns The name, or undefined when none of them was ever named.
 */
function declaredNameAmong(shapes: readonly ServerElement[]): string | undefined {
	return shapes
		.map((el) => readElementMetadata(el).archboard?.name)
		.find((name) => typeof name === "string" && name.length > 0);
}

/**
 * The label on the biggest labelled shape, which is the one a human reads.
 * @param shapes The shapes.
 * @param board Every element on the board, for the labels.
 * @returns The label, or undefined when none of them shows one.
 */
function biggestLabel(
	shapes: readonly ServerElement[],
	board: ServerElement[],
): string | undefined {
	return shapes
		.map((el) => ({ label: labelOf(el, board), area: areaOf(el) }))
		.filter((x) => x.label)
		.toSorted((a, b) => b.area - a.area)[0]?.label;
}

/**
 * The file a binding names, without its extension.
 * @param binding The binding, when the caller gave one.
 * @returns The file's name, or undefined.
 */
function bindingFileName(binding: ResolvedBinding | undefined): string | undefined {
	return binding ? path.basename(binding.address.path).replace(/\.[^.]+$/u, "") : undefined;
}

/**
 * What to call the node a whole selection becomes.
 *
 * Whatever it already answers to: an explicit name, else a name it was
 * promoted under before, else the biggest labelled shape in the set, else the
 * binding's file, else its existing node id. A previously declared name
 * outranks any inferred one.
 * @param shapes The shapes being promoted.
 * @param board Every element on the board, for the labels.
 * @param request What the caller asked for.
 * @returns The name.
 * @throws {PromotionError} When nothing names it.
 */
function nameForSelection(
	shapes: readonly ServerElement[],
	board: ServerElement[],
	request: SingleNodeFlags,
): string {
	const name =
		request.name ??
		declaredNameAmong(shapes) ??
		biggestLabel(shapes, board) ??
		bindingFileName(request.binding) ??
		shapes.map((shape) => nodeIdOf(shape)).find((id) => id !== undefined);
	if (!name) {
		throw new PromotionError(
			"Cannot name this node: nothing selected has a label, and no --name, --node or --path was given.",
		);
	}
	return name;
}

/**
 * One group holding the whole selection.
 *
 * The default, because a single promotion carries exactly one kind, one name
 * and one binding — one node's worth of meaning — and that matches the
 * utterance it exists for ("map this to the payments service", said over
 * however many boxes are lit up). Splitting one kind and one binding across
 * five shapes would invent four bindings nobody stated.
 * @param shapes The shapes being promoted.
 * @param labelsByContainer Each shape's bound labels.
 * @param board Every element on the board, for the labels.
 * @param request What the caller asked for.
 * @returns The one group.
 * @throws {PromotionError} When nothing names the node.
 */
function groupForSelection(
	shapes: readonly ServerElement[],
	labelsByContainer: ReadonlyMap<string, ServerElement[]>,
	board: ServerElement[],
	request: SingleNodeFlags,
): PromotionGroup {
	const elements = shapes.flatMap((shape) => [shape, ...(labelsByContainer.get(shape.id) ?? [])]);
	return {
		elements,
		name: nameForSelection(shapes, board, request),
		...(request.nodeId ? { nodeId: request.nodeId } : {}),
	};
}

export {
	type PromotionGroup,
	type SingleNodeFlags,
	groupForSelection,
	groupsPerShape,
	labelOf,
	partition,
	refuseSingleNodeFlags,
};
