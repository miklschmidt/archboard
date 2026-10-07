// The derivations a static reading of a flake recognises, and what each is
// built from (ADR 0046, TASK-367.22). A derivation is a value the reading
// cannot follow as far as its names go, as any package is, and it carries the
// expressions it is built from: the items of its `buildInputs`,
// `nativeBuildInputs` and `propagatedBuildInputs`. nix-build-inputs.ts then
// says which of them are other packages of the same flake.
//
// A call is a derivation when the function it calls has one of these last
// names, as the library functions of nix-library.ts are recognised, and only
// where the file does not bind the name itself:
//
// - `mkDerivation` (`stdenv.mkDerivation`, `pkgs.stdenvNoCC.mkDerivation`),
//   `buildGoModule`, `buildPythonPackage`, `buildPythonApplication` and
//   `buildRustPackage` (`rustPlatform.buildRustPackage`), with an attribute
//   set, a `rec` set, or a function of the derivation's final attributes
//   (`finalAttrs: { ... }`), whose attributes the reading cannot tell;
// - `callPackage f args` (`pkgs.callPackage`, an overlay's
//   `final.callPackage`): a local file or inline function is followed with
//   the caller's package scope and explicit overrides. Its actual input
//   lists give its dependencies; an unread function keeps explicit inputs.
//
// What the reading cannot follow stays unknown: an input list that is no list
// it can tell, a set that an expression it cannot follow may add an input
// list to, and an unread package function of `callPackage`. Each name and item it
// reads spends a step of the reading's budget; once the budget is spent, the
// inputs are unknown.

import type { Node } from "web-tree-sitter";
import {
	type AttrsValue,
	type Budget,
	type Derivation,
	type Entry,
	type NixValue,
	type Thunk,
	attrs,
	applied,
	curried,
	ready,
	spend,
	unary,
	unknownAt,
	surelyAbsent,
	lazy,
	selected,
} from "@/runtime/code-facts/lib/nix-values";

/** The attributes of a derivation that name what it is built from. */
const INPUT_LISTS = ["buildInputs", "nativeBuildInputs", "propagatedBuildInputs"];

/** The builders that take one set of attributes, by the last name a flake calls them by. */
const BUILDERS = [
	"mkDerivation",
	"buildGoModule",
	"buildPythonPackage",
	"buildPythonApplication",
	"buildRustPackage",
];

/** The call that gives a derivation, and the reading's budget, which reading it spends. */
interface At {
	readonly call: Node;
	readonly budget: Budget;
}

/**
 * A derivation: a value the reading cannot follow, with what it is built from.
 * @param call The call that gives it.
 * @param derivation What it is built from.
 * @returns The value.
 */
function derivationAt(call: Node, derivation: Derivation): NixValue {
	return { kind: "unknown", node: call, derivation };
}

/**
 * The expression that makes a value the reading cannot follow, if it is one.
 * @param value The value.
 * @returns Its expression, or undefined for a value the reading can tell.
 */
function unknownNode(value: NixValue): Node | undefined {
	return value.kind === "unknown" ? value.node : undefined;
}

/** The items of one input list, or the expression the reading cannot follow there. */
type Items = { readonly items: readonly Entry[] } | { readonly unfollowed: Node };

/**
 * The items of one input list of a set of attributes.
 * @param entry The list's entry.
 * @param budget The reading's budget, which pays for each item.
 * @returns The items, or the expression the reading cannot follow.
 */
function itemsOf(entry: Entry, budget: Budget): Items {
	const value = entry.value();
	if (value.kind !== "list") return { unfollowed: unknownNode(value) ?? entry.node };
	return spend(budget, value.items.length) ? { items: value.items } : { unfollowed: entry.node };
}

/**
 * What a set of attributes says a derivation is built from.
 * @param set The set.
 * @param budget The reading's budget, which pays for each name and item.
 * @returns What it is built from.
 */
function inputsIn(set: AttrsValue, budget: Budget): Derivation {
	const inputs: Entry[] = [];
	let unfollowed = set.open;
	for (const name of INPUT_LISTS) {
		const entry = set.entries.get(name);
		const found = entry === undefined ? { items: [] } : itemsOf(entry, budget);
		if ("items" in found) inputs.push(...found.items);
		else unfollowed ??= found.unfollowed;
	}
	return unfollowed === undefined ? { inputs } : { inputs, unfollowed };
}

/**
 * What a builder's set of attributes says the derivation is built from.
 * @param argument The set, or a function of the derivation's final attributes.
 * @param at The call, and the reading's budget.
 * @returns The derivation.
 */
function built(argument: Thunk, at: At): NixValue {
	const read = argument();
	const set =
		read.kind === "function" ? read.apply(ready(attrs(new Map(), at.call)), at.call) : read;
	if (set.kind !== "attrs" || !spend(at.budget, INPUT_LISTS.length)) {
		return derivationAt(at.call, { inputs: [], unfollowed: unknownNode(set) ?? at.call });
	}
	return derivationAt(at.call, inputsIn(set, at.budget));
}

/**
 * An unread package function keeps its explicit inputs and its unknown source.
 * @param fn The package function the reading cannot follow.
 * @param args The explicit arguments.
 * @param at The call and budget.
 * @returns The unresolved derivation.
 */
function unfollowedPackage(fn: NixValue, args: NixValue, at: At): NixValue {
	const named = args.kind === "attrs" && spend(at.budget, args.entries.size);
	return derivationAt(at.call, {
		inputs: named ? [...args.entries.values()] : [],
		unfollowed: unknownNode(fn) ?? at.call,
	});
}

/**
 * callPackage passes formal names from its package scope, then explicit overrides.
 * A missing name in an unknown package scope remains unknown, not a default.
 * @param names The function's formal names.
 * @param args The explicit arguments.
 * @param automatic The package scope.
 * @param at The call and budget.
 * @returns The argument set, or unknown after the shared budget is spent.
 */
function packageArguments(
	names: readonly string[],
	args: AttrsValue,
	automatic: NixValue,
	at: At,
): NixValue {
	if (!spend(at.budget, names.length + args.entries.size)) return unknownAt(at.call);
	const entries = new Map<string, Entry>();
	for (const name of names) {
		if (!surelyAbsent(automatic, name)) {
			entries.set(name, {
				node: at.call,
				value: lazy(() => selected(automatic, name, at.call), at.call),
			});
		}
	}
	for (const [name, entry] of args.entries) entries.set(name, entry);
	return attrs(entries, args.open);
}

/**
 * Read the function a callPackage path or inline expression gives.
 * @param source The path or inline value.
 * @param at The call and budget.
 * @returns Its value, or unknown for a source the reading cannot follow.
 */
function packageFunction(source: NixValue, at: At): NixValue {
	return source.kind === "path"
		? (at.budget.import?.(source, at.call) ?? unknownAt(at.call))
		: source;
}

/**
 * Follow `callPackage f args`, reading the function's actual build inputs.
 * @param f The package path or inline function.
 * @param args The explicit arguments.
 * @param automatic The caller's package scope, if known.
 * @param at The call and budget.
 * @returns The package value, or an unresolved derivation.
 */
function calledPackage(f: Thunk, args: Thunk, automatic: Thunk | undefined, at: At): NixValue {
	const fn = packageFunction(f(), at);
	const read = args();
	if (fn.kind !== "function" || read.kind !== "attrs") return unfollowedPackage(fn, read, at);
	const auto = automatic?.() ?? unknownAt(at.call);
	const argument = packageArguments(fn.formals ?? [], read, auto, at);
	return applied(fn, ready(argument), at.call);
}

/**
 * A builder that takes one set of attributes.
 * @param budget The reading's budget.
 * @returns The function.
 */
function builder(budget: Budget): NixValue {
	return unary((argument, call) => built(argument, { call, budget }));
}

/**
 * `callPackage`.
 * @param budget The reading's budget.
 * @param automatic The caller's package scope, if known.
 * @returns The function.
 */
function callPackage(budget: Budget, automatic?: Thunk): NixValue {
	return curried((f, args, call) => calledPackage(f, args, automatic, { call, budget }));
}

/** The functions that give a derivation, by the name a flake calls them by, each spending the reading's budget. */
const DERIVATIONS: readonly (readonly [string, (budget: Budget) => NixValue])[] = [
	...BUILDERS.map((name) => [name, builder] as const),
	["callPackage", callPackage],
];

export { DERIVATIONS, callPackage };
