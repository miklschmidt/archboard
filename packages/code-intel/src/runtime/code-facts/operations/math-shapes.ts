// The math a file writes on the names other files define (TASK-646.06,
// TASK-646.11), in any language whose syntax table this file is given: for
// each use at run time that arithmetic holds, the shape of that math, which
// module depth compares across the modules that read one export.
//
// The math is the largest arithmetic expression around the use: `+ - * / %`,
// `**` and `//` where the language has them, a unary sign, parentheses, and
// the math functions the language names, such as Python's `min` or C#'s
// `Math.Max`. Equality, comparison, bitwise and logical operators end it, and
// so does a `+` that joins text. The use is the chain of names it starts,
// with the `()` of a call that passes nothing, as a getter's is. Inside the
// shape the use is `@`, a number is its value and every other operand, the
// caller's own names among them, is `…`. The operands of `+`, `*` and of the
// math functions the table sorts, such as `min` and `max`, are sorted, so
// `a * b` and `b * a` have one shape. A use that a local variable holds whole,
// as `base = timing.RESTART_BASE` does, is followed once: the math around each
// later use of that variable is math on the name.
//
// Each language gives its table (`MathSyntax`): the syntax of its operations,
// calls, chains of names, numbers, text and local variables. Its adapter
// gives the uses: the names at run time that start a chain and that another
// file may define.

import type { Node } from "web-tree-sitter";
import type { Computation } from "#runtime/code-facts/operations/facts.ts";

/** A local variable, and the member of the use it takes, `""` for the whole use. */
type Local = readonly [Node, string];

/** The syntax of one language that the math is read through. */
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
	/** The callees, without white space, that are math functions. */
	readonly math: RegExp;
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

/** The operators of arithmetic every language has, by how tightly each binds. */
const BINDING: ReadonlyMap<string, number> = new Map([
	["+", 1],
	["-", 1],
	["*", 2],
	["/", 2],
	["%", 2],
]);

/** How tightly a sign, and an operand that is no operation, binds. */
const SIGN = 4;
const OPERAND = 5;

/** The operators whose operands can change places. */
const COMMUTATIVE = new Set(["+", "*"]);

/** What any operand that is not the use and no math shapes as. */
const OTHER = "…";

/** One part of a shape, and how tightly it binds. */
interface Shape {
	readonly text: string;
	readonly binding: number;
}

/** The use a shape is drawn around, and what it is written as. */
interface Focus {
	readonly node: Node;
	readonly text: string;
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

/** Reads the math of one language through its syntax table. */
class MathReader {
	readonly #syntax: MathSyntax;
	readonly #binding: ReadonlyMap<string, number>;

	/**
	 * A reader for one language.
	 * @param syntax The language's syntax table.
	 */
	constructor(syntax: MathSyntax) {
		this.#syntax = syntax;
		this.#binding = new Map([...BINDING, ...(syntax.operators ?? [])]);
	}

	/**
	 * The expression inside wrappers.
	 * @param node The expression.
	 * @returns The expression it holds, or itself.
	 */
	unwrapped(node: Node): Node {
		const inner = this.#syntax.wrappers.has(node.type) ? node.namedChildren[0] : undefined;
		return inner === undefined ? node : this.unwrapped(inner);
	}

	/**
	 * The math function a call runs.
	 * @param call The call.
	 * @returns Its name, such as `Math.min`, or undefined for another call.
	 */
	mathFunction(call: Node): string | undefined {
		const { call: syntax, math } = this.#syntax;
		const callee = call.type === syntax.type ? field(call, syntax.callee) : undefined;
		const name = callee?.text.replaceAll(/\s/gu, "") ?? "";
		return math.test(name) ? name : undefined;
	}

	/**
	 * The arguments of a call, each without what wraps it.
	 * @param call The call.
	 * @returns The arguments.
	 */
	argumentsOf(call: Node): Node[] {
		const list = field(call, this.#syntax.call.arguments);
		return (list?.namedChildren ?? []).flatMap((each) => {
			if (each.type === "comment") return [];
			if (each.type !== this.#syntax.argument) return [each];
			return each.namedChildren.at(-1) ?? [];
		});
	}

	/**
	 * Whether a side of a binary expression is text, which `+` joins.
	 * @param node The expression.
	 * @returns True when a side is.
	 */
	joinsText(node: Node): boolean {
		return [field(node, "left"), field(node, "right")].some(
			(side) => side !== undefined && this.#syntax.texts.has(this.unwrapped(side).type),
		);
	}

	/**
	 * The operator of a binary expression, when it is arithmetic on numbers.
	 * @param node The expression.
	 * @returns The operator, or undefined.
	 */
	arithmetic(node: Node): string | undefined {
		const operator = this.#syntax.binary.has(node.type) ? operatorOf(node) : "";
		if (!this.#binding.has(operator)) return undefined;
		return operator === "+" && this.joinsText(node) ? undefined : operator;
	}

	/**
	 * The sign of a unary expression.
	 * @param node The expression.
	 * @returns `-` or `+`, or undefined for anything else.
	 */
	sign(node: Node): string | undefined {
		const operator = this.#syntax.unary.has(node.type) ? operatorOf(node) : "";
		return /^[-+]$/u.test(operator) ? operator : undefined;
	}

	/**
	 * Whether syntax keeps math going around what it holds.
	 * @param node The syntax.
	 * @returns True for a wrapper, arithmetic or a sign.
	 */
	operation(node: Node): boolean {
		return (
			this.#syntax.wrappers.has(node.type) ||
			this.arithmetic(node) !== undefined ||
			this.sign(node) !== undefined
		);
	}

	/**
	 * The arguments of a call that hold an expression, through what wraps one argument.
	 * @param node What holds the expression.
	 * @returns The arguments, or the node itself.
	 */
	listOf(node: Node): Node {
		return node.type === this.#syntax.argument ? (node.parent ?? node) : node;
	}

	/**
	 * The call of a math function whose argument an expression is.
	 * @param node What holds the expression: the arguments, or what wraps one of them.
	 * @returns The call, or undefined.
	 */
	mathCallOf(node: Node): Node | undefined {
		const list = this.listOf(node);
		const call = list.parent;
		const listed = call !== null && holds(call, this.#syntax.call.arguments, list);
		return listed && this.mathFunction(call) !== undefined ? call : undefined;
	}

	/**
	 * The math that holds an expression, one step out.
	 * @param node The expression.
	 * @returns The parent that keeps the math going, or undefined where it ends.
	 */
	mathParent(node: Node): Node | undefined {
		const parent = node.parent;
		if (parent === null) return undefined;
		return this.operation(parent) ? parent : this.mathCallOf(parent);
	}

	/**
	 * The largest math around an expression.
	 * @param node The expression.
	 * @returns The math, or undefined when no arithmetic holds the expression.
	 */
	mathAround(node: Node): Node | undefined {
		let math: Node | undefined;
		for (let step = this.mathParent(node); step !== undefined; step = this.mathParent(step)) {
			if (!this.#syntax.wrappers.has(step.type)) math = step;
		}
		return math;
	}

	/**
	 * The operands of a commutative operator, its own nested uses flattened.
	 * @param node The expression.
	 * @param operator The operator.
	 * @returns The operands.
	 */
	chained(node: Node, operator: string): Node[] {
		const inner = this.unwrapped(node);
		if (this.arithmetic(inner) !== operator) return [inner];
		return [field(inner, "left"), field(inner, "right")].flatMap((side) =>
			side === undefined ? [] : this.chained(side, operator),
		);
	}

	/**
	 * The shape of a binary operation.
	 * @param node The operation.
	 * @param operator Its operator.
	 * @param focus The use.
	 * @returns Its shape.
	 */
	binaryShape(node: Node, operator: string, focus: Focus): Shape {
		const binding = this.#binding.get(operator) ?? OPERAND;
		if (COMMUTATIVE.has(operator)) {
			const operands = this.chained(node, operator).map((each) =>
				placed(this.shapeOf(each, focus), binding + 1),
			);
			return { text: operands.toSorted().join(` ${operator} `), binding };
		}
		const rightward = this.#syntax.rightward?.has(operator) === true;
		const least = rightward ? [binding + 1, binding] : [binding, binding + 1];
		const sides = [field(node, "left"), field(node, "right")].flatMap((side, index) =>
			side === undefined ? [] : [placed(this.shapeOf(side, focus), least[index] ?? binding)],
		);
		return { text: sides.join(` ${operator} `), binding };
	}

	/**
	 * The shape of an operation of the math.
	 * @param node The expression.
	 * @param focus The use.
	 * @returns Its shape, or undefined when the expression is no operation of the math.
	 */
	operationShape(node: Node, focus: Focus): Shape | undefined {
		const operator = this.arithmetic(node);
		if (operator !== undefined) return this.binaryShape(node, operator, focus);
		const sign = this.sign(node);
		if (sign !== undefined) {
			const argument = node.namedChildren.at(-1);
			const operand = argument === undefined ? OTHER : placed(this.shapeOf(argument, focus), SIGN);
			return { text: `${sign}${operand}`, binding: SIGN };
		}
		const math = this.mathFunction(node);
		if (math === undefined) return undefined;
		const shapes = this.argumentsOf(node).map((each) => this.shapeOf(each, focus).text);
		const ordered = this.#syntax.sorted.has(math) ? shapes.toSorted() : shapes;
		return { text: `${math}(${ordered.join(", ")})`, binding: OPERAND };
	}

	/**
	 * The shape of an operand that is no operation: a number as its value, so
	 * `30_000` and `30000` are one, and anything else as `…`.
	 * @param node The operand.
	 * @returns Its shape.
	 */
	operandShape(node: Node): Shape {
		if (!this.#syntax.numbers.has(node.type)) return { text: OTHER, binding: OPERAND };
		const value = Number(node.text.replaceAll("_", ""));
		return { text: Number.isNaN(value) ? node.text : String(value), binding: OPERAND };
	}

	/**
	 * The shape of an expression inside the math around a use.
	 * @param node The expression.
	 * @param focus The use.
	 * @returns Its shape.
	 */
	shapeOf(node: Node, focus: Focus): Shape {
		if (node.id === focus.node.id) return { text: focus.text, binding: OPERAND };
		const inner = this.unwrapped(node);
		if (inner.id !== node.id) return this.shapeOf(inner, focus);
		return this.operationShape(node, focus) ?? this.operandShape(node);
	}

	/**
	 * The chain of names a use starts, through `.`.
	 * @param name The name.
	 * @returns The chain's expression.
	 */
	chainOf(name: Node): Node {
		const { member } = this.#syntax;
		let chain = name;
		while (chain.parent?.type === member.type && holds(chain.parent, member.object, chain)) {
			chain = chain.parent;
		}
		return chain;
	}

	/**
	 * How the code spells a chain of names through `.`.
	 * @param chain The chain.
	 * @returns The spelling.
	 */
	spelled(chain: Node): string {
		const { member } = this.#syntax;
		const object = chain.type === member.type ? field(chain, member.object) : undefined;
		const property = chain.type === member.type ? field(chain, member.property) : undefined;
		return object === undefined || property === undefined
			? chain.text
			: `${this.spelled(object)}.${property.text}`;
	}

	/**
	 * Whether an expression reads on from what it holds: a member of it, or the
	 * call of it that passes nothing, as a getter's is.
	 * @param parent The expression.
	 * @param operand What it holds.
	 * @returns True when it does.
	 */
	readsOn(parent: Node, operand: Node): boolean {
		const { member, call } = this.#syntax;
		if (parent.type === member.type) return holds(parent, member.object, operand);
		const calls = parent.type === call.type && holds(parent, call.callee, operand);
		return calls && this.argumentsOf(parent).length === 0;
	}

	/**
	 * What a use reads: its chain of names, with a member or the call of a
	 * getter that the code adds to it.
	 * @param chain The chain of names.
	 * @returns The expression it reads.
	 */
	operandOf(chain: Node): Node {
		let operand = chain;
		while (operand.parent !== null && this.readsOn(operand.parent, operand)) {
			operand = operand.parent;
		}
		return operand;
	}

	/**
	 * The computation around one expression a use reads, if math holds it.
	 * @param symbol The chain of names the use reads.
	 * @param operand The expression.
	 * @param text What the shape writes for the expression.
	 * @returns The computation, or undefined.
	 */
	computed(symbol: string, operand: Node, text: string): Computation | undefined {
		const math = this.mathAround(operand);
		if (math === undefined) return undefined;
		const shape = this.shapeOf(math, { node: operand, text }).text;
		return { symbol, line: operand.startPosition.row + 1, shape };
	}

	/**
	 * The block a declaration's variables live in.
	 * @param declaration The declaration.
	 * @returns The block.
	 */
	scopeOf(declaration: Node): Node | undefined {
		let scope = declaration.parent;
		while (scope !== null && !this.#syntax.scopes.has(scope.type)) scope = scope.parent;
		return scope ?? undefined;
	}

	/**
	 * The math around each later use of the local variables that hold a use whole.
	 * @param symbol The chain of names the use reads.
	 * @param operand The expression the use reads.
	 * @param text What the shape writes for it.
	 * @returns The computations.
	 */
	throughLocals(symbol: string, operand: Node, text: string): Computation[] {
		let held = operand;
		while (held.parent !== null && this.#syntax.wrappers.has(held.parent.type)) held = held.parent;
		const declared = this.#syntax.declared(held);
		const scope = declared === undefined ? undefined : this.scopeOf(declared.at);
		if (declared === undefined || scope === undefined) return [];
		const after = declared.at.endIndex;
		return declared.locals.flatMap(([local, member]) =>
			scope
				.descendantsOfType("identifier")
				.filter((each) => each.text === local.text && each.startIndex > after)
				.flatMap((each) => {
					const read = this.operandOf(this.chainOf(each));
					return this.computed(symbol, read, `${text}${member}${added(read, each)}`) ?? [];
				}),
		);
	}
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
 * An operand, in parentheses where it binds less tightly than its place needs.
 * @param shape The operand.
 * @param least How tightly it must bind to go without them.
 * @returns Its text.
 */
function placed(shape: Shape, least: number): string {
	return shape.binding < least ? `(${shape.text})` : shape.text;
}

/**
 * What the code adds to an expression's start, without white space.
 * @param operand The expression.
 * @param start The start it adds to.
 * @returns The text after the start, such as `()` or `.restartBase`.
 */
function added(operand: Node, start: Node): string {
	return operand.text.slice(start.endIndex - operand.startIndex).replaceAll(/\s/gu, "");
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
	const reader = new MathReader(syntax);
	const found = new Map<string, Computation>();
	for (const name of uses) {
		const chain = reader.chainOf(name);
		const symbol = reader.spelled(chain);
		const operand = reader.operandOf(chain);
		const text = `@${added(operand, chain)}`;
		const direct = reader.computed(symbol, operand, text);
		const each = direct === undefined ? reader.throughLocals(symbol, operand, text) : [direct];
		for (const computation of each) {
			found.set(`${computation.symbol}\0${computation.line}\0${computation.shape}`, computation);
		}
	}
	return [...found.values()];
}

export { computationsOf, declaredBy, type Local, type MathSyntax };
