import * as ts from "typescript/unstable/ast";

function transparentExpression(node: ts.Node | undefined): ts.Node | undefined {
	let current = node;
	while (current) {
		if (
			ts.isParenthesizedExpression(current) ||
			ts.isAsExpression(current) ||
			ts.isSatisfiesExpression(current) ||
			ts.isNonNullExpression(current) ||
			ts.isPartiallyEmittedExpression(current)
		) {
			current = current.expression;
			continue;
		}
		if (current.kind === ts.SyntaxKind.TypeAssertionExpression) {
			current = (current as unknown as { expression: ts.Node }).expression;
			continue;
		}
		break;
	}
	return current;
}

function moduleSpecifierPattern(node: ts.Node | undefined): string | undefined {
	const expression = transparentExpression(node);
	if (!expression) return undefined;
	if (ts.isStringLiteralLikeNode(expression)) return expression.text;
	if (
		ts.isBinaryExpression(expression) &&
		expression.operatorToken.kind === ts.SyntaxKind.PlusToken
	) {
		const left = moduleSpecifierPattern(expression.left);
		const right = moduleSpecifierPattern(expression.right);
		return left !== undefined && right !== undefined
			? left + right
			: left !== undefined
				? `${left}*`
				: right !== undefined
					? `*${right}`
					: undefined;
	}
	if (ts.isTemplateExpression(expression))
		return expression.templateSpans.reduce(
			(value, span) => `${value}*${span.literal.text}`,
			expression.head.text,
		);
	return undefined;
}

function walk(node: ts.Node, visit: (node: ts.Node) => void): void {
	visit(node);
	node.forEachChild((child) => walk(child, visit));
}

export function moduleSpecifiers(source: ts.SourceFile): string[] {
	const specifiers: string[] = [];
	walk(source, (node) => {
		if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
			specifiers.push(moduleSpecifierPattern(node.moduleSpecifier) ?? "");
		if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference))
			specifiers.push(moduleSpecifierPattern(node.moduleReference.expression) ?? "");
		if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument))
			specifiers.push(moduleSpecifierPattern(node.argument.literal) ?? "");
		if (
			ts.isCallExpression(node) &&
			(ts.isImportExpression(node.expression) ||
				(ts.isIdentifier(node.expression) && node.expression.text === "require")) &&
			node.arguments.length === 1
		)
			specifiers.push(moduleSpecifierPattern(node.arguments[0]) ?? "");
	});
	return specifiers.filter(Boolean);
}
