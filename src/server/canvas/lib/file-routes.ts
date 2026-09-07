import type { Express, Request, Response } from "express";
import type { ExcalidrawFile } from "@/runtime/engine/types";
import { boardFilesMessage } from "@/runtime/engine/board-io";
import { BoardMutationError } from "@/runtime/engine/board-write";
import { drawnFileIds, usableEmbeddedFile } from "@/runtime/engine/embedded-files";
import { answerBoardError } from "@/server/canvas/lib/board-response";
import {
	answerBoardWrite,
	boardFromRequest,
	boardTargetFromRequest,
	bodyOf,
} from "@/server/canvas/lib/request-board";

// ─── Files API (for image elements) ───────────────────────────
//
// Board-scoped, like every other route that touches board content. An image is
// board content: it is drawn by an element on one board, and the note that
// board is saved to is where it belongs. These used to be boardless, over one
// map per process keyed by file id, which is what put board B's pictures in
// board A's note (TASK-060, ADR 0009, ADR 0015).

/**
 * List the images one board holds.
 * @param req The request.
 * @param res Its response.
 */
function listFilesRoute(req: Request, res: Response): void {
	try {
		const { key, content } = boardFromRequest(req, "Listing images");
		res.json({ success: true, board: key, files: boardFilesMessage(content).files ?? {} });
	} catch (error) {
		answerBoardError(res, error);
	}
}

/**
 * The images a request posts: either the body itself as an array, or its
 * `files` field. Each candidate is validated by the write.
 * @param req The request.
 * @returns The candidates.
 */
function postedFiles(req: Request): unknown[] {
	const body: unknown = req.body;
	if (Array.isArray(body)) {
		return body;
	}
	const files = bodyOf(req)["files"];
	return Array.isArray(files) ? files : [];
}

/**
 * The warning for images no element on the board draws.
 * @param boardKey The board.
 * @param orphaned The ids not kept.
 * @returns The warning fields, or none.
 */
function orphanWarning(boardKey: string, orphaned: string[]): Record<string, unknown> {
	if (orphaned.length === 0) {
		return {};
	}
	return {
		orphaned,
		warning:
			`No element on "${boardKey}" draws ${orphaned.join(", ")}, so ` +
			`${orphaned.length === 1 ? "it was" : "they were"} not kept: a note holds the images ` +
			"its own elements reference. Create the image element first, then post its data.",
	};
}

/**
 * Add or update images on one board, in a batch.
 * @param req The request.
 * @param res Its response.
 */
function addFilesRoute(req: Request, res: Response): void {
	try {
		const source = boardTargetFromRequest(req, "Adding an image");
		const fileList = postedFiles(req);
		answerBoardWrite(res, {
			source,
			origin: "agent",
			/**
			 * Keep the usable images an element on this board draws (TASK-060).
			 * @param content The board content under the lock.
			 * @returns The orphaned ids and the files added.
			 */
			mutation: (content) => {
				const accepted = fileList
					.map((file) => usableEmbeddedFile(file))
					.filter((file): file is ExcalidrawFile => file !== null);
				for (const file of accepted) {
					content.files.set(file.id, file);
				}
				const drawn = drawnFileIds(content.elements.values());
				const orphaned = accepted.filter((file) => !drawn.has(file.id)).map((file) => file.id);
				return { value: { orphaned }, delta: { filesAdded: accepted } };
			},
			/**
			 * How many images were kept, and which were not.
			 * @param outcome The write's outcome.
			 * @returns The response body.
			 */
			answer: ({ value }) => ({
				success: true,
				board: source.key,
				count: fileList.length - value.orphaned.length,
				...orphanWarning(source.key, value.orphaned),
			}),
		});
	} catch (error) {
		answerBoardError(res, error);
	}
}

/**
 * Delete an image from one board.
 * @param req The request.
 * @param res Its response.
 */
function deleteFileRoute(req: Request, res: Response): void {
	try {
		const source = boardTargetFromRequest(req, "Deleting an image");
		const id = typeof req.params["id"] === "string" ? req.params["id"] : "";
		answerBoardWrite(res, {
			source,
			origin: "agent",
			/**
			 * Drop the image, refusing when the board has no such image.
			 * @param content The board content under the lock.
			 * @returns The deletion.
			 */
			mutation: (content) => {
				if (!content.files.delete(id)) {
					throw new BoardMutationError(404, `No image "${id}" on board "${source.key}".`);
				}
				return { value: null, delta: { filesDeleted: [id] } };
			},
			/**
			 * The bare acknowledgement.
			 * @returns The response body.
			 */
			answer: () => ({ success: true, board: source.key }),
		});
	} catch (error) {
		answerBoardError(res, error);
	}
}

/**
 * Mount the image routes.
 * @param app The application to mount on.
 */
function mountFileRoutes(app: Express): void {
	app.get("/api/files", listFilesRoute);
	app.post("/api/files", addFilesRoute);
	app.delete("/api/files/:id", deleteFileRoute);
}

export { mountFileRoutes };
