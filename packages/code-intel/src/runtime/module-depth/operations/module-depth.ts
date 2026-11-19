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
// method of an exported class, values and types. A member that belongs to an
// exported class rather than to an instance, as a C# `static` member does, is
// read through the class's name and counts as a function or a value of its
// own (TASK-646.11). It counts the pieces of
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
// `EXPOSED_UNUSED`, `REEXPORT_PASS_THROUGH`, `EXPOSED_VALUE`,
// `EXPOSED_VALUE_COMPUTED` (computed-math.ts) or `CODE_PASS_THROUGH`. In a
// module that declares no interface, another of its files that imports a name
// keeps it used, and `INTERFACE_UNDECLARED`, information, says how many of its
// names files outside it use (sibling-uses.ts). A module the model marks
// `external`, code the repository does not own, is counted and never judged
// (TASK-646.18). Members the language calls itself, a constructor or a
// `toString`, are no export a caller names: each adapter marks them
// (`Definition.calledByLanguage`), and they are neither counted nor judged. A method's uses run through values, which a syntax read cannot
// follow, so no method is judged unused, and an implementation used through
// its interface counts as used.
//
// The module as a whole gets `INTERFACE_WIDE` and `MODULE_SHALLOW`, warnings
// (module-measure.ts, TASK-651). The roll-up is one ground of `MODULE_SHALLOW`:
// every export that is not a type carries `EXPOSED_VALUE`,
// `EXPOSED_VALUE_COMPUTED` or a pass-through. A class stands for its public
// methods. Types are no verdict's concern, so an exported union or enum keeps
// the compiler's exhaustive checks. The other grounds read the counts, and only
// where every exported name is in a judged language and every file of one gave
// its count of logic.
//
// The findings come grouped: one module's, in the order it exports the names,
// then its roll-up. It judges the names of the languages whose adapter names
// the kind of each export: TypeScript, Python, Go, C#, Rust, Swift, C, C++ and
// Objective-C (TASK-646.11, TASK-646.12).
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
import { C_FAMILY_FILE } from "#runtime/code-facts/c/operations/c-pairs.ts";
import { SWIFT_FILE } from "#runtime/code-facts/swift/operations/swift-exposure.ts";
import { CSHARP_FILE } from "#runtime/code-facts/csharp/operations/csharp-project.ts";
import { GO_FILE } from "#runtime/code-facts/go/operations/go-resolution.ts";
import { PYTHON_FILE } from "#runtime/code-facts/python/operations/python-exposure.ts";
import { RUST_FILE } from "#runtime/code-facts/rust/operations/rust-exposure.ts";
import { TYPESCRIPT_CALLER } from "#runtime/code-facts/typescript/operations/typescript-exposure.ts";
import {
	type DepthFinding,
	type DepthReading,
	memberOf,
	passedOn,
} from "#runtime/module-depth/operations/depth-reading.ts";
import {
	handsInsides,
	type NameKind,
	nameFinding,
} from "#runtime/module-depth/operations/name-findings.ts";
import { siblingUses, undeclaredFinding } from "#runtime/module-depth/operations/sibling-uses.ts";
import {
	type ExportCounts,
	moduleFindings,
} from "#runtime/module-depth/operations/module-measure.ts";
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
	["python", "judged"],
	["go", "judged"],
	["csharp", "judged"],
	["rust", "judged"],
	["swift", "judged"],
	["c", "judged"],
	["cpp", "judged"],
	["objc", "judged"],
	["terraform", "infrastructure"],
	["nix", "infrastructure"],
	["helm", "infrastructure"],
]);

/**
 * The files that can use the names of each judged adapter, the JavaScript
 * that imports TypeScript among them: only an unread file of these can hold a
 * use of a name.
 */
const JUDGED_FILES: readonly RegExp[] = [
	TYPESCRIPT_CALLER,
	PYTHON_FILE,
	GO_FILE,
	CSHARP_FILE,
	RUST_FILE,
	SWIFT_FILE,
	C_FAMILY_FILE,
];

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
 * A member's own name within a holder: `post` of `Ledger.post`, and in the C
 * family, whose names `::` qualifies, `save` of `shop::Store::save` and the
 * selector `post:by:` of `Ledger::post:by:`.
 * @param symbol The member's symbol.
 * @param holder The holder's symbol.
 * @returns The own name, or undefined when the symbol is no member of the holder's own.
 */
function ownName(symbol: string, holder: string): string | undefined {
	if (!symbol.startsWith(holder)) return undefined;
	const own = /^(?:\.|::)(.+)$/u.exec(symbol.slice(holder.length))?.[1];
	return own === undefined || /\.|::./u.test(own) ? undefined : own;
}

/**
 * Whether a member belongs to an exported class. It may be in another file
 * than its class: a C++ or Objective-C method in the pair of its class's
 * header, a Swift method in an extension.
 * @param member The member.
 * @param classes The module's exported classes.
 * @returns True when it does.
 */
function heldBy(member: ExposedName, classes: readonly ExposedName[]): boolean {
	const { symbol } = member.definition;
	return classes.some((each) => ownName(symbol, each.definition.symbol) !== undefined);
}

/**
 * Whether a member is a public method of an exported class, which callers
 * call on an instance.
 * @param member The member.
 * @param classes The module's exported classes.
 * @returns True when it is.
 */
function methodOf(member: ExposedName, classes: readonly ExposedName[]): boolean {
	const { definition } = member;
	return (
		definition.kind === "function" &&
		definition.calledByLanguage !== true &&
		definition.static !== true &&
		heldBy(member, classes)
	);
}

/**
 * The kind of a member of an exported class that belongs to the class, not
 * to an instance, as a C# `static` member does: callers read it through the
 * class's name, as they read a top-level name, so it counts as one.
 * @param member The member.
 * @param classes The module's exported classes.
 * @returns Its kind, or undefined for any other member.
 */
function staticKind(member: ExposedName, classes: readonly ExposedName[]): ExportKind | undefined {
	const { definition } = member;
	const counted = definition.static === true && definition.calledByLanguage !== true;
	return counted && heldBy(member, classes) ? declaredKind(definition) : undefined;
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
	const classes = ofKind(top, "class");
	const kinds = new Map(top);
	for (const name of names.judged) {
		const kind = kinds.has(name) ? undefined : staticKind(name, classes);
		if (kind !== undefined) kinds.set(name, kind);
	}
	const counted = [
		...kinds,
		...pathEnds(names.infrastructure).map((name) => [name, declaredKind(name.definition)] as const),
	];
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
 * Whether a symbol names a member of another definition of its file, as
 * `Ledger.total`, `shop::Store::items_` and an Objective-C instance variable
 * do: a member is no value its module keeps hidden at module level.
 * @param symbol The symbol.
 * @param symbols Every symbol its file defines.
 * @returns True when it does.
 */
function memberOfFile(symbol: string, symbols: ReadonlySet<string>): boolean {
	const at = Math.max(symbol.lastIndexOf("."), symbol.lastIndexOf("::"));
	return at > 0 && symbols.has(symbol.slice(0, at));
}

/**
 * The pieces of logic in the module's files of a judged language: what each
 * file's adapter counts, and each value it keeps hidden at module level.
 * @param reading The module.
 * @returns The count, and whether every such file gave its count.
 */
async function logicOf(
	reading: DepthReading,
): Promise<{ readonly logic: number; readonly complete: boolean }> {
	let logic = 0;
	let complete = true;
	for (const file of reading.files) {
		// oxlint-disable-next-line no-await-in-loop -- one file at a time; the pass caches each one
		const read = await judgedFile(reading, file);
		if (read === undefined) continue;
		if (read.logic === undefined) complete = false;
		logic += (read.logic ?? 0) + hiddenValues(read.definitions);
	}
	return { logic, complete };
}

/**
 * The facts of one of the module's files, where a judged language's adapter reads it.
 * @param reading The module.
 * @param file The file.
 * @returns Its facts, or undefined for a file of another adapter or one the pass may not read.
 */
async function judgedFile(reading: DepthReading, file: string): Promise<SyntaxFacts | undefined> {
	const read = await reading.facts.read(reading.checkout, file);
	if (read === undefined || read.adapter === "text") return undefined;
	return GROUPS.get(read.adapter) === "judged" ? read : undefined;
}

/**
 * The values a file keeps hidden at module level, each a piece of logic.
 * @param definitions The file's definitions.
 * @returns How many there are.
 */
function hiddenValues(definitions: readonly Definition[]): number {
	const symbols = new Set(definitions.map((each) => each.symbol));
	return definitions.filter(
		(each) =>
			!each.exposed &&
			each.kind === "value" &&
			each.type !== true &&
			(each.static === true || !memberOfFile(each.symbol, symbols)),
	).length;
}

/**
 * The exports that answer for the roll-up, when each of them hands the module's insides to its callers.
 * @param rollUp Each export that answers for the roll-up, and whether it does.
 * @returns Their names, or undefined when one does not or the module exports none.
 */
function everyOne(rollUp: ReadonlyMap<string, boolean>): string[] | undefined {
	const shallow = rollUp.size > 0 && [...rollUp.values()].every(Boolean);
	return shallow ? [...rollUp.keys()] : undefined;
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
 * The files outside a module that the pass could not read whole and that can
 * hold a use of a name: those of the languages its parts are written in, as a
 * name's read is complete when the pass read every use in its language.
 * @param reading The module.
 * @param name The name.
 * @returns The files.
 */
function unreadFor(reading: DepthReading, name: ExposedName): string[] {
	const parts = reading.exposure.exposed.filter((each) => each.name === name.name);
	const files = JUDGED_FILES.filter((file) => parts.some((part) => file.test(part.path)));
	return reading.unread.filter((file) => files.some((each) => each.test(file)));
}

/** What the verdicts on a module as a whole read, beside its names. */
type Whole = Omit<Parameters<typeof moduleFindings>[0], "label" | "rolledUp">;

/**
 * The findings on a module's exports: one per name at most, the verdicts on
 * the module as a whole, and the names only its own files use where it
 * declares no interface.
 * @param reading The module.
 * @param judged Each judged export with its kind, in the order the module exports them.
 * @param whole Its counts, and whether they stand on a complete reading.
 * @returns The findings, grouped.
 */
async function depthFindings(
	reading: DepthReading,
	judged: readonly (readonly [ExposedName, NameKind])[],
	whole: Whole,
): Promise<DepthFinding[]> {
	const judging = { ...reading, siblings: await siblingUses(reading) };
	const findings: DepthFinding[] = [];
	const rollUp = new Map<string, boolean>();
	for (const [name, kind] of judged) {
		const unread = unreadFor(reading, name);
		// oxlint-disable-next-line no-await-in-loop -- one name at a time keeps the findings in export order
		const finding = await nameFinding({ ...judging, unread }, name, kind);
		if (finding !== undefined) findings.push(finding);
		if (rolledUp(reading, name, kind)) rollUp.set(name.name, handsInsides(finding));
	}
	const module = moduleFindings({ ...whole, label: reading.label, rolledUp: everyOne(rollUp) });
	const exported = judged.flatMap(([name, kind]) => (kind === "method" ? [] : [name]));
	const undeclared = undeclaredFinding(judging, exported);
	return [...findings, ...module, ...(undeclared === undefined ? [] : [undeclared])];
}

/**
 * Measure one bound module from its code, and judge its exports, unless the
 * module is code the repository does not own.
 * @param reading What the code check read of the module.
 * @returns The counts, the findings, and the names it judged.
 */
async function moduleDepth(reading: DepthReading): Promise<Depth> {
	const names = await countedNames(reading);
	const { counts, judged, listed } = await countExports(reading, names);
	const { logic, complete } = await logicOf(reading);
	const supported = names.unjudged.length === 0 && names.infrastructure.length === 0;
	const whole = { exports: counts, logic, measured: supported && complete };
	return {
		languages: names.languages,
		unjudged: names.unjudged,
		names: judged.map(([name]) => name.name),
		listed,
		exports: counts,
		logic,
		findings: reading.external ? [] : await depthFindings(reading, judged, whole),
	};
}

export { type Depth, type ExportCounts, moduleDepth, topLevel };
