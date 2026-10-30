// The code path a card shows.
//
// A card reads like a repository, so it shows where its code lives. An authored
// binding is shown as written. A container that names no code of its own shows
// the folder its parts share and how many paths they name, so it reads as a span
// and not as ownership. That text is drawn and nothing else: only an authored
// binding opens source, and a path never establishes identity or containment.

import type { VariantContent } from "#shared/schemas/content.ts";

type Node = VariantContent["nodes"][number];

/** The kind of a module that this repository does not own, so it has no path here. */
const EXTERNAL_KIND = "external";

/**
 * The deepest folder that every path sits in.
 * @param paths Distinct repository-relative paths.
 * @returns The shared folder, or nothing when they share none.
 */
function sharedFolder(paths: readonly string[]): string {
	const [first = [], ...rest] = paths.map((path) => path.split("/"));
	const depth = rest.reduce((shared, other) => {
		const differs = first.findIndex((segment, index) => segment !== other[index]);
		return Math.min(shared, differs === -1 ? first.length : differs);
	}, first.length);
	return first.slice(0, depth).join("/");
}

/**
 * The span of the code that a container's parts name, as a reader sees it.
 * @param bindings Every binding inside the container.
 * @returns The shared folder with a count, or nothing when no part names code.
 */
function spanOf(bindings: readonly NonNullable<Node["binding"]>[]): string | undefined {
	const paths = [...new Set(bindings.map((binding) => binding.path))];
	if (paths.length === 0) return undefined;
	const count = `${paths.length} ${paths.length === 1 ? "path" : "paths"}`;
	const folder =
		new Set(bindings.map((binding) => binding.repo)).size === 1 ? sharedFolder(paths) : "";
	return folder === "" ? count : `${folder} · ${count}`;
}

/**
 * Every binding that a module's descendants author.
 * @param id The module.
 * @param childrenOf The containment index.
 * @returns The bindings, at any depth.
 */
function bindingsInside(
	id: string,
	childrenOf: ReadonlyMap<string, readonly Node[]>,
): NonNullable<Node["binding"]>[] {
	return (childrenOf.get(id) ?? []).flatMap((child) => [
		...(child.binding === undefined ? [] : [child.binding]),
		...bindingsInside(child.id, childrenOf),
	]);
}

/**
 * The code path one card shows.
 * @param node The drawn module.
 * @param childrenOf The containment index of the complete content.
 * @returns The words of its path row, or nothing when it has none.
 */
function codePathOf(
	node: Node,
	childrenOf: ReadonlyMap<string, readonly Node[]>,
): string | undefined {
	if (node.kind === EXTERNAL_KIND) return undefined;
	return node.binding?.path ?? spanOf(bindingsInside(node.id, childrenOf));
}

/**
 * Where a module sits among its siblings: its path, or the folder its parts share.
 * @param node The module.
 * @param childrenOf The containment index of the complete content.
 * @returns The folder, or nothing for a module that names no code.
 */
function codeFolderOf(
	node: Node,
	childrenOf: ReadonlyMap<string, readonly Node[]>,
): string | undefined {
	if (node.kind === EXTERNAL_KIND) return undefined;
	if (node.binding !== undefined) return node.binding.path;
	const bindings = bindingsInside(node.id, childrenOf);
	const paths = [...new Set(bindings.map((binding) => binding.path))];
	const folder =
		new Set(bindings.map((binding) => binding.repo)).size === 1 ? sharedFolder(paths) : "";
	return folder === "" ? undefined : folder;
}

export { codeFolderOf, codePathOf };
