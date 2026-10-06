// The values of a static reading of Nix (ADR 0046, TASK-367.21): what a
// flake's expressions are, as far as the syntax tells it without evaluating
// anything. The check never evaluates Nix, because evaluation can fetch from
// the network and run code.
//
// A value is an attribute set, a function the file writes or a library
// function the reading knows (nix-library.ts), a list, a string, some other
// value that is no attribute set, or unknown: an expression the reading cannot
// follow, kept with its node so that its lines can be named. An attribute set
// is open where an expression the reading cannot follow may add names to it,
// and its name `*` stands for every name of a list the reading cannot tell,
// such as the systems of `genAttrs lib.systems.flakeExposed`.
// Every entry of a set and every item of a list is lazy, as in Nix, and is
// read at most once.
//
// One reading of a file has one budget. Each expression it reads, and each
// name or item it binds, copies or walks, spends one step, so that no file
// can make the reading run long or hold much memory: once the budget is
// spent, every value still to read is unknown.

import type { Node } from "web-tree-sitter";

/** What one reading may still spend. */
interface Budget {
	steps: number;
	depth: number;
}

/**
 * Spend steps of a budget, or spend it all when it cannot pay them.
 * @param budget The budget.
 * @param steps The steps.
 * @returns True when it paid them; false when the budget is spent.
 */
function spend(budget: Budget, steps: number): boolean {
	if (budget.steps < steps) {
		budget.steps = 0;
		return false;
	}
	budget.steps -= steps;
	return true;
}

/** A value, read when it is first asked for. */
type Thunk = () => NixValue;

/** One name of an attribute set: its value, and the node that gives it. */
interface Entry {
	readonly value: Thunk;
	/** The binding that names it, or the expression that makes it, such as a call of `genAttrs`. */
	readonly node: Node;
}

/** An attribute set. */
interface AttrsValue {
	readonly kind: "attrs";
	readonly entries: ReadonlyMap<string, Entry>;
	/** An expression that may add names the reading cannot tell. */
	readonly open?: Node;
}

/** A function: what it gives for an argument, at the call that applies it. */
interface FunctionValue {
	readonly kind: "function";
	readonly apply: (argument: Thunk, call: Node) => NixValue;
}

/** A Nix value as far as a static reading can tell it. */
type NixValue =
	| AttrsValue
	| FunctionValue
	| { readonly kind: "list"; readonly items: readonly Thunk[] }
	/** A string; its text where no interpolation makes it. */
	| { readonly kind: "string"; readonly text?: string }
	/** A number, a path, a Boolean, null: no attribute set. */
	| { readonly kind: "other" }
	/** An expression the reading cannot follow. */
	| { readonly kind: "unknown"; readonly node: Node };

const OTHER: NixValue = { kind: "other" };

/** The name that stands for every name of a list the reading cannot tell. */
const ANY = "*";

/**
 * An expression the reading cannot follow.
 * @param node The expression.
 * @returns The unknown value.
 */
function unknownAt(node: Node): NixValue {
	return { kind: "unknown", node };
}

/**
 * A value that is read once, when first asked for. A value that asks for
 * itself while it is read, as `self` can, is unknown there.
 * @param read Reads the value.
 * @param node The expression, for an unknown value.
 * @returns The thunk.
 */
function lazy(read: () => NixValue, node: Node): Thunk {
	let state: NixValue | "reading" | undefined;
	return () => {
		if (state === "reading") return unknownAt(node);
		if (state !== undefined) return state;
		state = "reading";
		const value = read();
		state = value;
		return value;
	};
}

/**
 * A value already read.
 * @param value The value.
 * @returns A thunk that gives it.
 */
function ready(value: NixValue): Thunk {
	return () => value;
}

/**
 * The names a list of strings holds, where the reading can tell every one.
 * @param value The list.
 * @param budget The reading's budget, which pays for each item.
 * @returns The names, or undefined when it is no list, an item is not a
 * known string, or the budget is spent.
 */
function namesOf(value: NixValue, budget: Budget): string[] | undefined {
	if (value.kind !== "list" || !spend(budget, value.items.length)) return undefined;
	const names: string[] = [];
	for (const item of value.items) {
		const read = item();
		if (read.kind !== "string" || read.text === undefined) return undefined;
		names.push(read.text);
	}
	return names;
}

/**
 * An attribute set of known names.
 * @param entries Its names and their entries.
 * @param open An expression that may add names, if any.
 * @returns The set.
 */
function attrs(entries: ReadonlyMap<string, Entry>, open?: Node): AttrsValue {
	return open === undefined ? { kind: "attrs", entries } : { kind: "attrs", entries, open };
}

/**
 * The value one name of a value gives, as `value.name` reads it, or as the
 * name `*` gives every name.
 * @param value The value.
 * @param name The name.
 * @param node The expression, for an unknown value.
 * @returns The value, unknown when the reading cannot tell.
 */
function selected(value: NixValue, name: string, node: Node): NixValue {
	if (value.kind !== "attrs") return unknownAt(node);
	return (value.entries.get(name) ?? value.entries.get(ANY))?.value() ?? unknownAt(node);
}

/**
 * Whether the reading is sure a value has no attribute of a name: it is no
 * set, or a set of which the reading can tell every name.
 * @param value The value.
 * @param name The name, undefined where the reading cannot tell it.
 * @returns True when the name is surely absent.
 */
function surelyAbsent(value: NixValue, name: string | undefined): boolean {
	if (value.kind === "unknown") return false;
	if (value.kind !== "attrs") return true;
	if (value.open !== undefined || value.entries.has(ANY)) return false;
	return name !== undefined && !value.entries.has(name);
}

/**
 * Apply a value to an argument.
 * @param value The function.
 * @param argument The argument.
 * @param call The call.
 * @returns What it gives, unknown when the value is no function the reading knows.
 */
function applied(value: NixValue, argument: Thunk, call: Node): NixValue {
	return value.kind === "function" ? value.apply(argument, call) : unknownAt(call);
}

export {
	ANY,
	type AttrsValue,
	type Budget,
	type Entry,
	type FunctionValue,
	type NixValue,
	type Thunk,
	OTHER,
	applied,
	attrs,
	lazy,
	namesOf,
	ready,
	selected,
	spend,
	surelyAbsent,
	unknownAt,
};
