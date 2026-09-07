import type { Express, Request, Response } from "express";
import { mintId } from "@/shared/ids/ids";
import type { ServerElement } from "@/runtime/engine/types";
import type { BoardContent } from "@/runtime/engine/board-io";
import {
	agentWriteAnswer,
	BoardMutationError,
	elementMutation,
} from "@/runtime/engine/board-write";
import {
	BridgeRefusal,
	planBridgeCreate,
	planBridgeRemoval,
} from "@/runtime/board-inspection/bridge";
import { answerBoardError } from "@/server/canvas/lib/board-response";
import {
	answerBoardWrite,
	boardTargetFromRequest,
	bodyOf,
	isRecord,
} from "@/server/canvas/lib/request-board";

type BridgePlan = ReturnType<typeof planBridgeCreate>;

/**
 * A body field as the string the bridge planner reads, empty when absent.
 * @param body The request body.
 * @param name The field.
 * @returns The string.
 */
function bridgeField(body: Record<string, unknown>, name: string): string {
	const value = body[name];
	return typeof value === "string" ? value : value === undefined ? "" : String(value);
}

/**
 * The point a bridge was asked to sit at, when the body names one.
 * @param body The request body.
 * @returns The point, or undefined.
 */
function bridgePoint(body: Record<string, unknown>): { x: number; y: number } | undefined {
	const at = body["at"];
	if (!isRecord(at) || typeof at["x"] !== "number" || typeof at["y"] !== "number") {
		return undefined;
	}
	return { x: at["x"], y: at["y"] };
}

/**
 * Plan a bridge from the request body against the board under the lock,
 * turning the planner's refusal into the write's.
 * @param body The request body.
 * @param content The board content.
 * @returns The plan.
 */
function planBridgeFromBody(body: Record<string, unknown>, content: BoardContent): BridgePlan {
	try {
		const at = bridgePoint(body);
		return planBridgeCreate({
			elements: [...content.elements.values()],
			bridgeId: mintId(content.elements),
			overConnectorId: bridgeField(body, "over"),
			underConnectorId: bridgeField(body, "under"),
			background: bridgeField(body, "background"),
			...(at === undefined ? {} : { at }),
		});
	} catch (error) {
		if (error instanceof BridgeRefusal) {
			throw new BoardMutationError(400, error.message, error.code);
		}
		throw error;
	}
}

/**
 * Mark one unavoidable proper connector crossing without changing either source.
 * @param req The request.
 * @param res Its response.
 */
function createBridgeRoute(req: Request, res: Response): void {
	try {
		const source = boardTargetFromRequest(req, "Creating a connector bridge");
		const body = bodyOf(req);
		answerBoardWrite(res, {
			source,
			origin: "agent",
			mutation: elementMutation<{ plan: BridgePlan; generated: ServerElement[] }>((content) => {
				const plan = planBridgeFromBody(body, content);
				return {
					input: { upserts: [...plan.inputs], origin: "agent" },
					/**
					 * The plan and the elements it generated.
					 * @param applied What the input produced.
					 * @returns The plan and its elements.
					 */
					value: (applied) => ({ plan, generated: applied.named }),
				};
			}),
			/**
			 * Where the bridge sits, and what the board became.
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
				bridgeId: value.plan.bridgeId,
				overConnectorId: value.plan.overConnectorId,
				underConnectorId: value.plan.underConnectorId,
				overSegmentIndex: value.plan.overSegmentIndex,
				underSegmentIndex: value.plan.underSegmentIndex,
				crossing: value.plan.crossing,
				...agentWriteAnswer(
					source.key,
					source.board,
					content,
					value.generated,
					false,
					written,
					checkoutSnapshot,
				),
			}),
		});
	} catch (error) {
		answerBoardError(res, error, "Error creating connector bridge:");
	}
}

/**
 * Remove a bridge. Provenance owns removal: source connectors may have moved
 * or disappeared.
 * @param req The request.
 * @param res Its response.
 */
function deleteBridgeRoute(req: Request, res: Response): void {
	try {
		const source = boardTargetFromRequest(req, "Removing a connector bridge");
		const bridgeId = typeof req.params["id"] === "string" ? req.params["id"] : "";
		answerBoardWrite(res, {
			source,
			origin: "agent",
			mutation: elementMutation<{ deleted: readonly [string, string] }>((content) => {
				let deleted: readonly [string, string];
				try {
					deleted = planBridgeRemoval([...content.elements.values()], bridgeId);
				} catch (error) {
					if (error instanceof BridgeRefusal) {
						throw new BoardMutationError(400, error.message, error.code);
					}
					throw error;
				}
				return {
					input: { deletes: [...deleted], origin: "agent" },
					/**
					 * The two ids the removal deleted.
					 * @returns The deleted pair.
					 */
					value: () => ({ deleted }),
				};
			}),
			/**
			 * What was removed, and what the board became.
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
				bridgeId,
				deleted: value.deleted,
				...agentWriteAnswer(
					source.key,
					source.board,
					content,
					[],
					false,
					written,
					checkoutSnapshot,
				),
			}),
		});
	} catch (error) {
		answerBoardError(res, error, "Error removing connector bridge:");
	}
}

/**
 * Mount the connector bridge routes.
 * @param app The application to mount on.
 */
function mountBridgeRoutes(app: Express): void {
	app.post("/api/bridges", createBridgeRoute);
	app.delete("/api/bridges/:id", deleteBridgeRoute);
}

export { mountBridgeRoutes };
