import type { Express, NextFunction, Request, Response } from "express";
import { derivedId } from "@/shared/ids/ids";
import {
	AgentElementInputSchema,
	type ElementInputRequest,
} from "@/runtime/engine/apply-element-input";
import {
	agentWriteAnswer,
	BoardMutationError,
	elementMutation,
} from "@/runtime/engine/board-write";
import {
	BoardRendererError,
	DEFAULT_MERMAID_CONFIG,
	type MermaidRenderJobResult,
	type MermaidSkeleton,
} from "@/server/board-rendering";
import { answerBoardError } from "@/server/canvas/lib/board-response";
import { boardRenderer } from "@/server/canvas/lib/canvas-owners";
import { asyncEndpoint, callerGone, trackMutationWork } from "@/server/canvas/lib/mutation-work";
import {
	answerBoardWrite,
	boardTargetFromRequest,
	bodyOf,
	isRecord,
	wantsDocument,
} from "@/server/canvas/lib/request-board";

type AgentUpserts = NonNullable<Extract<ElementInputRequest, { origin: "agent" }>["upserts"]>;

/** One validated, frozen renderer result, ready for the write under the board's lease. */
interface PreparedMermaidConversion {
	readonly kind: "prepared-mermaid";
	readonly elements: readonly MermaidSkeleton[];
	readonly files: MermaidRenderJobResult["files"];
}

const preparedMermaids = new WeakMap<Request, PreparedMermaidConversion>();

/**
 * Freeze a value and everything reachable from it, so the write cannot alter
 * the renderer's result.
 * @param value The root of the graph.
 * @param seen Objects already frozen, for cycles.
 */
function freezeObjectGraph(value: unknown, seen = new Set<object>()): void {
	if (!value || typeof value !== "object" || seen.has(value)) {
		return;
	}
	seen.add(value);
	for (const key of Reflect.ownKeys(value)) {
		freezeObjectGraph(Reflect.get(value, key), seen);
	}
	Object.freeze(value);
}

/**
 * Refuse a rendered element set whose ids are missing or repeated.
 * @param elements The rendered skeletons.
 */
function requireDistinctIds(elements: readonly MermaidSkeleton[]): void {
	const ids = new Set<string>();
	for (const element of elements) {
		if (typeof element.id !== "string" || element.id.length === 0) {
			throw new BoardMutationError(422, "Mermaid conversion returned an element without an id.");
		}
		if (ids.has(element.id)) {
			throw new BoardMutationError(
				422,
				`Mermaid conversion returned duplicate element id ${JSON.stringify(element.id)}.`,
			);
		}
		ids.add(element.id);
	}
}

/**
 * Validate and freeze a renderer result, refusing a failed or empty conversion.
 * @param rendered What the renderer returned.
 * @returns The prepared conversion.
 */
function canonicalMermaidResult(rendered: MermaidRenderJobResult): PreparedMermaidConversion {
	if (rendered.error) {
		throw new BoardMutationError(
			422,
			`Mermaid conversion failed: ${rendered.error}`,
			"MERMAID_INVALID",
		);
	}
	if (rendered.elements.length === 0) {
		throw new BoardMutationError(
			422,
			"Mermaid conversion returned no elements for non-empty source. The board was not changed.",
			"MERMAID_EMPTY_RESULT",
		);
	}
	requireDistinctIds(rendered.elements);
	const prepared: PreparedMermaidConversion = {
		kind: "prepared-mermaid",
		elements: structuredClone(rendered.elements),
		files: structuredClone(rendered.files),
	};
	freezeObjectGraph(prepared);
	return prepared;
}

/**
 * The conversion the pre-write middleware prepared for this request.
 * @param req The request.
 * @returns The prepared conversion.
 */
function preparedMermaidOf(req: Request): PreparedMermaidConversion {
	const prepared = preparedMermaids.get(req);
	if (prepared === undefined) {
		throw new Error("Mermaid conversion reached its write without a prepared renderer result.");
	}
	return prepared;
}

/**
 * The Mermaid render configuration a request asked for, over the defaults.
 * @param config The `config` body field.
 * @returns The merged configuration.
 */
function mermaidConfigOf(config: unknown): typeof DEFAULT_MERMAID_CONFIG {
	return isRecord(config) ? { ...DEFAULT_MERMAID_CONFIG, ...config } : DEFAULT_MERMAID_CONFIG;
}

/**
 * Render the diagram and keep the validated result on the request, or answer
 * the refusal. Runs under the request's mutation lease.
 * @param req The request.
 * @param res Its response.
 * @param next The next middleware, reached only with a prepared result.
 * @param signal The lease's abort signal.
 */
async function prepareMermaid(
	req: Request,
	res: Response,
	next: NextFunction,
	signal: AbortSignal,
): Promise<void> {
	try {
		const { mermaidDiagram, config } = bodyOf(req);
		if (typeof mermaidDiagram !== "string" || mermaidDiagram.trim().length === 0) {
			res.status(400).json({ success: false, error: "Mermaid diagram definition is required" });
			return;
		}
		signal.throwIfAborted();
		const converted = await boardRenderer.execute(
			{ kind: "mermaid", source: mermaidDiagram, config: mermaidConfigOf(config) },
			signal,
		);
		signal.throwIfAborted();
		if (converted.kind !== "mermaid") {
			throw new BoardRendererError("Mermaid renderer returned the wrong result shape.", "result");
		}
		preparedMermaids.set(req, canonicalMermaidResult(converted));
		signal.throwIfAborted();
		next();
	} catch (error) {
		if (callerGone(req, res)) {
			return;
		}
		answerBoardError(res, error, "Error preparing Mermaid diagram:");
	}
}

/**
 * Mount the pre-write Mermaid renderer. Mermaid rendering can outlast a board
 * lease, so it renders and validates first and then lets the ordinary write
 * middleware take the board and map ids against its current under-lock note.
 * @param app The application to mount on.
 */
function mountMermaidPreparation(app: Express): void {
	app.use((req: Request, res: Response, next: NextFunction) => {
		if (req.method !== "POST" || req.path !== "/api/elements/from-mermaid") {
			return next();
		}
		void trackMutationWork(req, `${req.method} ${req.path} renderer`, (signal) =>
			prepareMermaid(req, res, next, signal),
		).catch((error) => {
			if (callerGone(req, res)) {
				return;
			}
			setImmediate(next, error);
		});
	});
}

/**
 * The board id a rendered element maps to, minted against the ids the board
 * already uses so no rendered id can collide with or rename an existing element.
 * @param elements The rendered skeletons.
 * @param existingIds The ids already on the board.
 * @returns Rendered id to board id.
 */
function mapRenderedIds(
	elements: readonly MermaidSkeleton[],
	existingIds: Iterable<string>,
): Map<string, string> {
	const used = new Set(existingIds);
	const ids = new Map<string, string>();
	for (const element of elements) {
		if (typeof element.id !== "string" || element.id.length === 0) {
			throw new BoardMutationError(422, "Mermaid conversion returned an element without an id.");
		}
		const id = derivedId(`mermaid:${element.id}`, used);
		used.add(id);
		ids.set(element.id, id);
	}
	return ids;
}

/**
 * The board id a rendered element's endpoint refers to.
 * @param ids Rendered id to board id.
 * @param value The endpoint as rendered.
 * @returns The board endpoint, or undefined when the element has none.
 */
function mappedEndpoint(ids: Map<string, string>, value: unknown): { id: string } | undefined {
	if (!isRecord(value) || typeof value["id"] !== "string") {
		return undefined;
	}
	const sourceId = value["id"];
	const id = ids.get(sourceId);
	if (!id) {
		throw new BoardMutationError(
			422,
			`Mermaid conversion referred to missing endpoint ${JSON.stringify(sourceId)}.`,
		);
	}
	return { id };
}

/**
 * The board id of one rendered element.
 * @param ids Rendered id to board id.
 * @param element The rendered element.
 * @returns Its board id.
 */
function mappedId(ids: Map<string, string>, element: MermaidSkeleton): string {
	const sourceId = element.id;
	if (typeof sourceId !== "string") {
		throw new BoardMutationError(422, "Mermaid conversion returned an element without an id.");
	}
	const id = ids.get(sourceId);
	if (!id) {
		throw new BoardMutationError(
			422,
			`Mermaid conversion lost element id ${JSON.stringify(sourceId)} before the write.`,
		);
	}
	return id;
}

/**
 * The agent upserts a rendered diagram becomes, with every id minted against
 * the board and every arrow endpoint re-pointed accordingly.
 * @param elements The rendered skeletons.
 * @param existingIds The ids already on the board.
 * @returns The upserts.
 */
function mermaidElementInput(
	elements: readonly MermaidSkeleton[],
	existingIds: Iterable<string>,
): AgentUpserts {
	const ids = mapRenderedIds(elements, existingIds);
	return elements.map((element) => {
		const id = mappedId(ids, element);
		const start = "start" in element ? mappedEndpoint(ids, element.start) : undefined;
		const end = "end" in element ? mappedEndpoint(ids, element.end) : undefined;
		return AgentElementInputSchema.parse({
			...structuredClone(element),
			id,
			...(start ? { start } : {}),
			...(end ? { end } : {}),
		});
	});
}

/**
 * Mount the from-mermaid route. It receives one frozen renderer result from the
 * pre-write middleware; only id mapping and the one synchronous canonical write
 * happen under lease.
 * @param app The application to mount on.
 */
function mountMermaidRoute(app: Express): void {
	app.post(
		"/api/elements/from-mermaid",
		asyncEndpoint(async (req: Request, res: Response, _next: NextFunction, signal: AbortSignal) => {
			try {
				signal.throwIfAborted();
				const source = boardTargetFromRequest(req, "Mermaid conversion");
				const converted = preparedMermaidOf(req);
				signal.throwIfAborted();
				answerBoardWrite<{ count: number; ids: string[] }>(res, {
					source,
					origin: "agent",
					mutation: elementMutation((content) => ({
						input: {
							origin: "agent",
							upserts: mermaidElementInput(converted.elements, content.elements.keys()),
						},
						addFiles: Object.values(converted.files),
						/**
						 * Count and name what the conversion put on the board.
						 * @param applied What the input produced.
						 * @returns The count and the ids.
						 */
						value: (applied) => {
							const elements = [...applied.created, ...applied.updated];
							return { count: elements.length, ids: elements.map((element) => element.id) };
						},
					})),
					/**
					 * The conversion's answer: what landed, plus the ordinary agent write answer.
					 * @param outcome The write's outcome.
					 * @param outcome.content The board content after the write.
					 * @param outcome.value What the mutation produced.
					 * @param outcome.delta What the write created, updated and deleted.
					 * @param outcome.written The persisted note, or null when nothing was written.
					 * @param outcome.checkoutSnapshot The checkout overlay the answer presents through.
					 * @returns The response body.
					 */
					answer: ({ content, value, delta, written, checkoutSnapshot }) => ({
						success: true,
						board: source.key,
						count: value.count,
						ids: value.ids,
						...agentWriteAnswer(
							source.key,
							source.board,
							content,
							[...delta.created, ...delta.updated],
							wantsDocument(req),
							written,
							checkoutSnapshot,
						),
					}),
				});
			} catch (error) {
				answerBoardError(res, error, "Error processing Mermaid diagram:");
			}
		}),
	);
}

export { mountMermaidPreparation, mountMermaidRoute };
