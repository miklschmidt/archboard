import { types as nodeTypes } from "node:util";

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

type SnapshotField = (typeof INSPECTION_FIELDS)[number];
// The closed field vocabulary makes field additions compile-time visible. Every
// field is optional because omitted source properties stay omitted at runtime
// for the persisted-shape presence checks (`"points" in raw`).
type SnapshotObject = { readonly [Field in SnapshotField]?: unknown };
type SnapshotRecord = SnapshotObject;
type MutableSnapshotObject = { -readonly [Field in SnapshotField]?: unknown };

type NonDataInputIssue =
	| "proxy"
	| "accessor"
	| "active-path-cycle"
	| "function"
	| "symbol"
	| "bigint"
	| "non-plain-object"
	| "non-array-root";

interface SnapshotIssue {
	readonly sourceIndex: number | null;
	readonly path: readonly InspectionPathToken[];
	readonly issue: NonDataInputIssue;
	readonly admittedRecord: SnapshotRecord | null;
}

interface InspectionInputSnapshot {
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
	readonly path: readonly InspectionPathToken[];
	readonly assign: (value: unknown) => void;
}

interface LeaveTask {
	readonly kind: "leave";
	readonly value: object;
}

type SnapshotTask = ValueTask | LeaveTask;

/** Mutable state of one record's depth-first copy. */
interface RecordScan {
	readonly sourceIndex: number;
	readonly completedRecordCount: number;
	readonly budget: InputComplexityAccumulator;
	readonly active: WeakSet<object>;
	readonly tasks: SnapshotTask[];
	readonly issues: Array<Omit<SnapshotIssue, "admittedRecord">>;
	blocked: boolean;
	admittedRecord: SnapshotRecord | null;
}

/**
 * Whether an object's prototype is one of the two plain-data prototypes.
 * @param value the object to check
 * @returns true for null-prototype and Object.prototype objects
 */
const plainPrototype = (value: object): boolean => {
	const prototype = Object.getPrototypeOf(value);
	return prototype === null || prototype === Object.prototype;
};

/**
 * Build the stop context for a unit claim.
 * @param completedRecordCount records fully copied before this one
 * @param sourceIndex the record being copied, or null at the root
 * @param path the field and index path inside the record
 * @param unitKind what kind of unit the claim pays for
 * @returns the context reported when the ceiling is reached
 */
const stopContext = (
	completedRecordCount: number,
	sourceIndex: number | null,
	path: readonly InspectionPathToken[],
	unitKind: InputStopContext["unitKind"],
): InputStopContext => ({ completedRecordCount, sourceIndex, path, unitKind });

/**
 * Whether a value copies as itself without any unit cost.
 * @param value the candidate value
 * @returns true for null, undefined, numbers and booleans
 */
const inertScalar = (value: unknown): boolean =>
	value === null || value === undefined || typeof value === "number" || typeof value === "boolean";

/**
 * Name the non-data issue for a primitive the snapshot refuses to carry.
 * @param value a value that is neither an inert scalar, a string nor an object
 * @returns the issue for functions, symbols and bigints, or null for anything else
 */
function nonDataScalarIssue(value: unknown): NonDataInputIssue | null {
	switch (typeof value) {
		case "function":
			return "function";
		case "symbol":
			return "symbol";
		case "bigint":
			return "bigint";
		default:
			return null;
	}
}

/**
 * Record a non-data issue at a path and block the record from semantic analysis.
 * @param scan the record scan being updated
 * @param path where the issue sits inside the record
 * @param issue what was found there
 */
function refuse(scan: RecordScan, path: readonly InspectionPathToken[], issue: NonDataInputIssue): void {
	scan.blocked = true;
	scan.issues.push({ sourceIndex: scan.sourceIndex, path, issue });
}

/**
 * Charge one unit claim during a record scan.
 * @param scan the record scan paying the units
 * @param units how many units the piece of input costs
 * @param path where the input sits
 * @param unitKind what kind of unit is being paid for
 */
function claim(
	scan: RecordScan,
	units: number,
	path: readonly InspectionPathToken[],
	unitKind: InputUnitKind,
): void {
	scan.budget.claim(units, stopContext(scan.completedRecordCount, scan.sourceIndex, path, unitKind));
}

/**
 * Copy an array by scheduling each own data entry; accessor entries block the record.
 * @param scan the record scan
 * @param task the value task holding the array and its assignment slot
 * @param values the source array
 */
function scanArray(scan: RecordScan, task: ValueTask, values: readonly unknown[]): void {
	const { path } = task;
	const length = values.length;
	claim(scan, length, path, "array-entry");
	const output: unknown[] = [];
	output.length = length;
	output.fill(undefined);
	task.assign(output);
	scan.active.add(values);
	scan.tasks.push({ kind: "leave", value: values });
	for (let index = length - 1; index >= 0; index -= 1) {
		const descriptor = Object.getOwnPropertyDescriptor(values, String(index));
		if (!descriptor) {
			continue;
		}
		if (!("value" in descriptor)) {
			refuse(scan, [...path, index], "accessor");
			continue;
		}
		scan.tasks.push({
			kind: "value",
			value: descriptor.value,
			path: [...path, index],
			assign: (entry) => {
				output[index] = entry;
			},
		});
	}
}

/**
 * Copy the inspection vocabulary out of a plain object into an inert record.
 * @param scan the record scan
 * @param task the value task holding the object and its assignment slot
 * @param source the plain source object
 */
function scanPlainObject(scan: RecordScan, task: ValueTask, source: object): void {
	const { path } = task;
	const output: MutableSnapshotObject = {};
	task.assign(output);
	if (path.length === 0) {
		scan.admittedRecord = output;
	}
	scan.active.add(source);
	scan.tasks.push({ kind: "leave", value: source });
	for (let index = INSPECTION_FIELDS.length - 1; index >= 0; index -= 1) {
		const field = INSPECTION_FIELDS[index]!;
		const descriptor = Object.getOwnPropertyDescriptor(source, field);
		if (!descriptor) {
			continue;
		}
		if (!("value" in descriptor)) {
			refuse(scan, [...path, field], "accessor");
			continue;
		}
		claim(scan, 1, [...path, field], "field");
		scan.tasks.push({
			kind: "value",
			value: descriptor.value,
			path: [...path, field],
			assign: (fieldValue) => {
				output[field] = fieldValue;
			},
		});
	}
}

/**
 * Copy one object value, refusing proxies, cycles and exotic prototypes.
 * @param scan the record scan
 * @param task the value task holding the object
 * @param value the object to copy
 */
function scanObject(scan: RecordScan, task: ValueTask, value: object): void {
	if (nodeTypes.isProxy(value)) {
		refuse(scan, task.path, "proxy");
		task.assign(undefined);
		return;
	}
	if (scan.active.has(value)) {
		refuse(scan, task.path, "active-path-cycle");
		task.assign(undefined);
		return;
	}
	if (Array.isArray(value)) {
		scanArray(scan, task, value);
		return;
	}
	if (!plainPrototype(value)) {
		refuse(scan, task.path, "non-plain-object");
		task.assign(undefined);
		return;
	}
	scanPlainObject(scan, task, value);
}

/**
 * Copy one scheduled value into its assignment slot.
 * @param scan the record scan
 * @param task the value task to perform
 */
function scanValue(scan: RecordScan, task: ValueTask): void {
	const { value, path } = task;
	if (inertScalar(value)) {
		task.assign(value);
		return;
	}
	if (typeof value === "string") {
		claim(scan, value.length, path, "string-code-unit");
		task.assign(value);
		return;
	}
	if (typeof value !== "object" || value === null) {
		refuse(scan, path, nonDataScalarIssue(value) ?? "non-plain-object");
		task.assign(undefined);
		return;
	}
	scanObject(scan, task, value);
}

/**
 * Drain a record's task stack until it is copied or the ceiling stops it.
 * @param scan the record scan
 * @returns the ceiling error when the scan stopped, otherwise null
 */
function drainTasks(scan: RecordScan): InputComplexityCeilingReached | null {
	try {
		while (scan.tasks.length > 0) {
			const task = scan.tasks.pop()!;
			if (task.kind === "leave") {
				scan.active.delete(task.value);
				continue;
			}
			scanValue(scan, task);
		}
	} catch (error) {
		if (!(error instanceof InputComplexityCeilingReached)) {
			throw error;
		}
		return error;
	}
	return null;
}

interface RecordScanResult {
	readonly admittedRecord: SnapshotRecord | null;
	readonly blocked: boolean;
	readonly issues: readonly SnapshotIssue[];
	readonly limit: InputComplexityCeilingReached | null;
}

/**
 * Copy one root record of the input array.
 * @param rootValue the record value read from the input's own data property
 * @param sourceIndex the record's position in the input
 * @param budget the shared unit accumulator
 * @param completedRecordCount records fully copied before this one
 * @returns the admitted record, whether it is blocked, its issues and any ceiling stop
 */
function scanRootRecord(
	rootValue: unknown,
	sourceIndex: number,
	budget: InputComplexityAccumulator,
	completedRecordCount: number,
): RecordScanResult {
	const scan: RecordScan = {
		sourceIndex,
		completedRecordCount,
		budget,
		active: new WeakSet<object>(),
		tasks: [],
		issues: [],
		blocked: false,
		admittedRecord: null,
	};
	scan.tasks.push({
		kind: "value",
		value: rootValue,
		path: [],
		assign: () => {},
	});
	const limit = drainTasks(scan);
	const admittedRecord = scan.admittedRecord;
	return {
		admittedRecord,
		blocked: scan.blocked,
		issues: scan.issues.map((issue) => ({ ...issue, admittedRecord })),
		limit,
	};
}

/**
 * Refuse a root that is not a plain array before any record is read.
 * @param input the caller-owned input
 * @returns the empty snapshot naming the root issue, or null when the root is scannable
 */
function rootRefusal(input: readonly unknown[]): InspectionInputSnapshot | null {
	const issue: NonDataInputIssue | null = nodeTypes.isProxy(input)
		? "proxy"
		: Array.isArray(input)
			? null
			: "non-array-root";
	if (issue === null) {
		return null;
	}
	return {
		records: [],
		blockedSourceIndexes: new Set<number>(),
		issues: [{ sourceIndex: null, path: [], issue, admittedRecord: null }],
		limit: null,
		totalRecordCount: 0,
		completedRecordCount: 0,
		inputUnits: 0,
	};
}

/** Accumulating output of the root scan. */
interface SnapshotAccumulator {
	readonly records: Array<SnapshotRecord | null>;
	readonly issues: SnapshotIssue[];
	readonly blockedSourceIndexes: Set<number>;
	completedRecordCount: number;
}

/**
 * Claim the one unit each root record costs before reading it.
 * @param budget the shared unit accumulator
 * @param sourceIndex the record about to be read
 * @param completedRecordCount records fully copied before it
 * @returns the ceiling error when the record does not fit, otherwise null
 */
function claimRecordUnit(
	budget: InputComplexityAccumulator,
	sourceIndex: number,
	completedRecordCount: number,
): InputComplexityCeilingReached | null {
	try {
		budget.claim(1, stopContext(completedRecordCount, sourceIndex, [], "record"));
	} catch (error) {
		if (!(error instanceof InputComplexityCeilingReached)) {
			throw error;
		}
		return error;
	}
	return null;
}

/**
 * Read and copy one root record into the accumulator.
 * @param input the caller-owned input array
 * @param sourceIndex the record to read
 * @param budget the shared unit accumulator
 * @param output the accumulating snapshot
 * @returns the ceiling error when this record stopped the scan, otherwise null
 */
function admitRecord(
	input: readonly unknown[],
	sourceIndex: number,
	budget: InputComplexityAccumulator,
	output: SnapshotAccumulator,
): InputComplexityCeilingReached | null {
	const rootDescriptor = Object.getOwnPropertyDescriptor(input, String(sourceIndex));
	if (rootDescriptor && !("value" in rootDescriptor)) {
		output.issues.push({ sourceIndex, path: [], issue: "accessor", admittedRecord: null });
		output.records.push(null);
		output.completedRecordCount += 1;
		return null;
	}
	const scanned = scanRootRecord(
		rootDescriptor?.value,
		sourceIndex,
		budget,
		output.completedRecordCount,
	);
	output.issues.push(...scanned.issues);
	if (scanned.blocked) {
		output.blockedSourceIndexes.add(sourceIndex);
	}
	output.records.push(scanned.blocked ? null : scanned.admittedRecord);
	if (scanned.limit) {
		return scanned.limit;
	}
	output.completedRecordCount += 1;
	return null;
}

/**
 * Copy the fixed inspection vocabulary without executing caller-owned JavaScript.
 *
 * This is the only boundary that accepts caller-owned data. It enforces the
 * 1,000,000-unit input limit before any semantic analysis runs.
 * @param input the caller-owned records
 * @returns inert records, the issues found, and where the scan stopped if it did
 */
function snapshotInspectionInput(input: readonly unknown[]): InspectionInputSnapshot {
	const refused = rootRefusal(input);
	if (refused) {
		return refused;
	}
	const budget = new InputComplexityAccumulator();
	const output: SnapshotAccumulator = {
		records: [],
		issues: [],
		blockedSourceIndexes: new Set<number>(),
		completedRecordCount: 0,
	};
	let limit: InputComplexityCeilingReached | null = null;
	const totalRecordCount = input.length;
	for (let sourceIndex = 0; sourceIndex < totalRecordCount && limit === null; sourceIndex += 1) {
		limit =
			claimRecordUnit(budget, sourceIndex, output.completedRecordCount) ??
			admitRecord(input, sourceIndex, budget, output);
	}
	return {
		records: output.records,
		issues: output.issues,
		blockedSourceIndexes: output.blockedSourceIndexes,
		limit,
		totalRecordCount,
		completedRecordCount: output.completedRecordCount,
		inputUnits: budget.inputUnits,
	};
}

export {
	INSPECTION_INPUT_COMPLEXITY_LIMIT,
	type InputUnitKind,
	type InspectionPathToken,
	type InputStopContext,
	InputComplexityCeilingReached,
	INSPECTION_FIELDS,
	type SnapshotField,
	type SnapshotObject,
	type SnapshotRecord,
	type NonDataInputIssue,
	type SnapshotIssue,
	type InspectionInputSnapshot,
	snapshotInspectionInput,
};
