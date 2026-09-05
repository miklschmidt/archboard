// Requests addressed to the browser over a pane's socket: a capture of what
// is on screen, and a change of viewport. Both answer over HTTP.

import { exportToBlob, exportToSvg } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import type { WebSocketMessage } from "@/ui/types";

/** How an answer reaches the server. */
type Respond = (payload: Record<string, unknown>) => Promise<void>;

/**
 * The base64 payload of a blob.
 * @param blob The exported image.
 * @returns The base64 data after the data-URL comma.
 */
function blobBase64(blob: Blob): Promise<string> {
	return new Promise<string>((resolve, reject) => {
		const reader = new FileReader();
		reader.addEventListener("load", () => {
			const result = typeof reader.result === "string" ? reader.result : "";
			const encoded = result.split(",")[1];
			if (encoded !== undefined && encoded !== "") {
				resolve(encoded);
			} else {
				reject(new Error("Could not extract base64 data from the export"));
			}
		});
		reader.addEventListener("error", () => {
			reject(reader.error ?? new Error("FileReader failed"));
		});
		reader.readAsDataURL(blob);
	});
}

/**
 * Plain words for a thrown value.
 * @param error What was thrown.
 * @returns Its message.
 */
function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/**
 * Render the scene as the request asks and answer with it.
 * @param api Excalidraw's API.
 * @param data The capture request.
 * @returns The answer payload.
 */
async function renderCapture(
	api: ExcalidrawImperativeAPI,
	data: WebSocketMessage,
): Promise<Record<string, unknown>> {
	const elements = api.getSceneElements();
	const appState = { ...api.getAppState(), exportBackground: data.background !== false };
	const files = api.getFiles();
	if (data.format === "svg") {
		const svg = await exportToSvg({ elements, appState, files });
		return { format: "svg", data: new XMLSerializer().serializeToString(svg) };
	}
	const blob = await exportToBlob({ elements, appState, files, mimeType: "image/png" });
	return { format: "png", data: await blobBase64(blob) };
}

/**
 * Answer a browser capture request with a PNG or SVG of the scene.
 * @param api Excalidraw's API.
 * @param data The request.
 * @param respond How to answer.
 */
async function answerBrowserCapture(
	api: ExcalidrawImperativeAPI,
	data: WebSocketMessage,
	respond: Respond,
): Promise<void> {
	try {
		await respond(await renderCapture(api, data));
	} catch (error) {
		await respond({ error: errorMessage(error) });
	}
}

/**
 * Scroll to a set of elements by id, refusing when any is missing.
 * @param api Excalidraw's API.
 * @param ids The wanted ids.
 * @param viewportZoomFactor How much of the viewport to fill.
 */
function scrollToElements(
	api: ExcalidrawImperativeAPI,
	ids: readonly string[],
	viewportZoomFactor: number | undefined,
): void {
	if (ids.length === 0 || !ids.every((id) => typeof id === "string" && id.length > 0)) {
		throw new Error("scrollToElementIds must be a non-empty array of element IDs");
	}
	const all = api.getSceneElements();
	const wanted = new Set(ids);
	const targets = all.filter((element) => wanted.has(element.id));
	const found = new Set(targets.map((element) => element.id));
	const missing = ids.filter((id) => !found.has(id));
	if (missing.length > 0) {
		throw new Error(`Elements not found for IDs: ${missing.join(", ")}`);
	}
	api.scrollToContent(targets, {
		fitToViewport: true,
		...zoomOption(viewportZoomFactor),
		animate: true,
	});
}

/**
 * The zoom-factor option, only when a factor was named.
 * @param viewportZoomFactor The requested factor, if any.
 * @returns The option to spread.
 */
function zoomOption(viewportZoomFactor: number | undefined): { viewportZoomFactor?: number } {
	return viewportZoomFactor === undefined ? {} : { viewportZoomFactor };
}

/**
 * Fit the whole board into the viewport, when there is anything to fit.
 * @param api Excalidraw's API.
 * @param viewportZoomFactor How much of the viewport to fill.
 */
function scrollToAll(api: ExcalidrawImperativeAPI, viewportZoomFactor: number | undefined): void {
	const all = api.getSceneElements();
	if (all.length > 0) {
		api.scrollToContent(all, {
			fitToViewport: true,
			...zoomOption(viewportZoomFactor),
			animate: true,
		});
	}
}

/**
 * Scroll to one element by id.
 * @param api Excalidraw's API.
 * @param id The wanted id.
 */
function scrollToElement(api: ExcalidrawImperativeAPI, id: string): void {
	const target = api.getSceneElements().find((element) => element.id === id);
	if (!target) {
		throw new Error(`Element ${id} not found`);
	}
	api.scrollToContent([target], { fitToViewport: false, animate: true });
}

/**
 * The explicit camera a request names, as `updateScene` app state.
 * @param data The request.
 * @returns The app-state fields to set, possibly none.
 */
function requestedCamera(data: WebSocketMessage): Record<string, unknown> {
	const appState: Record<string, unknown> = {};
	if (data.zoom !== undefined) {
		appState["zoom"] = { value: data.zoom };
	}
	if (data.offsetX !== undefined) {
		appState["scrollX"] = data.offsetX;
	}
	if (data.offsetY !== undefined) {
		appState["scrollY"] = data.offsetY;
	}
	return appState;
}

/**
 * Move the viewport as the request asks.
 * @param api Excalidraw's API.
 * @param data The request.
 * @param applyCamera Applies explicit camera fields through the reporting runtime.
 */
function moveViewport(
	api: ExcalidrawImperativeAPI,
	data: WebSocketMessage,
	applyCamera: (appState: Record<string, unknown>) => void,
): void {
	if (data.scrollToContent === true) {
		scrollToAll(api, data.viewportZoomFactor);
		return;
	}
	if (data.scrollToElementIds !== undefined) {
		scrollToElements(api, data.scrollToElementIds, data.viewportZoomFactor);
		return;
	}
	if (data.scrollToElementId !== undefined && data.scrollToElementId !== "") {
		scrollToElement(api, data.scrollToElementId);
		return;
	}
	const camera = requestedCamera(data);
	if (Object.keys(camera).length > 0) {
		applyCamera(camera);
	}
}

/**
 * Answer a viewport request.
 * @param api Excalidraw's API.
 * @param data The request.
 * @param respond How to answer.
 * @param applyCamera Applies explicit camera fields through the reporting runtime.
 */
async function answerViewport(
	api: ExcalidrawImperativeAPI,
	data: WebSocketMessage,
	respond: Respond,
	applyCamera: (appState: Record<string, unknown>) => void,
): Promise<void> {
	try {
		moveViewport(api, data, applyCamera);
		await respond({ success: true, message: "Viewport updated" });
	} catch (error) {
		await respond({ error: errorMessage(error) });
	}
}

export { answerBrowserCapture, answerViewport, type Respond };
