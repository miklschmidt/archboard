import { resolveLocalCodeTarget, snapshotCheckoutAccess } from "@archboard/code-binding/resolution";
import type { LocalCodeTarget } from "@archboard/code-binding/resolution";
import type { CodeBinding } from "@archboard/code-binding/bindings";
import { git, GitCommandError } from "@archboard/process/git";
import type { ArchitectureModel } from "#shared/schemas/model.ts";
import { relative } from "node:path";

/**
 * Require the opened path and resolved link target to match retained source.
 * @param binding The effective source commit and authored path.
 * @param target The existing resolver's canonical target.
 */
async function requireUnchangedSource(binding: CodeBinding, target: LocalCodeTarget) {
	const path = relative(target.root, target.target).replaceAll("\\", "/");
	const commit = binding.commit!;
	await git(target.root, [
		"cat-file",
		"-e",
		path === "" ? `${commit}^{tree}` : `${commit}:${path}`,
	]);
	const paths = [target.path, path].map((value) => `:(literal)${value === "" ? "." : value}`);
	paths.push(":(exclude,literal).archboard/vault");
	await git(target.root, ["diff", "--quiet", commit, "--", ...paths]);
	const untracked = await git(target.root, [
		"ls-files",
		"--others",
		"--exclude-standard",
		"--",
		...paths,
	]);
	if (untracked !== undefined) throw new Error("The bound source contains untracked files.");
}

/**
 * Require an exact retained source association when the binding names no commit.
 * @param model The coherent current or retained architecture.
 * @param binding The authored source binding.
 * @returns The effective binding or the unavailable source explanation.
 */
function sourceBinding(model: ArchitectureModel, binding: CodeBinding) {
	if (binding.commit !== undefined) return { binding };
	const evidence = model.sourceEvidence?.find((source) => source.repo === binding.repo);
	if (evidence === undefined)
		return {
			error:
				"Restore the recorded source revision. Retained architecture does not preserve source code.",
		};
	if (evidence.status !== "available") return { error: evidence.recovery! };
	if (evidence.commit === null)
		return { error: "The retained source has no committed revision to open." };
	return { binding: { ...binding, commit: evidence.commit } };
}

/**
 * Refuse changed working files at an otherwise matching historical source commit.
 * @param binding The effective exact source binding.
 * @param target The resolver's existing local target.
 * @returns The exact local target or a source refusal.
 */
async function historicalTarget(binding: CodeBinding, target: LocalCodeTarget) {
	if (target.otherRef !== undefined)
		return {
			ok: false as const,
			code: "CHECKOUT_ON_OTHER_REF",
			error: `The historical binding names ${target.otherRef.named}, but the checkout is on ${target.otherRef.checkedOut}. Open the exact source revision separately.`,
		};
	try {
		await requireUnchangedSource(binding, target);
	} catch (error) {
		if (error instanceof GitCommandError && error.failure !== "exit") throw error;
		return {
			ok: false as const,
			code: "SOURCE_UNAVAILABLE",
			error:
				"The local source differs from the retained revision. Restore the exact source separately before opening it.",
		};
	}
	return target;
}

/**
 * Resolve code through the existing resolver and refuse substitutes for retained source.
 * @param vault The explicitly addressed architecture vault.
 * @param model The coherent current or retained reading and selected module.
 * @returns The effective binding and its available target or actionable refusal.
 */
async function modelCodeTarget(vault: string, model: ArchitectureModel) {
	const binding = model.modules.find((subject) => subject.id === model.selectedModule)?.binding;
	if (binding === undefined)
		return {
			codeTarget: {
				ok: false as const,
				code: "BINDING_UNAVAILABLE",
				error: "Select a module with a code binding.",
			},
		};
	const source = readingBinding(model, binding);
	if (source.binding === undefined)
		return {
			codeBinding: binding,
			codeTarget: { ok: false as const, code: "SOURCE_UNAVAILABLE", error: source.error },
		};
	const codeBinding = source.binding;
	const codeTarget = resolveLocalCodeTarget(
		codeBinding,
		await snapshotCheckoutAccess({ vault, bindings: [codeBinding] }),
	);
	return { codeBinding, codeTarget: await availableCodeTarget(model, codeBinding, codeTarget) };
}

/**
 * Apply exact source requirements only to retained architecture.
 * @param model The coherent current or retained reading.
 * @param binding The effective source binding.
 * @param target The existing resolver result.
 * @returns The original current result or exact historical resolution.
 */
async function availableCodeTarget(
	model: ArchitectureModel,
	binding: CodeBinding,
	target: ReturnType<typeof resolveLocalCodeTarget>,
) {
	if (!target.ok) return target;
	const historical =
		model.checkpoint !== undefined || model.migrationPreview?.selected !== undefined;
	return historical ? historicalTarget(binding, target) : target;
}

export { modelCodeTarget };

/**
 * Keep unpinned legacy evidence unavailable rather than opening present-day source.
 * @param model The requested original or canonical reading.
 * @param binding Its authored code evidence.
 * @returns Exact original evidence or the existing canonical source resolution.
 */
function readingBinding(model: ArchitectureModel, binding: CodeBinding) {
	if (model.migrationPreview?.selected !== undefined)
		return binding.commit === undefined
			? {
					error:
						"This original legacy reading has no pinned source revision. Preserve its original binding and restore exact source evidence before opening code.",
				}
			: { binding };
	return model.checkpoint === undefined ? { binding } : sourceBinding(model, binding);
}
