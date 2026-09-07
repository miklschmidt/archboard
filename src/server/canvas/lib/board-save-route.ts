import type { Request, Response } from "express";
import { logger } from "@/runtime/engine/logger";
import { getOrCreateBoard } from "@/runtime/engine/board-store";
import type { BoardContent } from "@/runtime/engine/board-io";
import {
	boardKey,
	classifyBoardSave,
	validateLevel,
	validateVariant,
	vaultPathFor,
} from "@/runtime/engine/board";
import type { BoardIdentity } from "@/runtime/engine/board";
import { holdOn } from "@/runtime/engine/board-hold";
import { restampVariant } from "@/runtime/engine/promote";
import type { BoardWriteTarget } from "@/runtime/engine/board-write";
import { answerBoardError } from "@/server/canvas/lib/board-response";
import {
	answerBoardWrite,
	boardTargetFromRequest,
	bodyOf,
	identityFromParams,
	identityResponse,
} from "@/server/canvas/lib/request-board";

/**
 * One address field of a save body, as the non-empty string it must be.
 * @param body The request body.
 * @param name The field.
 * @returns The value, or undefined when the field is absent or not a string.
 */
function saveField(body: Record<string, unknown>, name: string): string | undefined {
	const value = body[name];
	return typeof value === "string" && value ? value : undefined;
}

/**
 * The identity a save writes to. With a name, this is a save-as; without one,
 * the board keeps its own identity and only the fields actually passed are
 * changed.
 *
 * Either way the level comes across unless the caller states another one.
 * A branch is the same subject at the same abstraction tier, and level is
 * board identity from a vocabulary the project grew on purpose, so
 * `--as payments@option-a` must not quietly produce a proposal at no level
 * while the board it came from sits at system (TASK-039). `--variant`
 * always did this, by keeping the source's identity; `--as` built a fresh
 * one and dropped it.
 * @param body The request body.
 * @param sourceIdentity The identity of the board being saved.
 * @returns The target identity.
 */
function saveTargetIdentity(
	body: Record<string, unknown>,
	sourceIdentity: BoardIdentity,
): BoardIdentity {
	const level = saveField(body, "level") ?? sourceIdentity.level;
	const levelPart = level === undefined ? {} : { level };
	const variantPart = saveAsVariant(body);
	const name = saveField(body, "name");
	if (name !== undefined) {
		return identityFromParams({ board: name, ...variantPart, ...levelPart });
	}
	return {
		...sourceIdentity,
		...(variantPart.variant === undefined ? {} : { variant: validateVariant(variantPart.variant) }),
		...(levelPart.level === undefined ? {} : { level: validateLevel(levelPart.level) }),
	};
}

/**
 * The variant a save states, as a spreadable part so an unstated one changes
 * nothing about the identity it is spread into.
 * @param body The request body.
 * @returns The variant part, empty when the save stated none.
 */
function saveAsVariant(body: Record<string, unknown>): { variant?: string } {
	const variant = saveField(body, "variant");
	return variant === undefined ? {} : { variant };
}

/**
 * The delta a branching save reports: what the destination gained, kept and lost.
 * @param saved The elements written.
 * @param destinationBefore The destination's content before the save.
 * @returns The delta.
 */
function branchDelta(
	saved: ReturnType<typeof restampVariant>,
	destinationBefore: BoardContent,
): { created: typeof saved; updated: typeof saved; deleted: string[] } {
	const savedIds = new Set(saved.map((element) => element.id));
	return {
		created: saved.filter((element) => !destinationBefore.elements.has(element.id)),
		updated: saved.filter((element) => destinationBefore.elements.has(element.id)),
		deleted: Array.from(destinationBefore.elements.keys()).filter((id) => !savedIds.has(id)),
	};
}

/**
 * Write a board to the vault. With no address it saves the board the canvas is
 * holding under its own identity; with one it saves as that board instead
 * (which is also how the scratch board gets a name).
 * @param req The request.
 * @param res Its response.
 */
function saveBoardRoute(req: Request, res: Response): void {
	try {
		const body = bodyOf(req);
		const source = boardTargetFromRequest(req, "Saving a board");
		// The human's "overwrite it anyway" — one of the three outcomes a conflict
		// offers. Never set by archboard on its own behalf.
		const force = body["force"] === true;
		const targetIdentity = saveTargetIdentity(body, source.board.identity);
		const file = vaultPathFor(targetIdentity);
		const targetKey = boardKey(targetIdentity);
		// Saving under another address is branching, and the branch is a board of
		// its own variant, so every node on it is restamped to say so. Without
		// that, `save --as payments@option-a` leaves twelve nodes claiming
		// "current" and compare reports the whole board changed (TASK-035). A
		// plain save is deliberately left alone: a node that records a foreign
		// variant on a board nobody branched really was copied in, and that is
		// what `variantAnomaly` is for.
		const kind = classifyBoardSave(source.key, targetKey);
		// Both senses of "wrote somewhere else": naming scratch and branching a
		// board that has a home.
		const branched = kind !== "same-board";
		const { board: savedBoard } = getOrCreateBoard(targetIdentity);
		savedBoard.file = file;
		const target: BoardWriteTarget = { key: targetKey, board: savedBoard };
		const heldSource = holdOn(source.key);
		answerBoardWrite(res, {
			source,
			origin: "agent",
			// Save is the explicit resolution for a held board. It writes the note
			// chosen by the person instead of adding another change to the held copy.
			save: { target, force },
			/**
			 * Restamp the elements for a branch and report the destination's delta.
			 * @param content The source content under the lock.
			 * @param destinationBefore The destination's content before the save.
			 * @returns The (empty) value and, for a branch, the delta.
			 */
			mutation: (content, destinationBefore) => {
				const saved = branched
					? restampVariant(Array.from(content.elements.values()), targetIdentity.variant)
					: Array.from(content.elements.values());
				content.elements = new Map(saved.map((element) => [element.id, element]));
				return {
					value: null,
					...(branched ? { delta: branchDelta(saved, destinationBefore) } : {}),
				};
			},
			/**
			 * Log the save once it has persisted.
			 * @param outcome The write's outcome.
			 * @param outcome.content The board content after the write.
			 * @param outcome.written The persisted note, or null when nothing was written.
			 */
			afterPersist: ({ content, written }) => {
				logger.info(
					`Board saved: "${targetKey}" (${written?.elementCount ?? content.elements.size} elements) -> ${file}` +
						(branched ? ` [${kind}]` : ""),
				);
			},
			/**
			 * Where the board was saved, and which hold that resolved.
			 * @param outcome The write's outcome.
			 * @param outcome.content The board content after the write.
			 * @param outcome.written The persisted note, or null when nothing was written.
			 * @returns The response body.
			 */
			answer: ({ content, written }) => {
				if (!written) {
					throw new Error(`Saving "${targetKey}" did not write its note.`);
				}
				return {
					success: true,
					...identityResponse(targetKey, savedBoard, content),
					file,
					elements: written.elementCount,
					overwrote: written.overwrote,
					...(force && written.overwrote ? { forced: true } : {}),
					saveKind: kind,
					savedFrom: source.key,
					...(heldSource
						? {
								resolvedHold: {
									board: source.key,
									outcome: branched ? "elsewhere" : "overwrite",
									writes: heldSource.writes,
									since: heldSource.since,
								},
							}
						: {}),
				};
			},
		});
	} catch (error) {
		answerBoardError(res, error, "Error saving board:");
	}
}
export { saveBoardRoute };
