// What module depth reads of C# code (TASK-646.11): the math a file writes
// around the names other files define, through C#'s syntax table, and what a
// declaration's syntax says of its depth.
//
// - An interface, an enum and a delegate declare a type alone.
// - A `static` or `const` member belongs to its type, and callers read it
//   through the type's name, as they read a module-level name elsewhere.
// - A property with a body (`=> expression`, or an accessor with a block) is
//   a getter, a function; one without is a value.
// - A constructor is called by C# itself, and so are the methods that C#'s
//   statements and `object` call by their name: an `override` of `ToString`,
//   `Equals` or `GetHashCode`, and `Dispose`, `DisposeAsync`, `GetEnumerator`,
//   `GetAsyncEnumerator`, `Deconstruct` and `GetAwaiter`.
// - A method passes its call on when its body is one call, returned or made,
//   that hands every argument straight from its own parameters, and one at
//   least. Its callee is a name or a chain of names from one, `this` or
//   `base`, whose first name the fact keeps.

import type { Node } from "web-tree-sitter";
import type { Definition } from "#runtime/code-facts/operations/facts.ts";
import type { Local } from "#runtime/code-facts/operations/math-grammar.ts";
import type { MathSyntax } from "#runtime/code-facts/operations/math-shapes.ts";

/**
 * The name a declarator declares, where the value it holds is the declarator's last part.
 * @param declarator The declarator.
 * @param held The value.
 * @returns The name, or undefined.
 */
function nameFor(declarator: Node, held: Node): Node | undefined {
	const name = declarator.childForFieldName("name") ?? undefined;
	const whole = declarator.lastNamedChild?.id === held.id;
	return whole && name?.id !== held.id ? name : undefined;
}

/**
 * The variable a declarator fills with a whole value: `var b = Durations.RestartBase`.
 * @param held The value.
 * @returns The declarator and its variable, or undefined.
 */
function declared(held: Node): { readonly at: Node; readonly locals: Local[] } | undefined {
	const declarator = held.parent;
	if (declarator?.type !== "variable_declarator") return undefined;
	const name = nameFor(declarator, held);
	return name === undefined ? undefined : { at: declarator, locals: [[name, ""]] };
}

/** C#'s syntax, as the math is read through it. */
const CSHARP_MATH: MathSyntax = {
	binary: new Set(["binary_expression"]),
	unary: new Set(["prefix_unary_expression"]),
	wrappers: new Set(["parenthesized_expression"]),
	call: { type: "invocation_expression", callee: "function", arguments: "arguments" },
	argument: "argument",
	member: { type: "member_access_expression", object: "expression", property: "name" },
	math: /^(?:System\.)?MathF?\.\w+$/u,
	sorted: new Set([
		"Math.Min",
		"Math.Max",
		"MathF.Min",
		"MathF.Max",
		"System.Math.Min",
		"System.Math.Max",
	]),
	numbers: new Set(["integer_literal", "real_literal"]),
	texts: new Set([
		"string_literal",
		"verbatim_string_literal",
		"raw_string_literal",
		"interpolated_string_expression",
	]),
	declared,
	scopes: new Set(["block", "compilation_unit"]),
};

/** The declarations of a type alone, which a caller neither runs nor reads. */
const TYPES = new Set(["interface_declaration", "enum_declaration", "delegate_declaration"]);

/** The methods `object` declares that C# calls itself, where a type overrides them. */
const OVERRIDDEN = new Set(["ToString", "Equals", "GetHashCode"]);

/** The methods C#'s statements call by their name: `using`, `foreach`, deconstruction, `await`. */
const PATTERNS = new Set([
	"Dispose",
	"DisposeAsync",
	"GetEnumerator",
	"GetAsyncEnumerator",
	"Deconstruct",
	"GetAwaiter",
]);

/**
 * The modifiers a declaration writes.
 * @param node The declaration.
 * @returns Them.
 */
function modifiersOf(node: Node): Set<string> {
	return new Set(
		node.namedChildren.filter((child) => child.type === "modifier").map((child) => child.text),
	);
}

/**
 * Whether C# calls a member itself.
 * @param node The member's declaration.
 * @param name Its name.
 * @param modifiers Its modifiers.
 * @returns True for a constructor and the methods C# calls by their name.
 */
function calledByCSharp(node: Node, name: string, modifiers: ReadonlySet<string>): boolean {
	if (node.type === "constructor_declaration") return true;
	if (node.type !== "method_declaration") return false;
	return PATTERNS.has(name) || (OVERRIDDEN.has(name) && modifiers.has("override"));
}

/**
 * Whether a property has a body, and so is a getter: `=> expression`, or an
 * accessor with a block or an expression.
 * @param node The declaration.
 * @returns True for a property with a body.
 */
function getter(node: Node): boolean {
	if (node.type !== "property_declaration") return false;
	if (node.childForFieldName("value")?.type === "arrow_expression_clause") return true;
	const accessors = node.childForFieldName("accessors")?.namedChildren ?? [];
	return accessors.some((accessor) => accessor.childForFieldName("body") !== null);
}

/**
 * The named children of a node that are no comment.
 * @param node The node.
 * @returns The children.
 */
function codeOf(node: Node): Node[] {
	return node.namedChildren.filter((child) => child.type !== "comment");
}

/** Wrappers that hand on the value of the expression inside. */
const UNWRAPPED = new Set(["await_expression", "parenthesized_expression"]);

/**
 * The one expression a method's body returns or makes, without `await` or parentheses.
 * @param body The body.
 * @returns The expression, or undefined.
 */
function bodyExpression(body: Node): Node | undefined {
	const statements = body.type === "block" ? codeOf(body) : [body];
	const only = statements.length === 1 ? statements[0] : undefined;
	let expression = only === undefined ? undefined : codeOf(only)[0];
	while (expression !== undefined && UNWRAPPED.has(expression.type)) {
		expression = codeOf(expression)[0];
	}
	return expression;
}

/**
 * Whether an argument comes straight from a parameter.
 * @param argument The argument.
 * @param parameters The parameters.
 * @returns True for a parameter, named or not.
 */
function passed(argument: Node, parameters: ReadonlySet<string>): boolean {
	const value = codeOf(argument).at(-1);
	return value?.type === "identifier" && value.id !== argument.childForFieldName("name")?.id
		? parameters.has(value.text)
		: false;
}

/**
 * The root of a callee that is a name or a chain of names from a name, `this` or `base`.
 * @param callee The callee.
 * @returns The root, or undefined for any other callee.
 */
function calleeRoot(callee: Node | null): string | undefined {
	if (callee === null) return undefined;
	if (["identifier", "this", "base"].includes(callee.type)) return callee.text;
	if (callee.type !== "member_access_expression") return undefined;
	return calleeRoot(callee.childForFieldName("expression") ?? callee.child(0));
}

/**
 * The names of a method's parameters.
 * @param method The method.
 * @returns The names.
 */
function parametersOf(method: Node): Set<string> {
	const list = method.childForFieldName("parameters");
	return new Set(
		(list === null ? [] : codeOf(list)).flatMap(
			(parameter) => parameter.childForFieldName("name")?.text ?? [],
		),
	);
}

/**
 * The root of the callee a method only passes its call on to.
 * @param method The method.
 * @returns The root, or undefined when it decides something.
 */
function passesTo(method: Node): string | undefined {
	const body = method.type === "method_declaration" ? method.childForFieldName("body") : null;
	const call = body === null ? undefined : bodyExpression(body);
	if (call?.type !== "invocation_expression" || !passesParameters(call, method)) return undefined;
	return calleeRoot(call.childForFieldName("function"));
}

/**
 * Whether a call hands on every argument straight from a method's
 * parameters, and one at least.
 * @param call The call.
 * @param method The method.
 * @returns True when it does.
 */
function passesParameters(call: Node, method: Node): boolean {
	const list = call.childForFieldName("arguments");
	const args = list === null ? [] : codeOf(list);
	const parameters = parametersOf(method);
	return args.length > 0 && args.every((each) => passed(each, parameters));
}

/**
 * What a declaration's syntax says of its depth beside its kind.
 * @param node The declaration.
 * @param name The name it declares.
 * @returns Those that hold.
 */
function depthTraits(
	node: Node,
	name: string,
): Pick<Definition, "type" | "static" | "passes" | "calledByLanguage"> {
	const modifiers = modifiersOf(node);
	const passes = passesTo(node);
	const shared = modifiers.has("static") || modifiers.has("const");
	return {
		...(TYPES.has(node.type) ? { type: true as const } : {}),
		...(shared ? { static: true as const } : {}),
		...(passes === undefined ? {} : { passes }),
		...(calledByCSharp(node, name, modifiers) ? { calledByLanguage: true as const } : {}),
	};
}

export { CSHARP_MATH, depthTraits, getter };
