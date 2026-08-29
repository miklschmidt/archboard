import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";

import { type ServerElement } from "./types.js";
import { readElementMetadata } from "./metadata.js";
import type { LogicalAddress } from "./metadata.js";
import { checkoutFor } from "./repo-registry.js";

function inside(root: string, target: string): boolean {
	const relative = path.relative(root, target);
	return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function existingFile(file: string): boolean {
	try {
		return fs.statSync(file).isFile();
	} catch {
		return false;
	}
}

/** Resolve the machine-local link for a portable binding, when this checkout has it. */
export function linkForBinding(binding: LogicalAddress | undefined): string | undefined {
	if (!binding?.repo || !binding.path || path.isAbsolute(binding.path)) return undefined;
	const root = checkoutFor(binding.repo);
	if (!root) return undefined;
	const file = path.resolve(root, binding.path);
	if (!inside(root, file) || !existingFile(file)) return undefined;
	return pathToFileURL(file).href;
}

/** Strip every stored link from bound elements before the board is serialized. */
export function stripBindingPresentationLink(
	element: ServerElement,
	derivedTarget?: string,
): ServerElement {
	const binding = readElementMetadata(element).archboard?.binding;
	if (!binding) return element;
	const derived = derivedTarget ?? linkForBinding(binding);
	return derived && element.link === derived ? { ...element, link: null } : element;
}

export function stripBindingPresentationLinks(elements: Iterable<ServerElement>): ServerElement[] {
	return Array.from(elements, (element) => stripBindingPresentationLink(element));
}

/** Add or remove the local presentation link for a bound element without mutating it. */
export function presentElement(element: ServerElement, derivedTarget?: string): ServerElement {
	const binding = readElementMetadata(element).archboard?.binding;
	if (!binding) return element;
	const link = derivedTarget ?? linkForBinding(binding);
	return link ? { ...element, link } : element;
}

export function presentElements(elements: Iterable<ServerElement>): ServerElement[] {
	return Array.from(elements, (element) => presentElement(element));
}

/** Restore the board's canonical link when a browser echoes its presentation copy. */
export function canonicalLinkAfterPresentationEcho(
	existing: ServerElement | undefined,
	incoming: unknown,
	derivedTarget?: string,
): string | null | undefined {
	if (!existing) return typeof incoming === "string" || incoming === null ? incoming : undefined;
	const binding = readElementMetadata(existing).archboard?.binding;
	const derived = derivedTarget ?? linkForBinding(binding);
	if (derived && incoming === derived) return existing.link;
	return typeof incoming === "string" || incoming === null ? incoming : existing.link;
}
