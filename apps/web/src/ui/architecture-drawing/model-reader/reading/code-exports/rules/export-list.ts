// The code exports of one module, as its About page lists them (TASK-646.08): by kind, in the order
// the module exports them, each with the findings of the pass on that name. A public method is
// named `Class.method`, and it stands under its class. A file is named from the module's own
// directory. The roll-up of a shallow module stands over the list; the module's other findings are
// about the map, not its exports, and stand under Code and evidence.

import type { CodeCheckAnswer } from "@archboard/code-intel/code-check";
import type { ModelCodeReading } from "#ui/architecture-drawing/model-reader/reading/hooks/use-model-code-findings.ts";

type Name = NonNullable<CodeCheckAnswer["depth"]>[number]["names"][number];
type Finding = ModelCodeReading["findings"][number];

/** One export, with the findings of the pass on it. */
interface ListedExport extends Name {
	/** What a row calls it: a method without its class, which its group names. */
	readonly shown: string;
	/** The class a method belongs to, which groups its rows. */
	readonly owner: string | undefined;
	/** Its file, from the module's directory. */
	readonly file: string;
	readonly findings: readonly Finding[];
}

/** The exports of one kind. */
interface ExportKind {
	readonly kind: Name["kind"];
	readonly label: string;
	readonly exports: readonly ListedExport[];
}

/** The kinds, in the order the page lists them, with the name of each list. */
const KINDS: readonly (readonly [Name["kind"], string])[] = [
	["function", "Functions"],
	["class", "Classes"],
	["method", "Methods"],
	["value", "Values"],
	["type", "Types"],
];

/**
 * The class a method belongs to and its own name: what stands before and after its last dot.
 * @param name The method, as `Class.method`.
 * @returns The class and the method.
 */
function methodOf(name: string): { readonly owner: string; readonly shown: string } {
	const dot = name.lastIndexOf(".");
	return { owner: name.slice(0, dot), shown: name.slice(dot + 1) };
}

/**
 * The exports of a module by kind, each with its findings, and the roll-up of a shallow module.
 * @param names The exports the pass counted.
 * @param findings The findings of the pass.
 * @param module The module, by its identity and its directory in its repository.
 * @param module.id Its identity.
 * @param module.directory Its directory.
 * @returns Each kind that has an export, and the module's roll-up, if it has one.
 */
function exportList(
	names: readonly Name[],
	findings: readonly Finding[],
	module: { readonly id: string; readonly directory: string },
): { readonly kinds: readonly ExportKind[]; readonly rollUp: readonly Finding[] } {
	const mine = findings.filter((finding) => finding.subject?.id === module.id);
	const prefix = module.directory === "" ? "" : `${module.directory}/`;
	const listed = names.map((name): ListedExport => {
		const method = name.kind === "method" ? methodOf(name.name) : undefined;
		return {
			...name,
			shown: method?.shown ?? name.name,
			owner: method?.owner,
			file: name.path.startsWith(prefix) ? name.path.slice(prefix.length) : name.path,
			findings: mine.filter((finding) => finding.export === name.name),
		};
	});
	// A class's methods stand together under it, the classes in the order the module exports them.
	const owners = [...new Set(listed.map((entry) => entry.owner))];
	const kinds = KINDS.map(([kind, label]) => ({
		kind,
		label,
		exports: listed
			.filter((entry) => entry.kind === kind)
			.toSorted((a, b) => owners.indexOf(a.owner) - owners.indexOf(b.owner)),
	})).filter((entry) => entry.exports.length > 0);
	return { kinds, rollUp: mine.filter((finding) => finding.code === "MODULE_SHALLOW") };
}

/**
 * How many exports a pass counted of a module, each public method of a class counted as its own.
 * @param exports Its counts by kind.
 * @returns The count.
 */
function exportCount(exports: Readonly<Record<string, number>>): number {
	return Object.values(exports).reduce((sum, count) => sum + count, 0);
}

export { exportCount, exportList, type ExportKind, type ListedExport };
