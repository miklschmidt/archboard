import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as ts from "typescript/unstable/ast";
import { parseModuleSources } from "../../../scripts/typescript-analysis.js";
import { analyzeModuleScope, moduleGraph } from "./support/module-scope-analysis.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const moduleRoot = path.join(repoRoot, "src/ui/codex-realtime");
const indexPath = path.join(moduleRoot, "index.ts");

const VALUE_EXPORTS = new Set([
	"assertRealtimeTransition",
	"canTransitionRealtimeState",
	"INITIAL_REALTIME_STATE",
	"REALTIME_PHASES",
	"REALTIME_TRANSITIONS",
	"transitionRealtimeState",
	"createRealtimeMediaSession",
	"REALTIME_MEDIA_FEATURE",
]);
const CONTRACT_MODULE = "./lib/contract.js";
const MEDIA_MODULE = "./lib/media-session.js";
const TYPE_EXPORTS = new Set([
	"AnswerSdp",
	"AppendNotDeliveredReason",
	"AppendOutcome",
	"AppendOutcomeReason",
	"AppendOutcomeUnknownReason",
	"AppendSpeechRequest",
	"AppendTextRequest",
	"CommandNotDeliveredReason",
	"CommandOutcome",
	"CommandOutcomeReason",
	"CommandOutcomeUnknownReason",
	"CreateOfferSdp",
	"RealtimeCommandRequest",
	"RealtimeCorrelation",
	"RealtimeCorrelationId",
	"RealtimeDiagnosticCode",
	"RealtimeHost",
	"RealtimeItemId",
	"RealtimePhase",
	"RealtimeRecoverableErrorReason",
	"RealtimeSemanticEvent",
	"RealtimeSemanticEventListener",
	"RealtimeSessionId",
	"RealtimeState",
	"RealtimeTerminalErrorReason",
	"RealtimeTranscriptRecord",
	"RealtimeTranscriptRole",
	"RealtimeTranscriptStatus",
	"RealtimeTransitionReason",
	"RealtimeUnsubscribe",
	"RecoveryRequest",
	"RemoteMediaAttachment",
	"StopRequest",
	"RealtimeMediaListener",
	"RealtimeMediaSession",
	"RealtimeMediaSnapshot",
]);
const VALUE_EXPORT_SOURCES = new Map([
	...[...VALUE_EXPORTS].slice(0, 6).map((name) => [name, CONTRACT_MODULE] as const),
	["createRealtimeMediaSession", MEDIA_MODULE],
	["REALTIME_MEDIA_FEATURE", MEDIA_MODULE],
]);
const TYPE_EXPORT_SOURCES = new Map([
	...[...TYPE_EXPORTS].slice(0, 33).map((name) => [name, CONTRACT_MODULE] as const),
	["RealtimeMediaListener", MEDIA_MODULE],
	["RealtimeMediaSession", MEDIA_MODULE],
	["RealtimeMediaSnapshot", MEDIA_MODULE],
]);

interface Finding {
	file: string;
	reason: string;
	message: string;
}

function indexFindings(file: string, ast: ts.SourceFile): Finding[] {
	const findings: Finding[] = [];
	if (
		/^\s*export\s+(?:default\s+)?(?:(?:const|function|class|interface)\b|type\s+(?!\{))/mu.test(
			ast.text,
		)
	)
		findings.push({
			file,
			reason: "accidental export",
			message: "remove direct public declarations; the public contract is re-exported only",
		});
	for (const statement of ast.statements) {
		if (!ts.isExportDeclaration(statement)) {
			if (ts.isExportAssignment(statement))
				findings.push({ file, reason: "accidental export", message: "use named exports only" });
			continue;
		}
		if (!statement.exportClause || !ts.isNamedExports(statement.exportClause)) {
			findings.push({
				file,
				reason: "accidental export",
				message: "wildcard and default exports are not part of the frozen public contract",
			});
			continue;
		}
		const allowed = statement.isTypeOnly ? TYPE_EXPORTS : VALUE_EXPORTS;
		const sources = statement.isTypeOnly ? TYPE_EXPORT_SOURCES : VALUE_EXPORT_SOURCES;
		for (const element of statement.exportClause.elements) {
			if (!allowed.has(element.name.text))
				findings.push({
					file,
					reason: "accidental export",
					message: `remove unexpected public export ${element.name.text}`,
				});
			else if (statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)) {
				const expectedSource = sources.get(element.name.text);
				if (statement.moduleSpecifier.text !== expectedSource)
					findings.push({
						file,
						reason: "accidental export",
						message: `re-export ${element.name.text} from its frozen source ${expectedSource}`,
					});
			}
		}
		if (!statement.moduleSpecifier || !ts.isStringLiteral(statement.moduleSpecifier))
			findings.push({
				file,
				reason: "accidental export",
				message: "public names must be re-exported from the private implementation",
			});
	}
	return findings;
}

function entrypointFindings(root: string, names: readonly string[]): Finding[] {
	return names
		.filter((name) => name !== "index.ts")
		.map((name) => ({
			file: path.join(root, name),
			reason: "extra public entrypoint",
			message: `remove ${name}; src/ui/codex-realtime/index.ts is the sole public entrypoint`,
		}));
}

function importSpecifiers(source: ts.SourceFile): string[] {
	const specifiers: string[] = [];
	for (const statement of source.statements) {
		if (
			(ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) &&
			statement.moduleSpecifier &&
			ts.isStringLiteral(statement.moduleSpecifier)
		)
			specifiers.push(statement.moduleSpecifier.text);
	}
	return specifiers;
}

function deepImportFindings(file: string, source: ts.SourceFile): Finding[] {
	if (file === indexPath || file.startsWith(`${moduleRoot}${path.sep}`)) return [];
	return importSpecifiers(source)
		.filter((specifier) => {
			if (!specifier.startsWith(".")) return false;
			const target = path.resolve(path.dirname(file), specifier.replace(/\.js$/u, ".ts"));
			return target.startsWith(`${moduleRoot}${path.sep}lib${path.sep}`);
		})
		.map((specifier) => ({
			file,
			reason: "deep import",
			message: `consume realtime through ${path.relative(repoRoot, indexPath)}, not ${specifier}`,
		}));
}

async function sourceMap(files: readonly string[]): Promise<Map<string, ts.SourceFile>> {
	return parseModuleSources(repoRoot, [...files]);
}

async function parsedFixture(
	virtualPath: string,
	source: string,
): Promise<{ file: string; ast: ts.SourceFile }> {
	const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "archboard-realtime-fixture-"));
	const target = path.join(temporaryRoot, virtualPath);
	fs.mkdirSync(path.dirname(target), { recursive: true });
	fs.writeFileSync(target, source);
	try {
		const parsed = await sourceMap([target]);
		const ast = parsed.get(path.resolve(target));
		if (!ast) throw new Error(`TypeScript did not parse ${virtualPath}`);
		return { file: path.join(repoRoot, virtualPath), ast };
	} finally {
		fs.rmSync(temporaryRoot, { recursive: true, force: true });
	}
}

describe("Codex realtime private package boundary", () => {
	test("has one entrypoint and the index contains only the frozen contract", async () => {
		const entries = fs
			.readdirSync(moduleRoot, { withFileTypes: true })
			.filter((entry) => entry.isFile() && /\.tsx?$/u.test(entry.name))
			.map((entry) => entry.name)
			.toSorted();
		expect(entries).toEqual(["index.ts"]);
		const parsed = await sourceMap([indexPath]);
		const ast = parsed.get(indexPath);
		if (!ast) throw new Error(`TypeScript did not parse ${indexPath}`);
		expect(indexFindings(indexPath, ast)).toEqual([]);
	});

	test("rejects extra entrypoints, accidental exports, and consumer deep imports with guidance", async () => {
		const extra = entrypointFindings(moduleRoot, ["index.ts", "client.ts"]);
		expect(extra).toEqual([
			expect.objectContaining({
				reason: "extra public entrypoint",
				message: expect.stringContaining("sole public entrypoint"),
			}),
		]);

		const accidentalFixture = await parsedFixture(
			"src/ui/codex-realtime/index.ts",
			'export * from "./lib/secret.js";\nexport { leaked } from "./lib/secret.js";\nexport const accidental = true;\n',
		);
		const accidental = indexFindings(accidentalFixture.file, accidentalFixture.ast);
		expect(accidental).toHaveLength(3);
		expect(accidental.every(({ message }) => message.includes("public"))).toBe(true);

		const hostileFixture = await parsedFixture(
			"src/ui/consumer-fixture.ts",
			'import { createRealtimeMediaSession } from "./codex-realtime/lib/media-session.js";\n',
		);
		const deep = deepImportFindings(hostileFixture.file, hostileFixture.ast);
		expect(deep).toEqual([
			expect.objectContaining({
				reason: "deep import",
				message: expect.stringContaining("consume realtime through"),
			}),
		]);

		const parsed = await sourceMap([indexPath]);
		const realFindings = [...parsed.entries()].flatMap(([file, source]) =>
			deepImportFindings(file, source),
		);
		expect(realFindings).toEqual([]);
	});

	test("keeps mutable module state inside session factories", async () => {
		const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "archboard-realtime-scope-"));
		const fixturePath = path.join(temporaryRoot, "mutable.ts");
		try {
			fs.writeFileSync(fixturePath, 'const sessions: string[] = [];\nsessions.push("fixture");\n');
			const parsed = await sourceMap([fixturePath]);
			const hostile = analyzeModuleScope(repoRoot, [fixturePath], parsed);
			expect(hostile.findings).toEqual([
				expect.objectContaining({
					rule: "mutable-literal-at-module-scope",
					message: expect.stringContaining("rebuilt on every reload"),
				}),
			]);
		} finally {
			fs.rmSync(temporaryRoot, { recursive: true, force: true });
		}

		const parsed = await sourceMap([indexPath]);
		const graph = moduleGraph([indexPath], parsed);
		expect(analyzeModuleScope(repoRoot, graph, parsed).findings).toEqual([]);
	});
});
