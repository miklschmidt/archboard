// What a TypeScript module is (ADR 0044, ADR 0046): a directory, and the root
// files its callers may import.
//
// The root files are the files the directory's `package.json` `exports`
// names, where it has one and it names files of the checkout, and otherwise
// the TypeScript files directly in the directory (`docs/agents/boundaries.md`:
// a file in a subfolder is private). A bound `index.ts` stands for its
// directory. A target in `exports` that names built output, such as
// `./dist/index.js`, names no file of the checkout and is left out.

import path from "node:path";
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

export { ENTRY_FILE, TYPESCRIPT_FILE, typeScriptRootFiles };
