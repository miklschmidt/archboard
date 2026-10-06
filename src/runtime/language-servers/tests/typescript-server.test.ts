// The default TypeScript server, Archboard's own `tsc --lsp`, on a checkout
// whose tsconfig names a plugin that the checkout installs. It resolves a use
// through a `paths` alias and through a value, its outline tells code that
// runs from a member of a type, and it loads no plugin. This is
// the one owner that runs a real server; the stand-in owns the lifecycle.
// Where this platform has no native tsc, this skips.

import { afterEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
	languageServerOf,
	openLanguageServers,
	type Language,
} from "@/runtime/language-servers/index";
import { workspace, type Workspace } from "@/runtime/language-servers/tests/fixture";

/** The TypeScript server of a checkout that installs no TypeScript: Archboard's own. */
const servers = (language: Language, root: string) => languageServerOf(language, root, {});

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

test.skipIf(servers("typescript", import.meta.dir).status !== "command")(
	"Archboard's tsc --lsp resolves through an alias and a value, says which definitions are code that runs, and loads no plugin of the checkout",
	async () => {
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
				return [location?.line, declares];
			}),
		);
		// Each lands on its declaration in vocabulary.ts. Only code that runs reads as code: a
		// member of an interface is a type, and a member of a type literal is not in the outline.
		expect(asked).toEqual([
			[1, "code"],
			[5, "code"],
			[8, "type"],
			[9, "unknown"],
			[6, "data"],
		]);
		await session.close();
		expect(session.unavailable()).toEqual([]);
		expect(existsSync(join(at.root, "node_modules/mark-plugin/loaded"))).toBe(false);
	},
);
