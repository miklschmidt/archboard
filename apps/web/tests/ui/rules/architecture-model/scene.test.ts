import { expect, test } from "bun:test";
import {
	EMPTY_DRAWING,
	leavingTo,
	moveTo,
	nextScene,
	parentOf,
	sceneBoard,
	sceneFit,
	sceneView,
	type AcceptedScene,
	type SceneRequest,
} from "#ui/rules/architecture-model/scene.ts";
import {
	SHOP,
	shopReading as reading,
	shopRequest as request,
} from "#tests/ui/support/architecture-model/scene.ts";

const NOTHING: ReadonlySet<string> = new Set();

/**
 * A picture of some cards.
 * @param cards The cards it draws.
 * @returns The drawing.
 */
function drawing(cards: readonly string[]): typeof EMPTY_DRAWING {
	const box = { x: 0, y: 0, width: 10, height: 10 };
	return {
		...EMPTY_DRAWING,
		svg: `<svg>${cards.join()}</svg>`,
		atlas: { nodes: Object.fromEntries(cards.map((id) => [id, box])), edges: {}, regions: {} },
	};
}

/**
 * The scene a drawn request becomes.
 * @param asked The request.
 * @param cards The cards its picture draws.
 * @param selected The selection on it.
 * @returns The scene.
 */
function accepted(
	asked: SceneRequest,
	cards: readonly string[] = ["Shop#Gateway"],
	selected = NOTHING,
): AcceptedScene {
	const scene = nextScene(null, asked, drawing(cards), selected);
	if (scene === null) throw new Error("A drawn request becomes a scene.");
	return scene;
}

test("a destination never replaces the scene on screen before its picture exists", () => {
	const before = accepted(request());
	expect(nextScene(before, request({ scope: "Shop#Gateway" }), undefined, NOTHING)).toBe(before);
});

test("a drawing kept from the last model is not the answer to a new address", () => {
	const before = accepted(request());
	const unsettled = request({ scope: "Shop#Gateway" }, false);
	expect(nextScene(before, unsettled, drawing(["Shop#Handler"]), NOTHING)).toBe(before);
});

test("a correction replaces what inspection reads, though its revision and picture stay", () => {
	const before = accepted(request());
	const corrected = { ...request(), model: { ...SHOP } };
	expect(nextScene(before, corrected, before.drawing, NOTHING)?.model).toBe(corrected.model);
});

test("the selection on screen holds while another reading is drawn and follows after", () => {
	const picked = new Set(["Shop#Gateway"]);
	const before = accepted(request());
	expect(nextScene(before, request({ scope: "Shop#Gateway" }), undefined, picked)?.selected).toBe(
		NOTHING,
	);
	expect(nextScene(before, request(), before.drawing, picked)?.selected).toBe(picked);
});

test("an unavailable reading takes the old picture off the screen", () => {
	const before = accepted(request());
	const asked: SceneRequest = {
		...request({ grammar: "sequence" }),
		grammar: null,
	};
	expect(nextScene(before, asked, EMPTY_DRAWING, NOTHING)?.picture.svg).toBe("");
});

test.each([
	["a crumb up to a module that holds the open one", "Shop#Handler", "Shop#Gateway", "out"],
	["a child's card", "Shop#Gateway", "Shop#Handler", "into"],
	["a part deeper than the next level", "Shop#Gateway", "Shop#Decode", "into"],
	["a module on another branch", "Shop#Handler", "Shop#Worker", "across"],
] as const)("the picture leaves the same way for every route to %s", (_name, from, to, way) => {
	const cards = to === "Shop#Handler" ? ["Shop#Handler"] : [];
	const before = accepted(request({ scope: from }), cards);
	const asked = request({ scope: to });
	expect(leavingTo(before, asked)?.way).toBe(way);
	expect(nextScene(before, asked, drawing([]), NOTHING)?.heading?.way).toBe(way);
});

test("a picture stays while the next reading of its subject is drawn", () => {
	const before = accepted(request());
	expect(leavingTo(before, request({ state: "Draft" }))).toBeNull();
	expect(
		leavingTo(before, {
			...request({ scope: "Shop#Gateway" }),
			presentation: { key: "b", subjects: [] },
		}),
	).toBeNull();
});

test("a state, comparison or filter is carried on one board, and a focus starts afresh", () => {
	const scope = reading({ scope: "Shop#Gateway" });
	expect(sceneBoard({ ...scope, state: "Draft", against: "Current" })).toBe(sceneBoard(scope));
	expect(sceneView({ ...scope, filters: { hideKinds: ["call"] } })).toBeNull();
	expect(sceneView({ ...scope, focus: ["Shop#Handler"] })).toEqual({ id: "Shop#Handler" });
	expect(sceneBoard({ ...scope, scope: "Shop#Worker" })).not.toBe(sceneBoard(scope));
	expect(sceneBoard({ ...scope, grammar: "sequence", flow: "Shop#Flow" })).not.toBe(
		sceneBoard({ ...scope, grammar: "flowchart", flow: "Shop#Flow" }),
	);
	expect(sceneFit({ reading: { ...scope, against: "Current" } })).not.toBe(
		sceneFit({ reading: scope }),
	);
	expect(sceneFit({ reading: scope, layout: "track" })).not.toBe(
		sceneFit({ reading: scope, layout: "blocks" }),
	);
});

test("only the entered subject justifies a flight", () => {
	const open = accepted(request({ scope: "Shop#Gateway" }), ["Shop#Handler"]);
	expect(moveTo(open, "Shop#Handler")).toEqual({ kind: "into", card: "Shop#Handler" });
	expect(moveTo(open, "Shop#Decode")).toEqual({ kind: "into", card: null });
	expect(moveTo(open, null)).toEqual({ kind: "out", card: "Shop#Gateway" });
	expect(moveTo(open, "Shop#Gateway")).toEqual({ kind: "plain" });
	const flow = accepted(request({ grammar: "sequence", flow: "Shop#Flow" }));
	expect(moveTo(flow, "Shop#Gateway")).toEqual({ kind: "plain" });
	expect(moveTo(null, "Shop#Gateway")).toEqual({ kind: "plain" });
});

test("the parent of a scope is the nearest module that holds it", () => {
	expect(parentOf(SHOP, "Shop#Decode")).toBe("Shop#Handler");
	expect(parentOf(SHOP, "Shop#Gateway")).toBeNull();
});
