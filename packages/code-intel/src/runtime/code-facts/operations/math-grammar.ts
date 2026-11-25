// The math a file writes on the names other files define (TASK-646.06,
// TASK-646.11, TASK-646.12), read through a grammar: for each use at run time
// that arithmetic holds, the shape of that math, which module depth compares
// across the modules that read one export.
//
// The math is the largest arithmetic expression around the use: `+ - * / %`,
// `**` and `//` where the language has them, a unary sign, parentheses, and
// the math functions the language names, such as Python's `min` or C#'s
// `Math.Max`. Equality, comparison, bitwise and logical operators end it, and
// so does a `+` that joins text. The use is the chain of names it starts,
// with the `()` of a call that passes nothing, as a getter's is. Inside the
// shape the use is `@`, a number is its value and every other operand, the
// caller's own names among them, is `…`. The operands of `+`, `*` and of the
// math functions the language sorts, such as `min` and `max`, are sorted, so
// `a * b` and `b * a` have one shape. A use that a local variable holds whole,
// as `base = timing.RESTART_BASE` does, is followed once: the math around each
// later use of that variable is math on the name.
//
// Every language but Swift describes its math in a table (math-shapes.ts),
// which reads it through this file. A grammar whose tree a table cannot
// describe, as Swift's, which nests a call's arguments and a member's name,
// gives its reading whole (`MathGrammar`).

import type { Node } from "web-tree-sitter";
import type { Computation } from "#runtime/code-facts/operations/facts.ts";

/** A local variable, and the member of the use it takes, `""` for the whole use. */
type Local = readonly [Node, string];

/** An operation of arithmetic: its operator and its one or two operands. */
interface Operation {
	readonly operator: string;
	readonly operands: readonly Node[];
}

/** A call of a math function: its name as the shape writes it, and its arguments. */
interface MathCall {
	readonly name: string;
	readonly arguments: readonly Node[];
}

/** How a grammar's math is read, where a table cannot describe its tree. */
interface MathGrammar {
	/** The operation an expression is, binary or unary, or undefined. */
	readonly operation: (node: Node) => Operation | undefined;
	/** The expression that parentheses or a cast hold, or undefined for anything else. */
	readonly inner: (node: Node) => Node | undefined;
	/** The call of a math function an expression is, or undefined. */
	readonly mathCall: (node: Node) => MathCall | undefined;
	/** The call an expression is an argument of, or undefined. */
	readonly callOf: (argument: Node) => Node | undefined;
	/** The math functions whose arguments can change places. */
	readonly sorted: ReadonlySet<string>;
	/** The arithmetic operators beside `+ - * / %`, with how tightly each binds. */
	readonly operators?: ReadonlyMap<string, number>;
	/** The operators that group to the right. */
	readonly rightward?: ReadonlySet<string>;
	/** A number's value as the shape writes it, or undefined for anything else. */
	readonly number: (node: Node) => string | undefined;
	/** Whether an expression is text, which `+` joins. */
	readonly text: (node: Node) => boolean;
	/** The expression that reads a member of another, or calls it with nothing, or undefined. */
	readonly readOn: (operand: Node) => Node | undefined;
	/** Whether an expression reads a member, so it is part of a chain of names. */
	readonly member: (expression: Node) => boolean;
	/** How a chain of names is spelled, as the language's references spell it. */
	readonly spelled: (chain: Node) => string;
	/**
	 * The later uses of each local variable that holds an expression whole,
	 * each with the member of the expression it takes.
	 */
	readonly later: (operand: Node) => readonly Local[];
	/**
	 * Whether the grammar reads a call that passes nothing after the math that
	 * ends with an expression, rather than as the expression's own: so
	 * tree-sitter-swift reads `1 + n * jitter()`.
	 */
	readonly calledAfter?: (operand: Node) => boolean;
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

/** The use a shape is drawn around, what it is written as, and the grammar. */
interface Focus {
	readonly grammar: MathGrammar;
	readonly node: Node;
	readonly text: string;
}

/**
 * How tightly an operator of arithmetic binds.
 * @param grammar The grammar.
 * @param operator The operator.
 * @returns How tightly, or undefined for an operator that is no arithmetic.
 */
function bindingOf(grammar: MathGrammar, operator: string): number | undefined {
	return grammar.operators?.get(operator) ?? BINDING.get(operator);
}

/**
 * The expression inside any parentheses or casts.
 * @param grammar The grammar.
 * @param node The expression.
 * @returns The expression they hold, or itself.
 */
function unwrapped(grammar: MathGrammar, node: Node): Node {
	const inner = grammar.inner(node);
	return inner === undefined ? node : unwrapped(grammar, inner);
}

/**
 * Whether a binary operation is arithmetic on numbers: no `+` that joins text.
 * @param grammar The grammar.
 * @param found The operation.
 * @returns True when it is.
 */
function onNumbers(grammar: MathGrammar, found: Operation): boolean {
	if (bindingOf(grammar, found.operator) === undefined) return false;
	const joins = found.operands.some((each) => grammar.text(unwrapped(grammar, each)));
	return found.operator !== "+" || !joins;
}

/**
 * The arithmetic an expression is: a binary operation of arithmetic on
 * numbers, or a sign.
 * @param grammar The grammar.
 * @param node The expression.
 * @returns The operation, or undefined.
 */
function arithmetic(grammar: MathGrammar, node: Node): Operation | undefined {
	const found = grammar.operation(node);
	if (found === undefined) return undefined;
	const sign = found.operands.length === 1;
	const keeps = sign ? /^[-+]$/u.test(found.operator) : onNumbers(grammar, found);
	return keeps ? found : undefined;
}

/**
 * The math that holds an expression, one step out.
 * @param grammar The grammar.
 * @param node The expression.
 * @returns The parent that keeps the math going, or undefined where the math ends.
 */
function mathParent(grammar: MathGrammar, node: Node): Node | undefined {
	const parent = node.parent;
	if (parent !== null && (grammar.inner(parent) !== undefined || arithmetic(grammar, parent))) {
		return parent;
	}
	const call = grammar.callOf(node);
	return call !== undefined && grammar.mathCall(call) !== undefined ? call : undefined;
}

/**
 * The largest math around an expression.
 * @param grammar The grammar.
 * @param node The expression.
 * @returns The math, or undefined when no arithmetic holds the expression.
 */
function mathAround(grammar: MathGrammar, node: Node): Node | undefined {
	let math: Node | undefined;
	for (let step = mathParent(grammar, node); step !== undefined; step = mathParent(grammar, step)) {
		if (grammar.inner(step) === undefined) math = step;
	}
	return math;
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
 * The operands of a commutative operator, its own nested uses flattened.
 * @param grammar The grammar.
 * @param node The expression.
 * @param operator The operator.
 * @returns The operands.
 */
function chained(grammar: MathGrammar, node: Node, operator: string): Node[] {
	const inner = unwrapped(grammar, node);
	const found = arithmetic(grammar, inner);
	if (found?.operator !== operator || found.operands.length !== 2) return [inner];
	return found.operands.flatMap((each) => chained(grammar, each, operator));
}

/**
 * The shape of a sign.
 * @param found The sign.
 * @param focus The use.
 * @returns Its shape.
 */
function signShape(found: Operation, focus: Focus): Shape {
	const [operand] = found.operands;
	const text = operand === undefined ? OTHER : placed(shapeOf(operand, focus), SIGN);
	return { text: `${found.operator}${text}`, binding: SIGN };
}

/**
 * The shape of a binary operation of arithmetic.
 * @param found The operation.
 * @param node Its expression.
 * @param focus The use.
 * @returns Its shape.
 */
function binaryShape(found: Operation, node: Node, focus: Focus): Shape {
	const { operator, operands } = found;
	const { grammar } = focus;
	const binding = bindingOf(grammar, operator) ?? OPERAND;
	if (COMMUTATIVE.has(operator)) {
		const each = chained(grammar, node, operator).map((operand) =>
			placed(shapeOf(operand, focus), binding + 1),
		);
		return { text: each.toSorted().join(` ${operator} `), binding };
	}
	const least = grammar.rightward?.has(operator) === true ? [1, 0] : [0, 1];
	const sides = operands.map((operand, index) =>
		placed(shapeOf(operand, focus), binding + (least[index] ?? 0)),
	);
	return { text: sides.join(` ${operator} `), binding };
}

/**
 * The shape of an operation of arithmetic: a sign or a binary operation.
 * @param found The operation.
 * @param node Its expression.
 * @param focus The use.
 * @returns Its shape.
 */
function operationShape(found: Operation, node: Node, focus: Focus): Shape {
	return found.operands.length === 1 ? signShape(found, focus) : binaryShape(found, node, focus);
}

/**
 * The shape of a call of a math function.
 * @param call The call.
 * @param focus The use.
 * @returns Its shape.
 */
function callShape(call: MathCall, focus: Focus): Shape {
	const shapes = call.arguments.map((each) => shapeOf(each, focus).text);
	const ordered = focus.grammar.sorted.has(call.name) ? shapes.toSorted() : shapes;
	return { text: `${call.name}(${ordered.join(", ")})`, binding: OPERAND };
}

/**
 * The shape of an expression inside the math around a use.
 * @param node The expression.
 * @param focus The use.
 * @returns Its shape.
 */
function shapeOf(node: Node, focus: Focus): Shape {
	const { grammar } = focus;
	if (node.id === focus.node.id) return { text: focus.text, binding: OPERAND };
	const inner = unwrapped(grammar, node);
	if (inner.id !== node.id) return shapeOf(inner, focus);
	const found = arithmetic(grammar, node);
	if (found !== undefined) return operationShape(found, node, focus);
	const call = grammar.mathCall(node);
	if (call !== undefined) return callShape(call, focus);
	return { text: grammar.number(node) ?? OTHER, binding: OPERAND };
}

/**
 * The chain of names a use starts.
 * @param grammar The grammar.
 * @param name The name.
 * @returns The chain's expression.
 */
function chainOf(grammar: MathGrammar, name: Node): Node {
	let chain = name;
	for (let next = grammar.readOn(chain); next !== undefined && grammar.member(next);) {
		chain = next;
		next = grammar.readOn(chain);
	}
	return chain;
}

/**
 * What a use reads: its chain of names, with what the code adds to it, a
 * member or the call of a getter that passes nothing.
 * @param grammar The grammar.
 * @param chain The chain of names.
 * @returns The expression it reads.
 */
function operandOf(grammar: MathGrammar, chain: Node): Node {
	let operand = chain;
	for (let next = grammar.readOn(operand); next !== undefined; next = grammar.readOn(operand)) {
		operand = next;
	}
	return operand;
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
 * The computation around one expression a use reads, if math holds it.
 * @param grammar The grammar.
 * @param symbol The chain of names the use reads.
 * @param operand The expression.
 * @param text What the shape writes for the expression.
 * @returns The computation, or undefined.
 */
function computed(
	grammar: MathGrammar,
	symbol: string,
	operand: Node,
	text: string,
): Computation | undefined {
	const math = mathAround(grammar, operand);
	if (math === undefined) return undefined;
	const call = grammar.calledAfter?.(operand) === true ? "()" : "";
	const shape = shapeOf(math, { grammar, node: operand, text: `${text}${call}` }).text;
	return { symbol, line: operand.startPosition.row + 1, shape };
}

/**
 * The math around each later use of the local variables that hold a use whole.
 * @param grammar The grammar.
 * @param symbol The chain of names the use reads.
 * @param operand The expression the use reads.
 * @param text What the shape writes for it.
 * @returns The computations.
 */
function throughLocals(
	grammar: MathGrammar,
	symbol: string,
	operand: Node,
	text: string,
): Computation[] {
	return grammar.later(operand).flatMap(([each, member]) => {
		const read = operandOf(grammar, chainOf(grammar, each));
		return computed(grammar, symbol, read, `${text}${member}${added(read, each)}`) ?? [];
	});
}

/**
 * The math a file writes on the names other files define, through a grammar's reading.
 * @param uses Each use at run time of such a name, at the name its chain starts with.
 * @param grammar How the grammar's math is read.
 * @returns The computations, each once.
 */
function computationsThrough(uses: readonly Node[], grammar: MathGrammar): Computation[] {
	const found = new Map<string, Computation>();
	for (const name of uses) {
		const chain = chainOf(grammar, name);
		const symbol = grammar.spelled(chain);
		const operand = operandOf(grammar, chain);
		const text = `@${added(operand, chain)}`;
		const direct = computed(grammar, symbol, operand, text);
		const each = direct === undefined ? throughLocals(grammar, symbol, operand, text) : [direct];
		for (const computation of each) {
			found.set(`${computation.symbol}\0${computation.line}\0${computation.shape}`, computation);
		}
	}
	return [...found.values()];
}

export { computationsThrough, type Local, type MathCall, type MathGrammar, type Operation };
