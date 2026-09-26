// libavoid charges a pin its distance from its card's centre, so a line to a
// card beside and below its own dropped out of the bottom and ran under the
// trunk its siblings leave along, and every sibling hopped it. Evened pins let
// it leave along that trunk (Skill evaluation's "One author run", cut down to
// the view's cards and relationships).

import { expect, test } from "bun:test";
import { renderArchitecture } from "@/runtime/semantic-renderer/index";
import { roundBridges } from "@/runtime/semantic-renderer/tests/drawn-routes";
import { orderedFixture } from "@/runtime/semantic-renderer/tests/ordered-fixture";
import sideExit from "./side-exit.json";

test("lines to cards beside their source leave along the shared trunk without hops", async () => {
	const drawing = await renderArchitecture({
		content: orderedFixture(sideExit),
		theme: "light",
		layout: "graphviz",
	});
	const hops = [...drawing.svg.matchAll(/ d="([^"]+)"/gu)].flatMap(([, path]) =>
		roundBridges(path!),
	);
	expect(hops).toHaveLength(0);
});
