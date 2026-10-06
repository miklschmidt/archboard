// The default TypeScript server, Archboard's own `tsc --lsp`, on a checkout
// whose tsconfig names a plugin that the checkout installs. It resolves a use
// through a `paths` alias and through a value, and loads no plugin. This is
// the one owner that runs a real server; the stand-in owns the lifecycle.

import { afterEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { openLanguageServers, readLanguageServers } from "@/runtime/language-servers/index";
import { workspace, type Workspace } from "@/runtime/language-servers/tests/fixture";

/** A plugin that leaves a mark wherever it is loaded. */
const PLUGIN = [
	"require('node:fs').writeFileSync(require('node:path').join(__dirname, 'loaded'), '');",
	"module.exports = () => ({ create: (info) => info.languageService });",
].join("\n");

let current: Workspace | undefined;

afterEach(() => {
	current?.remove();
	current = undefined;
});

test("Archboard's tsc --lsp resolves through an alias and a value, and loads no plugin of the checkout", async () => {
	current = workspace({
		"tsconfig.json": JSON.stringify({
			compilerOptions: {
				strict: true,
				module: "esnext",
				moduleResolution: "bundler",
				paths: { "@/*": ["./src/*"] },
				plugins: [{ name: "mark-plugin" }],
			},
			include: ["src"],
		}),
		"node_modules/mark-plugin/package.json": JSON.stringify({
			name: "mark-plugin",
			main: "index.js",
		}),
		"node_modules/mark-plugin/index.js": PLUGIN,
		"src/vocabulary.ts": [
			"export function newVocabularyProblem(): string {",
			"  return 'x';",
			"}",
			"export class Ledger {",
			"  post(): void {}",
			"}",
		].join("\n"),
		"src/write.ts": [
			"import { newVocabularyProblem, Ledger } from '@/vocabulary';",
			"export function write(ledger: Ledger): string {",
			"  ledger.post();",
			"  return newVocabularyProblem();",
			"}",
		].join("\n"),
	});
	const at = current;
	const servers = readLanguageServers(join(at.state, "language-servers.json"));
	const session = openLanguageServers({ servers, signal: new AbortController().signal });
	const question = { root: at.root, file: "src/write.ts" };
	const [alias, value] = await Promise.all([
		session.definition({ ...question, line: 4, symbol: "newVocabularyProblem" }),
		session.definition({ ...question, line: 3, symbol: "ledger.post" }),
	]);
	const vocabulary = join(at.root, "src/vocabulary.ts");
	expect(alias).toEqual({ status: "answered", locations: [{ path: vocabulary, line: 1 }] });
	expect(value).toEqual({ status: "answered", locations: [{ path: vocabulary, line: 5 }] });
	await session.close();
	expect(session.unavailable()).toEqual([]);
	expect(existsSync(join(at.root, "node_modules/mark-plugin/loaded"))).toBe(false);
});
