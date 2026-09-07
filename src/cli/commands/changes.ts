import { z } from "zod";
import { getChanges } from "@/runtime/engine/canvas-client";
import type { ChangeFeedResponse } from "@/runtime/engine/canvas-client";
import { defineCommand } from "@/cli/command-contract/contract";
import { HoldReportSchema } from "@/cli/command-contract/schemas";
import { commonRefusals } from "@/cli/command-contract/common";

const ChangesCursorInputSchema = z
	.string()
	.optional()
	.transform((value, context) => {
		const cursor = value === undefined ? 0 : Number(value);
		if (!Number.isFinite(cursor) || cursor < 0) {
			context.addIssue({
				code: "custom",
				message: "--since takes a cursor from a previous `changes` response",
			});
			return z.NEVER;
		}
		return cursor;
	});
const ChangesInputSchema = z.object({
	since: ChangesCursorInputSchema,
	coalesce: z.boolean().default(false),
	detail: z.boolean().default(false),
	text: z.boolean().default(false),
	tail: z.array(z.string()).default([]),
});
type ChangesInput = z.infer<typeof ChangesInputSchema>;
const ChangesJsonResultSchema = z.looseObject({
	success: z.boolean(),
	board: z.string(),
	feedId: z.string().optional(),
	cursor: z.number().int().nonnegative(),
	events: z.array(z.record(z.string(), z.unknown())),
	held: HoldReportSchema.optional(),
});
type ChangesJsonResult = z.infer<typeof ChangesJsonResultSchema>;
const ChangesResultSchema = z.union([ChangesJsonResultSchema, z.string()]);
type ChangesResult = z.infer<typeof ChangesResultSchema>;

/**
 * Renders the net difference of a coalesced feed: one headline with its
 * optional detail, or a note that nothing changed.
 * @param report - The server's coalesced change feed.
 * @returns The report body lines.
 */
function coalescedLines(report: ChangeFeedResponse): string[] {
	const net = report.coalesced;
	if (!net || net["significance"] === "none") {
		return [`Nothing has changed on "${report.board}" since then.`];
	}
	const lines = [`${report.board}: ${String(net["headline"])}`];
	if (typeof net["text"] === "string") {
		lines.push(net["text"]);
	}
	return lines;
}

/**
 * Renders every event of an uncoalesced feed with its cursor, time, origin and
 * significance, followed by its detail when it has one.
 * @param events - The feed's events.
 * @returns The report body lines.
 */
function eventLines(events: ChangeFeedResponse["events"]): string[] {
	const lines: string[] = [];
	for (const event of events) {
		lines.push(
			`[${String(event["cursor"])}] ${String(event["at"])} — ${String(event["origin"])} ${String(event["significance"])}: ${String(event["headline"])}`,
		);
		if (typeof event["text"] === "string") {
			lines.push(event["text"]);
		}
	}
	return lines;
}

/**
 * Chooses the body of the text report: the truncation notice, the coalesced
 * net difference, or the event list.
 * @param report - The server's change feed.
 * @param coalesce - Whether the caller asked for the net difference.
 * @returns The report body lines.
 */
function reportBodyLines(report: ChangeFeedResponse, coalesce: boolean): string[] {
	if (report.truncated) {
		return [report.message ?? "The feed no longer reaches back that far."];
	}
	if (coalesce) {
		return coalescedLines(report);
	}
	if (report.events.length === 0) {
		return [`Nothing has changed on "${report.board}" since then.`];
	}
	return eventLines(report.events);
}

/**
 * Renders the change feed for a person, ending with the cursor to pass next time.
 * @param report - The server's change feed.
 * @param coalesce - Whether the caller asked for the net difference.
 * @returns The text shown for `changes --text`.
 */
function textReport(report: ChangeFeedResponse, coalesce: boolean): string {
	const lines = reportBodyLines(report, coalesce);
	lines.push(`(cursor ${report.cursor}${report.feedId ? `, feed ${report.feedId}` : ""})`);
	return lines.join("\n");
}

const changesContract = defineCommand({
	path: ["changes"],
	summary: "Semantic changes on the board since a cursor — what it became, not which pixels moved",
	usage: "changes --board <key> [--since <cursor>] [--coalesce] [--detail] [--text]",
	description: "Reads cursor-based semantic change events or their net coalesced difference.",
	examples: ["archboard changes --board system --since 4"],
	parameters: [
		{
			kind: "option",
			key: "since",
			spellings: ["--since"],
			value: "required",
			description: "Previous response cursor",
		},
		{
			kind: "option",
			key: "coalesce",
			spellings: ["--coalesce"],
			value: "none",
			description: "Return one net difference",
		},
		{
			kind: "option",
			key: "detail",
			spellings: ["--detail"],
			value: "none",
			description: "Include detailed changes",
		},
		{
			kind: "option",
			key: "text",
			spellings: ["--text"],
			value: "none",
			description: "Print a human-readable report",
		},
		{
			kind: "positional",
			key: "tail",
			name: "ignored",
			repeatable: true,
			route: "pass-through",
			description: "Legacy ignored positional content",
		},
	],
	input: { ingress: ChangesInputSchema },
	result: ChangesResultSchema,
	output: {
		cases: [
			{
				id: "json",
				when: { key: "text", present: false },
				mode: "json",
				held: "object-field-and-stderr-note",
				description: "Structured change feed",
				presentation: ["result", "held-note"],
			},
			{
				id: "text",
				when: { key: "text", present: true },
				mode: "text",
				held: "none",
				description: "Human-readable change feed",
				presentation: ["result"],
			},
		],
		/**
		 * Chooses the human report when `--text` was given, otherwise the json feed.
		 * @param input - The parsed changes options.
		 * @returns The output case id.
		 */
		select: (input) => (input.text ? "text" : "json"),
	},
	prerequisites: ["server", "board"],
	effects: ["read"],
	refusals: commonRefusals,
	relationships: [
		{
			method: "GET",
			path: "/api/changes",
			cardinality: "one",
			description: "Read semantic changes",
		},
	],
	/**
	 * Reads the semantic changes since the given cursor, as events or as one
	 * coalesced net difference.
	 * @param input - The parsed changes options.
	 * @param context - The command context.
	 * @returns The feed as text or json.
	 */
	async handler(input, context) {
		await context.require("server", "changes");
		const report = await getChanges({
			since: input.since,
			coalesce: input.coalesce,
			detail: input.detail,
		});
		return {
			result: input.text
				? textReport(report, input.coalesce)
				: ChangesJsonResultSchema.parse(report),
		};
	},
});

export {
	ChangesCursorInputSchema,
	ChangesInputSchema,
	type ChangesInput,
	ChangesJsonResultSchema,
	type ChangesJsonResult,
	ChangesResultSchema,
	type ChangesResult,
	changesContract,
};
