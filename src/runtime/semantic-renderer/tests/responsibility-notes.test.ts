import { expect, test } from "bun:test";
import {
	VariantContentSchema,
	type DiagramBox,
	type DiagramGrammar,
} from "@/shared/semantic-board/index";
import { renderSemanticView, type RenderedDiagram } from "@/runtime/semantic-renderer/index";
import {
	drawnSpan,
	drawnTexts,
	registeredFaces,
	spanFits,
} from "@/runtime/semantic-renderer/tests/drawn-text";

const content = VariantContentSchema.parse({
	nodes: [
		{
			id: "system",
			name: "Board service",
			kind: "service",
			responsibility:
				"Accepts authored meaning.\nCoordinates rendering.\nKeeps revisions together.",
		},
		{
			id: "api",
			name: "API",
			kind: "service",
			parent: "system",
			responsibility: "Accepts board changes.\nChecks the writer.\nSaves every accepted edit.",
		},
		{
			id: "store",
			name: "Board storage",
			kind: "datastore",
			parent: "system",
			responsibility:
				"Keeps the complete board and its proposals together, writes every accepted revision to disk before answering, and preserves every word an agent authored for readers to understand the system.",
		},
	],
	edges: [{ id: "write", from: "api", to: "store", kind: "data", label: "write revision" }],
	flows: [
		{
			id: "save",
			name: "Save a board",
			participants: ["api", "store"],
			steps: [{ id: "saveit", from: "api", to: "store", kind: "sync", label: "persist" }],
		},
	],
});

/**
 * Read the painted card's height: a sequence atlas node includes its lifeline.
 * @param rendered The public rendering result.
 * @param id The node whose card is inspected.
 * @returns The painted body bounds, in atlas coordinates.
 */
function cardBox(rendered: RenderedDiagram, id: string): DiagramBox {
	const chunk = rendered.svg
		.split(/(?=<g data-semantic-kind=)/u)
		.find((group) =>
			group.startsWith(
				`<g data-semantic-kind="node" data-semantic-id="${id}" data-depiction="card"`,
			),
		);
	expect(chunk).toBeDefined();
	const body = [...chunk!.matchAll(/<rect([^>]*)\/>/gu)][1]?.[1];
	expect(body).toBeDefined();
	const height = Number(/\sheight="([^"]+)"/u.exec(body!)?.[1]);
	expect(Number.isFinite(height)).toBe(true);
	return { ...rendered.atlas.nodes[id]!, height };
}

for (const grammar of ["architecture", "data-flow"] satisfies DiagramGrammar[]) {
	test(`${grammar} preserves explicit and wrapped responsibility lines within measured cards`, async () => {
		const rendered = await renderSemanticView({ grammar, content, theme: "light" });
		const faces = registeredFaces(rendered.svg);
		const texts = drawnTexts(rendered.svg);
		for (const id of ["api", "store"]) {
			const node = content.nodes.find((candidate) => candidate.id === id)!;
			const box = cardBox(rendered, id);
			const runs = texts.filter((drawn) => drawn.subject.id === id);
			const notes = runs.filter((run) => run.weight === 400);
			expect(notes.length).toBeGreaterThanOrEqual(3);
			expect(
				notes
					.map((run) => run.text)
					.join("")
					.replaceAll(/\s/gu, ""),
			).toBe(node.responsibility!.replaceAll(/\s/gu, ""));
			if (id === "api") {
				expect(notes.map((run) => run.text)).toEqual(node.responsibility!.split("\n"));
			} else {
				expect(notes.length).toBeGreaterThan(3);
			}
			for (const [index, run] of runs.entries()) {
				expect(spanFits(drawnSpan(run, faces), box)).toBe(true);
				expect(run.y - run.size).toBeGreaterThanOrEqual(box.y);
				expect(run.y + run.size * 0.3).toBeLessThan(box.y + box.height);
				if (index > 0) {
					const previous = runs[index - 1]!;
					expect(run.y - run.size).toBeGreaterThan(previous.y);
				}
			}
			if (grammar === "data-flow") {
				expect(rendered.atlas.edges["saveit"]!.y).toBeGreaterThan(box.y + box.height);
			}
		}
		if (grammar === "architecture") {
			const header = texts.filter((drawn) => drawn.subject.id === "system");
			const notes = header.filter((run) => run.weight === 400);
			expect(notes.map((run) => run.text)).toEqual(content.nodes[0]!.responsibility!.split("\n"));
			for (const child of ["api", "store"]) {
				expect(notes.at(-1)!.y + notes.at(-1)!.size * 0.3).toBeLessThan(
					rendered.atlas.nodes[child]!.y,
				);
			}
		}
	});

	test(`${grammar} keeps an unbroken responsibility token inside its card`, async () => {
		const responsibility = "W".repeat(200);
		const updatedApi = { ...content.nodes.find((node) => node.id === "api")!, responsibility };
		const rendered = await renderSemanticView({
			grammar,
			theme: "light",
			content: {
				...content,
				nodes: content.nodes.map((node) => (node.id === "api" ? updatedApi : node)),
			},
		});
		const notes = drawnTexts(rendered.svg).filter(
			(run) => run.subject.id === "api" && run.weight === 400,
		);
		const box = cardBox(rendered, "api");
		const faces = registeredFaces(rendered.svg);
		expect(notes.map((run) => run.text).join("")).toBe(responsibility);
		for (const run of notes) {
			expect(spanFits(drawnSpan(run, faces), box)).toBe(true);
			expect(run.y + run.size * 0.3).toBeLessThan(box.y + box.height);
		}
	});
}
