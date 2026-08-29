import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { cliContractRegistry } from "../../../src/cli/commands/run.ts";
import {
	artifactFailure,
	artifactNames,
	createArtifactFixture,
} from "./support/artifact-fixture.ts";
import { checkoutRoot } from "./support/package-cli.ts";

const proofSchema = z.object({
	schemaVersion: z.literal(6),
	generatedFrom: z.literal("src/cli/commands/run.ts"),
	routes: z.array(
		z
			.object({
				name: z.string(),
				parent: z.string().nullable(),
				handlerOwner: z.string(),
				parserOwner: z.string(),
			})
			.passthrough(),
	),
	contracts: z.array(z.object({ name: z.string() }).passthrough()),
});
const expectedHashes: Readonly<Record<(typeof artifactNames)[number], string>> = {
	"cli-command-audit.md": "2f43d928290d6ef3e65e94989204facdfb71c84b8e4fa5952dd218ee3829555c",
	"command-contract-proof.json": "287c70c8a755773865ac4fecd6a08e51d10aa430b1a0229f8ed85fb3a7eef542",
	"command-contract-proof.md": "5eae34c89b28ed24b9f2291a0394120c5ca0b55812b60424d05bef43b3557f8e",
};
const auditSchema = z.object({
	entries: z.array(z.object({ path: z.string() }).passthrough()),
	workflows: z.array(z.object({ name: z.string() }).passthrough()),
});
const audit = auditSchema.parse(
	JSON.parse(readFileSync(join(checkoutRoot, "docs/design/cli-command-audit.json"), "utf8")),
);
const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

function validateArtifacts(directory: string): void {
	for (const name of artifactNames)
		expect(sha256(readFileSync(join(directory, name)))).toBe(expectedHashes[name]);
}

describe("command contract artifact generation", () => {
	test("generates exact typed bytes and public proof views twice from absent directories", () => {
		using fixture = createArtifactFixture();
		const statusBefore = fixture.status();
		expect(statusBefore.status, artifactFailure(statusBefore)).toBe(0);
		expect(existsSync(fixture.first)).toBe(false);
		expect(existsSync(fixture.second)).toBe(false);
		const first = fixture.generate(fixture.first);
		const second = fixture.generate(fixture.second);
		expect(first.status, artifactFailure(first)).toBe(0);
		expect(second.status, artifactFailure(second)).toBe(0);
		expect(first.stderr, artifactFailure(first)).toContain("bun scripts/generate-cli-contract.ts");
		expect(second.stderr, artifactFailure(second)).toContain(
			"bun scripts/generate-cli-contract.ts",
		);
		expect(fixture.files(fixture.first)).toEqual(artifactNames.toSorted());
		expect(fixture.files(fixture.second)).toEqual(artifactNames.toSorted());
		for (const name of artifactNames) {
			expect(fixture.bytes(fixture.first, name)).toEqual(fixture.bytes(fixture.second, name));
		}
		validateArtifacts(fixture.first);
		validateArtifacts(fixture.second);
		const proof = proofSchema.parse(
			JSON.parse(fixture.bytes(fixture.first, "command-contract-proof.json").toString()),
		);
		expect(proof.routes.map((route) => route.name)).toEqual(
			proof.contracts.map((contract) => contract.name),
		);
		expect(proof.routes).toEqual(
			cliContractRegistry().map(({ contract: _contract, ...route }) => route),
		);
		const proofJson = fixture.bytes(fixture.first, "command-contract-proof.json").toString();
		expect(proof.routes.every((route) => !("handlerName" in route))).toBeTrue();
		for (const privateName of ["pendingArtifact", "artifactSchema", "CommanderArgvParser"])
			expect(proofJson, privateName).not.toContain(privateName);
		expect(proofJson).not.toMatch(/"stdout"\s*:/);
		const proofMarkdown = fixture.bytes(fixture.first, "command-contract-proof.md").toString();
		expect(proofMarkdown).not.toMatch(/^Usage: `archboard/m);
		expect(proofMarkdown.match(/^Usage:\n\n```text\narchboard /gm)).toHaveLength(
			proof.contracts.length,
		);
		const auditMarkdown = fixture.bytes(fixture.first, "cli-command-audit.md").toString();
		expect(auditMarkdown.match(/^\| +`[^`]+` +\|/gm)).toHaveLength(audit.entries.length);
		for (const workflow of audit.workflows)
			expect(auditMarkdown, workflow.name).toContain(`### ${workflow.name}`);
		for (const name of artifactNames) {
			const ignored = fixture.git([
				"check-ignore",
				"--quiet",
				join("docs", "design", "generated", name),
			]);
			expect(ignored.status, artifactFailure(ignored)).toBe(0);
		}
		const statusAfter = fixture.status();
		expect(statusAfter.status, artifactFailure(statusAfter)).toBe(0);
		expect(statusAfter.stdout, artifactFailure(statusAfter)).toBe(statusBefore.stdout);
	});

	test("reports generated files in the declared write order", () => {
		using fixture = createArtifactFixture();
		const result = fixture.generate(fixture.first);
		expect(result.status, artifactFailure(result)).toBe(0);
		expect(result.stdout, artifactFailure(result)).toBe(
			artifactNames.map((name) => `generated ${join(fixture.first, name)}\n`).join(""),
		);
		for (const name of artifactNames) expect(existsSync(join(fixture.first, name))).toBe(true);
	});

	test("rejects an incomplete private output request", () => {
		using fixture = createArtifactFixture();
		const result = fixture.generate("");
		expect(result.status, artifactFailure(result)).not.toBe(0);
		expect(result.stdout, artifactFailure(result)).toBe("");
		expect(existsSync(fixture.first)).toBe(false);
	});

	test("detects reordered artifacts and changed generated bytes", () => {
		using fixture = createArtifactFixture();
		const generated = fixture.generate(fixture.first);
		expect(generated.status, artifactFailure(generated)).toBe(0);
		const reordered = artifactNames.toReversed();
		expect(reordered).not.toEqual(artifactNames);
		const proofPath = join(fixture.first, "command-contract-proof.json");
		writeFileSync(proofPath, Buffer.concat([readFileSync(proofPath), Buffer.from(" ")]));
		expect(() => validateArtifacts(fixture.first)).toThrow();
	});
});
