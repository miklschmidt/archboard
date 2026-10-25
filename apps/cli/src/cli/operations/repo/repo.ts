import { z } from "zod";
import {
	chosenCheckouts,
	declareDirectory,
	forgetDirectory,
	listRegistry,
	registryPath,
	RepoRegistryError,
	LanguageServersSchema,
} from "@archboard/workspace/checkouts";
import { CliUsageError, defineCommand } from "#cli/protocol/contract/contract.ts";
import { commandLine } from "#cli/rules/repo/command-line.ts";

const tail = z.array(z.string()).default([]);

const RepoNamespaceInputSchema = z.object({ action: z.string().optional(), tail });
type RepoNamespaceInput = z.infer<typeof RepoNamespaceInputSchema>;
const RepoNamespaceResultSchema = z.never();
type RepoNamespaceResult = z.infer<typeof RepoNamespaceResultSchema>;
const repoContract = defineCommand({
	path: ["repo"],
	shared: [],
	summary:
		"The repository checkouts on this machine and the one that is read for each repository, so a binding can name a repo instead of a directory",
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
		throw new CliUsageError("repo needs a subcommand: list, add, use, forget, or language-server");
	},
});

const RegisteredRepoResultSchema = z.object({
	repo: z.string(),
	root: z.string(),
	// Existing registry files can still contain an observed registration.
	source: z.enum(["declared", "observed"]),
	addedAt: z.string(),
	chosen: z.boolean(),
	exists: z.boolean().optional(),
	servers: LanguageServersSchema.optional(),
});
type RegisteredRepoResult = z.infer<typeof RegisteredRepoResultSchema>;
const UntrackedVaultResultSchema = z.object({
	name: z.string(),
	root: z.string(),
	addedAt: z.string(),
	exists: z.boolean().optional(),
});
const RepoListInputSchema = z.object({ text: z.boolean().default(false), tail });
type RepoListInput = z.infer<typeof RepoListInputSchema>;
const RepoListJsonResultSchema = z.object({
	success: z.literal(true),
	registry: z.string(),
	repos: z.array(RegisteredRepoResultSchema),
	vaults: z.array(UntrackedVaultResultSchema),
	unchosen: z.array(z.string()),
});
type RepoListJsonResult = z.infer<typeof RepoListJsonResultSchema>;
const RepoListResultSchema = z.union([RepoListJsonResultSchema, z.string()]);
type RepoListResult = z.infer<typeof RepoListResultSchema>;
const repoListContract = defineCommand({
	path: ["repo", "list"],
	shared: [],
	summary: "List known repository checkouts and untracked vaults",
	description:
		"Reads the machine-local checkout registry: every known checkout with its repository identity, whether it is the chosen one for that identity and whether its directory exists, the language servers configured for each, every untracked vault with its registry name, and the identities that have no chosen checkout.",
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
				description: "Checkout registry",
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
	 * Lists the known checkouts and vaults, noting the ones whose directory is
	 * gone and the identities that have no chosen checkout.
	 * @param input - The parsed list options.
	 * @returns The registry as text or json.
	 */
	async handler(input) {
		const listing = listRegistry();
		if (!input.text) {
			const { checkouts, vaults, unchosen } = listing;
			return {
				result: {
					success: true as const,
					registry: registryPath(),
					repos: checkouts,
					vaults,
					unchosen,
				},
			};
		}
		return { result: listingText(listing) };
	},
});

/**
 * The registry as a person reads it: each identity with its checkouts, then
 * the untracked vaults.
 * @param listing The registry.
 * @returns The text.
 */
function listingText(listing: ReturnType<typeof listRegistry>): string {
	if (listing.checkouts.length === 0 && listing.vaults.length === 0) {
		return "No checkout is known on this machine yet.\nRun `repo add` inside a checkout to register it.";
	}
	const identities = [...new Set(listing.checkouts.map((entry) => entry.repo))];
	const checkouts = identities.map((repo) => {
		const own = listing.checkouts.filter((entry) => entry.repo === repo);
		const lines = own.map((entry) => {
			const servers = Object.entries(entry.servers ?? {}).map(
				([language, server]) => `\n    ${language}: ${commandLine(server)}`,
			);
			const marks = `${entry.chosen ? "  (chosen)" : ""}${entry.exists ? "" : "  (gone)"}`;
			return `  ${entry.root}${marks}  [${entry.source}]${servers.join("")}`;
		});
		const unchosen = listing.unchosen.includes(repo)
			? ["  No checkout is chosen: run `repo use <dir>` with one of these."]
			: [];
		return [repo, ...unchosen, ...lines].join("\n");
	});
	const vaults = listing.vaults.map(
		(vault) => `${vault.name}  (untracked vault)\n  ${vault.root}${vault.exists ? "" : "  (gone)"}`,
	);
	return [...checkouts, ...vaults].join("\n");
}

const RepoAddInputSchema = z.object({ dir: z.string().optional(), tail });
type RepoAddInput = z.infer<typeof RepoAddInputSchema>;
const CheckoutDeclaredSchema = z.object({
	success: z.literal(true),
	kind: z.literal("checkout"),
	repo: z.string(),
	root: z.string(),
	source: z.literal("declared"),
	addedAt: z.string(),
	/** Whether this checkout is the one this machine reads for its repository. */
	chosen: z.boolean(),
	/** Whether the directory was unknown before. */
	added: z.boolean(),
	/** The root of the chosen checkout that `repo use` replaced. */
	replaced: z.string().optional(),
	/** The worktrees of the checkout that became known with it. */
	worktrees: z.array(z.string()),
	/** The untracked vault that took a new registry name, because this repository's identity is its old one. */
	renamed: z.object({ root: z.string(), from: z.string(), to: z.string() }).optional(),
	registry: z.string(),
});
const VaultDeclaredSchema = z.object({
	success: z.literal(true),
	kind: z.literal("vault"),
	name: z.string(),
	root: z.string(),
	addedAt: z.string(),
	added: z.boolean(),
	registry: z.string(),
});
const RepoAddResultSchema = z.union([CheckoutDeclaredSchema, VaultDeclaredSchema]);
type RepoAddResult = z.infer<typeof RepoAddResultSchema>;
const dirParameters = [
	{
		kind: "positional",
		key: "dir",
		name: "dir",
		description: "Directory; the working directory when absent",
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
] as const;
const registryOutput = {
	cases: [
		{
			id: "json",
			when: {},
			mode: "json",
			description: "Registry receipt",
			presentation: ["diagnostics", "result"],
		},
	],
	/**
	 * Selects the only output case.
	 * @returns The json case id.
	 */
	select: () => "json",
} as const;

/**
 * Declare a directory, turning a registry refusal into a usage error.
 * @param dir The directory the person named.
 * @param choose Whether to make a checkout the chosen one.
 * @param signal Cancels the git calls.
 * @returns What was recorded.
 */
async function declare(dir: string, choose: boolean, signal: AbortSignal) {
	try {
		return await declareDirectory(dir, { choose, signal });
	} catch (error) {
		if (error instanceof RepoRegistryError) {
			throw new CliUsageError(error.message);
		}
		throw error;
	}
}

type Declared = Awaited<ReturnType<typeof declare>>;

/**
 * The receipt of a declared untracked vault.
 * @param declared What was recorded.
 * @returns The result and its diagnostics.
 */
function vaultReceipt(declared: Extract<Declared, { kind: "vault" }>) {
	const { name, root, addedAt } = declared.vault;
	return {
		result: {
			success: true as const,
			kind: "vault" as const,
			name,
			root,
			addedAt,
			added: declared.added,
			registry: registryPath(),
		},
		diagnostics: [`"${name}" is the registry name of the untracked vault at ${root}.`],
	};
}

/**
 * The receipt of a declared checkout, with what a person needs to know next:
 * which checkout is read for its repository.
 * @param declared What was recorded.
 * @returns The result and its diagnostics.
 */
function checkoutReceipt(declared: Extract<Declared, { kind: "checkout" }>) {
	const { checkout, added, replaced, worktrees, renamed } = declared;
	return {
		result: {
			success: true as const,
			kind: "checkout" as const,
			repo: checkout.repo,
			root: checkout.root,
			source: "declared" as const,
			addedAt: checkout.addedAt,
			chosen: checkout.chosen,
			added,
			...(replaced === undefined ? {} : { replaced: replaced.root }),
			worktrees: worktrees.map((each) => each.root),
			...(renamed === undefined ? {} : { renamed }),
			registry: registryPath(),
		},
		diagnostics: checkoutLines(declared),
	};
}

/**
 * What a person needs to know after a checkout was declared: which checkout is
 * read for its repository, which worktrees became known, and which untracked
 * vault took a new name, which a link or a bookmark with the old one no longer reaches.
 * @param declared What was recorded.
 * @returns The lines.
 */
function checkoutLines(declared: Extract<Declared, { kind: "checkout" }>): string[] {
	const { checkout, worktrees, renamed } = declared;
	const chosenRoot = chosenCheckouts().find((each) => each.repo === checkout.repo)?.root;
	const reading = checkout.chosen
		? `"${checkout.repo}" is now read at ${checkout.root}: a node bound to ${checkout.repo} opens the file it names there.`
		: `${checkout.root} is known, and ${chosenRoot ?? "no checkout"} stays the one read for "${checkout.repo}". Run archboard repo use ${checkout.root} to read this one instead.`;
	const worktreeNote =
		worktrees.length === 0
			? []
			: [`${worktrees.length} of its worktrees became known too; repo list shows them.`];
	const renameNote =
		renamed === undefined
			? []
			: [
					`The untracked vault at ${renamed.root} is called "${renamed.to}" now, because "${renamed.from}" is the name of this repository.`,
				];
	return [reading, ...worktreeNote, ...renameNote];
}

const repoAddContract = defineCommand({
	path: ["repo", "add"],
	shared: [],
	summary: "Register a repository checkout or an untracked vault",
	description: [
		"Registers a checkout, or an untracked vault, so that Archboard knows it. Every running server sees the change, so every tab lists it.",
		"",
		"A git checkout:",
		"- The command derives the identity of the checkout from git: its origin remote, or with none the directory name of its main checkout. Every worktree has the identity of its main checkout.",
		"- It records the local root of the checkout, with the worktrees that git lists for it.",
		"- The first known checkout of a repository becomes the one read for it. Adding another never changes that, and repo use does.",
		"- Registering the same root again keeps its language servers, unless its identity changed.",
		"",
		"An untracked vault:",
		"- Outside any git checkout, a directory that holds .archboard/vault is registered as an untracked vault under its base name, made unique on this machine.",
		"- A repository whose identity is the name of an untracked vault keeps it. The vault gets the next free name, which the answer's renamed gives.",
	].join("\n"),
	examples: ["archboard repo add ."],
	parameters: dirParameters,
	input: { ingress: RepoAddInputSchema },
	result: RepoAddResultSchema,
	output: registryOutput,
	prerequisites: [],
	effects: ["local-read", "local-write"],
	refusals: [],
	relationships: [],
	/**
	 * Registers the checkout or vault at the given directory, or the working directory.
	 * @param input - The parsed add options.
	 * @param context - The command context.
	 * @returns The registered entry with a note on what is read.
	 */
	async handler(input, context) {
		const declared = await declare(
			context.resolvePath(input.dir ?? process.cwd()),
			false,
			context.signal,
		);
		return declared.kind === "vault" ? vaultReceipt(declared) : checkoutReceipt(declared);
	},
});

const RepoUseInputSchema = z.object({ dir: z.string().optional(), tail });
type RepoUseInput = z.infer<typeof RepoUseInputSchema>;
const RepoUseResultSchema = CheckoutDeclaredSchema;
type RepoUseResult = z.infer<typeof RepoUseResultSchema>;
const repoUseContract = defineCommand({
	path: ["repo", "use"],
	shared: [],
	summary: "Choose the checkout that this machine reads for its repository",
	description:
		"Makes the checkout the chosen one of its repository identity: the browser reads its vault, and a binding that another vault makes into that identity resolves there. Registers the checkout, with its worktrees, when it is unknown. An untracked vault has no repository identity and is refused. Every running server sees the change, so every pane that shows a board of the repository moves to this checkout with its board, and every tab lists it.",
	examples: ["archboard repo use ../payments-worktree"],
	parameters: dirParameters,
	input: { ingress: RepoUseInputSchema },
	result: RepoUseResultSchema,
	output: registryOutput,
	prerequisites: [],
	effects: ["local-read", "local-write"],
	refusals: [],
	relationships: [],
	/**
	 * Chooses the checkout at the given directory, or the working directory.
	 * @param input - The parsed use options.
	 * @param context - The command context.
	 * @returns The chosen entry, and the root that it replaced.
	 */
	async handler(input, context) {
		const declared = await declare(
			context.resolvePath(input.dir ?? process.cwd()),
			true,
			context.signal,
		);
		if (declared.kind !== "checkout") {
			throw new CliUsageError("repo use chooses a checkout, and an untracked vault is not one");
		}
		return checkoutReceipt(declared);
	},
});

const RepoForgetInputSchema = z.object({
	dir: z
		.string({ error: "repo forget needs the directory of a known checkout or untracked vault" })
		.min(1),
	tail,
});
type RepoForgetInput = z.infer<typeof RepoForgetInputSchema>;
const RepoForgetResultSchema = z.object({
	success: z.literal(true),
	/** The directory that was named, as an absolute path. */
	root: z.string(),
	forgotten: z.boolean(),
	kind: z.enum(["checkout", "vault"]).optional(),
	repo: z.string().optional(),
	name: z.string().optional(),
	/** True when the checkout was the chosen one and its repository has others, so none is chosen now. */
	unchosen: z.boolean(),
	registry: z.string(),
});
type RepoForgetResult = z.infer<typeof RepoForgetResultSchema>;
const repoForgetContract = defineCommand({
	path: ["repo", "forget"],
	shared: [],
	summary: "Forget a known checkout or untracked vault",
	description:
		"Removes the checkout or untracked vault at a directory, and the language servers configured for it, from the machine-local registry. The directory need not exist. Forgetting the chosen checkout of a repository that has other known checkouts leaves it with no chosen checkout until repo use, and meanwhile its bindings resolve as unregistered, except from a vault inside one of its checkouts, which reads its own checkout. Every running server sees the change, so every tab lists it.",
	examples: ["archboard repo forget ../payments-worktree"],
	parameters: [
		{
			kind: "positional",
			key: "dir",
			name: "dir",
			required: true,
			description: "The directory of a known checkout or untracked vault",
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
	output: registryOutput,
	prerequisites: [],
	effects: ["local-read", "local-write"],
	refusals: [],
	relationships: [],
	/**
	 * Forgets one known checkout or untracked vault, explaining what that does
	 * and does not change for bindings that already name it.
	 * @param input - The parsed forget options.
	 * @param context - The command context.
	 * @returns The forget receipt with its explanation.
	 */
	async handler(input, context) {
		const dir = context.resolvePath(input.dir);
		const gone = await forgetDirectory(dir, { signal: context.signal });
		const base = { success: true as const, root: dir, registry: registryPath() };
		if (gone === undefined) {
			const known = listRegistry();
			const where = [
				...known.checkouts.map((each) => each.root),
				...known.vaults.map((each) => each.root),
			];
			return {
				result: { ...base, forgotten: false, unchosen: false },
				diagnostics: [
					`${dir} is not a known checkout or untracked vault, so nothing changed.${where.length > 0 ? ` Known here: ${where.join(", ")}.` : ""}`,
				],
			};
		}
		if (gone.kind === "vault") {
			return {
				result: {
					...base,
					forgotten: true,
					kind: "vault" as const,
					name: gone.vault.name,
					unchosen: false,
				},
				diagnostics: [`Forgot the untracked vault "${gone.vault.name}" at ${gone.vault.root}.`],
			};
		}
		const { repo } = gone.checkout;
		return {
			result: {
				...base,
				forgotten: true,
				kind: "checkout" as const,
				repo,
				unchosen: gone.unchosen,
			},
			diagnostics: [
				gone.unchosen
					? `Forgot ${gone.checkout.root}, the chosen checkout of "${repo}". No checkout of it is chosen now, so its bindings resolve as unregistered, except from a vault inside one of its checkouts, until archboard repo use <dir> chooses one of: ${gone.others.join(", ")}.`
					: `Forgot ${gone.checkout.root}. Bindings that already name "${repo}" keep their address; they have nothing to resolve to until a checkout of it is registered again.`,
			],
		};
	},
});

export {
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
	RepoUseInputSchema,
	type RepoUseInput,
	RepoUseResultSchema,
	type RepoUseResult,
	repoUseContract,
	RepoForgetInputSchema,
	type RepoForgetInput,
	RepoForgetResultSchema,
	type RepoForgetResult,
	repoForgetContract,
};
