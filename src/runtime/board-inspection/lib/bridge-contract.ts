import { z } from "zod";

import type { ServerElement } from "@/runtime/engine/types";
import type { ExactPoint } from "@/runtime/board-inspection/lib/geometry";
import type { BridgeIncompleteIssue, BridgeStaleIssue } from "@/runtime/board-inspection/schemas";

const finite = z.number().finite();
const hexColour = z
	.string()
	.regex(/^#[0-9a-f]{6}$/, "Bridge background must be an opaque #RRGGBB colour.");

const BridgeRoleSchema = z.enum(["mask", "redraw"]);
const BridgeMetadataSchema = z.strictObject({
	bridgeId: z.string().min(1),
	role: BridgeRoleSchema,
	overConnectorId: z.string().min(1),
	underConnectorId: z.string().min(1),
	overSegmentIndex: z.number().int().nonnegative(),
	underSegmentIndex: z.number().int().nonnegative(),
	crossing: z.strictObject({ x: finite, y: finite }),
	background: hexColour,
});
type BridgeMetadata = z.infer<typeof BridgeMetadataSchema>;

/** The stroke a bridge reproduces from the connector it covers. */
const StrokeStyleSchema = z.strictObject({
	strokeColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
	strokeWidth: finite.positive(),
	strokeStyle: z.enum(["solid", "dashed", "dotted"]),
	roughness: finite.min(0).max(2),
	opacity: finite.positive().max(100),
});
type StrokeStyle = z.infer<typeof StrokeStyleSchema>;

interface BridgePart {
	readonly element: ServerElement;
	readonly metadata: BridgeMetadata;
}

interface ValidBridgeDecoration {
	readonly bridgeId: string;
	readonly mask: BridgePart;
	readonly redraw: BridgePart;
}

type InvalidBridgeDecoration =
	| {
			readonly bridgeId: string | null;
			readonly reason: "incomplete-decoration";
			readonly issue: BridgeIncompleteIssue;
			readonly elements: readonly ServerElement[];
	  }
	| {
			readonly bridgeId: string;
			readonly reason: "stale-decoration";
			readonly issue: BridgeStaleIssue;
			readonly elements: readonly ServerElement[];
	  };

interface PlanBridgeCreateInput {
	readonly elements: readonly ServerElement[];
	readonly bridgeId: string;
	readonly overConnectorId: string;
	readonly underConnectorId: string;
	readonly background: string;
	readonly at?: ExactPoint;
}

/** What a caller asked for that a bridge cannot be drawn from. */
class BridgeRefusal extends Error {
	readonly code = "BRIDGE_REFUSED";

	/**
	 * Refuse a bridge, saying what would have to change for one to be drawable.
	 * @param message the refusal
	 */
	constructor(message: string) {
		super(message);
		this.name = "BridgeRefusal";
	}
}

/**
 * The stroke a bridge copies from the connector it draws over, with the renderer's defaults
 * filled in for whatever the element leaves out.
 * @param element the over-connector
 * @returns the style, or null when it is not one a bridge can reproduce
 */
function strokeStyleOf(element: ServerElement): StrokeStyle | null {
	const parsed = StrokeStyleSchema.safeParse(strokeFieldsOf(element));
	return parsed.success ? parsed.data : null;
}

/**
 * An element's stroke fields, which the schema then judges: a bridge must reproduce the
 * connector it covers, so a connector whose stroke does not read is one no bridge can cover.
 * @param element the over-connector
 * @returns the stroke fields to validate
 */
function strokeFieldsOf(element: ServerElement): Record<string, unknown> {
	return {
		strokeColor: element.strokeColor,
		strokeWidth: element.strokeWidth,
		strokeStyle: element.strokeStyle,
		roughness: element.roughness,
		opacity: element.opacity,
	};
}

/**
 * Normalize the background colour a mask paints with, which must be opaque: a mask hides what
 * runs under it, so a transparent or short form would leave the crossing visible.
 * @param value the caller's colour
 * @returns the lowercase six-digit colour
 */
function normalizeBackground(value: string): string {
	const normalized = value.toLowerCase();
	if (!/^#[0-9a-f]{6}$/.test(normalized)) {
		throw new BridgeRefusal("--background must be an opaque six-digit #RRGGBB colour.");
	}
	return normalized;
}

export {
	BridgeMetadataSchema,
	BridgeRefusal,
	BridgeRoleSchema,
	normalizeBackground,
	strokeStyleOf,
	type BridgeMetadata,
	type BridgePart,
	type InvalidBridgeDecoration,
	type PlanBridgeCreateInput,
	type StrokeStyle,
	type ValidBridgeDecoration,
};
