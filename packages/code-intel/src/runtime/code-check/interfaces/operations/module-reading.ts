// What a module exposes and how the files outside it use it (ADR 0044, ADR
// 0046, TASK-368.10): the code's side of a container's interface, read once a
// pass for each module, however many documents draw it.
//
// A use is a reference in a file outside the module whose import leads to a
// definition inside it, or to a name it passes on from another module,
// followed through every re-export: through the module's own root files, its
// door, or through another module that passes the name on (TASK-646.05). A
// test exercises code and is not its caller at run time, so a test file is no
// caller. The files outside that the pass could not read whole are named, so
// a judge never takes an incomplete read for a complete one: a file no grammar
// read that writes a name the module exposes, as JavaScript, a Vue or a Svelte
// component can import TypeScript, code that did not parse and names what the module exposes, a relative
// import that resolves to no file, and an import of the whole module, as
// `import * as ns`, a bare `import()` or `typeof import()` is, whose names no
// reference spells. In Rust, so is a file with a use that leads to a name in
// the module that no definition answers, as a function a macro makes; a path
// to a crate's root reaches the macros it exports (TASK-646.16).
//
// Terraform and OpenTofu name no definition through an import: a module call
// passes the module its arguments and reads its outputs (TASK-368.11). Each
// argument a call outside the module sets is a use of the variable it sets,
// and each `module.<call>.<output>` that a file of the calling module names
// is a use of that output. A reference to the whole call, as
// `value = module.<call>` passes every output on, uses each of them, but in
// `depends_on`, which only orders. Outside configuration can reach a Terraform
// module only through its outputs, so no caller reaches past them, and the
// reading carries the module's shape (terraform-modules.ts).

import { isTestPath, type RepoCheckout } from "#runtime/code-check/operations/part-code.ts";
import {
	type ModuleShape,
	terraformShape,
} from "#runtime/code-check/interfaces/operations/terraform-modules.ts";
import {
	definitionSite,
	type DefinitionSite,
} from "#runtime/code-facts/operations/definition-site.ts";
import { isTerraformFile } from "#runtime/code-facts/terraform/operations/terraform-address.ts";
import {
	moduleExposure,
	within,
	type ExposedName,
	type ModuleExposure,
} from "#runtime/code-facts/modules/operations/module-exposure.ts";
import { runsDefinition } from "#runtime/code-facts/operations/runs.ts";
import { type FactsPass } from "#runtime/code-facts/services/reader.ts";
import {
	privateTestImports,
	type TestImport,
} from "#runtime/code-check/interfaces/operations/test-imports.ts";
import {
	type Import,
	type Reference,
	type SyntaxFacts,
	type Target,
} from "#runtime/code-facts/operations/facts.ts";

/** A module call's argument, `module.queue.var.name`: the value it gives the variable `name`. */
const ARGUMENT = /^(module\.[^.]+)\.var\.([^.]+)$/u;

/** One use of a module's code by a file outside it. */
interface OutsideUse {
	readonly file: string;
	readonly line: number;
	readonly symbol: string;
	/**
	 * Whether the use runs the code it reaches: a use only as a type does not,
	 * nor does a use as a value, except a known function passed as an argument
	 * (TASK-367.28, TASK-436.15).
	 */
	readonly runs: boolean;
	/** A use only as a type, which reads no value. */
	readonly typeOnly: boolean;
	readonly site: DefinitionSite;
	/** It comes through the module's own root files, not through another module that passes the name on. */
	readonly door: boolean;
}

/** What one module exposes, and how the files outside it use it. */
interface ModuleReading {
	readonly exposure: ModuleExposure;
	readonly uses: readonly OutsideUse[];
	/** Imports of private files by tests outside the module, which never count as callers. */
	readonly testImports: readonly TestImport[];
	/** The files outside the module, tests aside, that the pass could not read whole. */
	readonly unread: readonly string[];
	/** A Terraform module's shape; such a module is reached only through its outputs. */
	readonly terraform?: ModuleShape;
}

/** The modules one pass has read, by repository and directory, so two documents share one reading. */
type ModuleReadings = Map<string, Promise<ModuleReading | undefined>>;

/**
 * Whether a reference runs the definition it reaches, including a passed function.
 * @param reference The reference.
 * @param site The definition it reaches.
 * @returns True for a run-time use that can run the definition's code.
 */
function runsCode(reference: Reference, site: DefinitionSite): boolean {
	return reference.kind === "call" && runsDefinition(reference, site.definition);
}

/** What finding the uses of one module in the files outside it reads. */
interface UseSearch {
	readonly facts: FactsPass;
	readonly checkout: RepoCheckout;
	readonly exposure: ModuleExposure;
	/** The names the module passes on from files outside it. */
	readonly passed: readonly ExposedName[];
}

/**
 * Whether a definition is the module's: inside it, or a name it passes on.
 * @param search The module.
 * @param site The definition.
 * @returns True when it is.
 */
function isModules(search: UseSearch, site: DefinitionSite): boolean {
	if (within(search.exposure.directory, site.path)) return true;
	return search.passed.some(
		(name) => name.path === site.path && name.definition.start === site.definition.start,
	);
}

/**
 * Whether a reference whose import leads outside the module can still reach
 * it: the file it leads to defines a name the module passes on, or passes
 * names on itself.
 * @param search The module.
 * @param target The file the import leads to.
 * @returns True when it can.
 */
async function leadsOn(search: UseSearch, target: string): Promise<boolean> {
	if (search.passed.some((name) => name.path === target)) return true;
	const read = await search.facts.read(search.checkout, target);
	return (
		read !== undefined && read.adapter !== "text" && read.imports.some((each) => each.reexport)
	);
}

/**
 * Whether a reference reaches a module through its own root files, or through
 * a file outside it that can lead into it.
 * @param search The module.
 * @param reference The reference.
 * @returns True through its root files, false through another file, or
 * undefined when it cannot reach the module.
 */
async function doorOf(
	search: UseSearch,
	reference: SyntaxFacts["references"][number],
): Promise<boolean | undefined> {
	const { target } = reference;
	if (reference.via !== "code" || target === undefined) return undefined;
	if (within(search.exposure.directory, target.path)) return true;
	return (await leadsOn(search, target.path)) ? false : undefined;
}

/**
 * The use one reference makes of a module's code, if it reaches the module.
 * @param search The module.
 * @param read The facts of the file that holds the reference.
 * @param reference The reference.
 * @returns The use, `unresolved` where it reaches a name the check cannot
 * resolve, or undefined.
 */
async function useOf(
	search: UseSearch,
	read: SyntaxFacts,
	reference: SyntaxFacts["references"][number],
): Promise<OutsideUse | "unresolved" | undefined> {
	const { line, symbol, typeOnly } = reference;
	const door = await doorOf(search, reference);
	if (door === undefined) return undefined;
	const file = read.path;
	const site = await siteOf(search, file, reference);
	if (site === undefined)
		return door && (await unresolved(search, read, reference.target)) ? "unresolved" : undefined;
	if (!isModules(search, site)) return undefined;
	return { file, line, symbol, runs: runsCode(reference, site), typeOnly, site, door };
}

/**
 * Whether a name in a module's own files that a use of a language in
 * `NAMED_ONLY` leads to, not a member, is one the check cannot resolve: its
 * file neither defines it nor brings it in, as a function a macro defines.
 * @param search The module.
 * @param read The facts of the file that holds the use.
 * @param target Where the use leads.
 * @returns True when it is.
 */
async function unresolved(
	search: UseSearch,
	read: SyntaxFacts,
	target: Target | undefined,
): Promise<boolean> {
	if (!NAMED_ONLY.has(read.adapter) || target === undefined || !NAME_ALONE.test(target.symbol))
		return false;
	const there = await search.facts.read(search.checkout, target.path);
	if (there === undefined || there.adapter === "text") return false;
	return !there.imports.some((found) => brings(found, target.symbol));
}

/**
 * Where the code a reference names is defined: the site its file's imports
 * lead to, else a macro the module exports at its crate's root.
 * @param search The module.
 * @param file The file that holds the reference.
 * @param reference The reference.
 * @returns The site, or undefined.
 */
async function siteOf(
	search: UseSearch,
	file: string,
	reference: SyntaxFacts["references"][number],
): Promise<DefinitionSite | undefined> {
	const site = await definitionSite(search.facts, search.checkout, file, reference.symbol);
	return site ?? exportedMacro(search, reference.target);
}

/**
 * The macro a path to a root file of a module names, where the module exports
 * it with `#[macro_export]`: Rust puts such a macro at its crate's root,
 * whichever file of the crate defines it, as `core::gv_info!` names the macro
 * `diag.rs` defines.
 * @param search The module.
 * @param target Where the use leads.
 * @returns The macro's site, or undefined.
 */
function exportedMacro(search: UseSearch, target: Target | undefined): DefinitionSite | undefined {
	const { exposed, rootFiles } = search.exposure;
	if (target === undefined || !rootFiles.includes(target.path)) return undefined;
	const macro = exposed.find(
		({ definition }) =>
			definition.visibility === "macro_export" && definition.symbol === target.symbol,
	);
	return macro === undefined
		? undefined
		: { path: macro.path, definition: macro.definition, via: [] };
}

/** A name of a module itself: neither the whole module, `*`, nor a member. */
const NAME_ALONE = /^[^.*]+$/u;

/**
 * Whether an import brings a name in.
 * @param found The import.
 * @param name The name.
 * @returns True when it does.
 */
function brings(found: Import, name: string): boolean {
	return found.names.some((each) => each.local === name);
}

/**
 * The uses of a module's code in one file outside it, and whether the pass
 * read the file whole.
 * @param search The module.
 * @param file The file.
 * @returns Each use whose definition is the module's, and whether it read the file whole.
 */
async function usesIn(
	search: UseSearch,
	file: string,
): Promise<{ readonly uses: OutsideUse[]; readonly whole: boolean }> {
	const read = await search.facts.read(search.checkout, file);
	if (read === undefined) return { uses: [], whole: false };
	if (read.adapter === "text") return { uses: [], whole: !mayUse(read.text, search.exposure) };
	const uses: OutsideUse[] = [];
	let whole = readWhole(read, search.exposure);
	for (const reference of read.references) {
		// oxlint-disable-next-line no-await-in-loop -- one reference at a time; each search reads files the cache holds
		const use = await useOf(search, read, reference);
		if (use === "unresolved") whole = false;
		else if (use !== undefined) uses.push(use);
	}
	return { uses, whole };
}

/** A word a file may write: a name, as JavaScript spells one. */
const WORD = /[\p{L}\p{N}_$]+/gu;

/**
 * Whether a file no grammar reads, such as JavaScript or a Vue component
 * beside TypeScript, may use a module: it writes one of the names the module
 * exposes, or the module exports a default, which an import names freely.
 * @param text The file's text.
 * @param exposure What the module exposes.
 * @returns True when it may.
 */
function mayUse(text: string, exposure: ModuleExposure): boolean {
	const words = new Set(text.match(WORD));
	return exposure.exposed.some(({ name }) => {
		const [first = name] = name.split(".");
		return first === "default" || words.has(first);
	});
}

/** A specifier that names a file by a path from the importing file. */
const RELATIVE = /^\.\.?\//u;
/** The extensions a relative import of code writes, or none. */
const CODE_EXTENSION = /(?:^|\/)[^./]+$|\.[cm]?[jt]sx?$/u;

/**
 * Whether code that did not parse may hide a use of a module: it names one
 * of the names the module exposes, which the grammar records even there.
 * @param read The file's facts.
 * @param exposure What the module exposes.
 * @returns True when it may.
 */
function hidesUse(read: SyntaxFacts, exposure: ModuleExposure): boolean {
	const named = new Set(read.unparsed.flatMap((region) => region.names));
	return exposure.exposed.some((name) => named.has(name.name.split(".")[0] ?? name.name));
}

/**
 * The adapters whose code reaches a module it takes whole only by names it
 * writes, each a use the grammar reads: Rust's `use crate::timing;` and `mod
 * timing;` (TASK-646.10). Code no grammar follows can index a whole module.
 */
const NAMED_ONLY: ReadonlySet<SyntaxFacts["adapter"]> = new Set(["rust"]);

/**
 * The languages whose import of a whole module brings its names in under
 * their own names, as C's `#include` and Swift's `import` do, and those of
 * `NAMED_ONLY`: each use spells the name it reaches, and the resolver finds it
 * (TASK-646.12).
 */
const NAMES_EACH_USE: ReadonlySet<SyntaxFacts["adapter"]> = new Set([
	...NAMED_ONLY,
	"c",
	"cpp",
	"objc",
	"swift",
]);

/**
 * Whether an import leaves the uses of a module unknown: a relative import of
 * code that resolves to no file, or an import of the module that takes it
 * whole, as `import * as ns` or a bare `import()` does, in a language whose
 * code can reach its names by other means than writing them.
 * @param found The import.
 * @param directory The module.
 * @param adapter The language of the importing file.
 * @returns True when it does.
 */
function opaque(
	found: SyntaxFacts["imports"][number],
	directory: string,
	adapter: SyntaxFacts["adapter"],
): boolean {
	if (found.resolved === undefined)
		return RELATIVE.test(found.specifier) && CODE_EXTENSION.test(found.specifier);
	if (found.reexport || !within(directory, found.resolved)) return false;
	return !NAMES_EACH_USE.has(adapter) && takesWhole(found);
}

/**
 * Whether an import takes a module whole, as `import * as ns` or a bare `import()` does.
 * @param found The import.
 * @returns True when it does.
 */
function takesWhole(found: SyntaxFacts["imports"][number]): boolean {
	return found.names.length === 0 || found.names.some((name) => name.imported === "*");
}

/**
 * Whether the pass read a file outside a module whole, as far as its imports
 * go: no code that did not parse names what the module exposes, and no
 * import leaves the uses of the module unknown.
 * @param read The file's facts.
 * @param exposure What the module exposes.
 * @returns True when it did.
 */
function readWhole(read: SyntaxFacts, exposure: ModuleExposure): boolean {
	if (hidesUse(read, exposure)) return false;
	return !read.imports.some((found) => opaque(found, exposure.directory, read.adapter));
}

/**
 * The directory of a file, `""` for the checkout's root.
 * @param file The file.
 * @returns Its directory.
 */
function directoryOf(file: string): string {
	return file.slice(0, Math.max(file.lastIndexOf("/"), 0));
}

/**
 * The facts of each file outside a module that may call it, a test aside.
 * @param facts The pass.
 * @param checkout The checkout.
 * @param exposure What the module exposes, and the files outside it.
 * @returns The facts of each file an adapter read.
 */
async function outsideFacts(
	facts: FactsPass,
	checkout: RepoCheckout,
	exposure: ModuleExposure,
): Promise<SyntaxFacts[]> {
	const read: SyntaxFacts[] = [];
	for (const file of exposure.outside.filter((each) => !isTestPath(each))) {
		// oxlint-disable-next-line no-await-in-loop -- one file at a time, so the pass yields between parses
		const found = await facts.read(checkout, file);
		if (found !== undefined && found.adapter !== "text") read.push(found);
	}
	return read;
}

/**
 * The outputs of a Terraform module one reference in a calling module reads:
 * the one `module.queue.url` names, and every output for a reference to the
 * whole call, as `value = module.queue` passes them on. A reference in
 * `depends_on` only orders, and reads none.
 * @param reference The reference.
 * @param calls The calls of the module its directory makes, `module.queue`.
 * @param outputs The module's outputs, `output.url`.
 * @returns The outputs it reads.
 */
function outputsRead(
	reference: Reference,
	calls: ReadonlySet<string>,
	outputs: readonly string[],
): readonly string[] {
	if (reference.via !== "code" || reference.argument === "depends_on") return [];
	const [module, call, output] = reference.symbol.split(".");
	if (!calls.has(`${module}.${call}`)) return [];
	return output === undefined ? outputs : [`output.${output}`];
}

/**
 * The uses of a Terraform module through its calls in one file of a calling
 * module: each argument a call sets, and each output a reference reads.
 * @param file The file.
 * @param calls The calls of the module its directory makes, `module.queue`.
 * @param exposed The module's variables and outputs, by name.
 * @returns The uses.
 */
function callUses(
	file: SyntaxFacts,
	calls: ReadonlySet<string>,
	exposed: ReadonlyMap<string, ExposedName>,
): OutsideUse[] {
	const set = file.definitions.flatMap(({ symbol, start, visibility }) => {
		const [, call = "", name] = ARGUMENT.exec(symbol) ?? [];
		const named = visibility === "argument" && calls.has(call);
		return named ? [{ line: start, symbol, name: `var.${name}`, runs: true, typeOnly: false }] : [];
	});
	const outputs = [...exposed.keys()].filter((name) => name.startsWith("output."));
	const read = file.references.flatMap((reference) => {
		const { symbol, line, kind } = reference;
		const runs = kind === "call" || kind === "configured-path";
		const { typeOnly } = reference;
		return outputsRead(reference, calls, outputs).map((name) => ({
			line,
			symbol,
			name,
			runs,
			typeOnly,
		}));
	});
	return [...set, ...read].flatMap(({ name, ...use }) => {
		const site = exposed.get(name);
		return site === undefined ? [] : [{ file: file.path, ...use, site, door: true }];
	});
}

/**
 * How the configuration outside a Terraform module uses it: a call whose
 * local source leads to the module passes it arguments, and the files of the
 * calling module read its outputs through the call.
 * @param facts The pass.
 * @param checkout The checkout.
 * @param exposure What the module exposes.
 * @returns The uses.
 */
async function terraformUses(
	facts: FactsPass,
	checkout: RepoCheckout,
	exposure: ModuleExposure,
): Promise<OutsideUse[]> {
	const files = await outsideFacts(facts, checkout, exposure);
	const calls = new Map<string, Set<string>>();
	for (const file of files) {
		const into = file.imports.filter((each) => each.resolved === exposure.directory);
		const names = into.flatMap((each) => each.names.map((name) => name.local));
		const directory = directoryOf(file.path);
		if (names.length > 0)
			calls.set(directory, new Set([...(calls.get(directory) ?? []), ...names]));
	}
	const exposed = new Map(exposure.exposed.map((each) => [each.name, each]));
	return files.flatMap((file) => {
		const made = calls.get(directoryOf(file.path));
		return made === undefined ? [] : callUses(file, made, exposed);
	});
}

/**
 * What a module exposes, leaving out a file of tests at its root, such as
 * `ledger.test.ts` beside `ledger.ts`: a test exposes nothing to a caller.
 * @param exposure What the module's root files expose.
 * @returns It without the tests, or undefined when only tests are at its root.
 */
function withoutTests(exposure: ModuleExposure | undefined): ModuleExposure | undefined {
	if (exposure === undefined) return undefined;
	const { directory } = exposure;
	const rootFiles = exposure.rootFiles.filter(
		(file) => !isTestPath(directory === "" ? file : file.slice(directory.length + 1)),
	);
	if (rootFiles.length === 0) return undefined;
	const exposed = exposure.exposed.filter((name) => rootFiles.includes(name.via[0] ?? name.path));
	return { ...exposure, rootFiles, exposed };
}

/**
 * The Terraform or OpenTofu part of what a module exposes.
 * @param exposure What the module exposes in every language it holds.
 * @returns That part, or undefined when the module has no configuration file at its root.
 */
function terraformPart(exposure: ModuleExposure): ModuleExposure | undefined {
	const rootFiles = exposure.rootFiles.filter(isTerraformFile);
	if (rootFiles.length === 0) return undefined;
	const exposed = exposure.exposed.filter((name) => isTerraformFile(name.path));
	const outside = exposure.outside.filter(isTerraformFile);
	return { directory: exposure.directory, rootFiles, exposed, outside };
}

/**
 * The uses of a module by the files outside it that may call it, Terraform
 * and tests aside, and those of them the pass could not read whole.
 * @param search The module.
 * @returns The uses and the unread files.
 */
async function callerUses(
	search: UseSearch,
): Promise<{ readonly uses: OutsideUse[]; readonly unread: string[] }> {
	const uses: OutsideUse[] = [];
	const unread: string[] = [];
	const callers = search.exposure.outside.filter(
		(file) => !isTestPath(file) && !isTerraformFile(file),
	);
	for (const file of callers) {
		// oxlint-disable-next-line no-await-in-loop -- one file at a time, so the pass yields between parses
		const found = await usesIn(search, file);
		if (!found.whole) unread.push(file);
		uses.push(...found.uses);
	}
	return { uses, unread };
}

/**
 * What a module exposes and how the files outside it use it: the
 * configuration outside it through its module calls, and every other file
 * through the names it imports.
 * @param facts The pass.
 * @param checkout The module's checkout.
 * @param exposure What the module exposes.
 * @returns The reading.
 */
async function readModule(
	facts: FactsPass,
	checkout: RepoCheckout,
	exposure: ModuleExposure,
): Promise<ModuleReading> {
	const testImports = await privateTestImports(facts, checkout, exposure);
	const passed = exposure.exposed.filter((name) => !within(exposure.directory, name.path));
	const { uses, unread } = await callerUses({ facts, checkout, exposure, passed });
	const terraform = terraformPart(exposure);
	if (terraform === undefined) return { exposure, uses, testImports, unread };
	uses.push(...(await terraformUses(facts, checkout, terraform)));
	return {
		exposure,
		uses,
		testImports,
		unread,
		terraform: await terraformShape(facts, checkout, terraform),
	};
}

/**
 * What a module exposes and how the files outside it use it, read once in a pass.
 * @param reading The pass, and the modules it has read.
 * @param reading.facts The pass.
 * @param reading.modules The modules it has read.
 * @param checkout The module's checkout.
 * @param directory The module.
 * @returns The reading, or undefined when no language the check reads has a root file there.
 */
function moduleReading(
	reading: { readonly facts: FactsPass; readonly modules: ModuleReadings },
	checkout: RepoCheckout,
	directory: string,
): Promise<ModuleReading | undefined> {
	const key = `${checkout.root}\0${directory}`;
	let found = reading.modules.get(key);
	if (found === undefined) {
		found = (async () => {
			const exposure = withoutTests(await moduleExposure(reading.facts, checkout, directory));
			return exposure === undefined ? undefined : readModule(reading.facts, checkout, exposure);
		})();
		reading.modules.set(key, found);
	}
	return found;
}

export { type ModuleReading, type ModuleReadings, type OutsideUse, moduleReading };
