// What Module depth reads of one bound module, as the code check hands it
// over, and the ways of reading it that every rule shares: which uses reach a
// name, and the evidence a finding rests on.

import type { Definition } from "#runtime/code-facts/operations/facts.ts";
import {
	within,
	type ExposedName,
	type ModuleExposure,
} from "#runtime/code-facts/modules/operations/module-exposure.ts";
import type { CheckoutFiles } from "#runtime/code-facts/modules/operations/module-resolution.ts";
import type { FactsPass } from "#runtime/code-facts/services/reader.ts";
import type { CodeEvidence, CodeFinding } from "#shared/protocol/code-check.ts";

/** The module that owns a file outside the one judged: a part, else the file alone. */
interface Reader {
	readonly id?: string;
	readonly name: string;
}

/** One use of a module's code by a file outside it, as the code check read it. */
interface DepthUse {
	readonly file: string;
	readonly line: number;
	readonly symbol: string;
	/** A use only as a type, which reads no value. */
	readonly typeOnly: boolean;
	/** Where the name it reaches is defined. */
	readonly site: { readonly path: string; readonly definition: Definition };
	/** It comes through the module's own root files, not through another module that passes the name on. */
	readonly door: boolean;
	readonly reader: Reader;
	/**
	 * The directory of the module whose part owns the definition, where a
	 * bound part owns it: a file in it is no caller of the definition.
	 */
	readonly definer?: string;
}

/** What judging one module reads. */
interface DepthReading {
	readonly facts: FactsPass;
	readonly checkout: CheckoutFiles & { readonly repo: string };
	readonly exposure: ModuleExposure;
	readonly uses: readonly DepthUse[];
	/** The module's own files, its tests aside. */
	readonly files: readonly string[];
	/** The files outside the module, tests aside, that the pass could not read whole. */
	readonly unread: readonly string[];
	/**
	 * The callers of an exported name that the model draws and whose code the
	 * pass did not read, as a consumer of a published package is.
	 */
	readonly unseen: (name: ExposedName) => readonly string[];
	/** The module as a sentence names it, such as `module "Timing"`. */
	readonly label: string;
}

/** A finding of module depth, before the code check places it on a part. */
type DepthFinding = Pick<CodeFinding, "severity" | "code" | "message" | "evidence" | "export">;

/**
 * Whether a C++ definition is a member of another by its name, as
 * `shop::Store::open` is of `shop::Store`: a method is often defined in
 * another file than its class.
 * @param member The definition.
 * @param holder The other definition.
 * @returns True when it is.
 */
function memberOf(member: Definition, holder: Definition): boolean {
	return member.symbol.startsWith(`${holder.symbol}::`);
}

/**
 * Whether a use reaches an exposed definition or one inside it, such as a member.
 * @param name The exposed name.
 * @param use The use.
 * @param use.site Where the name it reaches is defined.
 * @returns True when it does.
 */
function reaches(name: ExposedName, use: { readonly site: DepthUse["site"] }): boolean {
	const { path, definition } = use.site;
	const inside =
		path === name.path &&
		name.definition.start <= definition.start &&
		definition.end <= name.definition.end;
	return inside || memberOf(definition, name.definition);
}

/**
 * Whether a module passes a name on from a file outside it.
 * @param directory The module.
 * @param name The name.
 * @returns True when another module defines it.
 */
function passedOn(directory: string, name: ExposedName): boolean {
	return !within(directory, name.path);
}

/**
 * The uses of a name as the module offers it: through any door for a name it
 * defines, and through its own root files for a name it passes on.
 * @param directory The module.
 * @param name The name.
 * @param uses The uses of the module.
 * @returns The uses.
 */
function usesOf<Use extends { readonly site: DepthUse["site"]; readonly door: boolean }>(
	directory: string,
	name: ExposedName,
	uses: readonly Use[],
): Use[] {
	const passed = passedOn(directory, name);
	return uses.filter((use) => reaches(name, use) && (use.door || !passed));
}

/**
 * The names of readers, quoted, in the order they first read.
 * @param readers The readers.
 * @returns Their names.
 */
function quoted(readers: readonly Reader[]): string {
	return readers.map((reader) => JSON.stringify(reader.name)).join(", ");
}

/**
 * Each reader once, in the order it first reads.
 * @param uses The uses.
 * @returns The readers.
 */
function readersOf(uses: readonly DepthUse[]): Reader[] {
	return [...new Map(uses.map((use) => [use.reader.name, use.reader])).values()];
}

/**
 * One piece of evidence for each file that uses a name, at its first use.
 * @param reading The module.
 * @param uses The uses.
 * @returns The evidence.
 */
function evidenceOf(reading: DepthReading, uses: readonly DepthUse[]): CodeEvidence[] {
	const first = new Map<string, DepthUse>();
	for (const use of uses) if (!first.has(use.file)) first.set(use.file, use);
	return [...first.values()].map((use) => ({
		kind: "call",
		resolution: "resolved",
		...(use.reader.id === undefined ? {} : { from: use.reader.id }),
		repo: reading.checkout.repo,
		path: use.file,
		line: use.line,
		symbol: use.symbol,
	}));
}

export {
	type DepthFinding,
	type DepthReading,
	type DepthUse,
	evidenceOf,
	memberOf,
	passedOn,
	quoted,
	reaches,
	readersOf,
	usesOf,
};
