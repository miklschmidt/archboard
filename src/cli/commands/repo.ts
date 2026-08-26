import { z } from "zod";
import {
	declareRepo,
	forgetRepo,
	listRepos,
	registryPath,
	RepoRegistryError,
} from "../../runtime/engine/repo-registry.js";
import { CliUsageError, defineCommand } from "../command-contract/contract.js";

const usage = "Usage: repo list [--text] | repo add [dir] | repo forget <identity>";
const tail = z.array(z.string()).default([]);

export const RepoNamespaceInputSchema = z.object({ action: z.string().optional(), tail });
export type RepoNamespaceInput = z.infer<typeof RepoNamespaceInputSchema>;
export const RepoNamespaceResultSchema = z.never();
export type RepoNamespaceResult = z.infer<typeof RepoNamespaceResultSchema>;
export const repoContract = defineCommand({
	path: ["repo"],
	summary:
		"The repository checkouts on this machine, so a binding can name a repo instead of a directory",
	usage,
	description: "Routes repository registry subcommands.",
	examples: ["archboard repo list"],
	parameters: [
		{ kind: "positional", key: "action", name: "subcommand", description: "Repository subcommand" },
		{
			kind: "positional",
			key: "tail",
			name: "arguments",
			repeatable: true,
			route: "pass-through",
			description: "Subcommand arguments",
		},
	],
	input: { ingress: RepoNamespaceInputSchema },
	result: RepoNamespaceResultSchema,
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

export const RegisteredRepoResultSchema = z.object({
	repo: z.string(),
	root: z.string(),
	source: z.enum(["declared", "observed"]),
	addedAt: z.string(),
	exists: z.boolean().optional(),
});
export type RegisteredRepoResult = z.infer<typeof RegisteredRepoResultSchema>;
export const RepoListInputSchema = z.object({ text: z.boolean().default(false), tail });
export type RepoListInput = z.infer<typeof RepoListInputSchema>;
export const RepoListJsonResultSchema = z.object({
	success: z.literal(true),
	registry: z.string(),
	repos: z.array(RegisteredRepoResultSchema),
});
export type RepoListJsonResult = z.infer<typeof RepoListJsonResultSchema>;
export const RepoListResultSchema = z.union([RepoListJsonResultSchema, z.string()]);
export type RepoListResult = z.infer<typeof RepoListResultSchema>;
export const repoListContract = defineCommand({
	path: ["repo", "list"],
	summary: "List registered repository checkouts",
	usage: "repo list [--text]",
	description: "Reads the machine-local repository registry.",
	examples: ["archboard repo list"],
	parameters: [
		{
			kind: "option",
			key: "text",
			spellings: ["--text"],
			value: "none",
			description: "Print a human-readable listing",
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
	input: { ingress: RepoListInputSchema },
	result: RepoListResultSchema,
	output: {
		cases: [
			{
				id: "json",
				when: { key: "text", present: false },
				mode: "json",
				held: "none",
				description: "Repository registry",
			},
			{
				id: "text",
				when: { key: "text", present: true },
				mode: "text",
				held: "none",
				description: "Human-readable registry",
			},
		],
		select: (input) => (input.text ? "text" : "json"),
	},
	prerequisites: [],
	effects: ["local-read"],
	refusals: [],
	relationships: [],
	async handler(input) {
		const repos = listRepos();
		if (!input.text) return { result: { success: true as const, registry: registryPath(), repos } };
		if (!repos.length)
			return {
				result:
					"No repository is registered on this machine yet.\nRun `repo add` inside a checkout, or bind with absolute paths and archboard will learn as it goes.",
			};
		return {
			result: repos
				.map(
					(entry) =>
						`${entry.repo}\n  ${entry.root}${entry.exists ? "" : "  (gone)"}  [${entry.source}]`,
				)
				.join("\n"),
		};
	},
});

export const RepoAddInputSchema = z.object({ dir: z.string().optional(), tail });
export type RepoAddInput = z.infer<typeof RepoAddInputSchema>;
export const RepoAddResultSchema = z.object({
	success: z.literal(true),
	repo: z.string(),
	root: z.string(),
	source: z.enum(["declared", "observed"]),
	addedAt: z.string(),
	registry: z.string(),
});
export type RepoAddResult = z.infer<typeof RepoAddResultSchema>;
export const repoAddContract = defineCommand({
	path: ["repo", "add"],
	summary: "Register a repository checkout",
	usage: "repo add [dir]",
	description: "Derives a checkout identity from git and records its local root.",
	examples: ["archboard repo add ."],
	parameters: [
		{ kind: "positional", key: "dir", name: "dir", description: "Checkout directory" },
		{
			kind: "positional",
			key: "tail",
			name: "ignored",
			repeatable: true,
			route: "pass-through",
			description: "Legacy ignored positional content",
		},
	],
	input: { ingress: RepoAddInputSchema },
	result: RepoAddResultSchema,
	output: {
		cases: [
			{
				id: "json",
				when: {},
				mode: "json",
				held: "none",
				description: "Registered checkout",
				presentation: ["diagnostics", "result"],
			},
		],
		select: () => "json",
	},
	prerequisites: [],
	effects: ["local-read", "local-write"],
	refusals: [],
	relationships: [],
	async handler(input, context) {
		let entry;
		try {
			entry = declareRepo(context.resolvePath(input.dir ?? process.cwd()));
		} catch (error) {
			if (error instanceof RepoRegistryError) throw new CliUsageError(error.message);
			throw error;
		}
		return {
			result: { success: true as const, ...entry, registry: registryPath() },
			diagnostics: [
				`"${entry.repo}" is now resolvable from anywhere on this machine: promote --repo ${entry.repo} --path <path inside it>.`,
			],
		};
	},
});

export const RepoForgetInputSchema = z.object({
	identity: z
		.string({ error: "repo forget needs a repository identity, e.g. github.com/acme/payments" })
		.min(1),
	tail,
});
export type RepoForgetInput = z.infer<typeof RepoForgetInputSchema>;
export const RepoForgetResultSchema = z.object({
	success: z.literal(true),
	repo: z.string(),
	forgotten: z.boolean(),
	registry: z.string(),
});
export type RepoForgetResult = z.infer<typeof RepoForgetResultSchema>;
export const repoForgetContract = defineCommand({
	path: ["repo", "forget"],
	summary: "Forget a local repository checkout",
	usage: "repo forget <identity>",
	description: "Removes one identity from the machine-local registry.",
	examples: ["archboard repo forget github.com/acme/payments"],
	parameters: [
		{ kind: "positional", key: "identity", name: "identity", description: "Repository identity" },
		{
			kind: "positional",
			key: "tail",
			name: "ignored",
			repeatable: true,
			route: "pass-through",
			description: "Legacy ignored positional content",
		},
	],
	input: { ingress: RepoForgetInputSchema },
	result: RepoForgetResultSchema,
	output: {
		cases: [
			{
				id: "json",
				when: {},
				mode: "json",
				held: "none",
				description: "Forget receipt",
				presentation: ["diagnostics", "result"],
			},
		],
		select: () => "json",
	},
	prerequisites: [],
	effects: ["local-read", "local-write"],
	refusals: [],
	relationships: [],
	async handler(input) {
		const forgotten = forgetRepo(input.identity);
		const known = forgotten ? [] : listRepos().map((entry) => entry.repo);
		const diagnostic = forgotten
			? `Forgot where "${input.identity}" is checked out. Bindings that already name it keep their address; they just have nothing to resolve to until it is registered again.`
			: `"${input.identity}" was not registered, so nothing changed.${known.length ? ` Registered here: ${known.join(", ")}.` : ""}`;
		return {
			result: { success: true as const, repo: input.identity, forgotten, registry: registryPath() },
			diagnostics: [diagnostic],
		};
	},
});
