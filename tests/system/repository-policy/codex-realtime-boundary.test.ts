import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as ts from "typescript/unstable/ast";
import { parseModuleSources } from "../../../scripts/typescript-analysis.js";
import { analyzeModuleScope, moduleGraph } from "./support/module-scope-analysis.js";
import { forbiddenRealtimeModuleFinding } from "./support/codex-realtime-dependency.js";
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const moduleRoot = path.join(repoRoot, "src/ui/codex-realtime");
const indexPath = path.join(moduleRoot, "index.ts");
const workbenchMediaOwnerPath = path.join(moduleRoot, "lib/workbench-media-owner.ts");
const workbenchBrowserModelSpecifier = "../../../shared/codex-browser-model/index.js";
const packagePath = path.join(repoRoot, "package.json"),
	nestedPackagePath = path.join(moduleRoot, "package.json");
const SOURCE_LIKE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mts", ".cts"]);
const sourceLike = (name: string): boolean => SOURCE_LIKE_EXTENSIONS.has(path.extname(name));
const rootEntries = (root: string): string[] =>
	fs
		.readdirSync(root, { withFileTypes: true })
		.filter((entry) => entry.isFile() && sourceLike(entry.name))
		.map((entry) => entry.name)
		.toSorted();
const VALUE_EXPORTS = new Set(
	"assertRealtimeTransition canTransitionRealtimeState INITIAL_REALTIME_STATE REALTIME_PHASES REALTIME_TRANSITIONS transitionRealtimeState createRealtimeMediaSession REALTIME_MEDIA_FEATURE createBrowserWorkbenchMediaOwner".split(
		" ",
	),
);
const CONTRACT_MODULE = "./lib/contract.js";
const TYPE_EXPORTS = new Set(
	"AnswerSdp AppendNotDeliveredReason AppendOutcome AppendOutcomeReason AppendOutcomeUnknownReason AppendSpeechRequest AppendTextRequest CommandNotDeliveredReason CommandOutcome CommandOutcomeReason CommandOutcomeUnknownReason CreateOfferSdp RealtimeCommandRequest RealtimeCorrelation RealtimeCorrelationId RealtimeDiagnosticCode RealtimeHost RealtimeItemId RealtimePhase RealtimeRecoverableErrorReason RealtimeSemanticEvent RealtimeSemanticEventListener RealtimeSessionId RealtimeState RealtimeTerminalErrorReason RealtimeTranscriptRecord RealtimeTranscriptRole RealtimeTranscriptStatus RealtimeTransitionReason RealtimeUnsubscribe RecoveryRequest RemoteMediaAttachment StopRequest RealtimeMediaListener RealtimeMediaSession RealtimeMediaSnapshot BrowserWorkbenchMediaOwner BrowserWorkbenchMediaState".split(
		" ",
	),
);
const VALUE_EXPORT_SOURCES = new Map([
	...[...VALUE_EXPORTS].slice(0, 6).map((name) => [name, CONTRACT_MODULE] as const),
	["createRealtimeMediaSession", "./lib/media-session.js"],
	["REALTIME_MEDIA_FEATURE", "./lib/media-session.js"],
	["createBrowserWorkbenchMediaOwner", "./lib/workbench-media-owner.js"],
]);
const TYPE_EXPORT_SOURCES = new Map([
	...[...TYPE_EXPORTS]
		.slice(0, 33)
		.map((name) => [name, "../../shared/codex-realtime-host/index.js"] as const),
	["RealtimeMediaListener", "./lib/media-session.js"],
	["RealtimeMediaSession", "./lib/media-session.js"],
	["RealtimeMediaSnapshot", "./lib/media-session.js"],
	["BrowserWorkbenchMediaOwner", "./lib/workbench-media-owner.js"],
	["BrowserWorkbenchMediaState", "./lib/workbench-media-owner.js"],
]);
const PRIVATE_PACKAGE_KEYS =
	"exports files workspaces publishConfig main module types typesVersions unpkg jsdelivr browser".split(
		" ",
	);
const ALTERNATE_REALTIME_APIS = new Set(
	"websocket websocketserver webtransport mediarecorder audioworklet audiochunk audiodata appendaudio outputaudio transport socket".split(
		" ",
	),
);
interface Finding {
	file: string;
	reason: string;
	message: string;
}
type ModuleReference = {
	specifier: string;
	kind: "static import" | "type import" | "dynamic import" | "require";
};
function privatePackageFindings(file: string, packageJson: Record<string, unknown>): Finding[] {
	const findings: Finding[] = [];
	if (packageJson.private !== true)
		findings.push({
			file,
			reason: "package is publishable",
			message: "set package.json private to true; this realtime module is private",
		});
	for (const key of PRIVATE_PACKAGE_KEYS) {
		if (!(key in packageJson)) continue;
		findings.push({
			file,
			reason: "publication metadata",
			message: `remove package.json ${key}; publication is out of scope for this module`,
		});
	}
	return findings;
}

function indexFindings(file: string, ast: ts.SourceFile): Finding[] {
	const findings: Finding[] = [];
	for (const statement of ast.statements) {
		const modifiers = (statement as { modifiers?: readonly ts.Node[] }).modifiers ?? [];
		if (
			modifiers.some(({ kind }) => kind === ts.SyntaxKind.ExportKeyword) &&
			!ts.isExportDeclaration(statement)
		)
			findings.push({
				file,
				reason: "accidental export",
				message: "remove direct public declarations; the public contract is re-exported only",
			});
	}
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

const literalText = (node: ts.Node | undefined): string | undefined =>
	node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
		? node.text
		: undefined;

function moduleReferences(source: ts.SourceFile): ModuleReference[] {
	const references: ModuleReference[] = [];
	const visit = (node: ts.Node): void => {
		if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
			const specifier = literalText(node.moduleSpecifier);
			if (specifier)
				references.push({
					specifier,
					kind:
						ts.isImportDeclaration(node) && node.getText(source).startsWith("import type")
							? "type import"
							: "static import",
				});
		}
		if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
			const specifier = literalText(node.argument.literal);
			if (specifier) references.push({ specifier, kind: "type import" });
		}
		if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
			const specifier = literalText(node.arguments[0]);
			if (specifier) references.push({ specifier, kind: "dynamic import" });
		}
		if (
			ts.isCallExpression(node) &&
			ts.isIdentifier(node.expression) &&
			node.expression.text === "require"
		) {
			const specifier = literalText(node.arguments[0]);
			if (specifier) references.push({ specifier, kind: "require" });
		}
		node.forEachChild(visit);
	};
	visit(source);
	return references;
}

function stripSpecifierQuery(specifier: string): string {
	const query = specifier.indexOf("?");
	return query === -1 ? specifier : specifier.slice(0, query);
}

function privatePathTarget(file: string, specifier: string): string | undefined {
	const clean = stripSpecifierQuery(specifier);
	if (clean.startsWith("file://")) {
		try {
			return path.resolve(new URL(clean).pathname);
		} catch {
			return undefined;
		}
	}
	if (path.isAbsolute(clean)) return path.resolve(clean);
	if (clean.startsWith("src/")) return path.resolve(repoRoot, clean);
	if (!clean.startsWith(".")) return undefined;
	return path.resolve(path.dirname(file), clean);
}

function isRealtimePrivatePath(file: string, specifier: string): boolean {
	const clean = stripSpecifierQuery(specifier);
	if (/(?:^|[/#])codex-realtime\/lib(?:[/#]|$)/iu.test(clean)) return true;
	const target = privatePathTarget(file, specifier);
	if (!target) return false;
	const normalized = target.replace(/\.jsx?$/u, ".ts");
	return normalized.startsWith(`${moduleRoot}${path.sep}lib${path.sep}`);
}

function parsedTargets(
	file: string,
	specifier: string,
	parsed: ReadonlyMap<string, ts.SourceFile>,
): string[] {
	const target = privatePathTarget(file, specifier);
	if (!target) return [];
	const extension = path.extname(target);
	const candidates = [target];
	if (extension === ".js" || extension === ".jsx") {
		candidates.push(`${target.slice(0, -extension.length)}.ts`);
	} else if (!extension) {
		candidates.push(`${target}.ts`, `${target}.tsx`, path.join(target, "index.ts"));
	}
	return candidates.filter((candidate) => parsed.has(candidate));
}

function deepImportFindings(file: string, source: ts.SourceFile): Finding[] {
	if (file === indexPath || file.startsWith(`${moduleRoot}${path.sep}`)) return [];
	return moduleReferences(source)
		.filter(({ specifier }) => isRealtimePrivatePath(file, specifier))
		.map(({ specifier, kind }) => ({
			file,
			reason: "deep import",
			message: `replace ${kind} ${specifier} with ${path.relative(repoRoot, indexPath)}; private lib imports are forbidden`,
		}));
}

const isWorkbenchBrowserModelTypeEdge = (file: string, reference: ModuleReference): boolean =>
	file === workbenchMediaOwnerPath &&
	reference.kind === "type import" &&
	reference.specifier === workbenchBrowserModelSpecifier;
function forbiddenApiFindings(file: string, source: ts.SourceFile): Finding[] {
	const findings: Finding[] = [];
	const visit = (node: ts.Node): void => {
		if (
			ts.isIdentifier(node) &&
			ALTERNATE_REALTIME_APIS.has(node.text.toLowerCase()) &&
			(file !== workbenchMediaOwnerPath ||
				!["socket", "websocket"].includes(node.text.toLowerCase()) ||
				(ts.isNewExpression(node.parent) && node.parent.expression === node))
		)
			findings.push({
				file,
				reason: "alternate transport API",
				message: `remove ${node.text}; use WebRTC audio and the host contract instead`,
			});
		node.forEachChild(visit);
	};
	visit(source);
	return findings;
}
function realtimeGraphFindings(
	entry: string,
	parsed: ReadonlyMap<string, ts.SourceFile>,
): Finding[] {
	const findings: Finding[] = [];
	const visited = new Set<string>();
	const queue = [path.resolve(entry)];
	while (queue.length > 0) {
		const file = queue.shift();
		if (!file || visited.has(file)) continue;
		visited.add(file);
		const source = parsed.get(file);
		if (!source) throw new Error(`TypeScript did not parse ${file}`);
		const references = moduleReferences(source);
		findings.push(
			...references.flatMap((reference) => {
				if (isWorkbenchBrowserModelTypeEdge(file, reference)) return [];
				const dependency = forbiddenRealtimeModuleFinding(file, reference, repoRoot);
				return dependency ? [dependency] : [];
			}),
		);
		findings.push(...forbiddenApiFindings(file, source));
		for (const reference of references) {
			if (isWorkbenchBrowserModelTypeEdge(file, reference)) continue;
			queue.push(...parsedTargets(file, reference.specifier, parsed));
		}
	}
	return findings;
}

async function sourceMap(files: readonly string[]): Promise<Map<string, ts.SourceFile>> {
	return parseModuleSources(repoRoot, [...files]);
}

async function withParsedFixtures<T>(
	files: Readonly<Record<string, string>>,
	run: (
		paths: ReadonlyMap<string, string>,
		parsed: ReadonlyMap<string, ts.SourceFile>,
	) => Promise<T>,
): Promise<T> {
	const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "archboard-realtime-graph-"));
	const paths = new Map<string, string>();
	try {
		for (const [virtualPath, source] of Object.entries(files)) {
			const target = path.join(temporaryRoot, virtualPath);
			fs.mkdirSync(path.dirname(target), { recursive: true });
			fs.writeFileSync(target, source);
			paths.set(virtualPath, target);
		}
		const parsed = await sourceMap([...paths.values()]);
		return await run(paths, parsed);
	} finally {
		fs.rmSync(temporaryRoot, { recursive: true, force: true });
	}
}

describe("Codex realtime private package boundary", () => {
	test("keeps publication private in the root package and forbids nested package metadata", () => {
		const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8")) as Record<string, unknown>;
		expect(privatePackageFindings(packagePath, packageJson)).toEqual([]);
		expect(
			fs.existsSync(nestedPackagePath),
			"remove nested package.json; root owns private metadata",
		).toBe(false);

		const hostile = Object.fromEntries(
			["private", ...PRIVATE_PACKAGE_KEYS].map((key) => [key, key === "private" ? false : {}]),
		) as Record<string, unknown>;
		const findings = privatePackageFindings("package.json", hostile);
		expect(findings).toHaveLength(PRIVATE_PACKAGE_KEYS.length + 1);
		expect(
			findings.every(
				({ message }) => message.includes("private") || message.includes("out of scope"),
			),
		).toBe(true);
		expect(["index.ts", "client.js"].filter(sourceLike).toSorted()).toEqual([
			"client.js",
			"index.ts",
		]);
	});

	test("has one entrypoint and the index contains only the frozen contract", async () => {
		expect(rootEntries(moduleRoot)).toEqual(["index.ts"]);
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

		const accidental = await withParsedFixtures(
			{
				"src/ui/codex-realtime/index.ts":
					'export * from "./lib/secret.js";\nexport { leaked } from "./lib/secret.js";\nexport declare const ambient: string;\nexport declare namespace Ambient {}\nexport type AmbientType = string;\n',
			},
			async (paths, parsed) =>
				indexFindings(
					path.join(repoRoot, "src/ui/codex-realtime/index.ts"),
					parsed.get(paths.get("src/ui/codex-realtime/index.ts")!)!,
				),
		);
		expect(accidental).toHaveLength(5);
		expect(accidental.every(({ message }) => message.includes("public"))).toBe(true);

		for (const [kind, source] of [
			[
				"static import",
				'import { createRealtimeMediaSession } from "./codex-realtime/lib/media-session.js?raw";\n',
			],
			[
				"type import",
				'type Session = import("./codex-realtime/lib/media-session").RealtimeMediaSession;\n',
			],
			["dynamic import", 'void import("./codex-realtime/lib/media-session.js?raw");\n'],
			["require", 'void require("./codex-realtime/lib/media-session.js");\n'],
		] as const) {
			const deep = await withParsedFixtures({ "consumer.ts": source }, async (paths, parsed) =>
				deepImportFindings(
					path.join(repoRoot, "src/ui/consumer-fixture.ts"),
					parsed.get(paths.get("consumer.ts")!)!,
				),
			);
			expect(deep).toEqual([
				expect.objectContaining({
					reason: "deep import",
					message: expect.stringContaining(kind),
				}),
			]);
		}

		const parsed = await sourceMap([indexPath]);
		const realFindings = [...parsed.entries()].flatMap(([file, source]) =>
			deepImportFindings(file, source),
		);
		expect(realFindings).toEqual([]);
		expect(
			isRealtimePrivatePath(
				path.join(repoRoot, "src/ui/consumer-fixture.ts"),
				"#codex-realtime/lib/media-session.js?raw",
			),
		).toBe(true);
	});

	test("audits every production dependency edge and rejects browser-incompatible APIs", async () => {
		const realSources = await sourceMap([indexPath]);
		expect(realtimeGraphFindings(indexPath, realSources)).toEqual([]);

		const hostileCases = [
			[
				"framework and near host suffix",
				'import React from "react"; type Thread = import("@assistant-ui/react").Thread; type Host = import("./near/shared/codex-realtime-host/index.js").Host;\n',
			],
			[
				"Node host masquerade",
				'type Host = import("node:shared/codex-realtime-host/index.js").Host;\n',
			],
			[
				"runtime generated lookalike",
				'void import("./runtime/generated/codex-realtime-host/index.js");\n',
			],
			[
				"require fake and WebSocket API",
				'void require("./fakes.ts"); new WebSocket("wss://example.test");\n',
			],
		] as const;
		for (const [label, source] of hostileCases) {
			await withParsedFixtures(
				{
					"index.ts": source,
					"generated-codex.ts": "export const generated = true;\n",
					"fakes.ts": "export const fake = true;\n",
				},
				async (paths, parsed) => {
					const findings = realtimeGraphFindings(paths.get("index.ts")!, parsed);
					expect(findings, label).not.toEqual([]);
					expect(findings.every(({ message }) => message.length > 20)).toBe(true);
				},
			);
		}

		await withParsedFixtures(
			{
				"index.ts":
					'import { CODEX_REALTIME_START_MS } from "./timing.ts";\nvoid CODEX_REALTIME_START_MS;\n',
				"timing.ts": "export const CODEX_REALTIME_START_MS = 100;\n",
			},
			async (paths, parsed) => {
				expect(realtimeGraphFindings(paths.get("index.ts")!, parsed)).toEqual([]);
			},
		);
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
