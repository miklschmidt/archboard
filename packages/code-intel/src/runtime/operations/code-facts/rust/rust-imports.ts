// The imports of a Rust file (ADR 0046, TASK-540): each name a `use`
// declaration brings in, each module a `mod name;` declaration reads from
// another file, and each crate an `extern crate` names.
//
// A `use` tree is split into its leaves, one import each, because the names
// of one tree can lead to different files: `use crate::a::{b, C}` names the
// module `b` and the item `C` of `a`. The specifier is the leaf's path as
// written, joined by `::`, with `::*` after a glob. A path is read from the
// file's own module: inside an inline module (`mod tests { ... }`), `self`
// and `super` are rewritten to the file's module, so `super::*` in the tests
// of a file is `self::*`, the file itself. A path that starts with neither
// `crate`, `self` nor `super` names a module in scope or a crate the package
// depends on, which only resolution can tell (rust-resolution.ts).
//
// A `mod name;` declaration is an import of its module as a whole, `self::name`
// with the name `*`: what the module's file defines is reached through the
// name, as `name::item` reaches it. A `pub use` and a `pub mod` pass names on,
// so they are re-exports, as `export ... from` is in TypeScript: that is how
// a crate's `lib.rs` exposes what its modules define. Rust has no import of
// types only.

import type { Node } from "web-tree-sitter";
import type { Import } from "#runtime/operations/code-facts/facts.ts";
import { opens } from "#runtime/operations/code-facts/rust/rust-definitions.ts";

/** One leaf of a `use` tree: its path, its alias, and whether it is a glob. */
interface Leaf {
	readonly path: readonly string[];
	readonly alias?: string;
	readonly glob: boolean;
}

/** What one declaration's imports share: its line, and whether it passes its names on. */
interface Declared {
	readonly line: number;
	readonly reexport: boolean;
}

/** The words that start a path at a module rather than at a name. */
const HEADS = new Set(["crate", "self", "super"]);

/** The nodes that are one name of a path. */
const NAMES = new Set(["identifier", ...HEADS]);

/**
 * The names of a path as written: `crate::a::B` is `crate`, `a`, `B`.
 * @param node The path.
 * @returns Its names, or undefined for a path a macro's variable writes.
 */
function segmentsOf(node: Node | null | undefined): string[] | undefined {
	if (node === null || node === undefined) return [];
	if (NAMES.has(node.type)) return [node.text];
	return node.type === "scoped_identifier" ? scopedSegments(node) : undefined;
}

/**
 * The names of a path joined by `::`.
 * @param node The path.
 * @returns Its names, or undefined for one a macro's variable writes.
 */
function scopedSegments(node: Node): string[] | undefined {
	const base = segmentsOf(node.childForFieldName("path"));
	const name = node.childForFieldName("name")?.text;
	return base === undefined || name === undefined ? undefined : [...base, name];
}

/**
 * The leaf of a path, after the lists around it.
 * @param path The path's names, if it has any.
 * @param prefix The path of the lists around it.
 * @param glob Whether the leaf is a glob.
 * @returns The leaf, or none.
 */
function pathLeaf(path: string[] | undefined, prefix: readonly string[], glob: boolean): Leaf[] {
	return path === undefined ? [] : [{ path: [...prefix, ...path], glob }];
}

/** How each node of a `use` tree gives its leaves; any other node is a path. */
const LEAVES: Readonly<Record<string, (node: Node, prefix: readonly string[]) => Leaf[]>> = {
	/**
	 * `self` in a list names the module the list is in.
	 * @param _node The `self`.
	 * @param prefix The list's path.
	 * @returns The module's leaf.
	 */
	self: (_node, prefix) => (prefix.length === 0 ? [] : [{ path: prefix, glob: false }]),
	/**
	 * A path under another name.
	 * @param node The clause.
	 * @param prefix The path of the lists around it.
	 * @returns Its leaf.
	 */
	use_as_clause: (node, prefix) => {
		const path = segmentsOf(node.childForFieldName("path"));
		const alias = node.childForFieldName("alias")?.text ?? "_";
		const whole = prefix.length > 0 && path?.join("::") === "self" ? [] : path;
		return pathLeaf(whole, prefix, false).map((leaf) => ({ ...leaf, alias }));
	},
	/**
	 * A path with a list after it.
	 * @param node The list's path and list.
	 * @param prefix The path of the lists around it.
	 * @returns The leaves of the list.
	 */
	scoped_use_list: (node, prefix) => {
		const path = segmentsOf(node.childForFieldName("path"));
		const list = node.childForFieldName("list");
		return path === undefined || list === null ? [] : leavesOf(list, [...prefix, ...path]);
	},
	/**
	 * A list.
	 * @param node The list.
	 * @param prefix Its path.
	 * @returns The leaves of each of its trees.
	 */
	use_list: (node, prefix) => node.namedChildren.flatMap((child) => leavesOf(child, prefix)),
	/**
	 * A glob of a path.
	 * @param node The glob.
	 * @param prefix The path of the lists around it.
	 * @returns Its leaf.
	 */
	use_wildcard: (node, prefix) => pathLeaf(segmentsOf(node.namedChildren[0]), prefix, true),
};

/**
 * The leaves of a `use` tree.
 * @param node A node of the tree.
 * @param prefix The path of the lists around it.
 * @returns Its leaves.
 */
function leavesOf(node: Node, prefix: readonly string[]): Leaf[] {
	const leaves = LEAVES[node.type];
	return leaves === undefined ? pathLeaf(segmentsOf(node), prefix, false) : leaves(node, prefix);
}

/**
 * The inline modules around a node, outermost first.
 * @param node The node.
 * @returns Their names.
 */
function nestingOf(node: Node): string[] {
	const names: string[] = [];
	for (let at = node.parent; at !== null; at = at.parent) {
		const name = at.type === "mod_item" ? at.childForFieldName("name")?.text : undefined;
		if (name !== undefined) names.unshift(name);
	}
	return names;
}

/**
 * A path as the file's own module reads it: `self` and `super` inside inline
 * modules are rewritten to the modules around them, so the path starts with
 * `crate`, with `self` for the file's module, with as many `super` as lead
 * above it, or with a name in scope.
 * @param path The path as written.
 * @param nesting The inline modules around it.
 * @returns The path.
 */
function fromFile(path: readonly string[], nesting: readonly string[]): string[] {
	const [head] = path;
	if (head === "self") return ["self", ...nesting, ...path.slice(1)];
	if (head !== "super") return [...path];
	const ups = path.findIndex((name) => name !== "super");
	const count = ups === -1 ? path.length : ups;
	const rest = path.slice(count);
	if (count <= nesting.length) {
		return ["self", ...nesting.slice(0, nesting.length - count), ...rest];
	}
	return [...Array.from({ length: count - nesting.length }, () => "super"), ...rest];
}

/**
 * One import of a leaf.
 * @param leaf The leaf, its path read from the file's module.
 * @param declared The declaration's line and whether it passes names on.
 * @returns The import, or undefined for a leaf that names no name.
 */
function leafImport(leaf: Leaf, declared: Declared): Import | undefined {
	const last = leaf.glob ? "*" : leaf.path.at(-1);
	if (last === undefined) return undefined;
	const local = leaf.alias ?? last;
	if (HEADS.has(last)) return wholeImport(leaf.path.join("::"), local, declared);
	const specifier = (leaf.glob ? [...leaf.path, "*"] : leaf.path).join("::");
	const names = [{ imported: last, local, typeOnly: false }];
	return { specifier, ...declared, names, typeOnly: false };
}

/**
 * The import of a whole module or crate under a name.
 * @param specifier The module's or the crate's path.
 * @param local The name.
 * @param declared The declaration's line and whether it passes the name on.
 * @returns The import.
 */
function wholeImport(specifier: string, local: string, declared: Declared): Import {
	return {
		specifier,
		...declared,
		names: [{ imported: "*", local, typeOnly: false }],
		typeOnly: false,
	};
}

/** How each declaration gives its imports. */
const IMPORTS: Readonly<Record<string, (node: Node, declared: Declared) => Import[]>> = {
	/**
	 * `mod name;`: the module of that name, below the inline modules around it.
	 * @param node The declaration.
	 * @param declared Its line and visibility.
	 * @returns Its import.
	 */
	mod_item: (node, declared) => {
		const name = node.childForFieldName("name")?.text;
		const path = ["self", ...nestingOf(node), name ?? ""].join("::");
		return name === undefined ? [] : [wholeImport(path, name, declared)];
	},
	/**
	 * `extern crate name as alias;`: the crate under its alias.
	 * @param node The declaration.
	 * @param declared Its line and visibility.
	 * @returns Its import.
	 */
	extern_crate_declaration: (node, declared) => {
		const name = node.childForFieldName("name")?.text;
		const alias = node.childForFieldName("alias")?.text;
		return name === undefined ? [] : [wholeImport(name, alias ?? name, declared)];
	},
	/**
	 * `use`: each leaf of its tree, read from the file's module.
	 * @param node The declaration.
	 * @param declared Its line and visibility.
	 * @returns Its imports.
	 */
	use_declaration: (node, declared) => {
		const tree = node.childForFieldName("argument");
		const nesting = nestingOf(node);
		const leaves = tree === null ? [] : leavesOf(tree, []);
		return leaves.flatMap(
			(leaf) => leafImport({ ...leaf, path: fromFile(leaf.path, nesting) }, declared) ?? [],
		);
	},
};

/**
 * The imports of one `use`, `mod name;` or `extern crate` declaration.
 * @param node The declaration.
 * @returns Its imports.
 */
function importsOf(node: Node): Import[] {
	const visibility = node.namedChildren.find((child) => child.type === "visibility_modifier");
	const reexport = visibility !== undefined && opens(visibility.text.replaceAll(/\s+/gu, ""));
	return IMPORTS[node.type]?.(node, { line: node.startPosition.row + 1, reexport }) ?? [];
}

export { fromFile, importsOf, nestingOf };
