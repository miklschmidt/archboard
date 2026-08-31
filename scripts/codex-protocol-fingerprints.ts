import * as ts from "typescript/unstable/ast";

export type AstFingerprint = readonly string[];

function typeDeclarations(
	source: ts.SourceFile,
): Map<string, ts.TypeAliasDeclaration | ts.InterfaceDeclaration> {
	const declarations = new Map<string, ts.TypeAliasDeclaration | ts.InterfaceDeclaration>();
	const visit = (node: ts.Node): void => {
		if (ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node))
			declarations.set(node.name.text, node);
		node.forEachChild(visit);
	};
	visit(source);
	return declarations;
}

function referencesLocalType(node: ts.Node, names: ReadonlySet<string>): boolean {
	let found = false;
	const visit = (child: ts.Node): void => {
		if (ts.isIdentifier(child) && names.has(child.text)) found = true;
		child.forEachChild(visit);
	};
	visit(node);
	return found;
}

function structuralTypeNames(source: ts.SourceFile): Map<string, number> {
	const declarations = typeDeclarations(source);
	const structural = new Set<string>();
	for (const [name, declaration] of declarations) {
		if (ts.isInterfaceDeclaration(declaration)) structural.add(name);
		else if (ts.isTypeLiteralNode(declaration.type)) structural.add(name);
	}
	let changed = true;
	while (changed) {
		changed = false;
		for (const [name, declaration] of declarations)
			if (
				ts.isTypeAliasDeclaration(declaration) &&
				!structural.has(name) &&
				referencesLocalType(declaration.type, structural)
			) {
				structural.add(name);
				changed = true;
			}
	}
	return new Map([...structural].toSorted().map((name, index) => [name, index]));
}

interface AliasContext {
	readonly symbols: Map<string, string>;
	readonly namespaces: ReadonlySet<string>;
	readonly transparent: ReadonlySet<string>;
}

function entityNameLeaf(node: ts.Node): string | undefined {
	if (ts.isIdentifier(node)) return node.text;
	if (ts.isQualifiedName(node)) return entityNameLeaf(node.right);
	return undefined;
}

function unwrappedType(node: ts.TypeNode): ts.TypeNode {
	let current = node;
	while (ts.isParenthesizedTypeNode(current)) current = current.type;
	return current;
}

function importedTypeName(node: ts.TypeNode): string | undefined {
	const unwrapped = unwrappedType(node);
	if (ts.isTypeReferenceNode(unwrapped)) return entityNameLeaf(unwrapped.typeName);
	if (ts.isImportTypeNode(unwrapped))
		return unwrapped.qualifier ? entityNameLeaf(unwrapped.qualifier) : undefined;
	return undefined;
}

function aliasContext(source: ts.SourceFile): AliasContext {
	const symbols = new Map<string, string>();
	const namespaces = new Set<string>();
	const declarations = typeDeclarations(source);
	const visit = (node: ts.Node): void => {
		if (ts.isImportDeclaration(node)) {
			const bindings = node.importClause?.namedBindings;
			if (bindings && ts.isNamespaceImport(bindings)) namespaces.add(bindings.name.text);
			if (bindings && ts.isNamedImports(bindings))
				for (const specifier of bindings.elements) {
					const imported = specifier.propertyName?.text ?? specifier.name.text;
					symbols.set(specifier.name.text, imported);
				}
		}
		node.forEachChild(visit);
	};
	visit(source);
	const transparent = new Set<string>();
	let changed = true;
	while (changed) {
		changed = false;
		for (const [name, declaration] of declarations) {
			if (!ts.isTypeAliasDeclaration(declaration)) continue;
			const target = importedTypeName(declaration.type);
			if (
				!target ||
				(!declarations.has(target) &&
					!symbols.has(target) &&
					!namespaces.has(target) &&
					!ts.isImportTypeNode(unwrappedType(declaration.type)))
			)
				continue;
			const resolved = symbols.get(target) ?? target;
			if (symbols.get(name) !== resolved) {
				symbols.set(name, resolved);
				changed = true;
			}
			transparent.add(name);
		}
	}
	return { symbols, namespaces, transparent };
}

function resolveAlias(name: string, aliases: ReadonlyMap<string, string>): string {
	const seen = new Set<string>();
	let resolved = name;
	while (aliases.has(resolved) && !seen.has(resolved)) {
		seen.add(resolved);
		resolved = aliases.get(resolved) ?? resolved;
	}
	return resolved;
}

function isModuleLiteral(node: ts.Node): boolean {
	const parent = node.parent;
	return (
		!!parent &&
		(ts.isImportDeclaration(parent) ||
			ts.isExportDeclaration(parent) ||
			(ts.isLiteralTypeNode(parent) && ts.isImportTypeNode(parent.parent)) ||
			(ts.isCallExpression(parent) && ts.isImportExpression(parent.expression)))
	);
}

function walk(
	node: ts.Node,
	tokens: string[],
	localTypes: ReadonlyMap<string, number>,
	aliases: AliasContext,
): void {
	if (ts.isImportDeclaration(node)) {
		tokens.push("import");
		return;
	}
	if (ts.isTypeAliasDeclaration(node) && aliases.transparent.has(node.name.text)) {
		if (ts.isImportTypeNode(unwrappedType(node.type))) tokens.push("import");
		return;
	}
	if (ts.isParenthesizedTypeNode(node)) {
		walk(node.type, tokens, localTypes, aliases);
		return;
	}
	if (ts.isImportTypeNode(node)) {
		if (node.qualifier) walk(node.qualifier, tokens, localTypes, aliases);
		return;
	}
	if (
		ts.isQualifiedName(node) &&
		ts.isIdentifier(node.left) &&
		aliases.namespaces.has(node.left.text)
	) {
		walk(node.right, tokens, localTypes, aliases);
		return;
	}
	if (ts.isIdentifier(node)) {
		const resolved = resolveAlias(node.text, aliases.symbols);
		tokens.push(localTypes.has(resolved) ? `type:${localTypes.get(resolved)}` : `id:${resolved}`);
	} else if (ts.isStringLiteralLikeNode(node))
		tokens.push(isModuleLiteral(node) ? "module" : `string:${JSON.stringify(node.text)}`);
	else if (ts.isNumericLiteral(node)) tokens.push(`number:${node.text}`);
	else tokens.push(`kind:${node.kind}`);
	node.forEachChild((child) => walk(child, tokens, localTypes, aliases));
}

export function astFingerprint(source: ts.SourceFile): AstFingerprint {
	const tokens: string[] = [];
	walk(source, tokens, structuralTypeNames(source), aliasContext(source));
	return tokens;
}

export function distinctiveFingerprints(
	entries: Readonly<Record<string, AstFingerprint>>,
): AstFingerprint[] {
	const counts = new Map<string, number>();
	for (const fingerprint of Object.values(entries)) {
		const key = JSON.stringify(fingerprint);
		counts.set(key, (counts.get(key) ?? 0) + 1);
	}
	return Object.values(entries).filter(
		(fingerprint) => counts.get(JSON.stringify(fingerprint)) === 1,
	);
}
