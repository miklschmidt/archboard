import { LanguageVariant, SyntaxKind } from "typescript/unstable/ast";
import { createScanner } from "typescript/unstable/ast/scanner";

interface NamedTypeImport {
	readonly name: string;
	readonly module: string;
	readonly start: number;
	readonly end: number;
}

function namedTypeImports(source: string): NamedTypeImport[] {
	const scanner = createScanner(true, LanguageVariant.Standard, source);
	const tokens: Array<{
		readonly kind: SyntaxKind;
		readonly text: string;
		readonly value: string;
		readonly start: number;
		readonly end: number;
	}> = [];
	for (let kind = scanner.scan(); kind !== SyntaxKind.EndOfFile; kind = scanner.scan())
		tokens.push({
			kind,
			text: scanner.getTokenText(),
			value: scanner.getTokenValue(),
			start: scanner.getTokenStart(),
			end: scanner.getTokenEnd(),
		});
	const imports: NamedTypeImport[] = [];
	for (let index = 0; index + 7 < tokens.length; index++) {
		const declaration = tokens[index];
		const type = tokens[index + 1];
		const openBrace = tokens[index + 2];
		const name = tokens[index + 3];
		const closeBrace = tokens[index + 4];
		const from = tokens[index + 5];
		const module = tokens[index + 6];
		const semicolon = tokens[index + 7];
		if (
			declaration?.kind !== SyntaxKind.ImportKeyword ||
			type?.kind !== SyntaxKind.TypeKeyword ||
			openBrace?.kind !== SyntaxKind.OpenBraceToken ||
			name?.kind !== SyntaxKind.Identifier ||
			closeBrace?.kind !== SyntaxKind.CloseBraceToken ||
			from?.kind !== SyntaxKind.FromKeyword ||
			module?.kind !== SyntaxKind.StringLiteral ||
			semicolon?.kind !== SyntaxKind.SemicolonToken
		)
			continue;
		imports.push({
			name: name.text,
			module: module.value,
			start: declaration.start,
			end: semicolon.end,
		});
		index += 7;
	}
	return imports;
}

function replaceImportDeclarations(
	source: string,
	imports: readonly NamedTypeImport[],
	replacement: (declaration: NamedTypeImport) => string,
): string {
	let result = source;
	for (const declaration of imports.toReversed())
		result =
			result.slice(0, declaration.start) + replacement(declaration) + result.slice(declaration.end);
	return result;
}

function replaceTypeReferenceUsages(
	source: string,
	replacements: ReadonlyMap<string, string>,
): string {
	let result = "";
	let index = 0;
	while (index < source.length) {
		const character = source[index];
		const next = source[index + 1];
		if (character === "/" && next === "/") {
			const end = source.indexOf("\n", index + 2);
			const stop = end < 0 ? source.length : end;
			result += source.slice(index, stop);
			index = stop;
			continue;
		}
		if (character === "/" && next === "*") {
			const end = source.indexOf("*/", index + 2);
			const stop = end < 0 ? source.length : end + 2;
			result += source.slice(index, stop);
			index = stop;
			continue;
		}
		if (character === '"' || character === "'" || character === "`") {
			const quote = character;
			let stop = index + 1;
			while (stop < source.length) {
				if (source[stop] === "\\") stop += 2;
				else if (source[stop] === quote) {
					stop++;
					break;
				} else stop++;
			}
			result += source.slice(index, stop);
			index = stop;
			continue;
		}
		if (character && /[A-Za-z_$]/u.test(character)) {
			let stop = index + 1;
			while (stop < source.length && /[A-Za-z0-9_$]/u.test(source[stop] ?? "")) stop++;
			const identifier = source.slice(index, stop);
			result += replacements.get(identifier) ?? identifier;
			index = stop;
			continue;
		}
		if (character) result += character;
		index++;
	}
	return result;
}

export function namespaceImportMirror(source: string, header: string): string {
	let mirror = source.replace(header, "");
	const imports = namedTypeImports(mirror);
	mirror = replaceImportDeclarations(
		mirror,
		imports,
		({ name, module }) => `import type * as Namespace${name} from "${module}";`,
	);
	const replacements = new Map([
		...imports.map(({ name }) => [name, `Namespace${name}.${name}`] as const),
		["Thread", "NamespaceThread"] as const,
	]);
	return replaceTypeReferenceUsages(mirror, replacements);
}

export function importTypeMirror(source: string, header: string): string {
	let mirror = source.replace(header, "");
	const aliases: string[] = [];
	const imports = namedTypeImports(mirror);
	for (const { name, module } of imports)
		aliases.push(`type ImportType${name} = (import("${module}").${name});`);
	mirror = replaceImportDeclarations(mirror, imports, () => "");
	const replacements = new Map([
		...imports.map(({ name }) => [name, `ImportType${name}`] as const),
		["Thread", "ImportTypeThread"] as const,
	]);
	return `${aliases.join("\n")}\n${replaceTypeReferenceUsages(mirror, replacements)}`;
}
