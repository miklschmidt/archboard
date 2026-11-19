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
// read, code that did not parse and names what the module exposes, a relative
// import that resolves to no file, and an import of the whole module, as
// `import * as ns`, a bare `import()` or `typeof import()` is, whose names no
// reference spells.
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
import type { Crates } from "#runtime/code-facts/rust/operations/rust-crates.ts";
import { cratesIn } from "#runtime/code-facts/rust/operations/rust-exposure.ts";
import {
	type FileFacts,
	type Import,
	type Reference,
	type SyntaxFacts,
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

/** A resolved private import in a test outside the module. */
interface TestImport {
	readonly file: string;
	readonly found: SyntaxFacts["imports"][number] & { readonly resolved: string };
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
 * @param file The file that holds the reference.
 * @param reference The reference.
 * @returns The use, or undefined.
 */
async function useOf(
	search: UseSearch,
	file: string,
	reference: SyntaxFacts["references"][number],
): Promise<OutsideUse | undefined> {
	const { line, symbol, typeOnly } = reference;
	const door = await doorOf(search, reference);
	if (door === undefined) return undefined;
	const site = await definitionSite(search.facts, search.checkout, file, symbol);
	if (site === undefined || !isModules(search, site)) return undefined;
	return { file, line, symbol, runs: runsCode(reference, site), typeOnly, site, door };
}

/**
 * The uses of a module's code in one file outside it.
 * @param search The module.
 * @param read The file's facts.
 * @returns Each use whose definition is the module's.
 */
async function usesIn(search: UseSearch, read: SyntaxFacts): Promise<OutsideUse[]> {
	const uses: OutsideUse[] = [];
	for (const reference of read.references) {
		// oxlint-disable-next-line no-await-in-loop -- one reference at a time; each search reads files the cache holds
		const use = await useOf(search, read.path, reference);
		if (use !== undefined) uses.push(use);
	}
	return uses;
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
 * Whether an import leaves the uses of a module unknown: a relative import of
 * code that resolves to no file, or an import of the module that takes it
 * whole, as `import * as ns` or a bare `import()` does.
 * @param found The import.
 * @param directory The module.
 * @returns True when it does.
 */
function opaque(found: SyntaxFacts["imports"][number], directory: string): boolean {
	if (found.resolved === undefined)
		return RELATIVE.test(found.specifier) && CODE_EXTENSION.test(found.specifier);
	if (found.reexport || !within(directory, found.resolved)) return false;
	return found.names.length === 0 || found.names.some((name) => name.imported === "*");
}

/**
 * Whether the pass read a file outside a module whole, as far as the module
 * goes: a grammar read it, no code that did not parse names what the module
 * exposes, and no import leaves the uses of the module unknown.
 * @param read The file's facts, if a grammar read it.
 * @param exposure What the module exposes.
 * @returns True when it did.
 */
function readWhole(read: FileFacts | undefined, exposure: ModuleExposure): boolean {
	if (read === undefined || read.adapter === "text" || hidesUse(read, exposure)) return false;
	return !read.imports.some((found) => opaque(found, exposure.directory));
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
	const { facts, checkout, exposure } = search;
	const uses: OutsideUse[] = [];
	const unread: string[] = [];
	const callers = exposure.outside.filter((file) => !isTestPath(file) && !isTerraformFile(file));
	for (const file of callers) {
		// oxlint-disable-next-line no-await-in-loop -- one file at a time, so the pass yields between parses
		const read = await facts.read(checkout, file);
		if (!readWhole(read, exposure)) unread.push(file);
		// oxlint-disable-next-line no-await-in-loop -- one file at a time, so the pass yields between parses
		if (read !== undefined && read.adapter !== "text") uses.push(...(await usesIn(search, read)));
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
 * Imports by external tests that bypass a module's public entry files.
 * An adapter can identify test imports inside an ordinary source path too.
 * @param facts The pass.
 * @param checkout The module's checkout.
 * @param exposure The module's public entry files and possible callers.
 * @returns One import per test and private file.
 */
async function privateTestImports(
	facts: FactsPass,
	checkout: RepoCheckout,
	exposure: ModuleExposure,
): Promise<TestImport[]> {
	const imports: TestImport[] = [];
	for (const file of exposure.outside) {
		// oxlint-disable-next-line no-await-in-loop -- one file at a time yields between parses; the pass caches each file
		const read = await facts.read(checkout, file);
		if (read === undefined || read.adapter === "text") continue;
		const crates = read.adapter === "rust" ? cratesIn(facts, checkout) : undefined;
		imports.push(...privateImportsOf(read, exposure, crates));
	}
	return imports;
}

/**
 * Whether a Rust import reaches a name that the module exposes. A Rust import names a
 * path, never a file, so `crate::paint::design::LINE` reaches the exposed
 * `design.LINE` through the root file's `pub mod design`, wherever `LINE` is
 * defined, and a glob reaches what a module it names exposes.
 * @param found The import.
 * @param exposure What the module exposes.
 * @param crates The checkout's Rust module paths, for a Rust test.
 * @param from The importing file.
 * @returns True when it does.
 */
function reachesExposed(
	found: Pick<Import, "specifier">,
	exposure: ModuleExposure,
	crates: Crates | undefined,
	from: string,
): boolean {
	if (crates === undefined) return false;
	const path = found.specifier.split("::");
	const glob = path.at(-1) === "*";
	const names = glob ? path.slice(0, -1) : path;
	return exposure.exposed.some(({ name }) => {
		const exposed = glob ? name.split(".").slice(0, -1) : name.split(".");
		if (!endsWithName(names.join("."), exposed.join("."))) return false;
		const prefix = names.slice(0, names.length - exposed.length);
		const root = crates.resolvePath(from, prefix.length === 0 ? ["self"] : prefix);
		return root?.item.length === 0 && exposure.rootFiles.includes(root.file);
	});
}

/**
 * Whether a dotted path ends with a dotted name, at a dot.
 * @param dotted The path.
 * @param name The name; an empty name ends nothing.
 * @returns True when it does.
 */
function endsWithName(dotted: string, name: string): boolean {
	return name !== "" && (dotted === name || dotted.endsWith(`.${name}`));
}

/**
 * Private imports in one external test, one per resolved file.
 * @param read The test's facts.
 * @param exposure The module's entry files.
 * @param crates The Rust module paths, when the test is Rust.
 * @returns The imports.
 */
function privateImportsOf(
	read: SyntaxFacts,
	exposure: ModuleExposure,
	crates: Crates | undefined,
): TestImport[] {
	const imports = [
		...(isTestPath(read.path) ? read.imports : []),
		...(read.testImports ?? []),
	].flatMap((found): TestImport[] => {
		const { resolved } = found;
		if (resolved === undefined || resolved.endsWith("/")) return [];
		const privateFile =
			within(exposure.directory, resolved) &&
			!exposure.rootFiles.includes(resolved) &&
			!reachesExposed(found, exposure, crates, read.path);
		return privateFile ? [{ file: read.path, found: { ...found, resolved } }] : [];
	});
	const unique = new Map<string, TestImport>();
	for (const each of imports) {
		if (!unique.has(each.found.resolved)) unique.set(each.found.resolved, each);
	}
	return [...unique.values()];
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
