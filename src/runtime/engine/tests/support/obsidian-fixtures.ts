export type TestElement = Record<string, unknown> & { id: string; type: string };

export const rectangle: TestElement = {
	id: "rect-one",
	type: "rectangle",
	x: 10,
	y: 20,
	width: 100,
	height: 50,
	customData: { archboard: { node: "probe", kind: "service" } },
};

export const text: TestElement = {
	id: "text-one",
	type: "text",
	x: 10,
	y: 20,
	width: 100,
	height: 25,
	text: "AuthService",
	originalText: "AuthService",
};

export const impostorText: TestElement = {
	id: "text-two",
	type: "text",
	x: 0,
	y: 0,
	width: 100,
	height: 25,
	text: "# Excalidraw Data\n## Text Elements",
	originalText: "# Excalidraw Data\n## Text Elements",
};

export const imageElement: TestElement = {
	id: "img-one",
	type: "image",
	x: 300,
	y: 0,
	width: 80,
	height: 80,
	fileId: "abc12345",
};

export function scene(elements: TestElement[] = []): Record<string, unknown> {
	return {
		type: "excalidraw",
		version: 2,
		source: "archboard-check",
		elements,
		appState: { viewBackgroundColor: "#ffffff" },
		files: {},
	};
}

export const board = scene([rectangle, text]);

export const FRESH_NOTE = `---

excalidraw-plugin: parsed
tags: [excalidraw]

---
==⚠  Switch to EXCALIDRAW VIEW in the MORE OPTIONS menu of this document. ⚠==


# Excalidraw Data
## Text Elements
AuthService ^text-one

%%
## Drawing
\`\`\`json
{
\t"type": "excalidraw",
\t"appState": {
\t\t"viewBackgroundColor": "#ffffff"
\t},
\t"elements": [
\t\t{
\t\t\t"id": "rect-one",
\t\t\t"type": "rectangle",
\t\t\t"x": 10,
\t\t\t"y": 20,
\t\t\t"width": 100,
\t\t\t"height": 50,
\t\t\t"customData": {
\t\t\t\t"archboard": {
\t\t\t\t\t"kind": "service",
\t\t\t\t\t"node": "probe"
\t\t\t\t}
\t\t\t}
\t\t},
\t\t{
\t\t\t"id": "text-one",
\t\t\t"type": "text",
\t\t\t"x": 10,
\t\t\t"y": 20,
\t\t\t"width": 100,
\t\t\t"height": 25,
\t\t\t"originalText": "AuthService",
\t\t\t"rawText": "AuthService",
\t\t\t"text": "AuthService"
\t\t}
\t],
\t"files": {},
\t"source": "archboard-check",
\t"version": 2
}
\`\`\`
%%`;

export const PROSE =
	"## Why this shape\n\nWe split payments out because billing kept blocking on it.\n";
export const TAIL = "\n\n## Follow-ups\n\nThe queue box is a guess.\n";
export const QUOTED_HEADINGS = [
	"## Note format",
	"",
	"A drawing note looks like this:",
	"",
	"````markdown",
	"# Excalidraw Data",
	"## Text Elements",
	"Label ^abc12345",
	"````",
	"",
	"Everything below `# Excalidraw Data` belongs to the plugin.",
	"",
].join("\n");

export const EMBEDDED_FILES = [
	"## Embedded Files",
	"abc12345: [[attachments/diagram.png]]",
	"",
	"def45678: https://example.com/logo.svg",
	"",
	"gh789012: $$\\int_0^1 x^2$$",
	"",
	"",
].join("\n");

export const ELEMENT_LINKS = "## Element Links\nrect-one: [[Payments]]\n\n";

export function insertBeforeDrawing(note: string, sections: string): string {
	const marker = "\n%%\n## Drawing\n";
	const at = note.indexOf(marker);
	if (at < 0) throw new Error("Fixture note has no Drawing block");
	return `${note.slice(0, at)}\n${sections}${note.slice(at + 1)}`;
}
