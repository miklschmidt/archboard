import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { createCliHttpDouble, type RecordedRequest } from "./support/cli-http-double.ts";
import { createPackageCliOwner, packageFailure } from "./support/package-cli.ts";

const jsonObjectSchema = z.record(z.string(), z.unknown());
const parseObject = (stdout: string) => jsonObjectSchema.parse(JSON.parse(stdout));
const bodyOf = (request: RecordedRequest | undefined) =>
	jsonObjectSchema.parse(request?.body ?? {});
const element = { id: "shape1", type: "rectangle", x: 0, y: 0, width: 100, height: 80 };

describe("package board commands", () => {
	test("accepts protected board, pane, and injection responses", async () => {
		const owner = createPackageCliOwner();
		const http = createCliHttpDouble();
		try {
			for (const [argv, fields] of [
				[["board", "info", "--board", "contract"], { version: 7, placeholder: false }],
				[["board", "new", "contract-new"], { created: true, saved: false, version: null }],
				[["board", "open", "contract"], { source: "vault" }],
				[["inject", "status"], { enabled: true, armed: true }],
				[["inject", "test", "--note", "fixture"], { channel: "quiet", threadId: "thread-fixture" }],
			] as const) {
				const result = await owner.run(argv, { url: http.url });
				expect(result.status, packageFailure(result)).toBe(0);
				if (argv[0] === "inject" || argv[1] === "info") expect(result.stderr).toBe("");
				expect(parseObject(result.stdout)).toMatchObject(fields);
			}
			const pane = await owner.run(["pane", "open", "--board", "contract"], { url: http.url });
			expect(parseObject(pane.stdout)).toMatchObject({
				board: { source: "vault", version: 7, placeholder: false },
			});
		} finally {
			http.dispose();
			await owner.dispose();
		}
	});

	test("routes global board, doing, and document through one write", async () => {
		const owner = createPackageCliOwner();
		const http = createCliHttpDouble();
		try {
			for (const write of [
				{ name: "add", argv: ["add", "--one", JSON.stringify(element)] },
				{ name: "update", argv: ["update", element.id, "--set", '{"x":10}'] },
				{ name: "delete", argv: ["delete", element.id] },
			]) {
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
					expect(result, packageFailure(result)).toMatchObject({ status: 0, stderr: "" });
					const writes = http.writesSince(before);
					expect(writes).toHaveLength(1);
					expect(writes[0]?.url.searchParams.get("board")).toBe("contract");
					expect(writes[0]?.url.searchParams.get("doing")).toBe(doing);
					const answer = parseObject(result.stdout);
					expect("document" in answer).toBe(document);
				}
			}
		} finally {
			http.dispose();
			await owner.dispose();
		}
	});

	test("renders findings in public artifact order", async () => {
		const owner = createPackageCliOwner();
		const http = createCliHttpDouble();
		try {
			const output = join(owner.outside, "findings");
			mkdirSync(output);
			const before = http.requests.length;
			const result = await owner.run(
				[
					"render-findings",
					"--board",
					"contract",
					"--out",
					output,
					"--font-family",
					"5",
					"--dimension-tolerance",
					"0.75",
					"--intersection-tolerance",
					"0.25",
					"--overlap-tolerance",
					"1.5",
				],
				{ url: http.url },
			);
			expect(result, packageFailure(result)).toMatchObject({ status: 0, stderr: "" });
			const manifest = parseObject(result.stdout);
			const entries = z.array(z.object({ file: z.string() })).parse(manifest.entries);
			expect(existsSync(join(output, entries[0]!.file))).toBe(true);
			expect(readFileSync(join(output, "manifest.json"), "utf8")).toBe(result.stdout);
			const post = http.requests
				.slice(before)
				.find((request) => request.url.pathname === "/api/export/findings");
			expect(bodyOf(post)).toEqual({
				policy: {
					allowedFontFamilies: [5],
					dimensionTolerance: 0.75,
					intersectionTolerance: 0.25,
					overlapTolerance: 1.5,
				},
			});
		} finally {
			http.dispose();
			await owner.dispose();
		}
	});

	test("creates and removes a bridge with one ordered receipt", async () => {
		const owner = createPackageCliOwner();
		const http = createCliHttpDouble();
		try {
			const before = http.requests.length;
			const created = await owner.run(
				[
					"bridge",
					"--over",
					"over",
					"--under",
					"under",
					"--background",
					"#FFFFFF",
					"--at",
					"50,50",
					"--board",
					"contract",
					"--doing",
					"marking crossing",
				],
				{ url: http.url },
			);
			expect(created, packageFailure(created)).toMatchObject({ status: 0, stderr: "" });
			const parts = z
				.array(
					z.object({
						customData: z.object({
							archboard: z.object({ bridge: z.object({ role: z.string() }) }),
						}),
					}),
				)
				.parse(parseObject(created.stdout).elements);
			expect(parts.map((part) => part.customData.archboard.bridge.role)).toEqual([
				"mask",
				"redraw",
			]);
			expect(http.writesSince(before)).toHaveLength(1);
			const removed = await owner.run(
				["bridge", "remove", "Bridge01", "--board", "contract", "--doing", "removing crossing"],
				{ url: http.url },
			);
			expect(parseObject(removed.stdout).deleted).toEqual(["Bridge01", "Redraw01"]);
		} finally {
			http.dispose();
			await owner.dispose();
		}
	});

	test("preserves last-wins flags, stdin precedence, jq output, and viewport coercion", async () => {
		const owner = createPackageCliOwner();
		const http = createCliHttpDouble();
		try {
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
			expect(query, packageFailure(query)).toMatchObject({ status: 0, stderr: "" });
			expect(Array.isArray(JSON.parse(query.stdout))).toBe(true);
			expect(
				http.requests
					.slice(queryBefore)
					.find((request) => request.url.pathname === "/api/elements/search")
					?.url.searchParams.get("type"),
			).toBe("rectangle");
			const stdinBefore = http.requests.length;
			const stdin = await owner.run(
				["update", "shape1", "-", "ignored", "--board", "contract", "--doing", "stdin"],
				{ url: http.url, input: '{"x":44}' },
			);
			expect(stdin.status).toBe(0);
			expect(bodyOf(http.writesSince(stdinBefore)[0]).x).toBe(44);
			const repeatedBefore = http.requests.length;
			await owner.run(
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
			const repeated = http.writesSince(repeatedBefore)[0];
			expect(bodyOf(repeated).x).toBe(2);
			expect(repeated?.url.searchParams.get("document")).toBe("1");
			const viewportBefore = http.requests.length;
			const viewport = await owner.run(["viewport", "ignored", "--zoom=1.5", "--offset-x", "2"], {
				url: http.url,
			});
			expect(viewport.status).toBe(0);
			const viewportRequest = http.requests
				.slice(viewportBefore)
				.find((request) => request.url.pathname === "/api/viewport");
			expect(bodyOf(viewportRequest)).toMatchObject({ zoom: 1.5, offsetX: 2 });
			const jq = Bun.spawnSync(["jq", "-r", ".id"], {
				stdin: new TextEncoder().encode(JSON.stringify(element)),
			});
			expect(jq.exitCode).toBe(0);
			expect(new TextDecoder().decode(jq.stdout)).toBe("shape1\n");
		} finally {
			http.dispose();
			await owner.dispose();
		}
	}, 30_000);
});
