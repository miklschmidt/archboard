// The brief that hands the setup of a checkout's language servers to an agent (TASK-646.03).
// `archboard init` and Fix with Codex both give it, so the two never give different steps.
// Choosing and installing a server depends on the repository, so the brief names a server and a
// way to install it for each language and leaves the choice to the agent, with the user's consent.
// Browser safe: no Node import.

import type { ConfigurableLanguage } from "#shared/schemas/configurable-languages.ts";

/** The server that each language needs, and a way to install it (skills/archboard/references/setup.md). */
const SERVERS: Readonly<Record<ConfigurableLanguage, { server: string; install: string }>> = {
	typescript: {
		server:
			"TypeScript 7 or later in the repository, whose `tsc --lsp` Archboard starts itself, else `typescript-language-server`",
		install: "`npm install --save-dev typescript-language-server`",
	},
	python: {
		server: "`pyright-langserver`, or `basedpyright-langserver`",
		install: "`npm install -g pyright`, or `pipx install basedpyright`",
	},
	csharp: {
		server: "`csharp-ls`, with the .NET SDK on the `PATH`",
		install: "`dotnet tool install --global csharp-ls`",
	},
	swift: {
		server: "`sourcekit-lsp`, from Swift 6.1 or later",
		install: "the Swift toolchain, which ships it",
	},
	c: {
		server: "`clangd`, for C, C++ and Objective-C, with a `compile_commands.json`",
		install:
			"`apt install clangd`, `brew install llvm` or `nix profile install nixpkgs#clang-tools`",
	},
	rust: {
		server: "`rust-analyzer`, with `cargo` on the `PATH`",
		install:
			"`rustup component add rust-analyzer rust-src` or `nix profile install nixpkgs#rust-analyzer`",
	},
	go: {
		server: "`gopls`, with `go` on the `PATH`",
		install: "`go install golang.org/x/tools/gopls@latest` or `nix profile install nixpkgs#gopls`",
	},
};

/** One language without its server, and the server that it needs, in Markdown. */
interface NeededServer {
	readonly language: ConfigurableLanguage;
	readonly server: string;
}

/** What setting up the language servers of a checkout takes. */
interface LanguageServerSetup {
	/** Each language without its server, and the server that it needs, as a person reads it. */
	readonly needs: readonly NeededServer[];
	/** The brief, as the agent's prompt. */
	readonly brief: string;
}

/**
 * What setting up the language servers of a checkout takes: the server each missing language
 * needs, and the brief for the agent that sets them up.
 * @param missing The languages that lack a server. Without them, the agent finds them itself.
 * @returns The servers they need, and the brief.
 */
function languageServerSetup(missing?: readonly ConfigurableLanguage[]): LanguageServerSetup {
	const needs = (missing ?? []).map((language) => ({
		language,
		server: SERVERS[language].server,
	}));
	return { needs, brief: briefOf(missing) };
}

/**
 * The brief for an agent that sets up the language servers of a checkout.
 * @param missing The languages that lack a server. Without them, the agent finds them itself.
 * @returns The brief, as the agent's prompt.
 */
function briefOf(missing?: readonly ConfigurableLanguage[]): string {
	const find =
		missing === undefined
			? [
					"1. Find the languages that the repository uses, and the servers that `.archboard/language-servers.json` names already.",
				]
			: [
					"1. These languages of the repository have no server. Each line names the server that it needs and a way to install it:",
					...missing.map(
						(language) =>
							`   - \`${language}\`: ${SERVERS[language].server}. Install it with ${SERVERS[language].install}.`,
					),
				];
	return [
		"Finish the Archboard setup of this repository: set up its language servers, so that `archboard check code` resolves names to their definitions.",
		"Archboard cannot do this by itself, because the right server and the way to install it depend on the repository.",
		"",
		"Use the archboard skill, and follow its setup reference (references/setup.md).",
		...find,
		"2. For each language without a server, choose one. Prefer the way that the repository installs its tools already, such as a Nix flake, devenv, devbox or its package manager, so that every machine and CI run gets the same server. Where the server must run through that tool, plan a wrapper script in the repository.",
		"3. Before you install anything or write any file, show the user the plan: each language, its server, how it gets installed, and each `archboard repo language-server` command. Wait until the user confirms or changes the plan.",
		"4. Carry out the plan. Then run `archboard check code`, and make sure that it reports no `language-server-missing` for those languages.",
		"5. Tell the user to commit `.archboard/language-servers.json` and any wrapper script.",
	].join("\n");
}

export { languageServerSetup };
