import { expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";

import {
	PANE_LAYOUT_TIMEOUT_MS,
	TEST_BROWSER_COMMAND_TIMEOUT_MS,
} from "../../../src/shared/timing/timing.ts";
import { createJsonRequester } from "../boards/support/http.ts";
import { startOwnedCanvas } from "../support/owned-canvas.ts";
import {
	browserTestRoots,
	canvasTestEnvironment,
	createAgentBrowser,
	pollUntil,
	registerCanvasBase,
} from "./support/agent-browser.ts";
import { READ_PAGE_SCENE_EXPRESSION } from "./support/page-scene.ts";
import { fixedPointElements, humanArrowInput } from "./fixtures/fixed-point-scene.ts";

type ServerFields = {
	createdAt?: string;
	updatedAt?: string;
	syncedAt?: string;
	source?: string;
	syncTimestamp?: string;
	version?: number;
};
type TextFields = Partial<
	Pick<Extract<ExcalidrawElement, { type: "text" }>, "containerId" | "fontFamily" | "fontSize">
>;
type ArrowFields = Partial<
	Pick<Extract<ExcalidrawElement, { type: "arrow" }>, "points" | "startBinding" | "endBinding">
>;
type SceneElement = ExcalidrawElement & ServerFields & TextFields & ArrowFields;
type ElementsBody = { elements?: SceneElement[]; elementCount?: number; source?: string };
type Pane = {
	at?: string;
	board?: string;
	elementCount?: number;
};
type PanesBody = { paneCount?: number; panes?: Pane[] };

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const serverPath = path.join(repoRoot, "src/server.ts");
const ignoredFields = [
	"createdAt",
	"updatedAt",
	"syncedAt",
	"source",
	"syncTimestamp",
	"version",
	"versionNonce",
	"updated",
] as const;
const ignored = new Set<string>(ignoredFields);
const fixedPointBaseline: Record<string, string[]> = {};

function strip(element: SceneElement): Record<string, unknown> {
	return Object.fromEntries(Object.entries(element).filter(([field]) => !ignored.has(field)));
}

function elementName(element: SceneElement): string {
	return element.containerId ? `${element.containerId}:label` : element.id;
}

function changedFields(
	serverElements: readonly SceneElement[],
	pageElements: readonly SceneElement[],
): Record<string, string[]> {
	const pageById = new Map(pageElements.map((element) => [element.id, element]));
	const moved: Record<string, string[]> = {};
	for (const serverElement of serverElements) {
		const pageElement = pageById.get(serverElement.id);
		if (!pageElement) {
			moved[elementName(serverElement)] = ["<gone from the scene>"];
			continue;
		}
		const fields = new Set([...Object.keys(serverElement), ...Object.keys(pageElement)]);
		const changes = [...fields]
			.filter((field) => !ignored.has(field))
			.flatMap((field) => {
				if (!(field in serverElement)) return [`+${field}`];
				if (!(field in pageElement)) return [`-${field}`];
				return JSON.stringify(serverElement[field as keyof SceneElement]) ===
					JSON.stringify(pageElement[field as keyof SceneElement])
					? []
					: [field];
			})
			.toSorted();
		if (changes.length > 0) moved[elementName(serverElement)] = changes;
	}
	for (const pageElement of pageElements) {
		if (!serverElements.some((element) => element.id === pageElement.id)) {
			moved[`${elementName(pageElement)} <invented>`] = ["<not on the server at all>"];
		}
	}
	return moved;
}

async function settledScene(
	browser: Awaited<ReturnType<typeof createAgentBrowser>>,
): Promise<SceneElement[]> {
	let previous = "";
	let repeats = 0;
	return pollUntil(
		() => browser.eval<{ error?: string; elements?: SceneElement[] }>(READ_PAGE_SCENE_EXPRESSION),
		(read) => {
			if (read.error) throw new Error(`Could not read the page scene: ${read.error}`);
			const shot = JSON.stringify((read.elements ?? []).map(strip));
			repeats = shot === previous ? repeats + 1 : 0;
			previous = shot;
			return repeats >= 2;
		},
		"the Excalidraw scene to stop changing",
		{ timeoutMs: TEST_BROWSER_COMMAND_TIMEOUT_MS },
	).then((read) => read.elements ?? []);
}

async function waitForFont(
	browser: Awaited<ReturnType<typeof createAgentBrowser>>,
	probe: { css: string; size: number; text: string; loaded: number },
): Promise<number> {
	const measured = await pollUntil(
		() =>
			browser.eval<{ width: number }>(`(async () => {
        const font = ${JSON.stringify(`${probe.size}px ${probe.css}`)};
        try { await document.fonts.load(font, ${JSON.stringify(probe.text)}); } catch {}
        const context = document.createElement('canvas').getContext('2d');
        context.font = font;
        return { width: context.measureText(${JSON.stringify(probe.text)}).width };
      })()`),
		(value) => Math.abs(value.width - probe.loaded) < 0.05,
		`${probe.css} to measure at its loaded width`,
		{ timeoutMs: TEST_BROWSER_COMMAND_TIMEOUT_MS },
	);
	return measured.width;
}

test(
	"an agent-authored board is an exact Excalidraw document fixed point",
	async () => {
		await using resources = new AsyncDisposableStack();
		const { ownerRoot } = browserTestRoots();
		const vault = path.join(ownerRoot, "vault");
		fs.mkdirSync(vault, { recursive: true });
		const canvas = await startOwnedCanvas({ serverPath, vault, env: canvasTestEnvironment() });
		resources.defer(() => canvas.dispose());
		registerCanvasBase(canvas.base);
		const browser = resources.use(await createAgentBrowser());
		const api = createJsonRequester(canvas);

		await api("/api/boards/new", {
			method: "POST",
			body: { board: "fixedpoint", level: "service" },
		});
		const made = await api<ElementsBody>("/api/elements/batch?board=fixedpoint", {
			method: "POST",
			body: { elements: fixedPointElements },
		});
		expect(made.status).toBe(200); // check-fixed-point.mjs:777
		expect(made.body.elements).toHaveLength(15); // check-fixed-point.mjs:777

		await api("/api/elements/changes?board=fixedpoint", {
			method: "POST",
			body: {
				upserts: [humanArrowInput],
				deletes: [],
				clientId: "fixed-point-person",
			},
		});
		await api("/api/elements/human-node?board=fixedpoint", {
			method: "PUT",
			body: { x: 1000, y: 1000 },
		});

		type BridgeBody = ElementsBody & { bridgeId?: string };
		const bridge = await api<BridgeBody>("/api/bridges?board=fixedpoint", {
			method: "POST",
			body: { over: "line1", under: "bridge-under", background: "#ffffff" },
		});
		expect(bridge.status).toBe(200); // check-fixed-point.mjs:834
		expect(bridge.body.elements).toHaveLength(2); // check-fixed-point.mjs:834
		const [mask, redraw] = bridge.body.elements ?? [];
		expect(mask?.id).toBe(bridge.body.bridgeId); // check-fixed-point.mjs:834
		expect(mask?.customData?.archboard?.bridge?.role).toBe("mask"); // check-fixed-point.mjs:834
		expect(redraw?.customData?.archboard?.bridge?.role).toBe("redraw"); // check-fixed-point.mjs:834
		expect(mask?.strokeColor).toBe("#ffffff");
		expect(mask?.strokeWidth).toBe((redraw?.strokeWidth ?? 0) + 4);
		expect(mask?.strokeStyle).toBe("solid");
		expect(mask?.roughness).toBe(0);
		expect(mask?.opacity).toBe(100);
		const bridged = (await api<ElementsBody>("/api/elements?board=fixedpoint")).body.elements ?? [];
		const sourceLine = bridged.find((element) => element.id === "line1");
		expect(redraw?.strokeColor).toBe(sourceLine?.strokeColor);
		expect(redraw?.strokeWidth).toBe(sourceLine?.strokeWidth);
		expect(redraw?.strokeStyle).toBe(sourceLine?.strokeStyle);
		expect(redraw?.roughness).toBe(sourceLine?.roughness);
		expect(redraw?.opacity).toBe(sourceLine?.opacity);
		expect(
			typeof sourceLine?.index === "string" &&
				typeof mask?.index === "string" &&
				typeof redraw?.index === "string" &&
				sourceLine.index < mask.index &&
				mask.index < redraw.index,
		).toBe(true);

		const saved = await api<{ file?: string }>("/api/boards/save", {
			method: "POST",
			body: { board: "fixedpoint" },
		});
		expect(saved.status).toBe(200); // check-fixed-point.mjs:847
		expect(fs.existsSync(saved.body.file ?? "")).toBe(true); // check-fixed-point.mjs:847

		await browser.run(["open", canvas.base]); // check-fixed-point.mjs:977
		const userAgent = await browser.eval<string>("navigator.userAgent");
		expect(userAgent).toMatch(/headless/i); // check-fixed-point.mjs:988
		const registered = await pollUntil(
			() => api<PanesBody>("/api/panes").then((response) => response.body),
			(panes) => (panes.paneCount ?? 0) >= 1,
			"the browser pane to register",
			{ timeoutMs: PANE_LAYOUT_TIMEOUT_MS },
		);
		expect(registered.paneCount).toBe(1); // check-fixed-point.mjs:994

		const written = (await api<ElementsBody>("/api/elements?board=fixedpoint")).body.elements ?? [];
		const families = new Set(
			written
				.filter((element) => element.type === "text")
				.map((element) => element.fontFamily ?? 1),
		);
		const fontProbes: Record<
			number,
			{ css: string; size: number; text: string; loaded: number; fallback: number }
		> = {
			1: { css: "Virgil", size: 16, text: "AuthService", loaded: 90.54, fallback: 79.98 },
			5: { css: "Excalifont", size: 20, text: "AuthService", loaded: 114.4999, fallback: 99.97 },
		};
		for (const family of families) {
			const probe = fontProbes[Number(family)] ?? null;
			expect(probe).not.toBeNull(); // check-fixed-point.mjs:345
			if (!probe) continue;
			const width = await waitForFont(browser, probe);
			expect(Math.abs(width - probe.loaded)).toBeLessThan(0.05); // check-fixed-point.mjs:358
			expect(Math.abs(width - probe.fallback)).toBeGreaterThan(10);
		}

		const opened = await api<ElementsBody>("/api/boards/open", {
			method: "POST",
			body: { board: "fixedpoint", reload: true },
		});
		expect(opened.status).toBe(200); // check-fixed-point.mjs:1193
		expect(opened.body.source).toBe("vault"); // check-fixed-point.mjs:1193
		expect(opened.body.elementCount).toBe(18); // check-fixed-point.mjs:1193

		const rendered = await settledScene(browser);
		const held = (await api<ElementsBody>("/api/elements?board=fixedpoint")).body.elements ?? [];
		expect(rendered).toHaveLength(held.length); // check-fixed-point.mjs:1314
		const authService = rendered.find(
			(element) => element.type === "text" && element.text === "AuthService",
		);
		const authServiceWidths: Record<string, number> = {
			"1@16": 90.5442,
			"5@20": 114.4999,
		};
		const expectedAuthWidth =
			authServiceWidths[`${authService?.fontFamily}@${authService?.fontSize}`];
		expect(expectedAuthWidth).toBeDefined(); // check-fixed-point.mjs:1327
		expect(Math.abs((authService?.width ?? Number.NaN) - expectedAuthWidth!)).toBeLessThan(0.05); // check-fixed-point.mjs:1327

		const moved = changedFields(held, rendered);
		expect(Object.keys(moved)).toHaveLength(Object.keys(fixedPointBaseline).length); // check-fixed-point.mjs:1344
		const newlyMoving = Object.keys(moved).filter((name) => !(name in fixedPointBaseline));
		const noLongerMoving = Object.keys(fixedPointBaseline).filter((name) => !(name in moved));
		expect(newlyMoving).toEqual([]); // check-fixed-point.mjs:1351
		expect(noLongerMoving).toEqual([]); // check-fixed-point.mjs:1351
		for (const serverElement of held) {
			expect(strip(rendered.find((element) => element.id === serverElement.id)!)).toEqual(
				strip(serverElement),
			);
		}
		const negativePath = held.find((element) => element.id === "negative-path");
		if (negativePath?.type !== "arrow") throw new Error("negative path is not an arrow");
		expect(negativePath.points.map(([x, y]) => [x, y])).toEqual([
			[0, 0],
			[-120, -90],
		]);
		const boundArrow = held.find((element) => element.id === "arr1");
		if (boundArrow?.type !== "arrow") throw new Error("bound arrow is not an arrow");
		const rect = held.find((element) => element.id === "rect1")!;
		expect(rect.x).toBe(100);
		expect(rect.y).toBe(100);
		expect(rect.width).toBe(220);
		expect(rect.height).toBe(90);
		expect(boundArrow?.x).toBe(324);
		expect(boundArrow?.y).toBe(145);
		expect(boundArrow.points.map(([x, y]) => [x, y])).toEqual([
			[0, 0],
			[91.99999999999989, 0],
		]);
		expect(boundArrow.startBinding?.elementId).toBe("rect1");
		expect(boundArrow.endBinding?.elementId).toBe("ell1");

		const text = held.find((element) => element.id === "text1")!;
		await api("/api/elements/changes?board=fixedpoint", {
			method: "POST",
			body: {
				upserts: [{ ...text, index: rect.index }],
				deletes: [],
				clientId: "check-fixed-point",
			},
		});
		const afterPlant = await settledScene(browser);
		const plantedServer =
			(await api<ElementsBody>("/api/elements?board=fixedpoint")).body.elements ?? [];
		expect(changedFields(plantedServer, afterPlant).text1).toContain("index"); // check-fixed-point.mjs:1923

		expect(ignoredFields).toEqual([
			"createdAt",
			"updatedAt",
			"syncedAt",
			"source",
			"syncTimestamp",
			"version",
			"versionNonce",
			"updated",
		]); // check-fixed-point.mjs:2107
		const frontendSource = fs.readFileSync(
			path.join(repoRoot, "src/ui/canvas/elements.ts"),
			"utf8",
		);
		const destructured =
			frontendSource.match(
				/cleanElementForExcalidraw[\s\S]*?const\s*\{([^}]*)\}\s*=\s*element/,
			)?.[1] ?? "";
		const strippedByFrontend = destructured
			.split(",")
			.map((part) => part.trim().split(":")[0]?.trim())
			.filter((field): field is string => Boolean(field?.match(/^[a-zA-Z]+$/)));
		expect(strippedByFrontend.length).toBeGreaterThan(0); // check-fixed-point.mjs:2122
		expect(strippedByFrontend.every((field) => ignored.has(field))).toBe(true); // check-fixed-point.mjs:2122
	},
	TEST_BROWSER_COMMAND_TIMEOUT_MS,
);
