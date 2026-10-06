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
import { MAX_DEPTH, readFile } from "@/runtime/code-facts/lib/nix-evaluation";
import {
	type AttrsValue,
	type NixValue,
	applied,
	attrs,
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
 */
function unknownBelow(outputs: Outputs, path: readonly string[], node: Node): void {
	outputs.unknown.push({ ...linesOf(node), names: [], under: path.join(".") });
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
	define(outputs, path, node);
	if (deepEnough(path) || above.has(value)) return;
	if (value.kind === "unknown") unknownBelow(outputs, path, value.node);
	if (value.kind !== "attrs") return;
	if (path.length >= MAX_DEPTH) unknownBelow(outputs, path, node);
	else walkSet(outputs, value, { path, node }, above);
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
 * Note one output as a definition, once.
 * @param outputs What the reading collects.
 * @param path Its attribute path; empty for the outputs as a whole, which is none.
 * @param node The binding that names it, or the expression that makes it.
 */
function define(outputs: Outputs, path: readonly string[], node: Node): void {
	const symbol = path.join(".");
	if (path.length === 0 || outputs.definitions.has(symbol)) return;
	outputs.definitions.set(symbol, {
		symbol,
		...linesOf(node),
		visibility: "output",
		exposed: true,
	});
}

/** Where a set of outputs is: its attribute path, and the node that gives it. */
interface Place {
	readonly path: readonly string[];
	readonly node: Node;
}

/**
 * Whether one node lies inside another.
 * @param inner The inner node.
 * @param outer The outer node.
 * @returns True when the outer one spans it.
 */
function inside(inner: Node, outer: Node): boolean {
	return outer.startIndex <= inner.startIndex && inner.endIndex <= outer.endIndex;
}

/**
 * Note the outputs a set holds, and that its names are unknown where it is
 * open. A name made outside the node that gives the set, such as each system
 * of a `forAllSystems` a `let` writes, spans that node, so that two outputs
 * made by one helper do not share its lines.
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
		const node = inside(entry.node, place.node) ? entry.node : place.node;
		walk(outputs, entry.value(), [...place.path, name], node, within);
	}
	if (set.open !== undefined) unknownBelow(outputs, place.path, set.open);
}

/**
 * The value of the flake's outputs: what `outputs` gives for inputs the
 * reading cannot tell.
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
	const inputs = ready(attrs(new Map(), entry.node));
	return { value: applied(entry.value(), inputs, entry.node), node: entry.node };
}

/**
 * The code facts of one `flake.nix`.
 * @param tree The parsed file.
 * @param grammar The Nix grammar and its query.
 * @returns Its outputs as definitions, and the parts whose names are unknown.
 */
function flakeFacts(tree: Tree, grammar: Grammar): ParsedFacts {
	const outputs: Outputs = { definitions: new Map(), unknown: [] };
	const found = outputsOf(readFile(tree.rootNode), tree.rootNode);
	if (found !== undefined) walk(outputs, found.value, [], found.node, new Set());
	if (outputs.stopped !== undefined) unknownBelow(outputs, [], outputs.stopped);
	const errors = grammar.query.captures(tree.rootNode).map((capture) => capture.node);
	return {
		definitions: [...outputs.definitions.values()],
		references: [],
		imports: [],
		unparsed: [...unparsedOf(errors, NIX_WORD), ...outputs.unknown],
	};
}

export { flakeFacts };
