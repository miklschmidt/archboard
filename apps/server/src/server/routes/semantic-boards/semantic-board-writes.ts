import { readSemanticBoard } from "@archboard/board/store-read";
// The routes that change a semantic board.
//
// A semantic write states its own boundary: `writeSemanticBoard` takes the
// board-global lease, honours the claim, makes the expected-version check,
// advances the version once and writes the aggregate atomically (ADR 0023).
// What is left here is everything a request has to prove before it is allowed
// near that boundary.

import type { NextFunction, Request, Response } from "express";
import {
	asCommand,
	requiredVersion,
	statedContent,
	statedEnvelope,
	statesNoVersion,
	WriteEnvelopeSchema,
} from "#server/protocol/semantic-write/semantic-write-requests.ts";
import { z } from "zod";
import {
	BoardAdoptInputSchema,
	BoardShelveInputSchema,
	ResolutionInputSchema,
	BoardBranchInputSchema,
	BoardCreateInputSchema,
	VariantEditInputSchema,
} from "@archboard/board/commands";
import {
	type DescendantOutcome,
	adoptVariantTransition,
	branchVariantTransition,
	createBoardTransition,
	editVariantTransition,
	settleVariantTransition,
	shelveVariantTransition,
	writeSemanticBoard,
	type SemanticWriteResult,
} from "@archboard/board/store-write";
import { broadcast, settledChangeFields } from "@archboard/workbench/panes";
import { checkDoing } from "@archboard/board/doing";
import {
	announceDoing,
	refuseUndescribedWrite,
} from "#server/projections/board-announcements/board-announcements.ts";
import { vaultOfRequest } from "@archboard/workbench/host";

/**
 * Tell every pane holding this board that it has changed, so the pane asks for
 * a new picture, and put the change on the feed a thread's context reads. The
 * board is the news; what changed is not, because the pane patches nothing: it
 * reads the board again (ADR 0023).
 * @param vault The vault the board lives in.
 * @param result What the write did.
 * @param envelope What the write stated about itself.
 */
function announce(
	vault: string,
	result: SemanticWriteResult,
	envelope: z.infer<typeof WriteEnvelopeSchema>,
): void {
	if (result.outcome !== "applied") {
		return;
	}
	broadcast(
		{
			type: "board_note",
			board: result.location.key,
			// Two facts about the writer, and they stay two fields. `heldAs` is
			// custody: the identity the board was held under, shared by every write
			// of a claimed campaign. `by` is the agent session that made this
			// write, which is what lets that session skip its own news. Neither is
			// a surface: the pane a write said it was for used to ride here, and it
			// was read back to decide who should not be told.
			...settledChangeFields({
				version: result.board.version,
				by: envelope.session ?? null,
				heldAs: result.heldAs,
				...(result.renamedFrom === undefined ? {} : { renamedFrom: result.renamedFrom.key }),
			}),
		},
		vault,
		result.location.key,
	);
}

/**
 * What this write says it is doing, or the refusal for saying nothing.
 *
 * The rule survives the change of file kind: an agent write that describes
 * itself is what puts a line on the canvas for the person watching the board,
 * and a write that describes nothing is refused before it is applied. A
 * person's own write is never asked — they are the one at the board.
 * @param req The request.
 * @param res Its response.
 * @param envelope What the write stated about itself.
 * @returns The line, or null when the refusal has already been sent.
 */
function describedWrite(
	req: Request,
	res: Response,
	envelope: z.infer<typeof WriteEnvelopeSchema>,
): string | null {
	if (envelope.origin !== "agent") {
		return "";
	}
	const check = checkDoing(req.query["doing"]);
	if (!check.ok) {
		refuseUndescribedWrite(res, envelope.board, req.path, check.problem);
		return null;
	}
	return check.doing;
}

/**
 * Put what the write said it was doing up on every pane holding the board.
 * @param vault The vault the board lives in.
 * @param result What the write did.
 * @param doing The line the writer wrote.
 * @param envelope What the write stated about itself.
 */
function announceWork(
	vault: string,
	result: SemanticWriteResult,
	doing: string,
	envelope: z.infer<typeof WriteEnvelopeSchema>,
): void {
	if (result.outcome !== "applied" || doing === "") {
		return;
	}
	const entry = {
		doing,
		at: new Date().toISOString(),
		// Every semantic write is an agent's (ADR 0023), and which pane one was
		// running for is not a fact this line needs.
		by: "agent",
		kind: envelope.origin,
	};
	announceDoing(vault, result.location.key, entry);
}

/**
 * Answer a write with what it did.
 * @param res The response.
 * @param vault The vault the board lives in.
 * @param result What the write did.
 * @param envelope What the write stated about itself.
 */
function answerWrite(
	res: Response,
	vault: string,
	result: SemanticWriteResult,
	envelope: z.infer<typeof WriteEnvelopeSchema>,
): void {
	if (result.outcome === "applied") {
		announce(vault, result, envelope);
		const current = readSemanticBoard(vault, result.board.name);
		res.json({
			warnings: [...result.warnings, ...(current.ok ? current.warnings : [])],
			success: true,
			board: result.board,
			version: result.board.version,
			// A write that landed and a write that landed and left three proposals
			// needing somebody are two different answers, and `required` is which
			// one this is. Every draft the change reached is listed either way, so
			// an agent can act on both without reading the board back.
			reconciliation: needsAttention(result.descendants),
		});
		return;
	}
	answerRefusal(res, result);
}

/**
 * Answer a change the store refused: somebody else has the board or it moved
 * on (409), or the change cannot be made to the board as it stands (422).
 * @param res The response.
 * @param refused Why the store did nothing.
 */
function answerRefusal(
	res: Response,
	refused: Extract<SemanticWriteResult, { outcome: "rejected" }>,
): void {
	res
		.status(refused.code === "BOARD_HELD" || refused.code === "BOARD_VERSION_CONFLICT" ? 409 : 422)
		.json({
			success: false,
			code: refused.code,
			error: refused.problem,
			version: refused.version,
			...(refused.cause === undefined ? {} : { cause: refused.cause }),
			...(refused.openedBy === undefined ? {} : { openedBy: refused.openedBy }),
		});
}

/**
 * What a write left for somebody to settle, or null when it left nothing.
 *
 * Every affected draft is named, with what it did and what it is holding, and
 * the repair guidance rides along with each issue rather than being invented
 * again here: the thing that knows what to do about a disagreement is the thing
 * that found it.
 * @param descendants What every draft under the change did about it.
 * @returns The account, or null when nothing needs anybody.
 */
function needsAttention(descendants: readonly DescendantOutcome[] = []): {
	required: boolean;
	drafts: readonly DescendantOutcome[];
} | null {
	if (descendants.length === 0) {
		return null;
	}
	// Every draft the change reached, not only the ones in trouble. A sibling
	// that took the change cleanly is exactly what a caller needs to know went
	// somewhere: reporting only the failures makes a quiet success look like
	// nothing happened at all.
	return {
		required: descendants.some((one) => one.outcome !== "merged"),
		drafts: descendants,
	};
}

/**
 * Create a named semantic board.
 * @param req The request.
 * @param res Its response.
 * @param _next The next handler, which a write never calls.
 * @param signal Cancels waiting for the board's lease when the caller goes.
 */
async function createRoute(
	req: Request,
	res: Response,
	_next: NextFunction,
	signal: AbortSignal,
): Promise<void> {
	const envelope = statedEnvelope(req, res);
	if (envelope === null) {
		return;
	}
	const doing = describedWrite(req, res, envelope);
	if (doing === null || !statesNoVersion(req, res)) {
		return;
	}
	const create = statedContent(req, res, "create", false);
	if (create === null) {
		return;
	}
	const input = asCommand(BoardCreateInputSchema, { ...create, name: envelope.board }, res);
	if (input === null) {
		return;
	}
	const vault = vaultOfRequest(req);
	const result = await writeSemanticBoard({
		vault,
		board: envelope.board,
		writer: writerOf(envelope),
		transition: createBoardTransition(input),
		signal,
	});
	announceWork(vault, result, doing, envelope);
	answerWrite(res, vault, result, envelope);
}

/**
 * Apply one batch of stated changes to a semantic board.
 * @param req The request.
 * @param res Its response.
 * @param _next The next handler, which a write never calls.
 * @param signal Cancels waiting for the board's lease when the caller goes.
 */
async function editRoute(
	req: Request,
	res: Response,
	_next: NextFunction,
	signal: AbortSignal,
): Promise<void> {
	const envelope = statedEnvelope(req, res);
	if (envelope === null) {
		return;
	}
	const doing = describedWrite(req, res, envelope);
	if (doing === null) {
		return;
	}
	const expected = requiredVersion(req, res, envelope.board);
	if (expected === null) {
		return;
	}
	const body = statedContent(req, res, "edit", true);
	if (body === null) {
		return;
	}
	const edit = asCommand(VariantEditInputSchema, body, res);
	if (edit === null) {
		return;
	}
	const vault = vaultOfRequest(req);
	const result = await writeSemanticBoard({
		vault,
		board: envelope.board,
		writer: writerOf(envelope),
		transition: editVariantTransition(edit),
		expectedVersion: expected,
		signal,
	});
	announceWork(vault, result, doing, envelope);
	answerWrite(res, vault, result, envelope);
}

/**
 * Derive a proposal from a variant that is already on the board.
 *
 * A branch is a write like any other: it takes the same board-global lease,
 * states the version it read, advances the version once and is written
 * atomically. What makes it a branch rather than an edit is only which
 * transition it carries — and that transition adds a variant and moves nothing,
 * because designating a proposal as the implemented architecture is a separate
 * thing somebody has to say (ADR 0023).
 * @param req The request.
 * @param res Its response.
 * @param _next The next handler, which a write never calls.
 * @param signal Cancels waiting for the board's lease when the caller goes.
 */
async function branchRoute(
	req: Request,
	res: Response,
	_next: NextFunction,
	signal: AbortSignal,
): Promise<void> {
	const envelope = statedEnvelope(req, res);
	if (envelope === null) {
		return;
	}
	const doing = describedWrite(req, res, envelope);
	if (doing === null) {
		return;
	}
	const expected = requiredVersion(req, res, envelope.board);
	if (expected === null) {
		return;
	}
	const body = statedContent(req, res, "branch", true);
	if (body === null) {
		return;
	}
	const branch = asCommand(BoardBranchInputSchema, body, res);
	if (branch === null) {
		return;
	}
	const vault = vaultOfRequest(req);
	const result = await writeSemanticBoard({
		vault,
		board: envelope.board,
		writer: writerOf(envelope),
		transition: branchVariantTransition(branch),
		expectedVersion: expected,
		signal,
	});
	announceWork(vault, result, doing, envelope);
	answerWrite(res, vault, result, envelope);
}

/**
 * Settle what one proposal is holding, and let its own drafts move again.
 *
 * A resolution is a write like any other — the same lease, the same expected
 * version, one atomic write, one version advance — and it is deliberately not a
 * special path: what somebody decided about a disagreement is a change to the
 * board, and a board only changes one way.
 * @param req The request.
 * @param res Its response.
 * @param _next The next handler, which a write never calls.
 * @param signal Cancels waiting for the board's lease when the caller goes.
 */
async function resolveRoute(
	req: Request,
	res: Response,
	_next: NextFunction,
	signal: AbortSignal,
): Promise<void> {
	const stated = await statedWrite(req, res, "resolve");
	if (stated === null) {
		return;
	}
	const resolution = asCommand(ResolutionInputSchema, stated.body, res);
	if (resolution === null) {
		return;
	}
	await answerFrom(res, stated, settleVariantTransition(resolution), signal);
}

/**
 * Move the designation to a variant that is coherent and settled.
 * @param req The request.
 * @param res Its response.
 * @param _next The next handler, which a write never calls.
 * @param signal Cancels waiting for the board's lease when the caller goes.
 */
async function adoptRoute(
	req: Request,
	res: Response,
	_next: NextFunction,
	signal: AbortSignal,
): Promise<void> {
	const stated = await statedWrite(req, res, "adopt");
	if (stated === null) {
		return;
	}
	const adopting = asCommand(BoardAdoptInputSchema, stated.body, res);
	if (adopting === null) {
		return;
	}
	await answerFrom(res, stated, adoptVariantTransition(adopting), signal);
}

/**
 * Let one proposal go, under its name.
 * @param req The request.
 * @param res Its response.
 * @param _next The next handler, which a write never calls.
 * @param signal Cancels waiting for the board's lease when the caller goes.
 */
async function shelveRoute(
	req: Request,
	res: Response,
	_next: NextFunction,
	signal: AbortSignal,
): Promise<void> {
	const stated = await statedWrite(req, res, "shelve");
	if (stated === null) {
		return;
	}
	const shelving = asCommand(BoardShelveInputSchema, stated.body, res);
	if (shelving === null) {
		return;
	}
	await answerFrom(res, stated, shelveVariantTransition(shelving), signal);
}

/** Everything a write to an existing board states before it is a command. */
interface StatedWrite {
	readonly vault: string;
	readonly envelope: z.infer<typeof WriteEnvelopeSchema>;
	readonly doing: string;
	readonly expected: number;
	readonly body: Record<string, unknown>;
}

/**
 * Everything a write to an existing board has to prove before it is allowed
 * near the boundary: who is asking, what they are doing, which version they
 * read, and a stated command that is an object.
 * @param req The request.
 * @param res Its response.
 * @param field Which field of the body carries the command.
 * @returns What was stated, or null when the refusal has already been sent.
 */
async function statedWrite(
	req: Request,
	res: Response,
	field: "resolve" | "adopt" | "shelve" | "rename",
): Promise<StatedWrite | null> {
	const envelope = statedEnvelope(req, res);
	if (envelope === null) {
		return null;
	}
	const doing = describedWrite(req, res, envelope);
	if (doing === null) {
		return null;
	}
	const expected = requiredVersion(req, res, envelope.board);
	if (expected === null) {
		return null;
	}
	const body = statedContent(req, res, field, true);
	return body === null || body === undefined
		? null
		: { vault: vaultOfRequest(req), envelope, doing, expected, body };
}

/**
 * Take one stated command through the write boundary and answer it.
 * @param res The response.
 * @param stated What the request stated.
 * @param transition What to do to the board.
 * @param signal Cancels waiting for the board's lease when the caller goes.
 */
async function answerFrom(
	res: Response,
	stated: StatedWrite,
	transition: Parameters<typeof writeSemanticBoard>[0]["transition"],
	signal: AbortSignal,
): Promise<void> {
	const result = await writeSemanticBoard({
		vault: stated.vault,
		board: stated.envelope.board,
		writer: writerOf(stated.envelope),
		transition,
		expectedVersion: stated.expected,
		signal,
	});
	announceWork(stated.vault, result, stated.doing, stated.envelope);
	answerWrite(res, stated.vault, result, stated.envelope);
}

/**
 * Who a write envelope says is writing.
 * @param envelope The stated envelope.
 * @returns The writer.
 */
function writerOf(envelope: z.infer<typeof WriteEnvelopeSchema>): {
	kind: "agent" | "human";
	id?: string;
	reason?: string;
} {
	// No stated identity: an agent's write is held under its claim or under an
	// identity minted for that write alone, and a person's under one minted for
	// theirs. The pane a caller was running for used to be offered here, which
	// made a presentation surface an identity as well as a mailbox.
	return {
		kind: envelope.origin,
		...(envelope.reason === undefined ? {} : { reason: envelope.reason }),
	};
}

export {
	adoptRoute,
	announceWork,
	needsAttention,
	answerRefusal,
	answerWrite,
	branchRoute,
	createRoute,
	describedWrite,
	editRoute,
	resolveRoute,
	shelveRoute,
	statedWrite,
	type StatedWrite,
	writerOf,
};
