import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { cliSurface } from "../../../src/cli/commands/run.ts";
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
const fixedBaseGeneralHelp = (value: string) =>
	value
		.replace(/^  bridge\s+Mark or remove a verified connector crossing\n/m, "")
		.replace(/^  check\s+Inspect a persisted board for deterministic quality findings\n/m, "")
		.replace(
			/^  render-findings\s+Render deterministic PNG close-ups for persisted board findings\n/m,
			"",
		)
		.replace(/^               check only: 6 warnings, 7 errors, 8 indeterminate coverage\.\n/m, "");

describe("package bin and help", () => {
	test("owns byte-identical typed golden fixtures", () => {
		const pairs = [
			[
				"src/cli/command-contract/tests/argv-golden.json",
				argvPath,
				"93d7f3037a12945432056b1b27a8decf42187f943335b153dc341a03ed6409e6",
			],
			[
				"src/cli/command-contract/tests/fixed-base-compatibility.json",
				compatibilityPath,
				"7ef7c5a38e165b7cf37c1a774618841766cdf35b917239d95399c4a127f763de",
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
		const owner = createPackageCliOwner();
		try {
			expect(packageRecord.bin.archboard).toBe("bin/canvas");
			expect(existsSync(packageBin)).toBe(true);
			expect(owner.outside).not.toBe(checkoutRoot);
			expect(existsSync(join(owner.outside, ".git"))).toBe(false);
			const result = await owner.run([]);
			expect(result, packageFailure(result)).toMatchObject({ status: 0, stderr: "" });
			expect(result.stdout).toMatch(/^archboard .*\n\nUsage:/m);
			expect(result.stdout).not.toMatch(/model context protocol|json-rpc|stdio server/i);
		} finally {
			await owner.dispose();
		}
	});

	test("every declared command and subcommand has clean help", async () => {
		const owner = createPackageCliOwner();
		try {
			const bare = await owner.run([]);
			for (const { name, subcommands } of cliSurface()) {
				expect(bare.stdout).toMatch(new RegExp(`^  ${name}\\s`, "m"));
				const command = await owner.run(["help", name]);
				expect(command, packageFailure(command)).toMatchObject({ status: 0, stderr: "" });
				expect(command.stdout).toStartWith("Usage: archboard ");
				for (const subcommand of subcommands) {
					const topic = await owner.run(["help", name, subcommand]);
					expect(topic, packageFailure(topic)).toMatchObject({ status: 0, stderr: "" });
					expect(topic.stdout).toMatch(
						new RegExp(`(^|[^a-z0-9-])${subcommand}([^a-z0-9-]|$)`, "i"),
					);
				}
			}
			for (const alias of [["-h"], ["--help"], ["help", "unknown-topic"]]) {
				const result = await owner.run(alias);
				expect(result, packageFailure(result)).toMatchObject({ status: 0, stderr: "" });
				expect(sha256(fixedBaseGeneralHelp(result.stdout))).toBe(argvGolden.generalHelpSha256);
			}
		} finally {
			await owner.dispose();
		}
	}, 30_000);
});

describe("package argv compatibility", () => {
	test("preserves every released argv golden", async () => {
		const owner = createPackageCliOwner();
		const http = createCliHttpDouble();
		try {
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
					if (expected === undefined) expect(sha256(actual)).toBe(golden[`${stream}Sha256`]!);
					else expect(actual).toBe(expected);
				}
			}
		} finally {
			http.dispose();
			await owner.dispose();
		}
	}, 30_000);

	test("preserves fixed-base help bytes and executable record order", async () => {
		const owner = createPackageCliOwner();
		try {
			expect(compatibility.schemaVersion).toBe(2);
			expect(compatibility.fixedBase).toBe("6c42fca6c0d5b9ecaa5ad40fde14ede684722d5a");
			for (const path of compatibility.publicPaths) {
				const [command, ...tail] = path.split(" ");
				const result = await owner.run(["help", command!, ...tail]);
				expect(result, packageFailure(result)).toMatchObject({ status: 0, stderr: "" });
				expect(sha256(result.stdout)).toBe(compatibility.helpStdoutSha256ByCommand[command!]!);
			}
			expect(new Set(compatibility.orderedCases.map((record) => record.name)).size).toBe(
				compatibility.orderedCases.length,
			);
		} finally {
			await owner.dispose();
		}
	}, 30_000);

	test("detects an altered argv golden", () => {
		const altered = readFileSync(argvPath, "utf8").replace('"name"', '"nAme"');
		expect(sha256(altered)).not.toBe(
			"93d7f3037a12945432056b1b27a8decf42187f943335b153dc341a03ed6409e6",
		);
	});
});
