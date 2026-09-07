import type { Express, Request, Response } from "express";
import { logger } from "@/runtime/engine/logger";
import { resolveBoard } from "@/runtime/engine/board-io";
import { boardKey, CURRENT_VARIANT, listBoards, parseBoardKey } from "@/runtime/engine/board";
import { compareBoards } from "@/runtime/engine/compare";
import type { CompareSideInput } from "@/runtime/engine/compare";
import { answerBoardError } from "@/server/canvas/lib/board-response";
import { queryString } from "@/server/canvas/lib/request-board";

// ─── Compare ──────────────────────────────────────────────────
//
// A structured semantic diff between two variants, joined on node identity
// (src/runtime/engine/compare.ts). Read-only in the strictest sense: comparing two boards
// must never disturb the one on screen, so this neither opens a board, nor
// registers one in the store, nor records a baseline, nor consults pane state.
// Both sides are read from their notes, because that is where a board is (ADR
// 0015, ADR 0020).

/**
 * One side of a comparison, read from its note.
 * @param key The board key.
 * @returns The side.
 */
function loadSideForCompare(key: string): CompareSideInput {
	const resolved = resolveBoard(key, "Comparing boards");
	return {
		key,
		identity: resolved.board.identity,
		elements: Array.from(resolved.content.elements.values()).filter(
			(element) => !element.isDeleted,
		),
		...(resolved.board.file === undefined ? {} : { file: resolved.board.file }),
	};
}

/**
 * Every persisted address for a board name, so a one-sided `compare payments`
 * can find the other side without consulting transient session state.
 * @param boardName The board name.
 * @returns The keys, sorted.
 */
function addressesFor(boardName: string): string[] {
	return listBoards()
		.filter((found) => found.identity.board === boardName)
		.map((found) => found.key)
		.toSorted();
}

/** Both sides of a comparison, or the refusal explaining why they could not be found. */
type ComparePair =
	| { from: string; to: string; refusal?: undefined }
	| { refusal: Record<string, unknown> };

/**
 * Find the other side of a one-address comparison among that board's
 * variants. `current` is privileged, so whenever it exists it is the `from`
 * side — the diff reads "what the proposal changes about the architecture
 * that exists", never the reverse.
 * @param fromKey The one address given.
 * @returns The pair, or the refusal.
 */
function pairWithSibling(fromKey: string): ComparePair {
	const fromIdentity = parseBoardKey(fromKey);
	const siblings = addressesFor(fromIdentity.board).filter((k) => k !== fromKey);
	if (siblings.length === 0) {
		return {
			refusal: {
				success: false,
				error:
					`"${fromKey}" has no other variant to compare against. A variant is a separate note ` +
					`(${fromIdentity.board}@option-a.excalidraw.md); author one with ` +
					`\`board new ${fromIdentity.board}@option-a\`, or name both sides: ` +
					"`compare <from> <to>`.",
			},
		};
	}
	const other = siblings[0];
	if (siblings.length > 1 || other === undefined) {
		return {
			refusal: {
				success: false,
				error:
					`"${fromIdentity.board}" has ${siblings.length} variants — ${siblings.join(", ")} — so which ` +
					"two to compare is not obvious. Name both sides: `compare <from> <to>`.",
				variants: [fromKey, ...siblings].toSorted(),
			},
		};
	}
	// The given side is a proposal and the only other one is what it is a
	// proposal against, so it reads current -> proposal.
	return fromIdentity.variant === CURRENT_VARIANT
		? { from: fromKey, to: other }
		: { from: other, to: fromKey };
}

/**
 * One side of a comparison as the request named it.
 * @param req The request.
 * @param name The query parameter.
 * @returns The board as spelled, or null when the request named none.
 */
function namedBoard(req: Request, name: string): string | null {
	const asked = queryString(req, name)?.trim();
	return asked ? asked : null;
}

/**
 * Refuse a pair whose two sides are the same board.
 * @param pair The pair, or an existing refusal.
 * @returns The pair, or the refusal.
 */
function refuseIdenticalSides(pair: ComparePair): ComparePair {
	if (pair.refusal !== undefined || pair.from !== pair.to) {
		return pair;
	}
	return {
		refusal: {
			success: false,
			error: `Both sides name the same board ("${pair.from}"), so there is nothing to compare.`,
		},
	};
}

/**
 * The two sides a compare request names, or the refusal.
 * @param req The request.
 * @returns The pair, or the refusal.
 */
function comparePairOf(req: Request): ComparePair {
	const fromParam = namedBoard(req, "from");
	if (fromParam === null) {
		return {
			refusal: { success: false, error: "compare needs at least one board: ?from=payments" },
		};
	}
	const toParam = namedBoard(req, "to");
	const fromKey = boardKey(parseBoardKey(fromParam));
	const pair: ComparePair =
		toParam === null
			? pairWithSibling(fromKey)
			: { from: fromKey, to: boardKey(parseBoardKey(toParam)) };
	return refuseIdenticalSides(pair);
}

/**
 * Compare two boards.
 * @param req The request.
 * @param res Its response.
 */
function compareRoute(req: Request, res: Response): void {
	try {
		const pair = comparePairOf(req);
		if (pair.refusal !== undefined) {
			res.status(400).json(pair.refusal);
			return;
		}
		const from = loadSideForCompare(pair.from);
		const to = loadSideForCompare(pair.to);
		const result = compareBoards(from, to);
		if (from.identity.board !== to.identity.board) {
			result.warnings.unshift(
				`"${pair.from}" and "${pair.to}" are different boards, not two variants of one. They still compare — ` +
					"node ids are the join key either way — but node ids are only guaranteed unique per board, so a " +
					"match here may be coincidence rather than the same architectural unit.",
			);
		}
		logger.info(
			`Compared "${pair.from}" against "${pair.to}": ` +
				`+${result.summary.nodesAdded} -${result.summary.nodesRemoved} ~${result.summary.nodesChanged} nodes`,
		);
		res.json(result);
	} catch (error) {
		answerBoardError(res, error, "Error comparing boards:");
	}
}

/**
 * Mount the compare route.
 * @param app The application to mount on.
 */
function mountCompareRoute(app: Express): void {
	app.get("/api/boards/compare", compareRoute);
}

export { mountCompareRoute };
