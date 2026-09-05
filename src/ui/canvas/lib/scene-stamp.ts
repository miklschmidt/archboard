// A cheap fingerprint of the fields a user edit can change, so a camera move
// or a selection change with the same content schedules nothing.

import type { SceneElement } from "@/ui/canvas/lib/reporting-state";

const HUMAN_FIELDS = [
	"x",
	"y",
	"width",
	"height",
	"angle",
	"isDeleted",
	"text",
	"fontSize",
	"fontFamily",
	"textAlign",
	"verticalAlign",
	"backgroundColor",
	"strokeColor",
	"strokeStyle",
	"strokeWidth",
	"fillStyle",
	"roughness",
	"opacity",
	"link",
	"locked",
	"startArrowhead",
	"endArrowhead",
	"index",
] as const;

/**
 * Fold a string into a hash.
 * @param hash The running hash.
 * @param value The string.
 * @returns The next hash.
 */
function foldString(hash: number, value: string): number {
	let folded = (hash * 31 + value.length) | 0;
	for (let at = 0; at < value.length; at += 1) {
		folded = (folded * 31 + value.charCodeAt(at)) | 0;
	}
	return folded;
}

/**
 * Fold one value into a hash.
 * @param hash The running hash.
 * @param value A number, boolean, string or anything else.
 * @returns The next hash.
 */
function fold(hash: number, value: unknown): number {
	if (typeof value === "number") {
		return (hash * 31 + Math.round(value * 64)) | 0;
	}
	if (typeof value === "boolean") {
		return (hash * 31 + (value ? 1 : 2)) | 0;
	}
	if (typeof value === "string") {
		return foldString(hash, value);
	}
	return (hash * 31) | 0;
}

/**
 * Fold a linear element's points: how many, and where the last one is.
 * @param hash The running hash.
 * @param points The element's points, when it has any.
 * @returns The next hash.
 */
function foldPoints(hash: number, points: unknown): number {
	if (!Array.isArray(points)) {
		return hash;
	}
	const folded = fold(hash, points.length);
	const last: unknown = points[points.length - 1];
	return Array.isArray(last) ? fold(fold(folded, last[0]), last[1]) : folded;
}

/**
 * Fold one element into a hash.
 * @param hash The running hash.
 * @param element The element.
 * @returns The next hash.
 */
function foldElement(hash: number, element: SceneElement): number {
	let folded = fold(fold(hash, element.id), element.version);
	for (const field of HUMAN_FIELDS) {
		folded = fold(folded, element[field]);
	}
	folded = foldPoints(folded, element.points);
	return fold(folded, Array.isArray(element.groupIds) ? element.groupIds.length : 0);
}

/**
 * A cheap fingerprint of fields a user edit can change.
 * @param scene The scene.
 * @returns A stamp that changes when a human-editable field changes.
 */
function stampScene(scene: readonly SceneElement[]): string {
	let hash = scene.length;
	for (const element of scene) {
		hash = foldElement(hash, element);
	}
	return String(hash);
}

export { stampScene };
