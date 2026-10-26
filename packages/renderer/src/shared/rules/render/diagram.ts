// A semantic reading in, one self-contained SVG with its geometry and its key
// out: the hand-off to the renderer core (ADR 0059).
//
// The renderer began as an in-repository fork of both grammars of the PR
// Lens SVG renderer (MIT, Coldtea AI), pinned to revision
// 0993b4dec8ae73f5e000370e6a758cdd8aa2bfd0. This package's `NOTICE.md` holds
// the licence and says what was taken and where it lives now.
//
// Agents author meaning, and the core derives presentation for every board
// (ADR 0023, ADR 0028): it measures every word, lays the reading out in the
// solves this host runs, paints it and writes the document. This host gives
// it what only the place it runs in has (`shared/rules/render/host.ts`): the
// layout engine, the icons, the theme colours a document that stands alone
// carries, and the durations every picture is drawn with
// (`@archboard/timing`). So one host draws the same content, theme and policy
// to the same bytes in any order.

import { DEFAULT_TRAFFIC_SPEED } from "@archboard/board/content";
import { FAR_VIEW_SWAP_MS, FLOW_CYCLE_CAP_MS } from "@archboard/timing";
import type { RenderHost } from "#shared/protocol/generated/core/archboard_renderer_wasm.js";
import {
	SemanticRenderError,
	type DiagramRenderRequest,
	type RenderedDiagram,
	type SemanticViewRenderRequest,
} from "#shared/protocol/render-request.ts";
import { rendererHost } from "#shared/rules/render/host.ts";

/** What a person reads when a grammar has nothing to draw. */
const NOTHING_TO_DRAW = {
	architecture: "this architecture has no nodes, so there is no diagram to draw",
	sequence: "this content has no flow, so there is no sequence to draw",
	flowchart: "this content has no flow, so there is no flowchart to draw",
} as const;

/** The durations and speeds every picture is drawn with. */
const CLOCK = {
	farViewSwapMs: FAR_VIEW_SWAP_MS,
	trafficSpeed: DEFAULT_TRAFFIC_SPEED,
	cycleCapMs: FLOW_CYCLE_CAP_MS,
};

/**
 * What the core asks of this host while it draws: the layout's solves, and
 * the path data of the icons it names that the host has.
 * @returns The host, as the core reads it.
 */
function coreHost(): RenderHost {
	const host = rendererHost();
	/**
	 * The path data of each icon named that this host has.
	 * @param names The icons' export names.
	 * @returns Each icon's paths, by export name.
	 */
	const icons = (names: string[]): Record<string, readonly string[]> =>
		Object.fromEntries(
			names.flatMap((name) => {
				const paths = host.iconPaths(name);
				return paths === undefined ? [] : [[name, paths]];
			}),
		);
	return { solve: host.solve, icons };
}

/**
 * One reading of a variant, drawn in the grammar its view asked for.
 *
 * Two pictures of the same identities: a participant column and an
 * architecture card carry the same node id, and a pane that has selected one
 * has selected the other. Which grammar is chosen is presentation intent the
 * board states; it is never derived from what the content happens to hold.
 * @param request What to draw, in which grammar, and on which ground.
 * @returns The document, its size, its atlas and its key.
 * @throws {SemanticRenderError} When that grammar has nothing to draw.
 */
async function renderSemanticView(request: SemanticViewRenderRequest): Promise<RenderedDiagram> {
	const host = rendererHost();
	const rendered = await host
		.core()
		.render(
			JSON.stringify({ ...request, clock: CLOCK, themeColors: host.themeColors }),
			coreHost(),
		);
	if ("empty" in rendered) {
		throw new SemanticRenderError(rendered.empty, NOTHING_TO_DRAW[request.grammar]);
	}
	return rendered;
}

/**
 * A semantic architecture in, one self-contained SVG plus its geometry out.
 * @param request What to draw, and on which ground.
 * @returns The document, its size, its atlas and its key.
 * @throws {SemanticRenderError} When there is nothing to draw.
 */
async function renderArchitecture(request: DiagramRenderRequest): Promise<RenderedDiagram> {
	return await renderSemanticView({ ...request, grammar: "architecture" });
}

export { renderArchitecture, renderSemanticView };
