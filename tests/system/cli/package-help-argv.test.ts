import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { cliContractRegistry, cliSurface, commandHelp } from "../../../src/cli/commands/run.ts";
import { createCliHttpDouble } from "./support/cli-http-double.ts";
import {
	checkoutRoot,
	createPackageCliOwner,
	packageBin,
	packageFailure,
	packageRecord,
} from "./support/package-cli.ts";

const streamGoldenSchema = z.object({
	name: z.string(),
	argv: z.array(z.string()),
	server: z.enum(["mock", "closed", "no-browser"]).nullish(),
	status: z.number(),
	stdout: z.string().optional(),
	stdoutSha256: z.string().optional(),
	stderr: z.string().optional(),
	stderrSha256: z.string().optional(),
});
const argvGoldenSchema = z.object({
	cases: z.array(streamGoldenSchema),
});

const argvPath = join(checkoutRoot, "tests/system/cli/fixtures/argv-golden.json");
const argvGolden = argvGoldenSchema.parse(JSON.parse(readFileSync(argvPath, "utf8")));
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");

describe("package bin and help", () => {
	test("resolves bin.archboard and shows no-argument help outside the checkout", async () => {
		await using resources = new AsyncDisposableStack();
		const owner = resources.use(createPackageCliOwner());
		expect(packageRecord.bin.archboard).toBe("bin/canvas");
		expect(existsSync(packageBin)).toBe(true);
		expect(owner.outside).not.toBe(checkoutRoot);
		expect(existsSync(join(owner.outside, ".git"))).toBe(false);
		const result = await owner.run([]);
		const diagnostic = packageFailure(result);
		expect(result.status, diagnostic).toBe(0);
		expect(result.stderr, diagnostic).toBe("");
		expect(result.stdout, diagnostic).toMatch(/^archboard .*\n\nUsage:/m);
		expect(result.stdout, diagnostic).not.toMatch(/model context protocol|json-rpc|stdio server/i);
		expect(result.stdout.match(/^  check\s/gm), diagnostic).toHaveLength(1);
		expect(result.stdout.match(/^  bridge\s/gm), diagnostic).toHaveLength(1);
		expect(result.stdout.match(/^  render-findings\s/gm), diagnostic).toHaveLength(1);
		expect(result.stdout, diagnostic).not.toMatch(/^  inject\s/m);
		expect(result.stdout, diagnostic).toContain(
			"               check only: 6 warnings, 7 errors, 8 indeterminate coverage.",
		);
		expect(result.stdout, diagnostic).toMatch(/named-board[\s\S]*need no browser connection/i);
		expect(result.stdout, diagnostic).toMatch(
			/only `browser \.\.\.` commands inspect or control a live pane/i,
		);
	});

	test("every declared command and subcommand has contract-owned help", async () => {
		const registry = new Map(cliContractRegistry().map((entry) => [entry.name, entry.contract]));
		for (const { name, subcommands } of cliSurface()) {
			const rootHelp = commandHelp([name]);
			expect(rootHelp, name).toStartWith("Usage: archboard ");
			for (const subcommand of subcommands) {
				const path = `${name} ${subcommand}`;
				const contract = registry.get(path)!;
				const help = commandHelp([name, subcommand]);
				expect(help, path).toStartWith(`Usage: archboard ${contract.usage}\n`);
				expect(help, path).toContain(`  ${contract.description}\n`);
				expect(help, path).toContain(
					`  Prerequisites: ${contract.prerequisites.join(", ") || "none"}. ` +
						`Effects: ${contract.effects.join(", ") || "none"}.\n`,
				);
			}
		}

		await using resources = new AsyncDisposableStack();
		const owner = resources.use(createPackageCliOwner());
		const smoke = await owner.run(["help", "browser", "capture"]);
		expect(smoke, packageFailure(smoke)).toMatchObject({ status: 0, stderr: "" });
		const expected = commandHelp(["browser", "capture"]);
		if (expected === null) {
			throw new Error("browser capture help is absent from the CLI registry.");
		}
		expect(smoke.stdout, packageFailure(smoke)).toBe(expected);
	});
});

describe("package argv compatibility", () => {
	test("preserves every released argv golden", async () => {
		await using resources = new AsyncDisposableStack();
		const http = resources.use(createCliHttpDouble());
		const owner = resources.use(createPackageCliOwner());
		for (const golden of argvGolden.cases) {
			http.setBrowserClients(golden.server === "no-browser" ? 0 : 1);
			const result = await owner.run(
				golden.argv,
				golden.server === "mock" || golden.server === "no-browser"
					? { url: http.url }
					: golden.server === "closed"
						? { url: "http://127.0.0.1:1" }
						: {},
			);
			expect(result.status, packageFailure(result)).toBe(golden.status);
			for (const stream of ["stdout", "stderr"] as const) {
				const actual = result[stream]
					.replaceAll(owner.outside, "{{OUTSIDE}}")
					.replaceAll(http.url, "{{CANVAS_URL}}");
				const expected = golden[stream]?.replaceAll("{{VERSION}}", packageRecord.version);
				if (expected === undefined) {
					expect(sha256(actual), packageFailure(result)).toBe(golden[`${stream}Sha256`]!);
				} else {
					expect(actual, packageFailure(result)).toBe(expected);
				}
			}
		}
	}, 30_000);
});
