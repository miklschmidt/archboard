import { test } from "bun:test";
import { boundTextsByContainer, labelTextIdFor } from "../../../src/runtime/engine/labels.ts";
import { isBlockId } from "../../../src/shared/ids/ids.ts";
import {
	boardOf,
	CYCLES,
	cycle,
	drawn,
	seeded,
	worstLabelCount,
	write,
} from "./support/label-cycle.ts";
import { assert, firstLabel } from "./support/label-assertions.ts";
test("contains hostile pane cycles and preserves human and agent label edits", () => {
	{
		const store = boardOf(drawn(), { keepSeed: true });
		const baseline = new Map();
		for (let i = 0; i < CYCLES; i++) {
			cycle(store, baseline, { contain: false });
		}
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
			if (i > 0 && upserts.length > 0) {
				reports += 1;
			}
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
		if (arrow.type !== "arrow" && arrow.type !== "line") {
			throw new Error("wire is not linear");
		}
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
		for (let i = 0; i < 5; i++) {
			cycle(store, baseline, { contain: true });
		}
		assert(
			boundTextsByContainer([...store.values()]).get("svc")?.[0] === seen[0],
			"renaming a label renamed the element carrying it",
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
		write(store, [{ id: "svc", label: { text: "IdentityService" } }]);
		write(store, [{ id: "wire", label: { text: "gRPC" } }]);
		for (let i = 0; i < 5; i++) {
			cycle(store, baseline, { contain: true });
		}
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
		for (let i = 0; i < 5; i++) {
			cycle(store, baseline, { contain: true });
		}
		const before = boundTextsByContainer([...store.values()]);
		const shapeLabel = firstLabel(before, "svc");
		const arrowLabel = firstLabel(before, "wire");
		cycle(store, baseline, {
			contain: true,
			types: { svc: "Ledger", wire: "AMQP" },
		});
		for (let i = 0; i < CYCLES; i++) {
			cycle(store, baseline, { contain: true });
		}
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
