// The typed surface every Archboard rule is written against.
//
// Oxlint 1.80 publishes its plugin contract (rule, context, visitor and AST
// node types) only through the `RuleTester` class of `oxlint/plugins-dev`;
// nothing exports `Rule` or `Context` by name. Every type below is derived
// from that class so an Oxlint bump that changes the contract fails the type
// check here instead of at lint time. The AST is Oxlint's own ESTree shape
// (nodes carry `parent`, TypeScript nodes are present), not `@types/estree`.
import type { RuleTester } from "oxlint/plugins-dev";

type Rule = Parameters<RuleTester["run"]>[1];
type RuleCreate = NonNullable<Rule["create"]>;
type RuleContext = Parameters<RuleCreate>[0];
type RuleVisitors = ReturnType<RuleCreate>;
/** The node a named visitor receives, e.g. `VisitedNode<"ImportDeclaration">`. */
type VisitedNode<Key extends string> = Parameters<NonNullable<RuleVisitors[Key]>>[0];
/** Every AST node Oxlint can hand a visitor. */
type AstNode = VisitedNode<"ImportDeclaration">["parent"];
/** The node with the given ESTree `type` discriminant. */
type NodeOf<Type extends AstNode["type"]> = Extract<AstNode, { type: Type }>;
type ExpressionNode = NonNullable<VisitedNode<"VariableDeclarator">["init"]>;
type StringLiteralNode = VisitedNode<"ImportDeclaration">["source"];
type ImportSpecifierNode = VisitedNode<"ImportDeclaration">["specifiers"][number];
type MemberExpressionNode = VisitedNode<"MemberExpression">;
type ReportedNode = NonNullable<Parameters<RuleContext["report"]>[0]["node"]>;
type MessageTable = Record<string, string>;

/**
 * Build a problem-type rule from its message table and visitor factory so
 * every Archboard rule carries identical metadata.
 * @param messages The message ids the rule reports, keyed for `context.report`.
 * @param create The visitor factory Oxlint calls once per linted file.
 * @returns The rule object Oxlint registers.
 */
function createRule(messages: MessageTable, create: RuleCreate): Rule {
	return {
		meta: {
			type: "problem",
			messages,
		},
		create,
	};
}

/**
 * Report a message id at a node; the one-line form most rules need.
 * @param context The rule context of the file being linted.
 * @param node The node the diagnostic underlines.
 * @param messageId A key of the rule's message table.
 */
function report(context: RuleContext, node: ReportedNode, messageId: string): void {
	context.report({
		node,
		messageId,
	});
}

/** Receives every module specifier a file names, with the node that names it. */
type SourceListener = (source: string, node: ReportedNode) => void;

/**
 * Forward a string-literal module source to the listener; empty sources are
 * ignored because there is nothing to resolve.
 * @param source The literal source node, when the declaration has one.
 * @param onSource The listener receiving the specifier text.
 */
function visitLiteralSource(source: StringLiteralNode | null, onSource: SourceListener): void {
	if (source?.value) {
		onSource(source.value, source);
	}
}

/**
 * The first argument of a `require(...)` call when it is a string literal.
 * @param node The call expression being inspected.
 * @returns The literal argument node, or undefined for any other call.
 */
function requireLiteralArgument(
	node: VisitedNode<"CallExpression">,
): StringLiteralNode | undefined {
	const argument = node.arguments[0];
	if (node.callee.type !== "Identifier" || node.callee.name !== "require") {
		return undefined;
	}
	return isStringLiteral(argument) ? argument : undefined;
}

/**
 * Narrow any node to a string literal.
 * @param node The node to test, possibly absent.
 * @returns Whether the node is a `Literal` holding a string.
 */
function isStringLiteral(node: AstNode | null | undefined): node is StringLiteralNode {
	return node?.type === "Literal" && typeof node.value === "string";
}

/**
 * Visitors that surface every static and dynamic module specifier in a file:
 * import and re-export declarations, `import()` with a literal, `import(...)`
 * types and literal `require()` calls.
 * @param onSource The listener receiving each specifier and its node.
 * @returns The visitor object to return from a rule's `create`.
 */
function sourceImportVisitors(onSource: SourceListener): RuleVisitors {
	return {
		/**
		 * A static `import ... from`.
		 * @param node The visited node.
		 */
		ImportDeclaration(node) {
			visitLiteralSource(node.source, onSource);
		},
		/**
		 * A named re-export with a source.
		 * @param node The visited node.
		 */
		ExportNamedDeclaration(node) {
			visitLiteralSource(node.source, onSource);
		},
		/**
		 * An `export * from` re-export.
		 * @param node The visited node.
		 */
		ExportAllDeclaration(node) {
			visitLiteralSource(node.source, onSource);
		},
		/**
		 * A dynamic `import()` with a literal specifier.
		 * @param node The visited node.
		 */
		ImportExpression(node) {
			if (isStringLiteral(node.source)) {
				onSource(node.source.value, node.source);
			}
		},
		/**
		 * An `import("...")` type.
		 * @param node The visited node.
		 */
		TSImportType(node) {
			visitLiteralSource(node.source, onSource);
		},
		/**
		 * A `require("...")` call.
		 * @param node The visited node.
		 */
		CallExpression(node) {
			const argument = requireLiteralArgument(node);
			if (argument) {
				onSource(argument.value, argument);
			}
		},
	};
}

/**
 * Whether an expression only wraps another one without changing what it
 * names: casts, non-null and satisfies assertions, chains and parentheses.
 * @param expression The expression to test.
 * @returns Whether `expression.expression` is the wrapped value.
 */
function isWrappingExpression(expression: ExpressionNode): expression is Extract<
	ExpressionNode,
	{
		type:
			| "TSAsExpression"
			| "TSTypeAssertion"
			| "TSNonNullExpression"
			| "TSSatisfiesExpression"
			| "ChainExpression"
			| "ParenthesizedExpression";
	}
> {
	return (
		expression.type === "TSAsExpression" ||
		expression.type === "TSTypeAssertion" ||
		expression.type === "TSNonNullExpression" ||
		expression.type === "TSSatisfiesExpression" ||
		expression.type === "ChainExpression" ||
		expression.type === "ParenthesizedExpression"
	);
}

/**
 * Strip type assertions, chains and parentheses so an identifier hidden
 * behind `(x as T)!` is still recognised.
 * @param expression The expression to unwrap, possibly absent.
 * @returns The innermost wrapped expression, or the input when absent.
 */
function unwrapExpression(expression: ExpressionNode | null): ExpressionNode | null {
	let current = expression;
	while (current && isWrappingExpression(current)) {
		current = current.expression;
	}
	return current;
}

export {
	createRule,
	isStringLiteral,
	report,
	sourceImportVisitors,
	unwrapExpression,
	type AstNode,
	type ExpressionNode,
	type ImportSpecifierNode,
	type MemberExpressionNode,
	type MessageTable,
	type NodeOf,
	type ReportedNode,
	type Rule,
	type RuleContext,
	type RuleVisitors,
	type StringLiteralNode,
	type VisitedNode,
};
