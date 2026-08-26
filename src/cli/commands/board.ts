import { z } from "zod";
import {
	getBoardInfo,
	listBoardsOnCanvas,
	newBoard,
	openBoard,
	type BoardListResponse,
} from "../../runtime/engine/canvas-client.js";
import { repoIdentityAt, repoRootOf } from "../../runtime/engine/git.js";
import { CliUsageError, defineCommand } from "../command-contract/contract.js";
import { HoldReportSchema } from "../command-contract/schemas.js";
import { browserRefusal, commonRefusals, serverRefusal } from "../command-contract/common.js";

const usage = "board needs a subcommand: list, info, new, open, save";
const tokens = z.array(z.string()).default([]);
type Stage = { positionals: string[]; flags: Record<string, string | boolean> };
function parseStage(
	values: string[],
	specs: Readonly<Record<string, "flag" | "value">>,
	context: z.RefinementCtx,
): Stage | typeof z.NEVER {
	const positionals: string[] = [];
	const flags: Record<string, string | boolean> = {};
	for (let index = 0; index < values.length; index += 1) {
		const token = values[index]!;
		if (!token.startsWith("--")) {
			positionals.push(token);
			continue;
		}
		let name = token.slice(2);
		let inline: string | undefined;
		const equals = name.indexOf("=");
		if (equals !== -1) {
			inline = name.slice(equals + 1);
			name = name.slice(0, equals);
		}
		const spec = specs[name];
		if (!spec) {
			context.addIssue({ code: "custom", message: `Unknown flag --${name}` });
			return z.NEVER;
		}
		if (spec === "flag") {
			if (inline !== undefined) {
				context.addIssue({ code: "custom", message: `Flag --${name} does not take a value` });
				return z.NEVER;
			}
			flags[name] = true;
			continue;
		}
		const value = inline ?? values[index + 1];
		if (value === undefined) {
			context.addIssue({ code: "custom", message: `Flag --${name} requires a value` });
			return z.NEVER;
		}
		if (inline === undefined) index += 1;
		flags[name] = value;
	}
	return { positionals, flags };
}
export const BoardCommandResultSchema = z.looseObject({
	success: z.boolean(),
	board: z.string(),
	identity: z.looseObject({ board: z.string(), variant: z.string() }),
	elementCount: z.number().int().nonnegative(),
	vaultBacked: z.boolean().optional(),
	pane: z
		.looseObject({
			paneId: z.string(),
			clientId: z.string(),
			place: z.string(),
			position: z.number().int(),
		})
		.nullable()
		.optional(),
	held: HoldReportSchema.optional(),
});
export type BoardCommandResult = z.infer<typeof BoardCommandResultSchema>;

export const BoardNamespaceInputSchema = z.object({ tokens });
export type BoardNamespaceInput = z.infer<typeof BoardNamespaceInputSchema>;
export const BoardNamespaceResultSchema = z.never();
export type BoardNamespaceResult = z.infer<typeof BoardNamespaceResultSchema>;
export const boardContract = defineCommand({
	path: ["board"],
	summary: "Load, save and list boards in the vault",
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
		select: () => "json",
	},
	prerequisites: [],
	effects: [],
	refusals: [],
	relationships: [],
	async handler() {
		throw new CliUsageError(usage);
	},
});

function repoIdentityHere(): string {
	const root = repoRootOf(process.cwd());
	if (!root)
		throw new CliUsageError(
			`${process.cwd()} is not inside a git repository, so there is no repository to look for. Name one with --repo <host/owner/name>, or drop the filter to list every board.`,
		);
	return repoIdentityAt(root);
}
function boardListText(result: BoardListResponse): string {
	if (result.repo) {
		if (!result.boards.length)
			return `No board in ${result.vault} has a node bound to ${result.repo} (${result.scanned ?? 0} board(s) read).`;
		const lines = [`Boards describing ${result.repo}:`];
		for (const entry of result.boards) {
			const level = entry.identity?.level ? `, ${entry.identity.level}` : "";
			lines.push(
				`  ${entry.key} (${entry.identity?.variant ?? "current"}${level}, ${entry.source ?? "vault"})`,
			);
			for (const node of entry.nodes ?? [])
				lines.push(
					`    ${node.name ?? node.node}${node.kind ? ` [${node.kind}]` : ""} -> ${node.path}`,
				);
		}
		lines.push(`Open one with \`board open ${result.boards[0]!.key}\`.`);
		return lines.join("\n");
	}
	if (!result.boards.length) return `No boards in ${result.vault} yet.`;
	return [`Boards in ${result.vault}:`, ...result.boards.map((entry) => `  ${entry.key}`)].join(
		"\n",
	);
}

export const BoardListInputSchema = z.object({ tokens });
export type BoardListInput = z.infer<typeof BoardListInputSchema>;
export const BoardListStageSchema = z
	.array(z.string())
	.transform((value, context) =>
		parseStage(value, { repo: "value", here: "flag", text: "flag" }, context),
	)
	.superRefine((stage, context) => {
		if (stage.flags.here && typeof stage.flags.repo === "string") {
			context.addIssue({
				code: "custom",
				message: "--here and --repo say the same thing twice; pick one.",
			});
		}
	});
export type BoardListStage = z.infer<typeof BoardListStageSchema>;
export const BoardListJsonResultSchema = z.looseObject({
	success: z.literal(true),
	vault: z.string(),
	boards: z.array(z.looseObject({ key: z.string() })),
	open: z.array(z.looseObject({ key: z.string() })),
	onScreen: z.array(z.looseObject({ paneId: z.string(), place: z.string(), board: z.string() })),
	held: HoldReportSchema.optional(),
});
export type BoardListJsonResult = z.infer<typeof BoardListJsonResultSchema>;
export const BoardListResultSchema = z.union([BoardListJsonResultSchema, z.string()]);
export type BoardListResult = z.infer<typeof BoardListResultSchema>;
export const boardListContract = defineCommand({
	path: ["board", "list"],
	summary: "List boards in the vault or describing one repository",
	usage: "board list [--repo <host/owner/name> | --here] [--text]",
	description: "Lists vault and in-memory boards, optionally filtered by repository binding.",
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
		select: (input) => (input.tokens.includes("--text") ? "text" : "json"),
	},
	prerequisites: ["server"],
	effects: ["local-read", "read"],
	refusals: [serverRefusal],
	relationships: [
		{ method: "GET", path: "/api/boards", cardinality: "one", description: "List boards" },
	],
	async handler(input, context) {
		await context.require("server", "board list");
		const stage = context.parse(BoardListStageSchema, input.tokens);
		let repo: string | undefined;
		if (stage.flags.here) {
			repo = repoIdentityHere();
			context.diagnostic(`Standing in ${repo}.`);
		} else if (typeof stage.flags.repo === "string") repo = stage.flags.repo;
		const result = await listBoardsOnCanvas(repo);
		if (repo && !result.repo)
			throw new Error(
				`The canvas server is older than this CLI and ignored the repository filter, so this would have listed every board as though each described ${repo}. Restart it (\`canvas stop\` then \`canvas start\`) and try again.`,
			);
		const diagnostics: string[] = [];
		const reported = new Set<string>();
		for (const entry of result.boards.filter((candidate) => candidate.collidesWith?.length)) {
			if (reported.has(entry.key)) continue;
			reported.add(entry.key);
			diagnostics.push(
				`"${entry.key}" is the address of ${(entry.collidesWith?.length ?? 0) + 1} notes that differ only in casing or accents: ${[entry.file, ...(entry.collidesWith ?? [])].join(", ")}. Board names are case-insensitive, so only ${entry.file} is reachable. Rename or delete the others.`,
			);
		}
		if (stage.flags.text) return { result: boardListText(result), diagnostics };
		return {
			result: BoardListJsonResultSchema.parse({
				success: true as const,
				vault: result.vault,
				...(result.repo ? { repo: result.repo, scanned: result.scanned } : {}),
				...(result.unreadable ? { unreadable: result.unreadable } : {}),
				boards: result.boards,
				open: result.open,
				onScreen: result.onScreen,
			}),
			diagnostics,
		};
	},
});

export const BoardInfoInputSchema = z.object({ tokens });
export type BoardInfoInput = z.infer<typeof BoardInfoInputSchema>;
export const BoardInfoStageSchema = z
	.array(z.string())
	.transform((value, context) => parseStage(value, {}, context));
export type BoardInfoStage = z.infer<typeof BoardInfoStageSchema>;
export const BoardInfoResultSchema = BoardCommandResultSchema;
export type BoardInfoResult = z.infer<typeof BoardInfoResultSchema>;
export const boardInfoContract = defineCommand({
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
	async handler(input, context) {
		await context.require("server", "board info");
		context.parse(BoardInfoStageSchema, input.tokens);
		return { result: BoardInfoResultSchema.parse(await getBoardInfo()) };
	},
});

const addressSpecs = { variant: "value", level: "value", pane: "value" } as const;
export const BoardNewInputSchema = z.object({ tokens });
export type BoardNewInput = z.infer<typeof BoardNewInputSchema>;
export const BoardNewStageSchema = z
	.array(z.string())
	.transform((value, context) => parseStage(value, addressSpecs, context))
	.transform((stage, context) => {
		const name = stage.positionals[0];
		if (!name) {
			context.addIssue({ code: "custom", message: "board new needs a name" });
			return z.NEVER;
		}
		return { name, flags: stage.flags };
	});
export type BoardNewStage = z.infer<typeof BoardNewStageSchema>;
export const BoardNewResultSchema = BoardCommandResultSchema;
export type BoardNewResult = z.infer<typeof BoardNewResultSchema>;
export const boardNewContract = defineCommand({
	path: ["board", "new"],
	summary: "Start a new empty board",
	usage: "board new <name> [--variant v] [--level l] [--pane <spec>]",
	description: "Creates an empty board after server contact and optionally shows it in one pane.",
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
				description: "Board address and pane options",
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
		select: () => "json",
	},
	prerequisites: ["server"],
	effects: ["server-state-write", "browser"],
	refusals: [serverRefusal, browserRefusal],
	relationships: [
		{
			method: "POST",
			path: "/api/boards/new",
			cardinality: "one",
			description: "Create the board",
		},
	],
	async handler(input, context) {
		await context.require("server", "board new");
		const stage = context.parse(BoardNewStageSchema, input.tokens);
		const result = await newBoard({
			board: stage.name,
			...(typeof stage.flags.variant === "string" ? { variant: stage.flags.variant } : {}),
			...(typeof stage.flags.level === "string" ? { level: stage.flags.level } : {}),
			...(typeof stage.flags.pane === "string" ? { pane: stage.flags.pane } : {}),
		});
		return {
			result: BoardNewResultSchema.parse(result),
			diagnostics: [
				`Board "${result.board}" is empty. Its note is written the moment something is drawn on it.${result.pane ? ` It is on screen in ${result.pane.place === "the only pane" ? "the only pane" : `the ${result.pane.place} pane`}.` : ""}`,
			],
		};
	},
});

export const BoardOpenInputSchema = z.object({ tokens });
export type BoardOpenInput = z.infer<typeof BoardOpenInputSchema>;
export const BoardOpenStageSchema = z
	.array(z.string())
	.transform((value, context) => parseStage(value, { ...addressSpecs, reload: "flag" }, context))
	.transform((stage, context) => {
		const name = stage.positionals[0];
		if (!name) {
			context.addIssue({ code: "custom", message: "board open needs a board name" });
			return z.NEVER;
		}
		return { name, flags: stage.flags };
	});
export type BoardOpenStage = z.infer<typeof BoardOpenStageSchema>;
export const BoardOpenResultSchema = BoardCommandResultSchema;
export type BoardOpenResult = z.infer<typeof BoardOpenResultSchema>;
export const boardOpenContract = defineCommand({
	path: ["board", "open"],
	summary: "Open a board from memory or its vault note",
	usage: "board open <name[@variant]> [--variant v] [--reload] [--pane <spec>]",
	description: "Loads one board and optionally points a selected pane at it.",
	examples: ["archboard board open payments@option-a --pane right"],
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
		ingress: BoardOpenInputSchema,
		stages: [
			{
				name: "open-options",
				when: "after-server",
				description: "Board address, reload, and pane options",
				schema: BoardOpenStageSchema,
			},
		],
	},
	result: BoardOpenResultSchema,
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
		select: () => "json",
	},
	prerequisites: ["server"],
	effects: ["read", "browser"],
	refusals: [serverRefusal, browserRefusal],
	relationships: [
		{ method: "POST", path: "/api/boards/open", cardinality: "one", description: "Open the board" },
	],
	async handler(input, context) {
		await context.require("server", "board open");
		const stage = context.parse(BoardOpenStageSchema, input.tokens);
		const result = await openBoard({
			board: stage.name,
			...(typeof stage.flags.variant === "string" ? { variant: stage.flags.variant } : {}),
			...(typeof stage.flags.level === "string" ? { level: stage.flags.level } : {}),
			...(stage.flags.reload ? { reload: true } : {}),
			...(typeof stage.flags.pane === "string" ? { pane: stage.flags.pane } : {}),
		});
		const diagnostics = [
			result.pane
				? `"${result.board}" is showing in ${result.pane.place === "the only pane" ? "the only pane" : `the ${result.pane.place} pane`}. Commands still name it: \`--board ${result.board}\`.`
				: `"${result.board}" is loaded, but no pane is open, so nothing is showing it.`,
		];
		if (result.source === "memory")
			diagnostics.push(
				`"${result.board}" was already open here, so this only pointed a pane at it. Pass --reload to re-read its address off disk, which is also what un-sticks a board after a write was refused.`,
			);
		if (result.declaredKey)
			diagnostics.push(
				`Note: this file's frontmatter says it is board "${result.declaredKey}", not "${result.board}". The path is the address, so it opened as the path says; saving rewrites the frontmatter to match.`,
			);
		return { result: BoardOpenResultSchema.parse(result), diagnostics };
	},
});
