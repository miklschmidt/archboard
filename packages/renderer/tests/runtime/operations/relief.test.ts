import { expect, test } from "bun:test";
import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";
import { renderArchitecture } from "#runtime/operations/render.ts";
import { DEFAULT_SEMANTIC_POLICY } from "@archboard/model/policy";

const content = orderedFixture({
	nodes: ["a", "b"].map((id) => ({ id, name: id, kind: "module" })),
	edges: [{ id: "ab", from: "a", to: "b", kind: "call" }],
});
const request = { policy: DEFAULT_SEMANTIC_POLICY, content, layout: "blocks" as const };

test("a flat relief changes how blocks are painted and never where they stand", async () => {
	const raised = await renderArchitecture(request);
	const flat = await renderArchitecture({ ...request, relief: "flat" });
	expect(flat.svg).not.toEqual(raised.svg);
	expect(flat.atlas).toEqual(raised.atlas);
	expect(flat.width).toEqual(raised.width);
	expect(flat.height).toEqual(raised.height);
});

test("a slab relief is the default drawing", async () => {
	const plain = await renderArchitecture(request);
	const slab = await renderArchitecture({ ...request, relief: "slab" });
	expect(slab.svg).toEqual(plain.svg);
});
