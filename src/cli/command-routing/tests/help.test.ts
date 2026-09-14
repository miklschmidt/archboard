// Help is answered from the command table, at every depth, in every spelling,
// before anything else happens.
//
// What is checked is the integration, not the words: that every registered
// route answers `help <path>`, `<path> --help` and `-h` anywhere with the same
// help on stdout and exit 0; that the help is conventionally shaped, with a
// usage line naming the route, a listing of the route's immediate children,
// and an options section that carries every option the contract declares and
// every shared option it reads; and that nothing beyond printing happens — no
// handler runs and no global flag takes effect. Expectations are derived from
// the live registry and the Commander model built from it, so adding, renaming
// or redescribing a command changes nothing here.

import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import type { Command } from "commander";
import { cliContractRegistry, runCli } from "@/cli/commands/run";
import { commanderTree, type CommandRoute } from "@/cli/command-routing/index";
import { applyCliBootstrap, isHelpInvocation } from "@/cli/command-contract/bootstrap";
import { SHARED_OPTION_KEYS, sharedOptionsFor } from "@/cli/command-contract/shared-options";
import { currentRequestedBoard, currentWriteDoing } from "@/runtime/engine/canvas-client";

const registry = cliContractRegistry();
const routes = Object.fromEntries(
	registry.filter((entry) => entry.parent === null).map((entry) => [entry.name, entry]),
);

let stdout: ReturnType<typeof spyOn>;
let stderr: ReturnType<typeof spyOn>;
let exitCode: typeof process.exitCode;
const handlers = registry.map((entry) => spyOn(entry.contract, "handler"));

beforeEach(() => {
	exitCode = process.exitCode;
	process.exitCode = 0;
	stdout = spyOn(process.stdout, "write").mockImplementation(() => true);
	stderr = spyOn(process.stderr, "write").mockImplementation(() => true);
	for (const handler of handlers) handler.mockClear();
});
afterEach(() => {
	stdout.mockRestore();
	stderr.mockRestore();
	process.exitCode = exitCode;
});

/**
 * Everything one invocation printed to stdout.
 * @returns The text.
 */
function printed(): string {
	return stdout.mock.calls.map((call: unknown[]) => String(call[0])).join("");
}

/**
 * Every way of asking for one route's help: the `help` command, and each
 * help flag at every position among arguments that are otherwise wrong.
 * @param path - The route's words.
 * @returns The invocations.
 */
function spellingsOf(path: readonly string[]): string[][] {
	const wrong = [...path, "--unknown-option", "stray"];
	const spellings: string[][] = [["help", ...path]];
	for (const flag of ["--help", "-h"]) {
		for (let index = 0; index <= wrong.length; index++) {
			spellings.push([...wrong.slice(0, index), flag, ...wrong.slice(index)]);
		}
	}
	return spellings;
}

/**
 * The Commander command the tree holds for one route.
 * @param path - The route's words.
 * @returns The command.
 */
function modelled(path: readonly string[]): Command {
	let at = commanderTree(
		Object.fromEntries(Object.entries(routes).map(([name, entry]) => [name, routeOf(entry.name)])),
		"0.0.0",
	).root;
	for (const word of path) {
		at = at.commands.find((child) => child.name() === word)!;
	}
	return at;
}

/**
 * One route of the table as the registry reports it, children included.
 * @param name - The route's space-joined name.
 * @returns The route.
 */
function routeOf(name: string): CommandRoute {
	const entry = registry.find((one) => one.name === name)!;
	const children = registry.filter((one) => one.parent === name);
	return {
		owner: { contract: entry.contract, handlerOwner: entry.handlerOwner },
		...(children.length === 0
			? {}
			: {
					children: Object.fromEntries(
						children.map((child) => [child.name.split(" ").at(-1)!, routeOf(child.name)]),
					),
				}),
		...(entry.bare ? { bare: entry.bare } : {}),
	};
}

test("every route answers every help spelling on stdout, exit 0, and runs nothing", async () => {
	for (const entry of registry) {
		const path = entry.contract.path;
		for (const argv of spellingsOf(path)) {
			stdout.mockClear();
			process.exitCode = 0;
			await runCli([...argv, "--board", "somewhere", "--doing", "nothing"]);
			expect(process.exitCode, argv.join(" ")).toBe(0);
			expect(stderr).not.toHaveBeenCalled();
			const text = printed();
			expect(text.length, argv.join(" ")).toBeGreaterThan(0);
			const [usage] = text.split("\n");
			expect(usage, argv.join(" ")).toContain(path.join(" "));
		}
		for (const handler of handlers) expect(handler).not.toHaveBeenCalled();
		expect(currentRequestedBoard()).toBeNull();
		expect(currentWriteDoing()).toBeNull();
	}
});

test("help is shaped by the contract: usage names the route, sections carry what it declares", async () => {
	for (const entry of registry) {
		const path = entry.contract.path;
		stdout.mockClear();
		await runCli(["help", ...path]);
		const text = printed();
		const [usage] = text.split("\n");
		expect(usage, entry.name).toMatch(/^Usage: archboard /u);
		expect(usage, entry.name).toContain(path.join(" "));

		const model = modelled(path);
		const children = model.commands.filter((child) => child.name() !== "help");
		if (children.length > 0) {
			expect(text, entry.name).toContain("\nCommands:");
			for (const child of children) {
				expect(text, `${entry.name} lists ${child.name()}`).toContain(child.name());
			}
		} else {
			expect(text, entry.name).not.toContain("\nCommands:");
		}

		const visible = entry.contract.parameters.filter((parameter) => parameter.hidden !== true);
		const options = [
			...visible.filter((parameter) => parameter.kind === "option"),
			...sharedOptionsFor(entry.contract.shared),
		];
		const optionsSection = text.split("\nOptions:")[1] ?? "";
		for (const option of options) {
			expect(optionsSection, `${entry.name} shows ${option.spellings[0]}`).toContain(
				option.spellings[0],
			);
		}
		for (const parameter of visible) {
			if (parameter.kind === "positional") {
				expect(text, `${entry.name} shows ${parameter.name}`).toContain(
					parameter.placeholder ?? parameter.name,
				);
			}
		}
		for (const parameter of entry.contract.parameters) {
			if (parameter.kind === "positional" && parameter.hidden === true) {
				expect(text, `${entry.name} hides ${parameter.key}`).not.toContain(
					`[${parameter.name}...]`,
				);
			}
		}
	}
});

test("the root help lists every top-level command and the shared options", async () => {
	await runCli([]);
	const text = printed();
	expect(text).toMatch(/^Usage: archboard /u);
	for (const name of Object.keys(routes)) {
		expect(text).toContain(name);
	}
	for (const option of sharedOptionsFor(SHARED_OPTION_KEYS)) {
		expect(text).toContain(option.spellings[0]);
	}
	expect(process.exitCode).toBe(0);
});

test("help routing skips shared option values without mistaking them for commands", async () => {
	for (const [argv, path] of [
		[
			["semantic", "--doing", "describing", "new", "--help"],
			["semantic", "new"],
		],
		[["semantic", "--board", "render", "--help"], ["semantic"]],
	] as const) {
		stdout.mockClear();
		await runCli([...argv]);
		const model = modelled(path);
		expect(printed().split("\n")[0]).toBe(`Usage: ${model.createHelp().commandUsage(model)}`);
	}
});

test("a missing --url value cannot consume the help flag during bootstrap", async () => {
	for (const flag of ["--help", "-h"]) {
		stdout.mockClear();
		const argv = ["semantic", "--url", flag];
		const environment: Record<string, string | undefined> = {};
		const bootstrap = applyCliBootstrap(argv, environment);
		expect(bootstrap.help).toBe(true);
		expect(environment["EXPRESS_SERVER_URL"]).toBeUndefined();
		await runCli(argv, bootstrap);
		expect(printed().split("\n")[0]).toContain("semantic");
	}
	for (const argv of [
		["semantic", "show", "help"],
		["status", "--url", "help"],
	]) {
		expect(isHelpInvocation(argv), argv.join(" ")).toBe(false);
	}
});

test("a namespace menu includes options accepted by its bare default", async () => {
	for (const entry of registry) {
		if (entry.bare?.kind !== "default" || !entry.bare.withLeadingOptions) continue;
		stdout.mockClear();
		await runCli(["help", ...entry.contract.path]);
		const childName = `${entry.name} ${entry.bare.child}`;
		const child = registry.find((candidate) => candidate.name === childName)!;
		const optionsSection = printed().split("\nOptions:")[1] ?? "";
		for (const option of child.contract.parameters) {
			if (option.kind !== "option" || option.hidden === true) continue;
			expect(optionsSection, `${entry.name} shows ${option.spellings[0]}`).toContain(
				option.spellings[0],
			);
		}
	}
});

test("a shared option the command does not read is refused before anything runs", async () => {
	for (const entry of registry) {
		const unread = sharedOptionsFor(
			(["url", "board", "doing", "expect-version", "as-session"] as const).filter(
				(key) => !entry.contract.shared.includes(key),
			),
		);
		for (const option of unread) {
			stdout.mockClear();
			stderr.mockClear();
			process.exitCode = 0;
			const argv = [...entry.contract.path, option.spellings[0], "value"];
			await runCli(
				argv,
				option.key === "url" ? { url: "http://127.0.0.1:1", help: false } : undefined,
			);
			expect(process.exitCode, argv.join(" ")).toBe(2);
			expect(stdout, argv.join(" ")).not.toHaveBeenCalled();
			expect(
				stderr.mock.calls.map((call: unknown[]) => String(call[0])).join(""),
				argv.join(" "),
			).toContain(option.spellings[0]);
		}
	}
	for (const handler of handlers) expect(handler).not.toHaveBeenCalled();
});

test("a shared option excluded by a selected local mode is refused", async () => {
	for (const entry of registry) {
		for (const parameter of entry.contract.parameters) {
			if (parameter.kind !== "option" || parameter.excludesShared === undefined) {
				continue;
			}
			for (const key of parameter.excludesShared) {
				stdout.mockClear();
				stderr.mockClear();
				process.exitCode = 0;
				const local = [parameter.spellings[0]!, ...(parameter.value === "none" ? [] : ["value"])];
				const shared = sharedOptionsFor([key])[0]!;
				const argv = [
					...entry.contract.path,
					...local,
					...(key === "url" ? [] : [shared.spellings[0]!, "value"]),
				];
				await runCli(argv, {
					url: key === "url" ? "http://127.0.0.1:1" : null,
					help: false,
				});
				expect(process.exitCode, argv.join(" ")).toBe(2);
				expect(stdout, argv.join(" ")).not.toHaveBeenCalled();
				expect(
					stderr.mock.calls.map((call: unknown[]) => String(call[0])).join(""),
					argv.join(" "),
				).toContain(shared.spellings[0]);
			}
		}
	}
	for (const handler of handlers) expect(handler).not.toHaveBeenCalled();
});
