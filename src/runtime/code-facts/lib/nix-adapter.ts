// The Nix adapter for `flake.nix` (ADR 0046, TASK-367.21): each output of the
// flake is a definition addressed by its attribute path, as a binding symbol
// spells it: `packages.x86_64-linux.archboard`, `nixosConfigurations.host`,
// `overlays.default`. The outputs come from a static reading of the file
// (nix-evaluation.ts); nothing is evaluated, because evaluation can fetch from
// the network and run code.
//
// A definition spans the binding that names it, or the call that makes it,
// such as the `forAllSystems (...)` that gives each system. Every output is
// `output` and exposed: a flake's outputs are what other flakes and `nix`
// consume. The reading goes as deep as the flake schema gives each output its
// names: three names for an output given per system and name
// (`packages.<system>.<name>`), two for one given per system or per name
// (`formatter.<system>`, `overlays.<name>`), one for `overlay`, and every
// name it can tell for any other output, such as `lib`. What a derivation, a
// module or a configuration holds is not an output.
//
// Where the reading cannot follow an expression that gives names above that
// depth, the names below its attribute path are unknown: the file holds an
// unparsed part with `under` set to the path, and a symbol below it is
// skipped, never reported missing. So are the names an open set may add, and
// every name of a flake whose outputs the reading cannot follow at all
// (`under` is the empty path), and every name a reading that stops at its
// bounds did not reach: 400 names deep, or 10,000 outputs. The inputs are in
// `flake.lock` (flake-lock.ts). A part of the file that did not parse holds no
// facts, and the names written there, as Nix spells a name (`hx-lsp`), are
// skipped, never reported missing.

import type { Node, Tree } from "web-tree-sitter";
import type { Definition, ParsedFacts, Unparsed } from "@/runtime/code-facts/lib/facts";
import type { Grammar } from "@/runtime/code-facts/lib/grammars";
import { buildInputs, type Leaf } from "@/runtime/code-facts/lib/nix-build-inputs";
import { type NixFiles, importedSource, localFiles } from "@/runtime/code-facts/lib/nix-files";
import { MAX_DEPTH, readFile } from "@/runtime/code-facts/lib/nix-evaluation";
import { updated } from "@/runtime/code-facts/lib/nix-library";
import {
	type AttrsValue,
	type Budget,
	type Entry,
	type NixValue,
	applied,
	attrs,
	lazy,
	ready,
	unknownAt,
} from "@/runtime/code-facts/lib/nix-values";
import { unparsedOf } from "@/runtime/code-facts/lib/unparsed";

/** How many names deep the flake schema gives each output its names. */
const SCHEMA_DEPTH: ReadonlyMap<string, number> = new Map([
	...["apps", "bundlers", "checks", "devShells", "hydraJobs", "packages"].map(
		(output) => [output, 3] as const,
	),
	...[
		"darwinConfigurations",
		"darwinModules",
		"defaultApp",
		"defaultBundler",
		"defaultPackage",
		"devShell",
		"flakeModules",
		"formatter",
		"homeConfigurations",
		"homeManagerModules",
		"homeModules",
		"nixosConfigurations",
		"nixosModules",
		"overlays",
		"templates",
	].map((output) => [output, 2] as const),
	...["defaultTemplate", "nixosModule", "overlay"].map((output) => [output, 1] as const),
]);

/** How many definitions one file gives at most, so that no set the file builds runs away. */
const MAX_DEFINITIONS = 10_000;

/** A whole name as Nix spells one: an identifier may hold `-` and `'`. */
const NIX_WORD = /[\p{L}\p{N}_'-]+/gu;

/** What reading the outputs collects. */
interface Outputs {
	readonly definitions: Map<string, Definition>;
	readonly unknown: Unparsed[];
	/** The outputs that hold no other output, for what each is built from (nix-build-inputs.ts). */
	readonly leaves: Leaf[];
	/** The attribute path of each output that may be a package, by its value. */
	readonly packages: Map<NixValue, string[]>;
	readonly budget: Budget;
	/** The set where the reading stopped at its most definitions, if it did. */
	stopped?: Node;
}

/**
 * The lines of a node, 1-based.
 * @param node The node.
 * @returns Its first and last line.
 */
function linesOf(node: Node): { readonly start: number; readonly end: number } {
	return { start: node.startPosition.row + 1, end: node.endPosition.row + 1 };
}

/**
 * Note that the names below an attribute path are unknown.
 * @param outputs What the reading collects.
 * @param path The attribute path.
 * @param node The expression the reading cannot follow.
 * @param owner The flake expression whose span owns it.
 */
function unknownBelow(
	outputs: Outputs,
	path: readonly string[],
	node: Node,
	owner: Node = node,
): void {
	const source = importedSource(outputs.budget, node, owner);
	outputs.unknown.push({
		...linesOf(source === undefined ? node : owner),
		names: [],
		under: path.join("."),
		...(source === undefined ? {} : { source }),
	});
}

/**
 * Note one output, and the outputs and unknown names below it.
 * @param outputs What the reading collects.
 * @param value Its value.
 * @param path Its attribute path; empty for the outputs as a whole.
 * @param node The binding that names it, or the expression that makes it.
 * @param above The sets on the path to it, so that a set that holds itself ends.
 */
function walk(
	outputs: Outputs,
	value: NixValue,
	path: readonly string[],
	node: Node,
	above: ReadonlySet<NixValue>,
): void {
	define(outputs, path, node, value);
	if (above.has(value)) return;
	if (deepEnough(path)) {
		atSchemaDepth(outputs, value, { path, node }, above);
		return;
	}
	if (value.kind === "unknown") unknownBelow(outputs, path, value.node, node);
	if (value.kind !== "attrs") addLeaf(outputs, { path, node }, value);
	else if (path.length >= MAX_DEPTH) unknownBelow(outputs, path, node);
	else walkSet(outputs, value, { path, node }, above);
}

/**
 * Note an output that holds no other output.
 * @param outputs What the reading collects.
 * @param place Its attribute path, and the node that gives it.
 * @param value Its value.
 */
function addLeaf(outputs: Outputs, place: Place, value: NixValue): void {
	const { path, node } = place;
	if (path.length > 0) outputs.leaves.push({ path, symbol: path.join("."), value, node });
}

/**
 * Note an output as deep as the flake schema names outputs of its kind: a
 * leaf, or an overlay, whose packages are outputs below it.
 * @param outputs What the reading collects.
 * @param value Its value.
 * @param place Its attribute path, and the node that gives it.
 * @param above The sets on the path to it.
 */
function atSchemaDepth(
	outputs: Outputs,
	value: NixValue,
	place: Place,
	above: ReadonlySet<NixValue>,
): void {
	const packages = isOverlay(place.path)
		? overlayPackages(value, place.node, outputs.budget)
		: undefined;
	if (packages === undefined) addLeaf(outputs, place, value);
	else if (packages.kind === "attrs") walkSet(outputs, packages, place, above);
	else if (packages.kind === "unknown")
		unknownBelow(outputs, place.path, packages.node, place.node);
}

/**
 * Whether an output is an overlay: `overlays.<name>`, or the legacy `overlay`.
 * @param path Its attribute path.
 * @returns True for an overlay.
 */
function isOverlay(path: readonly string[]): boolean {
	const [output] = path;
	return (
		(output === "overlays" && path.length === 2) || (output === "overlay" && path.length === 1)
	);
}

/**
 * The packages an overlay `final: prev: { ... }` adds: it is applied to
 * `prev`, a package set whose names the reading cannot tell, and to
 * `final`, `prev` with what the overlay adds, so that `final.lib` is the
 * overlay's own `lib`.
 * @param overlay The overlay.
 * @param node The node that gives it.
 * @param budget The reading's budget.
 * @returns The packages; unknown for an overlay the reading cannot follow;
 * undefined for a value that is no overlay.
 */
function overlayPackages(overlay: NixValue, node: Node, budget: Budget): NixValue | undefined {
	if (overlay.kind === "unknown") return overlay;
	if (overlay.kind !== "function") return undefined;
	const prev = ready(attrs(new Map(), node));
	let added: NixValue = unknownAt(node);
	const final = lazy(() => updated(prev(), added, { deep: false, budget, node }), node);
	added = applied(applied(overlay, final, node), prev, node);
	return added;
}

/**
 * Whether an output is as deep as the flake schema names outputs of its kind,
 * so that what it holds is no output.
 * @param path Its attribute path.
 * @returns True at that depth; never for an output the schema does not name.
 */
function deepEnough(path: readonly string[]): boolean {
	const [output = ""] = path;
	return path.length >= (SCHEMA_DEPTH.get(output) ?? Infinity);
}

/**
 * Note one output as a definition, once, and, where its value is one the
 * reading cannot follow as a set, as a package another output may be built from.
 * @param outputs What the reading collects.
 * @param path Its attribute path; empty for the outputs as a whole, which is none.
 * @param node The binding that names it, or the expression that makes it.
 * @param value Its value.
 */
function define(outputs: Outputs, path: readonly string[], node: Node, value: NixValue): void {
	const symbol = path.join(".");
	if (path.length === 0 || outputs.definitions.has(symbol)) return;
	outputs.definitions.set(symbol, {
		symbol,
		kind: value.kind === "function" ? "function" : "value",
		...linesOf(node),
		visibility: "output",
		exposed: true,
	});
	if (value.kind !== "unknown") return;
	const named = outputs.packages.get(value);
	if (named === undefined) outputs.packages.set(value, [symbol]);
	else named.push(symbol);
}

/** Where a set of outputs is: its attribute path, and the node that gives it. */
interface Place {
	readonly path: readonly string[];
	readonly node: Node;
}

/**
 * Whether a name of a set spans its own node: the binding that writes it,
 * `a.b = ...;` or its name in an `inherit`, wherever that is, or an
 * expression that makes it inside the node that gives the set. A name an
 * expression makes elsewhere, such as each system of a `forAllSystems` a
 * `let` writes, spans the node that gives the set.
 * @param name The node that gives the name.
 * @param set The node that gives the set.
 * @returns True when the name spans its own node.
 */
function ownSpan(name: Node, set: Node): boolean {
	const written = name.type === "binding" || name.parent?.type === "inherited_attrs";
	return (
		name.tree === set.tree &&
		(written || (set.startIndex <= name.startIndex && name.endIndex <= set.endIndex))
	);
}

/**
 * Note the outputs a set holds, and that its names are unknown where it is
 * open. A name an expression makes outside the node that gives the set, such
 * as each system of a `forAllSystems` a `let` writes, spans that node, so
 * that two outputs made by one helper do not share its lines.
 * @param outputs What the reading collects.
 * @param set The set.
 * @param place Its attribute path, and the node that gives it.
 * @param above The sets on the path to it.
 */
function walkSet(
	outputs: Outputs,
	set: AttrsValue,
	place: Place,
	above: ReadonlySet<NixValue>,
): void {
	const within = new Set([...above, set]);
	for (const [name, entry] of set.entries) {
		if (outputs.definitions.size >= MAX_DEFINITIONS) {
			outputs.stopped ??= place.node;
			return;
		}
		const node = ownSpan(entry.node, place.node) ? entry.node : place.node;
		walk(outputs, entry.value(), [...place.path, name], node, within);
	}
	if (set.open !== undefined) unknownBelow(outputs, place.path, set.open, place.node);
}

/**
 * The value of the flake's outputs: what `outputs` gives for inputs the
 * reading cannot tell, but for `self`, which is those outputs. Nix gives
 * `self` names besides the outputs, such as `rev`, so the reading is never
 * sure `self` lacks a name.
 * @param flake The value of the file.
 * @param root The file's root node.
 * @returns The outputs, and the node that gives them; undefined for a flake with no outputs.
 */
function outputsOf(
	flake: NixValue,
	root: Node,
): { readonly value: NixValue; readonly node: Node } | undefined {
	if (flake.kind !== "attrs") return { value: unknownAt(root), node: root };
	const entry = flake.entries.get("outputs");
	if (entry === undefined) return undefined;
	let value: NixValue = unknownAt(entry.node);
	/**
	 * The outputs, as `self` gives them: open to the names Nix adds.
	 * @returns The value.
	 */
	const outputs = (): NixValue =>
		value.kind === "attrs" ? attrs(value.entries, entry.node) : value;
	const self: Entry = { node: entry.node, value: outputs };
	const inputs = ready(attrs(new Map([["self", self]]), entry.node));
	value = applied(entry.value(), inputs, entry.node);
	return { value, node: entry.node };
}

/**
 * The code facts of one `flake.nix`.
 * @param tree The parsed file.
 * @param grammar The Nix grammar and its query.
 * @param files The checkout read boundary for local imports, if available.
 * @returns Its outputs as definitions, and the parts whose names are unknown.
 */
function flakeFacts(tree: Tree, grammar: Grammar, files?: NixFiles): ParsedFacts {
	const local = localFiles(tree, grammar, files);
	try {
		return readFlakeFacts(tree, grammar, local.budget);
	} finally {
		local.close();
	}
}

/**
 * Collect the flake facts while every imported tree is still live.
 * @param tree The flake tree.
 * @param grammar Its grammar.
 * @param budget The shared local-file reading budget.
 * @returns The facts.
 */
function readFlakeFacts(tree: Tree, grammar: Grammar, budget: Budget): ParsedFacts {
	const read = readFile(tree.rootNode, budget);
	const outputs: Outputs = {
		definitions: new Map(),
		unknown: [],
		leaves: [],
		packages: new Map(),
		budget: read.budget,
	};
	const found = outputsOf(read.value, tree.rootNode);
	if (found !== undefined) walk(outputs, found.value, [], found.node, new Set());
	if (outputs.stopped !== undefined) unknownBelow(outputs, [], outputs.stopped);
	const built = buildInputs(outputs.leaves, outputs.packages, read.budget);
	const errors = grammar.query.captures(tree.rootNode).map((capture) => capture.node);
	return {
		definitions: [...outputs.definitions.values()],
		references: built.references,
		imports: built.imports,
		unparsed: [...unparsedOf(errors, NIX_WORD), ...outputs.unknown, ...built.unparsed],
	};
}

export { flakeFacts };
