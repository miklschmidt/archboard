import { VaultDiagnosticSchema, type VaultDiagnostic } from "@/shared/semantic-policy/index";
// What a person types into a semantic board command, before it is a command.
//
// Reading a stated architecture off a file or standard input, refusing what is
// not one, and saying what a selector may be. None of it is about any one
// command, and all of it is shared by four, so it lives here rather than in the
// file that defines them.

import { z } from "zod";
import { CliUsageError, type CommandContext } from "@/cli/command-contract/contract";
import { currentExpectedVersion } from "@/runtime/engine/canvas-client";
import {
	ReconciliationReportSchema,
	type ReconciliationReport,
	type SemanticWriteAnswer,
} from "@/runtime/semantic-board-client/index";
import { SemanticBoardSchema } from "@/shared/semantic-board/index";

/**
 * The stated change, from a file when one was named and standard input
 * otherwise. Nothing is invented when neither is there: a create with no stated
 * content is an empty board, which is a board somebody meant to start.
 * @param input What the command was given.
 * @param input.input A file to read the change from, when one was named.
 * @param context The command context.
 * @returns The parsed JSON, or undefined when nothing was stated.
 * @throws {CliUsageError} When what arrived is not JSON.
 */
async function statedJson(
	input: { readonly input?: string | undefined },
	context: CommandContext,
): Promise<unknown> {
	const text =
		input.input === undefined
			? (await context.readStdin()).trim()
			: context.readTextFile(context.resolvePath(input.input));
	if (text === "") {
		return undefined;
	}
	try {
		return JSON.parse(text);
	} catch (error) {
		throw new CliUsageError(
			`The stated change is not JSON: ${error instanceof Error ? error.message : "unreadable"}`,
		);
	}
}

/**
 * The stated architecture with the name the command line gave it.
 *
 * The name is the command's, not the file's: a stated architecture is content,
 * and asking a person to keep the two in step would make renaming a board a
 * two-file edit.
 *
 * Nothing stated is an empty board, which is a board somebody meant to start.
 * Something stated that is not an architecture is a mistake, and it is said so
 * rather than quietly becoming an empty board — a `null`, a number or a list
 * arriving here is a producer that got its shape wrong, and creating an empty
 * board for it would hide that until somebody opened the board and found
 * nothing on it.
 * @param stated What was stated, or undefined when nothing was.
 * @param name The board's name.
 * @returns The create input, before it is validated.
 * @throws {CliUsageError} When something was stated that is not an object.
 */
function named(stated: unknown, name: string): Record<string, unknown> {
	if (stated === undefined) {
		return { name };
	}
	if (typeof stated !== "object" || stated === null || Array.isArray(stated)) {
		return failStated(stated);
	}
	return { ...stated, name };
}

/**
 * Refuse a stated architecture that is not one.
 * @param stated What arrived.
 * @throws {CliUsageError} Always.
 */
function failStated(stated: unknown): never {
	throw new CliUsageError(
		`The stated architecture must be a JSON object with \`nodes\` and \`edges\`, not ${describeJson(stated)}. ` +
			"Leave it out entirely to start an empty board.",
	);
}

/**
 * What arrived, in one word, for a refusal to quote.
 * @param value What arrived.
 * @returns The word.
 */
function describeJson(value: unknown): string {
	if (value === null) {
		return "null";
	}
	return Array.isArray(value) ? "a list" : `a ${typeof value}`;
}

/**
 * A selector somebody typed. Leaving one out asks for the default — the current
 * variant, the whole of it — but typing one that says nothing (`--view ''`) is a
 * command that went wrong before it got here, and drawing the whole variant for
 * it would quietly answer a question nobody asked.
 */
const SelectorSchema = z.string().trim().min(1);

const expectVersionRefusal = {
	code: "EXPECT_VERSION_REQUIRED",
	exit: 2,
	stream: "stderr" as const,
	description: "A semantic edit did not say which version of the board it was written against.",
};

/**
 * The version this edit was written against.
 *
 * Stating it is not optional. An edit that does not say which board it read is
 * an edit applied to whatever the board says now, which is exactly how one
 * agent's change disappears under another's — and the whole point of an
 * architecture two people are working on is that neither loses.
 * @param board The board being edited, for the refusal to quote.
 * @returns The version.
 * @throws {CliUsageError} When no version was stated.
 */
function editedVersion(board: string): number {
	const stated = currentExpectedVersion();
	if (typeof stated !== "number") {
		throw new CliUsageError(
			`This edit does not say which version of "${board}" it was written against, so there is no ` +
				"way to tell whether somebody else has changed it since. Read the board first with " +
				`\`archboard semantic show ${board}\`, write your change against what it says, and pass the ` +
				"version it reported as --expect-version. Reading it again immediately before writing " +
				"would make the check pass by construction and hide the change you were meant to notice. " +
				"Nothing was written.",
		);
	}
	return stated;
}

/**
 * What every semantic write answers with.
 *
 * The same three facts the HTTP answer carries, in the same shape: the board as
 * it now stands, the version it landed at, and what it left for somebody to
 * settle. An agent reading the command's JSON and an agent reading the route's
 * answer are reading one contract — the alternative is a second envelope that
 * has to be kept in step by hand, and is not.
 *
 * The prose on standard error is for a person, and says the same thing. Neither
 * is derived from the other; both come from the answer.
 */
/**
 * What a read of a board answers with: the board, and nothing else.
 *
 * Deliberately not the write envelope. A read lands no version and leaves
 * nothing to settle, and a `reconciliation: null` on it would invite somebody to
 * check a field that can never say anything.
 */
const SemanticBoardReadSchema = z.object({
	warnings: z.array(VaultDiagnosticSchema).default([]),
	success: z.literal(true),
	board: SemanticBoardSchema,
});

const SemanticBoardResultSchema = z.object({
	warnings: z.array(VaultDiagnosticSchema).default([]),
	success: z.literal(true),
	board: SemanticBoardSchema,
	/** The version the board landed at. */
	version: z.int(),
	/** Every draft the change reached, or null when it reached none. */
	reconciliation: ReconciliationReportSchema.nullable(),
});

/**
 * One write's answer, as the command's JSON carries it.
 * @param written What the write answered.
 * @returns The result.
 */
function writeResult(written: SemanticWriteAnswer): {
	success: true;
	board: SemanticWriteAnswer["board"];
	version: number;
	reconciliation: ReconciliationReport | null;
	warnings: VaultDiagnostic[];
} {
	return {
		success: true,
		board: written.board,
		version: written.board.version,
		reconciliation: written.reconciliation,
		warnings: written.warnings,
	};
}

/**
 * What a write is worth saying out loud.
 *
 * A write that landed and a write that landed and left two proposals needing
 * somebody are different outcomes, and the second is the one a person has to
 * act on. Every draft the change reached is named, with what it did and, for
 * the ones holding something, what it is holding and what to do about it —
 * quoting the guidance the reconciliation itself wrote rather than inventing a
 * second account of the same disagreement.
 * @param written What the write answered.
 * @returns The lines to print.
 */
function describedWrite(written: SemanticWriteAnswer): string[] {
	const board = written.board;
	const lines = [
		`Semantic board "${board.name}" is now at version ${board.version}.`,
		...written.warnings.map((warning) => `Warning: ${warning.file}: ${warning.message}`),
	];
	const report = written.reconciliation;
	if (report === null) {
		return lines;
	}
	// A blocked draft names the state it is waiting for by id; the answer already
	// carries what that state is called, and an id is not what somebody settling
	// it types into the next command.
	const calls = new Map(report.drafts.map((draft) => [draft.variant, draft.name]));
	for (const draft of report.drafts) {
		lines.push(draftLine(draft, calls));
		for (const issue of draft.issues) {
			lines.push(`    ${issueLine(issue)}`);
			lines.push(`      ${issue.repair}`);
		}
	}
	return lines;
}

/**
 * What one draft did about the change, in a line.
 * @param draft The draft's outcome.
 * @param calls What each draft the change reached is called, by its id.
 * @returns The line.
 */
function draftLine(
	draft: ReconciliationReport["drafts"][number],
	calls: ReadonlyMap<string, string>,
): string {
	if (draft.outcome === "merged") {
		const waiting =
			draft.blockedBy === undefined ? "" : " (building on a state that is still unsettled)";
		return `  "${draft.name}" took the change${waiting}.`;
	}
	if (draft.outcome === "blocked") {
		const blocker = draft.blockedBy ?? "";
		return (
			`  "${draft.name}" was not brought forward: "${calls.get(blocker) ?? blocker}" is itself ` +
			"unsettled, and what this one should say depends on what that one decides."
		);
	}
	return `  "${draft.name}" is holding ${draft.issues.length} disagreement(s):`;
}

/**
 * One disagreement, in the words the reconciliation used.
 * @param issue What is standing.
 * @returns The line.
 */
function issueLine(issue: ReconciliationReport["drafts"][number]["issues"][number]): string {
	const field = issue.field === undefined ? "" : `.${issue.field}`;
	return (
		`${issue.what} ${issue.subject}${field}: this says ${valueText(issue.mine)}, the ` +
		`variant it came from says ${valueText(issue.theirs)}`
	);
}

/** How much of a value is worth putting on one line of a terminal. */
const VALUE_ROOM = 72;

/**
 * One side of a disagreement, as a person reads it.
 *
 * The value itself, not a description of its type: somebody settling an
 * argument about two names needs to see the two names. A value too long for a
 * line is cut with an ellipsis rather than wrapped, because the line is an
 * index into the board and the board is where the whole of it lives.
 * @param value What that side says.
 * @returns The words to print.
 */
function valueText(value: unknown): string {
	if (value === null || value === undefined) {
		return "nothing";
	}
	const written = typeof value === "string" ? `"${value}"` : JSON.stringify(value);
	return written.length > VALUE_ROOM ? `${written.slice(0, VALUE_ROOM - 1)}…` : written;
}

export {
	SemanticBoardReadSchema,
	SemanticBoardResultSchema,
	describedWrite,
	writeResult,
	draftLine,
	issueLine,
	statedJson,
	named,
	failStated,
	describeJson,
	SelectorSchema,
	expectVersionRefusal,
	editedVersion,
};
