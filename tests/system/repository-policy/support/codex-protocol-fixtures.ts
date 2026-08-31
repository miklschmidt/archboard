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

export function namespaceImportMirror(source: string, header: string): string {
	let mirror = source.replace(header, "");
	for (const { name, module } of namedTypeImports(mirror)) {
		const alias = `Namespace${name}`;
		mirror = mirror.replace(
			`import type { ${name} } from "${module}";`,
			`import * as ${alias} from "${module}";`,
		);
		mirror = mirror.replace(new RegExp(`\\b${name}\\b`, "gu"), `${alias}.${name}`);
	}
	return mirror.replace(/\bThread\b/gu, "NamespaceThread");
}

export function importTypeMirror(source: string, header: string): string {
	let mirror = source.replace(header, "");
	const aliases: string[] = [];
	for (const { name, module } of namedTypeImports(mirror)) {
		const alias = `ImportType${name}`;
		mirror = mirror.replace(`import type { ${name} } from "${module}";`, "");
		mirror = mirror.replace(new RegExp(`\\b${name}\\b`, "gu"), alias);
		aliases.push(`type ${alias} = (import("${module}").${name});`);
	}
	return `${aliases.join("\n")}\n${mirror.replace(/\bThread\b/gu, "ImportTypeThread")}`;
}
