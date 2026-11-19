// The verdict on each name a module exports (TASK-646.04, TASK-646.05): at
// most one finding per name, the first that holds of these.
//
// - `EXPOSED_UNUSED`: no file outside the module uses the name, as code or as
//   a type, through any door for a name the module defines and through its
//   own root files for one it passes on, and, in a module that declares no
//   interface, no other file of the module imports it (sibling-uses.ts). A
//   test is no user. A warning when the
//   read is complete: the pass read every file outside the module whole, and
//   the model draws no caller of the name whose code the pass did not read, as
//   a consumer of a published package is. Information otherwise. Its remedy,
//   to stop exporting the name, outranks every other.
// - `REEXPORT_PASS_THROUGH`: the module passes on a name another module
//   defines. One door is information. Two doors to one name are a warning:
//   files outside both modules import the defining module directly, at run
//   time, where a bound part owns the definition. Types pass no verdict.
// - `EXPOSED_VALUE_COMPUTED`, a warning: two or more modules write the same
//   math on an exported value or getter (computed-math.ts). It is the sharper
//   `EXPOSED_VALUE`: it names the math that belongs to the module.
// - `EXPOSED_VALUE`, a warning: code outside reads an exported value at run time.
// - `CODE_PASS_THROUGH`, information: a function or a public method only
//   passes its call on, as its code facts say, unless the callee is a value
//   its own file keeps at module level, as a parse function over a hidden
//   schema is: that is the module deciding.

import {
	type ExposedName,
	within,
} from "#runtime/code-facts/modules/operations/module-exposure.ts";
import { computedValue } from "#runtime/module-depth/operations/computed-math.ts";
import {
	type DepthFinding,
	type DepthReading,
	type DepthUse,
	evidenceOf,
	passedOn,
	quoted,
	reaches,
	readersOf,
	usesOf,
} from "#runtime/module-depth/operations/depth-reading.ts";
import {
	type SiblingUse,
	usedBySibling,
} from "#runtime/module-depth/operations/sibling-uses.ts";

/** A module as the per-name rules judge it: with the uses of its names by its own files. */
type JudgedReading = DepthReading & { readonly siblings: readonly SiblingUse[] };

/** The kind of one export: a public method of an exported class is a `method`. */
type NameKind = "function" | "class" | "value" | "type" | "method";

/** How many unread files a finding names. */
const NAMED_UNREAD = 3;

/**
 * Why the files outside a module that the check could not read whole leave a
 * use unknown, naming the first of them.
 * @param unread The files.
 * @returns The reason, or none when it read them all.
 */
function unreadWhy(unread: readonly string[]): string[] {
	if (unread.length === 0) return [];
	const named = unread.slice(0, NAMED_UNREAD).map((file) => JSON.stringify(file));
	const more = unread.length > NAMED_UNREAD ? `, and ${unread.length - NAMED_UNREAD} more` : "";
	return [
		`the check could not read ${unread.length} file(s) outside it whole: ${named.join(", ")}${more}`,
	];
}

/**
 * The finding on an exported name that no file outside the module uses.
 * @param reading The module.
 * @param name The name.
 * @returns The finding, or undefined when a file uses it.
 */
function unused(reading: JudgedReading, name: ExposedName): DepthFinding | undefined {
	// A name can have parts in several files, as a C# partial class does: a use of any part is a use.
	const parts = reading.exposure.exposed.filter((each) => each.name === name.name);
	const { directory } = reading.exposure;
	const used = (part: ExposedName): boolean =>
		usesOf(directory, part, reading.uses).length > 0 || usedBySibling(part, reading.siblings);
	if (parts.some(used)) return undefined;
	const unseen = reading.unseen(name);
	const why = [
		...unreadWhy(reading.unread),
		...(unseen.length === 0
			? []
			: [`the model draws callers whose code it does not read: ${unseen.join(", ")}`]),
	];
	return {
		severity: why.length === 0 ? "warning" : "information",
		code: "EXPOSED_UNUSED",
		export: name.name,
		message:
			`${reading.label} exports ${name.name}, and no file outside it uses it. A test is no user. ` +
			"Stop exporting it. If files of the module use it, keep it out of the module's root files. " +
			(why.length === 0
				? "If a caller outside this checkout uses it, draw that caller in the model."
				: `This is information because ${why.join(", and ")}.`),
	};
}

/**
 * The finding on a name the module passes on from another module.
 * @param reading The module.
 * @param name The name.
 * @returns The finding.
 */
function reexported(reading: DepthReading, name: ExposedName): DepthFinding {
	const other = reading.uses.filter(
		(use) =>
			!use.door &&
			!use.typeOnly &&
			use.definer !== undefined &&
			!within(use.definer, use.file) &&
			reaches(name, use),
	);
	const label = `${reading.label} passes on ${name.name}, which ${JSON.stringify(name.path)} defines`;
	if (other.length === 0) {
		return {
			severity: "information",
			code: "REEXPORT_PASS_THROUGH",
			export: name.name,
			message: `${label}. It is the one door to that name. If the module adds nothing to it, let callers import it where it is defined.`,
		};
	}
	return {
		severity: "warning",
		code: "REEXPORT_PASS_THROUGH",
		export: name.name,
		message:
			`${label}, and ${quoted(readersOf(other))} import it there directly: two doors to one name. ` +
			"Keep one door: stop passing it on, or make every caller use this module.",
		evidence: evidenceOf(reading, other),
	};
}

/**
 * The finding on an exported value that outside code reads.
 * @param reading The module.
 * @param name The value.
 * @param reads Its uses at run time by files outside the module.
 * @returns The finding, or undefined when no code outside reads it at run time.
 */
function exposedValue(
	reading: DepthReading,
	name: ExposedName,
	reads: readonly DepthUse[],
): DepthFinding | undefined {
	if (reads.length === 0) return undefined;
	const readers = readersOf(reads);
	const value = `${reading.label} exports the value ${name.name}`;
	const remedy =
		readers.length === 1
			? `Only ${quoted(readers)} reads it: move the value into ${quoted(readers)} and stop exporting it.`
			: `${readers.length} modules read it: ${quoted(readers)}. Move what they do with it into ` +
				`${reading.label}, behind a function, and stop exporting the value.`;
	return {
		severity: "warning",
		code: "EXPOSED_VALUE",
		export: name.name,
		message:
			`${value}, which code outside it reads: its callers hold logic that belongs to it. ` +
			`${remedy} Where a caller needs the value itself, export a function that returns it.`,
		evidence: evidenceOf(reading, reads),
	};
}

/**
 * The finding on a function or a method that only passes its call on.
 * @param reading The module.
 * @param name The function or method.
 * @returns The finding, or undefined when it decides something.
 */
async function passThrough(
	reading: DepthReading,
	name: ExposedName,
): Promise<DepthFinding | undefined> {
	const root = name.definition.passes;
	if (root === undefined) return undefined;
	const read = await reading.facts.read(reading.checkout, name.path);
	const definitions = read === undefined || read.adapter === "text" ? [] : read.definitions;
	if (definitions.some((each) => each.symbol === root && each.kind === "value")) return undefined;
	return {
		severity: "information",
		code: "CODE_PASS_THROUGH",
		export: name.name,
		message:
			`${reading.label} exports ${name.name}, which only passes its call on to ${root}. ` +
			"Its callers gain nothing from the extra layer: give it a decision of its own, or let them call the code it passes to.",
	};
}

/**
 * The one finding of one export, if any.
 * @param reading The module.
 * @param name The export.
 * @param kind Its kind.
 * @returns Its finding, or undefined when it has none.
 */
async function nameFinding(
	reading: JudgedReading,
	name: ExposedName,
	kind: NameKind,
): Promise<DepthFinding | undefined> {
	// A static member may be used by its bare name from a class that derives
	// from its own, which the syntax cannot see: it is never judged unused.
	const idle =
		kind === "method" || name.definition.static === true ? undefined : unused(reading, name);
	if (idle !== undefined || kind === "type") return idle;
	return passedOn(reading.exposure.directory, name)
		? reexported(reading, name)
		: ownFinding(reading, name, kind);
}

/**
 * The finding of an export the module defines, other than its use.
 * @param reading The module.
 * @param name The export.
 * @param kind Its kind.
 * @returns `EXPOSED_VALUE_COMPUTED` for a value or a getter on which two
 * modules write the same math, else `EXPOSED_VALUE` for a value and
 * `CODE_PASS_THROUGH` for a function or a method, or none.
 */
async function ownFinding(
	reading: DepthReading,
	name: ExposedName,
	kind: NameKind,
): Promise<DepthFinding | undefined> {
	if (kind === "class") return undefined;
	const reads = usesOf(reading.exposure.directory, name, reading.uses).filter(
		(use) => !use.typeOnly,
	);
	const computed = kind === "method" ? undefined : await computedValue(reading, name, reads);
	if (computed !== undefined) return computed;
	return kind === "value" ? exposedValue(reading, name, reads) : passThrough(reading, name);
}

/** The codes that say a name hands its insides to its callers, which `MODULE_SHALLOW` rolls up. */
const SHALLOW_CODES: ReadonlySet<string> = new Set([
	"EXPOSED_VALUE",
	"EXPOSED_VALUE_COMPUTED",
	"CODE_PASS_THROUGH",
	"REEXPORT_PASS_THROUGH",
]);

export { type NameKind, SHALLOW_CODES, nameFinding };
