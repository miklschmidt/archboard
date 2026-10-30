// What a drawing is kept under: a digest of the exact request the core receives.
//
// The core reads the whole variant only for each container's interface, and it
// reads only containment and relationship ends for that (ADR 0044). So the
// request carries those facts and no more: a scoped drawing depends on the
// interface of every drawn container, and on nothing else outside the scope.

import type {
	InterfaceContent,
	SemanticViewRenderRequest,
} from "#shared/protocol/render-request.ts";

/**
 * Reduce a whole variant to the facts that decide its containers' interfaces.
 * @param variant The whole variant.
 * @returns Its containment and relationship ends, in the variant's order.
 */
function interfaceContent(variant: InterfaceContent): InterfaceContent {
	return {
		nodes: variant.nodes.map(({ id, parent }) => ({ id, parent, name: "", kind: "" })),
		edges: variant.edges.map(({ from, to }) => ({ id: "", order: 0, from, to, kind: "" })),
	};
}

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

/**
 * Reduce a scoped drawing to the request that the core receives.
 * @param scoped The visible content, complete model, and presentation policy.
 * @returns The request, with its whole variant reduced to interface facts.
 */
function scopedRequest(
	scoped: Omit<SemanticViewRenderRequest, "theme">,
): Omit<SemanticViewRenderRequest, "theme"> {
	return scoped.variant === undefined
		? scoped
		: { ...scoped, variant: interfaceContent(scoped.variant) };
}

/**
 * Key a scoped drawing before anything draws it, so that a reader needs no renderer to ask.
 * @param scoped The visible content, complete model, and presentation policy.
 * @returns A digest that changes whenever what the core receives does.
 */
function scopedDrawingKey(scoped: Omit<SemanticViewRenderRequest, "theme">): string {
	return drawingKey(scopedRequest(scoped));
}

export { drawingKey, interfaceContent, scopedDrawingKey, scopedRequest };
