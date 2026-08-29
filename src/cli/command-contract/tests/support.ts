import { spyOn } from "bun:test";
import {
	closeSync,
	existsSync,
	mkdtempSync,
	openSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { defineCommand, type AnyCommandContract, type PendingArtifact } from "../contract.js";
import { runCommand } from "../runner.js";
import { PendingArtifactSchema } from "../schemas.js";

export const heldCompatibility = JSON.parse(
	readFileSync(join(import.meta.dir, "held-output-compatibility.json"), "utf8"),
) as {
	fixedBase: string;
	held: { board: string; message: string; writes: number };
	cases: Array<{
		name: string;
		path: string;
		outputCase: string;
		result: unknown;
		artifact?: unknown;
		stdout: string;
		stderr: string;
		events: string[];
	}>;
};

const temporaryDirectories: string[] = [];

export function cleanupCommandContractTest() {
	process.exitCode = 0;
	for (const directory of temporaryDirectories.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
}

export function proofContract(options: {
	result: unknown;
	resultSchema?: z.ZodType;
	file?: boolean;
	artifact?: unknown;
	artifactSchema?: z.ZodType<PendingArtifact>;
}) {
	return defineCommand({
		path: ["proof"],
		summary: "proof",
		usage: "proof",
		description: "proof",
		examples: [],
		parameters: [
			{
				kind: "option",
				key: "name",
				spellings: ["--name"],
				value: "required",
				description: "name",
			},
		],
		input: { ingress: z.object({ name: z.string().default("value") }) },
		result: options.resultSchema ?? z.unknown(),
		output: {
			cases: [
				options.file
					? {
							id: "file",
							when: {},
							mode: "file-receipt",
							held: "none",
							description: "file",
							artifact: options.artifactSchema ?? PendingArtifactSchema,
						}
					: {
							id: "json",
							when: {},
							mode: "json",
							held: "none",
							description: "json",
						},
			],
			select: () => (options.file ? "file" : "json"),
		},
		prerequisites: [],
		effects: options.file ? ["local-write"] : [],
		refusals: [],
		relationships: [],
		async handler() {
			return {
				result: options.result,
				...(options.artifact === undefined ? {} : { pendingArtifact: options.artifact }),
			};
		},
	});
}

export async function executePublic(contract: AnyCommandContract, argv: readonly string[] = []) {
	let stdout = "";
	let stderr = "";
	let error: unknown;
	const stdoutSpy = spyOn(process.stdout, "write").mockImplementation((value) => {
		stdout += String(value);
		return true;
	});
	const stderrSpy = spyOn(process.stderr, "write").mockImplementation((value) => {
		stderr += String(value);
		return true;
	});
	try {
		await runCommand(contract, argv);
	} catch (caught) {
		error = caught;
	} finally {
		stdoutSpy.mockRestore();
		stderrSpy.mockRestore();
	}
	return { stdout, stderr, error };
}

export function temporaryPath(name: string) {
	const directory = mkdtempSync(join(tmpdir(), "archboard-contract-"));
	temporaryDirectories.push(directory);
	return join(directory, name);
}

export function runPublicFixture(
	record: Record<string, unknown>,
	artifactPath: string,
	merged = false,
): Promise<{
	status: number | null;
	stdout: string;
	stderr: string;
	merged: string;
	artifactExistedAtFirstOutput: boolean | null;
}> {
	const fixturePath = temporaryPath("record.json");
	writeFileSync(fixturePath, JSON.stringify(record));
	const mergedPath = temporaryPath("merged.log");
	const descriptor = merged ? openSync(mergedPath, "w+") : undefined;
	return new Promise((resolve) => {
		const child = spawn(
			process.execPath,
			[join(import.meta.dir, "public-runner-fixture.ts"), fixturePath],
			{
				cwd: process.cwd(),
				env: { ...process.env, EXCALIDRAW_NO_AUTOSTART: "1" },
				stdio: merged ? ["ignore", descriptor!, descriptor!] : ["ignore", "pipe", "pipe"],
			},
		);
		let stdout = "";
		let stderr = "";
		let artifactExistedAtFirstOutput: boolean | null = null;
		if (!merged) {
			child.stdout!.setEncoding("utf8");
			child.stderr!.setEncoding("utf8");
			child.stdout!.on("data", (chunk) => {
				if (artifactExistedAtFirstOutput === null) {
					artifactExistedAtFirstOutput = existsSync(artifactPath);
				}
				stdout += chunk;
			});
			child.stderr!.on("data", (chunk) => {
				if (artifactExistedAtFirstOutput === null) {
					artifactExistedAtFirstOutput = existsSync(artifactPath);
				}
				stderr += chunk;
			});
		}
		child.on("close", (status) => {
			if (descriptor !== undefined) closeSync(descriptor);
			resolve({
				status,
				stdout,
				stderr,
				merged: merged ? readFileSync(mergedPath, "utf8") : "",
				artifactExistedAtFirstOutput,
			});
		});
	});
}
