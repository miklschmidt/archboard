import { exportToBlob, exportToSvg } from "@excalidraw/excalidraw";
import type { ExcalidrawFrameLikeElement } from "@excalidraw/excalidraw/element/types";
import { parseMermaidToExcalidraw } from "@excalidraw/mermaid-to-excalidraw";

import type {
	BoardRenderJob,
	BoardRenderOutput,
	BoardRenderSpec,
	BoardRendererJob,
	BoardRendererJobResult,
	BrowserRendererEntry,
	MermaidParserResult,
	MermaidRenderJob,
} from "@/server/board-rendering/lib/contract";

const state = { phase: "ready", active: false, jobs: 0 };

type RendererElements = Parameters<typeof exportToBlob>[0]["elements"];
type RendererFiles = Parameters<typeof exportToBlob>[0]["files"];
type SnapshotElement = BoardRenderJob["snapshot"]["elements"][number];

/**
 * Restores Excalidraw's nominal element types over the validated persisted elements.
 * @param elements The elements of the snapshot being rendered.
 * @returns The same elements as Excalidraw's exporters type them.
 */
function rendererElements(elements: BoardRenderJob["snapshot"]["elements"]): RendererElements {
	// Excalidraw's nominal Radians/point brands have no runtime representation. Board I/O has
	// already validated every persisted field before this renderer-only type restoration.
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- brands only; every field was validated at board I/O
	return elements as unknown as RendererElements;
}

/**
 * Restores Excalidraw's nominal file types over the validated persisted files.
 * @param files The embedded files of the snapshot being rendered.
 * @returns The same files as Excalidraw's exporters type them.
 */
function rendererFiles(files: BoardRenderJob["snapshot"]["files"]): RendererFiles {
	// File ids and MIME values are validated at board I/O; Excalidraw's nominal brands disappear
	// from the persisted JSON representation and are restored only at this renderer boundary.
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- brands only; ids and MIME values were validated at board I/O
	return files as unknown as RendererFiles;
}

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

/**
 * Collects the font faces the board's text needs, one size per family, refusing unknown ones.
 * @param job The render job.
 * @returns Font name to the size it must be loaded at.
 */
function requiredFonts(job: BoardRenderJob): Map<string, number> {
	const wanted = new Map<string, number>();
	for (const element of job.snapshot.elements) {
		if (element.type !== "text") {
			continue;
		}
		const name = fontNames.get(element.fontFamily);
		if (name === undefined) {
			throw new RenderInputError(
				`Board render cannot resolve font family ${String(element.fontFamily)}.`,
			);
		}
		if (!Number.isFinite(element.fontSize) || element.fontSize <= 0) {
			throw new RenderInputError(
				`Board render cannot resolve font size ${String(element.fontSize)}.`,
			);
		}
		wanted.set(name, element.fontSize);
	}
	return wanted;
}

/**
 * Loads every font the board's text needs and refuses to render with a fallback face.
 * @param job The render job.
 */
async function requireFonts(job: BoardRenderJob): Promise<void> {
	for (const [name, size] of requiredFonts(job)) {
		// oxlint-disable-next-line no-await-in-loop -- fonts are loaded and checked one at a time so a failure names the first unavailable face
		await document.fonts.load(`${size}px "${name}"`);
		if (!document.fonts.check(`${size}px "${name}"`)) {
			throw new RenderInputError(`Board render could not load required font "${name}".`);
		}
	}
}

/**
 * Tells whether an element is an image that will be drawn.
 * @param element A snapshot element.
 * @returns True for a live image element.
 */
function isVisibleImage(
	element: SnapshotElement,
): element is Extract<SnapshotElement, { type: "image" }> {
	return element.type === "image" && !element.isDeleted;
}

/**
 * Tells whether the snapshot embeds a file with data for an image's file id.
 * @param files The snapshot's embedded files.
 * @param id The image's file id.
 * @returns True when the file is present with a data URL.
 */
function hasEmbeddedFile(files: BoardRenderJob["snapshot"]["files"], id: string): boolean {
	return Boolean(files[id]?.dataURL);
}

/**
 * Refuses a snapshot whose drawn images are missing their embedded file data.
 * @param job The render job.
 */
function requireEmbeddedFiles(job: BoardRenderJob): void {
	for (const element of job.snapshot.elements) {
		if (!isVisibleImage(element)) {
			continue;
		}
		const id = element.fileId;
		if (!id || !hasEmbeddedFile(job.snapshot.files, id)) {
			throw new RenderInputError(`Board render is missing embedded file "${id ?? "unknown"}".`);
		}
	}
}

/**
 * Builds the invisible frame Excalidraw crops a focused export to.
 * @param spec The focused output's spec.
 * @returns A locked, transparent frame covering the spec's frame rectangle.
 */
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
		// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Radians is a nominal brand over number; an unrotated frame is angle 0
		angle: 0 as ExcalidrawFrameLikeElement["angle"],
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

/**
 * Encodes a PNG blob as base64 and measures it.
 * @param blob The exported PNG.
 * @returns The base64 data with the bitmap's pixel size.
 */
async function pngBase64(blob: Blob): Promise<{ data: string; width: number; height: number }> {
	const bytes = new Uint8Array(await blob.arrayBuffer());
	let binary = "";
	for (let offset = 0; offset < bytes.length; offset += 0x8000) {
		binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
	}
	const bitmap = await createImageBitmap(blob);
	try {
		return { data: btoa(binary), width: bitmap.width, height: bitmap.height };
	} finally {
		bitmap.close();
	}
}

/**
 * Reads one finite positive dimension attribute off an exported SVG.
 * @param svg The exported SVG root.
 * @param name The attribute, width or height.
 * @returns The dimension.
 */
function svgDimension(svg: SVGSVGElement, name: "width" | "height"): number {
	const value = Number.parseFloat(svg.getAttribute(name) ?? "");
	if (!Number.isFinite(value) || value <= 0) {
		throw new Error("Board render returned an SVG without finite positive dimensions.");
	}
	return value;
}

/**
 * Reads the size of an exported SVG.
 * @param svg The exported SVG root.
 * @returns The width and height.
 */
function svgSize(svg: SVGSVGElement): { width: number; height: number } {
	return { width: svgDimension(svg, "width"), height: svgDimension(svg, "height") };
}

/**
 * Exports one output of a render job.
 * @param job The render job.
 * @param spec The output to produce.
 * @returns The encoded output with its size.
 */
async function renderOutput(
	job: BoardRenderJob,
	spec: BoardRenderSpec,
): Promise<BoardRenderOutput> {
	const appState = {
		...job.snapshot.appState,
		exportBackground: spec.background,
		exportScale: spec.scale,
	};
	const options = {
		elements: rendererElements(job.snapshot.elements),
		files: rendererFiles(job.snapshot.files),
		appState,
	};
	if (spec.format === "png") {
		const png = await pngBase64(
			await exportToBlob(
				spec.kind === "focus"
					? {
							...options,
							exportPadding: 0,
							exportingFrame: findingFrame(spec),
							/**
							 * Fixes the output size to the focused spec instead of the frame's own size.
							 * @returns The spec's width, height and scale.
							 */
							getDimensions: () => ({
								width: spec.width,
								height: spec.height,
								scale: spec.scale,
							}),
							mimeType: "image/png",
						}
					: { ...options, exportPadding: spec.padding, mimeType: "image/png" },
			),
		);
		return { id: spec.id, format: "png", ...png };
	}
	const svg = await exportToSvg({ ...options, exportPadding: spec.padding });
	return {
		id: spec.id,
		format: "svg",
		data: new XMLSerializer().serializeToString(svg),
		...svgSize(svg),
	};
}

/**
 * Parses Mermaid source into Excalidraw skeletons, reporting a parse failure as a result.
 * @param job The Mermaid job.
 * @returns The skeletons and files, or an empty result carrying the parser's message.
 */
async function renderMermaid(job: MermaidRenderJob): Promise<BoardRendererJobResult> {
	state.phase = "mermaid";
	try {
		const result: MermaidParserResult = await parseMermaidToExcalidraw(job.source, job.config);
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

/**
 * Renders every output of a board job, reporting an input problem as a result.
 * @param job The render job.
 * @returns The outputs in spec order, or an empty result carrying the input problem.
 */
async function renderBoard(job: BoardRenderJob): Promise<BoardRendererJobResult> {
	state.phase = "preflight";
	try {
		requireEmbeddedFiles(job);
		await requireFonts(job);
	} catch (error) {
		if (error instanceof RenderInputError) {
			return { kind: "render", outputs: [], error: error.message };
		}
		throw error;
	}
	const outputs: BoardRenderOutput[] = [];
	for (const spec of job.outputs) {
		state.phase = `render-${spec.id}`;
		// oxlint-disable-next-line no-await-in-loop -- the page exports one output at a time on the shared document, and outputs keep spec order
		outputs.push(await renderOutput(job, spec));
	}
	return { kind: "render", outputs };
}

/**
 * Runs one job on the page, which admits a single job at a time.
 * @param job The render or Mermaid job.
 * @returns The job's result.
 */
async function run(job: BoardRendererJob): Promise<BoardRendererJobResult> {
	if (state.active) {
		throw new Error("Board renderer received concurrent page work.");
	}
	state.active = true;
	state.jobs += 1;
	try {
		document.body.replaceChildren();
		return job.kind === "mermaid" ? await renderMermaid(job) : await renderBoard(job);
	} finally {
		document.body.replaceChildren();
		state.phase = "ready";
		state.active = false;
	}
}

const browserRenderer: BrowserRendererEntry = { state, run };
window.archboardBoardRenderer = browserRenderer;

export { browserRenderer };
