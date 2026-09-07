import type { Express, NextFunction, Request, Response } from "express";
import { z } from "zod";
import { readBoardInspectionSnapshot } from "@/runtime/engine/board-io";
import { listBoards } from "@/runtime/engine/board";
import { BoardRequiredError } from "@/runtime/engine/board-target";
import { BoardMutationError } from "@/runtime/engine/board-write";
import { InspectionPolicyInputSchema, inspectBoard } from "@/runtime/board-inspection";
import { findingRasterDimensions } from "@/shared/finding-raster";
import { BoardRendererError, type BoardRenderSnapshot } from "@/server/board-rendering";
import { answerBoardError } from "@/server/canvas/lib/board-response";
import { boardRenderer } from "@/server/canvas/lib/canvas-owners";
import { asyncEndpoint } from "@/server/canvas/lib/mutation-work";
import { boardOfRequest, bodyOf } from "@/server/canvas/lib/request-board";

const boardRenderRequestSchema = z.object({
	format: z.enum(["png", "svg"]),
	background: z.boolean().default(true),
	padding: z.number().int().min(0).max(128).default(16),
	scale: z.number().min(0.25).max(4).default(1),
});

type InspectionSnapshot = ReturnType<typeof readBoardInspectionSnapshot>;

/**
 * A copy of a persisted render scene, so the renderer can never touch the snapshot.
 * @param scene The scene.
 * @returns The copy.
 */
function copiedRenderSnapshot(
	scene: NonNullable<InspectionSnapshot["renderScene"]>,
): BoardRenderSnapshot {
	return structuredClone(scene);
}

/**
 * The persisted snapshot of a board that must be renderable.
 * @param asked The board as the caller named it.
 * @returns The snapshot with its render scene.
 */
function renderableSnapshot(
	asked: string,
): InspectionSnapshot & { renderScene: NonNullable<InspectionSnapshot["renderScene"]> } {
	const snapshot = readBoardInspectionSnapshot(asked);
	const renderScene = snapshot.renderScene;
	if (!renderScene) {
		throw new BoardMutationError(
			422,
			`Board "${snapshot.board}" has persisted elements that cannot be rendered. Correct the note and try again.`,
			"BOARD_NOT_RENDERABLE",
		);
	}
	return { ...snapshot, renderScene };
}

/**
 * Render one board to an image: one persisted snapshot, no pane, camera or
 * browser client.
 * @param req The request.
 * @param res Its response.
 * @param _next Unused.
 * @param signal Aborts the render.
 */
async function renderBoardRoute(
	req: Request,
	res: Response,
	_next: NextFunction,
	signal: AbortSignal,
): Promise<void> {
	try {
		const asked = boardOfRequest(req);
		if (!asked) {
			throw new BoardRequiredError(
				listBoards().map((entry) => entry.key),
				"Rendering a board",
			);
		}
		const options = boardRenderRequestSchema.parse(bodyOf(req));
		const snapshot = renderableSnapshot(asked);
		const rendered = await boardRenderer.execute(
			{
				kind: "render",
				snapshot: copiedRenderSnapshot(snapshot.renderScene),
				outputs: [
					{
						id: "board",
						kind: "full",
						format: options.format,
						background: options.background,
						padding: options.padding,
						scale: options.scale,
					},
				],
			},
			signal,
		);
		if (rendered.kind !== "render") {
			throw new BoardRendererError("Board renderer returned the wrong result shape.", "result");
		}
		const output = rendered.outputs[0];
		if (output === undefined || rendered.outputs.length !== 1) {
			if (rendered.error) {
				throw new BoardMutationError(422, rendered.error, "BOARD_NOT_RENDERABLE");
			}
			throw new BoardRendererError("Board renderer returned the wrong result shape.", "result");
		}
		res.json({
			success: true,
			board: snapshot.board,
			sourceFingerprint: snapshot.fingerprint,
			format: output.format,
			data: output.data,
			width: output.width,
			height: output.height,
			padding: options.padding,
			scale: options.scale,
			background: options.background,
			backgroundColor: snapshot.renderScene.appState.viewBackgroundColor,
		});
	} catch (error) {
		answerBoardError(res, error, "Error rendering board");
	}
}

type FindingReport = ReturnType<typeof inspectBoard>;
type FocusBox = NonNullable<FindingReport["findings"][number]["focusBBox"]>;

/**
 * The findings that have a focus box to render.
 * @param report The inspection report.
 * @returns Each finding's index and box.
 */
function focusRequests(report: FindingReport): { findingIndex: number; focusBBox: FocusBox }[] {
	return report.findings.flatMap((finding, findingIndex) =>
		finding.focusBBox ? [{ findingIndex, focusBBox: finding.focusBBox }] : [],
	);
}

/**
 * Render a focused PNG per finding, from the same persisted snapshot the
 * inspection used.
 * @param req The request.
 * @param res Its response.
 * @param _next Unused.
 * @param signal Aborts the render.
 */
async function exportFindingsRoute(
	req: Request,
	res: Response,
	_next: NextFunction,
	signal: AbortSignal,
): Promise<void> {
	try {
		const asked = boardOfRequest(req);
		if (!asked) {
			res.status(400).json({ success: false, error: "Rendering findings requires a board." });
			return;
		}
		const policy = InspectionPolicyInputSchema.parse(bodyOf(req)["policy"] ?? {});
		const snapshot = readBoardInspectionSnapshot(asked);
		const report = inspectBoard(snapshot.elements, policy);
		const requests = focusRequests(report);
		const base = {
			board: snapshot.board,
			sourceFingerprint: snapshot.fingerprint,
			report,
			sourceRenderable: snapshot.renderScene !== null,
		};
		if (!snapshot.renderScene || requests.length === 0) {
			res.json({ ...base, results: [] });
			return;
		}
		const rendered = await boardRenderer.execute(
			{
				kind: "render",
				snapshot: copiedRenderSnapshot(snapshot.renderScene),
				outputs: requests.map(({ findingIndex, focusBBox }) => ({
					id: String(findingIndex),
					kind: "focus" as const,
					format: "png" as const,
					background: true as const,
					frame: focusBBox,
					...findingRasterDimensions(focusBBox),
				})),
			},
			signal,
		);
		if (rendered.kind !== "render") {
			throw new BoardRendererError("Finding renderer returned the wrong result shape.", "result");
		}
		if (rendered.error) {
			res.json({ ...base, sourceRenderable: false, results: [], error: rendered.error });
			return;
		}
		const byId = new Map(rendered.outputs.map((output) => [output.id, output]));
		const results = requests.map(({ findingIndex }) => {
			const output = byId.get(String(findingIndex));
			return output
				? { findingIndex, data: output.data }
				: { findingIndex, failure: "renderer-failed" as const };
		});
		if (!res.destroyed) {
			res.json({ ...base, results });
		}
	} catch (error) {
		if (!res.destroyed) {
			answerBoardError(res, error, "Error rendering board findings");
		}
	}
}

/**
 * Mount the server-owned render routes.
 * @param app The application to mount on.
 */
function mountRenderRoutes(app: Express): void {
	app.post("/api/render/board", asyncEndpoint(renderBoardRoute));
	app.post("/api/export/findings", asyncEndpoint(exportFindingsRoute));
}

export { mountRenderRoutes };
