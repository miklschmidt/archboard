import { z } from "zod";
import {
	declareRepo,
	forgetRepo,
	listRepos,
	registryPath,
	RepoRegistryError,
	setLanguageServer,
} from "@/runtime/engine/repo-registry";
import { inspectCheckout } from "@/runtime/engine/git";
import { CliUsageError, defineCommand } from "@/cli/command-contract/contract";
import {
	CONFIGURABLE_LANGUAGES,
	ConfiguredServerSchema,
	LanguageServersSchema,
	type ConfiguredServer,
} from "@/shared/language-servers/index";

const tail = z.array(z.string()).default([]);

const RepoNamespaceInputSchema = z.object({ action: z.string().optional(), tail });
type RepoNamespaceInput = z.infer<typeof RepoNamespaceInputSchema>;
const RepoNamespaceResultSchema = z.never();
type RepoNamespaceResult = z.infer<typeof RepoNamespaceResultSchema>;
const repoContract = defineCommand({
	path: ["repo"],
	shared: [],
	summary:
		"The repository checkouts on this machine, so a binding can name a repo instead of a directory",
	description: "Routes repository registry subcommands.",
	examples: ["archboard repo list"],
	parameters: [
		{
			kind: "positional",
			key: "action",
			name: "subcommand",
			hidden: true,
			description: "Repository subcommand",
		},
		{
			kind: "positional",
			key: "tail",
			name: "arguments",
			repeatable: true,
			route: "pass-through",
			hidden: true,
			description: "Subcommand arguments",
		},
	],
	input: { ingress: RepoNamespaceInputSchema },
	result: RepoNamespaceResultSchema,
	output: {
		cases: [{ id: "json", when: {}, mode: "json", description: "Namespace refusal" }],
		/**
		 * Selects the only output case.
		 * @returns The json case id.
		 */
		select: () => "json",
	},
	prerequisites: [],
	effects: [],
	refusals: [],
	relationships: [],
	/**
	 * Refuses the bare namespace with its subcommand usage line.
	 * @returns Never; the usage error is the whole behaviour.
	 */
	async handler() {
		throw new CliUsageError("repo needs a subcommand: list, add, forget, or language-server");
	},
});

const RegisteredRepoResultSchema = z.object({
	repo: z.string(),
	root: z.string(),
	// Existing registry files can still contain an observed registration.
	source: z.enum(["declared", "observed"]),
	addedAt: z.string(),
	exists: z.boolean().optional(),
	servers: LanguageServersSchema.optional(),
});
type RegisteredRepoResult = z.infer<typeof RegisteredRepoResultSchema>;
const RepoListInputSchema = z.object({ text: z.boolean().default(false), tail });
type RepoListInput = z.infer<typeof RepoListInputSchema>;
const RepoListJsonResultSchema = z.object({
	success: z.literal(true),
	registry: z.string(),
	repos: z.array(RegisteredRepoResultSchema),
});
type RepoListJsonResult = z.infer<typeof RepoListJsonResultSchema>;
const RepoListResultSchema = z.union([RepoListJsonResultSchema, z.string()]);
type RepoListResult = z.infer<typeof RepoListResultSchema>;
const repoListContract = defineCommand({
	path: ["repo", "list"],
	shared: [],
	summary: "List registered repository checkouts",
	description:
		"Reads the machine-local repository registry, with the language servers configured for each checkout.",
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
			hidden: true,
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
				description: "Repository registry",
			},
			{
				id: "text",
				when: { key: "text", present: true },
				mode: "text",
				description: "Human-readable registry",
			},
		],
		/**
		 * Chooses the human listing when `--text` was given, otherwise the json one.
		 * @param input - The parsed list options.
		 * @returns The output case id.
		 */
		select: (input) => (input.text ? "text" : "json"),
	},
	prerequisites: [],
	effects: ["local-read"],
	refusals: [],
	relationships: [],
	/**
	 * Lists the registered checkouts, noting the ones whose directory is gone.
	 * @param input - The parsed list options.
	 * @returns The registry as text or json.
	 */
	async handler(input) {
		const repos = listRepos();
		if (!input.text) {
			return { result: { success: true as const, registry: registryPath(), repos } };
		}
		if (repos.length === 0) {
			return {
				result:
					"No repository is registered on this machine yet.\nRun `repo add` inside a checkout to register it.",
			};
		}
		return {
			result: repos
				.map((entry) => {
					const servers = Object.entries(entry.servers ?? {}).map(
						([language, server]) => `\n  ${language}: ${commandLine(server)}`,
					);
					return `${entry.repo}\n  ${entry.root}${entry.exists ? "" : "  (gone)"}  [${entry.source}]${servers.join("")}`;
				})
				.join("\n"),
		};
	},
});

const RepoAddInputSchema = z.object({ dir: z.string().optional(), tail });
type RepoAddInput = z.infer<typeof RepoAddInputSchema>;
const RepoAddResultSchema = z.object({
	success: z.literal(true),
	repo: z.string(),
	root: z.string(),
	source: z.literal("declared"),
	addedAt: z.string(),
	registry: z.string(),
});
type RepoAddResult = z.infer<typeof RepoAddResultSchema>;
const repoAddContract = defineCommand({
	path: ["repo", "add"],
	shared: [],
	summary: "Register a repository checkout",
	description:
		"Derives a checkout identity from git and records its local root. Registering the same root again keeps its language servers.",
	examples: ["archboard repo add ."],
	parameters: [
		{
			kind: "positional",
			key: "dir",
			name: "dir",
			description: "Checkout directory; the working directory when absent",
		},
		{
			kind: "positional",
			key: "tail",
			name: "ignored",
			repeatable: true,
			route: "pass-through",
			hidden: true,
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
				description: "Registered checkout",
				presentation: ["diagnostics", "result"],
			},
		],
		/**
		 * Selects the only output case.
		 * @returns The json case id.
		 */
		select: () => "json",
	},
	prerequisites: [],
	effects: ["local-read", "local-write"],
	refusals: [],
	relationships: [],
	/**
	 * Registers the checkout at the given directory, or the working directory,
	 * turning a registry refusal into a usage error.
	 * @param input - The parsed add options.
	 * @param context - The command context.
	 * @returns The registered entry with a hint on how to bind through it.
	 */
	async handler(input, context) {
		let entry;
		try {
			entry = await declareRepo(context.resolvePath(input.dir ?? process.cwd()), {
				signal: context.signal,
			});
		} catch (error) {
			if (error instanceof RepoRegistryError) {
				throw new CliUsageError(error.message);
			}
			throw error;
		}
		return {
			result: { success: true as const, ...entry, registry: registryPath() },
			diagnostics: [
				`"${entry.repo}" is now resolvable from anywhere on this machine: a node bound to ${entry.repo} opens the file it names.`,
			],
		};
	},
});

const RepoForgetInputSchema = z.object({
	identity: z
		.string({ error: "repo forget needs a repository identity, e.g. github.com/acme/payments" })
		.min(1),
	tail,
});
type RepoForgetInput = z.infer<typeof RepoForgetInputSchema>;
const RepoForgetResultSchema = z.object({
	success: z.literal(true),
	repo: z.string(),
	forgotten: z.boolean(),
	registry: z.string(),
});
type RepoForgetResult = z.infer<typeof RepoForgetResultSchema>;
const repoForgetContract = defineCommand({
	path: ["repo", "forget"],
	shared: [],
	summary: "Forget a local repository checkout",
	description:
		"Removes one identity, and the language servers configured for it, from the machine-local registry.",
	examples: ["archboard repo forget github.com/acme/payments"],
	parameters: [
		{
			kind: "positional",
			key: "identity",
			name: "identity",
			required: true,
			description: "Repository identity, such as github.com/acme/payments",
		},
		{
			kind: "positional",
			key: "tail",
			name: "ignored",
			repeatable: true,
			route: "pass-through",
			hidden: true,
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
				description: "Forget receipt",
				presentation: ["diagnostics", "result"],
			},
		],
		/**
		 * Selects the only output case.
		 * @returns The json case id.
		 */
		select: () => "json",
	},
	prerequisites: [],
	effects: ["local-read", "local-write"],
	refusals: [],
	relationships: [],
	/**
	 * Forgets one registered identity, explaining what that does and does not
	 * change for bindings that already name it.
	 * @param input - The parsed forget options.
	 * @returns The forget receipt with its explanation.
	 */
	async handler(input) {
		const forgotten = forgetRepo(input.identity);
		const known = forgotten ? [] : listRepos().map((entry) => entry.repo);
		const diagnostic = forgotten
			? `Forgot where "${input.identity}" is checked out. Bindings that already name it keep their address; they just have nothing to resolve to until it is registered again.`
			: `"${input.identity}" was not registered, so nothing changed.${known.length > 0 ? ` Registered here: ${known.join(", ")}.` : ""}`;
		return {
			result: { success: true as const, repo: input.identity, forgotten, registry: registryPath() },
			diagnostics: [diagnostic],
		};
	},
});

const RepoLanguageServerInputSchema = z.object({
	language: z.enum(CONFIGURABLE_LANGUAGES, {
		error: `repo language-server needs a language: ${CONFIGURABLE_LANGUAGES.join(", ")}. Use c for C, C++ and Objective-C.`,
	}),
	command: z.string().min(1).optional(),
	arg: z.array(z.string()).default([]),
	remove: z.boolean().default(false),
	repo: z.string().min(1).optional(),
	tail,
});
type RepoLanguageServerInput = z.infer<typeof RepoLanguageServerInputSchema>;
const RepoLanguageServerResultSchema = z.object({
	success: z.literal(true),
	repo: z.string(),
	language: z.enum(CONFIGURABLE_LANGUAGES),
	servers: LanguageServersSchema,
	registry: z.string(),
});
type RepoLanguageServerResult = z.infer<typeof RepoLanguageServerResultSchema>;
const repoLanguageServerContract = defineCommand({
	path: ["repo", "language-server"],
	shared: [],
	summary: "Set or remove the language server of one language for a registered checkout",
	description:
		"A language server resolves what the code check can only match by name. Python, C, C++, Objective-C, C# and Swift have no default server, because a server there runs code of the checkout as your editor's does: configure one only for a repository you work in. The Archboard server then runs exactly this command and its arguments, with the environment and PATH that the server started with. The language is python, csharp, swift or c (C, C++ and Objective-C). TypeScript needs no configuration. The checkout is the working directory's, unless --repo names another registered one.",
	examples: [
		"archboard repo language-server c clangd",
		"archboard repo language-server python pyright-langserver --arg=--stdio",
		"archboard repo language-server swift --remove",
	],
	parameters: [
		{
			kind: "positional",
			key: "language",
			name: "language",
			required: true,
			description: `One of ${CONFIGURABLE_LANGUAGES.join(", ")}`,
		},
		{
			kind: "positional",
			key: "command",
			name: "command",
			description:
				"A program on the PATH or the absolute path of one; required unless --remove is given",
		},
		{
			kind: "option",
			key: "arg",
			spellings: ["--arg"],
			value: "required",
			occurrences: "append",
			placeholder: "argument",
			description:
				"An argument after the command; write one that starts with - as --arg=<argument>",
		},
		{
			kind: "option",
			key: "remove",
			spellings: ["--remove"],
			value: "none",
			description: "Remove the language's server instead of setting it",
		},
		{
			kind: "option",
			key: "repo",
			spellings: ["--repo"],
			value: "required",
			placeholder: "identity",
			description:
				"The registered repository, such as github.com/acme/payments; the working directory's checkout when absent",
		},
		{
			kind: "positional",
			key: "tail",
			name: "ignored",
			repeatable: true,
			route: "pass-through",
			hidden: true,
			description: "Legacy ignored positional content",
		},
	],
	input: { ingress: RepoLanguageServerInputSchema },
	result: RepoLanguageServerResultSchema,
	output: {
		cases: [
			{
				id: "json",
				when: {},
				mode: "json",
				description: "The servers now configured for the checkout",
				presentation: ["diagnostics", "result"],
			},
		],
		/**
		 * Selects the only output case.
		 * @returns The json case id.
		 */
		select: () => "json",
	},
	prerequisites: [],
	effects: ["local-read", "local-write"],
	refusals: [],
	relationships: [],
	/**
	 * Sets or removes one language's server on a registered checkout.
	 * @param input - The parsed options.
	 * @param context - The command context.
	 * @returns The checkout's servers after the change.
	 */
	async handler(input, context) {
		const server = requestedServer(input);
		const repo =
			input.repo ??
			(await workingDirectoryRepo(context.resolvePath(process.cwd()), context.signal));
		const entry = setLanguageServer(repo, input.language, server);
		if (entry === undefined) throw new CliUsageError(notRegistered(repo));
		return {
			result: {
				success: true as const,
				repo,
				language: input.language,
				servers: entry.servers ?? {},
				registry: registryPath(),
			},
			diagnostics: [
				server === undefined
					? `"${repo}" has no ${input.language} server now. check --code starts none there.`
					: `check --code runs ${commandLine(server)} for ${input.language} in "${repo}", with the environment and PATH that the Archboard server started with. It runs code of that checkout.`,
			],
		};
	},
});

/**
 * A configured server as a person reads it: its command, then its arguments.
 * @param server The server.
 * @returns The line.
 */
function commandLine(server: ConfiguredServer): string {
	return [server.command, ...server.args].join(" ");
}

/**
 * The server a `repo language-server` call asks for.
 * @param input The parsed options.
 * @returns The command and arguments to set, or undefined to remove the server.
 * @throws {CliUsageError} When the options ask for both or neither, or the command is not one.
 */
function requestedServer(input: RepoLanguageServerInput): ConfiguredServer | undefined {
	if (input.remove) {
		if (input.command === undefined && input.arg.length === 0) return undefined;
		throw new CliUsageError("--remove takes no command and no --arg");
	}
	if (input.command === undefined) {
		throw new CliUsageError(
			`repo language-server ${input.language} needs the command that starts the server, or --remove`,
		);
	}
	const parsed = ConfiguredServerSchema.safeParse({ command: input.command, args: input.arg });
	if (!parsed.success) throw new CliUsageError(z.prettifyError(parsed.error));
	return parsed.data;
}

/**
 * Why a repository cannot be configured: it is not registered.
 * @param repo The identity.
 * @returns The refusal.
 */
function notRegistered(repo: string): string {
	const known = listRepos().map((each) => each.repo);
	const registered = known.length > 0 ? ` (registered: ${known.join(", ")})` : "";
	return `"${repo}" is not registered on this machine${registered}. Register its checkout with archboard repo add <dir>.`;
}

/**
 * The repository identity of the working directory's checkout, when this
 * machine registered that checkout.
 * @param dir The working directory.
 * @param signal Cancels the git call.
 * @returns The identity.
 * @throws {CliUsageError} When the directory is in no repository, or its
 * checkout is not the registered one.
 */
async function workingDirectoryRepo(dir: string, signal: AbortSignal): Promise<string> {
	const checkout = await inspectCheckout(dir, { signal });
	if (checkout === undefined) {
		throw new CliUsageError(
			`${dir} is in no git repository: run this in a checkout, or name one with --repo.`,
		);
	}
	const registered = listRepos().find((entry) => entry.repo === checkout.identity);
	if (registered === undefined || registered.root !== checkout.root) {
		throw new CliUsageError(
			registered === undefined
				? `"${checkout.identity}" is not registered on this machine. Register this checkout with archboard repo add ${checkout.root}.`
				: `"${checkout.identity}" is registered at ${registered.root}, not here. Run this there, or register this checkout with archboard repo add ${checkout.root}.`,
		);
	}
	return checkout.identity;
}

export {
	RepoLanguageServerInputSchema,
	type RepoLanguageServerInput,
	RepoLanguageServerResultSchema,
	type RepoLanguageServerResult,
	repoLanguageServerContract,
	RepoNamespaceInputSchema,
	type RepoNamespaceInput,
	RepoNamespaceResultSchema,
	type RepoNamespaceResult,
	repoContract,
	RegisteredRepoResultSchema,
	type RegisteredRepoResult,
	RepoListInputSchema,
	type RepoListInput,
	RepoListJsonResultSchema,
	type RepoListJsonResult,
	RepoListResultSchema,
	type RepoListResult,
	repoListContract,
	RepoAddInputSchema,
	type RepoAddInput,
	RepoAddResultSchema,
	type RepoAddResult,
	repoAddContract,
	RepoForgetInputSchema,
	type RepoForgetInput,
	RepoForgetResultSchema,
	type RepoForgetResult,
	repoForgetContract,
};
