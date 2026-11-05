// The default TypeScript server of a checkout on TypeScript before 7
// (TASK-579.13): the real typescript-language-server that the checkout
// installs, on the checkout's own TypeScript 5. It names the declarations that
// `tsc --lsp` names, through a `paths` alias and through a value, and its
// outline tells code that runs from a member of a type. The session reports
// which server and TypeScript answered. typescript-language-server runs on
// Node, so where Node is not on the PATH this skips.

import { afterEach, expect, test } from "bun:test";
import { cpSync, mkdirSync, symlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { languageServerOf } from "#runtime/operations/language-servers/server-command.ts";
import { openLanguageServers } from "#runtime/services/language-servers/session.ts";
import { type Language } from "#runtime/operations/language-servers/languages.ts";
import { workspace, type Workspace } from "#tests/runtime/support/language-servers/fixture.ts";

/** The TypeScript server the check chooses for a checkout with no configured one. */
const servers = (language: Language, root: string) => languageServerOf(language, root, {});

/**
 * The directory of a package Archboard installs for its tests.
 * @param name The package.
 * @returns Its directory.
 */
function installed(name: string): string {
	return dirname(Bun.resolveSync(`${name}/package.json`, import.meta.dir));
}

let current: Workspace | undefined;

afterEach(() => {
	current?.remove();
	current = undefined;
});

test.skipIf(Bun.which("node") === null)(
	"typescript-language-server on the checkout's TypeScript 5 resolves through an alias and a value, and says which definitions are code that runs",
	async () => {
		current = workspace({
			"tsconfig.json": JSON.stringify({
				compilerOptions: {
					strict: true,
					module: "esnext",
					moduleResolution: "bundler",
					paths: { "@/*": ["./src/*"] },
				},
				include: ["src"],
			}),
			"src/vocabulary.ts": [
				"export function newVocabularyProblem(): string {",
				"  return 'x';",
				"}",
				"export class Ledger {",
				"  post(): void {}",
				"  total = 0;",
				"}",
				"export interface Memory { remember(): void }",
				"export type Drawn = Ledger & { readonly kind: 'drawn' };",
			].join("\n"),
			"src/write.ts": [
				"import { newVocabularyProblem, Ledger, type Memory, type Drawn } from '@/vocabulary';",
				"export function write(ledger: Ledger, memory: Memory, drawn: Drawn): number {",
				"  ledger.post();",
				"  memory.remember();",
				"  newVocabularyProblem();",
				"  return drawn.kind.length + ledger.total;",
				"}",
			].join("\n"),
		});
		const at = current;
		// Copies, not links: the check runs no TypeScript whose links leave the checkout.
		const modules = join(at.root, "node_modules");
		cpSync(installed("typescript-5"), join(modules, "typescript"), { recursive: true });
		cpSync(installed("typescript-language-server"), join(modules, "typescript-language-server"), {
			recursive: true,
		});
		mkdirSync(join(modules, ".bin"));
		symlinkSync(
			"../typescript-language-server/lib/cli.mjs",
			join(modules, ".bin/typescript-language-server"),
		);
		const session = openLanguageServers({ servers, signal: new AbortController().signal });
		const question = { root: at.root, file: "src/write.ts" };
		const asked = await Promise.all(
			[
				[5, "newVocabularyProblem"],
				[3, "ledger.post"],
				[4, "memory.remember"],
				[6, "drawn.kind"],
				[6, "ledger.total"],
			].map(async ([line, symbol]) => {
				const answer = await session.definition({
					...question,
					line: Number(line),
					symbol: String(symbol),
				});
				const [location] = answer.status === "answered" ? answer.locations : [];
				const declares =
					location === undefined ? undefined : await session.declaration(at.root, location);
				return [location?.path.slice(at.root.length), location?.line, declares];
			}),
		);
		// The same answers as tsc --lsp of TypeScript 7 (typescript-server.test.ts): each lands
		// on its declaration in vocabulary.ts, not on the import that names it.
		expect(asked).toEqual([
			["/src/vocabulary.ts", 1, "code"],
			["/src/vocabulary.ts", 5, "code"],
			["/src/vocabulary.ts", 8, "type"],
			["/src/vocabulary.ts", 9, "unknown"],
			["/src/vocabulary.ts", 6, "data"],
		]);
		await session.close();
		expect(session.unavailable()).toEqual([]);
		expect(session.timings()).toMatchObject([
			{
				program: "typescript-language-server",
				typescript: { version: "5.9.3", from: "checkout" },
			},
		]);
	},
);
