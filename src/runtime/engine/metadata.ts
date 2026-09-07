import type {
	ArchboardElementMetadata,
	LogicalAddress,
	PersistedArchboardEnvelope,
	RuntimeBoardElement,
	RuntimeElementTracking,
} from "@/shared/board-elements";

type ArchboardBlock = ArchboardElementMetadata;

interface ElementMetadata {
	archboard?: ArchboardElementMetadata;
	foreign: Record<string, unknown>;
}

interface ElementMetadataCarrier {
	readonly customData?: unknown;
}

/**
 * Whether a value is a record of named fields; an array is not one.
 * @param value The value.
 * @returns True when its fields can be read by name.
 */
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

const TRACKING_KEY_NAMES = new Set<string>([
	"createdAt",
	"updatedAt",
	"syncedAt",
	"source",
	"syncTimestamp",
]);

/**
 * One envelope without the storage bookkeeping in it.
 *
 * ADR 0003 makes the namespace the boundary. Tracking is storage bookkeeping,
 * not semantic metadata, and is deliberately filtered from every caller.
 * @param envelope The envelope.
 * @returns Its semantic fields.
 */
function semanticFieldsOf(envelope: Readonly<Record<string, unknown>>): Record<string, unknown> {
	return Object.fromEntries(
		Object.entries(envelope).filter(([key]) => !TRACKING_KEY_NAMES.has(key)),
	);
}

const TRACKING_KEYS = [
	"createdAt",
	"updatedAt",
	"syncedAt",
	"source",
	"syncTimestamp",
] as const satisfies readonly (keyof RuntimeElementTracking)[];

/**
 * One element's `customData` without the storage bookkeeping a caller may not
 * claim: whoever wrote it does not get to say when archboard last wrote it.
 * @param value untrusted custom data
 * @returns the value without reserved persisted tracking claims
 */
function stripTrackingClaims(value: unknown): unknown {
	if (!isRecord(value)) {
		return value;
	}
	const custom = value;
	const candidate = custom["archboard"];
	if (!isRecord(candidate)) {
		return { ...custom };
	}
	const semantic = semanticFieldsOf(candidate);
	if (Object.keys(semantic).length > 0) {
		return { ...custom, archboard: semantic };
	}
	const { archboard: _archboard, ...cleaned } = custom;
	return cleaned;
}

/**
 * One element without any of the bookkeeping a caller may not claim, in
 * either of the two places it can be written (TASK-095).
 * @param value untrusted element-like data
 * @returns a copy without runtime-overlay or persisted-envelope tracking claims
 */
function stripUntrustedTrackingClaims(value: Record<string, unknown>): Record<string, unknown> {
	const {
		createdAt: _createdAt,
		updatedAt: _updatedAt,
		syncedAt: _syncedAt,
		source: _source,
		syncTimestamp: _syncTimestamp,
		...cleaned
	} = value;
	if ("customData" in cleaned) {
		cleaned["customData"] = stripTrackingClaims(cleaned["customData"]);
	}
	return cleaned;
}

/**
 * An element's `customData`, which is where every plugin's metadata lives.
 * @param element The element.
 * @returns The metadata, or an empty record when it carries none.
 */
function customDataOf(element: ElementMetadataCarrier): Readonly<Record<string, unknown>> {
	const custom = element.customData;
	return isRecord(custom) ? custom : {};
}

/**
 * Archboard's own metadata channel on one element (ADR 0003).
 * @param element The element.
 * @returns The envelope, or undefined when the element carries none.
 */
function envelopeOf(element: ElementMetadataCarrier): PersistedArchboardEnvelope | undefined {
	const candidate = customDataOf(element)["archboard"];
	if (!isRecord(candidate)) {
		return undefined;
	}
	// The envelope archboard itself writes, under the key it owns.
	return candidate;
}

/**
 * What an element's metadata says: archboard's own semantic fields, and
 * everything another plugin put there.
 *
 * ADR 0003 makes the namespace the boundary. Tracking is storage bookkeeping,
 * not semantic metadata, and is deliberately filtered from every caller.
 * @param element The element.
 * @returns The metadata.
 */
function readElementMetadata(element: ElementMetadataCarrier): ElementMetadata {
	const values = customDataOf(element);
	const envelope = envelopeOf(element);
	const semantic = envelope ? semanticFieldsOf(envelope) : {};
	const archboard = Object.keys(semantic).length > 0 ? semantic : undefined;
	const foreign = Object.fromEntries(Object.entries(values).filter(([key]) => key !== "archboard"));
	return { ...(archboard ? { archboard } : {}), foreign };
}

/**
 * One element as the board holds it in memory: the bookkeeping the note keeps
 * inside `customData.archboard` lifted onto the element itself.
 * @param element element to hydrate
 * @returns a copy with persisted tracking moved into the runtime overlay
 */
function hydrateElementTracking(element: RuntimeBoardElement): RuntimeBoardElement {
	const envelope = envelopeOf(element);
	if (!envelope) {
		return { ...element };
	}
	const tracking = Object.fromEntries(
		TRACKING_KEYS.flatMap((key) => (envelope[key] === undefined ? [] : [[key, envelope[key]]])),
	) as RuntimeElementTracking;
	const customData = stripTrackingClaims(element.customData);
	const hydrated = { ...element, ...tracking };
	if (customData && typeof customData === "object" && Object.keys(customData).length > 0) {
		Object.assign(hydrated, { customData });
	} else {
		delete hydrated.customData;
	}
	return hydrated;
}

/**
 * One element as a note holds it: the bookkeeping put back inside
 * `customData.archboard`, which is archboard's channel (ADR 0003), so nothing
 * of ours sits in a field Excalidraw owns.
 * @param element element to serialize
 * @returns a copy with runtime tracking moved into customData.archboard
 */
function packElementTracking(element: RuntimeBoardElement): RuntimeBoardElement {
	const customData = customDataOf(element);
	const current = envelopeOf(element) ?? {};
	const tracking = Object.fromEntries(
		TRACKING_KEYS.flatMap((key) => {
			const value = current[key] ?? element[key];
			return value === undefined ? [] : [[key, value]];
		}),
	) as RuntimeElementTracking;
	const envelope = { ...current, ...tracking };
	const {
		createdAt: _createdAt,
		updatedAt: _updatedAt,
		syncedAt: _syncedAt,
		source: _source,
		syncTimestamp: _syncTimestamp,
		...untracked
	} = element;
	const packed = { ...untracked } as RuntimeBoardElement;
	if (Object.keys(envelope).length > 0) {
		packed.customData = { ...customData, archboard: envelope };
	}
	return packed;
}

/**
 * One element as everything that reasons about meaning sees it: the semantic
 * metadata and another plugin's keys, with the bookkeeping left out, so two
 * elements that mean the same thing compare equal whatever their history.
 * @param element runtime element to project
 * @returns a stable semantic view used by comparison, facts, describe, and feeds
 */
function semanticElementProjection(element: RuntimeBoardElement): RuntimeBoardElement {
	const metadata = readElementMetadata(element).archboard;
	const custom = customDataOf(element);
	const {
		createdAt: _createdAt,
		updatedAt: _updatedAt,
		syncedAt: _syncedAt,
		source: _source,
		syncTimestamp: _syncTimestamp,
		...untracked
	} = element;
	const projected = { ...untracked } as RuntimeBoardElement;
	const foreign = Object.fromEntries(Object.entries(custom).filter(([key]) => key !== "archboard"));
	if (metadata) {
		projected.customData = { ...foreign, archboard: metadata };
	} else if (Object.keys(foreign).length > 0) {
		projected.customData = foreign;
	} else {
		delete projected.customData;
	}
	return projected;
}

/**
 * Archboard's semantic metadata on one element, without the bookkeeping.
 * @param element The element.
 * @returns The block, or undefined when the element carries none.
 */
function archboardBlock(element: RuntimeBoardElement): ArchboardElementMetadata | undefined {
	return readElementMetadata(element).archboard;
}

/**
 * The logical node an element is part of, which is the join key across
 * variants and boards.
 * @param element The element.
 * @returns The node id, or undefined when nobody promoted it.
 */
function nodeIdOf(element: RuntimeBoardElement): string | undefined {
	const node = readElementMetadata(element).archboard?.node;
	return typeof node === "string" && node ? node : undefined;
}

/**
 * Every node a board holds.
 * @param elements The board's elements.
 * @returns The node ids.
 */
function nodeIdsOnBoard(elements: RuntimeBoardElement[]): Set<string> {
	const ids = new Set<string>();
	for (const element of elements) {
		const id = nodeIdOf(element);
		if (id) {
			ids.add(id);
		}
	}
	return ids;
}

/**
 * Where in a repository a node's code lives, when it names a path at all.
 * @param element The element.
 * @returns The address, or undefined.
 */
function logicalAddressOf(element: RuntimeBoardElement): LogicalAddress | undefined {
	const binding = readElementMetadata(element).archboard?.binding;
	return binding && typeof binding.path === "string" ? binding : undefined;
}

export {
	type LogicalAddress,
	type ArchboardBlock,
	type ElementMetadata,
	stripTrackingClaims,
	stripUntrustedTrackingClaims,
	readElementMetadata,
	hydrateElementTracking,
	packElementTracking,
	semanticElementProjection,
	archboardBlock,
	nodeIdOf,
	nodeIdsOnBoard,
	logicalAddressOf,
};
