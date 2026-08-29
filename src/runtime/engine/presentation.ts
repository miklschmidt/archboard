import { pathToFileURL } from "node:url";

import {
	CodeBindingSchema,
	parseInternalCodeTargetUrl,
	type CodeBinding,
} from "../../shared/code-target/index.js";
import {
	resolveLocalCodeTarget,
	resolveLocalCodeTargets,
	type LocalCodeTargetResult,
} from "../code-target/index.js";
import { githubUrlForBinding, presentationTargetForBinding } from "../code-target/presentation.js";
import { readElementMetadata } from "./metadata.js";
import { type ServerElement } from "./types.js";

export interface PresentationContext {
	boardKey: string;
	opaqueTarget?: string;
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
	local?: LocalCodeTargetResult,
): boolean {
	if (typeof incoming !== "string") return false;
	const binding = bindingOf(element);
	if (!binding) return false;
	if (exactInternalTarget(incoming, element, context)) return true;
	if (incoming === githubUrlForBinding(binding)) return true;
	if (context.opaqueTarget !== undefined && incoming === context.opaqueTarget) return true;
	const current = local ?? resolveLocalCodeTarget(binding);
	return current.ok && incoming === pathToFileURL(current.target).href;
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
	const bindings = values.flatMap((element) => {
		const binding = bindingOf(element);
		return binding ? [binding] : [];
	});
	if (bindings.length === 0) return values;
	const locals = resolveLocalCodeTargets(bindings);
	let index = 0;
	return values.map((element) => {
		const binding = bindingOf(element);
		if (!binding) return element;
		return isDerivedTarget(element, element.link, context, locals[index++])
			? withLink(element, null)
			: element;
	});
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
		resolveLocalCodeTarget(binding),
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
	const locals = resolveLocalCodeTargets(bindings);
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
