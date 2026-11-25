// The definitions of a Go file (ADR 0046, TASK-575): its declarations at file
// level, and the members of the types it declares.
//
// A method is spelled with the type its receiver names, wherever the type is
// declared (`Ledger.Post` for `func (l *Ledger) Post()`), a field of a struct
// and a method of an interface with their type (`Ledger.Name`). An embedded
// field is named by its type's last name, as Go names it. A declaration inside
// a function body is a local, and is no definition.
//
// Go has no word for visibility: a name that starts with an upper-case letter
// is exported from its package, any other is not. So the visibility reads
// `exported` or `unexported`. A definition is exposed when code of another
// package can name it: an exported name, and for a member also an exported
// type. A method of an unexported type can still be reached through an
// interface, but no other package can name it.
//
// For module depth (TASK-646.11), a struct, and a named type whose file
// declares a method on it, is a class; an interface, an alias and any other
// named type declares a type alone. A function or a method that only passes
// its call on names its callee's root, and `Error`, `String`, `GoString` and
// `Format`, which Go and `fmt` call themselves, are marked so (go-depth.ts).

import type { Node } from "web-tree-sitter";
import type { Definition } from "#runtime/code-facts/operations/facts.ts";
import { sourceRange } from "#runtime/code-facts/operations/spans.ts";
import { calledByGo, goPassesTo } from "#runtime/code-facts/go/operations/go-depth.ts";

/**
 * Whether Go exports a name: its first letter is upper case.
 * @param name The name.
 * @returns True when it does.
 */
function exportedName(name: string): boolean {
	const first = name.codePointAt(0);
	if (first === undefined) return false;
	const letter = String.fromCodePoint(first);
	return letter !== letter.toLowerCase() && letter === letter.toUpperCase();
}

/**
 * One definition.
 * @param node Its declaration.
 * @param symbol Its spelled name.
 * @param kind Its kind.
 * @param exposed Whether another package can name it.
 * @returns The definition.
 */
function definition(
	node: Node,
	symbol: string,
	kind: Definition["kind"],
	exposed: boolean,
): Definition {
	const last = symbol.slice(symbol.lastIndexOf(".") + 1);
	return {
		symbol,
		kind,
		start: node.startPosition.row + 1,
		end: node.endPosition.row + 1,
		source: sourceRange(node),
		visibility: exportedName(last) ? "exported" : "unexported",
		exposed,
	};
}

/** The field that holds the type a generic or a qualified type names. */
const INNER_FIELD: Readonly<Record<string, string>> = {
	generic_type: "type",
	qualified_type: "name",
};

/** One member of a type: its declaration, its name and its kind. */
interface Member {
	readonly node: Node;
	readonly name: string;
	readonly kind: Definition["kind"];
}

/**
 * The first named child of a node.
 * @param node The node.
 * @returns The child, or null.
 */
function firstChild(node: Node): Node | null {
	return node.namedChildren[0] ?? null;
}

/**
 * The name of the type a receiver or an embedded field names: its last name,
 * without a pointer or generic arguments.
 * @param type The type.
 * @returns The name, or undefined for a type that has none.
 */
function typeName(type: Node | null): string | undefined {
	if (type === null) return undefined;
	if (type.type === "type_identifier") return type.text;
	const inner = innerType(type);
	return inner === undefined ? undefined : typeName(inner);
}

/**
 * The type a pointer, a generic type or a qualified type names.
 * @param type The type.
 * @returns The type inside it, or undefined for any other type.
 */
function innerType(type: Node): Node | null | undefined {
	if (type.type === "pointer_type") return firstChild(type);
	const field = INNER_FIELD[type.type];
	return field === undefined ? undefined : type.childForFieldName(field);
}

/**
 * The names a field declaration gives: its names, or its type's last name
 * for an embedded field.
 * @param field The declaration.
 * @returns The names.
 */
function fieldNames(field: Node): string[] {
	const names = field.childrenForFieldName("name").map((name) => name.text);
	const embedded = names.length === 0 ? typeName(field.childForFieldName("type")) : undefined;
	return embedded === undefined ? names : [embedded];
}

/**
 * The fields and methods of a struct or an interface type.
 * @param type The type's body.
 * @returns The members.
 */
function membersIn(type: Node): Member[] {
	if (type.type === "interface_type") {
		return type.namedChildren.flatMap((node): Member[] => {
			const name = node.type === "method_elem" ? node.childForFieldName("name") : null;
			return name === null ? [] : [{ node, name: name.text, kind: "function" }];
		});
	}
	const list = type.type === "struct_type" ? firstChild(type) : null;
	const fields = list?.namedChildren.filter((child) => child.type === "field_declaration") ?? [];
	return fields.flatMap((node) =>
		fieldNames(node).map((name): Member => ({ node, name, kind: "value" })),
	);
}

/**
 * Whether a named type declares a type alone, which a caller neither runs
 * nor reads (TASK-646.11): an interface, or a named type that is no struct
 * and whose file declares no method on it. A struct, or a named type with
 * methods of its own, is a class. An alias always declares a type alone.
 * @param type The type it names, if any.
 * @param methods Whether its file declares a method on it.
 * @returns True when it does.
 */
function typeAlone(type: Node | null, methods: boolean): boolean {
	const kind = type === null ? "" : type.type;
	return kind === "interface_type" || (kind !== "struct_type" && !methods);
}

/**
 * The definitions of one type declaration: each type it declares, and their members.
 * @param declaration The declaration.
 * @param receivers The types the file's methods are declared on.
 * @returns Them.
 */
function typesOf(declaration: Node, receivers: ReadonlySet<string>): Definition[] {
	return declaration.namedChildren.flatMap((spec) => {
		const name = spec.childForFieldName("name")?.text;
		if (name === undefined) return [];
		const type = spec.type === "type_spec" ? spec.childForFieldName("type") : null;
		const members = (type === null ? [] : membersIn(type)).map((member) =>
			definition(
				member.node,
				`${name}.${member.name}`,
				member.kind,
				exportedName(name) && exportedName(member.name),
			),
		);
		return [ownDefinition(spec, name, type, receivers), ...members];
	});
}

/**
 * The definition of one type a declaration declares.
 * @param spec Its declaration.
 * @param name Its name.
 * @param type The type it names, if any.
 * @param receivers The types the file's methods are declared on.
 * @returns The definition, marked as a type alone where it is one.
 */
function ownDefinition(
	spec: Node,
	name: string,
	type: Node | null,
	receivers: ReadonlySet<string>,
): Definition {
	const own = definition(spec, name, "class", exportedName(name));
	const alone = spec.type !== "type_spec" || typeAlone(type, receivers.has(name));
	return alone ? { ...own, type: true } : own;
}

/**
 * The definitions of one `const` or `var` declaration: a function literal
 * assigned to a name is a function, any other value a value.
 * @param declaration The declaration.
 * @returns Them.
 */
function valuesOf(declaration: Node): Definition[] {
	const specs = declaration.namedChildren.flatMap((node) =>
		node.type === "var_spec_list" ? node.namedChildren : [node],
	);
	return specs.flatMap((spec) => {
		const values = spec.childForFieldName("value")?.namedChildren ?? [];
		return spec.childrenForFieldName("name").map((name, index) => {
			const kind = values[index]?.type === "func_literal" ? "function" : "value";
			return definition(spec, name.text, kind, exportedName(name.text));
		});
	});
}

/**
 * The definition of a function.
 * @param node The function declaration.
 * @returns It.
 */
function functionOf(node: Node): Definition[] {
	const name = node.childForFieldName("name")?.text;
	if (name === undefined) return [];
	return [{ ...definition(node, name, "function", exportedName(name)), ...passesOf(node) }];
}

/**
 * The call a function or a method only passes on, where it does.
 * @param node The declaration.
 * @returns The trait, or none.
 */
function passesOf(node: Node): Pick<Definition, "passes"> {
	const passes = goPassesTo(node);
	return passes === undefined ? {} : { passes };
}

/**
 * The definition of a method, spelled with its receiver's type.
 * @param method The method declaration.
 * @returns It, or none for a receiver whose type has no name.
 */
function methodOf(method: Node): Definition[] {
	const holder = receiverType(method);
	const name = method.childForFieldName("name")?.text;
	if (holder === undefined || name === undefined) return [];
	const exposed = exportedName(holder) && exportedName(name);
	return [
		{
			...definition(method, `${holder}.${name}`, "function", exposed),
			...passesOf(method),
			...(calledByGo(name) ? { calledByLanguage: true as const } : {}),
		},
	];
}

/**
 * The name of the type a method's receiver names.
 * @param method The method declaration.
 * @returns The name, or undefined for a receiver whose type has none.
 */
function receiverType(method: Node): string | undefined {
	const receiver = method.childForFieldName("receiver")?.namedChildren[0];
	return receiver === undefined ? undefined : typeName(receiver.childForFieldName("type"));
}

/** The definitions each declaration at file level gives, by its node, with the types the file's methods are declared on. */
const DECLARATIONS: Readonly<
	Record<string, (node: Node, receivers: ReadonlySet<string>) => Definition[]>
> = {
	function_declaration: functionOf,
	method_declaration: methodOf,
	type_declaration: typesOf,
	const_declaration: valuesOf,
	var_declaration: valuesOf,
};

/**
 * The definitions of a Go file.
 * @param root The file's syntax tree.
 * @returns Its definitions.
 */
function definitionsOf(root: Node): Definition[] {
	const receivers = new Set(
		root.namedChildren.flatMap((node) =>
			node.type === "method_declaration" ? (receiverType(node) ?? []) : [],
		),
	);
	return root.namedChildren.flatMap((node) => DECLARATIONS[node.type]?.(node, receivers) ?? []);
}

export { definitionsOf };
