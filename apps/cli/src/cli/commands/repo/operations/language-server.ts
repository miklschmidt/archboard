import path from "node:path";
import { z } from "zod";
import {
	inspectCheckout,
	chosenCheckouts,
	listRegistry,
	readServers,
	setServer,
	LanguageServersSchema,
} from "@archboard/workspace/checkouts";
import {
	CliUsageError,
	defineCommand,
	type CommandContext,
} from "#cli/contract/protocol/contract.ts";
import { commandLine, type NamedServer } from "#cli/commands/repo/rules/command-line.ts";
import { CONFIGURABLE_LANGUAGES } from "@archboard/workspace/languages";

const tail = z.array(z.string()).default([]);

const RepoLanguageServerInputSchema = z.object({
	language: z
		.enum(CONFIGURABLE_LANGUAGES, {
			error: `repo language-server takes a language: ${CONFIGURABLE_LANGUAGES.join(", ")}. Use c for C, C++ and Objective-C.`,
		})
		.optional(),
	command: z.string().min(1).optional(),
	arg: z.array(z.string()).default([]),
	remove: z.boolean().default(false),
	global: z.boolean().default(false),
	repo: z.string().min(1).optional(),
	tail,
});
type RepoLanguageServerInput = z.infer<typeof RepoLanguageServerInputSchema>;
const ServerFileResultSchema = z.object({
	file: z.string(),
	servers: LanguageServersSchema,
	problem: z.string().optional(),
});
const RepoLanguageServerResultSchema = z.object({
	success: z.literal(true),
	repo: z.string().optional(),
	root: z.string().optional(),
	repository: ServerFileResultSchema.optional(),
	global: ServerFileResultSchema,
});

/** The checkout whose repository file a call reads or writes. */
interface TargetCheckout {
	readonly repo: string;
	readonly root: string;
}

const repoLanguageServerContract = defineCommand({
	path: ["repo", "language-server"],
	shared: [],
	summary: "Show, set or remove the language servers of a repository or of this machine",
	description:
		"A language server resolves what the code check can only match by name. A repository names its servers in .archboard/language-servers.json at the root of its checkout, so commit that file: every machine and every CI run that has the checkout then uses them, with no setup. The global language-servers.json beside the Archboard registry names a server for each language that the repository file leaves out. The check runs exactly the command and its arguments, with the environment and PATH that the Archboard server started with, so the server runs code of the repository as an editor does. In the repository file, a command with a / is a path from the checkout root, so the repository can commit a wrapper script that runs its server through nix, devenv or devbox. The language is typescript, python, csharp, swift, c (C, C++ and Objective-C), rust or go. Python, C, C++, Objective-C, C#, Swift, Rust and Go have no default server. A named TypeScript server wins; without one, the check runs the native tsc --lsp --stdio of the checkout's own TypeScript 7 or later, typescript-language-server for its TypeScript before 7, and in a checkout of Archboard then Archboard's own TypeScript. Without a language, the command shows both files. The checkout is the working directory's, unless --repo names a repository, which means its chosen checkout.",
	examples: [
		"archboard repo language-server",
		"archboard repo language-server rust scripts/rust-analyzer",
		"archboard repo language-server rust nix --arg=develop --arg=--command --arg=rust-analyzer",
		"archboard repo language-server c clangd",
		"archboard repo language-server go gopls",
		"archboard repo language-server python pyright-langserver --arg=--stdio",
		"archboard repo language-server typescript typescript-language-server --arg=--stdio --global",
		"archboard repo language-server swift --remove",
	],
	parameters: [
		{
			kind: "positional",
			key: "language",
			name: "language",
			description: `One of ${CONFIGURABLE_LANGUAGES.join(", ")}; without it, the command shows both files`,
		},
		{
			kind: "positional",
			key: "command",
			name: "command",
			description:
				"A program on the PATH, or a path to one; required with a language unless --remove is given",
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
			key: "global",
			spellings: ["--global"],
			value: "none",
			description:
				"Write the global file of this machine, which every checkout falls back to, instead of the repository file",
		},
		{
			kind: "option",
			key: "repo",
			spellings: ["--repo"],
			value: "required",
			placeholder: "identity",
			description:
				"The repository, such as github.com/acme/payments, whose chosen checkout holds the file; the working directory's checkout when absent",
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
				description: "The repository file and the global file, with their servers after any change",
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
	 * Shows both files, or sets or removes one language's server in one of them.
	 * @param input - The parsed options.
	 * @param context - The command context.
	 * @returns Both files after the change.
	 */
	async handler(input, context) {
		const change = requestedChange(input);
		const target = await targetOf(input, change === undefined, context);
		const diagnostics =
			change === undefined ? [] : [applyChange(change, input.global, target, context)];
		return { result: filesResult(target), diagnostics };
	},
});

/** A change that a call asks for: the language, and its server or none. */
interface RequestedChange {
	readonly language: NonNullable<RepoLanguageServerInput["language"]>;
	readonly server: NamedServer | undefined;
}

/**
 * The change a `repo language-server` call asks for.
 * @param input The parsed options.
 * @returns The change, or undefined when the call only shows the files.
 * @throws {CliUsageError} When the options give a command, an argument or
 * --remove without a language, or do not say what to do with one.
 */
function requestedChange(input: RepoLanguageServerInput): RequestedChange | undefined {
	const given = input.command !== undefined || input.arg.length > 0;
	if (input.language !== undefined) return changeOf(input.language, given, input);
	if (given || input.remove) {
		throw new CliUsageError(
			"repo language-server needs a language before a command, --arg or --remove",
		);
	}
	return undefined;
}

/**
 * The change a call asks for one language.
 * @param language The language.
 * @param given Whether the call gives a command or an argument.
 * @param input The parsed options.
 * @returns The change.
 * @throws {CliUsageError} When the call both removes and gives a command or an argument.
 */
function changeOf(
	language: RequestedChange["language"],
	given: boolean,
	input: RepoLanguageServerInput,
): RequestedChange {
	if (!input.remove) return { language, server: requestedServer(language, input) };
	if (given) throw new CliUsageError("--remove takes no command and no --arg");
	return { language, server: undefined };
}

/**
 * The server that a call sets.
 * @param language The language.
 * @param input The parsed options.
 * @returns The command as typed and its arguments.
 * @throws {CliUsageError} When the call gives no command.
 */
function requestedServer(language: string, input: RepoLanguageServerInput): NamedServer {
	if (input.command === undefined) {
		throw new CliUsageError(
			`repo language-server ${language} needs the command that starts the server, or --remove`,
		);
	}
	return { command: input.command, args: input.arg };
}

/**
 * The checkout whose repository file a call reads or writes.
 * @param input The parsed options.
 * @param showing Whether the call only shows the files.
 * @param context The command context.
 * @returns The checkout, or undefined outside one when the call needs none.
 * @throws {CliUsageError} When --global and --repo are both given.
 */
async function targetOf(
	input: RepoLanguageServerInput,
	showing: boolean,
	context: Pick<CommandContext, "signal">,
): Promise<TargetCheckout | undefined> {
	if (input.repo === undefined) {
		const optional = showing || input.global;
		return workingDirectoryCheckout(process.cwd(), context.signal, optional);
	}
	if (input.global) {
		throw new CliUsageError("--global writes the file of this machine, so it takes no --repo");
	}
	return chosenCheckoutOf(input.repo);
}

/**
 * Write one change into its file.
 * @param change The change.
 * @param global Whether it goes into the global file.
 * @param target The checkout, for the repository file.
 * @param context Resolves a path from the working directory.
 * @returns What the change did, as the agent reads it.
 */
function applyChange(
	change: RequestedChange,
	global: boolean,
	target: TargetCheckout | undefined,
	context: Pick<CommandContext, "resolvePath">,
): string {
	const scope = global ? "global" : "repository";
	const typed = change.server;
	const root = scope === "repository" ? target?.root : undefined;
	const server =
		typed === undefined
			? undefined
			: { ...typed, command: storedCommand(typed.command, root, context.resolvePath) };
	const written = setServer(scope, change.language, server, target?.root);
	return changeNote(change.language, server, written.file, scope, target);
}

/**
 * Both files, as the answer gives them.
 * @param target The checkout whose repository file the call read, if any.
 * @returns The answer.
 */
function filesResult(
	target: TargetCheckout | undefined,
): z.infer<typeof RepoLanguageServerResultSchema> {
	const global = fileResult(readServers("global"));
	if (target === undefined) return { success: true, global };
	const repository = fileResult(readServers("repository", target.root));
	return { success: true, repo: target.repo, root: target.root, repository, global };
}

/**
 * The command as its file keeps it. A name stays a name. A path is read from
 * the working directory. The global file belongs to this machine and keeps it
 * absolute. Every machine reads the repository file, so it keeps a path inside
 * the checkout as a path from the checkout root, and refuses any other path.
 * @param command The command as typed.
 * @param root The checkout root, for the repository file.
 * @param resolvePath Resolves a path from the working directory.
 * @returns The command to store.
 * @throws {CliUsageError} When the repository file would hold a path outside the checkout.
 */
function storedCommand(
	command: string,
	root: string | undefined,
	resolvePath: (file: string) => string,
): string {
	if (path.basename(command) === command) return command;
	const absolute = resolvePath(command);
	if (root === undefined) return absolute;
	const relative = path.relative(root, absolute);
	const outside =
		relative === "" || path.isAbsolute(relative) || relative.split(path.sep)[0] === "..";
	if (outside)
		throw new CliUsageError(
			`${absolute} is outside the checkout, and every machine reads the committed repository file. Install the server through the repository's own environment, such as its Nix flake, devenv, devbox or package manager, so that it is on the PATH, or name a script in the checkout by its path from the checkout root. To name a program of this machine only, add --global.`,
		);
	return `./${relative.split(path.sep).join("/")}`;
}

/**
 * What a change did, as the agent reads it.
 * @param language The language.
 * @param server The server now named, or undefined when it was removed.
 * @param file The file that changed.
 * @param scope Which file it is.
 * @param target The checkout the call addressed.
 * @returns The note.
 */
function changeNote(
	language: string,
	server: NamedServer | undefined,
	file: string,
	scope: "repository" | "global",
	target: TargetCheckout | undefined,
): string {
	if (server === undefined) return `${file} names no ${language} server now.`;
	const where =
		scope === "global"
			? `in every checkout whose repository file names no ${language} server`
			: `in every checkout of "${target?.repo}" that has this file. Commit it so that other machines and CI use it`;
	return `check code runs ${commandLine(server)} for ${language} ${where}. It runs with the environment and PATH that the Archboard server started with, and it runs code of the repository.`;
}

/**
 * A file as the answer gives it.
 * @param read What the file says.
 * @returns The file, its servers, and its problem when it cannot be read.
 */
function fileResult(read: ReturnType<typeof readServers>): z.infer<typeof ServerFileResultSchema> {
	return "problem" in read
		? { file: read.file, servers: {}, problem: read.problem }
		: { file: read.file, servers: read.servers };
}

/**
 * Why a repository cannot be named: no checkout of it is known.
 * @param repo The identity.
 * @returns The refusal.
 */
function notRegistered(repo: string): string {
	const known = chosenCheckouts().map((each) => each.repo);
	const registered = known.length > 0 ? ` (registered: ${known.join(", ")})` : "";
	return `"${repo}" is not registered on this machine${registered}. Run this in its checkout, or register the checkout with archboard repo add <dir>.`;
}

/**
 * The chosen checkout of a repository.
 * @param repo The identity.
 * @returns The identity and the root of its chosen checkout.
 * @throws {CliUsageError} When no checkout of it is chosen.
 */
function chosenCheckoutOf(repo: string): TargetCheckout {
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
 * The checkout that the working directory is in. The file belongs to the
 * repository, so the checkout need not be registered.
 * @param dir The working directory.
 * @param signal Cancels the git call.
 * @param optional Whether the call can go without one: it only shows the
 * files, or it writes the global file.
 * @returns The checkout's identity and root, or undefined outside a checkout when it is optional.
 * @throws {CliUsageError} When the directory is in no repository and the call needs one.
 */
async function workingDirectoryCheckout(
	dir: string,
	signal: AbortSignal,
	optional: boolean,
): Promise<TargetCheckout | undefined> {
	const checkout = await inspectCheckout(dir, { signal });
	if (checkout !== undefined) return { repo: checkout.identity, root: checkout.root };
	if (optional) return undefined;
	throw new CliUsageError(
		`${dir} is in no git repository: run this in a checkout, name one with --repo, or write the file of this machine with --global.`,
	);
}

export { repoLanguageServerContract };
