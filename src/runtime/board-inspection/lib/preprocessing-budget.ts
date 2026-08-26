export const BROAD_PHASE_PREPROCESSING_LIMIT = 25_000_000 as const;

export type PreprocessingPass =
	| "node-hierarchy"
	| "container-boundary"
	| "connector-node"
	| "connector-obstacle"
	| "connector-intersection"
	| "node-overlap"
	| "label-node-overlap"
	| "label-label-overlap";

export type PreprocessingPhase =
	| "prepare-events"
	| "order-events"
	| "activate-or-expire"
	| "compatibility-query"
	| "hierarchy-query"
	| "candidate-intersection";

export class PreprocessingCeilingReached extends Error {
	readonly attempted = 25_000_001 as const;
	readonly limit: 25_000_000 = BROAD_PHASE_PREPROCESSING_LIMIT;

	constructor(
		readonly pass: PreprocessingPass,
		readonly phase: PreprocessingPhase,
	) {
		super(`Inspection preprocessing stopped at ${pass}/${phase}.`);
		this.name = "PreprocessingCeilingReached";
	}
}

/** One inspection-owned logical budget. A refused unit is never executed. */
export class PreprocessingBudget {
	#used = 0;
	#completedBroadPhaseComparisons = 0;
	#diagnosticState: unknown;

	get used(): number {
		return this.#used;
	}

	get completedBroadPhaseComparisons(): number {
		return this.#completedBroadPhaseComparisons;
	}

	get diagnosticState(): unknown {
		return this.#diagnosticState;
	}

	attachDiagnosticState(value: unknown): void {
		this.#diagnosticState = value;
	}

	recordBroadPhaseComparisons(value: number): void {
		this.#completedBroadPhaseComparisons = value;
	}

	charge(pass: PreprocessingPass, phase: PreprocessingPhase, units = 1): void {
		if (!Number.isSafeInteger(units) || units < 0)
			throw new Error(`Invalid preprocessing charge: ${units}`);
		if (units === 0) return;
		const remaining = BROAD_PHASE_PREPROCESSING_LIMIT - this.#used;
		if (units > remaining) {
			this.#used = BROAD_PHASE_PREPROCESSING_LIMIT;
			throw new PreprocessingCeilingReached(pass, phase);
		}
		this.#used += units;
	}
}

export function comparePreprocessingIdentity(
	budget: PreprocessingBudget,
	pass: PreprocessingPass,
	phase: PreprocessingPhase,
	left: string,
	right: string,
): number {
	const shared = Math.min(left.length, right.length);
	for (let index = 0; index < shared; index += 1) {
		budget.charge(pass, phase, 2);
		const aa = left.charCodeAt(index),
			bb = right.charCodeAt(index);
		if (aa !== bb) return aa < bb ? -1 : 1;
	}
	return left.length < right.length ? -1 : left.length > right.length ? 1 : 0;
}

export function stablePreprocessingSort<T>(
	values: readonly T[],
	budget: PreprocessingBudget,
	pass: PreprocessingPass,
	phase: PreprocessingPhase,
	compare: (left: T, right: T) => number,
): T[] {
	if (values.length < 2) return [...values];
	let source = [...values],
		target = Array.from<T>({ length: values.length });
	for (let width = 1; width < values.length; width *= 2) {
		for (let start = 0; start < values.length; start += width * 2) {
			const middle = Math.min(start + width, values.length),
				end = Math.min(start + width * 2, values.length);
			let left = start,
				right = middle,
				output = start;
			while (left < middle && right < end) {
				budget.charge(pass, phase);
				target[output++] =
					compare(source[left]!, source[right]!) <= 0 ? source[left++]! : source[right++]!;
			}
			while (left < middle) target[output++] = source[left++]!;
			while (right < end) target[output++] = source[right++]!;
		}
		[source, target] = [target, source];
	}
	return source;
}
