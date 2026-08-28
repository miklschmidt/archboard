import { expect, test } from "bun:test";
import { expandForBoard } from "../../../src/runtime/engine/expand-elements.ts";
import { boundTextsByContainer, labelTextIdFor } from "../../../src/runtime/engine/labels.ts";
import { isBlockId } from "../../../src/shared/ids/ids.ts";
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
const assert = (condition: unknown, message: string): void =>
	expect(Boolean(condition), message).toBeTrue();
const required = <T>(value: T | null | undefined, message: string): T => {
	if (value === null || value === undefined) throw new Error(message);
	return value;
};
const firstLabel = (labels: ReturnType<typeof boundTextsByContainer>, container: string): string =>
	required(labels.get(container)?.[0], `Missing label for ${container}.`);
test("contains hostile pane cycles and preserves human and agent label edits", () => {
	{
		const store = boardOf(drawn(), { keepSeed: true });
		const baseline = new Map();
		for (let i = 0; i < CYCLES; i++) cycle(store, baseline, { contain: false });
		const elements = [...store.values()];
		assert(
			worstLabelCount(elements) > CYCLES / 2,
			`unfixed model did not reproduce the loop (worst container has ${worstLabelCount(elements)} bound texts)`,
		);
		assert(
			elements.length > 3 + 3 * (CYCLES / 2),
			`unfixed model did not grow (${elements.length} elements after ${CYCLES} cycles)`,
		);
	}
	{
		const store = boardOf(drawn());
		const baseline = new Map();
		const sizes = [];
		let reports = 0;
		for (let i = 0; i < CYCLES; i++) {
			const { upserts } = cycle(store, baseline, { contain: true });
			sizes.push(store.size);
			if (i > 0 && upserts.length > 0) reports += 1;
		}
		const elements = [...store.values()];
		const labels = boundTextsByContainer(elements);
		assert(
			store.size === 6,
			`expected 3 drawn + 3 labels, got ${store.size} after ${CYCLES} cycles`,
		);
		assert(new Set(sizes).size === 1, `board size drifted across cycles: ${sizes.join(",")}`);
		assert(
			labels.get("svc")?.length === 1,
			`labelled shape has ${labels.get("svc")?.length} bound texts`,
		);
		assert(
			labels.get("wire")?.length === 1,
			`labelled arrow has ${labels.get("wire")?.length} bound texts`,
		);
		assert(
			reports === 0,
			`a settled board kept reporting changes on ${reports} of ${CYCLES} cycles`,
		);
		const arrow = store.get("wire");
		assert(
			JSON.stringify(arrow.points) === "[[0,0],[192,0]]",
			`the input refs did not route the arrow to the two shapes: ${JSON.stringify(arrow.points)}`,
		);
		assert(
			arrow.x === 204 && arrow.height === 0 && arrow.width === 192,
			`the routed arrow geometry is ${arrow.x}, ${arrow.width}x${arrow.height}, not 204, 192x0`,
		);
		assert(
			(arrow.boundElements ?? []).filter((ref) => ref.type === "text").length === 1,
			"arrow accumulated more than one bound-text reference",
		);
		const texts = elements.filter((element) => element.type === "text");
		assert(texts.length === 3, `expected 3 text elements, got ${texts.length}`);
		assert(
			texts
				.map((t) => t.text)
				.toSorted((a, b) => String(a).localeCompare(String(b)))
				.join("|") === "AuthService|Gateway|HTTP",
			`label text was lost: ${texts.map((t) => t.text).join("|")}`,
		);
		assert(
			seeded(store).length === 0,
			`the board kept a label seed on ${seeded(store).join(", ")}`,
		);
	}
	{
		const store = boardOf([
			{
				id: "wire",
				type: "arrow",
				x: 0,
				y: 0,
				width: 200,
				height: 0,
				points: [
					[0, 0],
					[200, 0],
				],
				label: { text: "HTTP" },
			},
		]);
		const baseline = new Map();
		let worst = 0;
		let biggest = store.size;
		for (let i = 0; i < 50; i++) {
			write(store, [{ id: "wire", x: i }]);
			cycle(store, baseline, { contain: true });
			worst = Math.max(worst, worstLabelCount([...store.values()]));
			biggest = Math.max(biggest, store.size);
		}
		assert(
			worst === 1,
			`fifty write-and-read cycles took one arrow's label to ${worst} bound texts`,
		);
		assert(biggest === 2, `fifty cycles grew a two-element board to ${biggest}`);
		const label = firstLabel(boundTextsByContainer([...store.values()]), "wire");
		assert(
			store.get(label).text === "HTTP",
			`the label read ${JSON.stringify(store.get(label).text)} after fifty cycles`,
		);
		assert(
			store.get("wire").height === 0,
			`the arrow collapsed to a height of ${store.get("wire").height}`,
		);
		assert(seeded(store).length === 0, `fifty cycles left a seed on ${seeded(store).join(", ")}`);
	}
	{
		const store = boardOf(drawn());
		const baseline = new Map();
		const seen = [];
		for (let i = 0; i < CYCLES; i++) {
			cycle(store, baseline, { contain: true });
			seen.push(boundTextsByContainer([...store.values()]).get("svc")?.[0]);
		}
		const labels = boundTextsByContainer([...store.values()]);
		const stray = ["svc", "gw", "wire"]
			.map((container) => labels.get(container)?.[0])
			.filter((id) => !isBlockId(id));
		assert(
			stray.length === 0,
			`a label kept an id the note writer would rename: ${stray.join(", ")}`,
		);
		assert(
			labels.get("svc")?.[0] === labelTextIdFor("svc"),
			`the shape's label is ${labels.get("svc")?.[0]}, not the id derived from its container`,
		);
		assert(
			new Set(seen).size === 1,
			`the label's id moved across cycles: ${[...new Set(seen)].join(" -> ")}`,
		);
		write(store, [{ id: "svc", label: { text: "IdentityService" } }]);
		for (let i = 0; i < 5; i++) cycle(store, baseline, { contain: true });
		assert(
			boundTextsByContainer([...store.values()]).get("svc")?.[0] === seen[0],
			"renaming a label renamed the element carrying it",
		);
	}
	{
		const store = boardOf(drawn());
		const baseline = new Map();
		for (let i = 0; i < 5; i++) cycle(store, baseline, { contain: true });
		const before = boundTextsByContainer([...store.values()]);
		const shapeLabel = firstLabel(before, "svc");
		const arrowLabel = firstLabel(before, "wire");
		write(store, [{ id: "svc", label: { text: "IdentityService" } }]);
		write(store, [{ id: "wire", label: { text: "gRPC" } }]);
		for (let i = 0; i < 5; i++) cycle(store, baseline, { contain: true });
		const after = boundTextsByContainer([...store.values()]);
		assert(
			after.get("svc")?.length === 1,
			`renaming a shape left ${after.get("svc")?.length} labels`,
		);
		assert(
			after.get("wire")?.length === 1,
			`renaming an arrow left ${after.get("wire")?.length} labels`,
		);
		assert(
			firstLabel(after, "svc") === shapeLabel,
			"a renamed shape label became a different element",
		);
		assert(
			firstLabel(after, "wire") === arrowLabel,
			"a renamed arrow label became a different element",
		);
		assert(
			store.get(shapeLabel).text === "IdentityService",
			`shape label reads ${JSON.stringify(store.get(shapeLabel).text)}`,
		);
		assert(
			store.get(arrowLabel).text === "gRPC",
			`arrow label reads ${JSON.stringify(store.get(arrowLabel).text)}`,
		);
		assert(store.size === 6, `renaming changed the element count to ${store.size}`);
		assert(seeded(store).length === 0, `renaming left a seed on ${seeded(store).join(", ")}`);
	}
	{
		const store = boardOf(drawn());
		const baseline = new Map();
		for (let i = 0; i < 5; i++) cycle(store, baseline, { contain: true });
		const before = boundTextsByContainer([...store.values()]);
		const shapeLabel = firstLabel(before, "svc");
		const arrowLabel = firstLabel(before, "wire");
		cycle(store, baseline, {
			contain: true,
			types: { svc: "Ledger", wire: "AMQP" },
		});
		for (let i = 0; i < CYCLES; i++) cycle(store, baseline, { contain: true });
		const after = boundTextsByContainer([...store.values()]);
		assert(
			store.get(shapeLabel).text === "Ledger",
			`a retyped shape label reads ${JSON.stringify(store.get(shapeLabel).text)}`,
		);
		assert(
			store.get(arrowLabel).text === "AMQP",
			`a retyped arrow label reads ${JSON.stringify(store.get(arrowLabel).text)}`,
		);
		assert(
			seeded(store).length === 0,
			`retyping left a seed to revert to on ${seeded(store).join(", ")}`,
		);
		assert(store.size === 6, `retyping a label changed the element count to ${store.size}`);
		assert(
			after.get("svc")?.length === 1,
			`retyping left ${after.get("svc")?.length} labels on the shape`,
		);
		assert(
			after.get("wire")?.length === 1,
			`retyping left ${after.get("wire")?.length} labels on the arrow`,
		);
		assert(
			firstLabel(after, "svc") === shapeLabel,
			"a retyped shape label became a different element",
		);
		assert(
			firstLabel(after, "wire") === arrowLabel,
			"a retyped arrow label became a different element",
		);
		const reloaded = new Map();
		cycle(store, reloaded, { contain: true });
		assert(
			store.get(shapeLabel).text === "Ledger",
			`reloading reverted the shape label to ${JSON.stringify(store.get(shapeLabel).text)}`,
		);
		assert(
			store.get(arrowLabel).text === "AMQP",
			`reloading reverted the arrow label to ${JSON.stringify(store.get(arrowLabel).text)}`,
		);
	}
});
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
		for (let i = 0; i < 5; i++) cycle(store, baseline, { contain: true });
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
		for (let i = 0; i < 3; i++) cycle(store, baseline, { contain: true });
		assert(
			store.get(shapeLabel).text === "AuthService",
			"with the seed back the model failed to reproduce the revert, so it is toothless",
		);
	}
	{
		const store = boardOf(drawn());
		const baseline = new Map();
		for (let i = 0; i < 5; i++) cycle(store, baseline, { contain: true });
		const shapeLabel = firstLabel(boundTextsByContainer([...store.values()]), "svc");
		cycle(store, baseline, { contain: true, types: { svc: "Ledger" } });
		write(store, [{ id: "svc", x: 40 }]);
		for (let i = 0; i < 3; i++) cycle(store, baseline, { contain: true });
		assert(
			store.get(shapeLabel).text === "Ledger",
			`moving the box reverted its label to ${JSON.stringify(store.get(shapeLabel).text)}`,
		);
	}
	{
		const store = boardOf(drawn());
		const baseline = new Map();
		for (let i = 0; i < 5; i++) cycle(store, baseline, { contain: true });
		const shapeLabel = firstLabel(boundTextsByContainer([...store.values()]), "svc");
		cycle(store, baseline, { contain: true, types: { svc: "Ledger" } });
		for (let i = 0; i < 3; i++) cycle(store, baseline, { contain: true });
		write(store, [{ id: "svc", label: { text: "PostingEngine" } }]);
		for (let i = 0; i < 5; i++) cycle(store, baseline, { contain: true });
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
		for (let i = 0; i < 5; i++) cycle(store, baseline, { contain: true });
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
		for (let i = 0; i < CYCLES; i++) cycle(store, baseline, { contain: true });
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
		for (let i = 0; i < 5; i++) cycle(store, baseline, { contain: true });
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
		for (let i = 0; i < 5; i++) cycle(store, baseline, { contain: true });
		const shapeLabel = firstLabel(boundTextsByContainer([...store.values()]), "svc");
		cycle(store, baseline, { contain: true, empties: { svc: true } });
		assert(!store.has(shapeLabel), "the model never got the deletion to the server at all");
		write(store, [{ id: "svc", x: 40 }], { keepSeed: true });
		for (let i = 0; i < 3; i++) cycle(store, baseline, { contain: true });
		const revived = boundTextsByContainer([...store.values()]).get("svc");
		assert(
			revived?.length === 1 &&
				store.get(required(revived[0], "Revived svc has no label.")).text === "AuthService",
			"with the seed back the model failed to reproduce the label coming back, so it is toothless",
		);
	}
	{
		const fresh = expandForBoard(drawn().slice(0, 1), new Map());
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
		const nudged = expandForBoard(
			[{ ...required(cleared.get("gw"), "Cleared gw missing."), x: 40 }],
			cleared,
		);
		assert(nudged.length === 1, `moving a cleared box grew ${nudged.length - 1} labels`);
	}
	{
		const store = boardOf(drawn());
		const baseline = new Map();
		for (let i = 0; i < 5; i++) cycle(store, baseline, { contain: true });
		const shapeLabel = firstLabel(boundTextsByContainer([...store.values()]), "svc");
		cycle(store, baseline, {
			contain: true,
			empties: { gw: true },
			types: { svc: "Ledger" },
		});
		for (let i = 0; i < CYCLES; i++) cycle(store, baseline, { contain: true });
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
		for (let i = 0; i < 5; i++) cycle(store, baseline, { contain: true });
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
		for (let i = 0; i < 5; i++) cycle(store, baseline, { contain: true });
		const labels = boundTextsByContainer([...store.values()]);
		assert(
			labels.get("cache")?.length === 1,
			`a newly drawn label got ${labels.get("cache")?.length ?? 0} bound texts`,
		);
		const text = store.get(firstLabel(labels, "cache"));
		assert(text?.text === "Cache", `newly drawn label reads ${JSON.stringify(text?.text)}`);
	}
});
