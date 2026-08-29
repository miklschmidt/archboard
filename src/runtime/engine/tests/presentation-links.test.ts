import { expect, test } from "bun:test";

import {
	canonicalLinkAfterPresentationEcho,
	presentElement,
	stripBindingPresentationLink,
} from "../presentation.js";
import { completeElement } from "./support/elements.js";

const bound = (link: string | null) =>
	completeElement({
		id: "bound",
		type: "rectangle",
		x: 0,
		y: 0,
		width: 100,
		height: 50,
		link,
		customData: { archboard: { binding: { repo: "opaque", path: "opaque" } } },
	});

test("opaque presentation targets never replace the canonical native link", () => {
	const opaqueTarget = "opaque:replacement-owned-elsewhere";
	const humanLink = "https://human.example/board-note";
	const canonical = bound(humanLink);
	const presented = presentElement(canonical, opaqueTarget);
	expect(presented.link).toBe(opaqueTarget);
	expect(canonical.link).toBe(humanLink);
	expect(canonicalLinkAfterPresentationEcho(canonical, opaqueTarget, opaqueTarget)).toBe(humanLink);
	expect(stripBindingPresentationLink(presented, opaqueTarget).link).toBeNull();
	expect(stripBindingPresentationLink(canonical, opaqueTarget).link).toBe(humanLink);
	expect(canonicalLinkAfterPresentationEcho(bound(null), opaqueTarget, opaqueTarget)).toBeNull();
});
