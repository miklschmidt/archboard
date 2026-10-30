// A line from a card up and off to the side once dropped down the gutter
// beside its target, past the target's top corner, and turned into its side a
// few points below it, where entering the top takes one bend fewer (Renderer
// layout's "measure every word", Codex session's "decode parameters and
// answer"). Two lines down into Former names once hooked into its sides past
// its top (Board persistence's "Durable write boundary").

import { expect, test } from "bun:test";
import { DEFAULT_SEMANTIC_POLICY, SemanticPolicySchema } from "@archboard/board/policy";
import { type LayoutEngineName } from "@archboard/board/render-reply";
import { renderArchitecture } from "#runtime/operations/render.ts";
import type { StatedStandings } from "#shared/protocol/render-request.ts";
import { cornersOf, routePoints, type DrawnPoint } from "#tests/runtime/support/drawn-routes.ts";
import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";
import formerNames from "#tests/runtime/support/fixtures/former-names.json";
import rendererLayout from "#tests/runtime/support/fixtures/renderer-layout-proposal.json";

/** The dogfood vault's vocabulary as far as the fixtures use it. */
const policy = SemanticPolicySchema.parse({
	...DEFAULT_SEMANTIC_POLICY,
	groups: {
		writes: { name: "Board writes", color: "orange" },
		grading: { name: "Grading", color: "purple" },
	},
});

/** The longest side stub a hook has: a card's own corridor and a lane. */
const HOOK_STUB = 36;

/** A card's box on the page. */
interface Box {
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
}

/**
 * Whether a drawn line end hooks into its card's side: a short side stub
 * turned from a run that comes from beyond the card's top or bottom.
 * @param box The card.
 * @param route The drawn line, ordered away from the card.
 * @returns True for a hook.
 */
function hooksInto(box: Box, route: readonly DrawnPoint[]): boolean {
	const [tip, bend, after] = [route[0]!, route[1]!, route[2]];
	if (after === undefined || Math.abs(tip.y - bend.y) >= 0.01) return false;
	if (Math.abs(tip.x - bend.x) > HOOK_STUB) return false;
	return after.y < box.y || after.y > box.y + box.height;
}

/**
 * The lines of a finished drawing that hook into a card's side.
 * @param fixture The board, and how its subjects stand in the proposal it draws.
 * @param layout The engine that draws it.
 * @returns The ids of the hooked lines, once for each hooked end.
 */
async function hookedLines(
	fixture: Parameters<typeof orderedFixture>[0] & { readonly standing: object },
	layout: LayoutEngineName,
): Promise<string[]> {
	const { standing, ...board } = fixture;
	const content = orderedFixture(board);
	const drawing = await renderArchitecture({
		content,
		standing: standing as StatedStandings,
		policy,
		theme: "light",
		layout,
	});
	const cards = drawing.atlas.nodes;
	const routes = routePoints(drawing.svg);
	const hooks = content.edges.flatMap(({ id, from, to }) => {
		const points = cornersOf(routes.get(id)!);
		return [hooksInto(cards[from]!, points), hooksInto(cards[to]!, points.toReversed())]
			.filter(Boolean)
			.map(() => id);
	});
	return hooks;
}

test.each(["track"] as const)(
	"a drawing has no line hooking into a card's side past its corner (%s)",
	async (layout) => {
		expect(await hookedLines(rendererLayout, layout)).toEqual([]);
	},
);

test.each(["track"] as const)(
	"lines down into a card enter its top rather than hook past it into its sides (%s)",
	async (layout) => {
		const { standing, ...board } = formerNames;
		const former = board.nodes.find(({ name }) => name === "Former names")!.id;
		const drawing = await renderArchitecture({
			content: orderedFixture(board),
			standing: standing as StatedStandings,
			policy,
			theme: "light",
			layout,
		});
		const routes = routePoints(drawing.svg);
		const down = new Set(["a former name opens the board", "the board the name answers to"]);
		const entries = board.edges
			.filter(({ to, label }) => to === former && down.has(label))
			.map(({ id }) => {
				const [last, before] = cornersOf(routes.get(id)!).toReversed();
				return Math.abs(last!.x - before!.x) < 0.01 ? "top" : "side";
			});
		expect(entries).toEqual(["top", "top"]);
	},
);
