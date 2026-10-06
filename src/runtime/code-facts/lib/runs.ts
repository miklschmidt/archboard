// Whether code runs what a name spells, or only uses the name as a value
// (ADR 0046, amended by TASK-367.28).
//
// Code runs a name when it calls it, constructs it, renders it as a
// component, applies it as a decorator or an attribute, sends it a message or
// derives from it. A name at the start of a chain that the code calls, or
// inside it, runs too: `api.read()` runs `api`, and `Schema.parse()` runs
// `Schema`, because the check cannot tell a member that the name's module
// defines from one of a library. Any other use at run time uses the name as a
// value: it reads a constant, passes the name on, or tests a value against a
// class, as `instanceof` and a catch do.

import type { Node } from "web-tree-sitter";

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
 * Whether code runs what a name spells, itself or as a link of the chain it
 * stands in.
 * @param name The name.
 * @param syntax The grammar's syntax.
 * @returns True when it does; false when the code uses the name as a value.
 */
function runsName(name: Node, syntax: RunSyntax): boolean {
	let whole = name;
	while (whole.parent !== null && linkOf(whole, whole.parent, syntax)) whole = whole.parent;
	const runner = whole.parent;
	const stand = runner === null ? undefined : syntax.runners[runner.type];
	return runner !== null && stand !== undefined && standsIn(runner, whole, stand);
}

/**
 * The mark of a use at run time that runs none of what its name spells.
 * @param name The name.
 * @param syntax The grammar's syntax.
 * @param typeOnly Whether the use is only as a type, which is never a use as a value.
 * @returns `asValue` for a use as a value, else nothing.
 */
function valueMark(name: Node, syntax: RunSyntax, typeOnly: boolean): { readonly asValue?: true } {
	return typeOnly || runsName(name, syntax) ? {} : { asValue: true };
}

export { ANY, type RunSyntax, valueMark };
