// Module depth (TASK-646.04, TASK-646.05, TASK-646.15): what a bound module's code offers its callers,
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
// An export that can be called is a function, even when a call makes it
// (TASK-646.15). A value that holds another name, as `const Dialog =
// Object.assign(DialogRoot, {...})` holds `DialogRoot`, is what that name is,
// wherever that name is defined. Any other value is what its language server
// types it as, where a server answers: the helper that `cva(...)` returns is
// a function, and a zod schema, which cannot be called, is a value.
//
// It judges each exported name, each public method of an exported class
// among them, and gives each at most one finding (name-findings.ts):
// `EXPOSED_UNUSED`, `REEXPORT_PASS_THROUGH`, `EXPOSED_VALUE` or
// `CODE_PASS_THROUGH`. Members the language calls itself, a constructor or a
// `toString`, are no export a caller names: they are neither counted nor
// judged. A method's uses run through values, which a syntax read cannot
// follow, so no method is judged unused, and an implementation used through
// its interface counts as used.
//
// `MODULE_SHALLOW`, information, rolls them up: every export that is not a
// type carries `EXPOSED_VALUE` or a pass-through. A class stands for its
// public methods. Types are no verdict's concern, so an exported union or enum
// keeps the compiler's exhaustive checks. The answer never makes it a
// warning: the CLI does, for the modules a branch touched (ADR 0082).
//
// The findings come grouped: one module's, in the order it exports the names,
// then its roll-up. It judges the names of the languages whose adapter names
// the kind of each export: TypeScript.
//
// It counts the exports of a Terraform module, a Nix flake and a Helm chart
// by kind too, and judges none of them (TASK-646.13): a caller sets a
// variable and reads an output or a value by design, and Terraform keeps its
// own rules (terraform-modules.ts). Their adapters name each name's kind: a
// flake output that is a function is a function, and every other output,
// variable and value is a value. A flake output or a chart value is a path,
// and only a name at its end is an export: `packages.x86_64-linux` and
// `image` only group the names below them.

import { definitionSite } from "#runtime/code-facts/operations/definition-site.ts";
import type { Definition, SyntaxFacts } from "#runtime/code-facts/operations/facts.ts";
import type { ExposedName } from "#runtime/code-facts/modules/operations/module-exposure.ts";
import { TYPESCRIPT_FILE } from "#runtime/code-facts/typescript/operations/typescript-exposure.ts";
import {
	type DepthFinding,
	type DepthReading,
	memberOf,
	passedOn,
} from "#runtime/module-depth/operations/depth-reading.ts";
import {
	type NameKind,
	nameFinding,
	SHALLOW_CODES,
} from "#runtime/module-depth/operations/name-findings.ts";
import type { ModuleExport } from "#shared/protocol/code-check.ts";

/**
 * What this part does with the names each adapter exposes: those of an adapter
 * that names the kind of each export it judges, and those of an
 * infrastructure adapter it only counts.
 */
const GROUPS: ReadonlyMap<
	SyntaxFacts["adapter"],
	keyof Omit<CountedNames, "languages" | "unjudged">
> = new Map([
	["typescript", "judged"],
	["terraform", "infrastructure"],
	["nix", "infrastructure"],
	["helm", "infrastructure"],
]);

/**
 * The files each judged adapter reads: only an unread file of a name's
 * language can hold a use of it.
 */
const JUDGED_FILES: ReadonlyMap<SyntaxFacts["adapter"], RegExp> = new Map([
	["typescript", TYPESCRIPT_FILE],
]);

/** The members a language calls itself, which no caller names. */
const CALLED_BY_LANGUAGE: ReadonlySet<string> = new Set([
	"constructor",
	"toString",
	"toLocaleString",
	"valueOf",
	"toJSON",
]);

/** A module's exports, by kind. */
interface ExportCounts {
	readonly functions: number;
	readonly classes: number;
	readonly methods: number;
	readonly values: number;
	readonly types: number;
}

/** What judging one module gives. */
interface Depth {
	/** The languages whose exports were counted and judged. */
	readonly languages: readonly string[];
	/** The languages the module exposes names in whose exports no rule reads yet (TASK-646.07). */
	readonly unjudged: readonly string[];
	/** The exported names it judged, which no other rule judges again. */
	readonly names: readonly string[];
	/** Each export it counted, with its kind and where it is defined (TASK-646.07). */
	readonly listed: readonly ModuleExport[];
	readonly exports: ExportCounts;
	readonly logic: number;
	readonly findings: readonly DepthFinding[];
}

/** The kind of one top-level export. */
type ExportKind = "function" | "class" | "value" | "type";

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

/** How many names an alias may lead through before the search gives up. */
const ALIAS_DEPTH = 8;

/**
 * The kind of the name a value holds, wherever that name is defined: a
 * compound component made by `Object.assign` onto a function is a function.
 * @param reading The module.
 * @param path The file that defines the value.
 * @param definition The value.
 * @param depth How many names the search has led through.
 * @returns The kind, or undefined when the value holds no name that is a
 * function or a class.
 */
async function aliasedKind(
	reading: DepthReading,
	path: string,
	definition: Definition,
	depth: number,
): Promise<"function" | "class" | undefined> {
	if (definition.aliases === undefined || depth >= ALIAS_DEPTH) return undefined;
	const site = await definitionSite(reading.facts, reading.checkout, path, definition.aliases);
	if (site === undefined) return undefined;
	const kind = declaredKind(site.definition);
	if (kind === "value") return aliasedKind(reading, site.path, site.definition, depth + 1);
	return kind === "type" ? undefined : kind;
}

/**
 * The kind of an export as its definition declares it.
 * @param definition Its definition.
 * @returns Its kind.
 */
function declaredKind(definition: Definition): ExportKind {
	return definition.type === true ? "type" : definition.kind;
}

/** The kinds of the semantic token types that can be called or constructed. */
const CALLABLE_TOKENS: ReadonlyMap<string, "function" | "class"> = new Map([
	["function", "function"],
	["method", "function"],
	["class", "class"],
]);

/**
 * The kind of an export: a value counts as what the name it holds is, else
 * as what its language server types it as, so a value that can be called is
 * a function.
 * @param reading The module.
 * @param name The export.
 * @returns Its kind.
 */
async function kindOf(reading: DepthReading, name: ExposedName): Promise<ExportKind> {
	const kind = declaredKind(name.definition);
	if (kind !== "value") return kind;
	const aliased = await aliasedKind(reading, name.path, name.definition, 0);
	return aliased ?? CALLABLE_TOKENS.get((await reading.tokenType(name)) ?? "") ?? kind;
}

/** The names a module exposes that this part counts, each once, and the adapters that read them. */
interface CountedNames {
	/** The names of a judged language. */
	readonly judged: readonly ExposedName[];
	/** The names of an infrastructure adapter. */
	readonly infrastructure: readonly ExposedName[];
	readonly languages: readonly SyntaxFacts["adapter"][];
	/** The adapters whose names no rule reads yet. */
	readonly unjudged: readonly SyntaxFacts["adapter"][];
}

/**
 * The names of a module that a judged or an infrastructure adapter exposes,
 * each once, and those adapters.
 * @param reading The module.
 * @returns The names, and the adapters that read them.
 */
async function countedNames(reading: DepthReading): Promise<CountedNames> {
	const groups = {
		judged: new Map<string, ExposedName>(),
		infrastructure: new Map<string, ExposedName>(),
	};
	const languages = new Set<SyntaxFacts["adapter"]>();
	const unjudged = new Set<SyntaxFacts["adapter"]>();
	for (const name of reading.exposure.exposed) {
		// oxlint-disable-next-line no-await-in-loop -- one file at a time; the pass caches each one
		const read = await reading.facts.read(reading.checkout, name.path);
		if (read === undefined || read.adapter === "text") continue;
		const group = GROUPS.get(read.adapter);
		if (group === undefined) {
			unjudged.add(read.adapter);
			continue;
		}
		languages.add(read.adapter);
		const names = groups[group];
		if (!names.has(name.name)) names.set(name.name, name);
	}
	return {
		judged: [...groups.judged.values()],
		infrastructure: [...groups.infrastructure.values()],
		languages: [...languages],
		unjudged: [...unjudged],
	};
}

/**
 * The infrastructure names at the end of their paths: those no other name extends.
 * @param names The infrastructure names.
 * @returns Those that are exports.
 */
function pathEnds(names: readonly ExposedName[]): ExposedName[] {
	return names.filter(
		(name) =>
			!names.some((other) => other.path === name.path && other.name.startsWith(`${name.name}.`)),
	);
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
	const called = CALLED_BY_LANGUAGE.has(symbol.slice(holder.length + 1));
	return (
		member.definition.kind === "function" &&
		!called &&
		classes.some((each) => each.path === member.path && each.definition.symbol === holder)
	);
}

/**
 * The module's exports by kind: the top-level names of its judged languages,
 * the public methods of their classes, and the names at the end of their
 * paths of its infrastructure.
 * @param reading The module.
 * @param names The counted names.
 * @returns The counts, each judged export with its kind, in the order the module exports them,
 * and each counted export as the answer lists it.
 */
async function countExports(
	reading: DepthReading,
	names: CountedNames,
): Promise<{
	readonly counts: ExportCounts;
	readonly judged: readonly (readonly [ExposedName, NameKind])[];
	readonly listed: readonly ModuleExport[];
}> {
	const top: (readonly [ExposedName, ExportKind])[] = [];
	for (const name of names.judged.filter((each) => topLevel(each, names.judged))) {
		// oxlint-disable-next-line no-await-in-loop -- one name at a time; the pass caches each file it reads
		top.push([name, await kindOf(reading, name)]);
	}
	const counted = [
		...top,
		...pathEnds(names.infrastructure).map((name) => [name, declaredKind(name.definition)] as const),
	];
	const classes = ofKind(top, "class");
	const kinds = new Map(top);
	const judged = names.judged.flatMap((name): (readonly [ExposedName, NameKind])[] => {
		const kind = kinds.get(name);
		if (kind !== undefined) return [[name, kind]];
		return methodOf(name, classes) ? [[name, "method"]] : [];
	});
	const listed = [...judged, ...counted.filter(([name]) => !names.judged.includes(name))].map(
		([name, kind]) => exportOf(name, kind),
	);
	return {
		listed,
		counts: {
			functions: ofKind(counted, "function").length,
			classes: classes.length,
			methods: judged.filter(([, kind]) => kind === "method").length,
			values: ofKind(counted, "value").length,
			types: ofKind(counted, "type").length,
		},
		judged,
	};
}

/**
 * One counted export, as the answer lists it.
 * @param name The exposed name.
 * @param kind Its kind.
 * @returns The export.
 */
function exportOf(name: ExposedName, kind: NameKind): ModuleExport {
	return { name: name.name, kind, path: name.path, line: name.definition.start };
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
		if (read === undefined || read.adapter === "text" || GROUPS.get(read.adapter) !== "judged") {
			continue;
		}
		const hidden = read.definitions.filter(
			(each) =>
				!each.exposed && each.kind === "value" && each.type !== true && !each.symbol.includes("."),
		);
		logic += (read.logic ?? 0) + hidden.length;
	}
	return logic;
}

/**
 * The finding on a module whose every export that is not a type hands its
 * insides to its callers.
 * @param reading The module.
 * @param judged Each export that answers for the roll-up, and whether it does.
 * @returns The finding, or undefined when one does not or the module exports none.
 */
function shallow(
	reading: DepthReading,
	judged: ReadonlyMap<string, boolean>,
): DepthFinding | undefined {
	const names = [...judged.keys()];
	if (names.length === 0 || [...judged.values()].some((each) => !each)) return undefined;
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
 * Whether an export answers for the roll-up: a name that is not a type, and
 * a class only through its methods, unless the module passes the class on.
 * @param reading The module.
 * @param name The export.
 * @param kind Its kind.
 * @returns True when it does.
 */
function rolledUp(reading: DepthReading, name: ExposedName, kind: NameKind): boolean {
	if (kind === "type") return false;
	return kind !== "class" || passedOn(reading.exposure.directory, name);
}

/**
 * Measure one bound module from its code, and judge its exports.
 * @param reading What the code check read of the module.
 * @returns The counts, the findings, and the names it judged.
 */
async function moduleDepth(reading: DepthReading): Promise<Depth> {
	const names = await countedNames(reading);
	const { counts, judged, listed } = await countExports(reading, names);
	const files = names.languages.flatMap((language) => JUDGED_FILES.get(language) ?? []);
	const unread = reading.unread.filter((file) => files.some((each) => each.test(file)));
	const findings: DepthFinding[] = [];
	const rollUp = new Map<string, boolean>();
	for (const [name, kind] of judged) {
		// oxlint-disable-next-line no-await-in-loop -- one name at a time keeps the findings in export order
		const finding = await nameFinding({ ...reading, unread }, name, kind);
		if (finding !== undefined) findings.push(finding);
		if (rolledUp(reading, name, kind))
			rollUp.set(name.name, finding !== undefined && SHALLOW_CODES.has(finding.code));
	}
	const shallowFinding = shallow(reading, rollUp);
	return {
		languages: names.languages,
		unjudged: names.unjudged,
		names: judged.map(([name]) => name.name),
		listed,
		exports: counts,
		logic: await logicOf(reading),
		findings: shallowFinding === undefined ? findings : [...findings, shallowFinding],
	};
}

export { type Depth, type ExportCounts, moduleDepth, topLevel };
