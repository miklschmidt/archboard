import { describe, expect, test } from "bun:test";
import { z } from "zod";
import {
	BoardInfoResultSchema,
	BoardNewResultSchema,
	BoardOpenResultSchema,
} from "../../../src/cli/commands/board.ts";
import {
	InjectStatusResultSchema,
	InjectTestResultSchema,
} from "../../../src/cli/commands/inject.ts";
import { PaneOpenResultSchema } from "../../../src/cli/commands/pane.ts";
import { QueryResultSchema } from "../../../src/cli/command-contract/query.ts";
import { UpdateResultSchema } from "../../../src/cli/command-contract/update.ts";
import { AddResultSchema, DeleteResultSchema } from "../../../src/cli/commands/elements.ts";
import { createCliHttpDouble, type RecordedRequest } from "./support/cli-http-double.ts";
import {
	createPackageCliOwner,
	packageFailure,
	type PackageRunResult,
} from "./support/package-cli.ts";

function decodePackage<T>(result: PackageRunResult, schema: z.ZodType<T>): T {
	const diagnostic = packageFailure(result);
	let decoded: unknown;
	try {
		decoded = JSON.parse(result.stdout);
	} catch (error) {
		throw new Error(`${diagnostic}\nJSON decode: ${(error as Error).message}`, { cause: error });
	}
	const parsed = schema.safeParse(decoded);
	if (!parsed.success)
		throw new Error(`${diagnostic}\nschema: ${parsed.error.message}`, { cause: parsed.error });
	return parsed.data;
}

const jsonObjectSchema = z.record(z.string(), z.unknown());
const bodyOf = (request: RecordedRequest | undefined) =>
	jsonObjectSchema.parse(request?.body ?? {});
const element = { id: "shape1", type: "rectangle", x: 0, y: 0, width: 100, height: 80 };

interface JqResult {
	command: readonly string[];
	cwd: string;
	status: number;
	signal: string | null;
	stdout: string;
	stderr: string;
}
const jqFailure = (result: JqResult) =>
	[
		`command: ${result.command.join(" ")}`,
		`cwd: ${result.cwd}`,
		`status: ${result.status}`,
		`signal: ${result.signal ?? "null"}`,
		`stdout:\n${result.stdout}`,
		`stderr:\n${result.stderr}`,
	].join("\n");
const runJq = (input: string, filter: string, cwd: string): JqResult => {
	const command = ["jq", "-r", filter];
	const result = Bun.spawnSync(command, { cwd, stdin: new TextEncoder().encode(input) });
	return {
		command,
		cwd,
		status: result.exitCode,
		signal: result.signalCode ?? null,
		stdout: new TextDecoder().decode(result.stdout),
		stderr: new TextDecoder().decode(result.stderr),
	};
};
async function closedUrl(): Promise<string> {
	const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response() });
	const url = server.url.origin;
	await server.stop(true);
	return url;
}

describe("package board commands", () => {
	test("accepts public board, pane, and injection schemas without invented fields", async () => {
		await using resources = new AsyncDisposableStack();
		const http = resources.use(createCliHttpDouble());
		const owner = resources.use(createPackageCliOwner());
		const info = await owner.run(["board", "info", "--board", "contract"], { url: http.url });
		let diagnostic = packageFailure(info);
		expect(info.status, diagnostic).toBe(0);
		expect(info.stderr, diagnostic).toBe("");
		const infoBody = decodePackage(info, BoardInfoResultSchema);
		expect(infoBody, diagnostic).toMatchObject({
			board: "contract",
			identity: { board: "contract", variant: "current", level: "system", displayName: "Contract" },
			elementCount: 1,
			version: 7,
			placeholder: false,
		});
		expect("vaultBacked" in infoBody, diagnostic).toBeFalse();

		const created = await owner.run(["board", "new", "contract-new"], { url: http.url });
		diagnostic = packageFailure(created);
		expect(created.status, diagnostic).toBe(0);
		const createdBody = decodePackage(created, BoardNewResultSchema);
		expect(createdBody, diagnostic).toMatchObject({
			created: true,
			saved: false,
			version: null,
			elementCount: 0,
			pane: null,
		});
		expect("vaultBacked" in createdBody, diagnostic).toBeFalse();

		const opened = await owner.run(["board", "open", "contract"], { url: http.url });
		diagnostic = packageFailure(opened);
		expect(opened.status, diagnostic).toBe(0);
		const openedBody = decodePackage(opened, BoardOpenResultSchema);
		expect(openedBody, diagnostic).toMatchObject({
			source: "vault",
			version: 7,
			placeholder: false,
		});
		expect("vaultBacked" in openedBody, diagnostic).toBeFalse();

		const pane = await owner.run(["pane", "open", "--board", "contract"], { url: http.url });
		diagnostic = packageFailure(pane);
		expect(pane.status, diagnostic).toBe(0);
		expect(decodePackage(pane, PaneOpenResultSchema), diagnostic).toMatchObject({
			pane: { paneId: "pane-right", clientId: "client-right", place: "right", position: 2 },
			paneCount: 2,
			board: { source: "vault", version: 7, placeholder: false },
		});

		const status = await owner.run(["inject", "status"], { url: http.url });
		diagnostic = packageFailure(status);
		expect(status.status, diagnostic).toBe(0);
		expect(status.stderr, diagnostic).toBe("");
		expect(decodePackage(status, InjectStatusResultSchema), diagnostic).toMatchObject({
			enabled: true,
			armed: true,
			connected: true,
			target: { threadId: "thread-fixture", reason: "pinned" },
			injected: { quiet: 2, loud: 1, failed: 0 },
		});

		const injected = await owner.run(["inject", "test", "--note", "fixture"], { url: http.url });
		diagnostic = packageFailure(injected);
		expect(injected.status, diagnostic).toBe(0);
		expect(injected.stderr, diagnostic).toBe("");
		expect(decodePackage(injected, InjectTestResultSchema), diagnostic).toEqual({
			channel: "quiet",
			threadId: "thread-fixture",
			text: "fixture injection text",
		});
	});

	test("routes global board, doing, and document through one write", async () => {
		await using resources = new AsyncDisposableStack();
		const http = resources.use(createCliHttpDouble());
		const owner = resources.use(createPackageCliOwner());
		for (const write of [
			{ name: "add", argv: ["add", "--one", JSON.stringify(element)] },
			{ name: "update", argv: ["update", element.id, "--set", '{"x":10}'] },
			{ name: "delete", argv: ["delete", element.id] },
		])
			for (const document of [false, true]) {
				const before = http.requests.length;
				const doing = `${write.name} contract element`;
				const result = await owner.run(
					[
						...write.argv,
						...(document ? ["--document"] : []),
						"--board",
						"contract",
						"--doing",
						doing,
					],
					{ url: http.url },
				);
				const diagnostic = packageFailure(result);
				expect(result.status, diagnostic).toBe(0);
				expect(result.stderr, diagnostic).toBe("");
				const writes = http.writesSince(before);
				expect(writes, diagnostic).toHaveLength(1);
				expect(writes[0]?.url.searchParams.get("board"), diagnostic).toBe("contract");
				expect(writes[0]?.url.searchParams.get("doing"), diagnostic).toBe(doing);
				const transportedDocument =
					writes[0]?.url.searchParams.get("document") === "1" ||
					bodyOf(writes[0]).document === true;
				expect(transportedDocument, diagnostic).toBe(document);
				const answer =
					write.name === "add"
						? decodePackage(result, AddResultSchema)
						: write.name === "update"
							? decodePackage(result, UpdateResultSchema)
							: decodePackage(result, DeleteResultSchema);
				expect("document" in answer, diagnostic).toBe(document);
			}
	});

	test("rejects malformed board-save receipts and preserves server-first staging", async () => {
		await using resources = new AsyncDisposableStack();
		const http = resources.use(createCliHttpDouble());
		const owner = resources.use(createPackageCliOwner());
		const malformed = await owner.run(
			["board", "save", "--board", "invalid-held", "--doing", "checking validation"],
			{ url: http.url },
		);
		let diagnostic = packageFailure(malformed);
		expect(malformed.status, diagnostic).toBe(1);
		expect(malformed.stdout, diagnostic).toBe("");
		expect(malformed.stderr.includes("Refusing fixed-base board save"), diagnostic).toBeFalse();
		expect(malformed.stderr.includes("has stopped saving"), diagnostic).toBeFalse();
		const falseSuccess = await owner.run(
			["board", "save", "--board", "false-success", "--doing", "checking discrimination"],
			{ url: http.url },
		);
		diagnostic = packageFailure(falseSuccess);
		expect(falseSuccess.status, diagnostic).toBe(1);
		expect(falseSuccess.stdout, diagnostic).toBe("");
		const unavailable = await owner.run(["board", "save", "--unknown", "--board", "contract"], {
			url: await closedUrl(),
		});
		diagnostic = packageFailure(unavailable);
		expect(unavailable.status, diagnostic).toBe(3);
		const before = http.contacts.length;
		const staged = await owner.run(["board", "save", "--unknown", "--board", "contract"], {
			url: http.url,
		});
		diagnostic = packageFailure(staged);
		expect(staged.status, diagnostic).toBe(2);
		expect(staged.stdout, diagnostic).toBe("");
		expect(http.contacts.slice(before), diagnostic).toEqual(["GET /health"]);
	});

	test("keeps shipped stdout consumable by jq for success and structured exit 3", async () => {
		await using resources = new AsyncDisposableStack();
		const http = resources.use(createCliHttpDouble());
		const owner = resources.use(createPackageCliOwner());
		const success = await owner.run(["get", "shape1", "--board", "contract"], { url: http.url });
		let diagnostic = packageFailure(success);
		expect(success.status, diagnostic).toBe(0);
		expect(success.stderr, diagnostic).toBe("");
		const jqSuccess = runJq(success.stdout, ".id", owner.outside);
		expect(jqSuccess.status, jqFailure(jqSuccess)).toBe(0);
		expect(jqSuccess.signal, jqFailure(jqSuccess)).toBeNull();
		expect(jqSuccess.stdout, jqFailure(jqSuccess)).toBe("shape1\n");
		expect(jqSuccess.stderr, jqFailure(jqSuccess)).toBe("");
		const nonzero = await owner.run(["status"], { url: await closedUrl() });
		diagnostic = packageFailure(nonzero);
		expect(nonzero.status, diagnostic).toBe(3);
		expect(nonzero.stderr, diagnostic).toBe("");
		const jqNonzero = runJq(nonzero.stdout, ".running", owner.outside);
		expect(jqNonzero.status, jqFailure(jqNonzero)).toBe(0);
		expect(jqNonzero.signal, jqFailure(jqNonzero)).toBeNull();
		expect(jqNonzero.stdout, jqFailure(jqNonzero)).toBe("false\n");
		expect(jqNonzero.stderr, jqFailure(jqNonzero)).toBe("");
	});

	test("preserves parsing and staged query and viewport precedence", async () => {
		await using resources = new AsyncDisposableStack();
		const http = resources.use(createCliHttpDouble());
		const owner = resources.use(createPackageCliOwner());
		const queryBefore = http.requests.length;
		const query = await owner.run([
			"--url",
			http.url,
			"query",
			"ignored",
			"--type=ellipse",
			"--type",
			"rectangle",
			"--filter",
			"locked=true",
			"--filter",
			"id=shape1",
			"--board=contract",
		]);
		let diagnostic = packageFailure(query);
		expect(query.status, diagnostic).toBe(0);
		expect(query.stderr, diagnostic).toBe("");
		expect(Array.isArray(decodePackage(query, QueryResultSchema)), diagnostic).toBeTrue();
		expect(
			http.requests
				.slice(queryBefore)
				.find((r) => r.url.pathname === "/api/elements/search")
				?.url.searchParams.get("type"),
			diagnostic,
		).toBe("rectangle");
		const stdinBefore = http.requests.length;
		const stdin = await owner.run(
			["update", "shape1", "-", "ignored", "--board", "contract", "--doing", "stdin"],
			{ url: http.url, input: '{"x":44}' },
		);
		diagnostic = packageFailure(stdin);
		expect(stdin.status, diagnostic).toBe(0);
		expect(bodyOf(http.writesSince(stdinBefore)[0]).x, diagnostic).toBe(44);
		const repeatedBefore = http.requests.length;
		const repeatedResult = await owner.run(
			[
				"update",
				"shape1",
				"--set",
				'{"x":1}',
				'--set={"x":2}',
				"--document",
				"--document",
				"--board",
				"contract",
				"--doing",
				"repeat",
			],
			{ url: http.url },
		);
		diagnostic = packageFailure(repeatedResult);
		expect(repeatedResult.status, diagnostic).toBe(0);
		const repeated = http.writesSince(repeatedBefore)[0];
		expect(bodyOf(repeated).x, diagnostic).toBe(2);
		expect(repeated?.url.searchParams.get("document"), diagnostic).toBe("1");
		const optionValue = await owner.run(["update", "shape1", "--set", "--document"]);
		diagnostic = packageFailure(optionValue);
		expect(optionValue.status, diagnostic).toBe(2);
		expect(optionValue.stdout, diagnostic).toBe("");
		expect(optionValue.stderr, diagnostic).toMatch(/Invalid JSON in --set/);
		const serverFirst = await owner.run(["query", "--bbox", "not-a-box"], {
			url: await closedUrl(),
		});
		diagnostic = packageFailure(serverFirst);
		expect(serverFirst.status, diagnostic).toBe(3);
		const filterBefore = http.requests.length;
		const filter = await owner.run(["query", "--filter", "missing-equals", "--board", "contract"], {
			url: http.url,
		});
		diagnostic = packageFailure(filter);
		expect(filter.status, diagnostic).toBe(2);
		expect(filter.stdout, diagnostic).toBe("");
		expect(
			http.requests.slice(filterBefore).map((r) => r.url.pathname),
			diagnostic,
		).toContain("/api/elements");
		let before = http.requests.length;
		const viewport = await owner.run(["viewport", "ignored", "--zoom=1.5", "--offset-x", "2"], {
			url: http.url,
		});
		diagnostic = packageFailure(viewport);
		expect(viewport.status, diagnostic).toBe(0);
		expect(
			bodyOf(http.requests.slice(before).find((r) => r.url.pathname === "/api/viewport")),
			diagnostic,
		).toMatchObject({ zoom: 1.5, offsetX: 2 });
		before = http.requests.length;
		const ids = await owner.run(["viewport", "--ids", "shape1, shape2,,"], { url: http.url });
		diagnostic = packageFailure(ids);
		expect(ids.status, diagnostic).toBe(0);
		expect(
			bodyOf(http.requests.slice(before).find((r) => r.url.pathname === "/api/viewport"))
				.scrollToElementIds,
			diagnostic,
		).toEqual(["shape1", "shape2"]);
		const numericServer = await owner.run(["viewport", "--zoom", "not-a-number"], {
			url: await closedUrl(),
		});
		diagnostic = packageFailure(numericServer);
		expect(numericServer.status, diagnostic).toBe(3);
		http.setBrowserClients(0);
		const numericBrowser = await owner.run(["viewport", "--zoom", "not-a-number"], {
			url: http.url,
		});
		http.setBrowserClients(1);
		diagnostic = packageFailure(numericBrowser);
		expect(numericBrowser.status, diagnostic).toBe(4);
		before = http.contacts.length;
		const crossField = await owner.run(["viewport", "--fit", "--element", "shape1"], {
			url: http.url,
		});
		diagnostic = packageFailure(crossField);
		expect(crossField.status, diagnostic).toBe(2);
		expect(crossField.stdout, diagnostic).toBe("");
		expect(http.contacts.slice(before), diagnostic).toEqual([]);
	}, 30_000);
});
