interface NamedTypeImport {
	readonly name: string;
	readonly module: string;
}

function namedTypeImports(source: string): NamedTypeImport[] {
	return [...source.matchAll(/import type \{ (\w+) \} from "([^"]+)";/gu)].map((match) => {
		const name = match[1];
		const module = match[2];
		if (!name || !module) throw new Error("Malformed generated type import");
		return { name, module };
	});
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
	for (const { name, module } of imports)
		mirror = mirror.replace(
			`import type { ${name} } from "${module}";`,
			`import type * as Namespace${name} from "${module}";`,
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
	for (const { name, module } of imports) {
		mirror = mirror.replace(`import type { ${name} } from "${module}";`, "");
		aliases.push(`type ImportType${name} = (import("${module}").${name});`);
	}
	const replacements = new Map([
		...imports.map(({ name }) => [name, `ImportType${name}`] as const),
		["Thread", "ImportTypeThread"] as const,
	]);
	return `${aliases.join("\n")}\n${replaceTypeReferenceUsages(mirror, replacements)}`;
}
