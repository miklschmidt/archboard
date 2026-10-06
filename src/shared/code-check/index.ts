// The answer of the code check, `archboard check --code` and
// `GET /api/vault/code-check` (ADR 0046).
//
// It has four parts. `boards` says which board was read at which variant and
// version. `findings` says what the code pass found. `skipped` says what the
// check did not read, with the reason, so a subject that was not read never
// looks like one with nothing to report. `behind` is the reading of ADR 0045:
// the commits that changed each board's bound files after the board last
// changed. It is information, kept apart from the findings, and never changes
// the exit status.
//
// TASK-369.02 built this answer with `behind` filled. TASK-367.05 fills
// `findings` and adds the skip reasons of the code pass.

import { z } from "zod";
import { VaultDiagnosticSchema } from "@/shared/semantic-policy/index";

/** The part, relationship or step an entry is about, as every diagnostic names it. */
const CodeCheckSubjectSchema = VaultDiagnosticSchema.shape.subject.unwrap();

/** One board the check read, at the variant it read, and the version it read. */
const CodeCheckBoardSchema = z
	.object({ board: z.string(), variant: z.string(), version: z.int().nonnegative() })
	.strict();

/**
 * One thing the code pass found. It has the shape of a vault diagnostic, and
 * its severity is warning or information, never error (ADR 0046).
 */
const CodeFindingSchema = VaultDiagnosticSchema.extend({
	severity: z.enum(["warning", "information"]),
});

/**
 * Why the check read nothing of a whole board: it has no current variant, so
 * nothing on it is built (ADR 0031), or its file is not a board.
 */
const CodeCheckSkipSchema = z
	.object({
		reason: z.enum(["no-current-variant", "board-unreadable"]),
		board: z.string(),
		detail: z.string().optional(),
	})
	.strict();

/** One commit that changed a bound file after the board last changed. */
const BehindCommitSchema = z
	.object({
		repo: z.string(),
		commit: z.string(),
		committedAt: z.iso.datetime(),
		subject: z.string(),
		/** How many files the commit changed, bound or not. */
		files: z.int().nonnegative(),
		/** More than 30 files: kept here, and said, because it can move what a board says. */
		large: z.boolean(),
	})
	.strict();

/** One part the reading read, and the commits that changed its bound files. */
const BehindPartSchema = z
	.object({
		subject: CodeCheckSubjectSchema,
		repo: z.string(),
		path: z.string(),
		/** The commits of the board's `commits` that changed this part, newest first. */
		commits: z.array(z.string()),
	})
	.strict();

/** A pinned binding's ref, and what its checkout has out instead. */
const OtherRefSchema = z.object({ named: z.string(), checkedOut: z.string() }).strict();

/**
 * A part the reading did not read. It is in no count, so it must never look
 * like a part that no commit changed (ADR 0045).
 */
const BehindSkipSchema = z
	.object({
		subject: CodeCheckSubjectSchema,
		reason: z.enum([
			"unbound",
			"drill-down",
			"repository-unregistered",
			"checkout-unavailable",
			"ref-not-checked-out",
		]),
		repo: z.string().optional(),
		ref: OtherRefSchema.optional(),
		detail: z.string().optional(),
	})
	.strict();

/** The last commit that changed the current variant, or that no commit has its change yet. */
const KnownLastChangeSchema = z.discriminatedUnion("kind", [
	z
		.object({ kind: z.literal("commit"), commit: z.string(), committedAt: z.iso.datetime() })
		.strict(),
	z.object({ kind: z.literal("uncommitted") }).strict(),
]);

/**
 * Why the last change cannot be found: the vault is in no Git repository, or
 * Git ignores the board file. Such a board is never reported as zero commits
 * behind.
 */
const UnknownLastChangeSchema = z
	.object({
		kind: z.literal("unknown"),
		reason: z.enum(["vault-outside-git", "board-file-ignored"]),
	})
	.strict();

/** How far one board is behind its code, per board and per part. */
const BoardBehindSchema = z.union([
	z
		.object({
			board: z.string(),
			variant: z.string(),
			lastChange: KnownLastChangeSchema,
			/** Every commit that changed a part it read, newest first. */
			commits: z.array(BehindCommitSchema),
			parts: z.array(BehindPartSchema),
			skipped: z.array(BehindSkipSchema),
		})
		.strict(),
	z
		.object({ board: z.string(), variant: z.string(), lastChange: UnknownLastChangeSchema })
		.strict(),
]);

/**
 * The whole answer of one code check. The route answers it beside
 * `success: true`, as every route does, and a parse keeps only the answer.
 */
const CodeCheckAnswerSchema = z.object({
	boards: z.array(CodeCheckBoardSchema),
	findings: z.array(CodeFindingSchema),
	skipped: z.array(CodeCheckSkipSchema),
	behind: z.array(BoardBehindSchema),
});

type CodeCheckAnswer = z.infer<typeof CodeCheckAnswerSchema>;
type CodeCheckBoard = z.infer<typeof CodeCheckBoardSchema>;
type CodeCheckSkip = z.infer<typeof CodeCheckSkipSchema>;
type CodeFinding = z.infer<typeof CodeFindingSchema>;
type BoardBehind = z.infer<typeof BoardBehindSchema>;
type BehindCommit = z.infer<typeof BehindCommitSchema>;
type BehindPart = z.infer<typeof BehindPartSchema>;
type BehindSkip = z.infer<typeof BehindSkipSchema>;

export {
	BehindCommitSchema,
	type BehindCommit,
	BehindPartSchema,
	type BehindPart,
	BehindSkipSchema,
	type BehindSkip,
	BoardBehindSchema,
	type BoardBehind,
	CodeCheckAnswerSchema,
	type CodeCheckAnswer,
	CodeCheckBoardSchema,
	type CodeCheckBoard,
	CodeCheckSkipSchema,
	type CodeCheckSkip,
	CodeFindingSchema,
	type CodeFinding,
};
