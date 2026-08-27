export const INSPECTION_INPUT_COMPLEXITY_LIMIT = 1_000_000 as const;
export const INSPECTION_ANALYSIS_WORK_LIMIT = 25_000_000 as const;

export const ANALYSIS_WORK_OWNERS = [
	"record-analysis",
	"node-hierarchy",
	"container-boundary",
	"connector-node",
	"connector-obstacle",
	"connector-intersection",
	"node-overlap",
	"label-node-overlap",
	"label-label-overlap",
	"finding-finalization",
] as const;

export const ANALYSIS_WORK_PHASES = [
	"classify-records",
	"aggregate-model",
	"prepare-events",
	"order-events",
	"activate-or-expire",
	"compatibility-query",
	"hierarchy-query",
	"candidate-intersection",
	"finalize-findings",
] as const;

export type AnalysisWorkOwner = (typeof ANALYSIS_WORK_OWNERS)[number];
export type AnalysisWorkPhase = (typeof ANALYSIS_WORK_PHASES)[number];
export type InputUnitKind = "record" | "field" | "array-entry" | "string-code-unit";
export type InspectionPathToken = string | number;

export interface InputStopContext {
	readonly completedRecordCount: number;
	readonly sourceIndex: number | null;
	readonly path: readonly InspectionPathToken[];
	readonly unitKind: InputUnitKind;
}

export class InputComplexityCeilingReached extends Error {
	readonly limit = INSPECTION_INPUT_COMPLEXITY_LIMIT;
	readonly attempted = 1_000_001 as const;

	constructor(readonly context: InputStopContext) {
		super("Inspection input stopped at the input complexity ceiling.");
		this.name = "InputComplexityCeilingReached";
	}
}

export class AnalysisWorkCeilingReached extends Error {
	readonly limit = INSPECTION_ANALYSIS_WORK_LIMIT;
	readonly attempted = 25_000_001 as const;

	constructor(
		readonly owner: AnalysisWorkOwner,
		readonly phase: AnalysisWorkPhase,
	) {
		super(`Inspection analysis stopped at ${owner}/${phase}.`);
		this.name = "AnalysisWorkCeilingReached";
	}
}

const validUnits = (units: number): boolean => Number.isSafeInteger(units) && units >= 0;

/** Owns the two public logical budgets. Claims happen before the owned work starts. */
export class InspectionBudget {
	#inputUnits = 0;
	#analysisWorkItems = 0;
	#completedBroadPhaseComparisons = 0;
	#processedRecordCount = 0;

	get inputUnits(): number {
		return this.#inputUnits;
	}

	get analysisWorkItems(): number {
		return this.#analysisWorkItems;
	}

	get completedBroadPhaseComparisons(): number {
		return this.#completedBroadPhaseComparisons;
	}

	get processedRecordCount(): number {
		return this.#processedRecordCount;
	}

	completeRecordAnalysis(count: number): void {
		if (!validUnits(count)) throw new Error(`Invalid processed record count: ${count}`);
		this.#processedRecordCount = count;
	}

	recordBroadPhaseComparisons(value: number): void {
		this.#completedBroadPhaseComparisons = value;
	}

	claimInput(units: number, context: InputStopContext): void {
		if (!validUnits(units)) throw new Error(`Invalid input complexity claim: ${units}`);
		if (units === 0) return;
		if (units > INSPECTION_INPUT_COMPLEXITY_LIMIT - this.#inputUnits)
			throw new InputComplexityCeilingReached(context);
		this.#inputUnits += units;
	}

	claimWork(owner: AnalysisWorkOwner, phase: AnalysisWorkPhase, items = 1): void {
		if (!validUnits(items)) throw new Error(`Invalid analysis work claim: ${items}`);
		if (items === 0) return;
		if (items > INSPECTION_ANALYSIS_WORK_LIMIT - this.#analysisWorkItems) {
			this.#analysisWorkItems = INSPECTION_ANALYSIS_WORK_LIMIT;
			throw new AnalysisWorkCeilingReached(owner, phase);
		}
		this.#analysisWorkItems += items;
	}

	claimSort(owner: AnalysisWorkOwner, phase: AnalysisWorkPhase, length: number): void {
		if (!validUnits(length)) throw new Error(`Invalid stable sort length: ${length}`);
		if (length < 2) return;
		const logarithm = Math.ceil(Math.log2(length));
		const work =
			length > Math.floor(Number.MAX_SAFE_INTEGER / logarithm)
				? Number.MAX_SAFE_INTEGER
				: length * logarithm;
		this.claimWork(owner, phase, work);
	}
}
