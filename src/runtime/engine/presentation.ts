import { CodeBindingSchema, type CodeBinding } from "../../shared/code-target/index.js";
import {
	resolveLocalCodeTarget,
	resolveLocalCodeTargets,
	EMPTY_CHECKOUT_SNAPSHOT,
	type CheckoutSnapshot,
} from "../code-target/index.js";
import { presentationTargetForBinding } from "../code-target/presentation.js";
import type { ReadonlyBoardData } from "../../shared/board-elements/index.js";
import { readElementMetadata } from "./metadata.js";
import { type ServerElement } from "./types.js";

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

function markerOf(element: { customData?: unknown }): PresentationMarker | undefined {
	const custom = element.customData;
	if (!custom || typeof custom !== "object" || Array.isArray(custom)) return undefined;
	const archboard = (custom as Record<string, unknown>)["archboard"];
	if (!archboard || typeof archboard !== "object" || Array.isArray(archboard)) return undefined;
	const marker = (archboard as Record<string, unknown>)[PRESENTATION_MARKER_KEY];
	if (!marker || typeof marker !== "object" || Array.isArray(marker)) return undefined;
	const { board, element: id, target } = marker as Record<string, unknown>;
	return typeof board === "string" && typeof id === "string" && typeof target === "string"
		? { board, element: id, target }
		: undefined;
}

function withoutMarker<T extends object>(element: T): T {
	const custom = (element as { customData?: unknown }).customData;
	if (!custom || typeof custom !== "object" || Array.isArray(custom)) return element;
	const archboard = (custom as Record<string, unknown>)["archboard"];
	if (!archboard || typeof archboard !== "object" || Array.isArray(archboard)) return element;
	if (!(PRESENTATION_MARKER_KEY in archboard)) return element;
	const nextArchboard = { ...archboard } as Record<string, unknown>;
	delete nextArchboard[PRESENTATION_MARKER_KEY];
	const nextCustom = { ...custom } as Record<string, unknown>;
	if (Object.keys(nextArchboard).length === 0) delete nextCustom["archboard"];
	else nextCustom["archboard"] = nextArchboard;
	const result = { ...element } as T & { customData?: Record<string, unknown> };
	if (Object.keys(nextCustom).length === 0) delete result.customData;
	else result.customData = nextCustom;
	return result;
}

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
function withLink(
	element: ReadonlyServerElement,
	link: string | null,
	boardKey: string,
): ReadonlyServerElement {
	if (link === null) return { ...withoutMarker(element), link };
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

function bindingOf(element: ReadonlyServerElement): CodeBinding | undefined {
	const parsed = CodeBindingSchema.safeParse(readElementMetadata(element).archboard?.binding);
	return parsed.success ? parsed.data : undefined;
}

export function codeBindingsOf(elements: Iterable<ReadonlyServerElement>): CodeBinding[] {
	return Array.from(elements).flatMap((element) => {
		const binding = bindingOf(element);
		return binding ? [binding] : [];
	});
}

function isDerivedTarget(
	element: ReadonlyServerElement,
	incoming: unknown,
	context: ReadonlyPresentationContext,
): boolean {
	if (typeof incoming !== "string") return false;
	if (!bindingOf(element)) return false;
	const marker = markerOf(element);
	if (
		marker?.board === context.boardKey &&
		marker.element === element.id &&
		marker.target === incoming
	)
		return true;
	return targetFor(element, context) === incoming;
}

export function stripBindingPresentationLink(
	element: ServerElement,
	context: PresentationContext,
): ServerElement {
	const canonical = withoutMarker(element);
	return isDerivedTarget(element, element.link, context) ? { ...canonical, link: null } : canonical;
}

export function stripBindingPresentationLinks(
	elements: Iterable<ServerElement>,
	context: PresentationContext,
): ServerElement[] {
	const values = Array.from(elements);
	return values.map((element) => stripBindingPresentationLink(element, context));
}

export function presentElement(
	element: ServerElement,
	context: PresentationContext,
): ServerElement {
	const binding = bindingOf(element);
	if (!binding) return element;
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
export function presentElements(
	elements: Iterable<ReadonlyServerElement>,
	context: ReadonlyPresentationContext,
): readonly ReadonlyServerElement[] {
	const values = Array.from(elements);
	const bindings = codeBindingsOf(values);
	if (bindings.length === 0) return values;
	const locals = resolveLocalCodeTargets(
		bindings,
		context.checkoutSnapshot ?? EMPTY_CHECKOUT_SNAPSHOT,
	);
	let index = 0;
	return values.map((element) => {
		const binding = bindingOf(element);
		if (!binding) return element;
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

/** Exact noncanonical provenance carried by one presented element copy. */
export function presentationContextFromElement(
	element: { id?: unknown; link?: unknown; customData?: unknown },
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

/** Remove outbound-only provenance before input conversion or persistence. */
export function stripPresentationMarker<T extends object>(element: T): T {
	return withoutMarker(element);
}

export function canonicalLinkAfterPresentationEcho(
	existing: ServerElement | undefined,
	incoming: unknown,
	context: PresentationContext,
): string | null | undefined {
	if (!existing) return typeof incoming === "string" || incoming === null ? incoming : undefined;
	if (isDerivedTarget(existing, incoming, context)) return existing.link;
	return typeof incoming === "string" || incoming === null ? incoming : existing.link;
}
