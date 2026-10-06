// What a TypeScript module exposes (ADR 0044, ADR 0046): the names its root
// files export, each followed through every `export ... from` to the file that
// defines it.
//
// A module is a directory. Its root files are what its callers may import:
// the files its `package.json` `exports` names, where the directory has one
// and it names files of the checkout, and otherwise the TypeScript files
// directly in the directory (`docs/agents/boundaries.md`: a file in a
// subfolder is private). A bound `index.ts` stands for its directory.
//
// A root file exposes each declaration it exports and each public member of
// one (`Ledger.post`), and each name it passes on from another file:
// `export { a as b } from`, `export * from` and `export * as ns from`. A
// target in `exports` that names built output, such as `./dist/index.js`,
// names no file of the checkout and is left out.

import path from "node:path";
import type { Definition, ImportedName, SyntaxFacts } from "@/runtime/code-facts/lib/facts";
import type { CheckoutFiles } from "@/runtime/code-facts/lib/module-resolution";
import type { FactsPass } from "@/runtime/code-facts/lib/reader";

/** A file the TypeScript adapter reads. */
const TYPESCRIPT_FILE = /\.(?:[cm]?ts|tsx)$/u;
/** The file that stands for its directory. */
const ENTRY_FILE = /^index\.(?:[cm]?ts|tsx)$/u;
/** The TypeScript extensions a written JavaScript extension can stand for. */
const WRITTEN_FOR: Readonly<Record<string, readonly string[]>> = {
	".js": [".ts", ".tsx"],
	".jsx": [".tsx"],
	".mjs": [".mts"],
	".cjs": [".cts"],
};
/** How many files a chain of re-exports may pass through. */
const CHAIN_DEPTH = 16;

/** One name a module exposes, and the definition it reaches. */
interface ExposedName {
	/**
	 * The name as a caller spells it after importing the root file: `readBoard`,
	 * `default`, `Ledger.post` for a public member, `ns.read` through `export * as ns`.
	 */
	readonly name: string;
	/** The file that defines it, relative to the checkout. */
	readonly path: string;
	readonly definition: Definition;
	/** The files that pass it on, the root file first; empty when the root file defines it. */
	readonly via: readonly string[];
}

/**
 * Whether a path lies in a directory or is it.
 * @param directory The directory, relative to the checkout; empty for the checkout.
 * @param file The path.
 * @returns True when it does.
 */
function within(directory: string, file: string): boolean {
	return directory === "" || file === directory || file.startsWith(`${directory}/`);
}

/**
 * Every string a `package.json` `exports` value names: a target, or the
 * targets of each condition and subpath.
 * @param value The value.
 * @returns The targets.
 */
function targetsOf(value: unknown): string[] {
	if (typeof value === "string") return [value];
	if (Array.isArray(value)) return value.flatMap(targetsOf);
	if (typeof value === "object" && value !== null) return Object.values(value).flatMap(targetsOf);
	return [];
}

/**
 * The spellings a target can have among the checkout's TypeScript files:
 * itself, and the TypeScript extensions a JavaScript extension stands for.
 * @param target The target, relative to the checkout.
 * @returns Each spelling.
 */
function spellings(target: string): string[] {
	const extension = path.posix.extname(target);
	const stem = target.slice(0, target.length - extension.length);
	return [target, ...(WRITTEN_FOR[extension] ?? []).map((written) => stem + written)];
}

/**
 * The checkout's TypeScript files one `exports` target names. A `*` in it
 * stands for any path, as in a subpath pattern.
 * @param directory The package's directory.
 * @param target The target, as `exports` writes it.
 * @param files The checkout's files.
 * @returns The files.
 */
function filesOfTarget(directory: string, target: string, files: ReadonlySet<string>): string[] {
	const joined = path.posix.join(directory, target);
	return spellings(joined).flatMap((spelling) => {
		const star = spelling.indexOf("*");
		if (star === -1) return files.has(spelling) ? [spelling] : [];
		const [before, after] = [spelling.slice(0, star), spelling.slice(star + 1)];
		return [...files].filter((file) => file.startsWith(before) && file.endsWith(after));
	});
}

/**
 * The root files of a module: what its `package.json` `exports` names, where
 * it has one, and otherwise the TypeScript files directly in its directory.
 * @param pass The pass.
 * @param checkout The checkout.
 * @param directory The module's directory.
 * @returns The root files; none when a package's `exports` names no file of the checkout.
 */
async function typeScriptRootFiles(
	pass: FactsPass,
	checkout: CheckoutFiles,
	directory: string,
): Promise<string[]> {
	const manifest = await pass.read(checkout, path.posix.join(directory, "package.json"));
	const exports = manifest?.adapter === "text" ? exportsOf(manifest.text) : undefined;
	if (exports !== undefined) {
		const named = targetsOf(exports).flatMap((target) =>
			filesOfTarget(directory, target, checkout.files),
		);
		return [...new Set(named)].filter((file) => TYPESCRIPT_FILE.test(file)).toSorted();
	}
	return [...checkout.files]
		.filter(
			(file) =>
				TYPESCRIPT_FILE.test(file) &&
				path.posix.dirname(file) === (directory === "" ? "." : directory),
		)
		.toSorted();
}

/**
 * The `exports` of a `package.json`.
 * @param text The file's text.
 * @returns The value, or undefined when the file has none or is not JSON.
 */
function exportsOf(text: string): unknown {
	try {
		const parsed: unknown = JSON.parse(text);
		return typeof parsed === "object" && parsed !== null && "exports" in parsed
			? (parsed.exports ?? undefined)
			: undefined;
	} catch {
		return undefined;
	}
}

/**
 * The name a caller spells for a definition the file exposes: `default` for
 * the default export and its members.
 * @param definition The definition.
 * @param defaults The names the file exports by default.
 * @returns The name.
 */
function spelled(definition: Definition, defaults: ReadonlySet<string>): string {
	const [first = "", ...rest] = definition.symbol.split(".");
	return defaults.has(first) ? ["default", ...rest].join(".") : definition.symbol;
}

/**
 * The names one file passes on from another, renamed as the file names them.
 * @param name What the `export ... from` names.
 * @param passed What the other file exposes.
 * @returns The names the file exposes through it.
 */
function passedOn(name: ImportedName, passed: readonly ExposedName[]): ExposedName[] {
	if (name.local === "*") {
		return passed.filter((each) => each.name !== "default" && !each.name.startsWith("default."));
	}
	if (name.imported === "*")
		return passed.map((each) => ({ ...each, name: `${name.local}.${each.name}` }));
	return passed.flatMap((each) => {
		if (each.name === name.imported) return [{ ...each, name: name.local }];
		const prefix = `${name.imported}.`;
		return each.name.startsWith(prefix)
			? [{ ...each, name: `${name.local}.${each.name.slice(prefix.length)}` }]
			: [];
	});
}

/** One search for the names a root file exposes: the pass, the checkout, and the files on the chain. */
interface Search {
	readonly pass: FactsPass;
	readonly checkout: CheckoutFiles;
	readonly chain: readonly string[];
}

/**
 * The names one file exposes, each followed to the file that defines it.
 * @param search The search; its chain stops a cycle of re-exports.
 * @param file The file.
 * @returns The names; none for a file no grammar reads.
 */
async function exposedBy(search: Search, file: string): Promise<ExposedName[]> {
	if (search.chain.includes(file) || search.chain.length > CHAIN_DEPTH) return [];
	const facts = await search.pass.read(search.checkout, file);
	if (facts === undefined || facts.adapter === "text") return [];
	const deeper: Search = { ...search, chain: [...search.chain, file] };
	return [...ownExposed(facts), ...(await passedExposed(deeper, facts))];
}

/**
 * The names a file exposes that it defines itself.
 * @param facts The file's facts.
 * @returns The names.
 */
function ownExposed(facts: SyntaxFacts): ExposedName[] {
	const defaults = new Set(
		facts.definitions.flatMap((each) =>
			each.visibility === "export default" ? [each.symbol] : [],
		),
	);
	return facts.definitions.flatMap((definition): ExposedName[] =>
		definition.exposed
			? [{ name: spelled(definition, defaults), path: facts.path, definition, via: [] }]
			: [],
	);
}

/**
 * The names a file passes on from the files its `export ... from` names.
 * @param search The search, with the file on its chain.
 * @param facts The file's facts.
 * @returns The names, each with the file first among those that pass it on.
 */
async function passedExposed(search: Search, facts: SyntaxFacts): Promise<ExposedName[]> {
	const passed: ExposedName[] = [];
	for (const found of facts.imports) {
		if (!found.reexport || found.resolved === undefined) continue;
		// oxlint-disable-next-line no-await-in-loop -- one re-export at a time keeps the names in the file's order
		const further = await exposedBy(search, found.resolved);
		const names = found.names.flatMap((name) => passedOn(name, further));
		passed.push(...names.map((each) => ({ ...each, via: [facts.path, ...each.via] })));
	}
	return passed;
}

/**
 * The names a TypeScript root file exposes.
 * @param pass The pass.
 * @param checkout The checkout.
 * @param file The root file.
 * @returns Each name and the definition it reaches.
 */
function typeScriptExposedBy(
	pass: FactsPass,
	checkout: CheckoutFiles,
	file: string,
): Promise<ExposedName[]> {
	return exposedBy({ pass, checkout, chain: [] }, file);
}

export {
	ENTRY_FILE,
	type ExposedName,
	TYPESCRIPT_FILE,
	typeScriptExposedBy,
	typeScriptRootFiles,
	within,
};
