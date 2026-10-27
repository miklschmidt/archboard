import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { ArchitectureModelReadSchema } from "@archboard/board/model";
import { modelContent, inspectGroup as inspectSemanticGroup } from "@archboard/board/content";
import {
	DEFAULT_SEMANTIC_POLICY,
	SemanticPolicySchema,
	VaultDiagnosticSchema,
	type SemanticPolicy,
} from "@archboard/board/policy";
import type { SemanticVariant } from "@archboard/board/document";
import type {
	EvaluationArchitecture as SemanticBoard,
	InspectionAttempt,
	RenderAttempt,
} from "#runtime/rules/outcomes/reading.ts";
import { archboard, archboardOk, type CliContext } from "#runtime/processes/archboard.ts";
import type { Fixture } from "#runtime/schemas/fixture.ts";
import type { InspectionRequest, RenderRequest } from "#runtime/rules/outcomes/outcomes.ts";
type Model = Extract<z.infer<typeof ArchitectureModelReadSchema>, { success: true }>;
type VaultDiagnostic = z.infer<typeof VaultDiagnosticSchema>;
function fixturePolicy(policy: Fixture["policy"]): SemanticPolicy {
	return SemanticPolicySchema.parse({
		...DEFAULT_SEMANTIC_POLICY,
		...policy,
		nodeKinds: { ...DEFAULT_SEMANTIC_POLICY.nodeKinds, ...policy?.nodeKinds },
		relationshipKinds: {
			...DEFAULT_SEMANTIC_POLICY.relationshipKinds,
			...policy?.relationshipKinds,
		},
		groups: { ...DEFAULT_SEMANTIC_POLICY.groups, ...policy?.groups },
	});
}
function writeVaultConfiguration(vault: string, policy: Fixture["policy"]): string {
	const file = path.join(vault, ".archboard/config.yaml");
	fs.mkdirSync(path.dirname(file), { recursive: true });
	const text = Bun.YAML.stringify(fixturePolicy(policy));
	fs.writeFileSync(file, text);
	return text;
}
function readConfigurationText(vault: string): string {
	const file = path.join(vault, ".archboard/config.yaml");
	return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
}
function readPolicy(vault: string): SemanticPolicy {
	return SemanticPolicySchema.parse(Bun.YAML.parse(readConfigurationText(vault)));
}
/**
 * Read complete canonical meaning through the same CLI that the author uses.
 * @param cli The isolated invocation context.
 * @param state An optional exact state selector.
 * @returns The coherent canonical reading.
 */
async function readModel(cli: CliContext, state?: string): Promise<Model> {
	const model = ArchitectureModelReadSchema.parse(
		await archboardOk(cli, ["model", "read", ...(state === undefined ? [] : ["--state", state])]),
	);
	if (!model.success) throw new Error(JSON.stringify(model));
	return model;
}
/**
 * Adapt canonical semantic content to existing evaluation comparisons, without a board document or level.
 * @param model The coherent public model.
 * @returns Its exact state and semantic content.
 */
function evaluationState(model: Model): SemanticVariant {
	const state = model.selectedState;
	return {
		id: state?.id ?? model.manifest.id,
		name: state?.name ?? model.manifest.name,
		lifecycle: state?.lifecycle ?? "draft",
		...(state?.predecessor == null ? {} : { parent: state.predecessor }),
		summary: state?.summary,
		documents: state?.documents,
		content: modelContent(model),
	};
}
/**
 * Capture current architecture and independent proposals for deterministic outcomes.
 * @param cli The isolated command context.
 * @returns One derived evaluation record for the one live model.
 */
async function readVault(cli: CliContext): Promise<Map<string, SemanticBoard>> {
	const model = await readModel(cli);
	const proposals = await Promise.all(
		model.proposals.map((proposal) => readModel(cli, proposal.id)),
	);
	const variants = [
		...(model.manifest.current === null ? [] : [evaluationState(model)]),
		...proposals.map(evaluationState),
	];
	const board: SemanticBoard = {
		id: model.manifest.id,
		name: model.manifest.name,
		current: model.manifest.current?.id,
		variants,
		views: [],
		revision: model.revision.digest,
		architecture: model,
	};
	return new Map([[board.name, board]]);
}
async function readBoard(cli: CliContext, name: string): Promise<SemanticBoard> {
	const vault = await readVault(cli);
	const model = vault.get(name);
	if (model === undefined) throw new Error(`The model ${name} is unavailable.`);
	return model;
}
async function vaultDiagnostics(cli: CliContext): Promise<VaultDiagnostic[]> {
	const answer = await archboard(cli, ["check", "semantics"]);
	return z
		.object({ semantics: z.object({ diagnostics: z.array(VaultDiagnosticSchema) }) })
		.parse(answer.json).semantics.diagnostics;
}
async function renderBoard(
	cli: CliContext,
	request: RenderRequest,
	directory: string,
): Promise<RenderAttempt> {
	const file = path.join(directory, `${request.board.replaceAll(/[^A-Za-z0-9._-]+/gu, "_")}.svg`);
	fs.mkdirSync(directory, { recursive: true });
	const answer = await archboard(cli, [
		"model",
		"render",
		...(request.variant === undefined ? [] : ["--state", request.variant]),
		"--out",
		file,
	]);
	return {
		...request,
		ok: answer.exitCode === 0,
		detail: answer.exitCode === 0 ? "Rendered the canonical reading." : answer.stderr,
		file,
	};
}
async function inspectGroup(
	cli: CliContext,
	request: InspectionRequest,
): Promise<InspectionAttempt> {
	const model = await readModel(cli, request.variant);
	const group = inspectSemanticGroup(modelContent(model), request.group);
	return { ...request, result: group, detail: "Inspected canonical group membership." };
}
/**
 * Seed authored canonical fixture inputs before the local author starts.
 * @param cli The isolated CLI context.
 * @param fixture The authored fixture inputs.
 * @param flask The disposable source checkout.
 * @param _home The disposable author home.
 * @returns The registered repository identity when requested.
 */
async function layFixture(
	cli: CliContext,
	fixture: Fixture,
	flask: string,
	_home: string,
): Promise<string | null> {
	if (fixture.steps.length !== 0 || fixture.talk !== undefined)
		throw new Error("Legacy fixture authoring is retired. Supply canonical inputs.");
	const repo = fixture.registerRepo
		? z.object({ repo: z.string() }).parse(await archboardOk(cli, ["repo", "add", flask])).repo
		: null;
	const vault = path.join(flask, ".archboard/vault");
	for (const [file, text] of Object.entries(fixture.inputs)) {
		if (path.isAbsolute(file) || file.split(/[\\/]/u).some((part) => part === ".."))
			throw new Error("A fixture input must remain in its vault.");
		fs.mkdirSync(path.dirname(path.join(vault, file)), { recursive: true });
		fs.writeFileSync(
			path.join(vault, file),
			text.replaceAll("$FLASK", repo ?? "github.com/pallets/flask"),
		);
	}
	await readModel(cli);
	return repo;
}
async function forgetCheckout(cli: CliContext, flask: string): Promise<void> {
	await archboardOk(cli, ["repo", "forget", flask]);
}
function writeBoards(boards: ReadonlyMap<string, SemanticBoard>, directory: string): void {
	fs.mkdirSync(directory, { recursive: true });
	for (const [name, record] of boards)
		fs.writeFileSync(
			path.join(directory, `${name.replaceAll(/[^A-Za-z0-9._-]+/gu, "_")}.json`),
			JSON.stringify(record, null, 2) + "\n",
		);
}
export {
	forgetCheckout,
	inspectGroup,
	layFixture,
	readBoard,
	readConfigurationText,
	readPolicy,
	readVault,
	renderBoard,
	vaultDiagnostics,
	writeBoards,
	fixturePolicy,
	writeVaultConfiguration,
};
