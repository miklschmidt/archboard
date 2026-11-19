// Module depth (TASK-646.04): what a bound module's code offers its callers,
// and the verdicts on it, as named findings and never a score.
//
// A deep module has a small interface that hides much logic. A shallow one
// hands its insides to its callers. The code check hands this part what it
// already read of a module: what the module exposes, the uses of that by files
// outside it with the module that owns each, and the module's own files. It
// reads nothing twice.
//
// It counts the module's exports by kind: functions, classes, each public
// method of an exported class, values and types. It counts the pieces of
// logic behind them as evidence: the calls, operators, conditions and loops of
// the module's files, and the values it keeps hidden. No count is a verdict.
//
// It judges each exported name:
//
// - `EXPOSED_VALUE`, a warning: an exported value that code outside the module
//   reads at run time, a value a call makes, as `durations({...})` does,
//   included. A test is no reader, and nor is a use only as a type. Its
//   remedies follow the readers: one reader takes the value, and several get
//   what they do with it moved into the module. A function that returns the
//   value, a getter, is an interface, and has no finding.
// - `MODULE_SHALLOW`, information: every export that is not a type carries a
//   finding of its own. Types are no verdict's concern, so an exported union or
//   enum keeps the compiler's exhaustive checks. The answer never makes it a
//   warning: the CLI does, for the modules a branch touched (ADR 0082).
//
// It judges the names of the languages whose adapter names the kind of each
// export: TypeScript.

import type { Definition, SyntaxFacts } from "#runtime/code-facts/operations/facts.ts";
import type {
	ExposedName,
	ModuleExposure,
} from "#runtime/code-facts/modules/operations/module-exposure.ts";
import type { CheckoutFiles } from "#runtime/code-facts/modules/operations/module-resolution.ts";
import type { FactsPass } from "#runtime/code-facts/services/reader.ts";
import type { CodeEvidence, CodeFinding } from "#shared/protocol/code-check.ts";

/** The adapters that name the kind of each export, whose modules this part judges. */
const JUDGED: ReadonlySet<SyntaxFacts["adapter"]> = new Set(["typescript"]);

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
	readonly reader: Reader;
}

/** What judging one module reads. */
interface DepthReading {
	readonly facts: FactsPass;
	readonly checkout: CheckoutFiles & { readonly repo: string };
	readonly exposure: ModuleExposure;
	readonly uses: readonly DepthUse[];
	/** The module's own files, its tests aside. */
	readonly files: readonly string[];
	/** The module as a sentence names it, such as `module "Timing"`. */
	readonly label: string;
}

/** A module's exports, by kind. */
interface ExportCounts {
	readonly functions: number;
	readonly classes: number;
	readonly methods: number;
	readonly values: number;
	readonly types: number;
}

/** A finding of module depth, before the code check places it on a part. */
type DepthFinding = Pick<CodeFinding, "severity" | "code" | "message" | "evidence" | "export">;

/** What judging one module gives. */
interface Depth {
	/** The languages whose exports were counted and judged. */
	readonly languages: readonly string[];
	readonly exports: ExportCounts;
	readonly logic: number;
	readonly findings: readonly DepthFinding[];
}

/** The kind of one export. */
type ExportKind = "function" | "class" | "value" | "type";

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
 * Whether an exposed name is a declaration of its file, not a member of one,
 * as its language's rule says where its names say more than their dots: a C#
 * type is qualified by its namespace.
 * @param name The exposed name.
 * @param exposed Every name its module exposes.
 * @returns True for a top-level name.
 */
function topLevel(name: ExposedName, exposed: readonly ExposedName[]): boolean {
	if (name.member !== undefined) return !name.member;
	const member = exposed.some((holder) => memberOf(name.definition, holder.definition));
	return !name.definition.symbol.includes(".") && !member;
}

/**
 * The kind of an export.
 * @param definition Its definition.
 * @returns Its kind.
 */
function kindOf(definition: Definition): ExportKind {
	return definition.type === true ? "type" : definition.kind;
}

/**
 * The names of a module that a judged language exposes, each once.
 * @param reading The module.
 * @returns The names.
 */
async function judgedNames(reading: DepthReading): Promise<ExposedName[]> {
	const names = new Map<string, ExposedName>();
	for (const name of reading.exposure.exposed) {
		// oxlint-disable-next-line no-await-in-loop -- one file at a time; the pass caches each one
		const read = await reading.facts.read(reading.checkout, name.path);
		if (read === undefined || read.adapter === "text" || !JUDGED.has(read.adapter)) continue;
		if (!names.has(name.name)) names.set(name.name, name);
	}
	return [...names.values()];
}

/**
 * Whether a member is a public method of an exported class.
 * @param member The member.
 * @param classes The module's exported classes.
 * @returns True when it is.
 */
function methodOf(member: ExposedName, classes: readonly ExposedName[]): boolean {
	const { symbol } = member.definition;
	const holder = symbol.slice(0, Math.max(symbol.lastIndexOf("."), 0));
	return (
		member.definition.kind === "function" &&
		classes.some((each) => each.path === member.path && each.definition.symbol === holder)
	);
}

/**
 * The module's exports by kind: its top-level names, and the public methods of its classes.
 * @param names The judged names.
 * @returns The counts, and the top-level names with their kinds.
 */
function countExports(names: readonly ExposedName[]): {
	readonly counts: ExportCounts;
	readonly top: readonly (readonly [ExposedName, ExportKind])[];
} {
	const top = names
		.filter((name) => topLevel(name, names))
		.map((name) => [name, kindOf(name.definition)] as const);
	const classes = ofKind(top, "class");
	const members = names.filter((name) => !topLevel(name, names));
	return {
		counts: {
			functions: ofKind(top, "function").length,
			classes: classes.length,
			methods: members.filter((member) => methodOf(member, classes)).length,
			values: ofKind(top, "value").length,
			types: ofKind(top, "type").length,
		},
		top,
	};
}

/**
 * The top-level names of one kind.
 * @param top The top-level names with their kinds.
 * @param kind The kind.
 * @returns The names.
 */
function ofKind(
	top: readonly (readonly [ExposedName, ExportKind])[],
	kind: ExportKind,
): ExposedName[] {
	return top.filter(([, each]) => each === kind).map(([name]) => name);
}

/**
 * The pieces of logic in the module's files of a judged language: what each
 * file's adapter counts, and each value it keeps hidden at module level.
 * @param reading The module.
 * @returns The count.
 */
async function logicOf(reading: DepthReading): Promise<number> {
	let logic = 0;
	for (const file of reading.files) {
		// oxlint-disable-next-line no-await-in-loop -- one file at a time; the pass caches each one
		const read = await reading.facts.read(reading.checkout, file);
		if (read === undefined || read.adapter === "text" || !JUDGED.has(read.adapter)) continue;
		const hidden = read.definitions.filter(
			(each) =>
				!each.exposed && each.kind === "value" && each.type !== true && !each.symbol.includes("."),
		);
		logic += (read.logic ?? 0) + hidden.length;
	}
	return logic;
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
 * The finding on an exported value that outside code reads.
 * @param reading The module.
 * @param name The value.
 * @param uses Its reads.
 * @returns The finding.
 */
function exposedValue(
	reading: DepthReading,
	name: ExposedName,
	uses: readonly DepthUse[],
): DepthFinding {
	const readers = [...new Map(uses.map((use) => [use.reader.name, use.reader])).values()];
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
		evidence: evidenceOf(reading, uses),
	};
}

/**
 * One piece of evidence for each file that reads a value, at its first read.
 * @param reading The module.
 * @param uses The reads.
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

/**
 * The finding on a module whose every export that is not a type has one of its own.
 * @param reading The module.
 * @param judged The exports that are not types, each with the codes of its findings.
 * @returns The finding, or undefined when one has none or the module exports none.
 */
function shallow(
	reading: DepthReading,
	judged: ReadonlyMap<string, readonly string[]>,
): DepthFinding | undefined {
	const names = [...judged.keys()];
	if (names.length === 0 || names.some((name) => (judged.get(name) ?? []).length === 0)) {
		return undefined;
	}
	return {
		severity: "information",
		code: "MODULE_SHALLOW",
		message:
			`${reading.label} is shallow: each of its ${names.length} exports that is not a type has a ` +
			`finding of its own (${names.join(", ")}), so it hands its insides to its callers. Clear ` +
			"those findings, and the module hides what it owns.",
	};
}

/**
 * Measure one bound module from its code, and judge its exports.
 * @param reading What the code check read of the module.
 * @returns The counts and the findings.
 */
async function moduleDepth(reading: DepthReading): Promise<Depth> {
	const names = await judgedNames(reading);
	const { counts, top } = countExports(names);
	const findings = top.flatMap(([name, kind]) => perName(reading, name, kind));
	const judged = new Map(
		top
			.filter(([, kind]) => kind !== "type")
			.map(([name]) => [
				name.name,
				findings.filter((each) => each.export === name.name).map((each) => each.code),
			]),
	);
	const rollUp = shallow(reading, judged);
	return {
		languages: names.length === 0 ? [] : ["typescript"],
		exports: counts,
		logic: await logicOf(reading),
		findings: rollUp === undefined ? findings : [...findings, rollUp],
	};
}

/**
 * The findings of one export of its own.
 * @param reading The module.
 * @param name The export.
 * @param kind Its kind.
 * @returns Its findings: `EXPOSED_VALUE` for a value outside code reads.
 */
function perName(reading: DepthReading, name: ExposedName, kind: ExportKind): DepthFinding[] {
	if (kind !== "value") return [];
	const reads = reading.uses.filter((use) => !use.typeOnly && reaches(name, use));
	return reads.length === 0 ? [] : [exposedValue(reading, name, reads)];
}

export { type Depth, type DepthUse, type ExportCounts, moduleDepth, reaches, topLevel };
