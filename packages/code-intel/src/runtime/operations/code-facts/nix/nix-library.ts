// The library functions a static reading of a flake knows (ADR 0046,
// TASK-367.21): the ones flakes call to give each output once per system, and
// to merge attribute sets. Each gives what the real function gives, as far as
// the names go; no other library function is known, and calling one gives an
// unknown value.
//
// - `genAttrs systems f` (nixpkgs `lib`), the usual `forAllSystems`.
// - flake-utils: `eachSystem systems f` and `eachDefaultSystem f`, which turn
//   `{ packages.default = ...; }` for each system into
//   `packages.<system>.default`; `eachSystemMap` and `eachDefaultSystemMap`,
//   which are `genAttrs`. flake-utils' default systems are its `systems`
//   input, which a flake can change, so they are a list the reading cannot
//   tell.
// - `recursiveUpdate a b`, and `a // b` (evaluation in nix-evaluation.ts),
//   `mapAttrs f set`, `foldl' f init list`, and `optionalAttrs condition set`,
//   whose names the reading counts as given, because it cannot tell the
//   condition.
// - flake-parts `mkFlake args module`: the module's `flake`, and its
//   `perSystem` outputs for each of its `systems`, turned the same way. A
//   module that imports other modules can add outputs the reading cannot tell.
//
// A list of systems the reading cannot tell, such as
// `nixpkgs.lib.systems.flakeExposed` or `import systems`, gives one name `*`
// that stands for every system (ANY in nix-values.ts): what the function gives
// for a system it cannot tell, such as `packages.*.default`.
//
// Each name or item a function copies or walks spends a step of the reading's
// budget (nix-values.ts). The functions that give a derivation are known too
// (nix-derivations.ts, TASK-367.22).

import type { Node } from "web-tree-sitter";
import { DERIVATIONS, callPackage } from "#runtime/operations/code-facts/nix/nix-derivations.ts";
import {
	type AttrsValue,
	type Budget,
	type Entry,
	type NixValue,
	type Thunk,
	ANY,
	applied,
	attrs,
	curried,
	lazy,
	namesOf,
	ready,
	spend,
	unary,
	unknownAt,
} from "#runtime/operations/code-facts/nix/nix-values.ts";

/** The outputs flake-parts gives once per system from `perSystem`. */
const PER_SYSTEM_OUTPUTS = new Set([
	"apps",
	"checks",
	"devShells",
	"formatter",
	"legacyPackages",
	"packages",
]);

/** The call that gives a value, and the reading's budget, which the function spends. */
interface At {
	readonly call: Node;
	readonly budget: Budget;
}

/**
 * A string value.
 * @param value Its text.
 * @returns The value.
 */
function text(value: string): NixValue {
	return { kind: "string", text: value };
}

/**
 * The names a list of systems gives, and what each system is as an argument:
 * its name, or, for a list the reading cannot tell, the one name `*` and an
 * unknown system.
 * @param list The list.
 * @param at The call, for an unknown system, and the reading's budget.
 * @returns Each name, and the argument it stands for.
 */
function systemsIn(list: NixValue, at: At): [string, NixValue][] {
	const names = namesOf(list, at.budget);
	if (names === undefined) return [[ANY, unknownAt(at.call)]];
	return names.map((name) => [name, text(name)]);
}

/**
 * `genAttrs names f`: one name for each item, each with what `f` gives for it.
 * @param list The names.
 * @param f The function.
 * @param at The call, and the reading's budget.
 * @returns The set.
 */
function genAttrs(list: NixValue, f: Thunk, at: At): NixValue {
	const entries = systemsIn(list, at).map(([name, argument]): [string, Entry] => [
		name,
		{ node: at.call, value: lazy(() => applied(f(), ready(argument), at.call), at.call) },
	]);
	return attrs(new Map(entries));
}

/**
 * Outputs given once per system, turned so that the system comes second:
 * `{ packages.default }` for each system becomes `packages.<system>.default`.
 * @param list The systems.
 * @param perSystem What one system gives.
 * @param at The call, and the reading's budget.
 * @param keep Which outputs to turn, when not every one.
 * @returns The outputs.
 */
function transposed(
	list: NixValue,
	perSystem: (system: NixValue) => NixValue,
	at: At,
	keep?: ReadonlySet<string>,
): NixValue {
	const each = new Map(
		systemsIn(list, at).map(([name, system]) => [name, lazy(() => perSystem(system), at.call)]),
	);
	const [first] = each.values();
	const probe = first?.() ?? attrs(new Map());
	if (probe.kind === "unknown") return attrs(new Map(), probe.node);
	if (probe.kind !== "attrs") return attrs(new Map());
	if (!spend(at.budget, probe.entries.size)) return unknownAt(at.call);
	const entries = [...probe.entries]
		.filter(([output]) => keep?.has(output) !== false)
		.map(([output, entry]): [string, Entry] => [
			output,
			{
				node: entry.node,
				value: lazy(
					() => systemsOf(each, output, { call: entry.node, budget: at.budget }),
					entry.node,
				),
			},
		]);
	return attrs(new Map(entries), probe.open);
}

/**
 * One output's value for each system. A system whose outputs the reading
 * cannot tell may give it too, so the set is then open.
 * @param each What each system gives.
 * @param output The output.
 * @param at The node that gives the output, and the reading's budget.
 * @returns The set of systems; unknown when the budget cannot pay for it.
 */
function systemsOf(each: ReadonlyMap<string, Thunk>, output: string, at: At): NixValue {
	if (!spend(at.budget, each.size)) return unknownAt(at.call);
	const entries: [string, Entry][] = [];
	let open: Node | undefined;
	for (const [system, value] of each) {
		const read = value();
		const entry = read.kind === "attrs" ? read.entries.get(output) : undefined;
		if (entry === undefined) open ??= mayAdd(read);
		else entries.push([system, entry]);
	}
	return attrs(new Map(entries), open);
}

/**
 * The expression that may add names to a value the reading cannot tell every name of.
 * @param value The value.
 * @returns The expression: the whole value when it is unknown, else what opens a set.
 */
function mayAdd(value: NixValue): Node | undefined {
	if (value.kind === "unknown") return value.node;
	return value.kind === "attrs" ? value.open : undefined;
}

/** How two values merge, and what pays for it. */
interface Merge {
	/** Whether sets under one name merge too, as `recursiveUpdate` merges them. */
	readonly deep: boolean;
	readonly budget: Budget;
	/** The expression that merges them, for a merge the budget cannot pay. */
	readonly node: Node;
}

/**
 * Merge two values as `left // right` does, or as `recursiveUpdate` does
 * when `deep`: right wins, and with `deep` two sets under one name merge too.
 * An operand the reading cannot follow may hold any name, so the merge keeps
 * the other's names and is open.
 * @param left The left value.
 * @param right The right value.
 * @param merge How they merge.
 * @returns The merged value.
 */
function updated(left: NixValue, right: NixValue, merge: Merge): NixValue {
	if (left.kind === "attrs" && right.kind === "attrs") return mergedSets(left, right, merge);
	return openedBy(left, right) ?? openedBy(right, left) ?? right;
}

/**
 * A set merged with a value the reading cannot follow: its names, open.
 * @param set The set.
 * @param other The other value.
 * @returns The open set, or undefined when the two are not a set and an unknown value.
 */
function openedBy(set: NixValue, other: NixValue): NixValue | undefined {
	return set.kind === "attrs" && other.kind === "unknown"
		? attrs(set.entries, other.node)
		: undefined;
}

/**
 * Two sets merged: right wins, and with `deep` two sets under one name merge
 * too. Each name of either spends a step.
 * @param left The left set.
 * @param right The right set.
 * @param merge How they merge.
 * @returns The merged set; unknown when the budget cannot pay for it.
 */
function mergedSets(left: AttrsValue, right: AttrsValue, merge: Merge): NixValue {
	if (!spend(merge.budget, left.entries.size + right.entries.size)) return unknownAt(merge.node);
	const entries = new Map(left.entries);
	for (const [name, entry] of right.entries) {
		const under = left.entries.get(name);
		entries.set(name, merge.deep && under !== undefined ? mergedEntry(under, entry, merge) : entry);
	}
	return attrs(entries, left.open ?? right.open);
}

/**
 * Two entries of one name, merged as `recursiveUpdate` merges them.
 * @param left The left entry.
 * @param right The right entry.
 * @param merge How they merge.
 * @returns The merged entry, at the left one's node.
 */
function mergedEntry(left: Entry, right: Entry, merge: Merge): Entry {
	return {
		node: left.node,
		value: lazy(
			() => updated(left.value(), right.value(), { ...merge, node: right.node }),
			right.node,
		),
	};
}

/**
 * flake-parts `mkFlake args module`: the module's `flake`, and the outputs its
 * `perSystem` gives for each of its `systems`.
 * @param module The module: a set, or a function of the module arguments.
 * @param at The call, and the reading's budget.
 * @returns The outputs.
 */
function mkFlake(module: Thunk, at: At): NixValue {
	const read = module();
	const value =
		read.kind === "function" ? read.apply(ready(attrs(new Map(), at.call)), at.call) : read;
	if (value.kind !== "attrs") return value;
	const flake = value.entries.get("flake")?.value() ?? attrs(new Map());
	const merge = { deep: true, budget: at.budget, node: at.call };
	return importing(
		updated(perSystemOutputs(value, at), flake, merge),
		value.entries.get("imports"),
		at.budget,
	);
}

/**
 * The outputs a flake-parts module's `perSystem` gives for each of its `systems`.
 * @param module The module.
 * @param at The call of `mkFlake`, and the reading's budget.
 * @returns The outputs; none without `perSystem`.
 */
function perSystemOutputs(module: AttrsValue, at: At): NixValue {
	const perSystem = module.entries.get("perSystem")?.value();
	if (perSystem === undefined) return attrs(new Map());
	const systems = module.entries.get("systems")?.value() ?? unknownAt(at.call);
	return transposed(
		systems,
		(system) => perSystemOf(perSystem, system, at.call),
		at,
		PER_SYSTEM_OUTPUTS,
	);
}

/**
 * The outputs of a flake-parts module that imports other modules, which can
 * add outputs the reading cannot tell: open at the imports.
 * @param outputs The outputs the module gives itself.
 * @param imports Its `imports`, if any.
 * @param budget The reading's budget.
 * @returns The outputs, open when it imports a module.
 */
function importing(outputs: NixValue, imports: Entry | undefined, budget: Budget): NixValue {
	if (imports === undefined || outputs.kind !== "attrs") return outputs;
	return namesOf(imports.value(), budget)?.length === 0
		? outputs
		: attrs(outputs.entries, imports.node);
}

/**
 * What flake-parts `perSystem` gives for one system: it is called with the
 * module arguments, of which the reading knows only `system`.
 * @param perSystem The function, or a set.
 * @param system The system.
 * @param call The call of `mkFlake`.
 * @returns What it gives.
 */
function perSystemOf(perSystem: NixValue, system: NixValue, call: Node): NixValue {
	if (perSystem.kind !== "function") return perSystem;
	const argument = attrs(new Map([["system", { node: call, value: ready(system) }]]), call);
	return perSystem.apply(ready(argument), call);
}

/**
 * flake-utils `eachSystem systems f`: what `f` gives each system, turned.
 * @param list The systems.
 * @param f The function of one system.
 * @param at The call, and the reading's budget.
 * @returns The outputs.
 */
function eachSystem(list: NixValue, f: Thunk, at: At): NixValue {
	return transposed(list, (system) => applied(f(), ready(system), at.call), at);
}

/**
 * `mapAttrs f set`: the set's names, each with what `f` gives for the name
 * and its value.
 * @param f The function.
 * @param set The set.
 * @param at The call, and the reading's budget.
 * @returns The set; unknown when the reading cannot tell the set.
 */
function mapAttrs(f: Thunk, set: Thunk, at: At): NixValue {
	const read = set();
	if (read.kind !== "attrs") return read.kind === "unknown" ? read : unknownAt(at.call);
	if (!spend(at.budget, read.entries.size)) return unknownAt(at.call);
	const entries = [...read.entries].map(([name, entry]): [string, Entry] => {
		const named = ready(name === ANY ? unknownAt(at.call) : text(name));
		const value = lazy(() => applied(applied(f(), named, at.call), entry.value, at.call), at.call);
		return [name, { node: entry.node, value }];
	});
	return attrs(new Map(entries), read.open);
}

/**
 * `foldl' f init list`: `f` applied to what it gave so far and each item.
 * @param f The function.
 * @param init What it starts from.
 * @param list The list.
 * @param at The call, and the reading's budget.
 * @returns What the last application gives; unknown when the reading cannot tell the list.
 */
function foldLeft(f: Thunk, init: Thunk, list: Thunk, at: At): NixValue {
	const items = list();
	if (items.kind !== "list" || !spend(at.budget, items.items.length)) return unknownAt(at.call);
	return items.items.reduce(
		(sofar, item) => applied(applied(f(), ready(sofar), at.call), item.value, at.call),
		init(),
	);
}

/** The library functions, by the name a flake calls them by, each spending the reading's budget. */
const LIBRARY: ReadonlyMap<string, (budget: Budget) => NixValue> = new Map<
	string,
	(budget: Budget) => NixValue
>([
	["genAttrs", (budget) => curried((list, f, call) => genAttrs(list(), f, { call, budget }))],
	["eachSystemMap", (budget) => curried((list, f, call) => genAttrs(list(), f, { call, budget }))],
	[
		"eachDefaultSystemMap",
		(budget) => unary((f, call) => genAttrs(unknownAt(call), f, { call, budget })),
	],
	["eachSystem", (budget) => curried((list, f, call) => eachSystem(list(), f, { call, budget }))],
	[
		"eachDefaultSystem",
		(budget) => unary((f, call) => eachSystem(unknownAt(call), f, { call, budget })),
	],
	[
		"recursiveUpdate",
		(budget) =>
			curried((left, right, call) => updated(left(), right(), { deep: true, budget, node: call })),
	],
	["mapAttrs", (budget) => curried((f, set, call) => mapAttrs(f, set, { call, budget }))],
	// The reading cannot tell the condition, so it counts the names as given.
	["optionalAttrs", () => curried((_condition, set) => set())],
	[
		"foldl'",
		(budget) =>
			unary((f) => curried((init, list, call) => foldLeft(f, init, list, { call, budget }))),
	],
	["mkFlake", (budget) => curried((_args, module, call) => mkFlake(module, { call, budget }))],
	...DERIVATIONS,
]);

/**
 * The library value a name stands for, when the flake does not say what it is.
 * @param name The name, the last of a selection such as `nixpkgs.lib.genAttrs`.
 * @param budget The reading's budget, which the function spends.
 * @param automatic The caller's package scope for callPackage, if known.
 * @returns The value, or undefined for a name the reading does not know.
 */
function libraryValue(name: string, budget: Budget, automatic?: Thunk): NixValue | undefined {
	if (name === "callPackage") return callPackage(budget, automatic);
	return LIBRARY.get(name)?.(budget);
}

/**
 * The value a selection gives, or, where the reading cannot follow it, the
 * library function its last name stands for: `nixpkgs.lib.genAttrs`.
 * @param value The value the selection gives.
 * @param name Its last name.
 * @param budget The reading's budget.
 * @param automatic The caller's package scope for callPackage, if known.
 * @returns The value, or the library function.
 */
function orLibrary(
	value: NixValue,
	name: string | undefined,
	budget: Budget,
	automatic?: Thunk,
): NixValue {
	if (value.kind !== "unknown" || name === undefined) return value;
	return libraryValue(name, budget, automatic) ?? value;
}

export { libraryValue, orLibrary, updated };
