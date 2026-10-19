// The graph and API checks share one syntax reader, so comments cannot invent imports and
// type imports, mocks and resolver calls cannot bypass either boundary.
import { parse } from "@babel/parser";
import { VISITOR_KEYS, type Node } from "@babel/types";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

interface Source {
	imports: string[];
	strings: { text: string; line: number }[];
	exportStar: boolean;
	bun: boolean;
}

function literal(node: Node | null | undefined): string | undefined {
	if (node?.type === "StringLiteral") return node.value;
	if (node?.type === "TemplateLiteral" && node.expressions.length === 0) {
		return node.quasis[0]?.value.cooked ?? undefined;
	}
	return undefined;
}

const sources = new Map<string, Source>();
function sourceOf(text: string): Source {
	const cached = sources.get(text);
	if (cached) return cached;
	const source: Source = { imports: [], strings: [], exportStar: false, bun: false };
	const ast = parse(text, {
		sourceType: "unambiguous",
		attachComment: false,
		plugins: ["typescript", "jsx"],
	});

	const walk = (node: Node): void => {
		if (node.type === "StringLiteral" || node.type === "TemplateElement") {
			source.strings.push({
				text: node.type === "StringLiteral" ? node.value : node.value.raw,
				line: node.loc?.start.line ?? 1,
			});
		}
		if (node.type === "ExportAllDeclaration") source.exportStar = true;
		if (node.type === "Identifier" && node.name === "Bun") source.bun = true;
		let specifier: string | undefined;
		if (
			node.type === "ImportDeclaration" ||
			node.type === "ExportAllDeclaration" ||
			node.type === "ExportNamedDeclaration"
		) {
			specifier = literal(node.source);
		} else if (node.type === "TSImportType") {
			specifier = literal(node.argument);
		} else if (node.type === "ImportExpression") {
			specifier = literal(node.source);
		} else if (
			node.type === "NewExpression" &&
			node.callee.type === "Identifier" &&
			node.callee.name === "URL"
		) {
			const base = node.arguments[1];
			const target = literal(node.arguments[0]);
			if (
				base &&
				text.slice(base.start ?? 0, base.end ?? 0).replace(/\s/g, "") === "import.meta.url" &&
				target &&
				/\.[cm]?[jt]sx?(?:[?#]|$)/.test(target)
			)
				specifier = target;
		} else if (node.type === "CallExpression") {
			const callee = text.slice(node.callee.start ?? 0, node.callee.end ?? 0).replace(/\s/g, "");
			if (
				/^(?:import|require|mock\.module|vi\.(?:mock|doMock)|import\.meta\.resolve)$/.test(callee)
			) {
				const argument = node.arguments[0];
				specifier = argument?.type === "ArgumentPlaceholder" ? undefined : literal(argument);
			}
		}
		if (specifier !== undefined) source.imports.push(specifier);
		for (const key of VISITOR_KEYS[node.type] ?? []) {
			const child = Reflect.get(node, key) as Node | (Node | null)[] | null;
			if (Array.isArray(child))
				child.forEach((entry) => {
					if (entry) walk(entry);
				});
			else if (child) walk(child);
		}
	};
	walk(ast);
	sources.set(text, source);
	return source;
}

function readSource(file: string): Source {
	return sourceOf(fs.readFileSync(file, "utf8"));
}

function sourceFiles(directory: string): string[] {
	if (!fs.existsSync(directory)) return [];
	return fs
		.readdirSync(directory, { recursive: true, encoding: "utf8" })
		.filter(
			(file) =>
				/\.[cm]?[jt]sx?$/.test(file) &&
				!file
					.split(path.sep)
					.some((part) => ["generated", "node_modules", "dist", ".git"].includes(part)),
		)
		.map((file) => path.join(directory, file));
}

interface Owner {
	id: string;
	directory: string;
	name: string;
	exports: Record<string, string>;
	imports: Record<string, string>;
}

function ownersIn(root: string, prefix: string): Owner[] {
	if (!fs.existsSync(root)) return [];
	return fs
		.readdirSync(root, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => {
			const directory = path.join(root, entry.name);
			const manifest = JSON.parse(
				fs.readFileSync(path.join(directory, "package.json"), "utf8"),
			) as { name: string; exports?: Record<string, string>; imports?: Record<string, string> };
			return {
				id: `${prefix}${entry.name}`,
				directory,
				name: manifest.name,
				exports: manifest.exports ?? {},
				imports: manifest.imports ?? {},
			};
		})
		.toSorted((left, right) => left.id.localeCompare(right.id));
}

function ownerOfFile(file: string, owners: readonly Owner[]): Owner | undefined {
	return owners.find(({ directory }) => file.startsWith(`${directory}${path.sep}`));
}

function cleanSpecifier(specifier: string): string {
	return specifier.startsWith("#")
		? (specifier.split("?")[0] ?? "")
		: (specifier.split(/[?#]/)[0] ?? "");
}

function namedOwner(specifier: string, owners: readonly Owner[]): Owner | undefined {
	return owners.find(({ name }) => specifier === name || specifier.startsWith(`${name}/`));
}

function resolveSource(
	file: string,
	specifier: string,
	owners: readonly Owner[],
): string | undefined {
	const source = cleanSpecifier(specifier);
	const named = namedOwner(source, owners);
	let target: string | undefined;
	if (named) {
		const rest = source.slice(named.name.length);
		const exported = named.exports[rest ? `.${rest}` : "."];
		target = exported === undefined ? undefined : path.resolve(named.directory, exported);
	} else if (source.startsWith("#")) {
		const owner = ownerOfFile(file, owners);
		const mapped = Object.entries(owner?.imports ?? {})
			.toSorted(([left], [right]) => right.length - left.length)
			.find(([key]) =>
				key.includes("*")
					? source.startsWith(key.split("*")[0] ?? "") && source.endsWith(key.split("*")[1] ?? "")
					: source === key,
			);
		if (owner && mapped) {
			const [key, value] = mapped;
			const star = key.indexOf("*");
			target = path.resolve(
				owner.directory,
				star < 0
					? value
					: value.replace("*", source.slice(star, source.length - (key.length - star - 1))),
			);
		}
	} else if (source.startsWith("file:")) target = fileURLToPath(source);
	else if (source.startsWith(".") || path.isAbsolute(source))
		target = path.resolve(path.dirname(file), source);
	if (target === undefined) return undefined;
	const stem = target.replace(/\.[cm]?[jt]sx?$/, "");
	const candidates = [
		target,
		`${target}.ts`,
		`${target}.tsx`,
		`${target}/index.ts`,
		`${target}/index.tsx`,
		`${stem}.ts`,
		`${stem}.tsx`,
	];
	const existing = candidates.find(
		(candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile(),
	);
	return existing ? fs.realpathSync(existing) : target;
}

export {
	cleanSpecifier,
	namedOwner,
	ownerOfFile,
	ownersIn,
	readSource,
	resolveSource,
	sourceFiles,
	sourceOf,
	type Owner,
};
