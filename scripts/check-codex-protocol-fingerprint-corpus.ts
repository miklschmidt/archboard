import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

import {
	CODEX_PROTOCOL_BINARY_VERSION,
	CODEX_PROTOCOL_GENERATED_FILE_COUNT,
	CODEX_PROTOCOL_GENERATED_TREE_SHA256,
	CODEX_PROTOCOL_VERSION,
	digestGeneratedTree,
} from "../src/runtime/codex-protocol/manifest.js";
import {
	astFingerprint,
	parseModuleSources,
	type AstFingerprint,
} from "./codex-protocol-fingerprints.js";

const repoRoot = path.resolve(import.meta.dir, "..");
const defaultCorpusPath = path.join(
	repoRoot,
	"tests/system/repository-policy/support/codex-protocol-fingerprint-corpus.json",
);
const require = createRequire(import.meta.url);

function executablePath(): string {
	const executable = require.resolve("@openai/codex/bin/codex.js");
	const localNodeModules = `${path.join(repoRoot, "node_modules")}${path.sep}`;
	if (!executable.startsWith(localNodeModules))
		throw new Error(`Resolved Codex executable is outside this checkout: ${executable}`);
	return executable;
}

function generatedFiles(root: string): string[] {
	return [...new Bun.Glob("**/*.ts").scanSync({ cwd: root, onlyFiles: true })]
		.map((file) => file.replaceAll("\\", "/"))
		.toSorted();
}

function expectedCorpus(entries: Readonly<Record<string, AstFingerprint>>) {
	const items = Object.entries(entries);
	const entryLines = items.map(([file, tokens], index) => {
		const prefix = `\t\t${JSON.stringify(file)}: `;
		const compact = `[${tokens.map((token) => JSON.stringify(token)).join(", ")}]`;
		const suffix = index + 1 === items.length ? "" : ",";
		if (`${prefix}${compact}${suffix}`.length <= 100) return `${prefix}${compact}${suffix}`;
		return JSON.stringify(tokens, null, "\t")
			.split("\n")
			.map((line, lineIndex) => `${lineIndex === 0 ? prefix : "\t\t"}${line}`)
			.join("\n")
			.concat(suffix);
	});
	return [
		"{",
		`\t"protocol": ${JSON.stringify(CODEX_PROTOCOL_VERSION)},`,
		`\t"fileCount": ${CODEX_PROTOCOL_GENERATED_FILE_COUNT},`,
		'\t"entries": {',
		entryLines.join("\n"),
		"\t}",
		"}",
		"",
	].join("\n");
}

function options(): { corpusPath: string; write: boolean } {
	const args = process.argv.slice(2);
	let corpusPath = defaultCorpusPath;
	let write = false;
	for (let index = 0; index < args.length; index += 1) {
		const argument = args[index];
		if (argument === "--write") write = true;
		else if (argument === "--corpus") {
			corpusPath = path.resolve(repoRoot, args[++index] ?? "");
		} else if (argument !== "--check") throw new Error(`Unknown argument: ${argument}`);
	}
	return { corpusPath, write };
}

async function main(): Promise<void> {
	const { corpusPath, write } = options();
	const generatedRoot = fs.mkdtempSync(path.join(process.env.TMPDIR ?? "/tmp", "archboard-codex-"));
	try {
		const executable = executablePath();
		const version = execFileSync(executable, ["--version"], { encoding: "utf8" }).trim();
		if (version !== CODEX_PROTOCOL_BINARY_VERSION)
			throw new Error(`Expected Codex ${CODEX_PROTOCOL_BINARY_VERSION}, received ${version}`);
		execFileSync(
			executable,
			["app-server", "generate-ts", "--experimental", "--out", generatedRoot],
			{ cwd: repoRoot, stdio: ["ignore", "pipe", "pipe"] },
		);
		const digest = digestGeneratedTree(generatedRoot);
		if (
			digest.fileCount !== CODEX_PROTOCOL_GENERATED_FILE_COUNT ||
			digest.sha256 !== CODEX_PROTOCOL_GENERATED_TREE_SHA256
		)
			throw new Error(
				`Generated tree mismatch: expected ${CODEX_PROTOCOL_GENERATED_FILE_COUNT} files and ${CODEX_PROTOCOL_GENERATED_TREE_SHA256}, received ${digest.fileCount} files and ${digest.sha256}`,
			);
		const files = generatedFiles(generatedRoot);
		const parsed = await parseModuleSources(
			repoRoot,
			files.map((file) => path.join(generatedRoot, file)),
		);
		const entries = Object.fromEntries(
			files.map((file) => {
				const source = parsed.get(path.resolve(generatedRoot, file));
				if (!source) throw new Error(`TypeScript did not parse generated file ${file}`);
				return [file, astFingerprint(source)];
			}),
		);
		const regenerated = expectedCorpus(entries);
		if (write) {
			fs.writeFileSync(corpusPath, regenerated);
			process.stdout.write(`wrote ${corpusPath}\n`);
			return;
		}
		const committed = fs.readFileSync(corpusPath, "utf8");
		if (committed !== regenerated)
			throw new Error(
				`Fingerprint corpus does not match the pinned Codex ${CODEX_PROTOCOL_VERSION} generator; run bun run generate:codex-protocol-fingerprint-corpus`,
			);
		process.stdout.write(
			`verified ${files.length} fingerprints from Codex ${CODEX_PROTOCOL_VERSION}\n`,
		);
	} finally {
		fs.rmSync(generatedRoot, { recursive: true, force: true });
	}
}

try {
	await main();
} catch (error) {
	process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
	process.exitCode = 1;
}
