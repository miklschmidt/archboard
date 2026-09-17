// Remix Icon path data, read out of the installed `@remixicon/react` package.
//
// Each icon is a function component returning one `<svg>` whose children are
// `<path d>` elements. Calling it with no props gives that element tree without
// rendering anything, and the paths are read off it. The runtime tests hold the
// markup the renderer writes from these paths to what the component renders.

import * as RemixIcons from "@remixicon/react";
import { isValidElement, type ReactNode } from "react";

const icons = new Map<string, unknown>(Object.entries(RemixIcons));
const known = new Map<string, readonly string[] | undefined>();

/**
 * The `d` of every `<path>` in an element tree, in order.
 * @param node The tree.
 * @returns The path data.
 */
function pathsIn(node: unknown): string[] {
	if (Array.isArray(node)) return node.flatMap((child: unknown) => pathsIn(child));
	if (!isValidElement<{ d?: unknown; children?: ReactNode }>(node)) return [];
	const own = node.type === "path" && typeof node.props.d === "string" ? [node.props.d] : [];
	return [...own, ...pathsIn(node.props.children)];
}

/**
 * One icon's path data, by export name.
 * @param name The export name, e.g. `RiServerLine`.
 * @returns Its paths, or nothing when the package has no such icon.
 */
function iconPaths(name: string): readonly string[] | undefined {
	if (known.has(name)) return known.get(name);
	const component = icons.get(name);
	const tree: unknown = typeof component === "function" ? component({}) : undefined;
	const paths = tree === undefined ? undefined : pathsIn(tree);
	known.set(name, paths?.length === 0 ? undefined : paths);
	return known.get(name);
}

/**
 * Every icon name the package exports.
 * @returns The names.
 */
function iconNames(): string[] {
	return [...icons.keys()].filter((name) => /^Ri[A-Za-z0-9]+(?:Line|Fill)$/u.test(name));
}

export { iconNames, iconPaths };
