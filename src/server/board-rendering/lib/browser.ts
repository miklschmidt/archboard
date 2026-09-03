import { exportToBlob, exportToSvg } from "@excalidraw/excalidraw";
import type { ExcalidrawFrameLikeElement } from "@excalidraw/excalidraw/element/types";
import { parseMermaidToExcalidraw } from "@excalidraw/mermaid-to-excalidraw";

import type {
	BoardRenderJob,
	BoardRenderOutput,
	BoardRenderSpec,
	BoardRendererJob,
	BoardRendererJobResult,
} from "./contract";

const state = { phase: "ready", active: false, jobs: 0 };

const fontNames = new Map<number, string>([
	[1, "Virgil"],
	[2, "Helvetica"],
	[3, "Cascadia"],
	[4, "Assistant"],
	[5, "Excalifont"],
	[6, "Nunito"],
	[7, "Lilita One"],
	[8, "Comic Shanns"],
	[9, "Liberation Sans"],
]);

class RenderInputError extends Error {}

async function requireFonts(job: BoardRenderJob): Promise<void> {
	const wanted = new Map<number, number>();
	for (const element of job.snapshot.elements) {
		if (element.type !== "text") continue;
		const family = Number(element.fontFamily);
		const size = Number(element.fontSize);
		if (!fontNames.has(family))
			throw new RenderInputError(
				`Board render cannot resolve font family ${String(element.fontFamily)}.`,
			);
		if (!Number.isFinite(size) || size <= 0)
			throw new RenderInputError(
				`Board render cannot resolve font size ${String(element.fontSize)}.`,
			);
		wanted.set(family, size);
	}
	for (const [family, size] of wanted) {
		const name = fontNames.get(family)!;
		await document.fonts.load(`${size}px "${name}"`);
		if (!document.fonts.check(`${size}px "${name}"`))
			throw new RenderInputError(`Board render could not load required font "${name}".`);
	}
}

function requireEmbeddedFiles(job: BoardRenderJob): void {
	for (const element of job.snapshot.elements) {
		if (element.type !== "image" || element.isDeleted) continue;
		const id = element.fileId;
		if (!id || !job.snapshot.files[id]?.dataURL)
			throw new RenderInputError(`Board render is missing embedded file "${id ?? "unknown"}".`);
	}
}

function findingFrame(
	spec: Extract<BoardRenderSpec, { kind: "focus" }>,
): ExcalidrawFrameLikeElement {
	return {
		id: `finding-${spec.id}`,
		type: "frame",
		x: spec.frame.x,
		y: spec.frame.y,
		width: spec.frame.width,
		height: spec.frame.height,
		angle: 0,
		strokeColor: "transparent",
		backgroundColor: "transparent",
		fillStyle: "solid",
		strokeWidth: 1,
		strokeStyle: "solid",
		roughness: 0,
		opacity: 100,
		roundness: null,
		seed: 1,
		version: 1,
		versionNonce: 1,
		index: null,
		isDeleted: false,
		groupIds: [],
		frameId: null,
		boundElements: null,
		updated: 1,
		link: null,
		locked: true,
		name: null,
	};
}

async function pngBase64(blob: Blob): Promise<{ data: string; width: number; height: number }> {
	const bytes = new Uint8Array(await blob.arrayBuffer());
	let binary = "";
	for (let offset = 0; offset < bytes.length; offset += 0x8000)
		binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
	const bitmap = await createImageBitmap(blob);
	return { data: btoa(binary), width: bitmap.width, height: bitmap.height };
}

function svgSize(svg: SVGSVGElement): { width: number; height: number } {
	const width = Number.parseFloat(svg.getAttribute("width") ?? "");
	const height = Number.parseFloat(svg.getAttribute("height") ?? "");
	if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0)
		throw new Error("Board render returned an SVG without finite positive dimensions.");
	return { width, height };
}

async function renderOutput(
	job: BoardRenderJob,
	spec: BoardRenderSpec,
): Promise<BoardRenderOutput> {
	const appState = {
		...job.snapshot.appState,
		exportBackground: spec.background,
		exportScale: spec.scale,
	};
	const focused = spec.kind === "focus";
	const options = {
		elements: job.snapshot.elements,
		files: job.snapshot.files,
		appState,
		exportPadding: focused ? 0 : spec.padding,
		...(focused
			? {
					exportingFrame: findingFrame(spec),
					getDimensions: () => ({ width: spec.width, height: spec.height, scale: spec.scale }),
				}
			: {}),
	};
	if (spec.format === "png") {
		const png = await pngBase64(await exportToBlob({ ...options, mimeType: "image/png" }));
		return { id: spec.id, format: "png", ...png };
	}
	const svg = await exportToSvg(options);
	return {
		id: spec.id,
		format: "svg",
		data: new XMLSerializer().serializeToString(svg),
		...svgSize(svg),
	};
}

async function run(job: BoardRendererJob): Promise<BoardRendererJobResult> {
	if (state.active) throw new Error("Board renderer received concurrent page work.");
	state.active = true;
	state.jobs += 1;
	try {
		if (job.kind === "mermaid") {
			state.phase = "mermaid";
			try {
				const result = await parseMermaidToExcalidraw(job.source, job.config);
				return { kind: "mermaid", elements: result.elements, files: result.files ?? {} };
			} catch (error) {
				return {
					kind: "mermaid",
					elements: [],
					files: {},
					error: error instanceof Error ? error.message : String(error),
				};
			}
		}
		state.phase = "preflight";
		try {
			requireEmbeddedFiles(job);
			await requireFonts(job);
		} catch (error) {
			if (error instanceof RenderInputError)
				return { kind: "render", outputs: [], error: error.message };
			throw error;
		}
		const outputs: BoardRenderOutput[] = [];
		for (const spec of job.outputs) {
			state.phase = `render-${spec.id}`;
			outputs.push(await renderOutput(job, spec));
		}
		return { kind: "render", outputs };
	} finally {
		state.phase = "ready";
		state.active = false;
	}
}

window.archboardBoardRenderer = { state, run };
