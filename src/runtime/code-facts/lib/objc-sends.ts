// The message sends of an Objective-C file (ADR 0046, TASK-367.10), each a
// use of a method by its selector: `[ledger post:amount by:user]` uses
// `post:by:`, and `[ledger balance]` uses `balance`. A send is a call.
//
// A send is qualified by its receiver's class where the syntax shows the
// class, as the definitions qualify a method (`Ledger::post:by:`):
// - a class named as the receiver, `[Ledger ledgerNamed:name]`: a name that
//   starts with a capital letter and that no function around it declares;
// - `self`, the class of the `@implementation` around it;
// - a new object, `[[Ledger alloc] init]` and `[Ledger new]`;
// - a parameter or a local the function or method around it declares as a
//   pointer to a class, `Ledger *ledger`: the nearest declaration of the
//   name, which a block, a loop (`for (Audit *each in audits)`) and an
//   `@catch` may make. A name two branches of an `#if` declare as two classes
//   leaves the class unknown.
// Any other receiver, such as `super`, a property, an instance variable, `id`
// or a call's result, leaves the class unknown, and the send is spelled with
// the `.` alone, `.post:by:`, as C# and Swift spell a member of a value the
// code does not name. Its definition is the language server's to find
// (TASK-367.15). An `@selector(post:by:)` names a method with no receiver,
// spelled `.post:by:` too. A protocol another protocol adopts is used only as
// a type.

import type { Node } from "web-tree-sitter";
import type { Reference } from "@/runtime/code-facts/lib/facts";
import type { Spans } from "@/runtime/code-facts/lib/spans";

/** The selectors that make a new object of their receiver, a class. */
const CREATES = new Set(["alloc", "new", "allocWithZone:"]);

/** Type names that name no class. */
const NO_CLASS = new Set(["id", "instancetype", "Class"]);

/** Nodes in a block whose declarations are the block's: a `case`, and a preprocessor condition. */
const IN_BLOCK = new Set([
	"case_statement",
	"preproc_if",
	"preproc_ifdef",
	"preproc_else",
	"preproc_elif",
	"preproc_elifdef",
]);

/**
 * A send's selector: each method name with `:` where an argument follows.
 * @param send The message expression.
 * @returns The selector.
 */
function sentSelector(send: Node): string {
	const methods = new Set(send.childrenForFieldName("method").map((each) => each.id));
	let selector = "";
	for (const child of send.children) {
		if (methods.has(child.id)) selector += child.text;
		else if (child.type === ":") selector += ":";
	}
	return selector;
}

/**
 * Whether a declarator declares a pointer, `*ledger`, past an initializer.
 * @param declarator The declarator.
 * @returns True when it does.
 */
function isPointer(declarator: Node): boolean {
	const inner =
		declarator.type === "init_declarator" ? declarator.childForFieldName("declarator") : declarator;
	return inner?.type === "pointer_declarator";
}

/**
 * The name a declarator declares, past a pointer and an initializer.
 * @param declarator The declarator.
 * @returns The name, or undefined.
 */
function nameOf(declarator: Node): string | undefined {
	for (let at: Node | null = declarator; at !== null; at = at.childForFieldName("declarator")) {
		if (at.type === "identifier") return at.text;
	}
	return undefined;
}

/** What a function declares of a name: the class it points to, if a class. */
interface Declared {
	readonly className: string | undefined;
}

/**
 * The class a declaration's type names, where it declares a pointer to one.
 * @param type The declaration's type.
 * @param pointer Whether it declares a pointer.
 * @returns The class, or undefined.
 */
function classOfType(type: Node | null, pointer: boolean): string | undefined {
	if (type?.type !== "type_identifier" || !pointer || NO_CLASS.has(type.text)) return undefined;
	return type.text;
}

/**
 * What a declaration or a parameter declaration declares of a name.
 * @param node The declaration.
 * @param name The name.
 * @returns What it declares, or undefined when it does not declare the name.
 */
function declaredIn(node: Node, name: string): Declared | undefined {
	for (const declarator of node.childrenForFieldName("declarator")) {
		if (nameOf(declarator) === name) {
			return { className: classOfType(node.childForFieldName("type"), isPointer(declarator)) };
		}
	}
	return undefined;
}

/**
 * The first answer a search of each item finds, in order.
 * @param items The items.
 * @param find Searches one.
 * @returns The first answer, or undefined.
 */
function firstFound<T>(items: readonly Node[], find: (item: Node) => T | undefined): T | undefined {
	for (const item of items) {
		const found = find(item);
		if (found !== undefined) return found;
	}
	return undefined;
}

/**
 * What a type and the declarator beside it declare of a name, as a loop
 * variable or an `@catch` parameter does: `Audit *each`.
 * @param type The type.
 * @param declarator The declarator.
 * @param name The name.
 * @returns What it declares, or undefined when it declares another name.
 */
function declaredBeside(
	type: Node | null,
	declarator: Node | null | undefined,
	name: string,
): Declared | undefined {
	if (declarator === null || declarator === undefined || nameOf(declarator) !== name) {
		return undefined;
	}
	return { className: classOfType(type, isPointer(declarator)) };
}

/**
 * The declarations of a block, in order, with those under a `case` or a
 * preprocessor condition in it.
 * @param block The block, or a node in it.
 * @returns The declarations.
 */
function blockDeclarations(block: Node): Node[] {
	return block.namedChildren.flatMap((child) => {
		if (child.type === "declaration") return [child];
		return IN_BLOCK.has(child.type) ? blockDeclarations(child) : [];
	});
}

/**
 * What a block's declarations before a send say of a name: the class they
 * agree on, or none where two branches of a condition declare it as two.
 * @param block The block.
 * @param name The name.
 * @param before The send's offset.
 * @returns What they declare, or undefined when none declares the name.
 */
function blockDeclares(block: Node, name: string, before: number): Declared | undefined {
	const found = blockDeclarations(block)
		.filter((declaration) => declaration.startIndex < before)
		.flatMap((declaration) => declaredIn(declaration, name) ?? []);
	const [first] = found;
	if (first === undefined) return undefined;
	return found.every((each) => each.className === first.className)
		? first
		: { className: undefined };
}

/**
 * The class a method's parameter points to: `(Ledger *)ledger`.
 * @param parameter The method parameter.
 * @returns The class, or undefined.
 */
function parameterClass(parameter: Node): string | undefined {
	const type = parameter.namedChildren
		.find((child) => child.type === "method_type")
		?.namedChildren.find((child) => child.type === "type_name");
	const pointer = type?.namedChildren.some((child) => child.type === "abstract_pointer_declarator");
	return classOfType(type?.namedChildren[0] ?? null, pointer === true);
}

/**
 * What a method's parameter declares of a name.
 * @param parameter The method parameter.
 * @param name The name.
 * @returns What it declares, or undefined when it is another name.
 */
function parameterDeclares(parameter: Node, name: string): Declared | undefined {
	const own = parameter.namedChildren.findLast((child) => child.type === "identifier");
	return own?.text === name ? { className: parameterClass(parameter) } : undefined;
}

/**
 * The parameters of a function.
 * @param node The function definition.
 * @returns Its parameter declarations.
 */
function functionParameters(node: Node): Node[] {
	let declarator = node.childForFieldName("declarator");
	while (declarator !== null && declarator.type !== "function_declarator") {
		declarator = declarator.childForFieldName("declarator");
	}
	return declarator?.childForFieldName("parameters")?.namedChildren ?? [];
}

/** What one kind of node around a send declares of a name. */
type Declares = (around: Node, name: string, before: number) => Declared | undefined;

/**
 * Where each kind of node around a send declares names: a statement block
 * before the send, a loop's variable, an `@catch` parameter, and a method's,
 * a function's or a block's parameters.
 */
const DECLARES: Readonly<Record<string, Declares>> = {
	compound_statement: blockDeclares,
	/**
	 * A loop's variable: `for (Ledger *each = first; ...)` or `for (Ledger *each in all)`.
	 * @param around The loop.
	 * @param name The name.
	 * @returns What the loop declares of the name.
	 */
	for_statement: (around, name) => {
		const initializer = around.childForFieldName("initializer");
		if (initializer?.type === "declaration") return declaredIn(initializer, name);
		const type = around.childForFieldName("type");
		return declaredBeside(type, type?.nextNamedSibling, name);
	},
	/**
	 * An `@catch` parameter: `@catch (NSException *error)`.
	 * @param around The catch clause.
	 * @param name The name.
	 * @returns What the parameter declares of the name.
	 */
	catch_clause: (around, name) => {
		const parameter = around.namedChildren.find((child) => child.type === "type_name");
		const [type, declarator] = parameter?.namedChildren ?? [];
		return declaredBeside(type ?? null, declarator, name);
	},
	/**
	 * A method's parameters.
	 * @param around The method.
	 * @param name The name.
	 * @returns What the parameter of the name says.
	 */
	method_definition: (around, name) =>
		firstFound(
			around.namedChildren.filter((child) => child.type === "method_parameter"),
			(parameter) => parameterDeclares(parameter, name),
		),
	/**
	 * A function's parameters.
	 * @param around The function.
	 * @param name The name.
	 * @returns What the parameter of the name says.
	 */
	function_definition: (around, name) =>
		firstFound(functionParameters(around), (parameter) => declaredIn(parameter, name)),
	/**
	 * A block's parameters.
	 * @param around The block.
	 * @param name The name.
	 * @returns What the parameter of the name says.
	 */
	block_literal: (around, name) =>
		firstFound(
			around.namedChildren.find((child) => child.type === "parameter_list")?.namedChildren ?? [],
			(parameter) => declaredIn(parameter, name),
		),
};

/**
 * What the functions around a send declare of a name, the innermost first.
 * @param send The send.
 * @param name The name.
 * @returns What the nearest declaration says, or undefined when none declares it.
 */
function declaredFor(send: Node, name: string): Declared | undefined {
	for (let around = send.parent; around !== null; around = around.parent) {
		const found = DECLARES[around.type]?.(around, name, send.startIndex);
		if (found !== undefined) return found;
	}
	return undefined;
}

/**
 * The class of the `@implementation` around a node.
 * @param node The node.
 * @returns The class's name, or undefined.
 */
function implementedClass(node: Node): string | undefined {
	for (let around = node.parent; around !== null; around = around.parent) {
		if (around.type === "class_implementation") {
			const others = new Set([around.childForFieldName("category")?.id]);
			return around.namedChildren.find(
				(child) => child.type === "identifier" && !others.has(child.id),
			)?.text;
		}
	}
	return undefined;
}

/**
 * The class a receiver named by a name is, or is an object of: the class of
 * `self`, the class a function around declares it to point to, or a class
 * named, which starts with a capital letter.
 * @param name The receiver's name.
 * @param send The send it receives.
 * @returns The class, or undefined.
 */
function namedClass(name: string, send: Node): string | undefined {
	if (name === "self") return implementedClass(send);
	const declared = name === "super" ? { className: undefined } : declaredFor(send, name);
	if (declared !== undefined) return declared.className;
	return /^[A-Z]/u.test(name) ? name : undefined;
}

/**
 * The class a receiver is, or is an object of, where the syntax shows it.
 * @param receiver The receiver.
 * @param send The send it receives.
 * @returns The class, or undefined.
 */
function receiverClass(receiver: Node | null, send: Node): string | undefined {
	if (receiver?.type === "identifier") return namedClass(receiver.text, send);
	if (receiver?.type !== "message_expression" || !CREATES.has(sentSelector(receiver))) {
		return undefined;
	}
	return receiverClass(receiver.childForFieldName("receiver"), receiver);
}

/**
 * One send as a use of its method.
 * @param send The message expression.
 * @returns The reference.
 */
function sendOf(send: Node): Reference {
	const selector = sentSelector(send);
	const className = receiverClass(send.childForFieldName("receiver"), send);
	const method = send.childrenForFieldName("method")[0] ?? send;
	return {
		symbol: className === undefined ? `.${selector}` : `${className}::${selector}`,
		line: method.startPosition.row + 1,
		via: "code",
		kind: "call",
		typeOnly: false,
	};
}

/**
 * An `@selector(post:by:)` as a use of the method it names.
 * @param node The selector expression.
 * @returns The reference, or undefined when it names none.
 */
function selectorUse(node: Node): Reference | undefined {
	const selector = /^@selector\s*\(+([^)]*)\)+$/u.exec(node.text)?.[1]?.replaceAll(/\s+/gu, "");
	if (selector === undefined || selector === "") return undefined;
	return {
		symbol: `.${selector}`,
		line: node.startPosition.row + 1,
		via: "code",
		kind: "call",
		typeOnly: false,
	};
}

/** The captures the sends are read from. */
interface SendCaptures {
	readonly send: readonly Node[];
	readonly selector: readonly Node[];
	readonly protocol: readonly Node[];
}

/**
 * The uses of methods and protocols of one file, outside code that did not parse.
 * @param captured The sends, selector expressions and adopted protocols.
 * @param unparsed The code that did not parse.
 * @returns The references.
 */
function sendReferences(captured: SendCaptures, unparsed: Spans): Reference[] {
	/**
	 * Whether a capture lies outside code that did not parse.
	 * @param node The capture.
	 * @returns True when it does.
	 */
	const parsed = (node: Node) => !unparsed.holds(node.startIndex);
	return [
		...captured.send.filter(parsed).map(sendOf),
		...captured.selector.filter(parsed).flatMap((node) => selectorUse(node) ?? []),
		...captured.protocol.filter(parsed).map((node): Reference => ({
			symbol: node.text,
			line: node.startPosition.row + 1,
			via: "code",
			kind: "import",
			typeOnly: true,
		})),
	];
}

export { type SendCaptures, sendReferences };
