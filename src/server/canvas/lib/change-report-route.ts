import type { Express, Request, Response } from "express";
import { z } from "zod";
import { logger } from "@/runtime/engine/logger";
import { isHeld } from "@/runtime/engine/board-hold";
import {
	AgentElementInputSchema,
	HumanElementChangeSchema,
	type ElementInputRequest,
} from "@/runtime/engine/apply-element-input";
import {
	agentWriteAnswer,
	BoardMutationError,
	elementMutation,
	humanWriteAnswer,
} from "@/runtime/engine/board-write";
import type { BoardWriteAnswerContext } from "@/runtime/engine/board-write";
import { presentationContextFromElement } from "@/runtime/engine/presentation";
import type { PresentationContext } from "@/runtime/engine/presentation";
import { answerBoardError } from "@/server/canvas/lib/board-response";
import {
	answerBoardWrite,
	boardTargetFromRequest,
	bodyOf,
	wantsDocument,
	writeContextOf,
} from "@/server/canvas/lib/request-board";

// ─── Change reports from the browser ──────────────────────────
//
// The browser reports what changed; the server decides what the board is.
//
// This replaces POST /api/elements/sync, which cleared the board's element map
// and refilled it from whatever a tab happened to be holding. That made every
// tab the authority on the entire board on every keystroke, so a tab that was
// stale, still loading, or showing a board mid-switch could truncate work it
// had never seen. Nothing here can do that: the server removes only ids a
// client names explicitly, and a client can only name ids it received in the
// first place.
//
// Upserts are merged, not substituted, so server-side fields the browser does
// not model — createdAt, the monotonic version, anything a later feature
// stamps on an element — survive a human dragging the shape.
//
// It is also the one route an agent writes a whole intent through. Aligning
// twenty boxes is one thing somebody asked for, and it costs one write here
// rather than twenty (ADR 0015, TASK-068). Who is writing decides two things
// and nothing else — see `origin`.
const ElementChangesSchema = z.object({
	upserts: z.array(z.record(z.string(), z.unknown())).default([]),
	deletes: z.array(z.string()).default([]),
	/**
	 * Who is writing. Absent means the browser, which was this route's only
	 * writer when it was written: its elements are stamped `frontend_sync` and
	 * the feed is told a human moved them.
	 *
	 * An agent says so and gets neither. Stamping its own drawing `frontend_sync`
	 * would make it indistinguishable from a user edit, and calling it human
	 * to the feed would make it eligible to be narrated back into the agent's own
	 * thread (ADR 0005).
	 */
	origin: z.enum(["human", "agent"]).default("human"),
	clientId: z.string().optional(),
	timestamp: z.string().optional(),
	/**
	 * "This is the whole board, as it stands on my screen."
	 *
	 * The one thing a pane is otherwise never allowed to say (TASK-016): a pane
	 * sends a delta against what it has been sent, so that a stale or half-loaded
	 * tab cannot name — and so cannot delete — an element it has never seen.
	 *
	 * It is allowed on a board that has stopped saving, and nowhere else. The
	 * note there belongs to another editor, so the board archboard would
	 * otherwise hold is their scene plus the last pending user edit, which
	 * is not what anybody is looking at and not what the three outcomes should
	 * act on. The pane sends its full scene once, and from then on overwrite
	 * means what CLAUDE.md's table says it means. Nothing is written to the vault
	 * by it — a held board writes to nothing — so the worst a wrong one can do is
	 * change what a human sees they are about to choose between.
	 */
	fullReport: z.boolean().default(false),
});

type ElementChanges = z.infer<typeof ElementChangesSchema>;

/**
 * The presentation context each upsert already carries, keyed by id, so peers
 * can be shown the same code links without filesystem work.
 * @param upserts The reported upserts.
 * @param boardKey The board.
 * @returns Id to presentation context.
 */
function presentationLinksOf(
	upserts: ElementChanges["upserts"],
	boardKey: string,
): Map<string, PresentationContext> {
	return new Map(
		upserts.flatMap((upsert) => {
			if (typeof upsert["id"] !== "string") {
				return [];
			}
			const context = presentationContextFromElement(upsert, boardKey);
			return context ? ([[upsert["id"], context]] as const) : [];
		}),
	);
}

/**
 * The element input a change report becomes, validated by who sent it.
 * @param changes The parsed report.
 * @param presentationLinks The links its upserts carry.
 * @returns The input.
 */
function elementInputOf(
	changes: ElementChanges,
	presentationLinks: Map<string, PresentationContext>,
): ElementInputRequest {
	const { upserts, deletes, origin, timestamp } = changes;
	if (origin === "agent") {
		return {
			origin,
			upserts: upserts.map((upsert) => AgentElementInputSchema.parse(upsert)),
			deletes,
			presentationLinks,
		};
	}
	return {
		origin,
		upserts: upserts.map((upsert) => HumanElementChangeSchema.parse(upsert)),
		deletes,
		presentationLinks,
		...(timestamp === undefined ? {} : { timestamp }),
	};
}

/**
 * Refuse a full report from anyone but a pane, or on a board that is saving
 * normally. Both checks happen inside the isolated mutation, before any note
 * can be written.
 * @param boardKey The board.
 * @param writerKind Who the write boundary found writing.
 */
function requireFullReportAllowed(boardKey: string, writerKind: "human" | "agent"): void {
	if (writerKind === "agent") {
		throw new BoardMutationError(
			400,
			"A full report is a pane sending its whole scene. An agent must send a delta.",
		);
	}
	if (!isHeld(boardKey)) {
		throw new BoardMutationError(
			400,
			`"${boardKey}" is saving normally, so a full report would be a whole-scene write. ` +
				"Report a delta against what this pane has been sent.",
		);
	}
}

/**
 * Apply a change report to a board.
 * @param req The request.
 * @param res Its response.
 */
function changeReportRoute(req: Request, res: Response): void {
	try {
		const source = boardTargetFromRequest(req, "A change report");
		const changes = ElementChangesSchema.parse(bodyOf(req));
		const { origin, clientId, fullReport } = changes;
		const presentationLinks = presentationLinksOf(changes.upserts, source.key);
		const input = elementInputOf(changes, presentationLinks);
		const writerKind = writeContextOf(res).writerKind;
		/**
		 * The report's answer. An agent keeps the established pessimistic answer.
		 * A pane gets a compact post-persistence acknowledgement, except for the
		 * explicit held-board full-report recovery path (TASK-074/075/118).
		 * @param context The write's outcome.
		 * @returns The response body.
		 */
		const answer = (context: BoardWriteAnswerContext<null>): Record<string, unknown> => {
			const { content, delta, written, appliedAt } = context;
			return {
				success: true,
				board: source.key,
				created: delta.created.length,
				updated: delta.updated.length,
				deleted: delta.deleted.length,
				count: content.elements.size,
				appliedAt,
				...(writerKind === "agent"
					? agentWriteAnswer(
							source.key,
							source.board,
							content,
							[...delta.created, ...delta.updated],
							wantsDocument(req),
							written,
							context.checkoutSnapshot,
						)
					: humanWriteAnswer(context, fullReport)),
			};
		};
		answerBoardWrite(res, {
			source,
			origin,
			...(clientId === undefined ? {} : { clientId }),
			presentationLinks,
			mutation: elementMutation<null>(() => {
				if (fullReport) {
					requireFullReportAllowed(source.key, writerKind);
				}
				return {
					input,
					wholeScene: fullReport,
					/**
					 * A change report carries no value of its own.
					 * @returns Null.
					 */
					value: () => null,
				};
			}),
			/**
			 * Log what the report did once it has persisted.
			 * @param outcome The write's outcome.
			 * @param outcome.content The board content after the write.
			 * @param outcome.delta What the write created, updated and deleted.
			 */
			afterPersist: ({ content, delta }) => {
				const who = clientId ?? (writerKind === "agent" ? "an agent" : "an unidentified client");
				logger.info(
					`Change report from ${who} on "${source.key}": ` +
						`+${delta.created.length} ~${delta.updated.length} -${delta.deleted.length} ` +
						`(${content.elements.size} on the board)`,
				);
			},
			answer,
		});
	} catch (error) {
		answerBoardError(res, error, "Error applying a change report:");
	}
}

/**
 * Mount the change-report route.
 * @param app The application to mount on.
 */
function mountChangeReportRoute(app: Express): void {
	app.post("/api/elements/changes", changeReportRoute);
}

export { mountChangeReportRoute };
