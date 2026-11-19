// The verdicts on a module as a whole, on Ousterhout's measure (TASK-651,
// ADR 0082): a deep module hides much logic behind few names.
//
// The width of a module is what its callers must learn: its exported
// functions, classes, public methods and values, getters among them. Its
// exported types count for nothing. Its logic is the count module-depth.ts
// already takes.
//
// - `INTERFACE_WIDE`: a width above 20, a warning on every module alike.
// - `MODULE_SHALLOW`: a module whose every export that is not a type hands
//   its insides to its callers (the roll-up), or one whose width is at least 8
//   with fewer than 4 pieces of logic behind each name. One warning, with the
//   evidence of each ground that holds.
//
// In a folder module that declares no interface (decision 16), the width
// counts only the names a file outside it uses: its language makes a file
// export a name for another file of the module to import it, so a name only
// its own files import costs a caller nothing, and neither does a name
// nothing uses, which `EXPOSED_UNUSED` names. The message says so.
//
// The thresholds are fixed. Each message states the principle and prescribes
// no fix: an agent reasons the fix out. The width stands where every name is
// in a language whose adapter names each export's kind. It needs no whole
// parse, since the exposure reader names the exports. The measured ground of
// `MODULE_SHALLOW` also needs every file parsed whole, since logic in code
// that did not parse goes uncounted. Where the logic counted would make the
// module shallow but a file did not parse, the verdict is withheld, and the
// caller says so. The roll-up keeps its own evidence.

import type { DepthFinding } from "#runtime/module-depth/operations/depth-reading.ts";
import type { ModuleDepth } from "#shared/protocol/code-check.ts";

/** A module's exports, by kind. */
type ExportCounts = ModuleDepth["exports"];

/** The width above which an interface is wide. */
const WIDE = 20;
/** The least width that the measure judges shallow. */
const SHALLOW_WIDTH = 8;
/** The pieces of logic each name must hide for a module of that width to be deep. */
const LOGIC_PER_NAME = 4;

/** What the verdicts on a module read. */
interface ModuleMeasure {
	/** The module as a sentence names it, such as `module "Timing"`. */
	readonly label: string;
	/** The exports its width counts, by kind. */
	readonly exports: ExportCounts;
	/**
	 * Where the module declares no interface, the names its width leaves out:
	 * those only its own files import, and those nothing uses.
	 */
	readonly undeclared?: { readonly inside: number; readonly unused: number };
	readonly logic: number;
	/** Whether every name is in a language whose adapter names each export's kind. */
	readonly supported: boolean;
	/** Whether every file of such a language parsed whole and gave its count of logic. */
	readonly complete: boolean;
	/** The exports that each hand the module's insides to its callers, when every one does. */
	readonly rolledUp: readonly string[] | undefined;
}

/** The kinds that count toward the width, with their names in a message. */
const COUNTED = [
	["functions", "function", "functions"],
	["classes", "class", "classes"],
	["methods", "method", "methods"],
	["values", "value", "values"],
] as const;

/**
 * The names callers must learn: every export that is not a type.
 * @param exports The exports by kind.
 * @returns The width.
 */
function widthOf(exports: ExportCounts): number {
	return COUNTED.reduce((sum, [kind]) => sum + exports[kind], 0);
}

/**
 * The finding on a module whose interface is wide.
 * @param measure The module.
 * @param width Its width.
 * @returns The finding, or undefined for a narrow interface.
 */
function wide(measure: ModuleMeasure, width: number): DepthFinding | undefined {
	if (width <= WIDE) return undefined;
	const kinds = COUNTED.flatMap(([kind, one, many]) => {
		const count = measure.exports[kind];
		return count === 0 ? [] : [`${count} ${count === 1 ? one : many}`];
	});
	return {
		severity: "warning",
		code: "INTERFACE_WIDE",
		message:
			`${measure.label} has a wide interface: callers must learn ${width} names (${kinds.join(", ")}). ` +
			`${undeclaredWhy(measure.undeclared)}A narrow interface is the few operations callers need.`,
	};
}

/**
 * What the width of a module that declares no interface leaves out.
 * @param undeclared The names it leaves out, where the module declares no interface.
 * @returns The sentence, or nothing where the module declares its interface.
 */
function undeclaredWhy(undeclared: ModuleMeasure["undeclared"]): string {
	if (undeclared === undefined) return "";
	const { inside, unused } = undeclared;
	const left = [
		...(inside === 0 ? [] : [`only its own files import ${inside} more`]),
		...(unused === 0 ? [] : [`nothing uses ${unused}`]),
	];
	const why = left.length === 0 ? "" : `; ${left.join(", and ")}, which cost a caller nothing`;
	return `It declares no interface, so its width counts only the names files outside it use${why}. `;
}

/**
 * Whether a module of this width hides too little logic behind its names.
 * @param width Its width.
 * @param logic The pieces of logic counted.
 * @returns True when Ousterhout's measure calls it shallow.
 */
function thin(width: number, logic: number): boolean {
	return width >= SHALLOW_WIDTH && logic < LOGIC_PER_NAME * width;
}

/**
 * The finding on a shallow module, with the evidence of each ground that holds.
 * @param measure The module.
 * @param width Its width.
 * @returns The finding, or undefined for a module neither ground names.
 */
function shallow(measure: ModuleMeasure, width: number): DepthFinding | undefined {
	const { rolledUp, logic } = measure;
	const grounds: string[] = [];
	const measured = measure.supported && measure.complete && thin(width, logic);
	if (rolledUp !== undefined) {
		grounds.push(
			`each of its ${rolledUp.length} exports that is not a type has a finding of its own ` +
				`(${rolledUp.join(", ")}), so it hands its insides to its callers`,
		);
	}
	if (measured) {
		grounds.push(
			`its ${width} names have ${logic} pieces of logic behind them, about ${(logic / width).toFixed(1)} each`,
		);
	}
	if (grounds.length === 0) return undefined;
	return {
		severity: "warning",
		code: "MODULE_SHALLOW",
		message: `${measure.label} is shallow: ${grounds.join("; and ")}. A deep module hides much logic behind few names.`,
	};
}

/** The verdicts on a module as a whole. */
interface ModuleVerdicts {
	/** `INTERFACE_WIDE` and `MODULE_SHALLOW`, where each holds. */
	readonly findings: readonly DepthFinding[];
	/**
	 * Whether a file that did not parse withholds the measured shallow
	 * verdict: the logic counted would make the module shallow, and logic in
	 * the code that did not parse could make it deep.
	 */
	readonly withheld: boolean;
}

/**
 * The verdicts on a module as a whole.
 * @param measure The module.
 * @returns The findings, and whether a file that did not parse withholds one.
 */
function moduleFindings(measure: ModuleMeasure): ModuleVerdicts {
	const width = widthOf(measure.exports);
	const found = [measure.supported ? wide(measure, width) : undefined, shallow(measure, width)];
	return {
		findings: found.filter((each) => each !== undefined),
		withheld: measure.supported && !measure.complete && thin(width, measure.logic),
	};
}

export { type ExportCounts, type ModuleMeasure, moduleFindings };
