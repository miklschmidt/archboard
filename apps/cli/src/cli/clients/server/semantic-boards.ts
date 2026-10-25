import {
	VaultCheckSchema,
	VaultDiagnosticSchema,
	type VaultDiagnostic,
	type VaultCheck,
} from "@archboard/board/policy";
// How the CLI reaches a semantic board: through the running Archboard server, never the
// vault directly.
//
// The server is the one process that can take the board's lease, check the
// version, write the aggregate and then tell the panes about it. A command that
// wrote the file itself would get the first three and lose the fourth, so every
// pane on screen would sit there showing the board as it was until somebody
// reloaded.

import { z } from "zod";
import { CodeCheckAnswerSchema } from "@archboard/code-intel/code-check";
import type { HistoricalCorrectionInput } from "@archboard/board/commands";
import { requestJson, statedInvocation } from "@archboard/server-lifecycle/server-client";
import { BoardMoveAnswerSchema, type BoardMoveAnswer } from "@archboard/board/commands";
import {
	SemanticBoardSchema,
	SemanticBoardLevelSchema,
	type SemanticBoard,
} from "@archboard/board/document";
import { ReconciliationIssueSchema } from "@archboard/board/reconciliation";
import {
	SemanticRenderReplySchema,
	type FontSource,
	type SemanticRenderReply,
	type LayoutEngineName,
	type StandaloneTheme,
	type LegendLayout,
} from "@archboard/board/render-reply";

/** One board in the vault's semantic listing. */
const SemanticBoardEntrySchema = z.object({
	name: z.string(),
	key: z.string(),
	level: SemanticBoardLevelSchema.optional(),
});
type SemanticBoardEntry = z.infer<typeof SemanticBoardEntrySchema>;

const ListingReplySchema = z.object({
	success: z.literal(true),
	levels: z.array(SemanticBoardLevelSchema),
	boards: z.array(SemanticBoardEntrySchema),
});
type SemanticBoardListing = z.infer<typeof ListingReplySchema>;

const BoardReplySchema = z.object({
	success: z.literal(true),
	board: SemanticBoardSchema,
	warnings: z.array(VaultDiagnosticSchema).default([]),
});

/**
 * What a write left for somebody to settle.
 *
 * Carried through rather than dropped: a write that landed and a write that
 * landed and left three proposals needing somebody are two different outcomes,
 * and a caller that only ever hears "success" cannot tell them apart — which
 * means nobody is told, because the caller is the only one listening.
 */
const ReconciliationReportSchema = z.object({
	/** Whether anything actually needs a person. */
	required: z.boolean(),
	/** Every draft the change reached, in the order it reached them. */
	drafts: z.array(
		z.object({
			variant: z.string(),
			name: z.string(),
			/**
			 * What this draft did: took the change, kept an answer of its own
			 * against it, or was not brought forward at all because the state it is
			 * derived from is itself in dispute. All three are outcomes a caller
			 * has to be able to read — a client that knows only two refuses the
			 * answer to a write that blocked something, which is precisely the
			 * write somebody has to be told about.
			 */
			outcome: z.enum(["merged", "conflicted", "blocked"]),
			blockedBy: z.string().optional(),
			issues: z.array(ReconciliationIssueSchema),
		}),
	),
});
type ReconciliationReport = z.infer<typeof ReconciliationReportSchema>;

const WriteReplySchema = z.object({
	warnings: z.array(VaultDiagnosticSchema).default([]),
	success: z.literal(true),
	board: SemanticBoardSchema,
	version: z.int(),
	reconciliation: ReconciliationReportSchema.nullable().default(null),
});

/** A board as it now stands, and what the write left for somebody to settle. */
interface SemanticWriteAnswer {
	readonly board: SemanticBoard;
	readonly reconciliation: ReconciliationReport | null;
	readonly warnings: VaultDiagnostic[];
}

/**
 * What every write states about itself: who is writing, and what they already
 * saw. The line the writer is working under rides in the query string for the
 * same reason it does on every other write — a line that travelled inside the
 * body would be one careless spread away from being written into the board.
 * @param path The route.
 * @param expected The version the writer saw: the one this invocation was told, unless stated.
 * @returns The route with the writer's claims attached.
 */
function withWriterClaims(path: string, expected = statedInvocation().expectedVersion): string {
	const query = new URLSearchParams();
	const doing = statedInvocation().doing;
	if (doing !== null) {
		query.set("doing", doing);
	}
	if (typeof expected === "number") {
		query.set("expectVersion", String(expected));
	}
	const search = query.toString();
	return search === "" ? path : `${path}?${search}`;
}

/**
 * The session this invocation is writing as, when it was told one.
 * @returns The field to state, or nothing when no session was named.
 */
function statedSession(): { session?: string } {
	const session = statedInvocation().session;
	return session === null ? {} : { session };
}

/**
 * Post a stated command to the server.
 * @param path The route.
 * @param body What the command states.
 * @returns The board as it now stands.
 */
async function postSemantic(
	path: string,
	body: Readonly<Record<string, unknown>>,
): Promise<SemanticWriteAnswer> {
	const reply = await requestJson<unknown>(withWriterClaims(path), {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		// The pane goes on every write or on none of them. A rule threaded through
		// five call sites is a rule one of them gets away with not meeting, and the
		// one that forgot would be a write nobody could attribute.
		// The session, when this invocation named one: it rides in the body with
		// the rest of what the write says about itself rather than in the query,
		// because it is a fact about the writer and not a precondition on the write.
		body: JSON.stringify({ ...body, ...statedSession() }),
	});
	const answered = WriteReplySchema.parse(reply);
	return {
		board: answered.board,
		reconciliation: answered.reconciliation,
		warnings: answered.warnings,
	};
}

/**
 * Every semantic board the server's vault holds.
 * @returns The boards, by name.
 */
async function listSemanticBoardsOnServer(): Promise<SemanticBoardListing> {
	return ListingReplySchema.parse(await requestJson<unknown>("/api/semantic-boards"));
}

/**
 * One board's whole aggregate.
 * @param board The board name.
 * @returns The board.
 */
async function readSemanticBoardOnServer(board: string): Promise<SemanticBoard> {
	const reply = await requestJson<unknown>(
		`/api/semantic-boards/board?board=${encodeURIComponent(board)}`,
	);
	return BoardReplySchema.parse(reply).board;
}

/**
 * One variant of one board, drawn.
 * @param board The board name.
 * @param options Which variant and which theme.
 * @param options.variant The variant to draw; the current one when absent.
 * @param options.view A view id or name; the whole variant when absent.
 * @param options.against A variant id or name to read the variant against; the board's own reading when absent.
 * @param options.theme Which colour scheme to draw for, or `auto` for both.
 * @param options.fonts Where the drawn faces come from; embedded makes the file self-contained.
 * @param options.layout Which layout engine lays it out; the default one when absent.
 * @param options.comparison Whether the picture carries comparison marks and removed context.
 * @param options.title Words drawn above the picture.
 * @param options.titled Draws the names of what is drawn above the picture, when no words are given.
 * @param options.legend How the legend is laid out beside the picture.
 * @param options.legendOnly Draws the legend without the picture.
 * @returns The picture, or the fact that there is nothing on the board yet.
 */
async function renderSemanticBoardOnServer(
	board: string,
	options: {
		variant?: string;
		view?: string;
		against?: string;
		theme?: StandaloneTheme;
		fonts?: FontSource;
		layout?: LayoutEngineName;
		comparison?: "on" | "off";
		title?: string;
		titled?: "on";
		legend?: LegendLayout;
		legendOnly?: "on";
	} = {},
): Promise<SemanticRenderReply> {
	const query = new URLSearchParams({ board });
	for (const [name, value] of Object.entries(options)) query.set(name, value);
	return SemanticRenderReplySchema.parse(
		await requestJson<unknown>(`/api/semantic-boards/render?${query.toString()}`),
	);
}

/**
 * Create a named semantic board.
 *
 * The board's name rides in the envelope beside the stated architecture rather
 * than inside it, so every write states which board it is about in one place
 * and the route need not dig the name out of the content to take its lease.
 * @param board The board name.
 * @param create The architecture as it was asked for.
 * @returns The board as it now stands.
 */
async function createSemanticBoardOnServer(
	board: string,
	create: Readonly<Record<string, unknown>>,
): Promise<SemanticWriteAnswer> {
	return postSemantic("/api/semantic-boards/create", { board, create });
}

/**
 * Apply one batch of stated changes to a semantic board.
 * @param board The board name.
 * @param edit The changes as stated.
 * @returns The board as it now stands.
 */
async function editSemanticBoardOnServer(
	board: string,
	edit: Readonly<Record<string, unknown>>,
): Promise<SemanticWriteAnswer> {
	return postSemantic("/api/semantic-boards/edit", { board, edit });
}

/**
 * Settle what one proposal is holding, and let its own drafts move again.
 * @param board The board name.
 * @param resolve Which disagreements this answers, and how.
 * @returns The board as it now stands, and what is left to settle.
 */
async function resolveSemanticBoardOnServer(
	board: string,
	resolve: Readonly<Record<string, unknown>>,
): Promise<SemanticWriteAnswer> {
	return postSemantic("/api/semantic-boards/resolve", { board, resolve });
}

/**
 * Move the designation to a variant that is coherent and settled.
 * @param board The board name.
 * @param adopt Which variant, and why.
 * @returns The board as it now stands.
 */
async function adoptSemanticBoardOnServer(
	board: string,
	adopt: Readonly<Record<string, unknown>>,
): Promise<SemanticWriteAnswer> {
	return postSemantic("/api/semantic-boards/adopt", { board, adopt });
}

/**
 * Let one proposal go, under its name.
 * @param board The board name.
 * @param shelve Which variant, and why it was let go.
 * @returns The board as it now stands.
 */
async function shelveSemanticBoardOnServer(
	board: string,
	shelve: Readonly<Record<string, unknown>>,
): Promise<SemanticWriteAnswer> {
	return postSemantic("/api/semantic-boards/shelve", { board, shelve });
}

/**
 * Give a board, or one variant of it, another name. Its old name is kept, and
 * goes on opening it (ADR 0036).
 * @param board The board name, as it is now or as it was.
 * @param rename The name asked for, and the variant when it is a variant's.
 * @returns The board as it now stands, under the name it has now.
 */
async function renameSemanticBoardOnServer(
	board: string,
	rename: Readonly<Record<string, unknown>>,
): Promise<SemanticWriteAnswer> {
	return postSemantic("/api/semantic-boards/rename", { board, rename });
}

/**
 * Derive a proposal from a variant this board already has.
 *
 * Nothing about what it proposes is said here. A branch carries its
 * predecessor over whole, identities and all, which is what makes the two
 * comparable; what it actually changes is said afterwards, as ordinary edits.
 * @param board The board name.
 * @param branch Which variant to derive from, and what to call the proposal.
 * @returns The board as it now stands.
 */
async function branchSemanticBoardOnServer(
	board: string,
	branch: Readonly<Record<string, unknown>>,
): Promise<SemanticWriteAnswer> {
	return postSemantic("/api/semantic-boards/branch", { board, branch });
}

/**
 * Move a board, every variant of it, into another repository's vault (ADR 0051).
 * It states what it is doing, which session asked and the version it read, as
 * every write does.
 * @param board The board name, as it is now or as it was.
 * @param to The target vault's directory, as its real path.
 * @returns The board as it now stands in the target vault, both ends of the
 *   move and every drill-down the move rewrote.
 */
async function moveSemanticBoardOnServer(board: string, to: string): Promise<BoardMoveAnswer> {
	const reply = await requestJson<unknown>(withWriterClaims("/api/semantic-boards/move"), {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ board, move: { to }, ...statedSession() }),
	});
	return BoardMoveAnswerSchema.parse(reply);
}

/** The candidate and its code evidence, before a historical correction writes. */
const HistoricalCorrectionPreviewAnswerSchema = z.object({
	success: z.literal(true),
	board: SemanticBoardSchema,
	previousVersion: z.int(),
	reconciliation: ReconciliationReportSchema.nullable(),
	codeCheck: CodeCheckAnswerSchema.pick({ timings: true, findings: true, skipped: true }),
});

/** Timestamp-based revision guesses; callers must inspect and state explicit commits. */
const HistoricalCorrectionSuggestionsAnswerSchema = z.object({
	success: z.literal(true),
	board: z.string(),
	variant: z.string(),
	at: z.string(),
	revisions: z.array(
		z.object({ repo: z.string(), commit: z.string().nullable(), problem: z.string().optional() }),
	),
});

/**
 * Preview or apply a correction to an already built variant.
 * @param board The board name.
 * @param correct The stated correction and explicit repository revisions.
 * @param apply Whether to write the candidate.
 * @returns The checked candidate or the written board.
 */
async function correctHistoricalBoardOnServer(
	board: string,
	correct: HistoricalCorrectionInput,
	apply: boolean,
) {
	if (apply) return postSemantic("/api/semantic-boards/correct", { board, correct });
	return HistoricalCorrectionPreviewAnswerSchema.parse(
		await requestJson<unknown>(withWriterClaims("/api/semantic-boards/correct-preview"), {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ board, correct, ...statedSession() }),
		}),
	);
}

/**
 * Suggest revisions near the historical variant's recorded time.
 * @param board The board name.
 * @param variant The historical variant.
 * @returns Unconfirmed commit guesses for each repository.
 */
async function suggestHistoricalCommitsOnServer(board: string, variant: string) {
	const query = new URLSearchParams({ board, variant });
	return HistoricalCorrectionSuggestionsAnswerSchema.parse(
		await requestJson<unknown>(`/api/semantic-boards/correct-suggest?${query.toString()}`),
	);
}

export {
	HistoricalCorrectionPreviewAnswerSchema,
	HistoricalCorrectionSuggestionsAnswerSchema,
	correctHistoricalBoardOnServer,
	suggestHistoricalCommitsOnServer,
};

const DiscardReplySchema = z.object({
	success: z.literal(true),
	discarded: z.object({ board: z.string(), version: z.int() }),
});

/**
 * Delete a board, every variant of it, under its lease.
 *
 * It states what it is doing and which session asked the way every write does,
 * because it is one: a person watching the board is told why it went. A board
 * changed since the version stated is refused and kept.
 * @param board The board name.
 * @param expectedVersion The version the caller read the board at; the one this invocation
 *   was told when absent.
 * @returns The board that went, and the version it was at when it did.
 */
async function discardSemanticBoardOnServer(
	board: string,
	expectedVersion?: number,
): Promise<z.infer<typeof DiscardReplySchema>["discarded"]> {
	const path = withWriterClaims("/api/semantic-boards/discard", expectedVersion);
	const reply = await requestJson<unknown>(path, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ board, ...statedSession() }),
	});
	return DiscardReplySchema.parse(reply).discarded;
}

export {
	SemanticBoardEntrySchema,
	type SemanticBoardEntry,
	type SemanticBoardListing,
	ReconciliationReportSchema,
	type ReconciliationReport,
	type SemanticWriteAnswer,
	adoptSemanticBoardOnServer,
	renameSemanticBoardOnServer,
	shelveSemanticBoardOnServer,
	resolveSemanticBoardOnServer,
	listSemanticBoardsOnServer,
	readSemanticBoardOnServer,
	renderSemanticBoardOnServer,
	createSemanticBoardOnServer,
	editSemanticBoardOnServer,
	branchSemanticBoardOnServer,
	discardSemanticBoardOnServer,
	moveSemanticBoardOnServer,
};

/**
 * Run the exact checker the browser uses.
 * @param signal Cancels the caller's request.
 * @returns The interpreted policy and vault diagnostics.
 */
async function checkSemanticVaultOnServer(signal?: AbortSignal): Promise<VaultCheck> {
	return VaultCheckSchema.parse(
		await requestJson<unknown>("/api/vault/check", signal === undefined ? undefined : { signal }),
	);
}
/**
 * Read one board with current vocabulary warnings.
 * @param board The board name.
 * @returns The board and its warnings.
 */
async function readSemanticBoardAnswerOnServer(board: string) {
	return BoardReplySchema.parse(
		await requestJson<unknown>(`/api/semantic-boards/board?board=${encodeURIComponent(board)}`),
	);
}
export { checkSemanticVaultOnServer, readSemanticBoardAnswerOnServer };
