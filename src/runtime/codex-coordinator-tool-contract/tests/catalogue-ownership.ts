import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const NAMESPACE_NAMES = new Set(["archboard_workhorse", "archboard_voice"]);

function sourceFiles(root: string): string[] {
	return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
		const file = path.join(root, entry.name);
		return entry.isDirectory()
			? sourceFiles(file)
			: entry.name.endsWith(".ts") || entry.name.endsWith(".tsx") || entry.name.endsWith(".json")
				? [file]
				: [];
	});
}

interface Token {
	readonly kind: "string" | "identifier" | "punctuation";
	readonly value: string;
}

function tokenizeTypeScript(source: string): Token[] {
	const tokens: Token[] = [];
	for (let index = 0; index < source.length;) {
		const character = source[index]!;
		if (/\s/.test(character)) {
			index += 1;
			continue;
		}
		if (character === "/" && source[index + 1] === "/") {
			index = source.indexOf("\n", index + 2);
			if (index < 0) {
				break;
			}
			continue;
		}
		if (character === "/" && source[index + 1] === "*") {
			const end = source.indexOf("*/", index + 2);
			index = end < 0 ? source.length : end + 2;
			continue;
		}
		if (character === "`" || character === "'" || character === '"') {
			const quote = character;
			let end = index + 1;
			while (end < source.length) {
				if (source[end] === "\\") {
					end += 2;
					continue;
				}
				if (source[end] === quote) {
					const raw = source.slice(index + 1, end);
					if (quote === "'") {
						tokens.push({ kind: "string", value: raw.replaceAll("\\'", "'") });
					} else if (quote === '"') {
						try {
							tokens.push({ kind: "string", value: JSON.parse(`"${raw}"`) as string });
						} catch {
							return tokens;
						}
					}
					index = end + 1;
					break;
				}
				end += 1;
			}
			if (end >= source.length) {
				break;
			}
			continue;
		}
		if (/[A-Za-z_$]/.test(character)) {
			let end = index + 1;
			while (end < source.length && /[A-Za-z0-9_$]/.test(source[end]!)) {
				end += 1;
			}
			tokens.push({ kind: "identifier", value: source.slice(index, end) });
			index = end;
			continue;
		}
		tokens.push({ kind: "punctuation", value: character });
		index += 1;
	}
	return tokens;
}

function hasTypeScriptCatalogueDefinition(source: string): boolean {
	const tokens = tokenizeTypeScript(source);
	const closingBraces = new Map<number, number>();
	const openBraces: number[] = [];
	for (const [index, token] of tokens.entries()) {
		if (token.value === "{") {
			openBraces.push(index);
		}
		if (token.value === "}") {
			const opening = openBraces.pop();
			if (opening !== undefined) {
				closingBraces.set(opening, index);
			}
		}
	}
	for (const [opening, closing] of closingBraces) {
		let depth = 0;
		const properties = new Map<string, string | true>();
		for (let index = opening + 1; index < closing; index += 1) {
			const token = tokens[index]!;
			if (token.value === "{" || token.value === "[" || token.value === "(") {
				depth += 1;
			}
			if (token.value === "}" || token.value === "]" || token.value === ")") {
				depth -= 1;
			}
			if (depth !== 0 || (token.kind !== "identifier" && token.kind !== "string")) {
				continue;
			}
			if (tokens[index + 1]?.value !== ":") {
				continue;
			}
			const value = tokens[index + 2];
			properties.set(token.value, value?.kind === "string" ? value.value : true);
		}
		const type = properties.get("type");
		const name = properties.get("name");
		const namespace = properties.get("namespace");
		if (
			(type === "namespace" && typeof name === "string" && NAMESPACE_NAMES.has(name)) ||
			(typeof namespace === "string" && NAMESPACE_NAMES.has(namespace) && properties.has("tools"))
		) {
			return true;
		}
	}
	return false;
}

function hasJsonCatalogueDefinition(source: string): boolean {
	let value: unknown;
	try {
		value = JSON.parse(source) as unknown;
	} catch {
		return false;
	}
	function visit(candidate: unknown): boolean {
		if (Array.isArray(candidate)) {
			return candidate.some(visit);
		}
		if (typeof candidate !== "object" || candidate === null) {
			return false;
		}
		const record = candidate as Record<string, unknown>;
		if (
			record["type"] === "namespace" &&
			typeof record["name"] === "string" &&
			NAMESPACE_NAMES.has(record["name"])
		) {
			return true;
		}
		if (
			typeof record["namespace"] === "string" &&
			NAMESPACE_NAMES.has(record["namespace"]) &&
			Array.isArray(record["tools"])
		) {
			return true;
		}
		return Object.values(record).some(visit);
	}
	return visit(value);
}

function hasCatalogueDefinition(fileName: string, source: string): boolean {
	return path.extname(fileName) === ".json"
		? hasJsonCatalogueDefinition(source)
		: hasTypeScriptCatalogueDefinition(source);
}

function definitionsOutsideOwner(
	sources: ReadonlyArray<{ fileName: string; source: string }>,
	ownerRoot: string,
): string[] {
	return sources
		.filter(({ fileName, source }) => hasCatalogueDefinition(fileName, source))
		.filter(({ fileName }) => !fileName.startsWith(ownerRoot + path.sep))
		.map(({ fileName }) => fileName);
}

function ownerOfDefinition(fileName: string, ownerRoot: string): string {
	return fileName.startsWith(ownerRoot + path.sep) ? ownerRoot : path.dirname(fileName);
}

function realCatalogueDefinitions(root: string): string[] {
	return sourceFiles(root).filter((file) =>
		hasCatalogueDefinition(file, readFileSync(file, "utf8")),
	);
}

export {
	sourceFiles,
	hasTypeScriptCatalogueDefinition,
	hasJsonCatalogueDefinition,
	hasCatalogueDefinition,
	definitionsOutsideOwner,
	ownerOfDefinition,
	realCatalogueDefinitions,
};
