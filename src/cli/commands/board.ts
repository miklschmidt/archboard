import { z } from "zod";
import {
	getBoardInfo,
	listBoardsOnCanvas,
	newBoard,
	openBoard,
} from "@/runtime/engine/canvas-client";
import type { BoardListResponse, BoardResponse } from "@/runtime/engine/canvas-client";
import { CliUsageError, defineCommand } from "@/cli/command-contract/contract";
import type { CommandContext } from "@/cli/command-contract/contract";
import {
	BoardIdentityStateSchema,
	HoldReportSchema,
	PaneRefSchema,
} from "@/cli/command-contract/schemas";
import {
	commonRefusals,
	serverBrowserRefusals,
	serverRefusal,
} from "@/cli/command-contract/common";
import {
	boardListText,
	collisionDiagnostics,
	repoIdentityHere,
} from "@/cli/commands/lib/board-listing";
import { parseStage } from "@/cli/commands/lib/staged-tokens";
import type { Stage } from "@/cli/commands/lib/staged-tokens";

const usage = "board needs a subcommand: list, info, new, or save";
const tokens = z.array(z.string()).default([]);
const BoardNamespaceInputSchema = z.object({ tokens });
type BoardNamespaceInput = z.infer<typeof BoardNamespaceInputSchema>;
const BoardNamespaceResultSchema = z.never();
type BoardNamespaceResult = z.infer<typeof BoardNamespaceResultSchema>;
const boardContract = defineCommand({
	path: ["board"],
	summary: "Create, inspect, save, and list persisted boards",
	usage,
	description: "Routes board lifecycle commands.",
	examples: ["archboard board list"],
	parameters: [
		{
			kind: "positional",
			key: "tokens",
			name: "arguments",
			repeatable: true,
			route: "pass-through",
			description: "Namespace arguments",
		},
	],
	input: { ingress: BoardNamespaceInputSchema },
	result: BoardNamespaceResultSchema,
	output: {
		cases: [{ id: "json", when: {}, mode: "json", held: "none", description: "Namespace refusal" }],
		/**
		 * Selects the only output case; the namespace itself never succeeds.
		 * @returns The json case id.
		 */
		select: () => "json",
	},
	prerequisites: [],
	effects: [],
	refusals: [],
	relationships: [],
	/**
	 * Refuses the bare namespace with the subcommand usage line.
	 * @returns Never; the usage error is the whole behaviour.
	 */
	async handler() {
		throw new CliUsageError(usage);
	},
});

/**
 * Resolves the repository filter of `board list` from `--here` or `--repo`,
 * noting the discovered checkout on stderr when `--here` was used.
 * @param stage - The parsed list options.
 * @param context - The command context used for diagnostics and cancellation.
 * @returns The repository identity to filter by, or undefined for every board.
 */
async function repoFilterOf(stage: Stage, context: CommandContext): Promise<string | undefined> {
	if (stage.flags["here"]) {
		const repo = await repoIdentityHere(context.signal);
		context.diagnostic(`Standing in ${repo}.`);
		return repo;
	}
	if (typeof stage.flags["repo"] === "string") {
		return stage.flags["repo"];
	}
	return undefined;
}

const BoardListInputSchema = z.object({ tokens });
type BoardListInput = z.infer<typeof BoardListInputSchema>;
const BoardListStageSchema = z
	.array(z.string())
	.transform((value, context) =>
		parseStage(value, { repo: "value", here: "flag", text: "flag" }, context),
	)
	.superRefine((stage, context) => {
		if (stage.flags["here"] && typeof stage.flags["repo"] === "string") {
			context.addIssue({
				code: "custom",
				message: "--here and --repo say the same thing twice; pick one.",
			});
		}
	});
type BoardListStage = z.infer<typeof BoardListStageSchema>;
const BoardListJsonResultSchema = z.looseObject({
	success: z.literal(true),
	vault: z.string(),
	boards: z.array(z.looseObject({ key: z.string() })),
	held: HoldReportSchema.optional(),
});
type BoardListJsonResult = z.infer<typeof BoardListJsonResultSchema>;
const BoardListResultSchema = z.union([BoardListJsonResultSchema, z.string()]);
type BoardListResult = z.infer<typeof BoardListResultSchema>;

/**
 * Shapes the server listing into the json result, keeping the repository
 * filter facts and the unreadable-note count only when the server reported them.
 * @param result - The server's listing.
 * @returns The validated json result.
 */
function boardListJson(result: BoardListResponse): BoardListJsonResult {
	return BoardListJsonResultSchema.parse({
		success: true as const,
		vault: result.vault,
		...(result.repo ? { repo: result.repo, scanned: result.scanned } : {}),
		...(result.unreadable ? { unreadable: result.unreadable } : {}),
		boards: result.boards,
	});
}

const boardListContract = defineCommand({
	path: ["board", "list"],
	summary: "List boards in the vault or describing one repository",
	usage: "board list [--repo <host/owner/name> | --here] [--text]",
	description: "Lists persisted vault boards, optionally filtered by repository binding.",
	examples: ["archboard board list --here --text"],
	parameters: [
		{
			kind: "positional",
			key: "tokens",
			name: "list-token",
			repeatable: true,
			route: "staged-tokens",
			description: "Validated after server contact",
		},
	],
	input: {
		ingress: BoardListInputSchema,
		stages: [
			{
				name: "list-options",
				when: "after-server",
				description: "Repository and output selection",
				schema: BoardListStageSchema,
			},
		],
	},
	result: BoardListResultSchema,
	output: {
		cases: [
			{
				id: "json",
				when: {},
				mode: "json",
				held: "object-field-and-stderr-note",
				description: "Board listing",
				presentation: ["diagnostics", "result", "held-note"],
			},
			{
				id: "text",
				when: {},
				mode: "text",
				held: "none",
				description: "Human-readable board listing",
				presentation: ["diagnostics", "result"],
			},
		],
		/**
		 * Chooses the text case when the staged tokens carry `--text`; the
		 * tokens are not parsed yet at selection time, so the flag is looked up.
		 * @param input - The ingress input holding the staged tokens.
		 * @returns The output case id.
		 */
		select: (input) => (input.tokens.includes("--text") ? "text" : "json"),
	},
	prerequisites: ["server"],
	effects: ["local-read", "read"],
	refusals: [serverRefusal],
	relationships: [
		{ method: "GET", path: "/api/boards", cardinality: "one", description: "List boards" },
	],
	/**
	 * Lists boards, optionally narrowed to one repository, and refuses a
	 * server too old to honour the filter rather than listing everything.
	 * @param input - The ingress input holding the staged tokens.
	 * @param context - The command context.
	 * @returns The listing as text or json with collision diagnostics.
	 */
	async handler(input, context) {
		await context.require("server", "board list");
		const stage = context.parse(BoardListStageSchema, input.tokens);
		const repo = await repoFilterOf(stage, context);
		const result = await listBoardsOnCanvas(repo);
		if (repo && !result.repo) {
			throw new Error(
				`The canvas server is older than this CLI and ignored the repository filter, so this would have listed every board as though each described ${repo}. Restart it (\`canvas stop\` then \`canvas start\`) and try again.`,
			);
		}
		const diagnostics = collisionDiagnostics(result);
		if (stage.flags["text"]) {
			return { result: boardListText(result), diagnostics };
		}
		return { result: boardListJson(result), diagnostics };
	},
});

const BoardInfoInputSchema = z.object({ tokens });
type BoardInfoInput = z.infer<typeof BoardInfoInputSchema>;
const BoardInfoStageSchema = z
	.array(z.string())
	.transform((value, context) => parseStage(value, {}, context));
type BoardInfoStage = z.infer<typeof BoardInfoStageSchema>;
const BoardInfoResultSchema = BoardIdentityStateSchema.extend({
	success: z.literal(true),
	held: HoldReportSchema.optional(),
});
type BoardInfoResult = z.infer<typeof BoardInfoResultSchema>;
const boardInfoContract = defineCommand({
	path: ["board", "info"],
	summary: "Report one named board's identity and save state",
	usage: "board info",
	description: "Reads the globally named board's current identity and save state.",
	examples: ["archboard board info --board payments"],
	parameters: [
		{
			kind: "positional",
			key: "tokens",
			name: "info-token",
			repeatable: true,
			route: "staged-tokens",
			description: "Validated after server contact",
		},
	],
	input: {
		ingress: BoardInfoInputSchema,
		stages: [
			{
				name: "info-arguments",
				when: "after-server",
				description: "Legacy no-option grammar",
				schema: BoardInfoStageSchema,
			},
		],
	},
	result: BoardInfoResultSchema,
	output: {
		cases: [
			{
				id: "json",
				when: {},
				mode: "json",
				held: "object-field-and-stderr-note",
				description: "Board state",
				presentation: ["result", "held-note"],
			},
		],
		/**
		 * Selects the only output case.
		 * @returns The json case id.
		 */
		select: () => "json",
	},
	prerequisites: ["server", "board"],
	effects: ["read"],
	refusals: commonRefusals,
	relationships: [
		{
			method: "GET",
			path: "/api/boards/info",
			cardinality: "one",
			description: "Read board state",
		},
	],
	/**
	 * Reads the named board's identity and save state after rejecting any
	 * option, since `board info` takes none.
	 * @param input - The ingress input holding the staged tokens.
	 * @param context - The command context.
	 * @returns The validated board state.
	 */
	async handler(input, context) {
		await context.require("server", "board info");
		context.parse(BoardInfoStageSchema, input.tokens);
		return { result: BoardInfoResultSchema.parse(await getBoardInfo()) };
	},
});

const newAddressSpecs = { variant: "value", level: "value" } as const;
const BoardNewInputSchema = z.object({ tokens });
type BoardNewInput = z.infer<typeof BoardNewInputSchema>;
const BoardNewStageSchema = z
	.array(z.string())
	.transform((value, context) => parseStage(value, newAddressSpecs, context))
	.transform((stage, context) => {
		const name = stage.positionals[0];
		if (!name) {
			context.addIssue({ code: "custom", message: "board new needs a name" });
			return z.NEVER;
		}
		return { name, flags: stage.flags };
	});
type BoardNewStage = z.infer<typeof BoardNewStageSchema>;
const BoardNewResultSchema = BoardIdentityStateSchema.extend({
	success: z.literal(true),
	created: z.literal(true),
	saved: z.literal(true),
	held: HoldReportSchema.optional(),
});
type BoardNewResult = z.infer<typeof BoardNewResultSchema>;
const boardNewContract = defineCommand({
	path: ["board", "new"],
	summary: "Start a new empty board",
	usage: "board new <name> [--variant v] [--level l]",
	description: "Atomically creates one persisted empty board without changing any pane.",
	examples: ["archboard board new payments --level system"],
	parameters: [
		{
			kind: "positional",
			key: "tokens",
			name: "new-token",
			repeatable: true,
			route: "staged-tokens",
			description: "Validated after server contact",
		},
	],
	input: {
		ingress: BoardNewInputSchema,
		stages: [
			{
				name: "new-options",
				when: "after-server",
				description: "Persisted board address",
				schema: BoardNewStageSchema,
			},
		],
	},
	result: BoardNewResultSchema,
	output: {
		cases: [
			{
				id: "json",
				when: {},
				mode: "json",
				held: "object-field-and-stderr-note",
				description: "New board",
				presentation: ["diagnostics", "result", "held-note"],
			},
		],
		/**
		 * Selects the only output case.
		 * @returns The json case id.
		 */
		select: () => "json",
	},
	prerequisites: ["server"],
	effects: ["server-state-write"],
	refusals: [serverRefusal],
	relationships: [
		{
			method: "POST",
			path: "/api/boards/new",
			cardinality: "one",
			description: "Create the board",
		},
	],
	/**
	 * Creates one empty persisted board at the staged address.
	 * @param input - The ingress input holding the staged tokens.
	 * @param context - The command context.
	 * @returns The new board's state and a note naming its file.
	 */
	async handler(input, context) {
		await context.require("server", "board new");
		const stage = context.parse(BoardNewStageSchema, input.tokens);
		const result = await newBoard({
			board: stage.name,
			...(typeof stage.flags["variant"] === "string" ? { variant: stage.flags["variant"] } : {}),
			...(typeof stage.flags["level"] === "string" ? { level: stage.flags["level"] } : {}),
		});
		return {
			result: BoardNewResultSchema.parse(result),
			diagnostics: [`Board "${result.board}" is empty and persisted at ${result.file}.`],
		};
	},
});

const BrowserShowInputSchema = z.object({ tokens });
type BrowserShowInput = z.infer<typeof BrowserShowInputSchema>;
const BrowserShowStageSchema = z
	.array(z.string())
	.transform((value, context) =>
		parseStage(value, { variant: "value", level: "value", pane: "value", reload: "flag" }, context),
	)
	.transform((stage, context) => {
		const name = stage.positionals[0];
		if (!name) {
			context.addIssue({ code: "custom", message: "browser show needs a board name" });
			return z.NEVER;
		}
		const pane = stage.flags["pane"];
		if (typeof pane !== "string" || !pane.trim()) {
			context.addIssue({ code: "custom", message: "browser show requires --pane <spec>" });
			return z.NEVER;
		}
		return { name, pane, flags: stage.flags };
	});
type BrowserShowStage = z.infer<typeof BrowserShowStageSchema>;

/**
 * Tells the person where the board is now showing and what surprised the
 * server on the way: an already-open board or a note whose frontmatter
 * disagrees with its path.
 * @param result - The server's open receipt.
 * @returns The diagnostics printed after the json result.
 */
function browserShowDiagnostics(result: BoardResponse): string[] {
	const diagnostics = [
		result.pane
			? `"${result.board}" is showing in ${result.pane.place === "the only pane" ? "the only pane" : `the ${result.pane.place} pane`}. Commands still name it: \`--board ${result.board}\`.`
			: `"${result.board}" is loaded, but no pane is open, so nothing is showing it.`,
	];
	if (result.source === "memory") {
		diagnostics.push(
			`"${result.board}" was already open here, so this only pointed a pane at it. Pass --reload to re-read its address off disk, which is also what un-sticks a board after a write was refused.`,
		);
	}
	if (result.declaredKey) {
		diagnostics.push(
			`Note: this file's frontmatter says it is board "${result.declaredKey}", not "${result.board}". The path is the address, so it opened as the path says; saving rewrites the frontmatter to match.`,
		);
	}
	return diagnostics;
}
const BrowserShowResultSchema = BoardIdentityStateSchema.extend({
	success: z.literal(true),
	source: z.enum(["vault", "memory"]),
	pane: PaneRefSchema.nullable(),
	declaredKey: z.string().optional(),
	held: HoldReportSchema.optional(),
});
type BrowserShowResult = z.infer<typeof BrowserShowResultSchema>;
const browserShowContract = defineCommand({
	path: ["browser", "show"],
	summary: "Show a persisted board in one connected browser pane",
	usage: "browser show <name[@variant]> --pane <spec> [--variant v] [--reload]",
	description: "Points one explicit live pane at a named board without writing its note.",
	examples: ["archboard browser show payments@option-a --pane right"],
	parameters: [
		{
			kind: "positional",
			key: "tokens",
			name: "open-token",
			repeatable: true,
			route: "staged-tokens",
			description: "Validated after server contact",
		},
	],
	input: {
		ingress: BrowserShowInputSchema,
		stages: [
			{
				name: "open-options",
				when: "after-server",
				description: "Board address, reload choice, and required live pane",
				schema: BrowserShowStageSchema,
			},
		],
	},
	result: BrowserShowResultSchema,
	output: {
		cases: [
			{
				id: "json",
				when: {},
				mode: "json",
				held: "object-field-and-stderr-note",
				description: "Opened board",
				presentation: ["diagnostics", "result", "held-note"],
			},
		],
		/**
		 * Selects the only output case.
		 * @returns The json case id.
		 */
		select: () => "json",
	},
	prerequisites: ["server", "browser"],
	effects: ["browser"],
	refusals: serverBrowserRefusals,
	relationships: [
		{ method: "POST", path: "/api/boards/open", cardinality: "one", description: "Open the board" },
	],
	/**
	 * Points one live pane at a named board; the browser prerequisite is only
	 * checked after the tokens parse so a usage mistake wins over a missing browser.
	 * @param input - The ingress input holding the staged tokens.
	 * @param context - The command context.
	 * @returns The opened board's state with placement diagnostics.
	 */
	async handler(input, context) {
		await context.require("server", "browser show");
		const stage = context.parse(BrowserShowStageSchema, input.tokens);
		await context.require("browser", "browser show");
		const result = await openBoard({
			board: stage.name,
			...(typeof stage.flags["variant"] === "string" ? { variant: stage.flags["variant"] } : {}),
			...(typeof stage.flags["level"] === "string" ? { level: stage.flags["level"] } : {}),
			...(stage.flags["reload"] ? { reload: true } : {}),
			pane: stage.pane,
		});
		return {
			result: BrowserShowResultSchema.parse(result),
			diagnostics: browserShowDiagnostics(result),
		};
	},
});

export {
	BoardNamespaceInputSchema,
	type BoardNamespaceInput,
	BoardNamespaceResultSchema,
	type BoardNamespaceResult,
	boardContract,
	BoardListInputSchema,
	type BoardListInput,
	BoardListStageSchema,
	type BoardListStage,
	BoardListJsonResultSchema,
	type BoardListJsonResult,
	BoardListResultSchema,
	type BoardListResult,
	boardListContract,
	BoardInfoInputSchema,
	type BoardInfoInput,
	BoardInfoStageSchema,
	type BoardInfoStage,
	BoardInfoResultSchema,
	type BoardInfoResult,
	boardInfoContract,
	BoardNewInputSchema,
	type BoardNewInput,
	BoardNewStageSchema,
	type BoardNewStage,
	BoardNewResultSchema,
	type BoardNewResult,
	boardNewContract,
	BrowserShowInputSchema,
	type BrowserShowInput,
	BrowserShowStageSchema,
	type BrowserShowStage,
	BrowserShowResultSchema,
	type BrowserShowResult,
	browserShowContract,
};
