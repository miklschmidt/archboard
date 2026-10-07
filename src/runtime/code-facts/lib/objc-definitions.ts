// The Objective-C definitions of a file (ADR 0046, TASK-367.10): classes,
// categories and protocols, and their methods, properties and instance
// variables, at file scope, under preprocessor conditions and inside an
// `extern "C"` block. The C definitions of the file are the C walk's
// (c-definitions.ts), also those between the methods of an `@implementation`.
//
// A name is qualified with `::` by its class, as the C family's adapter
// qualifies a member (`shop::Ledger::post`), and a method by its selector:
// `Ledger::post:by:`, `Ledger::balance`. A class method and an instance
// method share the spelling. A category is `Ledger(Audit)`, and its members
// are its class's. A binding may spell a member `Ledger.post:by:`, because a
// lookup compares `::` as `.` (lookup.ts). A forward declaration (`@class`,
// `@protocol Name;`) is no definition.
//
// Visibility, which the file and its role decide:
// - `@interface`, `@implementation` and `@protocol` for a class, a category
//   and a protocol.
// - `public` for a member that a class interface, a category or a protocol
//   declares, and `private` for one a class extension (`@interface Ledger ()`)
//   declares. A method of an `@implementation` takes the word a declaration
//   of it in the same file gives, else `public`.
// - `public`, `protected`, `private` or `package` for an instance variable,
//   as `@public` and the others set it: `protected` by default in an
//   interface, `private` in an implementation.
// A header exposes what it declares, except in a class extension: a header
// that holds one, such as `Ledger+Private.h`, is how a module hides that part
// of its interface from its callers. Nothing of a source file is exposed,
// because no file includes an `.m`. A C definition keeps C's own visibility.
//
// A class or category interface and its methods are declarations: their code
// is the `@implementation`, in the same file or in the header's pair, where a
// use of them leads (definition-site.ts). A property is no declaration, because
// the compiler writes its code, and a protocol's members are none either, since
// any class may hold their code.

import type { Node } from "web-tree-sitter";
import { cDefinitionsOf } from "@/runtime/code-facts/lib/c-definitions";
import type { Definition } from "@/runtime/code-facts/lib/facts";

/** Whether a file is a header, which other files include, or a source file. */
type ObjcRole = "header" | "source";

/** The class whose members a walk reads, and how it gives them their visibility. */
interface Holder {
	readonly symbol: string;
	readonly word: "public" | "private";
	readonly exposed: boolean;
	/** Whether its methods are declarations whose code is an `@implementation`. */
	readonly declares: boolean;
}

/** One walk of a file: its role and the definitions so far. */
interface Walk {
	readonly role: ObjcRole;
	readonly definitions: Definition[];
}

/** Nodes whose children are declarations at file scope. */
const FILE_SCOPES = new Set([
	"translation_unit",
	"preproc_if",
	"preproc_ifdef",
	"preproc_else",
	"preproc_elif",
	"preproc_elifdef",
	"declaration_list",
	"ERROR",
]);

/** Nodes inside a class, category, protocol or implementation whose children are members. */
const MEMBER_SCOPES = new Set([
	"preproc_if",
	"preproc_ifdef",
	"preproc_else",
	"preproc_elif",
	"preproc_elifdef",
	"qualified_protocol_interface_declaration",
	"implementation_definition",
	"ERROR",
]);

/** The words of `@public` and the others for an instance variable. */
const IVAR_WORDS: Readonly<Record<string, string>> = {
	"@public": "public",
	"@protected": "protected",
	"@private": "private",
	"@package": "package",
};

/**
 * Note one definition.
 * @param walk The walk.
 * @param symbol Its symbol.
 * @param extent The node it spans.
 * @param visibility Its word, and whether it is exposed.
 * @param visibility.word The word.
 * @param visibility.exposed Whether it is exposed.
 * @param kind Its definition kind.
 * @param declares Whether its code is elsewhere.
 */
function define(
	walk: Walk,
	symbol: string,
	extent: Node,
	visibility: { word: string; exposed: boolean },
	kind: Definition["kind"],
	declares = false,
): void {
	walk.definitions.push({
		symbol,
		kind,
		start: extent.startPosition.row + 1,
		end: extent.endPosition.row + 1,
		visibility: visibility.word,
		exposed: visibility.exposed,
		...(declares ? { declaration: true as const } : {}),
	});
}

/**
 * The name of a class, category, protocol or implementation: its first name
 * that is neither its superclass nor its category.
 * @param node The node.
 * @returns The name, or undefined.
 */
function ownName(node: Node): string | undefined {
	const others = new Set(
		[node.childForFieldName("superclass"), node.childForFieldName("category")].map(
			(each) => each?.id,
		),
	);
	return node.namedChildren.find((child) => child.type === "identifier" && !others.has(child.id))
		?.text;
}

/**
 * A method's selector as its declaration or definition spells it: each part
 * with `:` where a parameter follows, `post:by:`, or the one name, `balance`.
 * @param node The method declaration or definition.
 * @returns The selector.
 */
function selectorOf(node: Node): string {
	let selector = "";
	for (const child of node.namedChildren) {
		if (child.type === "identifier") selector += child.text;
		else if (child.type === "method_parameter") selector += ":";
	}
	return selector;
}

/**
 * The name one declarator declares, through pointers and parentheses.
 * @param node The declarator.
 * @returns The name, or undefined.
 */
function declaredName(node: Node): string | undefined {
	for (let at: Node | undefined = node; at !== undefined;) {
		if (at.type === "identifier" || at.type === "field_identifier") return at.text;
		at = at.childForFieldName("declarator") ?? at.namedChildren.at(-1);
	}
	return undefined;
}

/**
 * The names a property or an instance variable declares: `@property NSString *name, *alias;`.
 * @param node The property declaration or the instance variable.
 * @returns The names.
 */
function declaredNames(node: Node): string[] {
	const declaration = node.namedChildren.find((child) => child.type === "struct_declaration");
	return (declaration?.namedChildren ?? [])
		.filter((child) => child.type === "struct_declarator")
		.flatMap((child) => declaredName(child) ?? []);
}

/**
 * The instance variables in braces, with the visibility `@public` and the others set.
 * @param walk The walk.
 * @param holder Their class.
 * @param node The instance variables.
 * @param word Their word until a `@public` or another changes it.
 */
function instanceVariables(walk: Walk, holder: Holder, node: Node, word: string): void {
	let current = word;
	for (const variable of node.namedChildren) {
		const specification = variable.namedChildren.find(
			(child) => child.type === "visibility_specification",
		);
		if (specification !== undefined) current = IVAR_WORDS[specification.text] ?? current;
		for (const name of declaredNames(variable)) {
			const exposed = holder.exposed && current === "public";
			define(walk, `${holder.symbol}::${name}`, variable, { word: current, exposed }, "value");
		}
	}
}

/** Reads the members one kind of node holds. */
type MemberHandler = (walk: Walk, holder: Holder, node: Node) => void;

/**
 * Note one member of a class.
 * @param walk The walk.
 * @param holder Its class.
 * @param name Its name: a selector, or a property's name.
 * @param node What it spans.
 * @param declares Whether its code is elsewhere.
 */
function member(walk: Walk, holder: Holder, name: string, node: Node, declares = false): void {
	const visibility = { word: holder.word, exposed: holder.exposed };
	define(
		walk,
		`${holder.symbol}::${name}`,
		node,
		visibility,
		node.type === "property_declaration" ? "value" : "function",
		declares,
	);
}

/** How each kind of node inside a class, category, protocol or implementation is read. */
const MEMBERS: Readonly<Record<string, MemberHandler>> = {
	...Object.fromEntries([...MEMBER_SCOPES].map((type) => [type, members])),
	/**
	 * A method declared, whose code is the implementation's where its class declares.
	 * @param walk The walk.
	 * @param holder Its class.
	 * @param node The method declaration.
	 */
	method_declaration: (walk, holder, node) => {
		member(walk, holder, selectorOf(node), node, holder.declares);
	},
	/**
	 * A method with its code.
	 * @param walk The walk.
	 * @param holder Its class.
	 * @param node The method definition.
	 */
	method_definition: (walk, holder, node) => {
		member(walk, holder, selectorOf(node), node);
	},
	/**
	 * A property, one member for each name it declares.
	 * @param walk The walk.
	 * @param holder Its class.
	 * @param node The property declaration.
	 */
	property_declaration: (walk, holder, node) => {
		for (const name of declaredNames(node)) member(walk, holder, name, node);
	},
};

/**
 * The members of a class, category, protocol or implementation.
 * @param walk The walk.
 * @param holder Their class.
 * @param node The node that holds them.
 */
function members(walk: Walk, holder: Holder, node: Node): void {
	for (const child of node.namedChildren) MEMBERS[child.type]?.(walk, holder, child);
}

/** What the head of a class interface or implementation names. */
interface Head {
	readonly name: string;
	/** `Ledger` for a class, `Ledger(Audit)` for a category. */
	readonly symbol: string;
	/** A class extension, `@interface Ledger ()`, which names no category. */
	readonly extension: boolean;
}

/**
 * What the head of a class interface or implementation names.
 * @param node The class interface or implementation.
 * @returns Its class, symbol and whether it is an extension, or undefined when it names no class.
 */
function headOf(node: Node): Head | undefined {
	const name = ownName(node);
	if (name === undefined) return undefined;
	const category = node.childForFieldName("category")?.text;
	if (category !== undefined) return { name, symbol: `${name}(${category})`, extension: false };
	return { name, symbol: name, extension: node.children.some((child) => child.type === "(") };
}

/**
 * The instance variables of a class interface or implementation.
 * @param walk The walk.
 * @param holder Their class.
 * @param node The class interface or implementation.
 * @param word Their word until a `@public` or another changes it.
 */
function variablesOf(walk: Walk, holder: Holder, node: Node, word: string): void {
	for (const child of node.namedChildren) {
		if (child.type === "instance_variables") instanceVariables(walk, holder, child, word);
	}
}

/**
 * A class interface, a category or a class extension, and its members.
 * @param walk The walk.
 * @param node The class interface.
 */
function classInterface(walk: Walk, node: Node): void {
	const head = headOf(node);
	if (head === undefined) return;
	const exposed = walk.role === "header" && !head.extension;
	if (!head.extension)
		define(walk, head.symbol, node, { word: "@interface", exposed }, "class", true);
	const word = head.extension ? "private" : "public";
	const holder: Holder = { symbol: head.name, word, exposed, declares: true };
	variablesOf(walk, holder, node, "protected");
	members(walk, holder, node);
}

/**
 * A class's or a category's implementation, its methods and instance
 * variables, and the C between them.
 * @param walk The walk.
 * @param node The class implementation.
 */
function classImplementation(walk: Walk, node: Node): void {
	const head = headOf(node);
	if (head === undefined) return;
	const exposed = walk.role === "header";
	define(walk, head.symbol, node, { word: "@implementation", exposed }, "class");
	const holder: Holder = { symbol: head.name, word: "public", exposed, declares: false };
	variablesOf(walk, holder, node, "private");
	for (const child of node.namedChildren) {
		if (child.type === "implementation_definition") walk.definitions.push(...cDefinitionsOf(child));
	}
	members(walk, holder, node);
}

/**
 * A protocol and its members.
 * @param walk The walk.
 * @param node The protocol declaration.
 */
function protocol(walk: Walk, node: Node): void {
	const name = ownName(node);
	if (name === undefined) return;
	const exposed = walk.role === "header";
	define(walk, name, node, { word: "@protocol", exposed }, "class");
	members(walk, { symbol: name, word: "public", exposed, declares: false }, node);
}

/** How each kind of node at file scope is read. */
const FILE_SCOPE: Readonly<Record<string, (walk: Walk, node: Node) => void>> = {
	...Object.fromEntries([...FILE_SCOPES].map((type) => [type, fileScope])),
	/**
	 * An `extern "C"` block: what it holds.
	 * @param walk The walk.
	 * @param node The linkage specification.
	 */
	linkage_specification: (walk, node) => {
		const body = node.childForFieldName("body");
		if (body !== null) fileScope(walk, body);
	},
	class_interface: classInterface,
	class_implementation: classImplementation,
	protocol_declaration: protocol,
};

/**
 * Walk the declarations at file scope among a node's children.
 * @param walk The walk.
 * @param node A file, a preprocessor condition or an `extern "C"` block.
 */
function fileScope(walk: Walk, node: Node): void {
	for (const child of node.namedChildren) FILE_SCOPE[child.type]?.(walk, child);
}

/**
 * A method of an `@implementation` takes the word a declaration of it in the
 * same file gives it: `private` where a class extension declares it.
 * @param definitions The file's Objective-C definitions.
 * @returns The definitions, each implemented method with its declaration's word.
 */
function withDeclaredWord(definitions: readonly Definition[]): Definition[] {
	const declared = new Map<string, string>();
	for (const definition of definitions) {
		if (definition.declaration === true && !declared.has(definition.symbol)) {
			declared.set(definition.symbol, definition.visibility);
		}
	}
	return definitions.map((definition) => {
		const word = declared.get(definition.symbol);
		const implemented = definition.declaration !== true && definition.visibility === "public";
		return word === undefined || !implemented
			? definition
			: { ...definition, visibility: word, exposed: definition.exposed && word === "public" };
	});
}

/**
 * The Objective-C definitions of one parsed file, and the C definitions
 * inside its implementations; the C definitions elsewhere are the C walk's.
 * @param root The file's root node.
 * @param role Whether the file is a header or a source file.
 * @returns The definitions.
 */
function objcDefinitionsOf(root: Node, role: ObjcRole): Definition[] {
	const definitions: Definition[] = [];
	fileScope({ role, definitions }, root);
	return withDeclaredWord(definitions);
}

export { type ObjcRole, objcDefinitionsOf };
