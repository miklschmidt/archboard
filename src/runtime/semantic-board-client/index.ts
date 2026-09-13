import {
	VaultCheckSchema,
	VaultDiagnosticSchema,
	type VaultDiagnostic,
	type VaultCheck,
} from "@/shared/semantic-policy/index";
// How the CLI reaches a semantic board: through the running canvas, never the
// vault directly.
//
// The canvas is the one process that can take the board's lease, check the
// version, write the aggregate and then tell the panes about it. A command that
// wrote the file itself would get the first three and lose the fourth, so every
// pane on screen would sit there showing the board as it was until somebody
// reloaded. That is the same reason the Excalidraw commands go through the
// canvas, and it has not changed.

import { z } from "zod";
import {
	currentExpectedVersion,
	currentWriteDoing,
	currentWriteSession,
	requestJson,
} from "@/runtime/engine/canvas-client";
import {
	SemanticBoardSchema,
	SemanticBoardLevelSchema,
	ReconciliationIssueSchema,
	SemanticRenderReplySchema,
	type FontSource,
	type SemanticBoard,
	type SemanticRenderReply,
} from "@/shared/semantic-board/index";

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
 * @returns The route with the writer's claims attached.
 */
function withWriterClaims(path: string): string {
	const query = new URLSearchParams();
	const doing = currentWriteDoing();
	if (doing !== null) {
		query.set("doing", doing);
	}
	const expected = currentExpectedVersion();
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
	const session = currentWriteSession();
	return session === null ? {} : { session };
}

/**
 * Post a stated command to the canvas.
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
 * Every semantic board the canvas's vault holds.
 * @returns The boards, by name.
 */
async function listSemanticBoardsOnCanvas(): Promise<SemanticBoardListing> {
	return ListingReplySchema.parse(await requestJson<unknown>("/api/semantic-boards"));
}

/**
 * One board's whole aggregate.
 * @param board The board name.
 * @returns The board.
 */
async function readSemanticBoardOnCanvas(board: string): Promise<SemanticBoard> {
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
 * @param options.theme Which colour scheme to draw for.
 * @param options.fonts Where the drawn faces come from; embedded makes the file self-contained.
 * @returns The picture, or the fact that there is nothing on the board yet.
 */
async function renderSemanticBoardOnCanvas(
	board: string,
	options: {
		variant?: string;
		view?: string;
		theme?: "light" | "dark";
		fonts?: FontSource;
	} = {},
): Promise<SemanticRenderReply> {
	const query = new URLSearchParams({ board });
	if (options.variant !== undefined) {
		query.set("variant", options.variant);
	}
	if (options.view !== undefined) {
		query.set("view", options.view);
	}
	if (options.theme !== undefined) {
		query.set("theme", options.theme);
	}
	if (options.fonts !== undefined) {
		query.set("fonts", options.fonts);
	}
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
async function createSemanticBoardOnCanvas(
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
async function editSemanticBoardOnCanvas(
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
async function resolveSemanticBoardOnCanvas(
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
async function adoptSemanticBoardOnCanvas(
	board: string,
	adopt: Readonly<Record<string, unknown>>,
): Promise<SemanticWriteAnswer> {
	return postSemantic("/api/semantic-boards/adopt", { board, adopt });
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
async function branchSemanticBoardOnCanvas(
	board: string,
	branch: Readonly<Record<string, unknown>>,
): Promise<SemanticWriteAnswer> {
	return postSemantic("/api/semantic-boards/branch", { board, branch });
}

export {
	SemanticBoardEntrySchema,
	type SemanticBoardEntry,
	type SemanticBoardListing,
	ReconciliationReportSchema,
	type ReconciliationReport,
	type SemanticWriteAnswer,
	adoptSemanticBoardOnCanvas,
	resolveSemanticBoardOnCanvas,
	listSemanticBoardsOnCanvas,
	readSemanticBoardOnCanvas,
	renderSemanticBoardOnCanvas,
	createSemanticBoardOnCanvas,
	editSemanticBoardOnCanvas,
	branchSemanticBoardOnCanvas,
};

/**
 * Run the exact checker the browser uses.
 * @returns The interpreted policy and vault diagnostics.
 */
async function checkSemanticVaultOnCanvas(): Promise<VaultCheck> {
	return VaultCheckSchema.parse(await requestJson<unknown>("/api/vault/check"));
}
/**
 * Read one board with current vocabulary warnings.
 * @param board The board name.
 * @returns The board and its warnings.
 */
async function readSemanticBoardAnswerOnCanvas(board: string) {
	return BoardReplySchema.parse(
		await requestJson<unknown>(`/api/semantic-boards/board?board=${encodeURIComponent(board)}`),
	);
}
export { checkSemanticVaultOnCanvas, readSemanticBoardAnswerOnCanvas };
