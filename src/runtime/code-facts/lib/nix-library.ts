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
//   which are `genAttrs`; and `defaultSystems`, the four systems flake-utils
//   names by default (`aarch64-linux`, `aarch64-darwin`, `x86_64-darwin`,
//   `x86_64-linux`). A flake that changes them through the `systems` input is
//   still read with these four.
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

import type { Node } from "web-tree-sitter";
import {
	type AttrsValue,
	type Entry,
	type FunctionValue,
	type NixValue,
	type Thunk,
	ANY,
	applied,
	attrs,
	lazy,
	namesOf,
	ready,
	unknownAt,
} from "@/runtime/code-facts/lib/nix-values";

/** The systems flake-utils names by default. */
const DEFAULT_SYSTEMS = ["aarch64-linux", "aarch64-darwin", "x86_64-darwin", "x86_64-linux"];

/** The outputs flake-parts gives once per system from `perSystem`. */
const PER_SYSTEM_OUTPUTS = new Set([
	"apps",
	"checks",
	"devShells",
	"formatter",
	"legacyPackages",
	"packages",
]);

/**
 * A string value.
 * @param value Its text.
 * @returns The value.
 */
function text(value: string): NixValue {
	return { kind: "string", text: value };
}

/**
 * A function of two arguments, applied one at a time.
 * @param body What it gives for both, at the call that applies the second.
 * @returns The function.
 */
function curried(body: (first: Thunk, second: Thunk, call: Node) => NixValue): FunctionValue {
	return {
		kind: "function",
		/**
		 * Take the first argument.
		 * @param first The first argument.
		 * @returns The function of the second.
		 */
		apply: (first) => ({
			kind: "function",
			/**
			 * Take the second argument.
			 * @param second The second argument.
			 * @param call The call.
			 * @returns What the function gives.
			 */
			apply: (second, call) => body(first, second, call),
		}),
	};
}

/**
 * The names a list of systems gives, and what each system is as an argument:
 * its name, or, for a list the reading cannot tell, the one name `*` and an
 * unknown system.
 * @param list The list.
 * @param call The call, for an unknown system.
 * @returns Each name, and the argument it stands for.
 */
function systemsIn(list: NixValue, call: Node): [string, NixValue][] {
	const names = namesOf(list);
	if (names === undefined) return [[ANY, unknownAt(call)]];
	return names.map((name) => [name, text(name)]);
}

/**
 * `genAttrs names f`: one name for each item, each with what `f` gives for it.
 * @param list The names.
 * @param f The function.
 * @param call The call.
 * @returns The set.
 */
function genAttrs(list: Thunk, f: Thunk, call: Node): NixValue {
	const entries = systemsIn(list(), call).map(([name, argument]): [string, Entry] => [
		name,
		{ node: call, value: lazy(() => applied(f(), ready(argument), call), call) },
	]);
	return attrs(new Map(entries));
}

/**
 * Outputs given once per system, turned so that the system comes second:
 * `{ packages.default }` for each system becomes `packages.<system>.default`.
 * @param list The systems.
 * @param perSystem What one system gives.
 * @param call The call.
 * @param keep Which outputs to turn, when not every one.
 * @returns The outputs.
 */
function transposed(
	list: NixValue,
	perSystem: (system: NixValue) => NixValue,
	call: Node,
	keep?: ReadonlySet<string>,
): NixValue {
	const each = new Map(
		systemsIn(list, call).map(([name, system]) => [name, lazy(() => perSystem(system), call)]),
	);
	const [first] = each.values();
	const probe = first?.() ?? attrs(new Map());
	if (probe.kind === "unknown") return attrs(new Map(), probe.node);
	if (probe.kind !== "attrs") return attrs(new Map());
	const entries = [...probe.entries]
		.filter(([output]) => keep?.has(output) !== false)
		.map(([output, entry]): [string, Entry] => [
			output,
			{ node: entry.node, value: lazy(() => systemsOf(each, output), entry.node) },
		]);
	return attrs(new Map(entries), probe.open);
}

/**
 * One output's value for each system.
 * @param each What each system gives.
 * @param output The output.
 * @returns The set of systems.
 */
function systemsOf(each: ReadonlyMap<string, Thunk>, output: string): AttrsValue {
	const entries = [...each].flatMap(([system, value]): [string, Entry][] => {
		const read = value();
		const entry = read.kind === "attrs" ? read.entries.get(output) : undefined;
		return entry === undefined ? [] : [[system, entry]];
	});
	return attrs(new Map(entries));
}

/**
 * Merge two values as `left // right` does, or as `recursiveUpdate` does
 * when `deep`: right wins, and with `deep` two sets under one name merge too.
 * An operand the reading cannot follow may hold any name, so the merge keeps
 * the other's names and is open.
 * @param left The left value.
 * @param right The right value.
 * @param deep Whether sets under one name merge.
 * @returns The merged value.
 */
function updated(left: NixValue, right: NixValue, deep: boolean): NixValue {
	if (left.kind === "attrs" && right.kind === "attrs") return mergedSets(left, right, deep);
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
 * Two sets merged: right wins, and with `deep` two sets under one name merge too.
 * @param left The left set.
 * @param right The right set.
 * @param deep Whether sets under one name merge.
 * @returns The merged set.
 */
function mergedSets(left: AttrsValue, right: AttrsValue, deep: boolean): AttrsValue {
	const entries = new Map(left.entries);
	for (const [name, entry] of right.entries) {
		const under = left.entries.get(name);
		entries.set(name, deep && under !== undefined ? mergedEntry(under, entry) : entry);
	}
	return attrs(entries, left.open ?? right.open);
}

/**
 * Two entries of one name, merged as `recursiveUpdate` merges them.
 * @param left The left entry.
 * @param right The right entry.
 * @returns The merged entry, at the left one's node.
 */
function mergedEntry(left: Entry, right: Entry): Entry {
	return {
		node: left.node,
		value: lazy(() => updated(left.value(), right.value(), true), right.node),
	};
}

/**
 * flake-parts `mkFlake args module`: the module's `flake`, and the outputs its
 * `perSystem` gives for each of its `systems`.
 * @param module The module: a set, or a function of the module arguments.
 * @param call The call.
 * @returns The outputs.
 */
function mkFlake(module: Thunk, call: Node): NixValue {
	const read = module();
	const value = read.kind === "function" ? read.apply(ready(attrs(new Map(), call)), call) : read;
	if (value.kind !== "attrs") return value;
	const flake = value.entries.get("flake")?.value() ?? attrs(new Map());
	return importing(
		updated(perSystemOutputs(value, call), flake, true),
		value.entries.get("imports"),
	);
}

/**
 * The outputs a flake-parts module's `perSystem` gives for each of its `systems`.
 * @param module The module.
 * @param call The call of `mkFlake`.
 * @returns The outputs; none without `perSystem`.
 */
function perSystemOutputs(module: AttrsValue, call: Node): NixValue {
	const perSystem = module.entries.get("perSystem")?.value();
	if (perSystem === undefined) return attrs(new Map());
	const systems = module.entries.get("systems")?.value() ?? unknownAt(call);
	return transposed(
		systems,
		(system) => perSystemOf(perSystem, system, call),
		call,
		PER_SYSTEM_OUTPUTS,
	);
}

/**
 * The outputs of a flake-parts module that imports other modules, which can
 * add outputs the reading cannot tell: open at the imports.
 * @param outputs The outputs the module gives itself.
 * @param imports Its `imports`, if any.
 * @returns The outputs, open when it imports a module.
 */
function importing(outputs: NixValue, imports: Entry | undefined): NixValue {
	if (imports === undefined || outputs.kind !== "attrs") return outputs;
	return namesOf(imports.value())?.length === 0 ? outputs : attrs(outputs.entries, imports.node);
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
 * @param call The call.
 * @returns The outputs.
 */
function eachSystem(list: NixValue, f: Thunk, call: Node): NixValue {
	return transposed(list, (system) => applied(f(), ready(system), call), call);
}

/**
 * A function of one argument.
 * @param body What it gives for the argument, at the call.
 * @returns The function.
 */
function unary(body: (argument: Thunk, call: Node) => NixValue): FunctionValue {
	return { kind: "function", apply: body };
}

/**
 * The systems flake-utils names by default.
 * @returns Them, as a list.
 */
function defaultSystems(): NixValue {
	return { kind: "list", items: DEFAULT_SYSTEMS.map((system) => ready(text(system))) };
}

/**
 * `mapAttrs f set`: the set's names, each with what `f` gives for the name
 * and its value.
 * @param f The function.
 * @param set The set.
 * @param call The call.
 * @returns The set; unknown when the reading cannot tell the set.
 */
function mapAttrs(f: Thunk, set: Thunk, call: Node): NixValue {
	const read = set();
	if (read.kind !== "attrs") return read.kind === "unknown" ? read : unknownAt(call);
	const entries = [...read.entries].map(([name, entry]): [string, Entry] => {
		const named = ready(name === ANY ? unknownAt(call) : text(name));
		const value = lazy(() => applied(applied(f(), named, call), entry.value, call), call);
		return [name, { node: entry.node, value }];
	});
	return attrs(new Map(entries), read.open);
}

/**
 * `foldl' f init list`: `f` applied to what it gave so far and each item.
 * @param f The function.
 * @param init What it starts from.
 * @param list The list.
 * @param call The call.
 * @returns What the last application gives; unknown when the reading cannot tell the list.
 */
function foldLeft(f: Thunk, init: Thunk, list: Thunk, call: Node): NixValue {
	const items = list();
	if (items.kind !== "list") return unknownAt(call);
	return items.items.reduce(
		(sofar, item) => applied(applied(f(), ready(sofar), call), item, call),
		init(),
	);
}

/** The library functions, by the name a flake calls them by. */
const LIBRARY: ReadonlyMap<string, () => NixValue> = new Map<string, () => NixValue>([
	["genAttrs", () => curried(genAttrs)],
	["eachSystemMap", () => curried(genAttrs)],
	["eachDefaultSystemMap", () => unary((f, call) => genAttrs(defaultSystems, f, call))],
	["eachSystem", () => curried((list, f, call) => eachSystem(list(), f, call))],
	["eachDefaultSystem", () => unary((f, call) => eachSystem(defaultSystems(), f, call))],
	["defaultSystems", defaultSystems],
	["recursiveUpdate", () => curried((left, right) => updated(left(), right(), true))],
	["mapAttrs", () => curried(mapAttrs)],
	// The reading cannot tell the condition, so it counts the names as given.
	["optionalAttrs", () => curried((_condition, set) => set())],
	["foldl'", () => unary((f) => curried((init, list, call) => foldLeft(f, init, list, call)))],
	["mkFlake", () => curried((_args, module, call) => mkFlake(module, call))],
]);

/**
 * The library value a name stands for, when the flake does not say what it is.
 * @param name The name, the last of a selection such as `nixpkgs.lib.genAttrs`.
 * @returns The value, or undefined for a name the reading does not know.
 */
function libraryValue(name: string): NixValue | undefined {
	return LIBRARY.get(name)?.();
}

export { libraryValue, updated };
