// The language server setup brief (TASK-646.03): one brief tells an agent how to set up the
// language servers of a checkout, for `archboard init` and for Fix with Codex. A brief for the
// languages that lack a server names, for each, the server that it needs and how to install it.

import { expect, test } from "bun:test";
import { languageServerSetupBrief } from "#shared/api/language-server-setup.ts";
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
		const brief = languageServerSetupBrief([language]);
		const line = brief.split("\n").find((text) => text.includes(`\`${language}\``));
		expect(line).toContain(SERVERS[language]);
		expect(line).toMatch(/install/i);
	},
);

test("a brief names only the languages that it is given", () => {
	const brief = languageServerSetupBrief(["rust"]);
	expect(brief).toContain(SERVERS.rust);
	expect(brief).not.toContain(SERVERS.go);
});
