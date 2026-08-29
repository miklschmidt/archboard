import type { ElementBinding, NativeBoardElement } from "./lib/vendor-types.js";

export type {
	ArrowElement,
	BoundElement,
	DiamondElement,
	ElementBinding,
	EllipseElement,
	FreeDrawElement,
	ImageElement,
	JsonWritable,
	LineElement,
	NativeBoardElement,
	RectangleElement,
	TextElement,
	WritableVendorElement,
} from "./lib/vendor-types.js";

export const BOARD_ELEMENT_TYPES = [
	"rectangle",
	"ellipse",
	"diamond",
	"arrow",
	"text",
	"line",
	"freedraw",
	"image",
] as const satisfies readonly NativeBoardElement["type"][];

export type BoardElementType = (typeof BOARD_ELEMENT_TYPES)[number];

export interface LogicalAddress {
	repo?: string;
	path: string;
	branch?: string;
	commit?: string;
	confirmedAt?: string;
}

/** Semantic Archboard data. Runtime tracking keys are reserved and filtered. */
export interface ArchboardElementMetadata {
	node?: string;
	kind?: string;
	name?: string;
	binding?: LogicalAddress;
	variant?: string;
	level?: string;
	[key: string]: unknown;
}

export interface RuntimeElementTracking {
	createdAt?: string;
	updatedAt?: string;
	syncedAt?: string;
	source?: string;
	syncTimestamp?: string;
}

export type PersistedArchboardEnvelope = ArchboardElementMetadata & RuntimeElementTracking;

type CustomData = Record<string, unknown> & {
	archboard?: PersistedArchboardEnvelope;
};

type WithArchboardMetadata<Element extends NativeBoardElement> = Element extends unknown
	? Omit<Element, "customData"> & { customData?: CustomData }
	: never;

/** Obsidian Excalidraw adds rawText only to persisted text elements. */
export interface ObsidianRawText {
	rawText?: string;
}

type WithObsidianText<Element> = Element extends { type: "text" }
	? Element & ObsidianRawText
	: Element;

export type PersistedBoardElement = WithObsidianText<WithArchboardMetadata<NativeBoardElement>>;

export type RuntimeBoardElement = PersistedBoardElement extends infer Element
	? Element extends unknown
		? Element & RuntimeElementTracking
		: never
	: never;

interface InputAliases {
	label?: { text: string };
	/** A non-text statement's shorthand label, consumed before persistence. */
	text?: string;
	/** Agent spellings consumed at the write boundary. */
	start?: { id: string } | null;
	end?: { id: string } | null;
	startElementId?: string;
	endElementId?: string;
	fontFamily?: string | number;
	startBinding?:
		| (ElementBinding & {
				fixedPoint?: readonly [number, number] | null;
				mode?: string;
		  })
		| null;
	endBinding?:
		| (ElementBinding & {
				fixedPoint?: readonly [number, number] | null;
				mode?: string;
		  })
		| null;
}

type PartialNativeArm<Element extends NativeBoardElement> = Element extends unknown
	? Partial<Omit<Element, "startBinding" | "endBinding">> & Pick<Element, "type" | "x" | "y">
	: never;

/**
 * The one intentionally incomplete native shape. Defaults are completed only
 * by the write-ingress converter; trusted note reads never accept this type.
 */
export type LegacyElementIngress = PartialNativeArm<NativeBoardElement> &
	InputAliases &
	RuntimeElementTracking & { id: string };
