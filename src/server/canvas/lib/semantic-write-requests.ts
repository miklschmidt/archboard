// What a request has to prove before it is allowed near the write boundary.
//
// Who is asking, what they say they are doing, which version of the board they
// read, and a stated command that is actually a command. None of it touches a
// board: a request that fails any of it is answered here and nothing is
// written, which is what keeps a caller's mistake from becoming a version
// advance that tells every pane the board changed.

import type { Request, Response } from "express";
import { z } from "zod";
import { semanticBoardAddress } from "@/runtime/semantic-board-store/index";

/**
 * Read a stated command against its schema, answering the caller when it is
 * not one.
 *
 * A command that does not fit the contract is the caller's mistake and is
 * reported as one, with what was wrong. Letting the parse throw would make it a
 * five-hundred, which says the canvas broke when the truth is that the request
 * did.
 * @param schema What the command has to be.
 * @param schema.safeParse How that schema reads a value without throwing.
 * @param value What arrived.
 * @param res The response.
 * @returns The command, or null when the refusal has already been sent.
 */
function asCommand<Shape>(
	schema: {
		safeParse: (
			value: unknown,
		) => { success: true; data: Shape } | { success: false; error: z.ZodError };
	},
	value: unknown,
	res: Response,
): Shape | null {
	const parsed = schema.safeParse(value);
	if (parsed.success) {
		return parsed.data;
	}
	res.status(400).json({
		success: false,
		code: "BAD_REQUEST",
		error: `This is not a change this board can take: ${z.prettifyError(parsed.error)}`,
	});
	return null;
}

/**
 * What a write states about who is asking.
 *
 * Deliberately no writer identity for an agent. The lease is reentrant by
 * identity, so an identity a caller could choose is an identity two callers
 * could share, and two unrelated writes admitted as one writer is the mutual
 * exclusion quietly gone. `writeSemanticBoard` mints one per write instead, or
 * uses the standing claim's when there is one. A person states their pane,
 * because a pane asking twice really is the same writer.
 */
const WriteEnvelopeSchema = z.object({
	board: z.string().min(1),
	origin: z.enum(["agent", "human"]).default("agent"),
	// Which agent session made this write, when one said so. Stated rather than
	// proven, like `--doing`: nothing on a board rests on it, and all it is for
	// is letting a session recognise its own writes among the news it is told.
	// A write that states nothing is unattributable and is delivered to
	// everybody, its own author included — redundancy rather than silence.
	session: z.string().min(1).max(128).optional(),
	reason: z.string().min(1).optional(),
});

/**
 * The envelope a write stated, or nothing when it did not state one.
 *
 * A body that is not an object, or that is missing the board it is about, is a
 * caller that got its request wrong. Spreading it into an empty command would
 * turn that mistake into a write — an empty edit that still advances the board's
 * version and tells every pane the board changed.
 * @param req The request.
 * @param res Its response.
 * @returns The envelope, or null when the refusal has already been sent.
 */
function statedEnvelope(req: Request, res: Response): z.infer<typeof WriteEnvelopeSchema> | null {
	const parsed = WriteEnvelopeSchema.safeParse(req.body);
	if (parsed.success) {
		return usableBoard(parsed.data, res);
	}
	res.status(400).json({
		success: false,
		code: "BAD_REQUEST",
		error: `This is not a semantic board write: ${z.prettifyError(parsed.error)}`,
	});
	return null;
}

/**
 * The same envelope, once the board it names is a board that can exist.
 *
 * A write names a board and never a variant of one: every variant of a semantic
 * board lives inside the one document, so `payments@<variantId>` is a caller
 * addressing a write the way a pane addresses what it is showing. The store
 * refuses that name — it is not a usable board name — and letting it get that
 * far turns a caller's mistake into an internal error. Said here, in the one
 * place every write passes through, with what is actually wrong.
 * @param envelope The envelope as stated.
 * @param res The response to refuse on.
 * @returns The envelope, or null when the refusal has already been sent.
 */
function usableBoard(
	envelope: z.infer<typeof WriteEnvelopeSchema>,
	res: Response,
): z.infer<typeof WriteEnvelopeSchema> | null {
	try {
		semanticBoardAddress(envelope.board);
		return envelope;
	} catch (error) {
		res.status(400).json({
			success: false,
			code: "BAD_BOARD_NAME",
			error:
				`"${envelope.board}" is not a board a write can name: ` +
				`${error instanceof Error ? error.message : "the name is not usable"}. ` +
				"A write names the board; the variant it is about is stated inside the command.",
		});
		return null;
	}
}

/**
 * The stated content of a command, when it is content at all.
 *
 * Absent is a real answer for a create — an empty board is a board somebody
 * meant to start — and never for an edit. Anything present that is not an
 * object is refused either way rather than becoming an empty command.
 * @param req The request.
 * @param res Its response.
 * @param field Which field of the body carries it.
 * @param required Whether the command needs it.
 * @returns The content, undefined when absent and allowed, or null when refused.
 */
function statedContent(
	req: Request,
	res: Response,
	field: "create" | "edit" | "branch" | "resolve" | "adopt",
	required: boolean,
): Record<string, unknown> | undefined | null {
	const stated: unknown = req.body[field];
	if (stated === undefined && !required) {
		return undefined;
	}
	const object = objectOrNothing(stated);
	if (object !== undefined) {
		return object;
	}
	res.status(400).json({
		success: false,
		code: "BAD_REQUEST",
		error:
			`This write's \`${field}\` must be an object stating what to put on the board` +
			(required ? "." : ", or be left out entirely to start an empty board."),
	});
	return null;
}

/**
 * A value read as a stated command, when it is one.
 * @param value Whatever arrived in the body.
 * @returns The object, or undefined when it is not one.
 */
function objectOrNothing(value: unknown): Record<string, unknown> | undefined {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return undefined;
	}
	const fields: Record<string, unknown> = {};
	for (const [key, held] of Object.entries(value)) {
		fields[key] = held;
	}
	return fields;
}

/** A stated version, or why what was stated is not one. */
type StatedVersion =
	| { readonly ok: true; readonly version: number | undefined }
	| { readonly ok: false; readonly problem: string };

/**
 * The version the writer says it read, off the query string.
 *
 * In the query rather than the body for the same reason the line a writer is
 * working under is: it is a precondition on the write, not part of the content,
 * and content is one careless spread away from being written into the board.
 *
 * Anything present but unreadable is refused rather than treated as absent. A
 * writer that meant to state a version and spelled it wrong must not be handed
 * the unchecked write it was trying to avoid.
 * @param req The request.
 * @returns The version, or why the query cannot be read as one.
 */
function expectedVersion(req: Request): StatedVersion {
	const stated = req.query["expectVersion"];
	if (stated === undefined) {
		return { ok: true, version: undefined };
	}
	if (typeof stated !== "string" || !/^\d+$/u.test(stated)) {
		return {
			ok: false,
			problem:
				"expectVersion must be the whole number a read of this board reported, " +
				`and "${typeof stated === "string" ? stated : "a repeated value"}" is not one`,
		};
	}
	return { ok: true, version: Number(stated) };
}

/**
 * The version an edit is checked against, or the refusal for not stating one.
 *
 * A semantic edit states the version it read. Without one the write would be
 * applied to whatever the board happens to say now, which is exactly how one
 * agent's change quietly disappears under another's. Creation is the exception:
 * there is no prior version to have read.
 * @param req The request.
 * @param res Its response.
 * @param board The board the write names.
 * @returns The version, or null when the refusal has already been sent.
 */
function requiredVersion(req: Request, res: Response, board: string): number | null {
	const stated = expectedVersion(req);
	if (!stated.ok) {
		res.status(400).json({ success: false, code: "BAD_EXPECTED_VERSION", error: stated.problem });
		return null;
	}
	if (stated.version === undefined) {
		res.status(400).json({
			success: false,
			code: "EXPECT_VERSION_REQUIRED",
			error:
				`This write to "${board}" does not say which version of the board it was written against, ` +
				"so there is no way to tell whether somebody else has changed it since. Read the board " +
				"first with archboard semantic show " +
				board +
				" and pass the version it reports as --expect-version. Do not read it again " +
				"immediately before writing: that would make the check pass by construction and hide the " +
				"change you were meant to notice. Nothing was written.",
			board,
		});
		return null;
	}
	return stated.version;
}

/**
 * Whether a create states no version, which is the only thing it may state.
 *
 * A board that does not exist yet has no version anybody can have read, so
 * `--expect-version` here is either a misunderstanding or a command aimed at
 * the wrong board. Both are worth saying out loud rather than ignoring.
 * @param req The request.
 * @param res Its response.
 * @returns True when the create may go ahead; false when the refusal has been sent.
 */
function statesNoVersion(req: Request, res: Response): boolean {
	const stated = expectedVersion(req);
	if (stated.ok && stated.version === undefined) {
		return true;
	}
	res.status(400).json({
		success: false,
		code: stated.ok ? "EXPECT_VERSION_UNSUPPORTED" : "BAD_EXPECTED_VERSION",
		error: stated.ok
			? "A board that does not exist yet has no version to have been read, so --expect-version " +
				"cannot be satisfied here. Create the board without one."
			: stated.problem,
	});
	return false;
}

export {
	asCommand,
	expectedVersion,
	requiredVersion,
	statedContent,
	statedEnvelope,
	statesNoVersion,
	WriteEnvelopeSchema,
};
