import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";
import { expect, test } from "bun:test";
import type { DiagramBox } from "@archboard/board/render-reply";
import type { DiagramGrammar } from "@archboard/board/views";
import { renderSemanticView } from "#runtime/operations/render.ts";
import { type RenderedDiagram } from "#shared/protocol/render-request.ts";
import { drawnSpan, drawnTexts, spanFits } from "#tests/runtime/support/drawn-text.ts";
import { DEFAULT_SEMANTIC_POLICY } from "@archboard/board/policy";

const content = orderedFixture({
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

for (const grammar of ["architecture", "sequence"] satisfies DiagramGrammar[]) {
	test(`${grammar} preserves explicit and wrapped responsibility lines within measured cards`, async () => {
		const rendered = await renderSemanticView({
			policy: DEFAULT_SEMANTIC_POLICY,
			grammar,
			content,
			theme: "light",
		});
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
				expect(spanFits(drawnSpan(run), box)).toBe(true);
				expect(run.y - run.size).toBeGreaterThanOrEqual(box.y);
				expect(run.y + run.size * 0.3).toBeLessThan(box.y + box.height);
				if (index > 0) {
					const previous = runs[index - 1]!;
					expect(run.y - run.size).toBeGreaterThan(previous.y);
				}
			}
			if (grammar === "sequence") {
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
			policy: DEFAULT_SEMANTIC_POLICY,
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
		expect(notes.map((run) => run.text).join("")).toBe(responsibility);
		for (const run of notes) {
			expect(spanFits(drawnSpan(run), box)).toBe(true);
			expect(run.y + run.size * 0.3).toBeLessThan(box.y + box.height);
		}
	});
}

for (const grammar of ["architecture", "sequence"] satisfies DiagramGrammar[])
	test(`${grammar}, seen from far away, draws each card's name larger, with the start of what it is responsible for`, async () => {
		const rendered = await renderSemanticView({
			policy: DEFAULT_SEMANTIC_POLICY,
			grammar,
			content,
			theme: "light",
		});
		const near = drawnTexts(rendered.svg);
		const far = drawnTexts(rendered.svg, "far");
		for (const id of ["api", "store"]) {
			const node = content.nodes.find((candidate) => candidate.id === id)!;
			const box = cardBox(rendered, id);
			const title = near.find((run) => run.subject.id === id && run.weight !== 400)!;
			const runs = far.filter((run) => run.subject.id === id);
			const names = runs.filter((run) => run.weight !== 400);
			expect(names.map((run) => run.text).join(" ")).toBe(node.name);
			for (const run of names) expect(run.size).toBeGreaterThan(title.size);
			// What it says of its responsibility is the start of it, cut short where the card is out of room.
			const gist = runs
				.filter((run) => run.weight === 400)
				.map((run) => run.text)
				.join(" ")
				.replace(/…$/u, "");
			expect(node.responsibility!.replace(/\s+/gu, " ")).toStartWith(gist);
			if (grammar === "architecture") expect(gist).not.toBe("");
			for (const run of runs) {
				expect(spanFits(drawnSpan(run), box)).toBe(true);
				expect(run.y + run.size * 0.3).toBeLessThan(box.y + box.height);
			}
		}
		if (grammar === "sequence") return;
		// A container's header reads as a card does, its name and the start of what
		// it is responsible for, and stays in its header, above what it holds.
		const header = far.filter((run) => run.subject.id === "system");
		const system = content.nodes.find((candidate) => candidate.id === "system")!;
		expect(
			header
				.filter((run) => run.weight !== 400)
				.map((run) => run.text)
				.join(" "),
		).toBe("Board service");
		const said = header
			.filter((run) => run.weight === 400)
			.map((run) => run.text)
			.join(" ")
			.replace(/…$/u, "");
		expect((system.responsibility ?? "").replace(/\s+/gu, " ")).toStartWith(said);
		expect(header.at(-1)!.y).toBeLessThan(rendered.atlas.nodes["api"]!.y);
	});
