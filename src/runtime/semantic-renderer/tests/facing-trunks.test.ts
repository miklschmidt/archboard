import { expect, test } from "bun:test";
import { renderArchitecture } from "@/runtime/semantic-renderer/index";
import { orderedFixture } from "@/runtime/semantic-renderer/tests/ordered-fixture";
import { overdrawnRun } from "@/runtime/semantic-renderer/tests/drawn-ink";
import fixture from "./facing-trunks.json";

test.each(["http", "data"])(
	"Blocks keeps opposing traffic separate between facing ports (%s)",
	async (kind) => {
		const content = orderedFixture(fixture);
		content.edges.find((edge) => edge.id === "PRXBb3Zi")!.kind = kind;
		const drawing = await renderArchitecture({ content, theme: "light", layout: "blocks" });
		expect(overdrawnRun(drawing, ["lsOwWQvq", "PRXBb3Zi"])).toBe(0);
	},
);
