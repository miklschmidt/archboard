import { expect, test } from "bun:test";
import {
	BOUND_ARROW_GAP,
	boundEndpoint,
	focusPointOf,
	type ArrowBinding,
} from "../arrow-binding.ts";
import { expandElements } from "../expand-elements.ts";
import { labelAnchorOf } from "../labels.ts";
import type { LegacyElementIngress } from "../../../shared/board-elements/index.ts";
import {
	capturedArrowStart,
	capturedBrowserEndpoint,
	capturedFocusedNode,
	pinnedSolverEndpoint,
} from "./fixtures/geometry-cases.ts";
import { ExpandedElementSchema } from "./fixtures/label-cases.ts";
import { agentStatement } from "./support/elements.ts";

const assert = (condition: unknown, message: string): void =>
	expect(Boolean(condition), message).toBeTrue();
const near = (a: number, b: number, slack = 0.5): boolean => Math.abs(a - b) <= slack;
const pointDistance = (
	actual: { x: number; y: number },
	expected: { x: number; y: number },
): number => Math.hypot(actual.x - expected.x, actual.y - expected.y);
const required = <T>(value: T | undefined, message: string): T => {
	if (value === undefined) throw new Error(message);
	return value;
};
const binding = (over: Partial<ArrowBinding> = {}): ArrowBinding => ({
	elementId: "box",
	focus: 0,
	gap: BOUND_ARROW_GAP,
	...over,
});

test("pins bound arrow endpoints, focus, gap, rotations, bends, and label anchors", () => {
	{
		const box = { type: "rectangle", x: 0, y: 0, width: 100, height: 60 };
		const fromTheRight = { x: 500, y: 30 };
		const centred = focusPointOf(box, 0, fromTheRight);
		assert(
			centred.x === 50 && centred.y === 30,
			`focus 0 aims at ${centred.x},${centred.y} rather than the shape's centre`,
		);

		const low = focusPointOf(box, 1, fromTheRight);
		const high = focusPointOf(box, -1, fromTheRight);
		assert(
			low.x === 100 && low.y === 60,
			`focus 1 aims at ${low.x},${low.y}, not the bottom-right corner`,
		);
		assert(
			high.x === 100 && high.y === 0,
			`focus -1 aims at ${high.x},${high.y}, not the top-right corner`,
		);

		const near4 = boundEndpoint(box, binding(), fromTheRight, { x: 0, y: 0 });
		assert(
			near(near4.x, 104) && near(near4.y, 30),
			`a gap of ${BOUND_ARROW_GAP} put the end at ${near4.x},${near4.y}, not 4px off the right edge`,
		);
		const near12 = boundEndpoint(box, binding({ gap: 12 }), fromTheRight, {
			x: 0,
			y: 0,
		});
		assert(
			near(near12.x, 112),
			`a binding recording gap 12 was routed to ${near12.x}, which is not 12px off the edge at x=100`,
		);
		assert(
			near12.x !== near4.x,
			"two bindings recording different gaps were routed to the same point, so the gap is being ignored",
		);

		const focused = boundEndpoint(box, binding({ focus: 1 }), fromTheRight, {
			x: 0,
			y: 0,
		});
		assert(near(focused.x, 104), `a focused end left the outline, at x=${focused.x}`);
		assert(
			focused.y > 50,
			`focus 1 was routed to y=${focused.y}, which is the centre line rather than the corner it aims at`,
		);

		const roundedEndpoint = (focus: number) =>
			boundEndpoint(capturedFocusedNode, binding({ focus, gap: 15 }), capturedArrowStart, {
				x: 0,
				y: 0,
			});
		const captured = roundedEndpoint(0.9);
		assert(
			pointDistance(captured, capturedBrowserEndpoint) <= 0.001,
			`the captured rounded focus 0.9 endpoint was ${captured.x},${captured.y}, ` +
				`${pointDistance(captured, capturedBrowserEndpoint)}px from Excalidraw`,
		);
		const capturedAgain = roundedEndpoint(0.9);
		assert(
			captured.x === pinnedSolverEndpoint.x &&
				captured.y === pinnedSolverEndpoint.y &&
				JSON.stringify(capturedAgain) === JSON.stringify(captured),
			`the pinned rounded focus 0.9 endpoint was ${captured.x},${captured.y} first and ` +
				`${capturedAgain.x},${capturedAgain.y} when repeated, not ` +
				`${pinnedSolverEndpoint.x},${pinnedSolverEndpoint.y} bit for bit`,
		);
		const neighboring = roundedEndpoint(0.8);
		const neighboringExpected = { x: 1279.8589442886187, y: 1144.108983723157 };
		assert(
			pointDistance(neighboring, neighboringExpected) <= 0.001,
			`the neighboring rounded focus 0.8 endpoint was ${neighboring.x},${neighboring.y}, ` +
				`${pointDistance(neighboring, neighboringExpected)}px from Excalidraw`,
		);

		const onItsSide = { ...box, angle: Math.PI / 2 };
		const rotated = boundEndpoint(onItsSide, binding(), fromTheRight, {
			x: 0,
			y: 0,
		});
		assert(
			near(rotated.x, 84) && near(rotated.y, 30),
			`a box rotated a quarter turn was routed to ${rotated.x},${rotated.y} rather than 84,30`,
		);

		const corner = { x: 500, y: 480 };
		const meets = (type: string) =>
			boundEndpoint({ ...box, type }, binding(), corner, { x: 0, y: 0 });
		const outlines = ["rectangle", "ellipse", "diamond"].map(meets);
		const square = required(outlines[0], "rectangle endpoint missing");
		const round = required(outlines[1], "ellipse endpoint missing");
		const diamond = required(outlines[2], "diamond endpoint missing");
		assert(
			square.x > round.x && round.x > diamond.x,
			`arriving on a diagonal, the outlines should nest rectangle > ellipse > diamond, not ` +
				`${Math.round(square.x)} / ${Math.round(round.x)} / ${Math.round(diamond.x)}`,
		);

		const fromInside = boundEndpoint(box, binding(), { x: 50, y: 30 }, { x: 7, y: 7 });
		assert(
			fromInside.x === 50 && fromInside.y === 30,
			`an end aimed from inside the shape went to ${fromInside.x},${fromInside.y} rather than the aim`,
		);
	}

	{
		const bent = agentStatement({
			id: "bent",
			type: "arrow",
			x: 100,
			y: 100,
			width: 300,
			height: 200,
			points: [
				[0, 0],
				[300, 0],
				[300, 200],
			],
			label: { text: "routes via" },
		} satisfies LegacyElementIngress);
		const expanded = ExpandedElementSchema.array().parse(
			expandElements([bent], { deterministic: true }),
		);
		const text = required(
			expanded.find((el) => el.type === "text"),
			"the bent arrow label is missing",
		);
		assert(
			text !== undefined,
			"expanding a labelled arrow should have produced a bound text element",
		);
		const centre = {
			x: text.x + (text.width ?? 0) / 2,
			y: text.y + (text.height ?? 0) / 2,
		};
		const anchor = required(labelAnchorOf(bent), "the bent arrow has no label anchor");
		assert(
			near(centre.x, 400, 1) && near(centre.y, 100, 1),
			`a three-point arrow labels itself at its bend (400,100), not (${centre.x},${centre.y})`,
		);
		assert(
			near(centre.x, anchor.x, 1) && near(centre.y, anchor.y, 1),
			"the exported label and the placement rule the server enforces should agree",
		);

		const straight = agentStatement({
			id: "straight",
			type: "arrow",
			x: 0,
			y: 0,
			width: 200,
			height: 100,
			points: [
				[0, 0],
				[200, 100],
			],
			label: { text: "calls" },
		} satisfies LegacyElementIngress);
		const straightText = required(
			ExpandedElementSchema.array()
				.parse(expandElements([straight], { deterministic: true }))
				.find((el) => el.type === "text"),
			"the straight arrow label is missing",
		);
		assert(
			near(straightText.x + (straightText.width ?? 0) / 2, 100, 1) &&
				near(straightText.y + (straightText.height ?? 0) / 2, 50, 1),
			"a two-point arrow still labels itself halfway along",
		);
	}
});
