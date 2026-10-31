// Parent headers use normal card sizing in both engines and every theme (TASK-548.11).
import { expect, test } from "bun:test";
import { LayoutEngineSchema } from "@archboard/board/render-reply";
import { renderArchitecture } from "#runtime/operations/render.ts";
import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";
import { drawnTexts } from "#tests/runtime/support/drawn-text.ts";
import { headerCards } from "#tests/runtime/support/drawn-parents.ts";
import { expectDrawingIntact } from "#tests/runtime/support/drawing-integrity.ts";
import { DEFAULT_SEMANTIC_POLICY } from "@archboard/board/policy";

const RESPONSIBILITY =
	"Loads the retained state and reopens the same hardware key, renews with a fresh proof of that key when a renewal is due, and saves the outcome without any identity rollback.";

const content = orderedFixture({
	nodes: [
		{ id: "caller", name: "Caller", kind: "module" },
		{ id: "plan", name: "Durable access", kind: "service", responsibility: RESPONSIBILITY },
		{ id: "plain", name: "Durable access", kind: "service", responsibility: RESPONSIBILITY },
		...["Load", "Open", "Renew", "Serve"].map((name) => ({
			id: name.toLowerCase(),
			name: `${name} the certificate`,
			kind: "module",
			parent: "plan",
		})),
	],
	edges: [
		{ id: "parent", from: "caller", to: "plan", kind: "call" },
		{ id: "member", from: "caller", to: "serve", kind: "call" },
		{ id: "leaving", from: "plan", to: "plain", kind: "call" },
	],
});

/**
 * The icon size written into a subject's SVG.
 * @param svg The rendered document.
 * @param id The semantic subject.
 * @returns The visible icon's width.
 */
function iconSize(svg: string, id: string): number {
	const own = svg
		.split(/(?=<g[^>]*data-semantic-kind=)/u)
		.filter((chunk) => chunk.slice(0, chunk.indexOf(">") + 1).includes(`data-semantic-id="${id}"`))
		.join("");
	return Number(/<svg [^>]*width="([\d.]+)"/u.exec(own)?.[1]);
}

for (const layout of LayoutEngineSchema.options) {
	for (const theme of ["light", "dark", undefined] as const) {
		test(`a compact parent keeps its text and visible line ends (${layout}, ${theme ?? "page"})`, async () => {
			const drawing = await renderArchitecture({
				policy: DEFAULT_SEMANTIC_POLICY,
				content,
				theme,
				layout,
			});
			const frame = drawing.atlas.nodes["plan"]!;
			const header = headerCards(drawing).get("plan")!;
			expect(header.width).toBeLessThan(frame.width);
			const texts = drawnTexts(drawing.svg);
			// The tab holds one line, and the file keeps what the frame is for as its title.
			expect(texts.filter(({ subject, size }) => subject.id === "plan" && size === 11)).toEqual([]);
			expect(drawing.svg).toContain(`<title>${RESPONSIBILITY}</title>`);
			const name = (id: string) =>
				texts.find((run) => run.subject.id === id && run.text === "Durable access")!;
			expect(name("plan").size).toBeGreaterThan(name("plain").size);
			expect(iconSize(drawing.svg, "plan")).toBeGreaterThan(iconSize(drawing.svg, "plain"));
			expectDrawingIntact(drawing, content, layout);
		});
	}
}
