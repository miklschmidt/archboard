import path from "node:path";
import { API } from "typescript/unstable/async";
import * as ts from "typescript/unstable/ast";

export type AstFingerprint = readonly string[];

export async function parseModuleSources(
	repoRoot: string,
	openFiles: string[],
): Promise<Map<string, ts.SourceFile>> {
	const parsed = new Map<string, ts.SourceFile>();
	const compiler = new API({ cwd: repoRoot });
	try {
		const snapshot = await compiler.updateSnapshot({
			openProjects: [path.join(repoRoot, "tsconfig.json")],
			openFiles,
		});
		for (const project of snapshot.getProjects())
			for (const file of await project.program.getSourceFileNames()) {
				const source = await project.program.getSourceFile(file);
				if (source) parsed.set(path.resolve(file), source);
			}
	} finally {
		void compiler.close();
	}
	return parsed;
}

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

function isTypeImport(node: ts.ImportSpecifier): boolean {
	const declaration = node.parent.parent.parent;
	return (
		node.isTypeOnly ||
		(ts.isImportDeclaration(declaration) && !!declaration.importClause?.phaseModifier)
	);
}

function typeAliases(source: ts.SourceFile): Map<string, string> {
	const aliases = new Map<string, string>();
	const declarations = typeDeclarations(source);
	const visit = (node: ts.Node): void => {
		if (ts.isImportSpecifier(node) && isTypeImport(node)) {
			const imported = node.propertyName?.text ?? node.name.text;
			aliases.set(node.name.text, imported);
		}
		node.forEachChild(visit);
	};
	visit(source);
	for (const [name, declaration] of declarations)
		if (
			ts.isTypeAliasDeclaration(declaration) &&
			ts.isTypeReferenceNode(declaration.type) &&
			ts.isIdentifier(declaration.type.typeName) &&
			(declarations.has(declaration.type.typeName.text) ||
				aliases.has(declaration.type.typeName.text))
		)
			aliases.set(name, declaration.type.typeName.text);
	return aliases;
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

function isTransparentAliasDeclaration(
	node: ts.Node,
	aliases: ReadonlyMap<string, string>,
): boolean {
	return (
		ts.isTypeAliasDeclaration(node) &&
		ts.isIdentifier(node.name) &&
		aliases.has(node.name.text) &&
		ts.isTypeReferenceNode(node.type)
	);
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
	aliases: ReadonlyMap<string, string>,
): void {
	if (isTransparentAliasDeclaration(node, aliases)) return;
	if (
		ts.isIdentifier(node) &&
		ts.isImportSpecifier(node.parent) &&
		node.parent.name === node &&
		!!node.parent.propertyName &&
		isTypeImport(node.parent)
	)
		return;
	if (ts.isIdentifier(node)) {
		const resolved = resolveAlias(node.text, aliases);
		tokens.push(localTypes.has(resolved) ? `type:${localTypes.get(resolved)}` : `id:${resolved}`);
	} else if (ts.isStringLiteralLikeNode(node))
		tokens.push(isModuleLiteral(node) ? "module" : `string:${JSON.stringify(node.text)}`);
	else if (ts.isNumericLiteral(node)) tokens.push(`number:${node.text}`);
	else tokens.push(`kind:${node.kind}`);
	node.forEachChild((child) => walk(child, tokens, localTypes, aliases));
}

export function astFingerprint(source: ts.SourceFile): AstFingerprint {
	const tokens: string[] = [];
	walk(source, tokens, structuralTypeNames(source), typeAliases(source));
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
