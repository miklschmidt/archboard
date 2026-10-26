import { expect } from "bun:test";
import type { LayoutEngineName } from "@archboard/board/render-reply";
import type { VariantContent } from "@archboard/board/content";
import type { RenderedDiagram } from "#shared/protocol/render-request.ts";
import { labelsOffRuns, routesThroughCards } from "#tests/runtime/support/drawn-ink.ts";
import {
	labelsAcrossWalls,
	nearLanes,
	runsUnderLabels,
	slants,
	wallHugs,
} from "#tests/runtime/support/drawn-checks.ts";

/**
 * Semantic completeness and readable labels across the measured corpus.
 * @param drawing The rendered board.
 * @param content Its authored architecture.
 * @param layout The engine that drew it.
 */
export function expectDrawingIntact(
	drawing: RenderedDiagram,
	content: VariantContent,
	layout: LayoutEngineName,
) {
	expect(routesThroughCards(drawing, content), "routes through cards").toEqual([]);
	expect(labelsOffRuns(drawing), "labels off their own route").toEqual([]);
	expect(runsUnderLabels(drawing), "routes under another's label").toEqual([]);
	expect(Object.keys(drawing.atlas.nodes).toSorted()).toEqual(
		content.nodes.map(({ id }) => id).toSorted(),
	);
	expect(Object.keys(drawing.atlas.edges).toSorted()).toEqual(
		content.edges.map(({ id }) => id).toSorted(),
	);
	expect(slants(drawing), "routes on a slant").toEqual([]);
	expect(labelsAcrossWalls(drawing), "labels across a container's edge").toEqual([]);
	if (layout === "track") {
		expect(nearLanes(drawing), "lines closer than a lane").toEqual([]);
		expect(wallHugs(drawing), "lines along a container's wall").toEqual([]);
	}
}
