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
// The code check gives a reference to the outputs whose lines hold its line,
// and takes it to those whose lines hold the output it names. So a reference
// stands only where those lines tell the two outputs apart: no other package
// shares them, only the same package under another name (`default = nixd`)
// or for another system, which one function gives each system. Where another
// package shares them, as `inherit core lib app;` on one line makes three
// packages share it, the dependency is unknown there instead, so that one
// package's inputs never read as another's.
//
// What the reading cannot follow is unknown, never absent: an input that is a
// value the reading cannot follow (a package of nixpkgs, `prev.x`, `import`,
// `pkgs.hello // { ... }`), the expressions nix-derivations.ts cannot follow,
// and an output that is no derivation the reading recognises, such as a shell
// `mkShell` makes or an app. Each is an unparsed part with no names at the
// lines of the expression, or of the output where the expression is outside
// its span: it hides no name, so a symbol is never unknown because of it, and
// it tells the code check that the build dependencies of the code there are
// unknown. Each input the reading follows, and each output it compares lines
// with, spends a step of its budget; once the budget is spent, the inputs not
// yet read are unknown.

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

/** Where the flake schema puts the system in the attribute path of an output given once per system. */
const SYSTEM_AT: ReadonlyMap<string, number> = new Map([
	...[
		"apps",
		"bundlers",
		"checks",
		"defaultApp",
		"defaultBundler",
		"defaultPackage",
		"devShell",
		"devShells",
		"formatter",
		"legacyPackages",
		"packages",
	].map((output) => [output, 1] as const),
	["hydraJobs", 2],
]);

/** An output that holds no other output: a package, a shell, a module. */
interface Leaf {
	readonly path: readonly string[];
	readonly symbol: string;
	readonly value: NixValue;
	/** The binding that names it, or the expression that makes it: its span. */
	readonly node: Node;
}

/** Some lines, 1-based. */
interface Lines {
	readonly start: number;
	readonly end: number;
}

/** An output that holds no other output, and its lines, by which the code check knows it. */
type Output = Leaf & Lines;

/** What reading the inputs of the outputs collects. */
interface Reading {
	/** The attribute path of each output, by its value. */
	readonly outputs: ReadonlyMap<NixValue, readonly string[]>;
	/** The outputs that hold no other output, by their attribute path. */
	readonly bySymbol: ReadonlyMap<string, Output>;
	/** The outputs that hold no other output, by each of their lines; none when the budget cannot pay for it. */
	readonly byLine: ReadonlyMap<number, readonly Output[]> | undefined;
	readonly budget: Budget;
	readonly references: ParsedFacts["references"][number][];
	readonly imports: Import[];
	readonly unfollowed: Map<string, Unparsed>;
	readonly seen: Set<string>;
	/** Whether the lines of an output tell it apart, by output and lines, as far as the reading looked. */
	readonly told: Map<string, boolean>;
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
function linesOf(node: Node): Lines {
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

/**
 * Whether two outputs are one package as a board draws it: one value under
 * two names, or one name in two systems.
 * @param left One output.
 * @param right The other.
 * @returns True when they are.
 */
function samePackage(left: Leaf, right: Leaf): boolean {
	if (left.value === right.value) return true;
	const system = SYSTEM_AT.get(left.path[0] ?? "");
	return (
		system !== undefined &&
		left.path.length === right.path.length &&
		left.path.every((name, index) => index === system || name === right.path[index])
	);
}

/**
 * The outputs by each of their lines, each line of each output a step.
 * @param leaves The outputs.
 * @param budget The reading's budget.
 * @returns The outputs that hold each line; undefined when the budget cannot pay for them.
 */
function byLineOf(
	leaves: readonly Output[],
	budget: Budget,
): ReadonlyMap<number, readonly Output[]> | undefined {
	const steps = leaves.reduce((sum, leaf) => sum + leaf.end - leaf.start + 1, 0);
	if (!spend(budget, steps)) return undefined;
	const index = new Map<number, Output[]>();
	for (const leaf of leaves) {
		for (let line = leaf.start; line <= leaf.end; line += 1) {
			const holders = index.get(line);
			if (holders === undefined) index.set(line, [leaf]);
			else holders.push(leaf);
		}
	}
	return index;
}

/**
 * Whether some lines of an output tell it apart: every output whose lines
 * hold them is the same package. Each output a look compares spends a step.
 * @param reading What the reading collects.
 * @param output The output.
 * @param lines Its lines that the code check knows it by.
 * @returns True when they do; false when another package shares them, or the budget cannot pay.
 */
function toldApart(reading: Reading, output: Output, lines: Lines): boolean {
	const key = `${output.symbol}\0${lines.start}\0${lines.end}`;
	let told = reading.told.get(key);
	if (told === undefined) {
		const holders = reading.byLine?.get(lines.start) ?? [];
		told =
			reading.byLine !== undefined &&
			spend(reading.budget, holders.length) &&
			holders.every((other) => other.end < lines.end || samePackage(output, other));
		reading.told.set(key, told);
	}
	return told;
}

/** Reading what one output is built from: the output, the inputs still to read, and the derivations already followed. */
interface LeafReading {
	readonly reading: Reading;
	readonly leaf: Output;
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
 * Whether the code check can tell, by their lines, that an output named at a
 * line is built from another output.
 * @param at The output's reading.
 * @param symbol The output it is built from.
 * @param line The line that names the input.
 * @returns True when the lines tell both apart.
 */
function toldAt(at: LeafReading, symbol: string, line: number): boolean {
	const target = at.reading.bySymbol.get(symbol);
	return (
		target !== undefined &&
		toldApart(at.reading, at.leaf, { start: line, end: line }) &&
		toldApart(at.reading, target, target)
	);
}

/**
 * Add a reference from the code at a line to another output of the flake.
 * @param reading What the reading collects.
 * @param symbol The output.
 * @param line The line.
 */
function addReference(reading: Reading, symbol: string, line: number): void {
	reading.seen.add(`${symbol}\0${line}`);
	const names = [{ imported: symbol, local: symbol, typeOnly: false }];
	reading.imports.push({ specifier: SELF, line, names, typeOnly: false, reexport: false });
	const through = { import: reading.imports.length - 1, local: symbol };
	const kind = "build-dependency" as const;
	reading.references.push({ symbol, line, via: "code", kind, typeOnly: false, through });
}

/**
 * Note that an output is built from other outputs of the same flake, each a
 * step; where the budget cannot pay for them, or the lines do not tell the
 * outputs apart, its inputs are unknown there.
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
		if (symbol === leaf.symbol || reading.seen.has(`${symbol}\0${line}`)) continue;
		if (toldAt(at, symbol, line)) addReference(reading, symbol, line);
		else unknownInputs(at, [named]);
	}
}

/**
 * Whether a value the reading tells only in part may still be a package: a
 * set that an expression the reading cannot follow adds to, such as
 * `pkgs.hello // { ... }`, or a string that an interpolation makes.
 * @param value The value.
 * @returns True when it may.
 */
function opaque(value: NixValue): boolean {
	return (
		(value.kind === "attrs" && value.open !== undefined) ||
		(value.kind === "string" && value.text === undefined)
	);
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
	else if (opaque(value)) unknownInputs(at, [input.named]);
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
function readLeaf(reading: Reading, leaf: Output): void {
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
	const spans = leaves.map((leaf): Output => ({ ...leaf, ...linesOf(leaf.node) }));
	const reading: Reading = {
		outputs,
		bySymbol: new Map(spans.map((leaf) => [leaf.symbol, leaf])),
		byLine: byLineOf(spans, budget),
		budget,
		references: [],
		imports: [],
		unfollowed: new Map(),
		seen: new Set(),
		told: new Map(),
	};
	for (const leaf of spans) readLeaf(reading, leaf);
	return {
		references: reading.references,
		imports: reading.imports,
		unparsed: [...reading.unfollowed.values()],
	};
}

export { type Leaf, SELF, buildInputs };
