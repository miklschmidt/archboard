import { z } from "zod";
import {
	inspectCheckout,
	chosenCheckouts,
	listRegistry,
	registryPath,
	setLanguageServer,
	type RegisteredRepo,
	ConfiguredServerSchema,
	LanguageServersSchema,
} from "@archboard/workspace/checkouts";
import { CliUsageError, defineCommand } from "#cli/protocol/contract/contract.ts";
import { commandLine } from "#cli/rules/repo/command-line.ts";
import { CONFIGURABLE_LANGUAGES } from "@archboard/workspace/languages";

const tail = z.array(z.string()).default([]);

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
	root: z.string(),
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
		"A language server resolves what the code check can only match by name. Python, C, C++, Objective-C, C# and Swift have no default server, because a server there runs code of the checkout as your editor's does: configure one only for a repository you work in. The Archboard server then runs exactly this command and its arguments, with the environment and PATH that the server started with. The language is python, csharp, swift or c (C, C++ and Objective-C). TypeScript needs no configuration. The checkout is the working directory's, unless --repo names a repository, which means its chosen checkout.",
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
				"The repository, such as github.com/acme/payments, whose chosen checkout is configured; the working directory's checkout when absent",
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
		const { repo, root } =
			input.repo !== undefined
				? chosenCheckoutOf(input.repo)
				: await workingDirectoryCheckout(context.resolvePath(process.cwd()), context.signal);
		const entry = setLanguageServer(root, input.language, server);
		if (entry === undefined) throw new CliUsageError(notRegistered(repo));
		return {
			result: {
				success: true as const,
				repo,
				root,
				language: input.language,
				servers: entry.servers ?? {},
				registry: registryPath(),
			},
			diagnostics: [
				server === undefined
					? `${root} has no ${input.language} server now. check code starts none there.`
					: `check code runs ${commandLine(server)} for ${input.language} in ${root}, with the environment and PATH that the Archboard server started with. It runs code of that checkout.${entry.chosen ? "" : ` It is not the chosen checkout of "${repo}", so a pass reads this server only where it reads this checkout.`}`,
			],
		};
	},
});

/**
 * The server a `repo language-server` call asks for.
 * @param input The parsed options.
 * @returns The command and arguments to set, or undefined to remove the server.
 * @throws {CliUsageError} When the options ask for both or neither, or the command is not one.
 */
function requestedServer(
	input: RepoLanguageServerInput,
): z.infer<typeof ConfiguredServerSchema> | undefined {
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
 * Why a repository cannot be configured: no checkout of it is known.
 * @param repo The identity.
 * @returns The refusal.
 */
function notRegistered(repo: string): string {
	const known = chosenCheckouts().map((each) => each.repo);
	const registered = known.length > 0 ? ` (registered: ${known.join(", ")})` : "";
	return `"${repo}" is not registered on this machine${registered}. Register its checkout with archboard repo add <dir>.`;
}

/**
 * The chosen checkout of a repository.
 * @param repo The identity.
 * @returns The identity and the root of its chosen checkout.
 * @throws {CliUsageError} When no checkout of it is chosen.
 */
function chosenCheckoutOf(repo: string): { repo: string; root: string } {
	const chosen = chosenCheckouts().find((each) => each.repo === repo);
	if (chosen === undefined) {
		const others = listRegistry().checkouts.filter((each) => each.repo === repo);
		throw new CliUsageError(
			others.length === 0
				? notRegistered(repo)
				: `No checkout of "${repo}" is chosen. Choose one with archboard repo use <dir>: ${others.map((each) => each.root).join(", ")}.`,
		);
	}
	return { repo, root: chosen.root };
}

/**
 * The known checkout that the working directory stands in. A configuration
 * belongs to its checkout, so it is the working directory's own, chosen or not.
 * @param dir The working directory.
 * @param signal Cancels the git call.
 * @returns The checkout's identity and root.
 * @throws {CliUsageError} When the directory is in no repository, or its
 * checkout is not a known one.
 */
async function workingDirectoryCheckout(
	dir: string,
	signal: AbortSignal,
): Promise<Pick<RegisteredRepo, "repo" | "root">> {
	const checkout = await inspectCheckout(dir, { signal });
	if (checkout === undefined) {
		throw new CliUsageError(
			`${dir} is in no git repository: run this in a checkout, or name one with --repo.`,
		);
	}
	const known = listRegistry().checkouts.some((entry) => entry.root === checkout.root);
	if (!known) {
		throw new CliUsageError(
			`${checkout.root} is not a known checkout of "${checkout.identity}" on this machine. Register this checkout with archboard repo add ${checkout.root}.`,
		);
	}
	return { repo: checkout.identity, root: checkout.root };
}

export {
	RepoLanguageServerInputSchema,
	type RepoLanguageServerInput,
	RepoLanguageServerResultSchema,
	type RepoLanguageServerResult,
	repoLanguageServerContract,
};
