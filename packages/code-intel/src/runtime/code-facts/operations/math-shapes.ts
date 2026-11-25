// The math a file writes on the names other files define (TASK-646.06,
// TASK-646.11, TASK-646.12), for a language that describes its math in a
// table (`MathSyntax`): the node types and fields of its operations, calls,
// chains of names, numbers, text and local variables. The table is read
// through the grammar reading that every language shares (math-grammar.ts).
// Its adapter gives the uses: the names at run time that start a chain and
// that another file may define.
//
// A table can also name math functions called as methods of a number (Rust's
// `a.min(b)` is `min(a, b)`), a number's type suffix (`2u64` is `2`), and how
// a use's references spell it (`timing::PROCESS` is `timing.PROCESS`).

import type { Node } from "web-tree-sitter";
import type { Computation } from "#runtime/code-facts/operations/facts.ts";
import {
	computationsThrough,
	type Local,
	type MathCall,
	type MathGrammar,
	type Operation,
} from "#runtime/code-facts/operations/math-grammar.ts";

/** The syntax of one language that the math is read through, as node types and fields. */
interface MathSyntax {
	/** Binary operations, whose operator is their `operator` field. */
	readonly binary: ReadonlySet<string>;
	/** Unary operations, whose operator is their `operator` field or first token. */
	readonly unary: ReadonlySet<string>;
	/** Syntax that only wraps an expression: parentheses, and casts for the type checker. */
	readonly wrappers: ReadonlySet<string>;
	/** A call: its node type and the fields of its callee and its arguments. */
	readonly call: { readonly type: string; readonly callee: string; readonly arguments: string };
	/** What wraps one argument of a call, as C#'s `argument` does, if anything. */
	readonly argument?: string;
	/** A member read through `.`: its node type and the fields of its object and its name. */
	readonly member: { readonly type: string; readonly object: string; readonly property: string };
	/** The callees, without white space, that are math functions; a group `name` names one. */
	readonly math: RegExp;
	/** The math functions called as a method of a number, which is their first operand. */
	readonly methods?: ReadonlySet<string>;
	/** The type suffix a number may end with, which its value drops. */
	readonly suffix?: RegExp;
	/** How a use's references spell it, where that is not its text. */
	readonly spelling?: (use: Node) => string;
	/** The math functions whose arguments can change places. */
	readonly sorted: ReadonlySet<string>;
	/** Number literals, and how to read one: its value, or undefined to keep its text. */
	readonly numbers: ReadonlySet<string>;
	/** Text literals, which `+` joins. */
	readonly texts: ReadonlySet<string>;
	/** The arithmetic operators beside `+ - * / %`, such as `**` and `//`, with how tightly each binds. */
	readonly operators?: ReadonlyMap<string, number>;
	/** The operators that group to the right. */
	readonly rightward?: ReadonlySet<string>;
	/**
	 * The declaration whose whole value an expression is, and the local
	 * variables it fills with that value.
	 */
	readonly declared: (held: Node) => { readonly at: Node; readonly locals: Local[] } | undefined;
	/** The blocks a local variable is searched in. */
	readonly scopes: ReadonlySet<string>;
}

/**
 * A child of a node by its field.
 * @param node The node.
 * @param name The field.
 * @returns The child, or undefined.
 */
function field(node: Node, name: string): Node | undefined {
	return node.childForFieldName(name) ?? undefined;
}

/**
 * Whether a node holds another in one of its fields.
 * @param node The node.
 * @param name The field.
 * @param child The other node.
 * @returns True when it does.
 */
function holds(node: Node, name: string, child: Node): boolean {
	return field(node, name)?.id === child.id;
}

/**
 * The operator of an operation: its `operator` field, else its first token.
 * @param node The operation.
 * @returns The operator, or `""`.
 */
function operatorOf(node: Node): string {
	return field(node, "operator")?.type ?? node.child(0)?.type ?? "";
}

/**
 * The operation a binary or unary expression of a table is.
 * @param syntax The table.
 * @param node The expression.
 * @returns Its operator and operands, or undefined for another expression.
 */
function tableOperation(syntax: MathSyntax, node: Node): Operation | undefined {
	if (syntax.binary.has(node.type)) {
		const operands = ["left", "right"].flatMap((each) => field(node, each) ?? []);
		return { operator: operatorOf(node), operands };
	}
	const operand = syntax.unary.has(node.type) ? node.namedChildren.at(-1) : undefined;
	return operand === undefined ? undefined : { operator: operatorOf(node), operands: [operand] };
}

/**
 * The arguments of a call of a table, each without what wraps it.
 * @param syntax The table.
 * @param call The call.
 * @returns The arguments.
 */
function tableArguments(syntax: MathSyntax, call: Node): Node[] {
	const list = field(call, syntax.call.arguments);
	return (list?.namedChildren ?? []).flatMap((each) => {
		if (each.type === "comment") return [];
		return each.type === syntax.argument ? (each.namedChildren.at(-1) ?? []) : [each];
	});
}

/**
 * The math function a callee of a table calls as a method of a number.
 * @param syntax The table.
 * @param callee The callee.
 * @returns Its name, such as `min` for `a.min`, or undefined.
 */
function methodOf(syntax: MathSyntax, callee: Node): string | undefined {
	const { member, methods } = syntax;
	const name = callee.type === member.type ? field(callee, member.property)?.text : undefined;
	return name !== undefined && methods?.has(name) === true ? name : undefined;
}

/**
 * The call of a math function that a member read of a table names: its method.
 * @param syntax The table.
 * @param read The member read.
 * @returns The call, or undefined.
 */
function methodCall(syntax: MathSyntax, read: Node): Node | undefined {
	const call = read.parent;
	const calls = call?.type === syntax.call.type && holds(call, syntax.call.callee, read);
	return calls && methodOf(syntax, read) !== undefined ? call : undefined;
}

/**
 * The operands of a call of a math function: its receiver, for a method, and its arguments.
 * @param syntax The table.
 * @param call The call.
 * @param callee Its callee.
 * @returns The operands.
 */
function operandsOf(syntax: MathSyntax, call: Node, callee: Node): Node[] {
	const method = methodOf(syntax, callee) !== undefined;
	const receiver = method ? field(callee, syntax.member.object) : undefined;
	return [...(receiver === undefined ? [] : [receiver]), ...tableArguments(syntax, call)];
}

/**
 * The math function a callee of a table calls.
 * @param syntax The table.
 * @param callee The callee.
 * @returns Its name, such as `Math.min`, or undefined for another callee.
 */
function mathFunction(syntax: MathSyntax, callee: Node): string | undefined {
	const found = syntax.math.exec(callee.text.replaceAll(/\s/gu, ""));
	return found === null ? methodOf(syntax, callee) : (found.groups?.["name"] ?? found[0]);
}

/**
 * The call of a math function an expression of a table is.
 * @param syntax The table.
 * @param node The expression.
 * @returns The call, or undefined.
 */
function tableMathCall(syntax: MathSyntax, node: Node): MathCall | undefined {
	const callee = node.type === syntax.call.type ? field(node, syntax.call.callee) : undefined;
	if (callee === undefined) return undefined;
	const name = mathFunction(syntax, callee);
	return name === undefined ? undefined : { name, arguments: operandsOf(syntax, node, callee) };
}

/**
 * The arguments of a call that hold an expression, through what wraps one argument.
 * @param syntax The table.
 * @param holder What holds the expression.
 * @returns The arguments, or the holder itself.
 */
function listOf(syntax: MathSyntax, holder: Node): Node | null {
	return holder.type === syntax.argument ? holder.parent : holder;
}

/**
 * The call of a table whose argument or receiver an expression is, through what wraps one argument.
 * @param syntax The table.
 * @param argument The expression.
 * @returns The call, or undefined.
 */
function tableCallOf(syntax: MathSyntax, argument: Node): Node | undefined {
	const parent = argument.parent;
	if (parent === null) return undefined;
	const { member } = syntax;
	const receives = parent.type === member.type && holds(parent, member.object, argument);
	if (receives) return methodCall(syntax, parent);
	const list = listOf(syntax, parent);
	return list === null ? undefined : callHolding(syntax, list);
}

/**
 * The call of a table that holds a list of arguments.
 * @param syntax The table.
 * @param list The list.
 * @returns The call, or undefined when the list is no call's arguments.
 */
function callHolding(syntax: MathSyntax, list: Node): Node | undefined {
	const call = list.parent;
	return call !== null && holds(call, syntax.call.arguments, list) ? call : undefined;
}

/**
 * Whether a call of a table calls an expression and passes it nothing, as a getter's does.
 * @param syntax The table.
 * @param parent The call.
 * @param operand The expression.
 * @returns True when it does.
 */
function getterCall(syntax: MathSyntax, parent: Node, operand: Node): boolean {
	const { call } = syntax;
	const calls = parent.type === call.type && holds(parent, call.callee, operand);
	return calls && tableArguments(syntax, parent).length === 0;
}

/**
 * The expression that reads on from another in a table: a member of it, or
 * the call of it that passes nothing, as a getter's is.
 * @param syntax The table.
 * @param operand The expression.
 * @returns The reading expression, or undefined; a math method is no member read.
 */
function tableReadOn(syntax: MathSyntax, operand: Node): Node | undefined {
	const parent = operand.parent;
	if (parent === null) return undefined;
	const { member } = syntax;
	const readsMember = parent.type === member.type && holds(parent, member.object, operand);
	const reads = readsMember && methodCall(syntax, parent) === undefined;
	return reads || getterCall(syntax, parent, operand) ? parent : undefined;
}

/**
 * How a table spells the name that starts a chain.
 * @param syntax The table.
 * @param name The name.
 * @returns Its spelling, which is its text unless the table says otherwise.
 */
function spelled(syntax: MathSyntax, name: Node): string {
	return syntax.spelling?.(name) ?? name.text;
}

/**
 * How a table spells a chain of names through `.`.
 * @param syntax The table.
 * @param chain The chain.
 * @returns The spelling.
 */
function tableSpelled(syntax: MathSyntax, chain: Node): string {
	const { member } = syntax;
	const object = chain.type === member.type ? field(chain, member.object) : undefined;
	const property = chain.type === member.type ? field(chain, member.property) : undefined;
	if (object === undefined || property === undefined) return spelled(syntax, chain);
	return `${tableSpelled(syntax, object)}.${property.text}`;
}

/**
 * The block a declaration's variables live in.
 * @param syntax The table.
 * @param declaration The declaration.
 * @returns The block.
 */
function scopeOf(syntax: MathSyntax, declaration: Node): Node | undefined {
	let scope = declaration.parent;
	while (scope !== null && !syntax.scopes.has(scope.type)) scope = scope.parent;
	return scope ?? undefined;
}

/**
 * The later uses of each local variable of a table that holds an expression whole.
 * @param syntax The table.
 * @param operand The expression.
 * @returns Each later use and the member it takes.
 */
function tableLater(syntax: MathSyntax, operand: Node): Local[] {
	let held = operand;
	while (held.parent !== null && syntax.wrappers.has(held.parent.type)) held = held.parent;
	const declared = syntax.declared(held);
	const scope = declared === undefined ? undefined : scopeOf(syntax, declared.at);
	if (declared === undefined || scope === undefined) return [];
	const after = declared.at.endIndex;
	return declared.locals.flatMap(([local, member]) =>
		scope
			.descendantsOfType("identifier")
			.filter((each) => each.text === local.text && each.startIndex > after)
			.map((each) => [each, member] as const),
	);
}

/**
 * A number of a table: its value, so `30_000` and `30000` are one.
 * @param syntax The table.
 * @param node The expression.
 * @returns The value, or undefined for anything but a number.
 */
function tableNumber(syntax: MathSyntax, node: Node): string | undefined {
	if (!syntax.numbers.has(node.type)) return undefined;
	const digits = node.text.replaceAll("_", "");
	const value = Number(syntax.suffix === undefined ? digits : digits.replace(syntax.suffix, ""));
	return Number.isNaN(value) ? node.text : String(value);
}

/**
 * The reading of a language's math that its table describes.
 * @param syntax The table.
 * @returns The reading.
 */
function tableGrammar(syntax: MathSyntax): MathGrammar {
	return {
		/**
		 * The operation an expression is.
		 * @param node The expression.
		 * @returns Its operator and operands, or undefined.
		 */
		operation: (node) => tableOperation(syntax, node),
		/**
		 * The expression a wrapper holds.
		 * @param node The expression.
		 * @returns What it holds, or undefined for anything else.
		 */
		inner: (node) => (syntax.wrappers.has(node.type) ? node.namedChildren[0] : undefined),
		/**
		 * The call of a math function an expression is.
		 * @param node The expression.
		 * @returns The call, or undefined.
		 */
		mathCall: (node) => tableMathCall(syntax, node),
		/**
		 * The call an expression is an argument of.
		 * @param argument The expression.
		 * @returns The call, or undefined.
		 */
		callOf: (argument) => tableCallOf(syntax, argument),
		sorted: syntax.sorted,
		...(syntax.operators === undefined ? {} : { operators: syntax.operators }),
		...(syntax.rightward === undefined ? {} : { rightward: syntax.rightward }),
		/**
		 * A number's value.
		 * @param node The expression.
		 * @returns The value, or undefined for anything but a number.
		 */
		number: (node) => tableNumber(syntax, node),
		/**
		 * Whether an expression is text.
		 * @param node The expression.
		 * @returns True for a text literal.
		 */
		text: (node) => syntax.texts.has(node.type),
		/**
		 * The expression that reads on from another.
		 * @param operand The expression.
		 * @returns The reading expression, or undefined.
		 */
		readOn: (operand) => tableReadOn(syntax, operand),
		/**
		 * Whether an expression reads a member.
		 * @param expression The expression.
		 * @returns True for a member read.
		 */
		member: (expression) => expression.type === syntax.member.type,
		/**
		 * How a chain of names is spelled.
		 * @param chain The chain.
		 * @returns The spelling.
		 */
		spelled: (chain) => tableSpelled(syntax, chain),
		/**
		 * The later uses of the local variables that hold an expression whole.
		 * @param operand The expression.
		 * @returns Each use and the member it takes.
		 */
		later: (operand) => tableLater(syntax, operand),
	};
}

/**
 * The declaration of one name whose whole value an expression is, where the
 * declaration holds the name and the value in fields of its own.
 * @param held The expression.
 * @param syntax The declaration's node type and the fields of its value and its name.
 * @param syntax.type The declaration's node type.
 * @param syntax.value The field of its value.
 * @param syntax.name The field of its name.
 * @returns The declaration and its variable, or undefined.
 */
function declaredBy(
	held: Node,
	syntax: { readonly type: string; readonly value: string; readonly name: string },
): { readonly at: Node; readonly locals: Local[] } | undefined {
	const declaration = held.parent;
	if (declaration?.type !== syntax.type || !holds(declaration, syntax.value, held))
		return undefined;
	const name = field(declaration, syntax.name);
	return name?.type === "identifier" ? { at: declaration, locals: [[name, ""]] } : undefined;
}

/**
 * The math a file writes on the names other files define.
 * @param uses Each use at run time of such a name, at the name its chain starts with.
 * @param syntax The language's syntax table.
 * @returns The computations, each once.
 */
function computationsOf(uses: readonly Node[], syntax: MathSyntax): Computation[] {
	return computationsThrough(uses, tableGrammar(syntax));
}

export { computationsOf, declaredBy, type MathSyntax };
