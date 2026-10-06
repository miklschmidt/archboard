// What a module exposes (ADR 0044, ADR 0046): the code's side of a
// container's interface, which the code check holds against the interface a
// board derives.
//
// Each language says what its module is and what it exposes, so the rule sits
// behind the adapter seam, one entry for each adapter that reads a language.
// TypeScript's module is a directory, and it exposes what its root files
// export (typescript-exposure.ts). A language whose adapter has no rule here
// exposes nothing the check can read, and the check says so. Python adds its
// rule with its adapter (TASK-367.08): a package's `__init__.py`, and the names
// `__all__` lists or that do not start with `_`.

import type { CheckoutFiles } from "@/runtime/code-facts/lib/module-resolution";
import type { FactsPass } from "@/runtime/code-facts/lib/reader";
import {
	ENTRY_FILE,
	type ExposedName,
	TYPESCRIPT_FILE,
	typeScriptExposedBy,
	typeScriptRootFiles,
	within,
} from "@/runtime/code-facts/lib/typescript-exposure";

/** What one language says about its modules. */
interface ExposureRule {
	/**
	 * Whether a file is written in the language, so it can use a module of it.
	 * @param file The file, relative to its checkout.
	 */
	readonly writes: (file: string) => boolean;
	/**
	 * Whether a file stands for the module its directory is, as `index.ts` does.
	 * @param name The file's name, without its directory.
	 */
	readonly entry: (name: string) => boolean;
	/**
	 * The files of a module that callers may use; none when it has none the rule can read.
	 * @param pass The pass.
	 * @param checkout The checkout.
	 * @param directory The module's directory.
	 */
	readonly rootFiles: (
		pass: FactsPass,
		checkout: CheckoutFiles,
		directory: string,
	) => Promise<string[]>;
	/**
	 * The names one root file exposes, each followed to its definition.
	 * @param pass The pass.
	 * @param checkout The checkout.
	 * @param file The root file.
	 */
	readonly exposedBy: (
		pass: FactsPass,
		checkout: CheckoutFiles,
		file: string,
	) => Promise<ExposedName[]>;
}

/** TypeScript's rule: a directory whose root files export what it exposes. */
const TYPESCRIPT: ExposureRule = {
	/**
	 * Whether a file is TypeScript or TSX.
	 * @param file The file.
	 * @returns True when it is.
	 */
	writes: (file) => TYPESCRIPT_FILE.test(file),
	/**
	 * Whether a file is an `index` file.
	 * @param name The file's name.
	 * @returns True when it is.
	 */
	entry: (name) => ENTRY_FILE.test(name),
	rootFiles: typeScriptRootFiles,
	exposedBy: typeScriptExposedBy,
};

/** The rule of each adapter that reads a language. */
const RULES: readonly ExposureRule[] = [TYPESCRIPT];

/** What one module exposes, and where its callers can be. */
interface ModuleExposure {
	/** The module's directory, relative to the checkout. */
	readonly directory: string;
	/** The files callers may use, relative to the checkout. */
	readonly rootFiles: readonly string[];
	/** Each name a root file exposes, in the root files' order. */
	readonly exposed: readonly ExposedName[];
	/** Every file outside the module written in its language: where a caller can be. */
	readonly outside: readonly string[];
}

/**
 * The module a bound path names: a directory, or the file that stands for
 * the directory that holds it, such as an `index.ts`.
 * @param bound The path, relative to its checkout.
 * @param kind Whether it is a file or a directory.
 * @returns The module's directory, or undefined when the path names no module.
 */
function moduleOf(bound: string, kind: "file" | "directory"): string | undefined {
	if (kind === "directory") return bound;
	const slash = bound.lastIndexOf("/");
	const name = bound.slice(slash + 1);
	return RULES.some((rule) => rule.entry(name)) ? bound.slice(0, Math.max(slash, 0)) : undefined;
}

/**
 * What a module exposes, by the rule of the first language whose root files
 * it has.
 * @param pass The pass.
 * @param checkout The checkout and the files the pass may read.
 * @param directory The module's directory, relative to the checkout.
 * @returns What it exposes, or undefined when no rule finds a root file.
 */
async function moduleExposure(
	pass: FactsPass,
	checkout: CheckoutFiles,
	directory: string,
): Promise<ModuleExposure | undefined> {
	for (const rule of RULES) {
		// oxlint-disable-next-line no-await-in-loop -- the first language whose root files the module has decides, so later rules are never read
		const rootFiles = await rule.rootFiles(pass, checkout, directory);
		if (rootFiles.length === 0) continue;
		const exposed: ExposedName[] = [];
		for (const file of rootFiles) {
			// oxlint-disable-next-line no-await-in-loop -- one root file at a time keeps the names in the root files' order
			exposed.push(...(await rule.exposedBy(pass, checkout, file)));
		}
		const outside = [...checkout.files]
			.filter((file) => rule.writes(file) && !within(directory, file))
			.toSorted();
		return { directory, rootFiles, exposed, outside };
	}
	return undefined;
}

export { type ExposedName, type ModuleExposure, moduleExposure, moduleOf, within };
