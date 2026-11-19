// The math a file writes around the uses of names other files define
// (TASK-646.12), for a grammar that describes its arithmetic in a small
// syntax table: C, C++ and Objective-C share one, Swift has its own. Module
// depth compares the shapes across the modules that read one export. It
// follows the rules TypeScript's reading follows (typescript-math.ts):
//
// The math is the largest arithmetic expression around a use: `+ - * / %`,
// a sign, parentheses, and the functions of math the grammar names, such as
// `min`. Every other operator ends it, and so does a `+` that joins text. The
// use is the chain of names it starts, with the `()` of a call that passes
// nothing, as a getter's is. Inside the shape the use is `@`, a number is its
// value and every other operand, the caller's own names among them, is `…`.
// The operands of `+` and `*` and the arguments of the functions the grammar
// sorts are sorted, so `a * b` and `b * a` have one shape. A use that a local
// variable holds whole, as `const int base = X.base;` does, is followed once:
// the math around each later use of that variable is math on the name.

import type { Node } from "web-tree-sitter";
import type { Computation } from "#runtime/code-facts/operations/facts.ts";

/** An operation of arithmetic, as a grammar reads it: its operator and its one or two operands. */
interface Operation {
	readonly operator: string;
	readonly operands: readonly Node[];
}

/** A call of a function of math: its name as the shape writes it, and its arguments. */
interface MathCall {
	readonly name: string;
	readonly arguments: readonly Node[];
}

/** A local variable that holds a use whole, where it lives, and where its declaration ends. */
interface Local {
	readonly name: string;
	readonly scope: Node;
	readonly after: number;
}

/** How a grammar writes arithmetic, chains of names and local variables. */
interface MathSyntax {
	/** The operation an expression is, binary or a sign, or undefined. */
	readonly operation: (node: Node) => Operation | undefined;
	/** The expression parentheses hold, or undefined for anything else. */
	readonly inner: (node: Node) => Node | undefined;
	/** The call of a function of math an expression is, or undefined. */
	readonly mathCall: (node: Node) => MathCall | undefined;
	/** The call an expression is an argument of, or undefined. */
	readonly callOf: (argument: Node) => Node | undefined;
	/** The functions of math whose arguments can change places. */
	readonly sorted: ReadonlySet<string>;
	/** A number's value as the shape writes it, or undefined for anything else. */
	readonly number: (node: Node) => string | undefined;
	/** Whether an expression is text, which `+` joins. */
	readonly text: (node: Node) => boolean;
	/** The expression that reads a member of another, or the getter call that passes it nothing, or undefined. */
	readonly readOn: (operand: Node) => Node | undefined;
	/** Whether an expression reads a member, so it is part of a chain of names. */
	readonly member: (expression: Node) => boolean;
	/** How a chain of names is spelled, as the grammar's references spell it. */
	readonly spelled: (chain: Node) => string;
	/** The local variable whose whole value an expression is, or undefined. */
	readonly local: (operand: Node) => Local | undefined;
	/** The later uses of a local variable in its scope. */
	readonly uses: (local: Local) => readonly Node[];
	/**
	 * Whether the grammar reads a call that passes nothing after the math that
	 * ends with an expression, rather than as the expression's own: so
	 * tree-sitter-swift reads `1 + n * jitter()`.
	 */
	readonly calledAfter?: (operand: Node) => boolean;
}

/** The operators of arithmetic, by how tightly each binds. */
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
	readonly syntax: MathSyntax;
	readonly node: Node;
	readonly text: string;
}

/**
 * The expression inside any parentheses.
 * @param syntax The grammar.
 * @param node The expression.
 * @returns The expression the parentheses hold, or itself.
 */
function unwrapped(syntax: MathSyntax, node: Node): Node {
	const inner = syntax.inner(node);
	return inner === undefined ? node : unwrapped(syntax, inner);
}

/**
 * Whether a binary operation is arithmetic on numbers: no `+` that joins text.
 * @param syntax The grammar.
 * @param found The operation.
 * @returns True when it is.
 */
function onNumbers(syntax: MathSyntax, found: Operation): boolean {
	if (!BINDING.has(found.operator)) return false;
	return (
		found.operator !== "+" || !found.operands.some((each) => syntax.text(unwrapped(syntax, each)))
	);
}

/**
 * The arithmetic an expression is: a binary operation of arithmetic on
 * numbers, or a sign.
 * @param syntax The grammar.
 * @param node The expression.
 * @returns The operation, or undefined.
 */
function arithmetic(syntax: MathSyntax, node: Node): Operation | undefined {
	const found = syntax.operation(node);
	if (found === undefined) return undefined;
	const keeps =
		found.operands.length === 1 ? /^[-+]$/u.test(found.operator) : onNumbers(syntax, found);
	return keeps ? found : undefined;
}

/**
 * The math that holds an expression, one step out.
 * @param syntax The grammar.
 * @param node The expression.
 * @returns The parent that keeps the math going, or undefined where the math ends.
 */
function mathParent(syntax: MathSyntax, node: Node): Node | undefined {
	const parent = node.parent;
	if (parent !== null && (syntax.inner(parent) !== undefined || arithmetic(syntax, parent))) {
		return parent;
	}
	const call = syntax.callOf(node);
	return call !== undefined && syntax.mathCall(call) !== undefined ? call : undefined;
}

/**
 * The largest math around an expression.
 * @param syntax The grammar.
 * @param node The expression.
 * @returns The math, or undefined when no arithmetic holds the expression.
 */
function mathAround(syntax: MathSyntax, node: Node): Node | undefined {
	let math: Node | undefined;
	for (let step = mathParent(syntax, node); step !== undefined; step = mathParent(syntax, step)) {
		if (syntax.inner(step) === undefined) math = step;
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
 * @param syntax The grammar.
 * @param node The expression.
 * @param operator The operator.
 * @returns The operands.
 */
function chained(syntax: MathSyntax, node: Node, operator: string): Node[] {
	const inner = unwrapped(syntax, node);
	const found = arithmetic(syntax, inner);
	if (found?.operator !== operator || found.operands.length !== 2) return [inner];
	return found.operands.flatMap((each) => chained(syntax, each, operator));
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
 * The shape of an operation of arithmetic.
 * @param found The operation.
 * @param node Its expression.
 * @param focus The use.
 * @returns Its shape.
 */
function operationShape(found: Operation, node: Node, focus: Focus): Shape {
	const { operator, operands } = found;
	if (operands.length === 1) return signShape(found, focus);
	const binding = BINDING.get(operator) ?? OPERAND;
	if (COMMUTATIVE.has(operator)) {
		const each = chained(focus.syntax, node, operator).map((operand) =>
			placed(shapeOf(operand, focus), binding + 1),
		);
		return { text: each.toSorted().join(` ${operator} `), binding };
	}
	const sides = operands.map((operand, index) => placed(shapeOf(operand, focus), binding + index));
	return { text: sides.join(` ${operator} `), binding };
}

/**
 * The shape of a call of a function of math.
 * @param call The call.
 * @param focus The use.
 * @returns Its shape.
 */
function callShape(call: MathCall, focus: Focus): Shape {
	const shapes = call.arguments.map((each) => shapeOf(each, focus).text);
	const ordered = focus.syntax.sorted.has(call.name) ? shapes.toSorted() : shapes;
	return { text: `${call.name}(${ordered.join(", ")})`, binding: OPERAND };
}

/**
 * The shape of an expression inside the math around a use.
 * @param node The expression.
 * @param focus The use.
 * @returns Its shape.
 */
function shapeOf(node: Node, focus: Focus): Shape {
	const { syntax } = focus;
	if (node.id === focus.node.id) return { text: focus.text, binding: OPERAND };
	const inner = unwrapped(syntax, node);
	if (inner.id !== node.id) return shapeOf(inner, focus);
	const found = arithmetic(syntax, node);
	if (found !== undefined) return operationShape(found, node, focus);
	const call = syntax.mathCall(node);
	if (call !== undefined) return callShape(call, focus);
	return { text: syntax.number(node) ?? OTHER, binding: OPERAND };
}

/**
 * The chain of names a use starts.
 * @param syntax The grammar.
 * @param name The name.
 * @returns The chain's expression.
 */
function chainOf(syntax: MathSyntax, name: Node): Node {
	let chain = name;
	for (let next = syntax.readOn(chain); next !== undefined && syntax.member(next);) {
		chain = next;
		next = syntax.readOn(chain);
	}
	return chain;
}

/**
 * What a use reads: its chain of names, with what the code adds to it, a
 * member or the call of a getter that passes nothing.
 * @param syntax The grammar.
 * @param chain The chain of names.
 * @returns The expression it reads.
 */
function operandOf(syntax: MathSyntax, chain: Node): Node {
	let operand = chain;
	for (let next = syntax.readOn(operand); next !== undefined; next = syntax.readOn(operand)) {
		operand = next;
	}
	return operand;
}

/**
 * What the code adds to an expression's start, without white space.
 * @param operand The expression.
 * @param start The start it adds to.
 * @returns The text after the start, such as `()` or `.base`.
 */
function added(operand: Node, start: Node): string {
	return operand.text.slice(start.endIndex - operand.startIndex).replaceAll(/\s/gu, "");
}

/**
 * The computation around one expression a use reads, if math holds it.
 * @param syntax The grammar.
 * @param symbol The chain of names the use reads.
 * @param operand The expression.
 * @param text What the shape writes for the expression.
 * @returns The computation, or undefined.
 */
function computed(
	syntax: MathSyntax,
	symbol: string,
	operand: Node,
	text: string,
): Computation | undefined {
	const math = mathAround(syntax, operand);
	if (math === undefined) return undefined;
	const call = syntax.calledAfter?.(operand) === true ? "()" : "";
	const shape = shapeOf(math, { syntax, node: operand, text: `${text}${call}` }).text;
	return { symbol, line: operand.startPosition.row + 1, shape };
}

/**
 * The math around each later use of the local variable that holds a use whole.
 * @param syntax The grammar.
 * @param symbol The chain of names the use reads.
 * @param operand The expression the use reads.
 * @param text What the shape writes for it.
 * @returns The computations.
 */
function throughLocal(
	syntax: MathSyntax,
	symbol: string,
	operand: Node,
	text: string,
): Computation[] {
	const local = syntax.local(operand);
	if (local === undefined) return [];
	return syntax.uses(local).flatMap((each) => {
		const read = operandOf(syntax, chainOf(syntax, each));
		return computed(syntax, symbol, read, `${text}${added(read, each)}`) ?? [];
	});
}

/**
 * The math a file writes around the uses of names, as a grammar writes it.
 * @param syntax How the grammar writes arithmetic.
 * @param uses Each use at run time, at the name it starts with.
 * @returns The computations, each once.
 */
function computationsOf(syntax: MathSyntax, uses: readonly Node[]): Computation[] {
	const found = new Map<string, Computation>();
	for (const name of uses) {
		const chain = chainOf(syntax, name);
		const symbol = syntax.spelled(chain);
		const operand = operandOf(syntax, chain);
		const text = `@${added(operand, chain)}`;
		const direct = computed(syntax, symbol, operand, text);
		const each = direct === undefined ? throughLocal(syntax, symbol, operand, text) : [direct];
		for (const computation of each) {
			found.set(`${computation.symbol}\0${computation.line}\0${computation.shape}`, computation);
		}
	}
	return [...found.values()];
}

export { computationsOf, type Local, type MathCall, type MathSyntax, type Operation };
