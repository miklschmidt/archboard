// An export that can be called counts as a function, even when a call makes
// it (TASK-646.15): a compound component made by `Object.assign` onto a
// function, and a helper that a factory returns, as `cva(...)` does. An
// exported zod schema is a value still. Without a language server, no checker
// tells what a call made, so its `EXPOSED_VALUE` is information.
//
// The checkout `shop` holds a canonical vault. `ui` exports three compound
// components: one onto a function of its own file, one onto a function that
// `primitives` defines, and one onto an arrow function. `style` exports a
// class-name helper that a factory makes. `contract` exports a zod schema and
// a frozen literal, which is a value whatever a server says. `app` calls each
// of them. Where this platform has no native tsc, the case that needs the
// language server skips.

import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { DEFAULT_SEMANTIC_POLICY } from "@archboard/model/policy";
import type * as CodeCheckRun from "#runtime/api/code-check-run.ts";
import { languageServerOf } from "#runtime/language-servers/operations/server-command.ts";
import type { CodeCheckAnswer } from "#shared/protocol/code-check.ts";
import { git as fixtureGit, register, write } from "#tests/runtime/support/code-check/fixture.ts";

const caller = { ARCHBOARD_REPOS: process.env["ARCHBOARD_REPOS"] };
const scratch = realpathSync(mkdtempSync(join(tmpdir(), "archboard-module-depth-callables-")));
const shop = join(scratch, "shop");
const vault = join(shop, ".archboard", "vault");
process.env["ARCHBOARD_REPOS"] = join(scratch, "repos.json");
const SHOP = "github.com/test/shop";
const native = languageServerOf("typescript", scratch, undefined).status === "command";
let codeCheck: ReturnType<typeof CodeCheckRun.createCodeCheck>;

/**
 * Run Git in the checkout.
 * @param args Git's arguments.
 */
function git(...args: string[]): void {
	fixtureGit(scratch, shop, ...args);
}

/**
 * One module of the model, bound to code in the checkout.
 * @param id Its id in the model.
 * @param order Its order.
 * @param path Its bound path.
 */
function module(id: string, order: number, path: string): void {
	write(vault, {
		[`${id}.module.json`]: JSON.stringify({
			schemaVersion: 1,
			id: `Shop#${id}`,
			name: id,
			kind: "module",
			order,
			binding: { repo: SHOP, path },
			outgoing: [],
		}),
	});
}

beforeAll(async () => {
	mkdirSync(shop, { recursive: true });
	writeFileSync(join(scratch, "gitconfig"), "");
	git("init", "-q", "-b", "main");
	git("remote", "add", "origin", `https://${SHOP}.git`);
	mkdirSync(join(shop, "node_modules"), { recursive: true });
	symlinkSync(dirname(require.resolve("zod/package.json")), join(shop, "node_modules", "zod"));
	write(shop, {
		".gitignore": "node_modules\n",
		"tsconfig.json": JSON.stringify({
			compilerOptions: { strict: true, module: "esnext", moduleResolution: "bundler" },
			include: ["src"],
		}),
		"src/primitives/index.ts":
			"export function PanelRoot(props: { wide: boolean }): string {\n\treturn props.wide ? 'wide' : 'narrow';\n}\n",
		"src/ui/index.ts": [
			'import { PanelRoot } from "../primitives";',
			"function DialogRoot(props: { open: boolean }): string {",
			"\treturn props.open ? 'open' : 'closed';",
			"}",
			"function DialogTitle(): string {",
			"\treturn 'title';",
			"}",
			"export const Dialog = Object.assign(DialogRoot, { Title: DialogTitle });",
			"export const Panel = Object.assign(PanelRoot, { Title: DialogTitle });",
			"export const Gap = Object.assign((size: number) => `${size * 4}px`, { unit: 'px' });",
			"",
		].join("\n"),
		"src/style/index.ts": [
			"function variants(base: string) {",
			"\treturn (variant?: string): string => `${base} ${variant ?? 'plain'}`;",
			"}",
			"export const buttonClass = variants('button');",
			"",
		].join("\n"),
		"src/contract/index.ts": [
			'import { z } from "zod";',
			"export const UserSchema = z.object({ name: z.string() });",
			"export const LIMITS = Object.freeze({ names: 3 });",
			"",
		].join("\n"),
		"src/app/main.ts": [
			'import { Dialog, Gap, Panel } from "../ui";',
			'import { buttonClass } from "../style";',
			'import { LIMITS, UserSchema } from "../contract";',
			"const user = UserSchema.parse({ name: 'a' });",
			"console.log(Dialog({ open: true }), Dialog.Title(), Panel({ wide: false }), Gap(2));",
			"console.log(buttonClass('primary'), user.name, LIMITS.names);",
			"",
		].join("\n"),
	});
	write(vault, {
		"model.json": JSON.stringify({
			schemaVersion: 1,
			id: "Shop",
			name: "Shop",
			current: { id: "Built", name: "Built" },
		}),
		".archboard/config.yaml": Bun.YAML.stringify(DEFAULT_SEMANTIC_POLICY),
	});
	module("App", 10, "src/app");
	module("Kit", 20, "src/primitives");
	module("Ui", 30, "src/ui");
	module("Style", 40, "src/style");
	module("Contract", 50, "src/contract");
	git("add", "-A");
	git("commit", "-q", "--no-gpg-sign", "-m", "the code");
	register(scratch, { [SHOP]: shop });
	codeCheck = (await import("#runtime/api/code-check-run.ts")).createCodeCheck();
});

afterAll(() => {
	for (const [key, value] of Object.entries(caller)) {
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
	rmSync(scratch, { recursive: true, force: true });
});

/**
 * Run the code check over the vault.
 * @returns The answer.
 */
async function check(): Promise<CodeCheckAnswer> {
	const answer = await codeCheck.run({
		vault,
		variant: undefined,
		everyDraft: false,
		plans: [],
		signal: new AbortController().signal,
	});
	if (!("states" in answer)) throw new Error(answer.error);
	return answer;
}

/**
 * A module's exported functions and values.
 * @param answer The answer.
 * @param name The module.
 * @returns Both counts.
 */
function counts(answer: CodeCheckAnswer, name: string) {
	const depth = answer.depth?.find((each) => each.subject.name === name);
	return { functions: depth?.exports.functions, values: depth?.exports.values };
}

/**
 * The exports that carry `EXPOSED_VALUE`, with their modules and severities.
 * @param answer The answer.
 * @returns Each.
 */
function exposedValues(answer: CodeCheckAnswer) {
	return answer.findings
		.filter((each) => each.code === "EXPOSED_VALUE")
		.map((each) => [each.subject?.name, each.export, each.severity]);
}

/**
 * The modules `MODULE_SHALLOW` names.
 * @param answer The answer.
 * @returns Their names.
 */
function shallow(answer: CodeCheckAnswer) {
	return answer.findings
		.filter((each) => each.code === "MODULE_SHALLOW")
		.map((each) => each.subject?.name);
}

test("a compound component made by Object.assign onto a function counts as a function without a language server, and a value a call makes is information there", async () => {
	write(shop, {
		".archboard/language-servers.json": JSON.stringify({
			typescript: { command: "archboard-no-such-typescript-server" },
		}),
	});
	try {
		const answer = await check();
		expect(counts(answer, "Ui")).toEqual({ functions: 3, values: 0 });
		expect(counts(answer, "Contract")).toEqual({ functions: 0, values: 2 });
		// Without a server, no checker tells whether what a call makes can be called.
		// Object.freeze returns its argument, so the literal says what LIMITS is.
		expect(exposedValues(answer)).toEqual([
			["Style", "buttonClass", "information"],
			["Contract", "UserSchema", "information"],
			["Contract", "LIMITS", "warning"],
		]);
		// Nor does a module shallow on such a value alone.
		expect(shallow(answer)).toEqual([]);
	} finally {
		rmSync(join(shop, ".archboard", "language-servers.json"));
	}
});

test.skipIf(!native)(
	"an export the language server types as callable counts as a function",
	async () => {
		const answer = await check();
		expect(counts(answer, "Style")).toEqual({ functions: 1, values: 0 });
		expect(counts(answer, "Ui")).toEqual({ functions: 3, values: 0 });
		expect(exposedValues(answer)).toEqual([
			["Contract", "UserSchema", "warning"],
			["Contract", "LIMITS", "warning"],
		]);
		expect(shallow(answer)).toEqual(["Contract"]);
	},
);
