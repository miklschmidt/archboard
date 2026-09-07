import type { NodeRef, ObstacleRef } from "@/runtime/board-inspection/schemas";
import type { DecodedRecord } from "@/runtime/board-inspection/lib/decode";
import type { ExactBox } from "@/runtime/board-inspection/lib/geometry";
import type { SweepWork } from "@/runtime/board-inspection/lib/interval-sweep";
import { compareIdentity } from "@/runtime/board-inspection/lib/ordering";

interface InspectionNode {
	id: string;
	members: DecodedRecord[];
	bodies: DecodedRecord[];
	labels: DecodedRecord[];
	aggregate: ExactBox | null;
	body: ExactBox;
	boundaries: DecodedRecord[];
	parentId: string | null;
	children: string[];
	ref: NodeRef;
}

interface InspectionObstacle {
	id: string;
	kind: "library-component" | "grouped-component";
	members: DecodedRecord[];
	box: ExactBox;
	ref: ObstacleRef;
}

interface AggregateCoordinateFailure {
	scope: "semantic-node-body" | "semantic-node-aggregate" | "obstacle-component";
	subjectId: string;
	members: DecodedRecord[];
}

type BlockingBindingIssue =
	| "not-object"
	| "array"
	| "missing-element-id"
	| "empty-element-id"
	| "non-string-element-id";

interface BindingTargetClassification {
	readableTargetId: string | null;
	blockingIssue: BlockingBindingIssue | null;
}

interface ConnectorEndpointClassification {
	nodeAnalysisEligible: boolean;
	startElement: string | undefined;
	endElement: string | undefined;
	startNode: string | undefined;
	endNode: string | undefined;
}

interface LabelOwnershipClassification {
	labelId: string;
	forwardOwnerId: string | null;
	reverseOwnerIds: string[];
	candidateOwnerIds: string[];
	resolvedOwnerId: string | null;
	state: "none" | "forward-only" | "reverse-only" | "matching" | "conflicting" | "blocked";
}

type BoundElementIssue =
	| "not-array"
	| "entry-not-object"
	| "missing-id"
	| "empty-id"
	| "non-string-id"
	| "missing-type"
	| "invalid-type";

interface BoundElementsClassification {
	readableEntries: Array<{ id: string; type: "text" | "arrow" }>;
	problems: Array<{ issue: BoundElementIssue; entryIndex: number | null }>;
}

interface InspectionModel {
	byId: Map<string, DecodedRecord>;
	duplicateIds: Set<string>;
	nodes: Map<string, InspectionNode>;
	nodeOfElement: Map<string, string>;
	confirmedLabels: Map<string, string>;
	labelOwnership: Map<string, LabelOwnershipClassification>;
	connectorEndpoints: Map<string, ConnectorEndpointClassification>;
	containerOnlyIds: Set<string>;
	qualifyingGroupedObstacleElementIds: Set<string>;
	obstacles: InspectionObstacle[];
	aggregateFailures: AggregateCoordinateFailure[];
	hierarchyWork: SweepWork;
	containerBoundaryWork: SweepWork;
}

type PlainRecord = Readonly<Record<string, unknown>>;

const CLOSED = new Set(["rectangle", "ellipse", "diamond", "frame"]);
const OBSTACLE_BODY = new Set(["rectangle", "ellipse", "diamond"]);
const KNOWN_ELEMENT_TYPES = new Set([
	"rectangle",
	"ellipse",
	"diamond",
	"frame",
	"text",
	"arrow",
	"line",
	"image",
	"freedraw",
]);

/**
 * Sort identities into exact UTF-16 order.
 * @param values the identities
 * @returns a sorted copy
 */
function orderedIdentities(values: readonly string[]): string[] {
	return [...values].toSorted(compareIdentity);
}

/**
 * Whether a value is a non-array object.
 * @param value any value
 * @returns true for plain and exotic objects alike, excluding arrays and null
 */
function isPlainRecord(value: unknown): value is PlainRecord {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * A value as a record, or null when it is not a non-array object.
 * @param value any value
 * @returns the record view or null
 */
function object(value: unknown): PlainRecord | null {
	return isPlainRecord(value) ? value : null;
}

/**
 * Whether a nonempty string is present.
 * @param value any value
 * @returns true for strings with at least one code unit
 */
const nonemptyString = (value: unknown): value is string =>
	typeof value === "string" && value.length > 0;

/**
 * Classify one boundElements entry.
 * @param entry the raw entry
 * @returns the readable id and type, or the issue that blocks reading it
 */
function classifyBoundElement(
	entry: unknown,
): { readable: { id: string; type: "text" | "arrow" } } | { issue: BoundElementIssue } {
	const item = object(entry);
	if (!item) {
		return { issue: "entry-not-object" };
	}
	if (!("id" in item)) {
		return { issue: "missing-id" };
	}
	if (item["id"] === "") {
		return { issue: "empty-id" };
	}
	if (typeof item["id"] !== "string") {
		return { issue: "non-string-id" };
	}
	return classifyBoundElementType(item["id"], item);
}

/**
 * Classify the declared type of a boundElements entry whose id is readable.
 * @param id the entry's id
 * @param item the entry record
 * @returns the readable entry, or the type issue
 */
function classifyBoundElementType(
	id: string,
	item: PlainRecord,
): { readable: { id: string; type: "text" | "arrow" } } | { issue: BoundElementIssue } {
	if (!("type" in item)) {
		return { issue: "missing-type" };
	}
	const type = item["type"];
	if (type !== "text" && type !== "arrow") {
		return { issue: "invalid-type" };
	}
	return { readable: { id, type } };
}

/**
 * Classify a persisted boundElements value into readable entries and problems.
 * @param value the raw boundElements value
 * @returns the entries that could be read and the positions that could not
 */
function classifyBoundElements(value: unknown): BoundElementsClassification {
	const readableEntries: BoundElementsClassification["readableEntries"] = [];
	const problems: BoundElementsClassification["problems"] = [];
	if (!Array.isArray(value)) {
		return { readableEntries, problems: [{ issue: "not-array", entryIndex: null }] };
	}
	value.forEach((entry: unknown, entryIndex) => {
		const classified = classifyBoundElement(entry);
		if ("readable" in classified) {
			readableEntries.push(classified.readable);
		} else {
			problems.push({ issue: classified.issue, entryIndex });
		}
	});
	return { readableEntries, problems };
}

/**
 * Read the target element id of a persisted binding.
 * @param value the raw startBinding or endBinding value
 * @returns the readable target id, or the issue that blocks classification
 */
function classifyBindingTarget(value: unknown): BindingTargetClassification {
	if (Array.isArray(value)) {
		return { readableTargetId: null, blockingIssue: "array" };
	}
	if (!isPlainRecord(value)) {
		return { readableTargetId: null, blockingIssue: "not-object" };
	}
	if (!("elementId" in value)) {
		return { readableTargetId: null, blockingIssue: "missing-element-id" };
	}
	const elementId = value["elementId"];
	if (elementId === "") {
		return { readableTargetId: null, blockingIssue: "empty-element-id" };
	}
	if (typeof elementId !== "string") {
		return { readableTargetId: null, blockingIssue: "non-string-element-id" };
	}
	return { readableTargetId: elementId, blockingIssue: null };
}

/**
 * Whether a boundElements declaration matches the target's actual type.
 * @param declaredType the type the owner declares
 * @param actualType the target element's type
 * @returns true when text targets are text and arrow targets are arrows or lines
 */
function boundElementTargetCompatible(declaredType: "text" | "arrow", actualType: string): boolean {
	return declaredType === "text"
		? actualType === "text"
		: actualType === "arrow" || actualType === "line";
}

/**
 * The archboard metadata block of a record.
 * @param record the decoded record
 * @returns the `customData.archboard` record, or null when absent or not an object
 */
function archboardMetadata(record: DecodedRecord): PlainRecord | null {
	return object(object(record.raw?.customData)?.["archboard"]);
}

/**
 * The semantic node id a record declares.
 * @param record the decoded record
 * @returns the nonempty node id, or null
 */
function nodeId(record: DecodedRecord): string | null {
	const value = archboardMetadata(record)?.["node"];
	return nonemptyString(value) ? value : null;
}

/**
 * The nonempty string group ids of a record.
 * @param record the decoded record
 * @returns the readable group ids, in persisted order
 */
function groupIds(record: DecodedRecord): string[] {
	const raw = record.raw?.groupIds;
	if (!Array.isArray(raw)) {
		return [];
	}
	return raw.filter(nonemptyString);
}

interface LibraryAttributionFacts {
	valid: boolean;
	item?: string;
	source?: string;
	issues: string[];
}

/**
 * The library item a library record names, preferring `itemId` over `item`.
 * @param library the library record
 * @returns the nonempty item name, or undefined
 */
function libraryItemOf(library: PlainRecord): string | undefined {
	if (nonemptyString(library["itemId"])) {
		return library["itemId"];
	}
	return nonemptyString(library["item"]) ? library["item"] : undefined;
}

/**
 * What is wrong with a record's library attribution, if anything.
 * @param item the item the attribution names, when it reads cleanly
 * @param source the raw source field
 * @returns the issues, empty when the attribution is valid
 */
function libraryAttributionIssues(item: string | undefined, source: unknown): string[] {
	const issues: string[] = [];
	if (!item) {
		issues.push("itemId or item must be a nonempty string");
	}
	if (source !== undefined && !nonemptyString(source)) {
		issues.push("source must be a nonempty string");
	}
	return issues;
}

/**
 * The attribution facts for a library object that read cleanly enough to inspect.
 * @param item the item the attribution names, when it reads cleanly
 * @param source the raw source field
 * @returns the facts, carrying only the fields that read cleanly
 */
function attributionFacts(item: string | undefined, source: unknown): LibraryAttributionFacts {
	const issues = libraryAttributionIssues(item, source);
	return {
		valid: issues.length === 0,
		...(item ? { item } : {}),
		...(nonemptyString(source) ? { source } : {}),
		issues,
	};
}

/**
 * The library attribution a record carries, with the issues that make it invalid.
 * @param record the decoded record
 * @returns the attribution facts, or null when the record carries none
 */
function libraryAttribution(record: DecodedRecord): LibraryAttributionFacts | null {
	const custom = object(record.raw?.customData);
	if (!custom || !("library" in custom)) {
		return null;
	}
	const library = object(custom["library"]);
	if (!library) {
		return { valid: false, issues: ["library must be an object"] };
	}
	return attributionFacts(libraryItemOf(library), library["source"]);
}

/**
 * Whether a record has a positive exact box.
 * @param record the decoded record
 * @returns true when the box exists with positive width and height
 */
const positiveBox = (record: DecodedRecord): record is DecodedRecord & { box: ExactBox } =>
	record.box !== null && record.box.width > 0 && record.box.height > 0;

/**
 * Whether a record's persisted angle is absent or zero.
 * @param record the decoded record
 * @returns true when the record is unrotated
 */
const unrotated = (record: DecodedRecord): boolean => {
	const angle = record.raw?.angle;
	return angle === undefined || angle === 0;
};

/**
 * Whether a record can act as a closed boundary for hierarchy and containment.
 * @param record the decoded record
 * @returns true for identified, unrotated closed shapes with a positive box
 */
function validBoundary(record: DecodedRecord): boolean {
	return (
		!!record.id &&
		positiveBox(record) &&
		!!record.type &&
		CLOSED.has(record.type) &&
		unrotated(record)
	);
}

export {
	type InspectionNode,
	type InspectionObstacle,
	type AggregateCoordinateFailure,
	type BlockingBindingIssue,
	type BindingTargetClassification,
	type ConnectorEndpointClassification,
	type LabelOwnershipClassification,
	type BoundElementIssue,
	type BoundElementsClassification,
	type InspectionModel,
	type PlainRecord,
	CLOSED,
	OBSTACLE_BODY,
	KNOWN_ELEMENT_TYPES,
	orderedIdentities,
	isPlainRecord,
	object,
	nonemptyString,
	classifyBoundElements,
	classifyBindingTarget,
	boundElementTargetCompatible,
	archboardMetadata,
	nodeId,
	groupIds,
	libraryAttribution,
	positiveBox,
	unrotated,
	validBoundary,
};
