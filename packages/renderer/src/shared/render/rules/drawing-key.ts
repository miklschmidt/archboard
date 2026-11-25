// What a drawing is kept under: a digest of the exact request the core receives.

import type { SemanticViewRenderRequest } from "#shared/protocol/render-request.ts";

/**
 * Digest a request synchronously, because a query key is computed while React renders. This is
 * cyrb128: 128 bits, enough for a cache of one browser, and not a security boundary.
 * @param text The text.
 * @returns Its length and digest.
 */
function textDigest(text: string): string {
	let [a, b, c, d] = [1779033703, 3144134277, 1013904242, 2773480762];
	for (let index = 0; index < text.length; index++) {
		const code = text.charCodeAt(index);
		a = b ^ Math.imul(a ^ code, 597399067);
		b = c ^ Math.imul(b ^ code, 2869860233);
		c = d ^ Math.imul(c ^ code, 951274213);
		d = a ^ Math.imul(d ^ code, 2716044179);
	}
	a = Math.imul(c ^ (a >>> 18), 597399067);
	b = Math.imul(d ^ (b >>> 22), 2869860233);
	c = Math.imul(a ^ (c >>> 17), 951274213);
	d = Math.imul(b ^ (d >>> 19), 2716044179);
	a ^= b ^ c ^ d;
	const lanes = [a, b ^ a, c ^ a, d ^ a];
	return `${text.length}-${lanes.map((lane) => (lane >>> 0).toString(16).padStart(8, "0")).join("")}`;
}

/**
 * Key one drawing by everything the core receives for it.
 * @param request The complete render request.
 * @returns A digest that changes whenever the request does.
 */
function drawingKey(request: Omit<SemanticViewRenderRequest, "theme">): string {
	return textDigest(JSON.stringify(request));
}

export { drawingKey };
