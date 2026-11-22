// The verdict on a module as a whole, on Ousterhout's measure (TASK-651,
// TASK-659, ADR 0082): a deep module hides much logic behind few names.
//
// The width of a module is the names its callers must learn: its exported
// functions, classes, public methods and values, getters among them, with a
// switchboard counted as one name for each operation it picks by a key
// (module-depth.ts). Its exported types count for nothing. Its logic is the
// count module-depth.ts takes, less what only picks in a switchboard.
//
// `MODULE_SHALLOW`, a warning, holds on either of two grounds, given in one
// finding: every export that is not a type hands its insides to its callers
// (the roll-up), or the module offers W > 0 names with fewer than 4W pieces
// of logic behind them. Equality passes. No width exempts a module and none
// caps it: logic and names both add up across a cut, so cutting a shallow
// module leaves a shallow part, and a wide module deep enough passes.
//
// The threshold is fixed. The message states the principle and prescribes no
// fix: an agent reasons the fix out. The measured ground needs every name in
// a language whose adapter names each export's kind, and every file parsed
// whole, since logic in code that did not parse goes uncounted. Where the
// counted logic would make the module shallow but a file did not parse, the
// verdict is withheld, and the caller says so. So is a verdict that a
// switchboard whose key no type closes would flip. The roll-up keeps its own
// evidence.

import type { DepthFinding } from "#runtime/module-depth/operations/depth-reading.ts";

/** The pieces of logic each name must hide for a module to be deep. */
const LOGIC_PER_NAME = 4;

/** A switchboard that widens a module: its name and the keys of each operation it picks. */
interface Widening {
	readonly name: string;
	readonly operations: readonly (readonly string[])[];
}

/** What the verdict on a module reads. */
interface ModuleMeasure {
	/** The module as a sentence names it, such as `module "Timing"`. */
	readonly label: string;
	/** The names its callers learn. */
	readonly width: number;
	readonly logic: number;
	/** The switchboards counted in the width. */
	readonly widened: readonly Widening[];
	/**
	 * The width and logic were each switchboard whose key no type closes yet
	 * counted, and what each such key waits on; undefined where none waits.
	 */
	readonly unresolved?: {
		readonly width: number;
		readonly logic: number;
		readonly gaps: readonly string[];
	};
	/** Whether every name is in a language whose adapter names each export's kind. */
	readonly supported: boolean;
	/** Whether every file of such a language parsed whole and gave its count of logic. */
	readonly complete: boolean;
	/** The exports that each hand the module's insides to its callers, when every one does. */
	readonly rolledUp: readonly string[] | undefined;
}

/**
 * Whether a module hides too little logic behind its names.
 * @param width Its width.
 * @param logic The pieces of logic counted.
 * @returns True when Ousterhout's measure calls it shallow.
 */
function thin(width: number, logic: number): boolean {
	return width > 0 && logic < LOGIC_PER_NAME * width;
}

/**
 * The evidence of the measured ground.
 * @param measure The module.
 * @returns The sentence.
 */
function measured({ width, logic, widened }: ModuleMeasure): string {
	const each = Number((logic / width).toFixed(2));
	const picked = widened.map(
		({ name, operations }) =>
			`${name} picks ${operations.length} by its key (${operations.map((keys) => keys.join(" or ")).join(", ")})`,
	);
	const keys = widened.length === 0 ? "" : `; ${picked.join(", ")}`;
	return `its ${width} names have ${logic} pieces of logic behind them, ${each} each, below ${LOGIC_PER_NAME}${keys}`;
}

/** The verdict on a module as a whole. */
interface ModuleVerdicts {
	/** `MODULE_SHALLOW`, where it holds. */
	readonly findings: readonly DepthFinding[];
	/**
	 * Whether a file that did not parse withholds the measured shallow
	 * verdict: the logic counted would make the module shallow, and logic in
	 * the code that did not parse could make it deep.
	 */
	readonly withheld: boolean;
	/**
	 * The switchboard keys no type closes yet, where counting them would make
	 * the module shallow: they withhold the measured verdict.
	 */
	readonly gaps: readonly string[];
}

/**
 * The verdict on a module as a whole.
 * @param measure The module.
 * @returns The findings, and what withholds a measured verdict.
 */
function moduleFindings(measure: ModuleMeasure): ModuleVerdicts {
	const judged = measure.supported && measure.complete;
	const shallow = thin(measure.width, measure.logic);
	const { unresolved } = measure;
	const flips = unresolved !== undefined && !shallow && thin(unresolved.width, unresolved.logic);
	const grounds: string[] = [];
	if (measure.rolledUp !== undefined) {
		grounds.push(
			`each of its ${measure.rolledUp.length} exports that is not a type has a finding of its own ` +
				`(${measure.rolledUp.join(", ")}), so it hands its insides to its callers`,
		);
	}
	if (judged && shallow) grounds.push(measured(measure));
	const findings: DepthFinding[] =
		grounds.length === 0
			? []
			: [
					{
						severity: "warning",
						code: "MODULE_SHALLOW",
						message:
							`${measure.label} is shallow: ${grounds.join("; and ")}. A deep module hides much logic ` +
							"behind few names. A name moved to another module, or behind a key, is still a name its callers learn.",
					},
				];
	return {
		findings,
		withheld: measure.supported && !measure.complete && shallow,
		gaps: judged && flips ? unresolved.gaps : [],
	};
}

export { moduleFindings, type ModuleMeasure, type Widening };
