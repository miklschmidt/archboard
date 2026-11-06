// The vault side of a move: one claimed `model edit` intent through the CLI that rebinds every
// module binding and re-anchors every relationship and flow step under a moved path
// (skills/archboard/references/canonical-models.md). The claim grows when a refusal names more
// affected subjects, and it is released at the end, whatever happened.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { z } from "zod";

import {
	ArchitectureClaimResultSchema,
	ArchitectureModelReadSchema,
	ArchitectureModuleEditResultSchema,
	type ArchitectureModuleEditSchema,
} from "@archboard/model/contract";
import { repoIdentityAt } from "@archboard/workspace/checkouts";

// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no # imports; sibling imports stay relative
import type { MoveMap } from "./layout.ts";

const WRITER = "move-source";

/** The current model, as `archboard model read` answers it. */
type Reading = Extract<z.infer<typeof ArchitectureModelReadSchema>, { success: true }>;
/** A flow step of a reading. */
type Step = Reading["collections"][number]["flows"][number]["steps"][number];
/** A binding or an anchor. */
interface Location {
	repo: string;
	path: string;
	commit?: string | undefined;
}
/** A statement of an intent, of the three kinds a move writes. */
type Change = Extract<
	Extract<z.input<typeof ArchitectureModuleEditSchema>, { changes: unknown }>["changes"][number],
	{ type: "edit-module" | "edit-relationship" | "edit-step" }
>;
/** What the edit answers. */
type EditAnswer = z.infer<typeof ArchitectureModuleEditResultSchema>;

/** What deriving the intent needs. */
interface VaultContext {
	repo: string;
	map: MoveMap;
	bindings: Readonly<Record<string, string>>;
	problems: string[];
}

/**
 * Run one archboard command of the checkout and parse its JSON answer. The CLI adds the vault it
 * discovered, which the shared schemas do not hold.
 * @param root The checkout.
 * @param args The command's arguments, `-C` added.
 * @param schema The schema of the answer.
 * @param request The JSON request it reads, if any.
 * @returns The parsed answer.
 * @throws {Error} When the command prints no JSON.
 */
function archboard<T extends z.ZodType>(
	root: string,
	args: string[],
	schema: T,
	request?: unknown,
): z.infer<T> {
	const directory = mkdtempSync(join(tmpdir(), "move-source-"));
	const input = join(directory, "request.json");
	try {
		const command = [join(root, "bin/archboard"), ...args, "-C", root];
		if (request !== undefined) {
			writeFileSync(input, JSON.stringify(request));
			command.push("--input", input);
		}
		const result = Bun.spawnSync(command, { cwd: root, stdout: "pipe", stderr: "pipe" });
		const output = result.stdout.toString();
		if (!output.trimStart().startsWith("{")) throw new Error(result.stderr.toString() || output);
		return schema.parse(withoutVault(JSON.parse(output)));
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
}

/**
 * A CLI answer without the vault that the CLI adds to it.
 * @param answer The parsed answer.
 * @returns The answer the shared runtime gave.
 */
function withoutVault(answer: unknown): unknown {
	if (typeof answer !== "object" || answer === null || !("vault" in answer)) return answer;
	const { vault: _vault, ...rest } = answer;
	return rest;
}

/**
 * Read the current model of the checkout's vault.
 * @param root The checkout.
 * @returns The reading.
 * @throws {Error} When the model cannot be read.
 */
function readModel(root: string): Reading {
	const reading = archboard(root, ["model", "read"], ArchitectureModelReadSchema);
	if (!reading.success) throw new Error(`model read refused: ${JSON.stringify(reading)}`);
	return reading;
}

/**
 * Whether a location names this checkout's working files, which a move changes.
 * @param location A binding or an anchor.
 * @param repo The checkout's identity.
 * @returns Whether it follows the move. A location pinned to a commit keeps its path.
 */
function followsMove(location: Location | undefined, repo: string): location is Location {
	return location?.repo === repo && location.commit === undefined;
}

/**
 * The new place of a location of this checkout, when it moves.
 * @param location A binding or an anchor.
 * @param context The checkout's identity, the moves, the binding overrides and the problems.
 * @returns The location at its new path, or undefined when it stays.
 */
function moved<L extends Location>(location: L | undefined, context: VaultContext): L | undefined {
	if (!followsMove(location, context.repo)) return undefined;
	const next = context.bindings[location.path] ?? context.map.path(location.path);
	if (next === undefined) {
		context.problems.push(`${location.path} is bound, and its files part: name it in bindings`);
	}
	return next === undefined || next === location.path ? undefined : { ...location, path: next };
}

/**
 * Every step of a list, with the steps that loops and decisions hold.
 * @param steps The steps.
 * @returns Them all, depth first.
 */
function allSteps(steps: readonly Step[]): Step[] {
	return steps.flatMap((step) => [
		step,
		...allSteps("steps" in step ? step.steps : []),
		...allSteps(
			"alternatives" in step ? step.alternatives.flatMap((alternative) => alternative.steps) : [],
		),
	]);
}

/**
 * The statements that rebind and re-anchor everything under a moved path.
 * @param reading The current model.
 * @param context What deriving the intent needs.
 * @returns The statements, modules first.
 */
function vaultChanges(reading: Reading, context: VaultContext): Change[] {
	const modules = reading.modules.flatMap((module): Change[] => {
		const binding = moved(module.binding, context);
		return binding ? [{ type: "edit-module", subject: module.id, set: { binding } }] : [];
	});
	const relationships = reading.relationships.flatMap((relationship): Change[] => {
		const anchor = moved(relationship.anchor, context);
		return anchor ? [{ type: "edit-relationship", subject: relationship.id, set: { anchor } }] : [];
	});
	const flows = reading.collections.flatMap((collection) => collection.flows);
	const steps = allSteps(flows.flatMap((flow) => flow.steps)).flatMap((step): Change[] => {
		const anchor = moved("anchor" in step ? step.anchor : undefined, context);
		return anchor ? [{ type: "edit-step", subject: step.id, set: { anchor } }] : [];
	});
	return [...modules, ...relationships, ...steps];
}

/**
 * The context of the checkout's vault.
 * @param root The checkout.
 * @param map The moves.
 * @param bindings The reviewed new paths of bound directories whose files part.
 * @returns The context.
 */
async function vaultContext(
	root: string,
	map: MoveMap,
	bindings: Readonly<Record<string, string>>,
): Promise<VaultContext> {
	return { repo: await repoIdentityAt(root), map, bindings, problems: [] };
}

/**
 * The subjects a refused edit names that a claim lacks.
 * @param answer The edit's answer.
 * @param claimed The subjects the claim holds.
 * @returns The missing subjects, or none when the refusal is not about the claim's scope.
 */
function missingSubjects(answer: EditAnswer, claimed: readonly string[]): string[] {
	if (answer.success || answer.code !== "CLAIM_REQUIRED") return [];
	const named = answer.diagnostics.flatMap((diagnostic) => diagnostic.subjects ?? []);
	return [...new Set(named)].filter((subject) => !claimed.includes(subject));
}

/**
 * Claim the subjects, apply the intent, grow the claim while a refusal names more subjects, and
 * release the claim.
 * @param root The checkout.
 * @param reading The current model the intent is built on.
 * @param changes The statements.
 * @param operation The operation identity, which each retry extends.
 * @returns The edit's answer.
 */
function applyVaultChanges(
	root: string,
	reading: Reading,
	changes: Change[],
	operation: string,
): EditAnswer {
	const target = { model: reading.manifest.id, state: reading.manifest.current?.id ?? null };
	let subjects = [...new Set(changes.map((change) => change.subject))];
	let claim = claimSubjects(root, target, subjects);
	try {
		for (let attempt = 1; ; attempt += 1) {
			const request = {
				target,
				expectedRevision: reading.revision,
				operationId: `${operation}-${attempt}`,
				writer: WRITER,
				claim,
				changes,
			};
			const doing = ["--doing", "rebinding moved source paths"];
			const answer = archboard(
				root,
				["model", "edit", ...doing],
				ArchitectureModuleEditResultSchema,
				request,
			);
			const missing = missingSubjects(answer, subjects);
			if (missing.length === 0) return answer;
			release(root, claim);
			subjects = [...subjects, ...missing];
			claim = claimSubjects(root, target, subjects);
		}
	} finally {
		release(root, claim);
	}
}

/**
 * Claim subjects for this writer.
 * @param root The checkout.
 * @param target The model and its current state.
 * @param subjects The subjects.
 * @returns The claim's identity.
 * @throws {Error} When the claim is refused.
 */
function claimSubjects(root: string, target: unknown, subjects: readonly string[]): string {
	const reason = "Rebind the code bindings and anchors of moved source files";
	const request = { target, writer: WRITER, reason, subjects };
	const answer = archboard(root, ["model", "claim"], ArchitectureClaimResultSchema, request);
	if (!answer.success) throw new Error(`model claim refused: ${JSON.stringify(answer)}`);
	return answer.claim.id;
}

/**
 * Release this writer's claim.
 * @param root The checkout.
 * @param claim The claim's identity.
 */
function release(root: string, claim: string): void {
	const command = [join(root, "bin/archboard"), "model", "release", "-C", root];
	const directory = mkdtempSync(join(tmpdir(), "move-source-"));
	try {
		writeFileSync(join(directory, "release.json"), JSON.stringify({ claim, writer: WRITER }));
		Bun.spawnSync([...command, "--input", join(directory, "release.json")], { cwd: root });
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
}

/**
 * Restart the checkout's server, so that it runs the moved source before the vault is written.
 * @param root The checkout.
 * @throws {Error} When the restart fails.
 */
function restartServer(root: string): void {
	const result = Bun.spawnSync([join(root, "bin/archboard"), "restart", "-C", root], {
		cwd: root,
		stdout: "inherit",
		stderr: "inherit",
	});
	if (result.exitCode !== 0) throw new Error("archboard restart failed");
}

export {
	applyVaultChanges,
	readModel,
	restartServer,
	vaultChanges,
	vaultContext,
	type Change,
	type Reading,
};
