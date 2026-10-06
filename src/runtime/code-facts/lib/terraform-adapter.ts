// The Terraform and OpenTofu adapter (ADR 0046): the code facts of one `.tf`
// or `.tofu` file from the captures of `terraform.scm`.
//
// Each top-level block declares what Terraform addresses: a resource
// `aws_sqs_queue.jobs`, a data source `data.T.N`, an ephemeral resource
// `ephemeral.T.N`, a module call `module.N`, a variable `var.N`, an output
// `output.N`, and each name of a `locals` block `local.N`. Each argument of a
// module call is declared too, as `module.N.var.X`: the value the call gives
// the variable `X` of the module, which is the address of that variable in the
// caller's address space. Variables and outputs are a module's interface, so
// they are exposed; everything else stays inside the module. Other blocks
// (`terraform`, `provider`, `moved`, `import`, `check`) declare nothing.
//
// A reference is each address an expression names, at the line it names it,
// with the attributes, index keys and splats after it dropped. Until provider
// rules say otherwise (TASK-367.18), every reference is a configured path. A
// name that a `for` or a `dynamic` block binds, `count`, `each`, `path`,
// `terraform` and `self` name no address. A `provider`, `providers` or
// `ignore_changes` argument names a provider configuration or attributes, and
// a `moved`, `import` or `removed` block refactors addresses rather than using
// them, so none of them is a reference. A name in a comment or a string is
// never one.
//
// A module call whose `source` is a string is an import of the module. Its
// one name is the call, `module.N`, which brings in the module's outputs.
//
// The name of each environment value a resource sets for the code it runs is
// a reference by `environment`, at the line of its value
// (terraform-environment.ts): TASK-367.23 joins it with the code that reads
// the name.

import type { Node, QueryCapture, Tree } from "web-tree-sitter";
import type { Definition, Import, ParsedFacts, Reference } from "@/runtime/code-facts/lib/facts";
import type { Grammar } from "@/runtime/code-facts/lib/grammars";
import { spansOf, type Spans } from "@/runtime/code-facts/lib/spans";
import { addressOf } from "@/runtime/code-facts/lib/terraform-address";
import { environmentOf } from "@/runtime/code-facts/lib/terraform-environment";
import { unparsedOf } from "@/runtime/code-facts/lib/unparsed";

/** What each kind of block declares: the address's first names, and its visibility. */
const DECLARES: Readonly<Record<string, { readonly prefix: string; readonly labels: number }>> = {
	resource: { prefix: "", labels: 2 },
	data: { prefix: "data.", labels: 2 },
	ephemeral: { prefix: "ephemeral.", labels: 2 },
	module: { prefix: "module.", labels: 1 },
	variable: { prefix: "var.", labels: 1 },
	output: { prefix: "output.", labels: 1 },
};

/** The kinds of declaration a module's interface is made of. */
const INTERFACE = new Set(["variable", "output"]);

/** The arguments of a module call that set no variable of the module. */
const META_ARGUMENTS = new Set([
	"source",
	"version",
	"count",
	"for_each",
	"depends_on",
	"providers",
]);

/** Arguments whose names are no reference: a provider configuration, or attributes to ignore. */
const NOT_REFERENCES = new Set(["provider", "providers", "ignore_changes"]);

/** Blocks that refactor addresses rather than use them. */
const REFACTORING = new Set(["moved", "import", "removed"]);

/** A string with no interpolation and no directive. */
const LITERAL = /^"((?:[^"\\$%]|\\.)*)"$/u;

/** The captures of one file, by what the query calls them. */
interface Captured {
	readonly block: Node[];
	readonly reference: Node[];
	readonly unparsed: Node[];
}

/**
 * Sort the captures into their lists.
 * @param captures The captures, in document order.
 * @returns The lists.
 */
function sorted(captures: readonly QueryCapture[]): Captured {
	const lists: Captured = { block: [], reference: [], unparsed: [] };
	for (const capture of captures) {
		if (capture.name === "block" || capture.name === "reference" || capture.name === "unparsed") {
			lists[capture.name].push(capture.node);
		}
	}
	return lists;
}

/** A block's kind, its labels and its body. */
interface BlockParts {
	readonly kind: string;
	readonly labels: readonly string[];
	readonly body: Node | undefined;
}

/**
 * The text of a block label: a string, or a bare name.
 * @param node The label.
 * @returns Its text.
 */
function labelText(node: Node): string {
	if (node.type === "identifier") return node.text;
	return node.namedChildren.find((child) => child.type === "template_literal")?.text ?? "";
}

/**
 * What a block is.
 * @param block The block.
 * @returns Its kind, labels and body.
 */
function partsOf(block: Node): BlockParts {
	const [kind, ...rest] = block.namedChildren;
	const labels = rest.filter((node) => node.type === "string_lit" || node.type === "identifier");
	return {
		kind: kind?.type === "identifier" ? kind.text : "",
		labels: labels.map(labelText),
		body: block.namedChildren.find((node) => node.type === "body"),
	};
}

/**
 * The attributes directly in a block's body, by name.
 * @param body The body.
 * @returns Each attribute's name and node.
 */
function attributesOf(body: Node | undefined): { readonly name: string; readonly node: Node }[] {
	return (body?.namedChildren ?? []).flatMap((node) => {
		const name = node.type === "attribute" ? node.namedChildren[0]?.text : undefined;
		return name === undefined ? [] : [{ name, node }];
	});
}

/**
 * A declaration over the lines of a node.
 * @param symbol Its address.
 * @param node The node it spans.
 * @param visibility Its kind.
 * @returns The definition.
 */
function declared(symbol: string, node: Node, visibility: string): Definition {
	return {
		symbol,
		start: node.startPosition.row + 1,
		end: node.endPosition.row + 1,
		visibility,
		exposed: INTERFACE.has(visibility),
	};
}

/**
 * What one top-level block declares.
 * @param block The block.
 * @returns Its definitions.
 */
function blockDefinitions(block: Node): Definition[] {
	const { kind, labels, body } = partsOf(block);
	if (kind === "locals") {
		return attributesOf(body).map(({ name, node }) => declared(`local.${name}`, node, "local"));
	}
	const declares = DECLARES[kind];
	if (declares === undefined || labels.length < declares.labels) return [];
	const symbol = `${declares.prefix}${labels.slice(0, declares.labels).join(".")}`;
	const own = declared(symbol, block, kind);
	if (kind !== "module") return [own];
	const passed = attributesOf(body).filter(({ name }) => !META_ARGUMENTS.has(name));
	return [
		own,
		...passed.map(({ name, node }) => declared(`${symbol}.var.${name}`, node, "argument")),
	];
}

/**
 * The value of an attribute, as its source text.
 * @param body The body that holds it.
 * @param name The attribute's name.
 * @returns The attribute and its value's text, or undefined when the body has none.
 */
function attributeValue(
	body: Node | undefined,
	name: string,
): { readonly node: Node; readonly text: string } | undefined {
	const found = attributesOf(body).find((attribute) => attribute.name === name);
	return found && { node: found.node, text: found.node.namedChildren[1]?.text.trim() ?? "" };
}

/**
 * The source of a module call, when it is a string.
 * @param block A block.
 * @returns The source and the line of its argument, or undefined for any other block.
 */
function moduleSource(
	block: Node,
): { readonly specifier: string; readonly line: number } | undefined {
	const { kind, body } = partsOf(block);
	if (kind !== "module") return undefined;
	const source = attributeValue(body, "source");
	const specifier = source && LITERAL.exec(source.text)?.[1];
	return source === undefined || specifier === undefined
		? undefined
		: { specifier, line: source.node.startPosition.row + 1 };
}

/**
 * The import a module call is, when its source is a string.
 * @param block The block.
 * @returns The import, or undefined for any other block.
 */
function moduleImport(block: Node): Import | undefined {
	const source = moduleSource(block);
	const [name] = partsOf(block).labels;
	if (source === undefined || name === undefined) return undefined;
	return {
		...source,
		names: [{ imported: "*", local: `module.${name}`, typeOnly: false }],
		typeOnly: false,
		reexport: false,
	};
}

/**
 * The nodes that follow a node in its parent.
 * @param node The node.
 * @returns Its next siblings, in order.
 */
function siblingsAfter(node: Node | null): Node[] {
	const after: Node[] = [];
	for (let at = node?.nextSibling ?? null; at !== null; at = at.nextSibling) after.push(at);
	return after;
}

/**
 * The names a reference writes from its first name: each attribute after it,
 * passing over index keys, up to anything else.
 * @param first The first name.
 * @returns The names.
 */
function namesFrom(first: Node): string[] {
	const names = [first.text];
	for (const at of siblingsAfter(first.parent).filter((node) => node.type !== "index")) {
		const name = at.type === "get_attr" ? at.namedChildren[0] : undefined;
		if (name?.type !== "identifier") break;
		names.push(name.text);
	}
	return names;
}

/**
 * The names a part of a construct writes directly.
 * @param node The construct.
 * @param part The type of its part that names them.
 * @returns The names.
 */
function namesIn(node: Node, part: string): string[] {
	const holder = node.namedChildren.find((child) => child.type === part);
	return (holder?.namedChildren ?? [])
		.filter((child) => child.type === "identifier")
		.map((child) => child.text);
}

/**
 * The iterator of a `dynamic` block: its `iterator` argument, else its label.
 * @param node A block.
 * @returns The name, or none for any other block.
 */
function iteratorOf(node: Node): string[] {
	const { kind, labels, body } = partsOf(node);
	if (kind !== "dynamic") return [];
	return [attributeValue(body, "iterator")?.text ?? labels[0] ?? ""];
}

/**
 * The variables a `for` expression binds.
 * @param node The expression.
 * @returns Their names.
 */
function forVariables(node: Node): string[] {
	return namesIn(node, "for_intro");
}

/**
 * The variables a `for` directive of a template binds.
 * @param node The directive.
 * @returns Their names.
 */
function templateVariables(node: Node): string[] {
	return namesIn(node, "template_for_start");
}

/** What binds names for the expressions inside it, by node type. */
const BINDS: Readonly<Record<string, (node: Node) => string[]>> = {
	for_tuple_expr: forVariables,
	for_object_expr: forVariables,
	template_for: templateVariables,
	block: iteratorOf,
};

/**
 * Whether a node stands where no name is a reference: an argument that names
 * a provider or attributes, or a block that refactors addresses.
 * @param node The node.
 * @returns True when it is.
 */
function namesNoAddress(node: Node): boolean {
	if (node.type === "attribute") return NOT_REFERENCES.has(node.namedChildren[0]?.text ?? "");
	return node.type === "block" && REFACTORING.has(partsOf(node).kind);
}

/**
 * Whether a name stands where it is no reference: bound by a construct around
 * it, in an argument that names no address, or in a block that refactors
 * addresses.
 * @param first The first name of the reference.
 * @returns True when it is no reference.
 */
function notAReference(first: Node): boolean {
	for (let at = first.parent; at !== null; at = at.parent) {
		if (BINDS[at.type]?.(at).includes(first.text) === true || namesNoAddress(at)) return true;
	}
	return false;
}

/**
 * The reference one first name makes, if it names an address.
 * @param first The first name.
 * @param unparsed The file's unparsed code.
 * @returns The reference, or undefined.
 */
function referenceAt(first: Node, unparsed: Spans): Reference | undefined {
	if (unparsed.holds(first.startIndex) || notAReference(first)) return undefined;
	const symbol = addressOf(namesFrom(first));
	if (symbol === undefined) return undefined;
	return {
		symbol,
		line: first.startPosition.row + 1,
		via: "code",
		kind: "configured-path",
		typeOnly: false,
	};
}

/**
 * The code facts of one parsed Terraform or OpenTofu file.
 * @param tree The file's syntax tree.
 * @param grammar The grammar it was parsed with.
 * @returns The facts; a module call's import is resolved later, per pass.
 */
function terraformFacts(tree: Tree, grammar: Grammar): ParsedFacts {
	const captured = sorted(grammar.query.captures(tree.rootNode));
	const unparsed = spansOf(captured.unparsed);
	const references = new Map<string, Reference>();
	for (const first of captured.reference) {
		const reference = referenceAt(first, unparsed);
		const key = `${reference?.symbol}\0${reference?.line}`;
		if (reference !== undefined && !references.has(key)) references.set(key, reference);
	}
	return {
		definitions: captured.block.flatMap(blockDefinitions),
		references: [...references.values(), ...captured.block.flatMap(environmentOf)],
		imports: captured.block.flatMap((block) => moduleImport(block) ?? []),
		unparsed: unparsedOf(captured.unparsed),
	};
}

export { terraformFacts };
