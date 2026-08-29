import type {
	ArchboardElementMetadata,
	LogicalAddress,
	PersistedArchboardEnvelope,
	RuntimeBoardElement,
	RuntimeElementTracking,
} from "../../shared/board-elements/index.js";

export type { LogicalAddress } from "../../shared/board-elements/index.js";
export type ArchboardBlock = ArchboardElementMetadata;

export interface ElementMetadata {
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

/** Remove reserved persisted tracking claims from an untrusted customData value. */
export function stripTrackingClaims(value: unknown): unknown {
	if (!value || typeof value !== "object" || Array.isArray(value)) return value;
	const custom = value as Record<string, unknown>;
	const candidate = custom.archboard;
	if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return { ...custom };
	const semantic = Object.fromEntries(
		Object.entries(candidate).filter(
			([key]) => !TRACKING_KEYS.includes(key as (typeof TRACKING_KEYS)[number]),
		),
	);
	const cleaned = { ...custom };
	if (Object.keys(semantic).length > 0) cleaned.archboard = semantic;
	else delete cleaned.archboard;
	return cleaned;
}

function customDataOf(element: RuntimeBoardElement): Record<string, unknown> {
	const custom = element.customData;
	return custom && typeof custom === "object" && !Array.isArray(custom) ? custom : {};
}

function envelopeOf(element: RuntimeBoardElement): PersistedArchboardEnvelope | undefined {
	const candidate = customDataOf(element).archboard;
	return candidate && typeof candidate === "object" && !Array.isArray(candidate)
		? (candidate as PersistedArchboardEnvelope)
		: undefined;
}

// ADR 0003 makes the namespace the boundary. Tracking is storage bookkeeping,
// not semantic metadata, and is deliberately filtered from every caller.
export function readElementMetadata(element: RuntimeBoardElement): ElementMetadata {
	const values = customDataOf(element);
	const envelope = envelopeOf(element);
	let archboard: ArchboardElementMetadata | undefined;
	if (envelope) {
		const semantic = Object.fromEntries(
			Object.entries(envelope).filter(
				([key]) => !TRACKING_KEYS.includes(key as (typeof TRACKING_KEYS)[number]),
			),
		);
		if (Object.keys(semantic).length > 0) archboard = semantic;
	}
	const foreign = Object.fromEntries(Object.entries(values).filter(([key]) => key !== "archboard"));
	return { ...(archboard ? { archboard } : {}), foreign };
}

/** Move persisted tracking into the runtime overlay. Nested canonical wins. */
export function hydrateElementTracking(element: RuntimeBoardElement): RuntimeBoardElement {
	const envelope = envelopeOf(element);
	if (!envelope) return { ...element };
	const tracking = Object.fromEntries(
		TRACKING_KEYS.flatMap((key) => (envelope[key] === undefined ? [] : [[key, envelope[key]]])),
	) as RuntimeElementTracking;
	const customData = stripTrackingClaims(element.customData);
	const hydrated = { ...element, ...tracking } as RuntimeBoardElement;
	if (customData && typeof customData === "object" && Object.keys(customData).length > 0)
		hydrated.customData = customData as RuntimeBoardElement["customData"];
	else delete hydrated.customData;
	return hydrated;
}

/** Move runtime tracking into customData.archboard on a serialization copy. */
export function packElementTracking(element: RuntimeBoardElement): RuntimeBoardElement {
	const customData = customDataOf(element);
	const current = envelopeOf(element) ?? {};
	const tracking = Object.fromEntries(
		TRACKING_KEYS.flatMap((key) => {
			const value = current[key] ?? element[key];
			return value === undefined ? [] : [[key, value]];
		}),
	) as RuntimeElementTracking;
	const envelope = { ...current, ...tracking };
	const packed = { ...element } as RuntimeBoardElement;
	if (Object.keys(envelope).length > 0) {
		packed.customData = { ...customData, archboard: envelope };
	}
	for (const key of TRACKING_KEYS) delete packed[key];
	return packed;
}

/** Stable semantic view used by comparison, facts, describe, and feeds. */
export function semanticElementProjection(element: RuntimeBoardElement): RuntimeBoardElement {
	const metadata = readElementMetadata(element).archboard;
	const custom = customDataOf(element);
	const projected = { ...element } as RuntimeBoardElement;
	for (const key of TRACKING_KEYS) delete projected[key];
	const foreign = Object.fromEntries(Object.entries(custom).filter(([key]) => key !== "archboard"));
	if (metadata) projected.customData = { ...foreign, archboard: metadata };
	else if (Object.keys(foreign).length > 0) projected.customData = foreign;
	else delete projected.customData;
	return projected;
}

export function archboardBlock(element: RuntimeBoardElement): ArchboardElementMetadata | undefined {
	return readElementMetadata(element).archboard;
}

export function nodeIdOf(element: RuntimeBoardElement): string | undefined {
	const node = readElementMetadata(element).archboard?.node;
	return typeof node === "string" && node ? node : undefined;
}

export function nodeIdsOnBoard(elements: RuntimeBoardElement[]): Set<string> {
	const ids = new Set<string>();
	for (const element of elements) {
		const id = nodeIdOf(element);
		if (id) ids.add(id);
	}
	return ids;
}

export function logicalAddressOf(element: RuntimeBoardElement): LogicalAddress | undefined {
	const binding = readElementMetadata(element).archboard?.binding;
	return binding && typeof binding.path === "string" ? binding : undefined;
}
