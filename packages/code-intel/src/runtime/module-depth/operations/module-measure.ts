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
// The thresholds are fixed. Each message states the principle and prescribes
// no fix: an agent reasons the fix out. The measured grounds stand only on a
// reading the counts can stand on, and the roll-up keeps its own evidence.

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
	readonly exports: ExportCounts;
	readonly logic: number;
	/**
	 * Whether the counts stand on a complete reading of languages whose
	 * adapters name each export's kind and count its logic.
	 */
	readonly measured: boolean;
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
			"A narrow interface is the few operations callers need.",
	};
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
	if (rolledUp !== undefined) {
		grounds.push(
			`each of its ${rolledUp.length} exports that is not a type has a finding of its own ` +
				`(${rolledUp.join(", ")}), so it hands its insides to its callers`,
		);
	}
	if (measure.measured && width >= SHALLOW_WIDTH && logic < LOGIC_PER_NAME * width) {
		grounds.push(
			`its ${width} names have ${logic} pieces of logic behind them, about ${Math.floor(logic / width)} each`,
		);
	}
	if (grounds.length === 0) return undefined;
	return {
		severity: "warning",
		code: "MODULE_SHALLOW",
		message: `${measure.label} is shallow: ${grounds.join("; and ")}. A deep module hides much logic behind few names.`,
	};
}

/**
 * The verdicts on a module as a whole.
 * @param measure The module.
 * @returns `INTERFACE_WIDE` and `MODULE_SHALLOW`, where each holds.
 */
function moduleFindings(measure: ModuleMeasure): DepthFinding[] {
	const width = widthOf(measure.exports);
	const findings = [measure.measured ? wide(measure, width) : undefined, shallow(measure, width)];
	return findings.filter((each) => each !== undefined);
}

export { type ExportCounts, moduleFindings };
