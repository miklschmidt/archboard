import { types as nodeTypes } from "node:util";

export const INSPECTION_INPUT_COMPLEXITY_LIMIT = 1_000_000 as const;

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

const validUnits = (units: number): boolean => Number.isSafeInteger(units) && units >= 0;

class InputComplexityAccumulator {
	#inputUnits = 0;

	get inputUnits(): number {
		return this.#inputUnits;
	}

	claim(units: number, context: InputStopContext): void {
		if (!validUnits(units)) throw new Error(`Invalid input complexity claim: ${units}`);
		if (units === 0) return;
		if (units > INSPECTION_INPUT_COMPLEXITY_LIMIT - this.#inputUnits)
			throw new InputComplexityCeilingReached(context);
		this.#inputUnits += units;
	}
}

const INSPECTION_FIELDS = [
	"id",
	"type",
	"isDeleted",
	"x",
	"y",
	"width",
	"height",
	"angle",
	"index",
	"strokeColor",
	"backgroundColor",
	"fillStyle",
	"strokeWidth",
	"strokeStyle",
	"roughness",
	"opacity",
	"groupIds",
	"customData",
	"archboard",
	"library",
	"node",
	"kind",
	"bridge",
	"bridgeId",
	"role",
	"overConnectorId",
	"underConnectorId",
	"overSegmentIndex",
	"underSegmentIndex",
	"crossing",
	"background",
	"binding",
	"path",
	"repo",
	"itemId",
	"item",
	"source",
	"start",
	"end",
	"startBinding",
	"endBinding",
	"elementId",
	"focus",
	"gap",
	"fixedPoint",
	"boundElements",
	"frameId",
	"locked",
	"lastCommittedPoint",
	"startArrowhead",
	"endArrowhead",
	"containerId",
	"points",
	"roundness",
	"fixedSegments",
	"elbowed",
	"curve",
	"curveKind",
	"fontFamily",
	"link",
	"label",
	"text",
	"createdAt",
] as const;

export type SnapshotField = (typeof INSPECTION_FIELDS)[number];
export type SnapshotObject = { readonly [Field in SnapshotField]: unknown };
export type SnapshotRecord = SnapshotObject;

export type NonDataInputIssue =
	| "proxy"
	| "accessor"
	| "active-path-cycle"
	| "function"
	| "symbol"
	| "bigint"
	| "non-plain-object"
	| "non-array-root";

export interface SnapshotIssue {
	readonly sourceIndex: number | null;
	readonly path: readonly InspectionPathToken[];
	readonly issue: NonDataInputIssue;
	readonly admittedRecord: SnapshotRecord | null;
}

export interface InspectionInputSnapshot {
	readonly records: readonly (SnapshotRecord | null)[];
	readonly blockedSourceIndexes: ReadonlySet<number>;
	readonly issues: readonly SnapshotIssue[];
	readonly limit: InputComplexityCeilingReached | null;
	readonly totalRecordCount: number;
	readonly completedRecordCount: number;
	readonly inputUnits: number;
}

interface ValueTask {
	readonly kind: "value";
	readonly value: unknown;
	readonly sourceIndex: number;
	readonly path: readonly InspectionPathToken[];
	readonly assign: (value: unknown) => void;
}

interface LeaveTask {
	readonly kind: "leave";
	readonly value: object;
}

type SnapshotTask = ValueTask | LeaveTask;

// The closed type makes field additions compile-time visible while omitted source
// properties remain omitted at runtime for the persisted-shape presence checks.
const emptySnapshotObject = (): SnapshotObject => ({}) as SnapshotObject;

const plainPrototype = (value: object): boolean => {
	const prototype = Object.getPrototypeOf(value);
	return prototype === null || prototype === Object.prototype;
};

const stopContext = (
	completedRecordCount: number,
	sourceIndex: number | null,
	path: readonly InspectionPathToken[],
	unitKind: InputStopContext["unitKind"],
): InputStopContext => ({ completedRecordCount, sourceIndex, path, unitKind });

/** Copy the fixed inspection vocabulary without executing caller-owned JavaScript. */
export function snapshotInspectionInput(input: readonly unknown[]): InspectionInputSnapshot {
	const budget = new InputComplexityAccumulator();
	const records: Array<SnapshotRecord | null> = [];
	const issues: SnapshotIssue[] = [];
	const blockedSourceIndexes = new Set<number>();
	let limit: InputComplexityCeilingReached | null = null;
	let completedRecordCount = 0;

	if (nodeTypes.isProxy(input)) {
		issues.push({ sourceIndex: null, path: [], issue: "proxy", admittedRecord: null });
		return {
			records,
			blockedSourceIndexes,
			issues,
			limit,
			totalRecordCount: 0,
			completedRecordCount,
			inputUnits: 0,
		};
	}
	if (!Array.isArray(input)) {
		issues.push({ sourceIndex: null, path: [], issue: "non-array-root", admittedRecord: null });
		return {
			records,
			blockedSourceIndexes,
			issues,
			limit,
			totalRecordCount: 0,
			completedRecordCount,
			inputUnits: 0,
		};
	}

	const totalRecordCount = input.length;
	for (let sourceIndex = 0; sourceIndex < totalRecordCount; sourceIndex += 1) {
		try {
			budget.claim(1, stopContext(completedRecordCount, sourceIndex, [], "record"));
		} catch (error) {
			if (!(error instanceof InputComplexityCeilingReached)) throw error;
			limit = error;
			break;
		}
		const rootDescriptor = Object.getOwnPropertyDescriptor(input, String(sourceIndex));
		if (rootDescriptor && !("value" in rootDescriptor)) {
			issues.push({
				sourceIndex,
				path: [],
				issue: "accessor",
				admittedRecord: null,
			});
			records.push(null);
			completedRecordCount += 1;
			continue;
		}

		let admittedRoot: unknown;
		let blocked = false;
		const active = new WeakSet<object>();
		const recordIssues: Array<Omit<SnapshotIssue, "admittedRecord">> = [];
		const tasks: SnapshotTask[] = [
			{
				kind: "value",
				value: rootDescriptor?.value,
				sourceIndex,
				path: [],
				assign: (value) => {
					admittedRoot = value;
				},
			},
		];

		try {
			while (tasks.length > 0) {
				const task = tasks.pop()!;
				if (task.kind === "leave") {
					active.delete(task.value);
					continue;
				}
				const { value, path } = task;
				const scalarType = typeof value;
				if (
					value === null ||
					value === undefined ||
					scalarType === "number" ||
					scalarType === "boolean"
				) {
					task.assign(value);
					continue;
				}
				if (scalarType === "string") {
					budget.claim(
						(value as string).length,
						stopContext(completedRecordCount, sourceIndex, path, "string-code-unit"),
					);
					task.assign(value);
					continue;
				}
				if (scalarType === "function" || scalarType === "symbol" || scalarType === "bigint") {
					blocked = true;
					recordIssues.push({ sourceIndex, path, issue: scalarType as NonDataInputIssue });
					task.assign(undefined);
					continue;
				}

				const objectValue = value as object;
				if (nodeTypes.isProxy(objectValue)) {
					blocked = true;
					recordIssues.push({ sourceIndex, path, issue: "proxy" });
					task.assign(undefined);
					continue;
				}
				if (active.has(objectValue)) {
					blocked = true;
					recordIssues.push({ sourceIndex, path, issue: "active-path-cycle" });
					task.assign(undefined);
					continue;
				}

				if (Array.isArray(objectValue)) {
					const length = objectValue.length;
					budget.claim(length, stopContext(completedRecordCount, sourceIndex, path, "array-entry"));
					const output: unknown[] = [];
					output.length = length;
					output.fill(undefined);
					task.assign(output);
					active.add(objectValue);
					tasks.push({ kind: "leave", value: objectValue });
					for (let index = length - 1; index >= 0; index -= 1) {
						const descriptor = Object.getOwnPropertyDescriptor(objectValue, String(index));
						if (!descriptor) continue;
						if (!("value" in descriptor)) {
							blocked = true;
							recordIssues.push({
								sourceIndex,
								path: [...path, index],
								issue: "accessor",
							});
							continue;
						}
						tasks.push({
							kind: "value",
							value: descriptor.value,
							sourceIndex,
							path: [...path, index],
							assign: (entry) => {
								output[index] = entry;
							},
						});
					}
					continue;
				}

				if (!plainPrototype(objectValue)) {
					blocked = true;
					recordIssues.push({ sourceIndex, path, issue: "non-plain-object" });
					task.assign(undefined);
					continue;
				}
				const output = emptySnapshotObject();
				task.assign(output);
				active.add(objectValue);
				tasks.push({ kind: "leave", value: objectValue });
				for (let index = INSPECTION_FIELDS.length - 1; index >= 0; index -= 1) {
					const field = INSPECTION_FIELDS[index]!;
					const descriptor = Object.getOwnPropertyDescriptor(objectValue, field);
					if (!descriptor) continue;
					if (!("value" in descriptor)) {
						blocked = true;
						recordIssues.push({ sourceIndex, path: [...path, field], issue: "accessor" });
						continue;
					}
					budget.claim(
						1,
						stopContext(completedRecordCount, sourceIndex, [...path, field], "field"),
					);
					tasks.push({
						kind: "value",
						value: descriptor.value,
						sourceIndex,
						path: [...path, field],
						assign: (fieldValue) => {
							(output as Record<SnapshotField, unknown>)[field] = fieldValue;
						},
					});
				}
			}
		} catch (error) {
			if (!(error instanceof InputComplexityCeilingReached)) throw error;
			limit = error;
		}

		const admittedRecord =
			admittedRoot && typeof admittedRoot === "object" && !Array.isArray(admittedRoot)
				? (admittedRoot as SnapshotRecord)
				: null;
		for (const issue of recordIssues) issues.push({ ...issue, admittedRecord });
		if (blocked) blockedSourceIndexes.add(sourceIndex);
		records.push(blocked ? null : admittedRecord);
		if (limit) break;
		completedRecordCount += 1;
	}

	return {
		records,
		issues,
		blockedSourceIndexes,
		limit,
		totalRecordCount,
		completedRecordCount,
		inputUnits: budget.inputUnits,
	};
}
