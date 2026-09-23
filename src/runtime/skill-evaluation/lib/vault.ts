// The run's vault as the harness lays it and reads it: the configuration the
// fixture asks for, the fixture's boards written through the CLI so every id
// is one the product minted, and the reads the checks are made from.

import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import {
	addressedVariant,
	SemanticBoardSchema,
	type SemanticBoard,
} from "@/shared/semantic-board/index";
import {
	DEFAULT_SEMANTIC_POLICY,
	SemanticPolicySchema,
	VaultDiagnosticSchema,
	type SemanticPolicy,
	type VaultDiagnostic,
} from "@/shared/semantic-policy/index";
import { archboard, archboardOk, type CliContext } from "@/runtime/skill-evaluation/lib/archboard";
import type { InspectionRequest, RenderRequest } from "@/runtime/skill-evaluation/lib/outcomes";
import { sequentially } from "@/runtime/skill-evaluation/lib/process";
import type { InspectionAttempt, RenderAttempt } from "@/runtime/skill-evaluation/lib/reading";
import {
	FixtureStepSchema,
	type Fixture,
	type FixtureStep,
	type RawFixtureStep,
} from "@/runtime/skill-evaluation/lib/suite";

const FIXTURE_DOING = "laying the evaluation fixture";
const PLACEHOLDER = /^\$node\((.+)\)$/u;

/**
 * The configuration file a fixture asks for: the bundled defaults with the
 * fixture's records merged over them.
 * @param vault The vault.
 * @param policy The fixture's partial policy, if any.
 * @returns The YAML written.
 */
function writeVaultConfiguration(vault: string, policy: Fixture["policy"]): string {
	const merged: SemanticPolicy = {
		levels: policy?.levels ?? DEFAULT_SEMANTIC_POLICY.levels,
		nodeKinds: { ...DEFAULT_SEMANTIC_POLICY.nodeKinds, ...policy?.nodeKinds },
		relationshipKinds: {
			...DEFAULT_SEMANTIC_POLICY.relationshipKinds,
			...policy?.relationshipKinds,
		},
		groups: { ...DEFAULT_SEMANTIC_POLICY.groups, ...policy?.groups },
	};
	const directory = path.join(vault, ".archboard");
	fs.mkdirSync(directory, { recursive: true });
	const text = Bun.YAML.stringify(SemanticPolicySchema.parse(merged));
	fs.writeFileSync(path.join(directory, "config.yaml"), text);
	return text;
}

/**
 * The configuration file's text as it stands.
 * @param vault The vault.
 * @returns The text, or empty when there is none.
 */
function readConfigurationText(vault: string): string {
	const file = path.join(vault, ".archboard", "config.yaml");
	return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
}

/**
 * The policy the configuration file states; the defaults when it cannot be read.
 * @param vault The vault.
 * @returns The policy.
 */
function readPolicy(vault: string): SemanticPolicy {
	const parsed = SemanticPolicySchema.safeParse(
		Bun.YAML.parse(readConfigurationText(vault) || "{}"),
	);
	return parsed.success ? parsed.data : DEFAULT_SEMANTIC_POLICY;
}

const ListingSchema = z
	.object({ boards: z.array(z.object({ name: z.string() }).passthrough()) })
	.passthrough();
const ReadSchema = z.object({ board: SemanticBoardSchema }).passthrough();
const RegisteredSchema = z.object({ repo: z.string() }).passthrough();
const CheckSchema = z.object({ diagnostics: z.array(VaultDiagnosticSchema) }).passthrough();
const InspectionSchema = z
	.object({
		members: z.array(z.object({ name: z.string() }).passthrough()),
		internalEdges: z.array(z.unknown()),
		boundaryEdges: z.array(z.object({ direction: z.string() }).passthrough()),
		neighbors: z.array(z.object({ name: z.string() }).passthrough()),
	})
	.passthrough();

/**
 * One board, read through the CLI.
 * @param cli How to reach the CLI.
 * @param name The board.
 * @returns The family.
 */
async function readBoard(cli: CliContext, name: string): Promise<SemanticBoard> {
	return ReadSchema.parse(await archboardOk(cli, ["semantic", "show", name])).board;
}

/**
 * Every board in the vault, read through the CLI.
 * @param cli How to reach the CLI.
 * @returns Boards by name.
 */
async function readVault(cli: CliContext): Promise<Map<string, SemanticBoard>> {
	const listing = ListingSchema.parse(await archboardOk(cli, ["semantic"]));
	const boards = await Promise.all(
		listing.boards.map(async (entry) => [entry.name, await readBoard(cli, entry.name)] as const),
	);
	return new Map(boards);
}

/**
 * What `archboard check` reports, whatever it exits with.
 * @param cli How to reach the CLI.
 * @returns The diagnostics.
 */
async function vaultDiagnostics(cli: CliContext): Promise<VaultDiagnostic[]> {
	const answer = await archboard(cli, ["check"]);
	const parsed = CheckSchema.safeParse(answer.json);
	if (parsed.success) return parsed.data.diagnostics;
	return [
		{
			severity: "error",
			code: "CHECK_UNREADABLE",
			file: "-",
			message: `archboard check answered nothing readable (exit ${answer.exitCode}): ${answer.stderr.trim()}`,
		},
	];
}

/**
 * The last line of a failure's stderr, for a one-line detail.
 * @param stderr The stderr.
 * @returns The line.
 */
function lastLine(stderr: string): string {
	return stderr.trim().split("\n").at(-1) ?? "";
}

/**
 * Draws one render a check asked for.
 * @param cli How to reach the CLI.
 * @param request What to draw.
 * @param file Where the SVG goes.
 * @returns The attempt.
 */
async function renderBoard(
	cli: CliContext,
	request: RenderRequest,
	file: string,
): Promise<RenderAttempt> {
	const selectors = [
		...(request.variant === undefined ? [] : ["--variant", request.variant]),
		...(request.view === undefined ? [] : ["--view", request.view]),
	];
	const answer = await archboard(cli, [
		"semantic",
		"render",
		request.board,
		"--out",
		file,
		...selectors,
	]);
	const ok = answer.exitCode === 0 && fs.existsSync(file);
	return {
		...request,
		ok,
		detail: ok
			? `drawn to ${path.basename(file)}`
			: `render failed (exit ${answer.exitCode}): ${lastLine(answer.stderr)}`,
		file: ok ? file : undefined,
	};
}

/**
 * Runs one group inspection a check asked for.
 * @param cli How to reach the CLI.
 * @param request What to inspect.
 * @returns The attempt.
 */
async function inspectGroup(
	cli: CliContext,
	request: InspectionRequest,
): Promise<InspectionAttempt> {
	const selectors = request.variant === undefined ? [] : ["--variant", request.variant];
	const answer = await archboard(cli, [
		"semantic",
		"inspect",
		request.board,
		"--group",
		request.group,
		...selectors,
	]);
	const parsed = InspectionSchema.safeParse(answer.json);
	return {
		...request,
		result: parsed.success ? parsed.data : null,
		detail: parsed.success
			? "inspected"
			: `inspect failed (exit ${answer.exitCode}): ${lastLine(answer.stderr)}`,
	};
}

/** What a placeholder resolves against. */
interface PlaceholderScope {
	readonly repo: string | null;
	readonly board: SemanticBoard | null;
	readonly variant: string | undefined;
}

/**
 * A node's id on the targeted variant, by name: the variant the fixture step
 * names, or the one its write lands on when it names none.
 * @param name The node's name.
 * @param scope What to resolve against.
 * @returns The id.
 */
function nodeId(name: string, scope: PlaceholderScope): string {
	const addressed = scope.board === null ? null : addressedVariant(scope.board, scope.variant);
	const variant = addressed?.ok === true ? addressed.variant : undefined;
	const node = variant?.content.nodes.find((candidate) => candidate.name === name);
	if (node === undefined)
		throw new Error(`the fixture names $node(${name}) which is not on the board`);
	return node.id;
}

/**
 * One string placeholder resolved: `$FLASK` to the registered identity,
 * `$node(Name)` to that node's id on the targeted variant.
 * @param text The string.
 * @param scope What to resolve against.
 * @returns The resolved string.
 */
function resolveString(text: string, scope: PlaceholderScope): string {
	if (text === "$FLASK") {
		if (scope.repo === null)
			throw new Error("the fixture binds to $FLASK but did not register the checkout");
		return scope.repo;
	}
	const match = PLACEHOLDER.exec(text);
	return match?.[1] === undefined ? text : nodeId(match[1], scope);
}

/**
 * A fixture value with every placeholder resolved.
 * @param value The value.
 * @param scope What to resolve against.
 * @returns The resolved value.
 */
function resolvePlaceholders(value: unknown, scope: PlaceholderScope): unknown {
	if (typeof value === "string") return resolveString(value, scope);
	if (Array.isArray(value)) return value.map((entry) => resolvePlaceholders(entry, scope));
	if (typeof value === "object" && value !== null) {
		return Object.fromEntries(
			Object.entries(value).map(([key, entry]) => [key, resolvePlaceholders(entry, scope)]),
		);
	}
	return value;
}

/** The CLI call for one step. */
interface StepCall {
	readonly args: string[];
	readonly stdin?: string | undefined;
}

/**
 * `--flag value` when the value is stated.
 * @param flag The flag.
 * @param value The value, if any.
 * @returns The pair, or nothing.
 */
function flagged(flag: string, value: string | undefined): string[] {
	return value === undefined ? [] : [flag, value];
}

type StepOf<K extends FixtureStep["op"]> = Extract<FixtureStep, { op: K }>;

/**
 * The semantic new call.
 * @param step The step.
 * @returns The call.
 */
function newCall(step: StepOf<"new">): StepCall {
	return {
		args: ["semantic", "new", step.board, "--doing", FIXTURE_DOING],
		stdin: JSON.stringify(step.input),
	};
}

/**
 * The semantic edit call.
 * @param step The step.
 * @param expect The --expect-version pair.
 * @returns The call.
 */
function editCall(step: StepOf<"edit">, expect: readonly string[]): StepCall {
	return {
		args: ["semantic", "edit", step.board, "--doing", FIXTURE_DOING, ...expect],
		stdin: JSON.stringify(step.input),
	};
}

/**
 * The semantic branch call.
 * @param step The step.
 * @param expect The --expect-version pair.
 * @returns The call.
 */
function branchCall(step: StepOf<"branch">, expect: readonly string[]): StepCall {
	return {
		args: [
			"semantic",
			"branch",
			step.board,
			"--as",
			step.as,
			...flagged("--from", step.from),
			...flagged("--summary", step.summary),
			"--doing",
			FIXTURE_DOING,
			...expect,
		],
	};
}

/**
 * The semantic resolve call.
 * @param step The step.
 * @param expect The --expect-version pair.
 * @returns The call.
 */
function resolveCall(step: StepOf<"resolve">, expect: readonly string[]): StepCall {
	return {
		args: [
			"semantic",
			"resolve",
			step.board,
			"--variant",
			step.variant,
			"--doing",
			FIXTURE_DOING,
			...expect,
		],
		stdin: JSON.stringify(step.input),
	};
}

/**
 * The semantic adopt call.
 * @param step The step.
 * @param expect The --expect-version pair.
 * @returns The call.
 */
function adoptCall(step: StepOf<"adopt">, expect: readonly string[]): StepCall {
	return {
		args: [
			"semantic",
			"adopt",
			step.board,
			"--variant",
			step.variant,
			...flagged("--reason", step.reason),
			"--doing",
			FIXTURE_DOING,
			...expect,
		],
	};
}

/**
 * The CLI call of one fixture step, against the version it was read at.
 * @param step The step.
 * @param version The board's version, when the board exists.
 * @returns The arguments and the JSON to send, if any.
 */
function stepCommand(step: FixtureStep, version: number | null): StepCall {
	const expect = version === null ? [] : ["--expect-version", String(version)];
	switch (step.op) {
		case "new":
			return newCall(step);
		case "edit":
			return editCall(step, expect);
		case "branch":
			return branchCall(step, expect);
		case "resolve":
			return resolveCall(step, expect);
		default:
			return adoptCall(step, expect);
	}
}

/**
 * The variant a step targets, for placeholder resolution.
 * @param step The step.
 * @returns The variant selector, or undefined for the current one.
 */
function targetVariant(step: RawFixtureStep): string | undefined {
	if (step.op === "edit")
		return typeof step.input["variant"] === "string" ? step.input["variant"] : undefined;
	return step.op === "resolve" ? step.variant : undefined;
}

/**
 * Lays one step: reads the board it targets, resolves the placeholders, and
 * writes against the version it read.
 * @param cli How to reach the CLI.
 * @param step The step.
 * @param repo The registered identity, if any.
 */
async function layStep(cli: CliContext, step: RawFixtureStep, repo: string | null): Promise<void> {
	const board = step.op === "new" ? null : await readBoard(cli, step.board);
	const resolved = FixtureStepSchema.parse(
		resolvePlaceholders(step, { repo, board, variant: targetVariant(step) }),
	);
	const call = stepCommand(resolved, board?.version ?? null);
	await archboardOk(cli, call.args, call.stdin);
}

/**
 * Lays one fixture: the registered checkout, then each step in order, each
 * against the version the previous one left.
 * @param cli How to reach the CLI.
 * @param fixture The fixture.
 * @param flask The checkout to register.
 * @returns The registered identity, or null when the fixture registers none.
 */
async function layFixture(
	cli: CliContext,
	fixture: Fixture,
	flask: string,
): Promise<string | null> {
	const repo = fixture.registerRepo
		? RegisteredSchema.parse(await archboardOk(cli, ["repo", "add", flask])).repo
		: null;
	await sequentially(fixture.steps, (step) => layStep(cli, step, repo));
	return repo;
}

/**
 * Writes every board of a vault reading to a directory, one file per board.
 * @param boards The boards.
 * @param directory Where.
 */
function writeBoards(boards: ReadonlyMap<string, SemanticBoard>, directory: string): void {
	fs.mkdirSync(directory, { recursive: true });
	for (const [name, board] of boards) {
		fs.writeFileSync(
			path.join(directory, `${name.replaceAll(/[^A-Za-z0-9._-]+/gu, "_")}.json`),
			`${JSON.stringify(board, null, "\t")}\n`,
		);
	}
}

export {
	inspectGroup,
	layFixture,
	readBoard,
	readConfigurationText,
	readPolicy,
	readVault,
	renderBoard,
	resolvePlaceholders,
	stepCommand,
	vaultDiagnostics,
	writeBoards,
	writeVaultConfiguration,
	type PlaceholderScope,
};
