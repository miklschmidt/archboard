import {
	CodeBindingSchema,
	parseInternalCodeTargetUrl,
	type CodeBinding,
} from "../../shared/code-target/index.js";
import {
	resolveLocalCodeTarget,
	resolveLocalCodeTargets,
	EMPTY_CHECKOUT_SNAPSHOT,
	type CheckoutSnapshot,
} from "../code-target/index.js";
import { presentationTargetForBinding } from "../code-target/presentation.js";
import { readElementMetadata } from "./metadata.js";
import { type ServerElement } from "./types.js";

export interface PresentationContext {
	boardKey: string;
	opaqueTarget?: string;
	checkoutSnapshot?: CheckoutSnapshot;
}

function withLink(element: ServerElement, link: string | null): ServerElement {
	return { ...element, link };
}

function bindingOf(element: ServerElement): CodeBinding | undefined {
	const parsed = CodeBindingSchema.safeParse(readElementMetadata(element).archboard?.binding);
	return parsed.success ? parsed.data : undefined;
}

function exactInternalTarget(
	value: string,
	element: ServerElement,
	context: PresentationContext,
): boolean {
	const parsed = parseInternalCodeTargetUrl(value);
	return parsed?.board === context.boardKey && parsed.element === element.id;
}

function isDerivedTarget(
	element: ServerElement,
	incoming: unknown,
	context: PresentationContext,
): boolean {
	if (typeof incoming !== "string") return false;
	if (!bindingOf(element)) return false;
	if (exactInternalTarget(incoming, element, context)) return true;
	return context.opaqueTarget !== undefined && incoming === context.opaqueTarget;
}

export function stripBindingPresentationLink(
	element: ServerElement,
	context: PresentationContext,
): ServerElement {
	return isDerivedTarget(element, element.link, context) ? withLink(element, null) : element;
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
	if (context.opaqueTarget !== undefined) return withLink(element, context.opaqueTarget);
	const target = presentationTargetForBinding(
		binding,
		{ board: context.boardKey, element: element.id },
		resolveLocalCodeTarget(binding, context.checkoutSnapshot ?? EMPTY_CHECKOUT_SNAPSHOT),
	);
	return target ? withLink(element, target) : element;
}

export function presentElements(
	elements: Iterable<ServerElement>,
	context: PresentationContext,
): ServerElement[] {
	const values = Array.from(elements);
	const bindings = values.flatMap((element) => {
		const binding = bindingOf(element);
		return binding ? [binding] : [];
	});
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
		const target =
			context.opaqueTarget ??
			presentationTargetForBinding(
				binding,
				{ board: context.boardKey, element: element.id },
				local,
			);
		return target ? withLink(element, target) : element;
	});
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
