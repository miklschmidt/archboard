import { CodeBindingSchema, type CodeBinding } from "@/shared/code-target";
import {
	resolveLocalCodeTarget,
	resolveLocalCodeTargets,
	EMPTY_CHECKOUT_SNAPSHOT,
	type CheckoutSnapshot,
} from "@/runtime/code-target";
import { presentationTargetForBinding } from "@/runtime/code-target/presentation";
import type { ReadonlyBoardData } from "@/shared/board-elements";
import { isRecord, stringAt } from "@/runtime/engine/lib/unknown-record";
import { readElementMetadata } from "@/runtime/engine/metadata";
import { type ServerElement } from "@/runtime/engine/types";

export interface PresentationContext {
	boardKey: string;
	opaqueTarget?: string;
	opaqueTargets?: ReadonlyMap<string, string>;
	checkoutSnapshot?: CheckoutSnapshot;
}

export type ReadonlyServerElement = ReadonlyBoardData<ServerElement>;

type ReadonlyPresentationContext = Readonly<Omit<PresentationContext, "checkoutSnapshot">> & {
	readonly checkoutSnapshot?: Readonly<CheckoutSnapshot>;
};

interface PresentationMarker {
	readonly board: string;
	readonly element: string;
	readonly target: string;
}

const PRESENTATION_MARKER_KEY = "presentationTarget";

/** Anything that may carry archboard's metadata channel. */
type WithCustomData = { customData?: unknown };

/** One presented copy, as the marker reader sees it. */
type PresentedCopy = WithCustomData & { id?: unknown; link?: unknown };

/**
 * The marker a presented copy carries, saying which board and element the
 * overlay was made for and what it showed.
 * @param element The element as it arrived.
 * @returns The marker, or undefined when the element carries none.
 */
function markerOf(element: WithCustomData): PresentationMarker | undefined {
	const marker = plainRecord(archboardChannel(element)?.[PRESENTATION_MARKER_KEY]);
	if (!marker) {
		return undefined;
	}
	const board = stringAt(marker, "board");
	const id = stringAt(marker, "element");
	const target = stringAt(marker, "target");
	if (board === undefined || id === undefined || target === undefined) {
		return undefined;
	}
	return { board, element: id, target };
}

/**
 * A value as a record of named fields; an array is not one.
 * @param value The value.
 * @returns The record, or undefined.
 */
function plainRecord(value: unknown): Record<string, unknown> | undefined {
	return isRecord(value) && !Array.isArray(value) ? value : undefined;
}

/**
 * Archboard's own metadata channel on one element (ADR 0003).
 * @param element The element.
 * @returns The channel, or undefined when the element carries none.
 */
function archboardChannel(element: WithCustomData): Record<string, unknown> | undefined {
	return plainRecord(plainRecord(element.customData)?.["archboard"]);
}

/**
 * The element without its presentation marker, and without whatever the
 * marker was the only thing in: an element that carried nothing else keeps no
 * empty `customData.archboard` behind.
 * @param element The element.
 * @returns A copy without the marker, or the element itself when it has none.
 */
function withoutMarker<T extends object>(element: T): T {
	const custom = plainRecord((element as { customData?: unknown }).customData);
	const archboard = plainRecord(custom?.["archboard"]);
	if (!custom || !archboard || !(PRESENTATION_MARKER_KEY in archboard)) {
		return element;
	}
	const nextArchboard = { ...archboard };
	delete nextArchboard[PRESENTATION_MARKER_KEY];
	const nextCustom = { ...custom };
	if (Object.keys(nextArchboard).length === 0) {
		delete nextCustom["archboard"];
	} else {
		nextCustom["archboard"] = nextArchboard;
	}
	return withCustomData(element, nextCustom);
}

/**
 * The element with its `customData` replaced, or dropped when nothing is left
 * in it.
 * @param element The element.
 * @param custom What its metadata now holds.
 * @returns The copy.
 */
function withCustomData<T extends object>(element: T, custom: Record<string, unknown>): T {
	// The element's own fields, with one of them replaced; nothing else changes.
	const result = { ...element } as T & { customData?: Record<string, unknown> };
	if (Object.keys(custom).length === 0) {
		delete result.customData;
	} else {
		result.customData = custom;
	}
	return result;
}

/**
 * The opaque target this operation last showed for one element, when it
 * showed one at all.
 * @param element The element.
 * @param context What the presenter is showing.
 * @returns The target, or undefined.
 */
function targetFor(
	element: ReadonlyServerElement,
	context: ReadonlyPresentationContext,
): string | undefined {
	return context.opaqueTargets?.get(element.id) ?? context.opaqueTarget;
}

function withLink(element: ServerElement, link: string | null, boardKey: string): ServerElement;
function withLink(
	element: ReadonlyServerElement,
	link: string | null,
	boardKey: string,
): ReadonlyServerElement;
/**
 * The element carrying one presentation link, with the marker that says the
 * link is an overlay rather than the board's own.
 * @param element The element.
 * @param link The link to show, or null to show none.
 * @param boardKey Which board the overlay was made for.
 * @returns The presented copy.
 */
function withLink(
	element: ReadonlyServerElement,
	link: string | null,
	boardKey: string,
): ReadonlyServerElement {
	if (link === null) {
		return { ...withoutMarker(element), link };
	}
	const custom = element.customData ?? {};
	const archboard =
		custom.archboard && typeof custom.archboard === "object" && !Array.isArray(custom.archboard)
			? custom.archboard
			: {};
	return {
		...element,
		link,
		customData: {
			...custom,
			archboard: {
				...archboard,
				[PRESENTATION_MARKER_KEY]: { board: boardKey, element: element.id, target: link },
			},
		},
	};
}

/**
 * The code a node binds to, when it binds to code at all.
 * @param element The element.
 * @returns The binding, or undefined.
 */
function bindingOf(element: ReadonlyServerElement): CodeBinding | undefined {
	const parsed = CodeBindingSchema.safeParse(readElementMetadata(element).archboard?.binding);
	return parsed.success ? parsed.data : undefined;
}

/**
 * Every code binding a set of elements carries.
 * @param elements The elements.
 * @returns The bindings, in element order.
 */
export function codeBindingsOf(elements: Iterable<ReadonlyServerElement>): CodeBinding[] {
	return Array.from(elements).flatMap((element) => {
		const binding = bindingOf(element);
		return binding ? [binding] : [];
	});
}

/**
 * Whether a link came back from an overlay this operation showed, rather than
 * being what the board itself says.
 *
 * A presented copy carries a marker naming the board, the element and the
 * exact link it showed; a link that matches it, or the opaque target this
 * operation is showing, is the overlay coming home rather than an edit.
 * @param element The element as the board holds it.
 * @param incoming The link that arrived.
 * @param context What the presenter is showing.
 * @returns True when the link is the overlay's own.
 */
function isDerivedTarget(
	element: ReadonlyServerElement,
	incoming: unknown,
	context: ReadonlyPresentationContext,
): boolean {
	if (typeof incoming !== "string" || !bindingOf(element)) {
		return false;
	}
	return markerMatches(element, incoming, context) || targetFor(element, context) === incoming;
}

/**
 * Whether an element's own marker says this exact link was shown for it.
 * @param element The element.
 * @param incoming The link that arrived.
 * @param context What the presenter is showing.
 * @returns True when the marker names this board, this element and this link.
 */
function markerMatches(
	element: ReadonlyServerElement,
	incoming: string,
	context: ReadonlyPresentationContext,
): boolean {
	const marker = markerOf(element);
	return (
		marker?.board === context.boardKey &&
		marker.element === element.id &&
		marker.target === incoming
	);
}

/**
 * One element as the board holds it: the overlay's marker gone, and its link
 * cleared when the link was the overlay's own (ADR 0015).
 * @param element The element as it arrived.
 * @param context What the presenter showed.
 * @returns The canonical element.
 */
export function stripBindingPresentationLink(
	element: ServerElement,
	context: PresentationContext,
): ServerElement {
	const canonical = withoutMarker(element);
	return isDerivedTarget(element, element.link, context) ? { ...canonical, link: null } : canonical;
}

/**
 * A set of elements as the board holds them, with every overlay spent.
 * @param elements The elements as they arrived.
 * @param context What the presenter showed.
 * @returns The canonical elements.
 */
export function stripBindingPresentationLinks(
	elements: Iterable<ServerElement>,
	context: PresentationContext,
): ServerElement[] {
	const values = Array.from(elements);
	return values.map((element) => stripBindingPresentationLink(element, context));
}

/**
 * One element as a reader sees it: a code binding shown as the link a person
 * can follow, marked so the link coming back is recognised as the overlay it
 * is and never persisted.
 * @param element The element as the board holds it.
 * @param context Which board this is, and what was shown last.
 * @returns The presented copy, or the element itself when it binds to no code.
 */
export function presentElement(
	element: ServerElement,
	context: PresentationContext,
): ServerElement {
	const binding = bindingOf(element);
	if (!binding) {
		return element;
	}
	const opaque = targetFor(element, context);
	const fresh = presentationTargetForBinding(
		binding,
		{ board: context.boardKey, element: element.id },
		resolveLocalCodeTarget(binding, context.checkoutSnapshot ?? EMPTY_CHECKOUT_SNAPSHOT),
	);
	const target = opaque === fresh ? opaque : fresh;
	return target ? withLink(element, target, context.boardKey) : element;
}

export function presentElements(
	elements: Iterable<ServerElement>,
	context: PresentationContext,
): ServerElement[];
export function presentElements(
	elements: Iterable<ReadonlyServerElement>,
	context: ReadonlyPresentationContext,
): readonly ReadonlyServerElement[];
/**
 * A set of elements as a reader sees them, resolving every binding in one
 * pass so a board of three hundred does not resolve three hundred times.
 * @param elements The elements as the board holds them.
 * @param context Which board this is, and what was shown last.
 * @returns The presented copies.
 */
export function presentElements(
	elements: Iterable<ReadonlyServerElement>,
	context: ReadonlyPresentationContext,
): readonly ReadonlyServerElement[] {
	const values = Array.from(elements);
	const bindings = codeBindingsOf(values);
	if (bindings.length === 0) {
		return values;
	}
	const locals = resolveLocalCodeTargets(
		bindings,
		context.checkoutSnapshot ?? EMPTY_CHECKOUT_SNAPSHOT,
	);
	let index = 0;
	return values.map((element) => {
		const binding = bindingOf(element);
		if (!binding) {
			return element;
		}
		const local = locals[index++]!;
		const fresh = presentationTargetForBinding(
			binding,
			{ board: context.boardKey, element: element.id },
			local,
		);
		const opaque = targetFor(element, context);
		const target = opaque === fresh ? opaque : fresh;
		return target ? withLink(element, target, context.boardKey) : element;
	});
}

/**
 * The exact overlay one presented copy carries, when it carries one for this
 * board.
 * @param element The copy as it arrived.
 * @param boardKey Which board it should name.
 * @returns The context, or undefined when the copy carries no overlay of ours.
 */
export function presentationContextFromElement(
	element: PresentedCopy,
	boardKey: string,
): PresentationContext | undefined {
	const marker = markerOf(element);
	return typeof element.id === "string" &&
		marker?.board === boardKey &&
		marker.element === element.id &&
		marker.target === element.link
		? { boardKey, opaqueTarget: marker.target }
		: undefined;
}

/**
 * Remove outbound-only provenance before input conversion or persistence.
 * @param element The element as it arrived.
 * @returns The element without the marker.
 */
export function stripPresentationMarker<T extends object>(element: T): T {
	return withoutMarker(element);
}

/**
 * The link to persist when one comes back from a presented copy.
 *
 * A link that is the overlay's own leaves the board's link exactly as it was;
 * anything else is a real edit and is taken at its word.
 * @param existing The element as the board holds it, when it holds one.
 * @param incoming The link that arrived.
 * @param context What the presenter showed.
 * @returns The link to persist, or undefined when the write settles none.
 */
export function canonicalLinkAfterPresentationEcho(
	existing: ServerElement | undefined,
	incoming: unknown,
	context: PresentationContext,
): string | null | undefined {
	const stated = typeof incoming === "string" || incoming === null ? incoming : undefined;
	if (!existing) {
		return stated;
	}
	if (isDerivedTarget(existing, incoming, context)) {
		return existing.link;
	}
	return stated ?? existing.link;
}
