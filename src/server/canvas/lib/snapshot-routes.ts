import type { Express, Request, Response } from "express";
import { logger } from "@/runtime/engine/logger";
import { snapshots } from "@/runtime/engine/types";
import type { Snapshot } from "@/runtime/engine/types";
import { copyElements } from "@/runtime/engine/board-store";
import { presentElements, stripBindingPresentationLinks } from "@/runtime/engine/presentation";
import { answerBoardError, checkoutSnapshotFor } from "@/server/canvas/lib/board-response";
import { boardFromRequest, bodyString, messageOf } from "@/server/canvas/lib/request-board";

/**
 * Save a named snapshot of a board.
 * @param req The request.
 * @param res Its response.
 */
function saveSnapshotRoute(req: Request, res: Response): void {
	try {
		const name = bodyString(req, "name");
		if (!name) {
			res.status(400).json({ success: false, error: "Snapshot name is required" });
			return;
		}
		const { key: boardKeyForRequest, content } = boardFromRequest(req, "Saving a snapshot");
		// A copy, deeply. A snapshot is the thing you go back to, so it must not
		// be the same objects as the board it is protecting you from (TASK-048).
		const snapshot: Snapshot = {
			name,
			board: boardKeyForRequest,
			elements: copyElements(
				stripBindingPresentationLinks(content.elements.values(), { boardKey: boardKeyForRequest }),
			),
			createdAt: new Date().toISOString(),
		};
		snapshots.set(name, snapshot);
		logger.info(
			`Snapshot saved: "${name}" with ${snapshot.elements.length} elements from board "${boardKeyForRequest}"`,
		);
		res.json({
			success: true,
			name,
			board: boardKeyForRequest,
			elementCount: snapshot.elements.length,
			createdAt: snapshot.createdAt,
		});
	} catch (error) {
		answerBoardError(res, error, "Error saving snapshot:");
	}
}

/**
 * List the saved snapshots.
 * @param _req The request.
 * @param res Its response.
 */
function listSnapshotsRoute(_req: Request, res: Response): void {
	try {
		const list = Array.from(snapshots.values()).map((s) => ({
			name: s.name,
			board: s.board,
			elementCount: s.elements.length,
			createdAt: s.createdAt,
		}));
		res.json({ success: true, snapshots: list, count: list.length });
	} catch (error) {
		logger.error("Error listing snapshots:", error);
		res.status(500).json({ success: false, error: messageOf(error) });
	}
}

/**
 * Get one snapshot by name.
 * @param req The request.
 * @param res Its response.
 */
function getSnapshotRoute(req: Request, res: Response): void {
	try {
		const { name } = req.params;
		if (typeof name !== "string" || !name) {
			res.status(400).json({ success: false, error: "Snapshot name is required" });
			return;
		}
		const snapshot = snapshots.get(name);
		if (!snapshot) {
			res.status(404).json({ success: false, error: `Snapshot "${name}" not found` });
			return;
		}
		res.json({
			success: true,
			snapshot: {
				...snapshot,
				elements: presentElements(snapshot.elements, {
					boardKey: snapshot.board,
					checkoutSnapshot: checkoutSnapshotFor(res),
				}),
			},
		});
	} catch (error) {
		logger.error("Error fetching snapshot:", error);
		res.status(500).json({ success: false, error: messageOf(error) });
	}
}

/**
 * Mount the snapshot routes.
 * @param app The application to mount on.
 */
function mountSnapshotRoutes(app: Express): void {
	app.post("/api/snapshots", saveSnapshotRoute);
	app.get("/api/snapshots", listSnapshotsRoute);
	app.get("/api/snapshots/:name", getSnapshotRoute);
}

export { mountSnapshotRoutes };
