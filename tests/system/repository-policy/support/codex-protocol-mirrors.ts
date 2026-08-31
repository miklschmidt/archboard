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

function walk(node: ts.Node, tokens: string[], localTypes: ReadonlyMap<string, number>): void {
	if (ts.isIdentifier(node))
		tokens.push(
			localTypes.has(node.text) ? `type:${localTypes.get(node.text)}` : `id:${node.text}`,
		);
	else if (ts.isStringLiteralLikeNode(node))
		tokens.push(isModuleLiteral(node) ? "module" : `string:${JSON.stringify(node.text)}`);
	else if (ts.isNumericLiteral(node)) tokens.push(`number:${node.text}`);
	else tokens.push(`kind:${node.kind}`);
	node.forEachChild((child) => walk(child, tokens, localTypes));
}

export function astFingerprint(source: ts.SourceFile): AstFingerprint {
	const tokens: string[] = [];
	walk(source, tokens, structuralTypeNames(source));
	return tokens;
}

export interface FingerprintSource {
	readonly path: string;
	readonly source?: string;
	readonly sourceFile: ts.SourceFile;
}

export function mergeGeneratedFingerprints(
	authoritative: readonly AstFingerprint[],
	sources: readonly FingerprintSource[],
	generatedRoot: string,
	header: string,
	paths: ReadonlySet<string>,
): AstFingerprint[] {
	return [
		...authoritative,
		...sources
			.filter(
				({ path, source }) =>
					path.startsWith(generatedRoot) &&
					(source ?? "").startsWith(header) &&
					paths.has(path.replaceAll("\\", "/").slice(generatedRoot.length)),
			)
			.map(({ sourceFile }) => astFingerprint(sourceFile)),
	];
}

function nearMatch(candidate: AstFingerprint, generated: AstFingerprint): boolean {
	const length = Math.max(candidate.length, generated.length);
	if (length < 24 || Math.abs(candidate.length - generated.length) > length * 0.05) return false;
	let prefix = 0;
	while (
		prefix < candidate.length &&
		prefix < generated.length &&
		candidate[prefix] === generated[prefix]
	)
		prefix++;
	let suffix = 0;
	while (
		suffix < candidate.length - prefix &&
		suffix < generated.length - prefix &&
		candidate[candidate.length - suffix - 1] === generated[generated.length - suffix - 1]
	)
		suffix++;
	return prefix + suffix >= length * 0.96;
}

export function isGeneratedMirror(
	candidate: ts.SourceFile,
	generated: readonly AstFingerprint[],
): boolean {
	const fingerprint = astFingerprint(candidate);
	return generated.some(
		(reference) =>
			(fingerprint.length === reference.length &&
				fingerprint.every((token, index) => token === reference[index])) ||
			nearMatch(fingerprint, reference),
	);
}
