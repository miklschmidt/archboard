// The answer of the code check, `archboard check code` and
// `GET /api/vault/code-check` (ADR 0046).
//
// `timings` records elapsed work for code facts, each language server and
// history (TASK-436.02). `boards` says which board was read at which variant and
// version. `findings` says what the code pass found. `skipped` says what the
// check did not read, with the reason, so a subject that was not read never
// looks like one with nothing to report. `behind` is the reading of ADR 0045:
// the commits that changed each board's bound files after the board last
// changed. It is information, kept apart from the findings, and never changes
// the exit status.
//
// TASK-369.02 built this answer with `behind` filled. TASK-367.05 fills
// `findings` from the text reading, `ANCHOR_PATH_MISSING`,
// `ANCHOR_SYMBOL_MISSING`, `BINDING_SYMBOL_MISSING` and, on a named draft,
// `BINDING_PATH_MISSING`, and adds the skip reasons of the code pass.
// TASK-367.06 reads TypeScript through code facts, which adds `ANCHOR_MISMATCH`
// and the skip `symbol-unparsed`. TASK-367.07 judges the relationships between
// bound parts by the evidence that joins their code: `RELATIONSHIP_UNDRAWN`,
// `RELATIONSHIP_BACKWARDS`, `RELATIONSHIP_UNSUPPORTED`, the evidence kind half
// of `ANCHOR_MISMATCH`, and the skip `ends-overlap`. TASK-368.10 holds each
// container's interface (ADR 0044) against what the module it binds exposes:
// `ENTRY_POINT_UNEXPOSED`, a warning on an entry point whose code the module
// does not expose while the code of a caller drawn to it reaches it from a
// file outside the module; `CALLER_UNDRAWN`, a warning (information on a candidate) on
// a hidden part whose exposed code a file outside the module uses at run time
// with no caller on the board; `EXPOSED_UNUSED`, information on the container,
// for exposed names no file outside the module uses; and the skip
// `exposure-unknown`. TASK-368.11 reads a Terraform or OpenTofu module, whose
// variables and outputs are what it exposes, and adds two information findings
// on the container bound to it: `VARIABLE_PASSED_THROUGH`, for variables the
// module uses once, as the whole value of one argument of a resource it
// manages; and `MODULE_SHALLOW`, for a module that manages exactly one
// resource, which reads nothing else, calls no module and passes every
// variable through but those that only set the resource's `count`, which then
// names the variables it passes through itself. TASK-367.23 joins an environment value the
// code reads with infrastructure that sets it to another part's address, and
// says which side of an unsupported relationship has evidence (`missing`).
// TASK-436.05 adds `TEST_IMPORT_UNEXPOSED`, a warning on a container for each
// test outside its module that imports a private file. Tests inside a module
// can exercise its internals; tests never make exposed names used.
// TASK-436.08 applies the interface findings to a Nix flake's outputs and a
// Helm chart's values. Compose files and plain manifests stay exposure-unknown.
// TASK-488 adds `INHERITED_PART_DROPPED`, a warning on a draft that lacks a
// bound part the variant before it holds while the code the draft is read
// against still holds that part's path and symbol (`dropped`), and the skips
// of a draft whose ref cannot be read. TASK-498 adds `DOCUMENT_PATH_MISSING`,
// a warning on a document reference of a variant the check reads whose file is
// not at the version it names, with no subject: its `path` names the reference
// as `variants.<id>.documents.<index>` (ADR 0054). TASK-539.01 keeps what each
// judged container exposes, name by name, with the files that use each name
// (`ContainerExposureSchema`). The server remembers it for the panes. The
// answer carries it as `exposures` only on request (`archboard check code
// --exposed`, TASK-539.06).

import { CONFIGURABLE_LANGUAGES } from "@archboard/workspace/languages";
import { z } from "zod";
import { EvidenceKindSchema, VaultDiagnosticSchema } from "@archboard/board/policy";

/** The part, relationship or step an entry is about, as every diagnostic names it. */
const CodeCheckSubjectSchema = VaultDiagnosticSchema.shape.subject.unwrap();

/** One board the check read, at the variant it read, and the version it read. */
const CodeCheckBoardSchema = z
	.object({ board: z.string(), variant: z.string(), version: z.int().nonnegative() })
	.strict();

/**
 * One piece of code a finding rests on: what it proves, whether a language
 * server or the code itself named what it reaches (`resolved`) or the check
 * matched it by name only (`candidate`), the parts whose bound code makes the
 * use and holds what it reaches where the check knows them, and its place in
 * code. It quotes a symbol, a path and a line, and never other text of a file
 * (ADR 0046).
 */
const CodeEvidenceSchema = z
	.object({
		kind: EvidenceKindSchema,
		resolution: z.enum(["resolved", "candidate"]),
		from: z.string().optional(),
		to: z.string().optional(),
		repo: z.string(),
		path: z.string(),
		line: z.int().positive(),
		symbol: z.string(),
	})
	.strict();

/**
 * The evidence of `INHERITED_PART_DROPPED` (TASK-488): the variant before the
 * draft that holds the part (`from`, its id), and where the code the draft is
 * read against still holds the part's bound path and symbol. `ref` and
 * `commit` are the ref the draft's bindings name and the commit it resolved
 * to; both are absent where the draft names no ref and the checkout's files
 * were read. `file` and `line` say where the symbol is defined, when the
 * binding names one.
 */
const DroppedPartSchema = z
	.object({
		from: z.string(),
		repo: z.string(),
		ref: z.string().optional(),
		commit: z.string().optional(),
		path: z.string(),
		symbol: z.string().optional(),
		file: z.string().optional(),
		line: z.int().positive().optional(),
	})
	.strict();

/**
 * One thing the code pass found. It has the shape of a vault diagnostic, and
 * its severity is warning or information, never error (ADR 0046). A finding
 * that says something is missing rests on nothing, so it has no `evidence`.
 *
 * `missing` is on a `RELATIONSHIP_UNSUPPORTED` across a network hop where only
 * one side has evidence (TASK-367.23): `code` when the infrastructure sets a
 * value to the address of its end for the code of its start and that code
 * reads none of those names, `infrastructure` when the code of its start reads
 * names that nothing the check reads sets for it. Its evidence then ends with
 * that side's: where the value is set, or the first read of each name that
 * nothing sets.
 */
const CodeFindingSchema = VaultDiagnosticSchema.extend({
	severity: z.enum(["warning", "information"]),
	evidence: z.array(CodeEvidenceSchema).min(1).optional(),
	missing: z.enum(["code", "infrastructure"]).optional(),
	dropped: DroppedPartSchema.optional(),
});

/** A pinned binding's ref, and what its checkout has out instead. */
const OtherRefSchema = z.object({ named: z.string(), checkedOut: z.string() }).strict();

/**
 * Something the code pass did not read, with the reason (ADR 0046). A skipped
 * subject gets no finding and changes no exit status, and it is listed so it
 * never looks like a subject with nothing to report.
 *
 * - `no-current-variant`: a board with nothing built and no draft of the
 *   named variant (ADR 0031). `board-unreadable`: its file is not a board.
 * - `repository-unregistered`: a part, relationship or step whose binding or
 *   anchor names a repository this machine has not registered. It stays
 *   silent, and is listed. Also a draft, with no subject, whose dropped parts
 *   are bound into such a repository (TASK-488), and a document reference into
 *   one, with no subject and the reference's path as `detail` (TASK-498).
 * - `ref-not-checked-out`: a binding pinned to a branch or a commit that its
 *   checkout cannot resolve, so there is no code to read (TASK-493). Its `ref`
 *   names the ref and what the checkout has out. A ref it can resolve but has
 *   not out is read from Git without a checkout; a relationship or step with
 *   an unresolvable part at an end is skipped with its anchor. A document
 *   reference pinned so is skipped with no subject and its path as `detail`.
 * - `ref-without-language-server`: a ref read from Git, in which a use that no
 *   import resolves was not asked of a language server, because servers read
 *   the files on disk (TASK-493). Said once for the repository and ref, with
 *   its `repo` and `ref` and no subject; the use stays as code facts read it.
 * - `refs-differ`: a relationship whose ends are bound in one repository and
 *   read at different code, two refs or a ref and the checkout's files, so no
 *   one code holds both ends. Its `detail` names the ref of each.
 * - `path-ignored`: a bound or anchored path that Git ignores.
 * - `path-never-read`: Terraform state, a variable file or the `.terraform`
 *   directory, which can hold secrets in plain text.
 * - `checkout-unavailable`: a registered checkout that is gone, is no longer
 *   a Git checkout, or no longer identifies as its repository.
 * - `symbol-unparsed`: a bound or anchored symbol the check found only inside
 *   a part of a file that did not parse (ADR 0046). Its `detail` names the
 *   file and the lines.
 * - `expression-not-followed`: a bound or anchored symbol that may lie below a
 *   Nix expression the static reading of a flake cannot follow, such as an
 *   `import` or a list of systems that an input gives (TASK-367.21), or in a
 *   Helm template, whose names only Helm gives when it renders it
 *   (TASK-367.19). Also a relationship with no anchor that no evidence its
 *   kind accepts supports, whose kind accepts a build dependency, whose start
 *   holds a Nix expression the reading cannot follow, such as a package that
 *   `callPackage` builds from another file, and whose end holds an output of
 *   the same flake: what the start is built from is unknown (TASK-367.22).
 *   Its `detail` names the file and the lines of the expression or the
 *   template, after the part that holds the expression for a relationship.
 * - `text-only`: the check read files of a checkout that no grammar reads as
 *   text, so it judged their anchors and bound symbols by name and nothing
 *   that needs references. Its `detail` names the kinds of file.
 * - `ends-overlap`: a relationship with no anchor whose ends hold one another
 *   or bind the same code. Evidence never joins such parts, so the check
 *   cannot tell whether the code supports it (TASK-367.07).
 * - `exposure-unknown`: a container bound to a module whose root files no
 *   language the check reads has, or whose `package.json` `exports` names no
 *   file of the checkout, so its interface is not held to what the module
 *   exposes (TASK-368.10). Its `detail` names the module.
 * - `module-not-read`: a binding's address inside a Terraform or OpenTofu
 *   module the check does not read: a remote module, which the check never
 *   fetches, with no plan JSON named for its root module (TASK-367.17). Its
 *   `detail` names the module call.
 * - `language-server-missing`: a language that has no server in a checkout.
 *   Python, C, C++, Objective-C, C# and Swift have no default server: an agent
 *   that works in the repository configures one for its checkout (`archboard
 *   repo language-server`), so the check runs no code of a checkout that
 *   nobody agreed to run. Also a configured command that is not installed.
 *   Said once for the checkout and the language, with its `repo` and no
 *   subject; its uses stay as code facts read them, candidates or no evidence
 *   (TASK-367.13, TASK-433). Its `detail` names the language, why, and the
 *   command that configures one.
 * - `language-server-unready`: a project the language server cannot answer
 *   about yet, such as a Swift package that no build has indexed, which the
 *   check never builds (TASK-367.16), a C# checkout with no solution or
 *   project file for csharp-ls to load, or a C, C++ or Objective-C file with
 *   no `compile_commands.json` in its checkout, or one that lists no command,
 *   without which clangd only guesses its flags (TASK-367.15). Said once for
 *   the project, with its checkout's `repo`; its uses stay as code facts read
 *   them. Its `detail` names the language, the project and why.
 * - `language-server-failed`: a language server that did not start, did not
 *   answer in time or ended in one checkout. Said once for the checkout and
 *   the language; its uses there stay as code facts read them. Its `detail`
 *   names the language, the program and what it did.
 * - `draft-ref-missing`: a draft whose dropped parts are held to the ref its
 *   bindings name in a repository, and whose checkout has no such branch, tag
 *   or commit (TASK-488). Its `detail` is the ref.
 * - `draft-refs-ambiguous`: a draft whose bindings name several refs of one
 *   repository, none of them new on the draft, so the check cannot tell which
 *   code it describes. Its `detail` names the refs.
 *
 * A reason that holds for a whole checkout names its `repo` and no subject,
 * which is how the check says a thing once.
 */
const CodeCheckSkipSchema = z
	.object({
		reason: z.enum([
			"no-current-variant",
			"board-unreadable",
			"repository-unregistered",
			"ref-not-checked-out",
			"ref-without-language-server",
			"refs-differ",
			"path-ignored",
			"path-never-read",
			"checkout-unavailable",
			"symbol-unparsed",
			"expression-not-followed",
			"text-only",
			"ends-overlap",
			"language-server-missing",
			"language-server-unready",
			"language-server-failed",
			"exposure-unknown",
			"module-not-read",
			"draft-ref-missing",
			"draft-refs-ambiguous",
		]),
		board: z.string().optional(),
		variant: z.string().optional(),
		subject: CodeCheckSubjectSchema.optional(),
		repo: z.string().optional(),
		ref: OtherRefSchema.optional(),
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

/** Elapsed wall time for each part of a requested check (TASK-436.02). */
const CheckTimingSchema = z.discriminatedUnion("check", [
	z
		.object({
			check: z.enum(["board", "code-facts", "history"]),
			elapsedMs: z.number().nonnegative(),
		})
		.strict(),
	z
		.object({
			check: z.literal("language-server"),
			elapsedMs: z.number().nonnegative(),
			language: z.enum(["typescript", ...CONFIGURABLE_LANGUAGES]),
			repo: z.string().optional(),
			project: z.string(),
		})
		.strict(),
]);
type CheckTiming = z.infer<typeof CheckTimingSchema>;

/** The most names that one container's exposure lists, the most used first (ADR 0046). */
const EXPOSED_NAME_LIMIT = 200;

/** The most users that one exposed name lists, in path order (ADR 0046). */
const EXPOSED_USER_LIMIT = 25;

/**
 * One file outside the module that uses an exposed name: its path, the first
 * line of its use, and the ids of the parts of the board that hold that line,
 * by the rule that owns evidence. No part holds it when `parts` is empty. It
 * quotes a path and a line, never other text of the file (ADR 0046).
 */
const ExposedUserSchema = z
	.object({ path: z.string(), line: z.int().positive(), parts: z.array(z.string()) })
	.strict();

/**
 * One name that a module exposes, once however many places declare it: where
 * its first declaration is, the files that pass it on (root file first; empty
 * when a root file declares it), and how many files outside the module use it.
 * `users` is the exact count and `usedBy` lists at most `EXPOSED_USER_LIMIT`
 * of them.
 */
const ExposedNameSchema = z
	.object({
		name: z.string(),
		path: z.string(),
		line: z.int().positive(),
		via: z.array(z.string()),
		users: z.int().nonnegative(),
		usedBy: z.array(ExposedUserSchema).max(EXPOSED_USER_LIMIT),
	})
	.strict();

/**
 * What one container bound to a module exposes (TASK-539.01): the module's
 * directory and root files, how many names it exposes and how many of them a
 * file outside it uses, both exact, and the names with the most users first,
 * then by name, at most `EXPOSED_NAME_LIMIT` of them. `exposed - usedOutside` is
 * the number of names that `EXPOSED_UNUSED` lists for the container.
 */
const ContainerExposureSchema = z
	.object({
		board: z.string(),
		variant: z.string(),
		container: z.string(),
		module: z.string(),
		rootFiles: z.array(z.string()),
		exposed: z.int().nonnegative(),
		usedOutside: z.int().nonnegative(),
		names: z.array(ExposedNameSchema).max(EXPOSED_NAME_LIMIT),
	})
	.strict();

/** The two counts of one container that a pane polls; the names are asked for apart. */
const ContainerCountsSchema = ContainerExposureSchema.pick({
	container: true,
	module: true,
	exposed: true,
	usedOutside: true,
});

/**
 * The whole answer of one code check. The route answers it beside
 * `success: true`, as every route does, and a parse keeps only the answer.
 * `exposures` is what each judged container exposes, with the caps of a pane,
 * and is present only when the request asked for it (`--exposed`, TASK-539.06).
 */
const CodeCheckAnswerSchema = z.object({
	timings: z.array(CheckTimingSchema),
	boards: z.array(CodeCheckBoardSchema),
	findings: z.array(CodeFindingSchema),
	skipped: z.array(CodeCheckSkipSchema),
	behind: z.array(BoardBehindSchema),
	exposures: z.array(ContainerExposureSchema).optional(),
});

/**
 * What the last pass that read one board at one variant found there, as the
 * Archboard server remembers it for a pane (TASK-367.24, ADR 0046): the
 * version of the board the pass read, when the pass ran, its findings on that
 * board, what it skipped on that board and what it skipped without naming a
 * board, and the counts of each container it judged (TASK-539.01). A pane draws
 * them only over the version they were found on. The names behind the counts
 * are answered apart, by `RememberedExposureSchema`.
 */
const RememberedReadingSchema = CodeCheckBoardSchema.extend({
	checkedAt: z.iso.datetime(),
	findings: z.array(CodeFindingSchema),
	skipped: z.array(CodeCheckSkipSchema).default([]),
	containers: z.array(ContainerCountsSchema).default([]),
}).strict();

/**
 * The answer of `GET /api/vault/code-findings`: one reading for each board and
 * variant that a pass has read since the server started. The route only reads
 * the server's memory and never starts a pass, so it is empty until somebody
 * runs the code check, with `archboard check` or `archboard check code`. The
 * route answers it beside `success: true`, and a parse keeps only the answer.
 */
const RememberedFindingsSchema = z.object({ readings: z.array(RememberedReadingSchema) });

/**
 * The answer of `GET /api/vault/code-findings/exposure`: what one container of
 * one board and variant exposes, with the version of the board the pass read and
 * when it ran, so a pane can tell it from a newer board (TASK-539.01).
 */
const RememberedExposureSchema = z.object({
	version: z.int().nonnegative(),
	checkedAt: z.iso.datetime(),
	exposure: ContainerExposureSchema,
});

type CodeCheckAnswer = z.infer<typeof CodeCheckAnswerSchema>;
type ContainerExposure = z.infer<typeof ContainerExposureSchema>;
type RememberedExposure = z.infer<typeof RememberedExposureSchema>;
type RememberedReading = z.infer<typeof RememberedReadingSchema>;
type RememberedFindings = z.infer<typeof RememberedFindingsSchema>;
type CodeCheckBoard = z.infer<typeof CodeCheckBoardSchema>;
type CodeCheckSkip = z.infer<typeof CodeCheckSkipSchema>;
type CodeFinding = z.infer<typeof CodeFindingSchema>;
type CodeEvidence = z.infer<typeof CodeEvidenceSchema>;
type BoardBehind = z.infer<typeof BoardBehindSchema>;
type BehindCommit = z.infer<typeof BehindCommitSchema>;
type BehindPart = z.infer<typeof BehindPartSchema>;
type BehindSkip = z.infer<typeof BehindSkipSchema>;

export {
	EXPOSED_NAME_LIMIT,
	EXPOSED_USER_LIMIT,
	ContainerExposureSchema,
	type ContainerExposure,
	RememberedExposureSchema,
	type RememberedExposure,
	CheckTimingSchema,
	type CheckTiming,
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
	CodeEvidenceSchema,
	type CodeEvidence,
	CodeFindingSchema,
	type CodeFinding,
	RememberedFindingsSchema,
	type RememberedFindings,
	RememberedReadingSchema,
	type RememberedReading,
};
