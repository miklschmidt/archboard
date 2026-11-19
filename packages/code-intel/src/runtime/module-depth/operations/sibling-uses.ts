// The uses of a module's names by its own files (TASK-646.17, decision 16).
//
// A folder module with no declared interface, no file that stands for it
// (such as `index.ts`, `__init__.py`, `mod.rs` or a project file) and no
// `package.json` `exports`, exposes every export of the files directly in
// it. Such a language makes a file export a name so that another file of the
// module can import it, and cannot hide that name from other folders. So in
// such a module, a name another of its files imports counts as used. A
// language whose files of one module see each other without an import, as
// Go's do, gives no such use: an exported name only they use stays unused.

import {
	type ExposedName,
	moduleOf,
	within,
} from "#runtime/code-facts/modules/operations/module-exposure.ts";
import { definitionSite } from "#runtime/code-facts/operations/definition-site.ts";
import { type DepthReading, reaches } from "#runtime/module-depth/operations/depth-reading.ts";

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
	const imported = read.references.filter(
		({ via, target }) => via === "code" && target !== undefined && within(directory, target.path),
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

/**
 * Whether another file of the module uses an exposed name.
 * @param name The name.
 * @param uses The module's uses by its own files.
 * @returns True when one does.
 */
function usedBySibling(name: ExposedName, uses: readonly SiblingUse[]): boolean {
	return uses.some((use) => use.file !== name.path && reaches(name, use));
}

export { type SiblingUse, siblingUses, usedBySibling };
