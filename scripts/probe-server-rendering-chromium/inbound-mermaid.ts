// The inbound half of the Mermaid proof: the page's raw Mermaid elements go
// through the engine's own write path and must come out block-safe and canonical.
import { z } from "zod";

import {
	applyElementInput,
	CreateElementSchema,
	UpdateElementSchema,
} from "@/runtime/engine/apply-element-input";
import type { ServerElement } from "@/runtime/engine/types";
import { derivedId, isBlockId } from "@/shared/ids/ids";
// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no alias root; @/ resolves only into src/
import { errorMessage, isRecord, requireRecord, type JsonRecord } from "./proof-values.ts";

const agentElementInputs = z.array(z.union([CreateElementSchema, UpdateElementSchema]));

/**
 * Mint a block id for every raw Mermaid element, keyed by the element.
 * @param raw The raw elements from the page.
 * @returns The element records with their minted ids.
 * @throws {Error} When an element is not a record with a string id.
 */
function mintMermaidIds(raw: unknown[]): Map<JsonRecord, string> {
	const ids = new Map<JsonRecord, string>();
	const used = new Set<string>();
	for (const element of raw) {
		if (!isRecord(element) || typeof element["id"] !== "string") {
			throw new Error("Mermaid element has no source id.");
		}
		const id = derivedId(`mermaid:${element["id"]}`, used);
		used.add(id);
		ids.set(element, id);
	}
	return ids;
}

/**
 * The minted ids keyed by the page's source ids.
 * @param ids The minted ids keyed by element.
 * @returns The same ids keyed by source id.
 */
function idsBySource(ids: ReadonlyMap<JsonRecord, string>): Map<unknown, string> {
	return new Map([...ids].map(([element, id]) => [element["id"], id]));
}

/**
 * Rewrite raw Mermaid elements with minted ids, including their arrow endpoints.
 * @param ids The minted ids keyed by element.
 * @returns The rewritten input elements.
 */
function rewriteMermaidIds(ids: ReadonlyMap<JsonRecord, string>): JsonRecord[] {
	const bySource = idsBySource(ids);
	/**
	 * The minted id for an arrow endpoint, when the endpoint names a source id.
	 * @param endpoint The `start` or `end` record.
	 * @returns The endpoint with its minted id, or nothing to spread.
	 */
	const rewriteEndpoint = (endpoint: unknown): { id: string | undefined } | undefined =>
		isRecord(endpoint) && typeof endpoint["id"] === "string"
			? { id: bySource.get(endpoint["id"]) }
			: undefined;
	return [...ids].map(([source, id]) => {
		const start = rewriteEndpoint(source["start"]);
		const end = rewriteEndpoint(source["end"]);
		return {
			...source,
			id,
			...(start ? { start } : {}),
			...(end ? { end } : {}),
		};
	});
}

/**
 * Refuse a converted board whose labels and arrows do not name the canonical diagram.
 * @param elements The converted board elements.
 * @param ids The minted ids keyed by source id.
 * @throws {Error} When labels or bindings were lost.
 */
function requireCanonicalInboundShape(
	elements: readonly ServerElement[],
	ids: ReadonlyMap<unknown, string>,
): void {
	const labels = elements
		.filter((element) => element.type === "text")
		.map((element) => `${element.containerId ?? ""}:${element.text}`)
		.toSorted();
	const arrows = elements
		.filter((element) => element.type === "arrow")
		.map(
			(element) =>
				`${element.startBinding?.elementId ?? ""}>${element.endBinding?.elementId ?? ""}`,
		)
		.toSorted();
	const caller = ids.get("caller")!;
	const render = ids.get("render")!;
	const artifact = ids.get("artifact")!;
	if (
		JSON.stringify(labels) !==
			JSON.stringify(
				[
					`${artifact}:PNG and SVG`,
					`${caller}:Board operation`,
					`${render}:Server render`,
				].toSorted(),
			) ||
		JSON.stringify(arrows) !== JSON.stringify([`${caller}>${render}`, `${render}>${artifact}`])
	) {
		throw new Error(
			`Inbound Mermaid shape lost labels or bindings: ${JSON.stringify({ labels, arrows })}`,
		);
	}
}

/**
 * Refuse a converted board that is not three labelled rectangles and two arrows.
 * @param elements The converted board elements.
 * @throws {Error} When the element types differ.
 */
function requireCanonicalInboundTypes(elements: readonly ServerElement[]): void {
	const expected = [
		"arrow",
		"arrow",
		"rectangle",
		"rectangle",
		"rectangle",
		"text",
		"text",
		"text",
	];
	if (
		elements.length !== 8 ||
		JSON.stringify(elements.map((element) => element.type).toSorted()) !== JSON.stringify(expected)
	) {
		throw new Error(
			"Inbound Mermaid conversion did not expand to the expected Archboard element shape.",
		);
	}
}

/**
 * Apply the rewritten elements to an empty board through the engine.
 * @param input The rewritten input elements.
 * @param raw The raw elements, for the failure message.
 * @returns The converted board elements.
 * @throws {Error} When the engine refuses the input.
 */
function convertThroughEngine(input: JsonRecord[], raw: unknown[]): ServerElement[] {
	const board = new Map<string, ServerElement>();
	try {
		applyElementInput(board, { origin: "agent", upserts: agentElementInputs.parse(input) });
	} catch (error) {
		throw new Error(
			`Canonical inbound Mermaid conversion failed: ${errorMessage(error)}; raw=${JSON.stringify(raw)}`,
			{ cause: error },
		);
	}
	return [...board.values()];
}

/**
 * Convert the page's raw Mermaid elements through the engine's own write path
 * and check the result is block-safe and canonical.
 * @param result The job result holding `mermaid.rawElements`.
 * @returns A summary of the converted board.
 * @throws {Error} When conversion fails or the shape is not canonical.
 */
async function runInboundMermaid(result: JsonRecord): Promise<JsonRecord> {
	const raw = requireRecord(result, "mermaid")["rawElements"];
	if (!Array.isArray(raw)) {
		throw new Error("Browser Mermaid result has no element array.");
	}
	const ids = mintMermaidIds(raw);
	const elements = convertThroughEngine(rewriteMermaidIds(ids), raw);
	if (elements.length === 0 || !elements.every((element) => isBlockId(element.id))) {
		throw new Error(
			"Canonical inbound Mermaid conversion did not yield block-safe Archboard elements.",
		);
	}
	requireCanonicalInboundShape(elements, idsBySource(ids));
	requireCanonicalInboundTypes(elements);
	return {
		count: elements.length,
		ids: elements.map((element) => element.id).toSorted(),
		types: elements.map((element) => element.type).toSorted(),
	};
}

export { runInboundMermaid };
