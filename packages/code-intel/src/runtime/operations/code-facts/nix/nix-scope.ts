// What a static reading of Nix builds while it reads (ADR 0046,
// TASK-367.21): the names in scope, and the attribute sets being built from
// their bindings. Reading the expressions themselves is nix-evaluation.ts.
//
// A scope holds each lexical name, and the sets `with` brings in, which every
// lexical name shadows. A set being built holds each name its bindings give,
// with the value of the name, the names bound below it, or both, as
// `a = { b = 1; }; a.c = 2;` gives both. A binding whose attribute path holds
// a name the reading cannot tell makes the set that holds that name open.

import type { Node } from "web-tree-sitter";
import { updated } from "#runtime/operations/code-facts/nix/nix-library.ts";
import {
	type AttrsValue,
	type Budget,
	type Entry,
	type NixValue,
	type Thunk,
	OTHER,
	attrs,
	lazy,
	ready,
} from "#runtime/operations/code-facts/nix/nix-values.ts";

/** The names in scope: each lexical name, and the sets `with` brings in, which every lexical name shadows. */
interface Scope {
	readonly names: ReadonlyMap<string, Thunk>;
	readonly parent?: Scope;
	readonly with?: Thunk;
}

/** A set being built from bindings: its names, and an expression that adds names it cannot tell. */
interface Building {
	readonly entries: Map<string, Pending>;
	open?: Node;
}

/** One name of a set being built: its value, the names bound below it, or both. */
interface Pending {
	readonly node: Node;
	value?: Thunk;
	nested?: Building;
}

/**
 * Place one binding's value at its attribute path. A name the reading cannot
 * tell makes the set that holds it open.
 * @param building The set.
 * @param names The attribute path.
 * @param value The value.
 * @param node The binding.
 */
function place(
	building: Building,
	names: readonly (string | undefined)[],
	value: Thunk,
	node: Node,
): void {
	let at = building;
	for (const [index, name] of names.entries()) {
		if (name === undefined) {
			at.open ??= node;
			return;
		}
		const pending = pendingAt(at, name, node);
		if (index === names.length - 1) pending.value = value;
		else at = pending.nested ??= { entries: new Map() };
	}
}

/**
 * One name of a set being built, made where there is none yet.
 * @param building The set.
 * @param name The name.
 * @param node The binding that names it.
 * @returns The name's entry.
 */
function pendingAt(building: Building, name: string, node: Node): Pending {
	const pending = building.entries.get(name) ?? { node };
	building.entries.set(name, pending);
	return pending;
}

/**
 * The value a lexical name or a set of `with` gives in a scope.
 * @param scope The scope.
 * @param name The name.
 * @returns The value, or undefined when no scope binds it.
 */
function lookup(scope: Scope, name: string): NixValue | undefined {
	return (lexical(scope, name) ?? brought(scope, name))?.();
}

/**
 * The value a lexical name has in a scope.
 * @param scope The scope.
 * @param name The name.
 * @returns The value, or undefined when no scope binds it.
 */
function lexical(scope: Scope, name: string): Thunk | undefined {
	for (let at: Scope | undefined = scope; at !== undefined; at = at.parent) {
		const found = at.names.get(name);
		if (found !== undefined) return found;
	}
	return undefined;
}

/**
 * The value a set of `with` gives a name in a scope, the innermost first.
 * @param scope The scope.
 * @param name The name.
 * @returns The value, or undefined when no set of `with` the reading can tell has it.
 */
function brought(scope: Scope, name: string): Thunk | undefined {
	for (let at: Scope | undefined = scope; at !== undefined; at = at.parent) {
		const set = at.with?.();
		const found = set?.kind === "attrs" ? set.entries.get(name) : undefined;
		if (found !== undefined) return found.value;
	}
	return undefined;
}

/**
 * The set a set being built gives.
 * @param building The set.
 * @param budget The reading's budget.
 * @returns The set.
 */
function finished(building: Building, budget: Budget): AttrsValue {
	const entries = new Map<string, Entry>();
	for (const [name, pending] of building.entries) {
		entries.set(name, { node: pending.node, value: valueOf(pending, budget) });
	}
	return attrs(entries, building.open);
}

/**
 * The value of one name of a set being built: its value, the set bound
 * below it, or both merged, as `a = { b = 1; }; a.c = 2;` merges them. The
 * set below is made when it is first asked for, one name deep at a time.
 * @param pending The name.
 * @param budget The reading's budget.
 * @returns Its value.
 */
function valueOf(pending: Pending, budget: Budget): Thunk {
	const { nested, value } = pending;
	if (nested === undefined) return value ?? ready(OTHER);
	if (value === undefined) return lazy(() => finished(nested, budget), pending.node);
	return lazy(
		() => updated(value(), finished(nested, budget), { deep: false, budget, node: pending.node }),
		pending.node,
	);
}

export { type Building, type Scope, finished, lookup, place };
