import { test } from "bun:test";
import { expandForBoard } from "../../../src/runtime/engine/expand-elements.ts";
import { wellFormAgentStatement } from "../../../src/runtime/engine/apply-element-input.ts";
import { boundTextsByContainer } from "../../../src/runtime/engine/labels.ts";
import {
	boardOf,
	CYCLES,
	cycle,
	drawn,
	reopenedRepairedBoard,
	seedOf,
	seeded,
	worstLabelCount,
	write,
} from "./support/label-cycle.ts";
import { assert, required, firstLabel } from "./support/label-assertions.ts";
test("preserves human clear, retype, and later agent precedence", () => {
	{
		const reopened = reopenedRepairedBoard();
		assert(reopened.size === 6, `repaired board grew back to ${reopened.size} elements`);
		assert(
			worstLabelCount([...reopened.values()]) === 1,
			"repaired board started duplicating again",
		);
	}
	{
		const store = boardOf(drawn(), { keepSeed: true });
		const baseline = new Map();
		for (let i = 0; i < 5; i++) {
			cycle(store, baseline, { contain: true });
		}
		const shapeLabel = firstLabel(boundTextsByContainer([...store.values()]), "svc");
		cycle(store, baseline, { contain: true, types: { svc: "Ledger" } });
		assert(
			store.get(shapeLabel).text === "Ledger",
			"the model never got the human edit to the server at all",
		);
		assert(
			store.get("svc").label?.text === "AuthService",
			"the revert did not put a stale seed on the board",
		);
		write(store, [{ id: "svc", x: 40 }], { keepSeed: true });
		for (let i = 0; i < 3; i++) {
			cycle(store, baseline, { contain: true });
		}
		assert(
			store.get(shapeLabel).text === "AuthService",
			"with the seed back the model failed to reproduce the revert, so it is toothless",
		);
	}
	{
		const store = boardOf(drawn());
		const baseline = new Map();
		for (let i = 0; i < 5; i++) {
			cycle(store, baseline, { contain: true });
		}
		const shapeLabel = firstLabel(boundTextsByContainer([...store.values()]), "svc");
		cycle(store, baseline, { contain: true, types: { svc: "Ledger" } });
		write(store, [{ id: "svc", x: 40 }]);
		for (let i = 0; i < 3; i++) {
			cycle(store, baseline, { contain: true });
		}
		assert(
			store.get(shapeLabel).text === "Ledger",
			`moving the box reverted its label to ${JSON.stringify(store.get(shapeLabel).text)}`,
		);
	}
	{
		const store = boardOf(drawn());
		const baseline = new Map();
		for (let i = 0; i < 5; i++) {
			cycle(store, baseline, { contain: true });
		}
		const shapeLabel = firstLabel(boundTextsByContainer([...store.values()]), "svc");
		cycle(store, baseline, { contain: true, types: { svc: "Ledger" } });
		for (let i = 0; i < 3; i++) {
			cycle(store, baseline, { contain: true });
		}
		write(store, [{ id: "svc", label: { text: "PostingEngine" } }]);
		for (let i = 0; i < 5; i++) {
			cycle(store, baseline, { contain: true });
		}
		assert(
			store.get(shapeLabel).text === "PostingEngine",
			`an agent rename after a human edit reads ${JSON.stringify(store.get(shapeLabel).text)}`,
		);
		assert(
			seeded(store).length === 0,
			`an agent rename left a seed on ${seeded(store).join(", ")}`,
		);
		assert(
			boundTextsByContainer([...store.values()]).get("svc")?.length === 1,
			"the two renames between them grew a second label",
		);
		assert(
			store.size === 6,
			`the two renames between them changed the element count to ${store.size}`,
		);
	}
	{
		const store = boardOf(drawn());
		const baseline = new Map();
		for (let i = 0; i < 5; i++) {
			cycle(store, baseline, { contain: true });
		}
		const before = boundTextsByContainer([...store.values()]);
		const shapeLabel = firstLabel(before, "svc");
		const arrowLabel = firstLabel(before, "wire");
		const { deletes } = cycle(store, baseline, {
			contain: true,
			empties: { svc: true, wire: true },
		});
		assert(
			deletes.includes(shapeLabel),
			"clearing a label did not report the text element as deleted",
		);
		assert(!store.has(shapeLabel), "the cleared shape label survived on the server");
		assert(!store.has(arrowLabel), "the cleared arrow label survived on the server");
		for (let i = 0; i < CYCLES; i++) {
			cycle(store, baseline, { contain: true });
		}
		const after = boundTextsByContainer([...store.values()]);
		assert(
			after.get("svc") === undefined,
			`a cleared shape label grew back ${after.get("svc")?.length} bound texts`,
		);
		assert(
			after.get("wire") === undefined,
			`a cleared arrow label grew back ${after.get("wire")?.length} bound texts`,
		);
		assert(
			seeded(store).length === 0,
			`clearing left a seed to grow back from on ${seeded(store).join(", ")}`,
		);
		assert(
			store.size === 4,
			`clearing two of three labels left ${store.size} elements, expected 4`,
		);
		const gateway = after.get("gw");
		assert(
			gateway?.length === 1,
			`clearing other labels left ${gateway?.length} on the untouched shape`,
		);
		assert(
			store.get(required(gateway?.[0], "Gateway lost its label.")).text === "Gateway",
			"clearing a label disturbed a different one",
		);
		const reloaded = new Map();
		cycle(store, reloaded, { contain: true });
		assert(
			boundTextsByContainer([...store.values()]).get("svc") === undefined,
			"reloading brought the cleared shape label back",
		);
		assert(store.size === 4, `reloading a board with cleared labels left ${store.size} elements`);
		write(store, [{ id: "svc", label: { text: "Ledger" } }]);
		for (let i = 0; i < 5; i++) {
			cycle(store, baseline, { contain: true });
		}
		const relabelled = boundTextsByContainer([...store.values()]).get("svc");
		assert(
			relabelled?.length === 1,
			`relabelling a cleared shape gave it ${relabelled?.length ?? 0} bound texts`,
		);
		assert(
			store.get(required(relabelled?.[0], "Relabelled svc has no text.")).text === "Ledger",
			"a cleared shape could not be labelled again",
		);
	}
	{
		const store = boardOf(drawn(), { keepSeed: true });
		const baseline = new Map();
		for (let i = 0; i < 5; i++) {
			cycle(store, baseline, { contain: true });
		}
		const shapeLabel = firstLabel(boundTextsByContainer([...store.values()]), "svc");
		cycle(store, baseline, { contain: true, empties: { svc: true } });
		assert(!store.has(shapeLabel), "the model never got the deletion to the server at all");
		write(store, [{ id: "svc", x: 40 }], { keepSeed: true });
		for (let i = 0; i < 3; i++) {
			cycle(store, baseline, { contain: true });
		}
		const revived = boundTextsByContainer([...store.values()]).get("svc");
		assert(
			revived?.length === 1 &&
				store.get(required(revived[0], "Revived svc has no label.")).text === "AuthService",
			"with the seed back the model failed to reproduce the label coming back, so it is toothless",
		);
	}
	{
		const freshInput = wellFormAgentStatement(
			drawn()[0] as unknown as Record<string, unknown>,
		) as unknown as ReturnType<typeof drawn>[number];
		const fresh = expandForBoard([freshInput], new Map());
		assert(
			fresh.length === 2,
			`an agent's label produced ${fresh.length} elements, not a box and its text`,
		);
		const freshShape = required(
			fresh.find((el) => el.id === "svc"),
			"Fresh svc missing.",
		);
		assert(
			seedOf(freshShape) === undefined,
			"the write boundary handed the seed on to the board instead of consuming it",
		);
		const cleared = boardOf([
			{
				id: "gw",
				type: "rectangle",
				x: 0,
				y: 0,
				width: 200,
				height: 80,
				boundElements: [],
			},
		]);
		const { label: _label, ...clearedGw } = required(cleared.get("gw"), "Cleared gw missing.");
		const nudged = expandForBoard([{ ...clearedGw, x: 40 }], cleared);
		assert(nudged.length === 1, `moving a cleared box grew ${nudged.length - 1} labels`);
	}
	{
		const store = boardOf(drawn());
		const baseline = new Map();
		for (let i = 0; i < 5; i++) {
			cycle(store, baseline, { contain: true });
		}
		const shapeLabel = firstLabel(boundTextsByContainer([...store.values()]), "svc");
		cycle(store, baseline, {
			contain: true,
			empties: { gw: true },
			types: { svc: "Ledger" },
		});
		for (let i = 0; i < CYCLES; i++) {
			cycle(store, baseline, { contain: true });
		}
		assert(
			store.get(shapeLabel).text === "Ledger",
			`the retyped label reads ${JSON.stringify(store.get(shapeLabel).text)}`,
		);
		assert(
			boundTextsByContainer([...store.values()]).get("gw") === undefined,
			"the cleared label came back",
		);
		assert(
			seeded(store).length === 0,
			`a clearing and a retype together left a seed on ${seeded(store).join(", ")}`,
		);
		assert(
			store.size === 5,
			`clearing one label and retyping another left ${store.size} elements, expected 5`,
		);
	}
	{
		const store = boardOf(drawn());
		const baseline = new Map();
		for (let i = 0; i < 5; i++) {
			cycle(store, baseline, { contain: true });
		}
		write(store, [
			{
				id: "cache",
				type: "rectangle",
				x: 0,
				y: 200,
				width: 200,
				height: 80,
				label: { text: "Cache" },
			},
		]);
		for (let i = 0; i < 5; i++) {
			cycle(store, baseline, { contain: true });
		}
		const labels = boundTextsByContainer([...store.values()]);
		assert(
			labels.get("cache")?.length === 1,
			`a newly drawn label got ${labels.get("cache")?.length ?? 0} bound texts`,
		);
		const text = store.get(firstLabel(labels, "cache"));
		assert(text?.text === "Cache", `newly drawn label reads ${JSON.stringify(text?.text)}`);
	}
});
