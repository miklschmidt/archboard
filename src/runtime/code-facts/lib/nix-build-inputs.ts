// What each output of a flake is built from (ADR 0046, TASK-367.22): the
// build dependencies between the packages of one flake, which no other file
// makes explicit.
//
// An output is built from another output of the same flake, or of one of its
// overlays, where an input of its derivation (nix-derivations.ts) is that
// output's value: `self.packages.${system}.lib`, an overlay's `final.lib`, or
// a name a `let` binds to the same derivation. The reading compares values,
// never spellings, so each of these reaches the output that gives the value.
// Each such input is a reference of kind `build-dependency` from the
// depending output to the output it names, at the line that names the input,
// through an import of its own whose specifier is `self`: the flake resolver
// (flake-lock.ts) leads it to the same `flake.nix`. An input written outside
// the span of the output that depends on it, as a package a `let` builds and
// an output then names, is at the output's first line, so that it is the
// output's. A derivation that is no output, such as a helper a `let` builds,
// passes on what it is built from.
//
// What the reading cannot follow is unknown, never absent: an input that is a
// value the reading cannot follow (a package of nixpkgs, `prev.x`, `import`),
// the expressions nix-derivations.ts cannot follow, and an output that is no
// derivation the reading recognises, such as a shell `mkShell` makes or an
// app. Each is an unparsed part with no names at the lines of the expression,
// or of the output where the expression is outside its span: it hides no
// name, so a symbol is never unknown because of it, and it tells the code
// check that the build dependencies of the code there are unknown. Each input
// the reading follows spends a step of its budget; once the budget is spent,
// the inputs not yet read are unknown.

import type { Node } from "web-tree-sitter";
import type { Import, ParsedFacts, Unparsed } from "@/runtime/code-facts/lib/facts";
import {
	type Budget,
	type Derivation,
	type Entry,
	type NixValue,
	spend,
} from "@/runtime/code-facts/lib/nix-values";

/** The specifier of the import through which an output reaches another output of its own flake. */
const SELF = "self";

/** An output that holds no other output: a package, a shell, a module. */
interface Leaf {
	readonly symbol: string;
	readonly value: NixValue;
	/** The binding that names it, or the expression that makes it: its span. */
	readonly node: Node;
}

/** What reading the inputs of the outputs collects. */
interface Reading {
	/** The attribute path of each output, by its value. */
	readonly outputs: ReadonlyMap<NixValue, readonly string[]>;
	readonly budget: Budget;
	readonly references: ParsedFacts["references"][number][];
	readonly imports: Import[];
	readonly unfollowed: Map<string, Unparsed>;
	readonly seen: Set<string>;
}

/** One input still to read, and the expression in the output's own derivation that names it. */
interface Pending {
	readonly entry: Entry;
	readonly named: Node;
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
 * The first of some expressions that lies inside an output's span, else the output.
 * @param leaf The output.
 * @param nodes The expressions, in order.
 * @returns The node whose lines stand for them.
 */
function within(leaf: Leaf, nodes: readonly Node[]): Node {
	const span = leaf.node;
	return (
		nodes.find((node) => span.startIndex <= node.startIndex && node.endIndex <= span.endIndex) ??
		span
	);
}

/** Reading what one output is built from: the output, the inputs still to read, and the derivations already followed. */
interface LeafReading {
	readonly reading: Reading;
	readonly leaf: Leaf;
	readonly work: Pending[];
	readonly followed: Set<Derivation>;
}

/**
 * Note that an output's build inputs are unknown at an expression.
 * @param at The output's reading.
 * @param nodes The expression, then what names it in the output's own derivation.
 */
function unknownInputs(at: LeafReading, nodes: readonly Node[]): void {
	const lines = linesOf(within(at.leaf, nodes));
	at.reading.unfollowed.set(`${lines.start}:${lines.end}`, { ...lines, names: [] });
}

/**
 * Note that an output is built from other outputs of the same flake, each a
 * step; where the budget cannot pay for them, its inputs are unknown there.
 * @param at The output's reading.
 * @param symbols The outputs it is built from: every output that gives the input's value.
 * @param named The expression that names the input.
 */
function dependsOn(at: LeafReading, symbols: readonly string[], named: Node): void {
	const { reading, leaf } = at;
	if (!spend(reading.budget, symbols.length)) {
		unknownInputs(at, [named]);
		return;
	}
	const line = linesOf(within(leaf, [named])).start;
	for (const symbol of symbols) {
		const key = `${symbol}\0${line}`;
		if (symbol === leaf.symbol || reading.seen.has(key)) continue;
		reading.seen.add(key);
		const names = [{ imported: symbol, local: symbol, typeOnly: false }];
		reading.imports.push({ specifier: SELF, line, names, typeOnly: false, reexport: false });
		const through = { import: reading.imports.length - 1, local: symbol };
		const kind = "build-dependency" as const;
		reading.references.push({ symbol, line, via: "code", kind, typeOnly: false, through });
	}
}

/**
 * Read one input of an output: another output, a list of inputs, a
 * derivation that is no output and passes on its own inputs, or a value the
 * reading cannot follow.
 * @param at The output's reading.
 * @param input The input.
 */
function readInput(at: LeafReading, input: Pending): void {
	const value = input.entry.value();
	const symbols = at.reading.outputs.get(value);
	if (symbols !== undefined) dependsOn(at, symbols, input.named);
	else if (value.kind === "list") at.work.push(...pendingOf(value.items, input.named));
	else if (value.kind === "unknown") passedOn(at, value.derivation, input.named);
}

/**
 * Read a value the reading cannot follow that an output is built from: a
 * derivation that is no output passes on what it is built from, once; any
 * other value leaves the inputs unknown.
 * @param at The output's reading.
 * @param derivation What the value is built from, if it is a derivation.
 * @param named The expression that names it in the output's own derivation.
 */
function passedOn(at: LeafReading, derivation: Derivation | undefined, named: Node): void {
	if (derivation === undefined) unknownInputs(at, [named]);
	else follow(at, derivation, named);
}

/**
 * Add what a derivation is built from to the inputs still to read, once.
 * @param at The output's reading.
 * @param derivation The derivation.
 * @param named What names it in the output's own derivation, if it is not the output's own.
 */
function follow(at: LeafReading, derivation: Derivation, named?: Node): void {
	if (at.followed.has(derivation)) return;
	at.followed.add(derivation);
	const { unfollowed } = derivation;
	if (unfollowed !== undefined) unknownInputs(at, named === undefined ? [unfollowed] : [named]);
	at.work.push(...pendingOf(derivation.inputs, named));
}

/**
 * Inputs still to read.
 * @param entries The inputs.
 * @param named What names them in the output's own derivation, if not each itself.
 * @returns The pending inputs.
 */
function pendingOf(entries: readonly Entry[], named: Node | undefined): Pending[] {
	return entries.map((entry) => ({ entry, named: named ?? entry.node }));
}

/**
 * Read what one output is built from, each input a step.
 * @param reading What the reading collects.
 * @param leaf The output.
 */
function readLeaf(reading: Reading, leaf: Leaf): void {
	const at: LeafReading = { reading, leaf, work: [], followed: new Set() };
	const { value } = leaf;
	if (value.kind !== "unknown" || value.derivation === undefined) {
		unknownInputs(at, value.kind === "unknown" ? [value.node] : []);
		return;
	}
	follow(at, value.derivation);
	for (let input = at.work.pop(); input !== undefined; input = at.work.pop()) {
		if (!spend(reading.budget, 1)) {
			unknownInputs(at, [input.named]);
			return;
		}
		readInput(at, input);
	}
}

/**
 * The build dependencies between the outputs of a flake, and the outputs
 * whose build inputs the reading cannot follow.
 * @param leaves The outputs that hold no other output.
 * @param outputs The attribute path of each output, by its value.
 * @param budget The reading's budget.
 * @returns The references and their imports, and the parts whose build inputs are unknown.
 */
function buildInputs(
	leaves: readonly Leaf[],
	outputs: ReadonlyMap<NixValue, readonly string[]>,
	budget: Budget,
): Pick<ParsedFacts, "references" | "imports" | "unparsed"> {
	const reading: Reading = {
		outputs,
		budget,
		references: [],
		imports: [],
		unfollowed: new Map(),
		seen: new Set(),
	};
	for (const leaf of leaves) readLeaf(reading, leaf);
	return {
		references: reading.references,
		imports: reading.imports,
		unparsed: [...reading.unfollowed.values()],
	};
}

export { type Leaf, SELF, buildInputs };
