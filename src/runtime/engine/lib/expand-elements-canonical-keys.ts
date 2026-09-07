// Canonical key order for exported elements: identity/geometry first and the
// pinned vendor binding order next, then the rest alphabetically. This keeps
// no-op import→export cycles byte-identical and committed scenes diff-small.

import { isRecord } from "@/runtime/engine/lib/unknown-record";

const KEY_ORDER = [
	"id",
	"type",
	"x",
	"y",
	"width",
	"height",
	"elementId",
	"focus",
	"gap",
	"fixedPoint",
];

/**
 * Order two keys: pinned keys by their pinned position, then the rest
 * alphabetically after them.
 * @param a One key.
 * @param b The other key.
 * @returns A negative number when `a` sorts first, positive otherwise.
 */
function compareKeys(a: string, b: string): number {
	const ia = KEY_ORDER.indexOf(a);
	const ib = KEY_ORDER.indexOf(b);
	if (ia !== -1 || ib !== -1) {
		return (ia === -1 ? KEY_ORDER.length : ia) - (ib === -1 ? KEY_ORDER.length : ib);
	}
	return a < b ? -1 : 1;
}

/**
 * A deep copy of a value with every object's keys in canonical order.
 * @param v The value to copy.
 * @returns The copy; primitives come back as they are.
 */
function canonicalizeKeys(v: unknown): unknown {
	if (Array.isArray(v)) {
		return v.map(canonicalizeKeys);
	}
	if (isRecord(v)) {
		const out: Record<string, unknown> = {};
		for (const k of Object.keys(v).toSorted(compareKeys)) {
			out[k] = canonicalizeKeys(v[k]);
		}
		return out;
	}
	return v;
}

export { canonicalizeKeys };
