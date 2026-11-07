// Which reading a flow opens in (ADR 0073): the one its pane shows at the larger scale, up to the
// drawn size, and the sequence when both show as large.

import { expect, test } from "bun:test";
import { fittingReading } from "#ui/architecture-drawing/model-reader/rules/flow-fit.ts";

/** A pane with room for a picture of 1000 by 700 at full size, once its margins are taken. */
const PANE = { width: 1048, height: 748 };

test("a flow opens in the reading that the pane shows larger", () => {
	const tall = { width: 400, height: 2800 };
	const wide = { width: 1200, height: 900 };
	expect(fittingReading(PANE, { sequence: tall, flowchart: wide })).toBe("flowchart");
	expect(fittingReading(PANE, { sequence: wide, flowchart: tall })).toBe("sequence");
});

test("a flow that both readings show at full size opens as a sequence", () => {
	const small = { width: 600, height: 400 };
	const smaller = { width: 300, height: 200 };
	expect(fittingReading(PANE, { sequence: small, flowchart: smaller })).toBe("sequence");
});

test("a reading that could not be drawn loses, and a pane not laid out yet weighs the reference pane", () => {
	const picture = { width: 800, height: 600 };
	expect(fittingReading(PANE, { sequence: null, flowchart: picture })).toBe("flowchart");
	expect(fittingReading(null, { sequence: { width: 600, height: 4000 }, flowchart: picture })).toBe(
		"flowchart",
	);
});
