import type {
	ArchboardElementMetadata,
	LogicalAddress,
	PersistedArchboardEnvelope,
	RuntimeBoardElement,
	RuntimeElementTracking,
} from "../../shared/board-elements/index.js";

type ArchboardBlock = ArchboardElementMetadata;

interface ElementMetadata {
	archboard?: ArchboardElementMetadata;
	foreign: Record<string, unknown>;
}

const TRACKING_KEYS = [
	"createdAt",
	"updatedAt",
	"syncedAt",
	"source",
	"syncTimestamp",
] as const satisfies readonly (keyof RuntimeElementTracking)[];

/**
 * @param value untrusted custom data
 * @returns the value without reserved persisted tracking claims
 */
function stripTrackingClaims(value: unknown): unknown {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return value;
	}
	const custom = value as Record<string, unknown>;
	const candidate = custom["archboard"];
	if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
		return { ...custom };
	}
	const semantic = Object.fromEntries(
		Object.entries(candidate).filter(
			([key]) => !TRACKING_KEYS.includes(key as (typeof TRACKING_KEYS)[number]),
		),
	);
	if (Object.keys(semantic).length > 0) {
		return { ...custom, archboard: semantic };
	}
	const { archboard: _archboard, ...cleaned } = custom;
	return cleaned;
}

/**
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

function customDataOf(element: RuntimeBoardElement): Record<string, unknown> {
	const custom = element.customData;
	return custom && typeof custom === "object" && !Array.isArray(custom) ? custom : {};
}

function envelopeOf(element: RuntimeBoardElement): PersistedArchboardEnvelope | undefined {
	const candidate = customDataOf(element)["archboard"];
	return candidate && typeof candidate === "object" && !Array.isArray(candidate)
		? (candidate as PersistedArchboardEnvelope)
		: undefined;
}

// ADR 0003 makes the namespace the boundary. Tracking is storage bookkeeping,
// not semantic metadata, and is deliberately filtered from every caller.
function readElementMetadata(element: RuntimeBoardElement): ElementMetadata {
	const values = customDataOf(element);
	const envelope = envelopeOf(element);
	let archboard: ArchboardElementMetadata | undefined;
	if (envelope) {
		const semantic = Object.fromEntries(
			Object.entries(envelope).filter(
				([key]) => !TRACKING_KEYS.includes(key as (typeof TRACKING_KEYS)[number]),
			),
		);
		if (Object.keys(semantic).length > 0) {
			archboard = semantic;
		}
	}
	const foreign = Object.fromEntries(Object.entries(values).filter(([key]) => key !== "archboard"));
	return { ...(archboard ? { archboard } : {}), foreign };
}

/**
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
	const hydrated = { ...element, ...tracking } as RuntimeBoardElement;
	if (customData && typeof customData === "object" && Object.keys(customData).length > 0) {
		Object.assign(hydrated, { customData });
	} else {
		delete hydrated.customData;
	}
	return hydrated;
}

/**
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

function archboardBlock(element: RuntimeBoardElement): ArchboardElementMetadata | undefined {
	return readElementMetadata(element).archboard;
}

function nodeIdOf(element: RuntimeBoardElement): string | undefined {
	const node = readElementMetadata(element).archboard?.node;
	return typeof node === "string" && node ? node : undefined;
}

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
