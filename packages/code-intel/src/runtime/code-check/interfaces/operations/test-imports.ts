// Imports by tests outside a module of its private files, which pass by the
// module's root files. A test is never a caller, so these are no uses: the
// check names them apart. A Rust import names a path, never a
// file, so one that reaches a name the module exposes is no such import.

import { isTestPath, type RepoCheckout } from "#runtime/code-check/operations/part-code.ts";
import {
	within,
	type ModuleExposure,
} from "#runtime/code-facts/modules/operations/module-exposure.ts";
import type { Import, SyntaxFacts } from "#runtime/code-facts/operations/facts.ts";
import type { Crates } from "#runtime/code-facts/rust/operations/rust-crates.ts";
import { cratesIn } from "#runtime/code-facts/rust/operations/rust-exposure.ts";
import { type FactsPass } from "#runtime/code-facts/services/reader.ts";

/** A resolved private import in a test outside the module. */
interface TestImport {
	readonly file: string;
	readonly found: SyntaxFacts["imports"][number] & { readonly resolved: string };
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

export { type TestImport, privateTestImports };
