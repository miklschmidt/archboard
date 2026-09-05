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
	generalHelpSha256: z.string(),
	cases: z.array(streamGoldenSchema),
});
const compatibilitySchema = z.object({
	schemaVersion: z.literal(2),
	fixedBase: z.string(),
	publicPaths: z.array(z.string()),
	helpStdoutSha256ByCommand: z.record(z.string(), z.string()),
	orderedCases: z.array(
		z.object({
			name: z.string(),
			argv: z.array(z.string()),
			fixture: z.string(),
			exit: z.number(),
			stdout: z.string(),
			stderr: z.string(),
			heldState: z.unknown(),
			normalizations: z.array(
				z.object({ value: z.string(), token: z.string(), reason: z.string().min(1) }),
			),
			prerequisiteContacts: z.array(z.string()),
			restEffects: z.array(z.string()),
			localEffects: z.array(z.string()),
			artifactCommits: z.array(z.string()),
			mergedEvents: z.array(
				z.object({ kind: z.string(), value: z.union([z.string(), z.number()]).optional() }),
			),
		}),
	),
});

const argvPath = join(checkoutRoot, "tests/system/cli/fixtures/argv-golden.json");
const compatibilityPath = join(
	checkoutRoot,
	"tests/system/cli/fixtures/fixed-base-compatibility.json",
);
const argvGolden = argvGoldenSchema.parse(JSON.parse(readFileSync(argvPath, "utf8")));
const compatibility = compatibilitySchema.parse(
	JSON.parse(readFileSync(compatibilityPath, "utf8")),
);
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");

describe("package bin and help", () => {
	test("owns byte-identical typed golden fixtures", () => {
		const pairs = [
			[
				"src/cli/command-contract/tests/argv-golden.json",
				argvPath,
				"101954e3c75f55918f67744aac6715f623bb4d69bf944963800f5bc16c97b793",
			],
			[
				"src/cli/command-contract/tests/fixed-base-compatibility.json",
				compatibilityPath,
				"fa7c2d2081665402214e9ae8361a1f722b3a208e77d542a093e07c3eea33b457",
			],
		] as const;
		for (const [oldRelative, owned, digest] of pairs) {
			const ownedBytes = readFileSync(owned);
			expect(sha256(ownedBytes)).toBe(digest);
			const old = join(checkoutRoot, oldRelative);
			if (existsSync(old)) {
				const oldBytes = readFileSync(old);
				expect(oldBytes.equals(ownedBytes)).toBe(true);
				expect(sha256(oldBytes)).toBe(digest);
			}
		}
	});

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

	test("preserves fixed-base top-level help bytes and executable record order", () => {
		expect(compatibility.schemaVersion).toBe(2);
		expect(compatibility.fixedBase).toBe("dfb589bd28f6dc95289f5271ba389bfcc48bafbe");
		for (const path of compatibility.publicPaths) {
			const [command, ...tail] = path.split(" ");
			const help = commandHelp([command!, ...tail]);
			expect(help, path).not.toBeNull();
			if (tail.length === 0) {
				expect(sha256(help!), path).toBe(compatibility.helpStdoutSha256ByCommand[command!]!);
			}
		}
		expect(new Set(compatibility.orderedCases.map((record) => record.name)).size).toBe(
			compatibility.orderedCases.length,
		);
	}, 30_000);

	test("detects an altered argv golden", () => {
		const altered = readFileSync(argvPath, "utf8").replace('"name"', '"nAme"');
		expect(sha256(altered)).not.toBe(
			"101954e3c75f55918f67744aac6715f623bb4d69bf944963800f5bc16c97b793",
		);
	});
});
