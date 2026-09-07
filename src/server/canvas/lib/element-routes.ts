import type { Express, Request, Response } from "express";
import { logger } from "@/runtime/engine/logger";
import type { ServerElement } from "@/runtime/engine/types";
import type { BoardContent } from "@/runtime/engine/board-io";
import {
	agentWriteAnswer,
	BoardMutationError,
	elementMutation,
	SCENE_REPLACEMENT_MARKER,
} from "@/runtime/engine/board-write";
import type { AppliedElementInput } from "@/runtime/engine/apply-element-input";
import { overlapsRegion } from "@/runtime/engine/geometry";
import { presentElement, presentElements } from "@/runtime/engine/presentation";
import { answerBoardError, checkoutSnapshotFor } from "@/server/canvas/lib/board-response";
import { clearSelectionForBoard } from "@/server/canvas/lib/pane-registry";
import {
	answerBoardWrite,
	boardFromRequest,
	boardTargetFromRequest,
	bodyOf,
	wantsDocument,
} from "@/server/canvas/lib/request-board";

/**
 * The element an input named first, which every single-element write produces.
 * @param applied What the input produced.
 * @returns The named element.
 */
function firstNamed(applied: AppliedElementInput): ServerElement {
	const named = applied.named[0];
	if (named === undefined) {
		throw new BoardMutationError(500, "The write produced no element.");
	}
	return named;
}

/**
 * An element that must be on the board after a write that touched it.
 * @param content The board content after the write.
 * @param id The element id.
 * @returns The element.
 */
function requireElement(content: BoardContent, id: string): ServerElement {
	const element = content.elements.get(id);
	if (element === undefined) {
		throw new BoardMutationError(500, `Element ${id} disappeared during its write.`);
	}
	return element;
}

/**
 * The `:id` route parameter, or the refusal when it is missing.
 * @param req The request.
 * @param res Its response.
 * @returns The id, or null once the refusal has been sent.
 */
function requiredId(req: Request, res: Response): string | null {
	const { id } = req.params;
	if (typeof id !== "string" || !id) {
		res.status(400).json({ success: false, error: "Element ID is required" });
		return null;
	}
	return id;
}

/**
 * List a board's elements.
 * @param req The request.
 * @param res Its response.
 */
function listElementsRoute(req: Request, res: Response): void {
	try {
		const { key, content } = boardFromRequest(req, "Listing elements");
		const elementsArray = presentElements(content.elements.values(), {
			boardKey: key,
			checkoutSnapshot: checkoutSnapshotFor(res),
		});
		res.json({ success: true, board: key, elements: elementsArray, count: elementsArray.length });
	} catch (error) {
		answerBoardError(res, error, "Error fetching elements:");
	}
}

/**
 * Create one element from the request body.
 * @param req The request.
 * @param res Its response.
 */
function createElementRoute(req: Request, res: Response): void {
	try {
		const source = boardTargetFromRequest(req, "Creating an element");
		answerBoardWrite(res, {
			source,
			origin: "agent",
			mutation: elementMutation<{ stored: ServerElement }>(() => ({
				input: { upserts: [req.body], origin: "agent" },
				/**
				 * The element the write stored.
				 * @param applied What the input produced.
				 * @returns The stored element.
				 */
				value: (applied) => ({ stored: firstNamed(applied) }),
			})),
			/**
			 * Log the creation once it has persisted.
			 * @param outcome The write's outcome.
			 * @param outcome.value What the mutation produced.
			 */
			afterPersist: ({ value }) => {
				logger.info("Creating element via API", { type: value.stored.type, board: source.key });
			},
			/**
			 * The created element, and what the board became (TASK-075).
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
				element: presentElement(value.stored, { boardKey: source.key, checkoutSnapshot }),
				// `element` is what the caller asked for; `elements` is what the board
				// became, label and z-order included (TASK-075).
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
		answerBoardError(res, error, "Error creating element:");
	}
}

/**
 * Update one element by id, merging the body over it.
 * @param req The request.
 * @param res Its response.
 */
function updateElementRoute(req: Request, res: Response): void {
	try {
		const source = boardTargetFromRequest(req, "Updating an element");
		const id = requiredId(req, res);
		if (id === null) {
			return;
		}
		const body = bodyOf(req);
		answerBoardWrite(res, {
			source,
			origin: "agent",
			mutation: elementMutation<{ touched: ServerElement[] }>((content) => {
				if (!content.elements.has(id)) {
					throw new BoardMutationError(404, `Element with ID ${id} not found`);
				}
				return {
					input: { upserts: [{ ...body, id }], origin: "agent" },
					/**
					 * Every element the update touched, the named one last.
					 * @param applied What the input produced.
					 * @returns The touched elements.
					 */
					value: (applied) => {
						const touched = new Map(
							[...applied.created, ...applied.updated].map((element) => [element.id, element]),
						);
						touched.set(id, firstNamed(applied));
						return { touched: Array.from(touched.values()) };
					},
				};
			}),
			/**
			 * The updated element, and what the board became.
			 * @param outcome The write's outcome.
			 * @param outcome.content The board content after the write.
			 * @param outcome.value What the mutation produced.
			 * @param outcome.written The persisted note, or null when nothing was written.
			 * @param outcome.checkoutSnapshot The checkout overlay the answer presents through.
			 * @returns The response body.
			 */
			answer: ({ content, value, written, checkoutSnapshot }) => ({
				success: true,
				board: source.key,
				element: presentElement(requireElement(content, id), {
					boardKey: source.key,
					checkoutSnapshot,
				}),
				...agentWriteAnswer(
					source.key,
					source.board,
					content,
					value.touched,
					wantsDocument(req),
					written,
					checkoutSnapshot,
				),
			}),
		});
	} catch (error) {
		answerBoardError(res, error, "Error updating element:");
	}
}

/**
 * Clear every element off a board.
 * @param req The request.
 * @param res Its response.
 */
function clearElementsRoute(req: Request, res: Response): void {
	try {
		const source = boardTargetFromRequest(req, "Clearing a board");
		answerBoardWrite(res, {
			source,
			origin: "agent",
			/**
			 * Empty the board and count what went.
			 * @param content The board content under the lock.
			 * @returns The count and the deletions.
			 */
			mutation: (content) => {
				const deleted = Array.from(content.elements.keys());
				content.elements.clear();
				return { value: { count: deleted.length }, delta: { deleted } };
			},
			/**
			 * Nothing is on this board, so nothing on it can be selected in any
			 * pane showing it. A pane on another board keeps its pick.
			 * @param outcome The write's outcome.
			 * @param outcome.value What the mutation produced.
			 */
			afterPersist: ({ value }) => {
				clearSelectionForBoard(source.key);
				logger.info(`Canvas cleared: ${value.count} elements removed from board "${source.key}"`);
			},
			/**
			 * How many elements went.
			 * @param outcome The write's outcome.
			 * @param outcome.value What the mutation produced.
			 * @returns The response body.
			 */
			answer: ({ value }) => ({
				success: true,
				board: source.key,
				message: `Cleared ${value.count} elements`,
				count: value.count,
			}),
		});
	} catch (error) {
		answerBoardError(res, error, "Error clearing canvas:");
	}
}

/**
 * Delete one element by id, and whatever must go with it.
 * @param req The request.
 * @param res Its response.
 */
function deleteElementRoute(req: Request, res: Response): void {
	try {
		const source = boardTargetFromRequest(req, "Deleting an element");
		const id = requiredId(req, res);
		if (id === null) {
			return;
		}
		answerBoardWrite(res, {
			source,
			origin: "agent",
			mutation: elementMutation<{ deleted: string[] }>((content) => {
				if (!content.elements.has(id)) {
					throw new BoardMutationError(404, `Element with ID ${id} not found`);
				}
				return {
					input: { deletes: [id], origin: "agent" },
					/**
					 * Everything the deletion removed.
					 * @param applied What the input produced.
					 * @returns The deleted ids.
					 */
					value: (applied) => ({ deleted: applied.deleted }),
				};
			}),
			/**
			 * What was deleted, and what the board became.
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
				message: `Element ${id} deleted successfully`,
				...(value.deleted.length > 1 ? { alsoDeleted: value.deleted.slice(1) } : {}),
				...agentWriteAnswer(
					source.key,
					source.board,
					content,
					delta.updated,
					wantsDocument(req),
					written,
					checkoutSnapshot,
				),
			}),
		});
	} catch (error) {
		answerBoardError(res, error, "Error deleting element:");
	}
}

/**
 * One bound of a search region, or unbounded when the query left it out.
 * @param raw The query value.
 * @param unbounded The bound to use when absent.
 * @returns The bound.
 */
function regionBound(raw: unknown, unbounded: number): number {
	return raw === undefined ? unbounded : Number(raw);
}

/**
 * Narrow a search to the elements overlapping the queried region, when one
 * was given. An element is in the region when any part of it is, measured
 * from its path where it has one — asking where an arrow starts is not asking
 * where it goes (TASK-044).
 * @param results The elements so far.
 * @param query The request query.
 * @returns The elements in the region.
 */
function filterByRegion(results: ServerElement[], query: Request["query"]): ServerElement[] {
	const { x_min, x_max, y_min, y_max } = query;
	if ([x_min, x_max, y_min, y_max].every((bound) => bound === undefined)) {
		return results;
	}
	const region = {
		xMin: regionBound(x_min, -Infinity),
		xMax: regionBound(x_max, Infinity),
		yMin: regionBound(y_min, -Infinity),
		yMax: regionBound(y_max, Infinity),
	};
	return results.filter((element) => overlapsRegion(element, region));
}

/**
 * Narrow a search to elements whose fields exactly match every remaining
 * query parameter.
 * @param results The elements so far.
 * @param filters Field to expected value.
 * @returns The matching elements.
 */
function filterByFields(
	results: ServerElement[],
	filters: Record<string, unknown>,
): ServerElement[] {
	const entries = Object.entries(filters);
	if (entries.length === 0) {
		return results;
	}
	return results.filter((element) =>
		entries.every(([field, value]) => Reflect.get(element, field) === value),
	);
}

/**
 * Query a board's elements by type, region and exact field matches.
 * @param req The request.
 * @param res Its response.
 */
function searchElementsRoute(req: Request, res: Response): void {
	try {
		const { key, content } = boardFromRequest(req, "Querying elements");
		const { type, x_min, x_max, y_min, y_max, board: _boardParam, ...filters } = req.query;
		let results = Array.from(content.elements.values());
		if (typeof type === "string" && type) {
			results = results.filter((element) => element.type === type);
		}
		results = filterByRegion(results, { x_min, x_max, y_min, y_max });
		results = filterByFields(results, filters);
		res.json({
			success: true,
			elements: presentElements(results, {
				boardKey: key,
				checkoutSnapshot: checkoutSnapshotFor(res),
			}),
			count: results.length,
		});
	} catch (error) {
		answerBoardError(res, error, "Error querying elements:");
	}
}

/**
 * Get one element by id.
 * @param req The request.
 * @param res Its response.
 */
function getElementRoute(req: Request, res: Response): void {
	try {
		const { key, content } = boardFromRequest(req, "Getting an element");
		const id = requiredId(req, res);
		if (id === null) {
			return;
		}
		const element = content.elements.get(id);
		if (!element) {
			res.status(404).json({ success: false, error: `Element with ID ${id} not found` });
			return;
		}
		res.json({
			success: true,
			element: presentElement(element, {
				boardKey: key,
				checkoutSnapshot: checkoutSnapshotFor(res),
			}),
		});
	} catch (error) {
		answerBoardError(res, error, "Error fetching element:");
	}
}

/**
 * Why a batch was refused, when its body does not carry what the write needs.
 * @param elements The `elements` body field.
 * @param files The `files` body field.
 * @param replacesScene Whether the body asked to replace the whole scene.
 * @returns The refusal, or null when the body is usable.
 */
function batchRefusal(elements: unknown, files: unknown, replacesScene: boolean): string | null {
	if (!Array.isArray(elements)) {
		return "Expected an array of elements";
	}
	if (replacesScene && !Array.isArray(files)) {
		return "Expected an array of files for scene replacement";
	}
	return null;
}

/**
 * Create many elements at once, or replace the whole scene when the body
 * carries the scene-replacement marker.
 * @param req The request.
 * @param res Its response.
 */
function batchElementsRoute(req: Request, res: Response): void {
	try {
		const source = boardTargetFromRequest(req, "Creating elements");
		const { elements: elementsToCreate, files: replacementFiles, mutation } = bodyOf(req);
		const replacesScene = mutation === SCENE_REPLACEMENT_MARKER;
		const refusal = batchRefusal(elementsToCreate, replacementFiles, replacesScene);
		if (refusal !== null) {
			res.status(400).json({ success: false, error: refusal });
			return;
		}
		const upserts = Array.isArray(elementsToCreate) ? elementsToCreate : [];
		const replacementFileList = Array.isArray(replacementFiles) ? replacementFiles : [];
		answerBoardWrite(res, {
			source,
			origin: "agent",
			mutation: elementMutation<{ count: number }>(() => ({
				input: { upserts, origin: "agent" },
				...(replacesScene ? { replaceScene: { files: replacementFileList } } : {}),
				/**
				 * How many elements the batch created.
				 * @param applied What the input produced.
				 * @returns The count.
				 */
				value: (applied) => ({ count: applied.created.length }),
			})),
			...(replacesScene
				? {
						/** A replaced scene voids every pick on the board. */
						afterPersist: () => {
							clearSelectionForBoard(source.key);
						},
					}
				: {}),
			/**
			 * What the batch produced, and what the board became.
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
				// `elements` here has always been what the write produced; the
				// fingerprint and the opt-in document are what TASK-075 adds.
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
		answerBoardError(res, error, "Error batch creating elements:");
	}
}

/**
 * Mount the element routes. Clear and search precede the `:id` routes on
 * purpose: Express matches in registration order.
 * @param app The application to mount on.
 */
function mountElementRoutes(app: Express): void {
	app.get("/api/elements", listElementsRoute);
	app.post("/api/elements", createElementRoute);
	app.put("/api/elements/:id", updateElementRoute);
	app.delete("/api/elements/clear", clearElementsRoute);
	app.delete("/api/elements/:id", deleteElementRoute);
	app.get("/api/elements/search", searchElementsRoute);
	app.get("/api/elements/:id", getElementRoute);
	app.post("/api/elements/batch", batchElementsRoute);
}

export { mountElementRoutes };
