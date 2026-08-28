import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import compatibilityJson from "./fixtures/fixed-base-compatibility.json";
import { createCliHttpDouble } from "./support/cli-http-double.ts";
import {
	checkoutRoot,
	createPackageCliOwner,
	packageFailure,
	type PackageCliOwner,
	type PackageRunOptions,
	type PackageRunResult,
} from "./support/package-cli.ts";

const normalizationSchema = z.object({
	value: z.enum(["outside", "closedUrl", "foreignUrl"]),
	token: z.string(),
	reason: z.string(),
});
const mergedEventSchema = z.discriminatedUnion("kind", [
	z.object({ kind: z.literal("contact"), value: z.string() }),
	z.object({ kind: z.literal("stdout") }),
	z.object({ kind: z.literal("stderr-bytes"), value: z.string() }),
	z.object({ kind: z.literal("exit"), value: z.number().int() }),
]);
const heldStateSchema = z
	.object({ board: z.string(), message: z.string(), writes: z.number().int() })
	.nullable();
const compatibilityRecordSchema = z.object({
	name: z.string(),
	fixture: z.enum([
		"closed-server",
		"foreign-server",
		"mock-server",
		"mock-server-repo-cwd",
		"existing-skill-proc-repo",
	]),
	argv: z.array(z.string()),
	normalizations: z.array(normalizationSchema),
	stdout: z.string(),
	stderr: z.string(),
	mergedEvents: z.array(mergedEventSchema),
	exit: z.number().int(),
	heldState: heldStateSchema,
	prerequisiteContacts: z.array(z.string()),
	restEffects: z.array(z.string()),
	localEffects: z.array(z.string()),
	artifactCommits: z.array(z.string()),
});
const fixedBaseCompatibilitySchema = z.object({
	schemaVersion: z.literal(2),
	fixedBase: z.string().regex(/^[0-9a-f]{40}$/),
	publicPaths: z.array(z.string()),
	helpStdoutSha256ByCommand: z.record(z.string(), z.string().regex(/^[0-9a-f]{64}$/)),
	orderedCases: z.array(compatibilityRecordSchema).length(11),
});
const compatibility = fixedBaseCompatibilitySchema.parse(compatibilityJson);
type CompatibilityRecord = z.infer<typeof compatibilityRecordSchema>;
type Runtime = { outside: string; closedUrl: string; foreignUrl?: string };

const normalize = (value: string, record: CompatibilityRecord, runtime: Runtime) =>
	record.normalizations.reduce(
		(result, rule) => result.replaceAll(runtime[rule.value] ?? "", rule.token),
		value,
	);

const argvFor = (record: CompatibilityRecord, owner: PackageCliOwner) =>
	record.argv.map((token) =>
		token.replaceAll("{{SKILL_ROOT}}", join(owner.outside, "compat-skills")),
	);

const prepare = (record: CompatibilityRecord, owner: PackageCliOwner) => {
	if (record.fixture !== "existing-skill-proc-repo") return;
	const skillRoot = join(owner.outside, "compat-skills");
	rmSync(skillRoot, { recursive: true, force: true });
	const installed = join(skillRoot, "archboard");
	mkdirSync(installed, { recursive: true });
	writeFileSync(join(installed, "old.txt"), "old");
};

const heldStateOf = (stdout: string) => {
	try {
		return heldStateSchema.parse(
			z.object({ held: heldStateSchema }).passthrough().parse(JSON.parse(stdout)).held,
		);
	} catch {
		return null;
	}
};

const artifactState = (argv: readonly string[]) =>
	new Map(
		argv.flatMap((token, index) =>
			token === "--out" && argv[index + 1]
				? [
						[
							argv[index + 1]!,
							existsSync(argv[index + 1]!) ? readFileSync(argv[index + 1]!) : null,
						] as const,
					]
				: [],
		),
	);

const artifactCommits = (before: ReadonlyMap<string, Buffer | null>) =>
	[...before].flatMap(([path, bytes]) =>
		existsSync(path) && (bytes === null || !readFileSync(path).equals(bytes)) ? [path] : [],
	);

const localEffects = (
	record: CompatibilityRecord,
	result: PackageRunResult,
	restEffects: readonly string[],
	owner: PackageCliOwner,
) => {
	if (
		record.name === "board-list-here-failure" &&
		result.stderr.startsWith("Standing in github.com/miklschmidt/archboard.\n")
	)
		return ["repository-identity-resolved"];
	if (
		record.name === "promote-binding-resolution-failure" &&
		restEffects.includes("GET /api/boards/info") &&
		!restEffects.some((effect) => effect.startsWith("POST "))
	)
		return ["binding-resolution-failed"];
	if (record.name === "install-skill-late-failure") {
		const installed = join(owner.outside, "compat-skills", "archboard");
		if (
			!existsSync(join(installed, "old.txt")) &&
			existsSync(join(installed, "SKILL.md")) &&
			!existsSync("/proc/AGENTS.md")
		)
			return ["existing-skill-replaced", "repository-doc-not-written"];
	}
	return [];
};

async function closedServerUrl(): Promise<string> {
	const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response() });
	const url = server.url.origin;
	await server.stop(true);
	return url;
}

async function runContext(
	stack: AsyncDisposableStack,
	record: CompatibilityRecord,
	owner: PackageCliOwner,
	observed: string[],
) {
	const http = stack.use(createCliHttpDouble(observed));
	http.setCompatibilityRecord(record.name);
	const runtime: Runtime = { outside: owner.outside, closedUrl: await closedServerUrl() };
	let options: PackageRunOptions = { url: http.url };
	if (record.fixture === "closed-server") options = { url: runtime.closedUrl };
	if (record.fixture === "mock-server-repo-cwd") options = { url: http.url, cwd: checkoutRoot };
	if (record.fixture === "existing-skill-proc-repo") options = {};
	if (record.fixture === "foreign-server") {
		const foreign = Bun.serve({
			hostname: "127.0.0.1",
			port: 0,
			fetch(request) {
				observed.push(`${request.method} ${new URL(request.url).pathname}`);
				return Response.json({ service: "somebody-else", status: "ok" });
			},
		});
		stack.defer(async () => {
			await foreign.stop(true);
		});
		runtime.foreignUrl = foreign.url.origin;
		options = { url: runtime.foreignUrl };
	}
	return { http, runtime, options, argv: argvFor(record, owner) };
}

describe("fixed-base package CLI compatibility", () => {
	for (const record of compatibility.orderedCases) {
		test(
			record.name,
			async () => {
				await using resources = new AsyncDisposableStack();
				const owner = resources.use(createPackageCliOwner());

				const normalObserved: string[] = [];
				const normal = await runContext(resources, record, owner, normalObserved);
				prepare(record, owner);
				const before = artifactState(normal.argv);
				const result = await owner.run(normal.argv, normal.options);
				const diagnostic = packageFailure(result);
				const rest = normal.http.requests.map(
					(request) => `${request.method} ${request.url.pathname}`,
				);
				expect(result.command.slice(1), diagnostic).toEqual(normal.argv);
				expect(result.status, diagnostic).toBe(record.exit);
				expect(result.signal, diagnostic).toBeNull();
				expect(normalize(result.stdout, record, normal.runtime), diagnostic).toBe(record.stdout);
				expect(normalize(result.stderr, record, normal.runtime), diagnostic).toBe(record.stderr);
				expect(heldStateOf(result.stdout), diagnostic).toEqual(record.heldState);
				expect(
					JSON.stringify(normalObserved.filter((event) => event === "GET /health")),
					diagnostic,
				).toBe(JSON.stringify(record.prerequisiteContacts));
				expect(rest, diagnostic).toEqual(record.restEffects);
				expect(localEffects(record, result, rest, owner), diagnostic).toEqual(record.localEffects);
				expect(artifactCommits(before), diagnostic).toEqual(record.artifactCommits);

				const mergedObserved: string[] = [];
				const mergedContext = await runContext(resources, record, owner, mergedObserved);
				prepare(record, owner);
				const merged = await owner.runMerged(
					mergedContext.argv,
					mergedContext.options,
					mergedObserved,
				);
				const mergedDiagnostic = packageFailure(merged);
				const exitEvents = record.mergedEvents.filter((event) => event.kind === "exit");
				expect(exitEvents, mergedDiagnostic).toHaveLength(1);
				const expectedExit = exitEvents[0]!.value;
				const expectedContacts = record.mergedEvents.flatMap((event) =>
					event.kind === "contact" ? [event.value] : [],
				);
				const expectedBytes = record.mergedEvents
					.flatMap((event) =>
						event.kind === "stdout"
							? [record.stdout]
							: event.kind === "stderr-bytes"
								? [event.value]
								: [],
					)
					.join("");
				expect(mergedObserved.slice(0, -1), mergedDiagnostic).toEqual(expectedContacts);
				expect(normalize(merged.merged, record, mergedContext.runtime), mergedDiagnostic).toBe(
					expectedBytes,
				);
				expect(merged.status, mergedDiagnostic).toBe(expectedExit);
				expect(mergedObserved.at(-1), mergedDiagnostic).toBe(`exit:${expectedExit}`);
			},
			30_000,
		);
	}
});
