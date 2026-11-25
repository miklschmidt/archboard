// The language server setup brief (TASK-646.03): one brief tells an agent how to set up the
// language servers of a checkout, for `archboard init` and for Fix with Codex. A brief for the
// languages that lack a server names, for each, the server that it needs and how to install it, and
// says the same server to a person who reads that the server is missing (TASK-646.09).

import { expect, test } from "bun:test";
import { languageServerSetup } from "#shared/api/language-server-setup.ts";
import { CONFIGURABLE_LANGUAGES } from "#shared/api/languages.ts";

const SERVERS = {
	typescript: "typescript-language-server",
	python: "pyright-langserver",
	csharp: "csharp-ls",
	swift: "sourcekit-lsp",
	c: "clangd",
	rust: "rust-analyzer",
	go: "gopls",
} as const satisfies Record<(typeof CONFIGURABLE_LANGUAGES)[number], string>;

test.each([...CONFIGURABLE_LANGUAGES])(
	"a brief for %s names its server and how to install it",
	(language) => {
		const { brief } = languageServerSetup([language]);
		const line = brief.split("\n").find((text) => text.includes(`\`${language}\``));
		expect(line).toContain(SERVERS[language]);
		expect(line).toMatch(/install/i);
	},
);

test("a brief names only the languages that it is given", () => {
	const { brief } = languageServerSetup(["rust"]);
	expect(brief).toContain(SERVERS.rust);
	expect(brief).not.toContain(SERVERS.go);
});

test("a setup names, for a person, the server that each missing language needs", () => {
	const { needs } = languageServerSetup(["python", "go"]);
	expect(needs.map(({ language }) => language)).toEqual(["python", "go"]);
	expect(needs[0]?.server).toContain(SERVERS.python);
	expect(needs[1]?.server).toContain(SERVERS.go);
});

test("a setup with no languages lets the agent find them, and names no server", () => {
	const { brief, needs } = languageServerSetup();
	expect(needs).toEqual([]);
	expect(brief).toContain("Find the languages that the repository uses");
});

test("a setup leaves out a language whose server no agent configures", () => {
	const { brief, needs } = languageServerSetup(["python", "cobol"]);
	expect(needs.map(({ language }) => language)).toEqual(["python"]);
	expect(brief).not.toContain("cobol");
});
