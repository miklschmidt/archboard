// Local Nix imports share the flake's static reading and its operation budget.
// The pass supplies its checkout read boundary, so an unlisted file or a link
// outside the checkout never reaches the parser. No Nix process runs.

import path from "node:path";
import type { Node, Tree } from "web-tree-sitter";
import type { ReadText, Unparsed } from "#runtime/operations/code-facts/facts.ts";
import type { Grammar } from "#runtime/services/code-facts/grammars.ts";
import { MAX_STEPS, readFile } from "#runtime/operations/code-facts/nix/nix-evaluation.ts";
import {
	type Budget,
	type NixValue,
	type Thunk,
	lazy,
	spend,
	unknownAt,
} from "#runtime/operations/code-facts/nix/nix-values.ts";

/** Where the flake and its permitted local sources are read. */
interface NixFiles {
	readonly root: string;
	readonly file: string;
	readonly read: ReadText;
}

/** The local sources and live trees of one flake reading. */
interface LocalReading {
	readonly files: NixFiles;
	readonly grammar: Grammar;
	readonly sources: Map<Tree, string>;
	readonly imported: Map<string, Thunk>;
	readonly trees: Tree[];
	readonly budget: Budget;
}

/**
 * Whether a relative path would leave the checkout.
 * @param relative The path relative to its root.
 * @returns True for an outside path.
 */
function outsideCheckout(relative: string): boolean {
	return relative === ".." || relative.startsWith("../") || path.isAbsolute(relative);
}

/**
 * Resolve a literal path against the file that writes it, inside the checkout.
 * @param value The path value.
 * @param at The local reading.
 * @returns Its Nix source path, or nothing for an unknown or outside path.
 */
function sourcePath(value: NixValue, at: LocalReading): string | undefined {
	if (value.kind !== "path" || value.text === undefined) return undefined;
	const from = at.sources.get(value.node.tree);
	if (from === undefined) return undefined;
	const absolute = path.resolve(at.files.root, path.posix.dirname(from), value.text);
	const relative = path.relative(at.files.root, absolute).split(path.sep).join("/");
	if (outsideCheckout(relative)) return undefined;
	return relative.endsWith(".nix") ? relative : path.posix.join(relative, "default.nix");
}

/**
 * Parse one permitted source and keep its tree until all lazy values are read.
 * @param file The local Nix source.
 * @param at The local reading.
 * @returns Its lazy value, or nothing when the pass cannot read the source.
 */
function parsedSource(file: string, at: LocalReading): Thunk | undefined {
	const text = at.files.read(file);
	if (text === undefined) return undefined;
	const tree = at.grammar.parser.parse(text);
	if (tree === null) return undefined;
	at.trees.push(tree);
	at.sources.set(tree, file);
	return lazy(
		() =>
			tree.rootNode.hasError ? unknownAt(tree.rootNode) : readFile(tree.rootNode, at.budget).value,
		tree.rootNode,
	);
}

/**
 * Read an import once, spending the flake's budget and retaining cycle detection.
 * @param value The path value.
 * @param call The importing expression.
 * @param at The local reading.
 * @returns Its value, or unknown at the import when it cannot be followed.
 */
function readImport(value: NixValue, call: Node, at: LocalReading): NixValue {
	if (!spend(at.budget, 1)) return unknownAt(call);
	const file = sourcePath(value, at);
	if (file === undefined) return unknownAt(call);
	const expression = at.imported.get(file) ?? parsedSource(file, at);
	if (expression === undefined) return unknownAt(call);
	at.imported.set(file, expression);
	return expression();
}

/**
 * Read local imports until the flake has collected its facts, then release
 * their trees. Each imported application spends the flake's operation budget.
 * @param tree The flake tree.
 * @param grammar The parser that read it.
 * @param files The checkout read boundary, if supplied by a facts pass.
 * @returns The shared budget, and cleanup after all lazy values were read.
 */
function localFiles(
	tree: Tree,
	grammar: Grammar,
	files?: NixFiles,
): {
	readonly budget: Budget;
	readonly close: () => void;
} {
	const sources = new Map<Tree, string>();
	const trees: Tree[] = [];
	const budget: Budget = {
		steps: MAX_STEPS,
		depth: 0,
		/**
		 * The checkout file that owns a node.
		 * @param node The node.
		 * @returns Its path, if local-file reading is available.
		 */
		source: (node) => sources.get(node.tree),
		/**
		 * A local import through the checkout's read boundary.
		 * @param value Its path value.
		 * @param call The call.
		 * @returns Its value, or unknown where no checkout context was supplied.
		 */
		import: (value, call) =>
			reading === undefined ? unknownAt(call) : readImport(value, call, reading),
	};
	const reading: LocalReading | undefined =
		files === undefined
			? undefined
			: {
					files,
					grammar,
					sources,
					trees,
					budget,
					imported: new Map(),
				};
	if (files !== undefined) sources.set(tree, files.file);
	return {
		budget,
		/** Release every imported tree after the flake facts have been collected. */
		close: () => {
			for (const importedTree of trees) importedTree.delete();
		},
	};
}

/**
 * The actual source of an expression read from another file, while the
 * unparsed span continues to belong to its flake output.
 * @param budget The reading's source map.
 * @param node The expression.
 * @param owner The expression whose flake span owns it.
 * @returns Its imported site, or nothing for an expression in the same file.
 */
function importedSource(budget: Budget, node: Node, owner: Node): Unparsed["source"] {
	const file = budget.source?.(node);
	return file === undefined || node.tree === owner.tree
		? undefined
		: {
				path: file,
				start: node.startPosition.row + 1,
				end: node.endPosition.row + 1,
			};
}

export { type NixFiles, importedSource, localFiles };
