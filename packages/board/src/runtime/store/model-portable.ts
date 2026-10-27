import { requirePortableClosure } from "#runtime/store/portable-closure.ts";
import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import type { z } from "zod";
import { git } from "@archboard/process/git";
import { ArchitecturePortableBundleSchema } from "#shared/schemas/model-portable.ts";
import { modelRevision } from "#runtime/store/model-files.ts";
import { decodeModel, discoveryFailure } from "#runtime/operations/read/model-read.ts";
import { ArchiveError, type ArchiveContext } from "#runtime/store/model-archive.ts";

type Bundle = z.infer<typeof ArchitecturePortableBundleSchema>;
/**
 * Fingerprint the complete portable intent without retaining another copy of its history.
 * @param bundle The verified portable envelope.
 * @returns Its exact request identity.
 */
function bundleDigest(bundle: Bundle): string {
	return createHash("sha256").update(JSON.stringify(bundle)).digest("hex");
}
/**
 * Decode exact inputs and reject duplicate paths or mismatched fingerprints.
 * @param bundle The portable envelope.
 * @returns The coherent model and its exact bytes.
 */
function portableInputs(bundle: Bundle) {
	const inputs = new Map(
		bundle.inputs.map(({ path, bytes }) => [path, Buffer.from(bytes, "base64")]),
	);
	if (
		inputs.size !== bundle.inputs.length ||
		!isDeepStrictEqual(modelRevision(inputs), bundle.revision)
	)
		throw new ArchiveError(
			"CHECKPOINT_INVALID",
			"Portable inputs do not match their complete fingerprint.",
		);
	const captured = { inputs, revision: bundle.revision, diagnostics: [] };
	const model = discoveryFailure(captured) ?? decodeModel(captured);
	if (!model.success) throw new ArchiveError(model.code, model.diagnostics[0]!.message);
	if (model.manifest.id !== bundle.model)
		throw new ArchiveError(
			"CHECKPOINT_INVALID",
			"The portable model identity disagrees with its manifest.",
		);
	return { inputs, model };
}
/**
 * Capture all archive and retention roots without exporting private ref names.
 * @param context The existing source-backed or private archive.
 * @returns Immutable root identities and a complete prerequisite-free Git bundle.
 */
async function exportPortableHistory(context: ArchiveContext) {
	const refs = (
		(await git(
			context.root,
			["for-each-ref", "--format=%(refname)", "refs/heads/archboard-history", "refs/archboard/"],
			{ maxOutputBytes: Infinity },
		)) ?? ""
	)
		.split("\n")
		.filter(Boolean);
	if (refs.length === 0) return { tips: [], bundle: null };
	const heads = [
		...new Set(
			await Promise.all(refs.map(async (ref) => (await git(context.root, ["rev-parse", ref]))!)),
		),
	];
	const tips = (
		(await git(context.root, ["merge-base", "--independent", ...heads], {
			maxOutputBytes: Infinity,
		})) ?? ""
	)
		.split("\n")
		.filter(Boolean);
	const directory = mkdtempSync(join(tmpdir(), "archboard-export-"));
	try {
		const file = join(directory, "history.bundle");
		await git(context.root, ["bundle", "create", file, ...refs]);
		return { tips, bundle: readFileSync(file).toString("base64") };
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
}
/**
 * Inspect untrusted history in disposable Git storage before exposing objects to a destination.
 * @param bundle The parsed portable envelope.
 * @param work The consumer of the complete inspected closure.
 * @returns The consumer result.
 */
async function withPortableArchive<T>(
	bundle: Bundle,
	work: (context: ArchiveContext) => Promise<T>,
): Promise<T> {
	const { model } = portableInputs(bundle);
	const directory = mkdtempSync(join(tmpdir(), "archboard-portable-"));
	try {
		await git(directory, [
			"init",
			"--bare",
			"--quiet",
			"--template=",
			...(bundle.history.tips[0]?.length === 64 ? ["--object-format=sha256"] : []),
		]);
		const context = { root: directory, vault: ".archboard/vault", sourceRoot: undefined };
		if ((bundle.history.bundle === null) !== (bundle.history.tips.length === 0))
			throw new ArchiveError("CHECKPOINT_INVALID", "Portable history roots and bundle disagree.");
		if (bundle.history.bundle !== null) {
			const file = join(directory, "history.bundle");
			writeFileSync(file, Buffer.from(bundle.history.bundle, "base64"));
			await git(directory, ["bundle", "verify", file]);
			await git(directory, ["bundle", "unbundle", file]);
		}
		await requirePortableClosure(context, bundle.history.tips, model);
		return await work(context);
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
}
/**
 * Copy only verified immutable archive objects without changing any destination ref or worktree.
 * @param source The disposable inspected archive.
 * @param destination The existing destination archive.
 * @param tips The complete imported roots.
 */
async function importPortableObjects(
	source: ArchiveContext,
	destination: ArchiveContext,
	tips: string[],
) {
	if (tips.length === 0) return;
	const ref = `refs/archboard/portable/${randomUUID()}`;
	const file = join(source.root, "verified.bundle");
	for (const [index, tip] of tips.entries()) {
		// oxlint-disable-next-line no-await-in-loop -- build transient export refs in the disposable archive only
		await git(source.root, ["update-ref", `${ref}/${index}`, tip]);
	}
	await git(source.root, ["bundle", "create", file, `--glob=${ref}/*`]);
	await git(destination.root, ["bundle", "unbundle", file]);
}
export {
	bundleDigest,
	portableInputs,
	requirePortableClosure,
	exportPortableHistory,
	withPortableArchive,
	importPortableObjects,
};
