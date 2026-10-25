// What a semantic write answers with, as the command's JSON and as the lines a
// person reads on standard error. Both come from the one answer the server gave.

import { z } from "zod";
import { diagnosticLine, VaultDiagnosticSchema } from "@archboard/board/policy";
import {
	ReconciliationReportSchema,
	type ReconciliationReport,
	type SemanticWriteAnswer,
} from "#cli/clients/server/semantic-boards.ts";
import { SemanticBoardSchema } from "@archboard/board/document";

type VaultDiagnostic = z.infer<typeof VaultDiagnosticSchema>;

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
		...written.warnings.map(diagnosticLine),
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
 *
 * A removal against a change is settled by writing the subject again, out of
 * values this line does not carry and must not be copied for: what it prints is
 * cut to fit a terminal. So where the issue carries those values, the line says
 * so and sends its reader to them rather than leaving them to be hunted down in
 * the board and retyped (TASK-256.09).
 * @param issue What is standing.
 * @returns The line.
 */
function issueLine(issue: ReconciliationReport["drafts"][number]["issues"][number]): string {
	const field = issue.field === undefined ? "" : `.${issue.field}`;
	const carried =
		issue.changed === undefined
			? ""
			: " — the issue's `changed` carries each of those values, uncut";
	return (
		`${issue.what} ${issue.subject}${field}: this says ${valueText(issue.mine)}, the ` +
		`variant it came from says ${valueText(issue.theirs)}${carried}`
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

export { SemanticBoardResultSchema, describedWrite, writeResult };
