/**
 * The fixed ceiling the inspection input is measured against, and the accumulator that
 * charges every copied unit to it. The snapshot owner enforces this before any semantic
 * analysis runs; it is a capacity safeguard, not a runtime guarantee.
 */

const INSPECTION_INPUT_COMPLEXITY_LIMIT = 1_000_000 as const;

type InputUnitKind = "record" | "field" | "array-entry" | "string-code-unit";
type InspectionPathToken = string | number;

interface InputStopContext {
	readonly completedRecordCount: number;
	readonly sourceIndex: number | null;
	readonly path: readonly InspectionPathToken[];
	readonly unitKind: InputUnitKind;
}

class InputComplexityCeilingReached extends Error {
	readonly limit = INSPECTION_INPUT_COMPLEXITY_LIMIT;
	readonly attempted = 1_000_001 as const;

	/**
	 * Record where the input scan stopped so the report can name the exact unit.
	 * @param context the record, path and unit kind that exceeded the ceiling
	 */
	constructor(readonly context: InputStopContext) {
		super("Inspection input stopped at the input complexity ceiling.");
		this.name = "InputComplexityCeilingReached";
	}
}

/**
 * Whether a unit claim is a non-negative safe integer.
 * @param units the claimed unit count
 * @returns true when the claim can be accounted exactly
 */
const validUnits = (units: number): boolean => Number.isSafeInteger(units) && units >= 0;

class InputComplexityAccumulator {
	#inputUnits = 0;

	/**
	 * Units claimed so far.
	 * @returns the running unit total
	 */
	get inputUnits(): number {
		return this.#inputUnits;
	}

	/**
	 * Claim input units against the fixed ceiling, stopping the scan when they do not fit.
	 * @param units the units this piece of input costs
	 * @param context where the scan is, reported if the ceiling is reached
	 */
	claim(units: number, context: InputStopContext): void {
		if (!validUnits(units)) {
			throw new Error(`Invalid input complexity claim: ${units}`);
		}
		if (units === 0) {
			return;
		}
		if (units > INSPECTION_INPUT_COMPLEXITY_LIMIT - this.#inputUnits) {
			throw new InputComplexityCeilingReached(context);
		}
		this.#inputUnits += units;
	}
}

export {
	INSPECTION_INPUT_COMPLEXITY_LIMIT,
	InputComplexityAccumulator,
	InputComplexityCeilingReached,
	type InputStopContext,
	type InputUnitKind,
	type InspectionPathToken,
};
