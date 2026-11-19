// The uses of a module's names by its own files (TASK-646.17, decision 16).
//
// A folder module with no declared interface, no file that stands for it
// (such as `index.ts`, `__init__.py`, `mod.rs` or a project file) and no
// `package.json` `exports`, exposes every export of the files directly in
// it. Such a language makes a file export a name so that another file of the
// module can import it, and cannot hide that name from other folders. So in
// such a module, a name another of its files imports counts as used. A
// language whose files of one module see each other without an import, as
// Go's and Swift's do, gives no such use: an exported name only they use
// stays unused, and the remedy there is to stop exporting it.
//
// What a sibling use keeps used stays visible (TASK-646.18, decision 17):
// such a module gets `INTERFACE_UNDECLARED`, information, which says how many
// of its names files outside it use and how many only its own files import.

import {
	type ExposedName,
	moduleOf,
	within,
} from "#runtime/code-facts/modules/operations/module-exposure.ts";
import { definitionSite } from "#runtime/code-facts/operations/definition-site.ts";
import {
	type DepthFinding,
	type DepthReading,
	reaches,
	usesOf,
} from "#runtime/module-depth/operations/depth-reading.ts";

/** A use of a module's name by one of its own files. */
interface SiblingUse {
	readonly file: string;
	readonly site: { readonly path: string; readonly definition: ExposedName["definition"] };
}

/**
 * Whether a `package.json` declares `exports`.
 * @param text Its text.
 * @returns True when it does.
 */
function namesExports(text: string): boolean {
	try {
		const parsed: unknown = JSON.parse(text);
		return typeof parsed === "object" && parsed !== null && "exports" in parsed;
	} catch {
		return false;
	}
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
 * Whether a module declares its interface: a file stands for its directory,
 * a root file lies outside its top level, or its `package.json` names `exports`.
 * @param reading The module.
 * @returns True when it does.
 */
async function declared(reading: DepthReading): Promise<boolean> {
	const { directory, rootFiles } = reading.exposure;
	const entry = [...reading.checkout.files].some(
		(file) => directoryOf(file) === directory && moduleOf(file, "file") === directory,
	);
	if (entry || rootFiles.some((file) => directoryOf(file) !== directory)) return true;
	const manifest = directory === "" ? "package.json" : `${directory}/package.json`;
	const read = await reading.facts.read(reading.checkout, manifest);
	return read?.adapter === "text" && namesExports(read.text);
}

/**
 * The uses one file of a module makes of names another of its files defines.
 * @param reading The module.
 * @param file The file.
 * @returns Each use, at the definition it reaches.
 */
async function usesIn(reading: DepthReading, file: string): Promise<SiblingUse[]> {
	const read = await reading.facts.read(reading.checkout, file);
	if (read === undefined || read.adapter === "text") return [];
	const { directory } = reading.exposure;
	// Only a use through an import that names the other file: a Swift file sees its target's names without one.
	const named = new Set(read.imports.flatMap(({ resolved }) => resolved ?? []));
	const imported = read.references.filter(
		({ via, target }) =>
			via === "code" &&
			target !== undefined &&
			within(directory, target.path) &&
			named.has(target.path),
	);
	const uses: SiblingUse[] = [];
	for (const { symbol } of imported) {
		// oxlint-disable-next-line no-await-in-loop -- one reference at a time; the pass caches each file it reads
		const site = await definitionSite(reading.facts, reading.checkout, file, symbol);
		if (site !== undefined && site.path !== file) uses.push({ file, site });
	}
	return uses;
}

/**
 * The uses of a module's names by its own files, its tests aside, where the
 * module declares no interface; none where it does.
 * @param reading The module.
 * @returns Each use, at the definition it reaches.
 */
async function siblingUses(reading: DepthReading): Promise<SiblingUse[]> {
	if (await declared(reading)) return [];
	const uses: SiblingUse[] = [];
	for (const file of reading.files) {
		// oxlint-disable-next-line no-await-in-loop -- one file at a time; the pass caches each one
		uses.push(...(await usesIn(reading, file)));
	}
	return uses;
}

/** How many of the names only a module's own files import its finding names. */
const NAMED_INSIDE = 5;

/** A module as the per-name rules judge it: with the uses of its names by its own files. */
type JudgedReading = DepthReading & { readonly siblings: readonly SiblingUse[] };

/**
 * Who uses an exported name: a file outside the module, else only another of
 * its files, through an import. A name can have parts in several files, as a
 * C# partial class does: a use of any part is a use.
 * @param reading The module.
 * @param name The name.
 * @returns Who uses it, or undefined when no file does.
 */
function userOf(reading: JudgedReading, name: ExposedName): "outside" | "sibling" | undefined {
	const parts = reading.exposure.exposed.filter((each) => each.name === name.name);
	const { directory } = reading.exposure;
	if (parts.some((part) => usesOf(directory, part, reading.uses).length > 0)) return "outside";
	const sibling = parts.some((part) =>
		reading.siblings.some((use) => use.file !== part.path && reaches(part, use)),
	);
	return sibling ? "sibling" : undefined;
}

/**
 * The finding on a module that declares no interface, where only its own
 * files use some of its names: how many of its names files outside it use,
 * and the first of those only its own files import.
 * @param reading The module.
 * @param names Its exported names, methods aside.
 * @returns The finding, or undefined when no name is used only by its own files.
 */
function undeclaredFinding(
	reading: JudgedReading,
	names: readonly ExposedName[],
): DepthFinding | undefined {
	const users = names.map((name) => [name.name, userOf(reading, name)] as const);
	const inside = users.flatMap(([name, user]) => (user === "sibling" ? [name] : []));
	if (inside.length === 0) return undefined;
	const outside = users.filter(([, user]) => user === "outside").length;
	const more = inside.length > NAMED_INSIDE ? `, and ${inside.length - NAMED_INSIDE} more` : "";
	const named = `${inside.slice(0, NAMED_INSIDE).join(", ")}${more}`;
	return {
		severity: "information",
		code: "INTERFACE_UNDECLARED",
		message:
			`${reading.label} declares no interface, so each export of its files is open to every ` +
			`folder. Files outside it use ${outside} of its ${names.length} exported names, and only ` +
			`its own files import ${inside.length}: ${named}. Declare its interface, as an ` +
			"entry file such as index.ts does, with what callers use, and the names only its own " +
			"files need stay inside.",
	};
}

export { type JudgedReading, type SiblingUse, siblingUses, undeclaredFinding, userOf };
