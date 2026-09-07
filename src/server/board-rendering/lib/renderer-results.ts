import type {
	BoardRendererJobResult,
	RendererPageState,
} from "@/server/board-rendering/lib/contract";
import { isJsonRecord } from "@/server/board-rendering/lib/renderer-failure";

/**
 * Whether one value is an embedded image the renderer produced.
 * @param file The candidate.
 * @returns True for a usable image.
 */
function isRenderedFile(file: unknown): boolean {
	return (
		isJsonRecord(file) &&
		typeof file["id"] === "string" &&
		typeof file["dataURL"] === "string" &&
		typeof file["mimeType"] === "string" &&
		typeof file["created"] === "number"
	);
}

/**
 * Whether a Mermaid conversion returned the elements and images it must.
 * @param value The result as the page returned it.
 * @returns True for a usable conversion.
 */
function isMermaidResult(value: Record<string, unknown>): boolean {
	const elements = Reflect.get(value, "elements");
	const files = Reflect.get(value, "files");
	if (!Array.isArray(elements) || !isJsonRecord(files)) {
		return false;
	}
	const elementsUsable = elements.every(
		(element) => isJsonRecord(element) && typeof Reflect.get(element, "type") === "string",
	);
	return elementsUsable && Object.values(files).every(isRenderedFile);
}

/**
 * Whether one value is a rendered image the page produced for an output it was
 * asked for.
 * @param output The candidate.
 * @returns True for a usable output.
 */
function isRenderedOutput(output: unknown): boolean {
	if (!isJsonRecord(output)) {
		return false;
	}
	const usableFormat = ["png", "svg"].includes(String(Reflect.get(output, "format")));
	return (
		typeof Reflect.get(output, "id") === "string" &&
		usableFormat &&
		typeof Reflect.get(output, "data") === "string" &&
		typeof Reflect.get(output, "width") === "number" &&
		typeof Reflect.get(output, "height") === "number"
	);
}

/**
 * Whether a result's failure, if it carries one, is the text the contract says
 * it is.
 * @param value The result as the page returned it.
 * @returns True when it carries no failure, or a usable one.
 */
function carriesUsableError(value: Record<string, unknown>): boolean {
	const error = Reflect.get(value, "error");
	return error === undefined || typeof error === "string";
}

/**
 * Whether the renderer page returned a structured result for the job it was
 * given, rather than something the page's own failure produced.
 * @param value Whatever the page evaluation answered.
 * @returns True for a usable job result.
 */
function isRendererJobResult(value: unknown): value is BoardRendererJobResult {
	if (!isJsonRecord(value) || !carriesUsableError(value)) {
		return false;
	}
	const kind = Reflect.get(value, "kind");
	if (kind === "mermaid") {
		return isMermaidResult(value);
	}
	if (kind !== "render") {
		return false;
	}
	const outputs = Reflect.get(value, "outputs");
	return Array.isArray(outputs) && outputs.every(isRenderedOutput);
}

/**
 * Whether the renderer page reported the state this owner reads it by.
 * @param value Whatever the page evaluation answered.
 * @returns True for a usable page state.
 */
function isRendererPageState(value: unknown): value is RendererPageState {
	return (
		isJsonRecord(value) &&
		typeof value["phase"] === "string" &&
		typeof value["active"] === "boolean" &&
		typeof value["jobs"] === "number"
	);
}

export { isRendererJobResult, isRendererPageState };
