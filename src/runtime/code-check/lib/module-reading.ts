// What a module exposes and how the files outside it use it (ADR 0044, ADR
// 0046, TASK-368.10): the code's side of a container's interface, read once a
// pass for each module, however many boards draw it.
//
// A use is a reference in a file outside the module whose import leads into
// it, followed through every re-export to its definition. A test exercises
// code and is not its caller at run time, so a test file is no caller.
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

import { isTestPath, type RepoCheckout } from "@/runtime/code-check/lib/part-code";
import { type ModuleShape, terraformShape } from "@/runtime/code-check/lib/terraform-modules";
import {
	definitionSite,
	isTerraformFile,
	moduleExposure,
	runsDefinition,
	within,
	type DefinitionSite,
	type ExposedName,
	type FactsPass,
	type ModuleExposure,
	type Reference,
	type SyntaxFacts,
} from "@/runtime/code-facts/index";

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
	 * (ADR 0046, amended by TASK-367.28 and TASK-436.15).
	 */
	readonly runs: boolean;
	readonly site: DefinitionSite;
}

/** What one module exposes, and how the files outside it use it. */
interface ModuleReading {
	readonly exposure: ModuleExposure;
	readonly uses: readonly OutsideUse[];
	/** Imports of private files by tests outside the module, which never count as callers. */
	readonly testImports: readonly TestImport[];
	/** A Terraform module's shape; such a module is reached only through its outputs. */
	readonly terraform?: ModuleShape;
}

/** A resolved private import in a test outside the module. */
interface TestImport {
	readonly file: string;
	readonly found: SyntaxFacts["imports"][number] & { readonly resolved: string };
}

/** The modules one pass has read, by repository and directory, so two boards share one reading. */
type ModuleReadings = Map<string, Promise<ModuleReading | undefined>>;

/**
 * The uses of a module's code in one file outside it.
 * @param facts The pass.
 * @param checkout The checkout.
 * @param directory The module.
 * @param file The file.
 * @returns Each use whose definition is in the module.
 */
async function usesIn(
	facts: FactsPass,
	checkout: RepoCheckout,
	directory: string,
	file: string,
): Promise<OutsideUse[]> {
	const read = await facts.read(checkout, file);
	if (read === undefined || read.adapter === "text") return [];
	const into = read.references.filter(
		(reference) =>
			reference.via === "code" &&
			reference.target !== undefined &&
			within(directory, reference.target.path),
	);
	const uses: OutsideUse[] = [];
	for (const reference of into) {
		const { line, symbol } = reference;
		// oxlint-disable-next-line no-await-in-loop -- one site at a time; each search reads files the cache holds
		const site = await definitionSite(facts, checkout, file, symbol);
		if (site !== undefined && within(directory, site.path)) {
			const runs = reference.kind === "call" && runsDefinition(reference, site.definition);
			uses.push({ file, line, symbol, runs, site });
		}
	}
	return uses;
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
		return named ? [{ line: start, symbol, name: `var.${name}`, runs: true }] : [];
	});
	const outputs = [...exposed.keys()].filter((name) => name.startsWith("output."));
	const read = file.references.flatMap((reference) => {
		const { symbol, line, kind } = reference;
		const runs = kind === "call" || kind === "configured-path";
		return outputsRead(reference, calls, outputs).map((name) => ({ line, symbol, name, runs }));
	});
	return [...set, ...read].flatMap(({ name, ...use }) => {
		const site = exposed.get(name);
		return site === undefined ? [] : [{ file: file.path, ...use, site }];
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
 * What a module exposes and how the files outside it use it.
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
	if (exposure.rootFiles.every(isTerraformFile)) {
		const uses = await terraformUses(facts, checkout, exposure);
		return {
			exposure,
			uses,
			testImports,
			terraform: await terraformShape(facts, checkout, exposure),
		};
	}
	const uses: OutsideUse[] = [];
	for (const file of exposure.outside) {
		if (isTestPath(file)) continue;
		// oxlint-disable-next-line no-await-in-loop -- one file at a time, so the pass yields between parses
		uses.push(...(await usesIn(facts, checkout, exposure.directory, file)));
	}
	return { exposure, uses, testImports };
}

/**
 * Imports by external tests that bypass a module's public entry files.
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
	for (const file of exposure.outside.filter(isTestPath)) {
		// oxlint-disable-next-line no-await-in-loop -- one test at a time yields between parses; the pass caches each file
		const read = await facts.read(checkout, file);
		if (read === undefined || read.adapter === "text") continue;
		imports.push(...privateImportsOf(read, exposure));
	}
	return imports;
}

/**
 * Private imports in one external test, one per resolved file.
 * @param read The test's facts.
 * @param exposure The module's entry files.
 * @returns The imports.
 */
function privateImportsOf(read: SyntaxFacts, exposure: ModuleExposure): TestImport[] {
	const imports = read.imports.flatMap((found): TestImport[] => {
		const { resolved } = found;
		if (resolved === undefined || resolved.endsWith("/")) return [];
		const privateFile =
			within(exposure.directory, resolved) && !exposure.rootFiles.includes(resolved);
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
	const key = `${checkout.repo}\0${directory}`;
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
