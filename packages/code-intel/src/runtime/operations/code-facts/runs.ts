// Whether code runs what a name spells, or only uses the name as a value
// (ADR 0046, amended by TASK-367.28).
//
// Code runs a name when it calls it, constructs it, renders it as a
// component, applies it as a decorator or an attribute, sends it a message or
// derives from it. A name at the start of a chain that the code calls, or
// inside it, runs too: `api.read()` runs `api`, and `Schema.parse()` runs
// `Schema`, because the check cannot tell a member that the name's module
// defines from one of a library. A subscript is a link of a chain as a member
// is: `handlers[kind]()` runs `handlers`. Any other use at run time uses the
// name as a value: it reads a constant, passes the name on, or tests a value
// against a class, as `instanceof` and a catch do. A passed argument also
// records that use, so the check can count a known function as running code
// and keep a constant as a value (TASK-436.15).

import type { Node } from "web-tree-sitter";
import type { Definition, Reference } from "#runtime/operations/code-facts/facts.ts";

/**
 * Where a name stands in syntax that runs it: the field that holds it, or a
 * test of the syntax and the name, for syntax that holds it with no field.
 */
type Stand = string | ((runner: Node, name: Node) => boolean);

/** How one grammar writes running a name. */
interface RunSyntax {
	/** The syntax that runs a name, and where the name stands in it. */
	readonly runners: Readonly<Record<string, Stand>>;
	/**
	 * The syntax that spells a chain of names, and the fields that hold its
	 * links; the empty string for a child with no field, as the name of a
	 * generic name in C#.
	 */
	readonly chains: Readonly<Record<string, readonly string[]>>;
	/** Argument syntax, and where a name passed to a call stands in it. */
	readonly arguments: Readonly<Record<string, Stand>>;
}

/**
 * Any child of a runner stands where it runs, as the name of a decorator does.
 * @returns True.
 */
const ANY: Stand = () => true;

/**
 * Whether a node stands in syntax where a field, or the test, puts it.
 * @param runner The syntax.
 * @param name The node.
 * @param stand Where the syntax puts what it runs.
 * @returns True when it stands there.
 */
function standsIn(runner: Node, name: Node, stand: Stand): boolean {
	return typeof stand === "string"
		? runner.childForFieldName(stand)?.id === name.id
		: stand(runner, name);
}

/**
 * Whether a node is one link of a chain the other node spells.
 * @param link The node.
 * @param chain The node that may hold it.
 * @param syntax The grammar's syntax.
 * @returns True when it is.
 */
function linkOf(link: Node, chain: Node, syntax: RunSyntax): boolean {
	const fields = syntax.chains[chain.type] ?? [];
	return fields.some((field) =>
		field === ""
			? chain.namedChildren.some((child) => child.id === link.id)
			: chain.childForFieldName(field)?.id === link.id,
	);
}

/**
 * The whole qualified or wrapped expression that a name stands in.
 * @param name The name.
 * @param syntax The grammar's chains.
 * @returns Its outer expression.
 */
function wholeName(name: Node, syntax: RunSyntax): Node {
	let whole = name;
	while (whole.parent !== null && linkOf(whole, whole.parent, syntax)) whole = whole.parent;
	return whole;
}

/**
 * Whether an expression stands in one of the given syntax positions.
 * @param whole The expression.
 * @param positions The positions that run or pass a name.
 * @returns Whether it stands there.
 */
function standsAt(whole: Node, positions: Readonly<Record<string, Stand>>): boolean {
	const parent = whole.parent;
	if (parent === null) return false;
	const stand = positions[parent.type];
	return stand !== undefined && standsIn(parent, whole, stand);
}

/**
 * The mark of a use at run time that runs none of what its name spells.
 * @param name The name.
 * @param syntax The grammar's syntax.
 * @param typeOnly Whether the use is only as a type, which is never a use as a value.
 * @returns `asValue` for a value use, with `passed` for an argument, else nothing.
 */
function valueMark(
	name: Node,
	syntax: RunSyntax,
	typeOnly: boolean,
): Pick<Reference, "asValue" | "passed"> {
	if (typeOnly) return {};
	const whole = wholeName(name, syntax);
	if (standsAt(whole, syntax.runners)) return {};
	const passed = standsAt(whole, syntax.arguments);
	return passed ? { asValue: true, passed: true } : { asValue: true };
}

/**
 * Whether a runtime use runs code: directly, or by passing a known function
 * to a caller that may run it. Constants and other value reads remain values.
 * @param reference The use.
 * @param definition What it reaches, where known.
 * @returns Whether its dependency must be drawn.
 */
function runsDefinition(
	reference: Pick<Reference, "asValue" | "passed">,
	definition: Pick<Definition, "kind"> | undefined,
): boolean {
	return (
		reference.asValue !== true || (reference.passed === true && definition?.kind === "function")
	);
}

export { ANY, type RunSyntax, runsDefinition, valueMark };
