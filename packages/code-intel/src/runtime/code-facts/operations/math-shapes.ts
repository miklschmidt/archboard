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
	readonly member: (expression: Node, operand: Node) => boolean;
	/** How a chain of names is spelled, as the grammar's references spell it. */
	readonly spelled: (chain: Node) => string;
	/** The local variable whose whole value an expression is, or undefined. */
	readonly local: (operand: Node) => Local | undefined;
	/** The later uses of a local variable in its scope. */
	readonly uses: (local: Local) => readonly Node[];
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

/** The use a shape is drawn around, and what it is written as. */
interface Focus {
	readonly node: Node;
	readonly text: string;
}

/** Reads the math of one grammar. */
class MathReading {
	constructor(private readonly syntax: MathSyntax) {}

	/**
	 * The expression inside any parentheses.
	 * @param node The expression.
	 * @returns The expression the parentheses hold, or itself.
	 */
	unwrapped(node: Node): Node {
		const inner = this.syntax.inner(node);
		return inner === undefined ? node : this.unwrapped(inner);
	}

	/**
	 * The arithmetic an expression is: a binary operation of arithmetic on
	 * numbers, or a sign.
	 * @param node The expression.
	 * @returns The operation, or undefined.
	 */
	arithmetic(node: Node): Operation | undefined {
		const found = this.syntax.operation(node);
		if (found === undefined) return undefined;
		const { operator, operands } = found;
		if (operands.length === 1) return /^[-+]$/u.test(operator) ? found : undefined;
		if (!BINDING.has(operator)) return undefined;
		const joins = operands.some((each) => this.syntax.text(this.unwrapped(each)));
		return operator === "+" && joins ? undefined : found;
	}

	/**
	 * The math that holds an expression, one step out.
	 * @param node The expression.
	 * @returns The parent that keeps the math going, or undefined where the math ends.
	 */
	mathParent(node: Node): Node | undefined {
		const parent = node.parent;
		if (parent !== null && (this.syntax.inner(parent) !== undefined || this.arithmetic(parent))) {
			return parent;
		}
		const call = this.syntax.callOf(node);
		return call !== undefined && this.syntax.mathCall(call) !== undefined ? call : undefined;
	}

	/**
	 * The largest math around an expression.
	 * @param node The expression.
	 * @returns The math, or undefined when no arithmetic holds the expression.
	 */
	mathAround(node: Node): Node | undefined {
		let math: Node | undefined;
		for (let step = this.mathParent(node); step !== undefined; step = this.mathParent(step)) {
			if (this.syntax.inner(step) === undefined) math = step;
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
		const found = this.arithmetic(inner);
		if (found?.operator !== operator || found.operands.length !== 2) return [inner];
		return found.operands.flatMap((each) => this.chained(each, operator));
	}

	/**
	 * The shape of an operation of arithmetic.
	 * @param found The operation.
	 * @param node Its expression.
	 * @param focus The use.
	 * @returns Its shape.
	 */
	operationShape(found: Operation, node: Node, focus: Focus): Shape {
		const { operator, operands } = found;
		if (operands.length === 1) {
			const [operand] = operands;
			const text = operand === undefined ? OTHER : placed(this.shapeOf(operand, focus), SIGN);
			return { text: `${operator}${text}`, binding: SIGN };
		}
		const binding = BINDING.get(operator) ?? OPERAND;
		if (COMMUTATIVE.has(operator)) {
			const each = this.chained(node, operator).map((operand) =>
				placed(this.shapeOf(operand, focus), binding + 1),
			);
			return { text: each.toSorted().join(` ${operator} `), binding };
		}
		const sides = operands.map((operand, index) =>
			placed(this.shapeOf(operand, focus), binding + index),
		);
		return { text: sides.join(` ${operator} `), binding };
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
		const found = this.arithmetic(node);
		if (found !== undefined) return this.operationShape(found, node, focus);
		const call = this.syntax.mathCall(node);
		if (call !== undefined) {
			const shapes = call.arguments.map((each) => this.shapeOf(each, focus).text);
			const ordered = this.syntax.sorted.has(call.name) ? shapes.toSorted() : shapes;
			return { text: `${call.name}(${ordered.join(", ")})`, binding: OPERAND };
		}
		return { text: this.syntax.number(node) ?? OTHER, binding: OPERAND };
	}

	/**
	 * The chain of names a use starts.
	 * @param name The name.
	 * @returns The chain's expression.
	 */
	chainOf(name: Node): Node {
		let chain = name;
		for (let next = this.syntax.readOn(chain); next !== undefined; next = this.syntax.readOn(chain)) {
			if (!this.syntax.member(next, chain)) break;
			chain = next;
		}
		return chain;
	}

	/**
	 * What a use reads: its chain of names, with what the code adds to it, a
	 * member or the call of a getter that passes nothing.
	 * @param chain The chain of names.
	 * @returns The expression it reads.
	 */
	operandOf(chain: Node): Node {
		let operand = chain;
		for (let next = this.syntax.readOn(operand); next !== undefined; next = this.syntax.readOn(operand)) {
			operand = next;
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
	 * The math around each later use of the local variable that holds a use whole.
	 * @param symbol The chain of names the use reads.
	 * @param operand The expression the use reads.
	 * @param text What the shape writes for it.
	 * @returns The computations.
	 */
	throughLocal(symbol: string, operand: Node, text: string): Computation[] {
		const local = this.syntax.local(operand);
		if (local === undefined) return [];
		return this.syntax.uses(local).flatMap((each) => {
			const read = this.operandOf(this.chainOf(each));
			return this.computed(symbol, read, `${text}${added(read, each)}`) ?? [];
		});
	}

	/**
	 * The math a file writes around the uses of names.
	 * @param uses Each use at run time, at the name it starts with.
	 * @returns The computations, each once.
	 */
	computationsOf(uses: readonly Node[]): Computation[] {
		const found = new Map<string, Computation>();
		for (const name of uses) {
			const chain = this.chainOf(name);
			const symbol = this.syntax.spelled(chain);
			const operand = this.operandOf(chain);
			const text = `@${added(operand, chain)}`;
			const direct = this.computed(symbol, operand, text);
			const each = direct === undefined ? this.throughLocal(symbol, operand, text) : [direct];
			for (const computation of each) {
				found.set(`${computation.symbol}\0${computation.line}\0${computation.shape}`, computation);
			}
		}
		return [...found.values()];
	}
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
 * @returns The text after the start, such as `()` or `.base`.
 */
function added(operand: Node, start: Node): string {
	return operand.text.slice(start.endIndex - operand.startIndex).replaceAll(/\s/gu, "");
}

/**
 * The math a file writes around the uses of names, as a grammar writes it.
 * @param syntax How the grammar writes arithmetic.
 * @param uses Each use at run time, at the name it starts with.
 * @returns The computations, each once.
 */
function computationsOf(syntax: MathSyntax, uses: readonly Node[]): Computation[] {
	return new MathReading(syntax).computationsOf(uses);
}

export { computationsOf, type Local, type MathSyntax };
