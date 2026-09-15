import { expect, test } from "bun:test";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

import { measureLineIn } from "@/runtime/engine/measure-text";
import { createJsonRequester } from "../support/http.ts";
import { startOwnedCanvas } from "../support/owned-canvas.ts";
import {
	browserTestRoots,
	canvasTestEnvironment,
	createAgentBrowser,
	pollUntil,
	registerCanvasBase,
} from "./support/agent-browser.ts";
import { addressShowing, seedSemanticBoard, stageState } from "./support/semantic-page.ts";
import { serverPath } from "./support/navigator-support.ts";
import { assertThemeParity } from "./support/theme-parity.ts";

// Text width is measured, not estimated — checked against the only ruler that
// is not the one that did the measuring.
//
// The server decides how big every card is before any browser sees the picture,
// reading the font files in the repository (src/runtime/engine/measure-text.ts).
// Everything else that checks this measures with that same engine, so it proves
// the renderer and the measurer agree and would go on agreeing if both were
// wrong. This puts the strings in a real Chrome, in the faces the picture
// registers, asks Chrome what they came out as, and holds the engine to it.
//
// The strings are chosen to punish an estimate rather than to look plausible:
// AV, To and Wa kern tightly, ffi and fl are ligatures, and i against W is the
// whole advance range. A per-character estimate got "AuthService" wrong by 76 px
// — which is how this invariant was found in the first place.

/** Short on purpose: one load, one measurement pass. */
const WAIT = { timeoutMs: 8_000 } as const;

/**
 * How far the two rulers may differ, as a fraction of the width.
 *
 * Not zero, and the reason is worth stating: Chrome reports a laid-out run in
 * 64ths of a pixel, and on a handful of kerning pairs the two tables resolve a
 * hair apart — the widest disagreement measured here is 0.8% on a string of
 * nothing but tight pairs ("To Vary AWAY Toward"). One percent leaves that
 * alone and still catches what this exists to catch by a factor of twenty: the
 * per-character estimate this invariant replaced was 40% wrong on "AuthService".
 */
const TOLERANCE = 0.01;

/** Where the faces the picture registers actually live. */
const FONT_DIR = resolve(import.meta.dir, "../../../src/ui/shell/assets/fonts");

/** The strings the two rulers are compared on. */
const LINES = [
	"AVAST Waterfall Office",
	"To Vary AWAY Toward",
	"difficult affix office",
	"iiiiiiiiiiiiiiiiiiii",
	"WWWWWWWWWWWWWWWW",
	"AuthService",
	"gRPC · queue · 12ms",
] as const;

/** The sizes a diagram sets text at, and one either side of them. */
const SIZES = [9.5, 13, 20] as const;

/** One face the picture registers, as the document declares it. */
interface Face {
	readonly family: string;
	readonly weight: number;
	readonly file: string;
}

/** What Chrome made of one string in one face at one size. */
interface Drawn {
	readonly face: number;
	readonly size: number;
	readonly text: string;
	readonly width: number;
}

/**
 * Read the `@font-face` rules out of the drawn picture, so the comparison is
 * against the faces the server actually registered rather than a list repeated
 * here that could drift from them.
 * @returns The expression that collects them in the page.
 */
const FACES = `(() => {
	const style = document.querySelector("[data-slot='semantic-board-surface'] svg style");
	const rules = style === null ? "" : style.textContent;
	const faces = [];
	for (const rule of rules.matchAll(/@font-face\\{([^}]*)\\}/g)) {
		const body = rule[1];
		const family = /font-family:"([^"]+)"/.exec(body);
		const weight = /font-weight:(\\d+)/.exec(body);
		const file = /url\\("[^"]*\\/([^"\\/]+)"\\)/.exec(body);
		if (family && weight && file) {
			faces.push({ family: family[1], weight: Number(weight[1]), file: file[1] });
		}
	}
	return faces;
})()`;

/**
 * Lay every string out in every face at every size and ask Chrome how wide each
 * came out. One hidden SVG, removed afterwards, so the picture is untouched.
 * @param faces The faces to draw in.
 * @returns The expression that measures them in the page.
 */
const measureIn = (faces: readonly Face[]): string => `(async () => {
	const faces = ${JSON.stringify(faces)};
	// A declared face is not a loaded one: a browser fetches a face when
	// something is set in it, and a picture that happens not to use one leaves
	// it undownloaded. Measuring then would measure the fallback, which is a
	// different font and would disagree with the engine for a reason that has
	// nothing to do with the engine.
	await Promise.all(
		faces.map((face) => document.fonts.load(face.weight + ' 20px "' + face.family + '"')),
	);
	await document.fonts.ready;
	const lines = ${JSON.stringify(LINES)};
	const sizes = ${JSON.stringify(SIZES)};
	const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
	svg.setAttribute("style", "position:absolute;left:-9999px;top:0;width:1px;height:1px");
	document.body.append(svg);
	const drawn = [];
	try {
		for (const [index, face] of faces.entries()) {
			for (const size of sizes) {
				for (const text of lines) {
					const node = document.createElementNS("http://www.w3.org/2000/svg", "text");
					node.setAttribute("font-family", '"' + face.family + '"');
					node.setAttribute("font-weight", String(face.weight));
					node.setAttribute("font-size", String(size));
					node.setAttribute("xml:space", "preserve");
					node.textContent = text;
					svg.append(node);
					drawn.push({ face: index, size, text, width: node.getComputedTextLength() });
				}
			}
		}
	} finally {
		svg.remove();
	}
	return drawn;
})()`;

test("the server's text measurement is what a real browser draws", async () => {
	await using resources = new AsyncDisposableStack();
	const { ownerRoot } = browserTestRoots();
	const vault = join(ownerRoot, "measured-vault");
	mkdirSync(vault, { recursive: true });
	const canvas = await startOwnedCanvas({ serverPath, vault, env: canvasTestEnvironment() });
	resources.defer(() => canvas.dispose());
	registerCanvasBase(canvas.base);
	const request = createJsonRequester(canvas);
	await seedSemanticBoard(request, "typography");

	const browser = resources.use(await createAgentBrowser());
	await browser.run(["open", addressShowing(canvas.base, "typography")]);
	await browser.run(["set", "viewport", "1920", "1080"]);
	await pollUntil(
		() => stageState(browser.eval.bind(browser)),
		(state) => state === "drawn",
		"the board to be drawn, which is what registers the faces",
		WAIT,
	);

	// The faces the picture itself declares, and they have to be loaded: a
	// comparison against a fallback face would agree with nothing and pass.
	const faces = await pollUntil(
		() => browser.eval<Face[]>(FACES),
		(found) => found.length >= 2,
		"the picture to register the faces it is drawn in",
		WAIT,
	);
	await pollUntil(
		() => browser.eval<number>("document.fonts.size"),
		(loaded) => loaded >= faces.length,
		"the diagram faces to be loaded in the page",
		WAIT,
	);

	const drawn = await browser.eval<Drawn[]>(measureIn(faces));
	expect(drawn.length).toBe(faces.length * SIZES.length * LINES.length);

	// The engine, held to what Chrome did, within Chrome's own reporting step.
	const disagreements = drawn
		.map((one) => {
			const file = join(FONT_DIR, faces[one.face]!.file);
			const measured = measureLineIn(one.text, one.size, [[{ file, ranges: null }]]);
			return { ...one, measured: measured.width, missing: measured.missing };
		})
		.filter(
			(one) => one.missing.length > 0 || Math.abs(one.measured - one.width) > one.width * TOLERANCE,
		);
	expect(disagreements).toEqual([]);
	// And Chrome really drew something: zero widths would agree with an engine
	// that also returned zero.
	expect(drawn.every((one) => one.width > 0)).toBeTrue();
	await assertThemeParity(browser);

	await canvas.assertRunning();
}, 40_000);
