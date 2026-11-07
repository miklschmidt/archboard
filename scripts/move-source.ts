// Move source files to the behavior-first layout (ADR 0075, TASK-582.03) the same way every time.
//
//   bun scripts/move-source.ts plan <path>... [--overrides <file>]   print a manifest to review
//   bun scripts/move-source.ts apply <manifest> [--dry-run]           move, rewrite, rebind
//   bun scripts/move-source.ts rebind <manifest>                      rebind after the moves
//
// A plan proposes the default move for every file under the paths (`<area>/<role>/<b…>/<file>`
// becomes `<area>/<b…>/<role>/<file>`) and applies the overrides, a JSON object of new-layout
// path prefixes to new prefixes. A key in a workspace's `src/` also applies to its `tests/`. The
// manifest holds `moves`, the `bindings` proposed for bound directories whose files part, and
// `proposals`, deeper places for unbound files whose importers all sit in one sub-behavior. A
// person reviews it: only `moves` and `bindings` are applied.
//
// Apply checks everything before it changes anything. It runs `git mv`, rewrites `#` aliases,
// relative paths, `exports` and repository paths (never in backlog/, docs/design/*.md,
// docs/adr/ or the vault), restarts the server and writes one claimed `model edit` intent.
// A dry run prints what it would do and changes nothing. When the vault refuses after the files
// moved, `rebind` writes the vault intent again from the moved checkout.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";

import { SOURCE_CHECKOUT } from "@archboard/workspace/source-checkout";
import { z } from "zod";

import {
	areaPathOf,
	defaultMove,
	layoutProblem,
	MoveMap,
	overridden,
	ROLES,
	startsAt,
	type AreaPath,
	type Move,
	// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no # imports; sibling imports stay relative
} from "./move-source/layout.ts";
import {
	aliasImports,
	movedReferences,
	rewriteAliases,
	rewriteExports,
	rewriteRelatives,
	rewriteRepositoryPaths,
	workspaceOf,
	// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no # imports; sibling imports stay relative
} from "./move-source/rewrite.ts";
import {
	applyVaultChanges,
	readModel,
	restartServer,
	vaultChanges,
	vaultContext,
	type Change,
	type Reading,
	// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no # imports; sibling imports stay relative
} from "./move-source/vault.ts";

const root = SOURCE_CHECKOUT;

/** A reviewed manifest. */
const ManifestSchema = z.object({
	moves: z.array(z.object({ from: z.string(), to: z.string() })),
	bindings: z.record(z.string(), z.string()).default({}),
	proposals: z.array(z.unknown()).optional(),
});
type Manifest = z.infer<typeof ManifestSchema>;
/** Overrides: new-layout path prefixes to new prefixes. */
const OverridesSchema = z.record(z.string(), z.string());

/** The code whose relative paths and repository paths follow a move. */
const CODE = /\.(?:[cm]?tsx?|[cm]?js)$/u;
/** The files whose `#` aliases follow a move. */
const ALIASED = /\.(?:[cm]?tsx?|css)$/u;
/** The other text files, whose moved repository paths are only reported. */
const TEXT = /\.(?:md|jsonc?|ya?ml|toml|txt|nix|sh)$/u;
/** The config and doc files whose repository paths follow a move (doc-003, section 3). */
const LISTED =
	/^(?:vite\.config\.ts|\.oxlintrc(?:\.tests)?\.jsonc|components\.json|package\.json|docs\/readme\/assets\.json|docs\/agents\/(?:boundaries|frontend|test-suite)\.md|(?:packages|apps)\/[^/]+\/README\.md)$/u;
/** What no move rewrites: records of the past and the vault, which the CLI writes. */
const EXCLUDED =
	/^(?:backlog\/|docs\/adr\/|docs\/design\/[^/]+\.md$|\.archboard\/|node_modules\/)/u;

/**
 * The files Git tracks in the checkout.
 * @returns Their repository paths.
 */
function trackedFiles(): string[] {
	const result = Bun.spawnSync(["git", "ls-files", "-z"], { cwd: root, stdout: "pipe" });
	return result.stdout.toString().split("\0").filter(Boolean);
}

/**
 * Read a JSON file.
 * @param file Its path, relative to the working directory or absolute.
 * @param schema What it holds.
 * @returns The parsed value.
 */
function readJson<T extends z.ZodType>(file: string, schema: T): z.infer<T> {
	return schema.parse(JSON.parse(readFileSync(file, "utf8")));
}

/**
 * The default moves and the overrides for every file under some paths.
 * @param paths Repository paths.
 * @param files Every tracked file.
 * @param overrides New-layout prefixes to new prefixes.
 * @returns The moves.
 */
function plannedMoves(
	paths: readonly string[],
	files: readonly string[],
	overrides: Readonly<Record<string, string>>,
): Move[] {
	return files
		.filter((file) => paths.some((prefix) => startsAt(prefix.replace(/\/$/u, ""), file)))
		.map((file) => ({ from: file, to: overridden(defaultMove(file), overrides) }))
		.filter((move) => move.to !== move.from);
}

/**
 * The bound directories of this checkout whose files part, with the new folder they share.
 * @param reading The current model.
 * @param map The moves.
 * @param repo The checkout's identity.
 * @returns Old directory to proposed binding.
 */
function proposedBindings(reading: Reading, map: MoveMap, repo: string): Record<string, string> {
	const parting = reading.modules
		.flatMap((module) => (module.binding?.repo === repo ? [module.binding.path] : []))
		.filter((path) => map.path(path) === undefined);
	return Object.fromEntries(parting.map((directory) => [directory, sharedFolder(map, directory)]));
}

/**
 * The deepest folder that the new paths of a directory's files share.
 * @param map The moves.
 * @param directory An old directory.
 * @returns The shared folder.
 */
function sharedFolder(map: MoveMap, directory: string): string {
	const folders = map.files
		.filter((file) => file.startsWith(`${directory}/`))
		.map((file) => map.file(file).split("/").slice(0, -1));
	return commonPrefix(folders).join("/");
}

/**
 * The segments that every list starts with.
 * @param lists Segment lists.
 * @returns Their common start.
 */
function commonPrefix(lists: readonly string[][]): string[] {
	const [first = [], ...rest] = lists;
	const length = first.findIndex((segment, index) => rest.some((list) => list[index] !== segment));
	return length === -1 ? first : first.slice(0, length);
}

/**
 * Where each file's `#` importers in its workspace sit, after the moves.
 * @param files Every tracked file.
 * @param map The moves.
 * @returns Old target path to the new paths of its importers.
 */
function importersOf(files: readonly string[], map: MoveMap): Map<string, string[]> {
	const importers = new Map<string, string[]>();
	for (const file of files.filter((path) => ALIASED.test(path) && workspaceOf(path))) {
		for (const target of aliasImports(readFileSync(join(root, file), "utf8"), file)) {
			importers.set(target, [...(importers.get(target) ?? []), map.file(file)]);
		}
	}
	return importers;
}

/**
 * A deeper place for a moved file that no module binds, when all its importers sit in one
 * sub-behavior below its new behavior folder.
 * @param move The move.
 * @param importers The new paths of its importers.
 * @returns The proposal, or undefined.
 */
function deeperPlace(move: Move, importers: readonly string[]): Move | undefined {
	const target = areaPathOf(move.to);
	const role = target?.folders.at(-1) ?? "";
	if (target === undefined || !ROLES.has(role)) return undefined;
	const shared = sharedHome(target, importers);
	if (shared === undefined) return undefined;
	const { workspace, folder, area, name } = target;
	return { from: move.from, to: [workspace, folder, area, ...shared, role, name].join("/") };
}

/**
 * The behavior folder that every importer of a file in its tree shares, when it lies below the
 * file's own behavior folder.
 * @param target The file's new place.
 * @param importers The new paths of its importers.
 * @returns The shared folders below the area, or undefined.
 */
function sharedHome(target: AreaPath, importers: readonly string[]): string[] | undefined {
	const homes = importers.flatMap((file) => {
		const place = areaPathOf(file);
		return place !== undefined && treeOf(place) === treeOf(target)
			? [place.folders.slice(0, -1)]
			: [];
	});
	const home = target.folders.slice(0, -1);
	const shared = commonPrefix(homes);
	const deeper = shared.length > home.length && home.every((folder, i) => shared[i] === folder);
	return homes.length > 0 && deeper ? shared : undefined;
}

/**
 * The tree of an area path: its workspace, its `src` or `tests`, and its area.
 * @param place The area path.
 * @returns The tree's path.
 */
function treeOf(place: AreaPath): string {
	return `${place.workspace}/${place.folder}/${place.area}`;
}

/**
 * Whether a module binding of this checkout covers a file below an area's folders.
 * @param reading The current model.
 * @param repo The checkout's identity.
 * @param file An old repository path.
 * @returns Whether a binding names the file or a folder below its area that holds it.
 */
function isBound(reading: Reading, repo: string, file: string): boolean {
	return reading.modules.some(
		(module) =>
			module.binding?.repo === repo &&
			startsAt(module.binding.path, file) &&
			(areaPathOf(`${module.binding.path}/x`)?.folders.length ?? 0) > 0,
	);
}

/**
 * Plan the moves under some paths and print the manifest to review.
 * @param paths Repository paths.
 * @param overridesFile The overrides' file, if any.
 */
async function plan(paths: readonly string[], overridesFile: string | undefined): Promise<void> {
	const files = trackedFiles();
	const overrides = overridesFile ? readJson(overridesFile, OverridesSchema) : {};
	const moves = plannedMoves(paths, files, overrides);
	const map = new MoveMap(moves, files);
	const reading = readModel(root);
	const { repo } = await vaultContext(root, map, {});
	const importers = importersOf(files, map);
	const proposals = moves
		.filter((move) => !isBound(reading, repo, move.from))
		.flatMap((move) => deeperPlace(move, importers.get(move.from) ?? []) ?? []);
	const bindings = proposedBindings(reading, map, repo);
	const problems = moves.flatMap((move) => {
		const problem = layoutProblem(move.to);
		return problem === undefined ? [] : [`${move.to}: ${problem}`];
	});
	console.log(JSON.stringify({ moves, bindings, proposals }, null, "\t"));
	report("moves", moves.length, []);
	report("bindings proposed for directories whose files part", Object.keys(bindings).length, []);
	report("deeper places proposed for unbound files", proposals.length, []);
	report("new paths that break the layout rule", problems.length, problems);
}

/**
 * Print one line of a review to standard error, with its first items.
 * @param what What is counted.
 * @param count How many.
 * @param items The items to show.
 */
function report(what: string, count: number, items: readonly string[]): void {
	console.error(`${count} ${what}`);
	for (const item of items.slice(0, 40)) console.error(`  ${item}`);
	if (items.length > 40) console.error(`  … and ${items.length - 40} more`);
}

/**
 * What is wrong with a manifest before anything moves.
 * @param manifest The manifest.
 * @param files Every tracked file.
 * @returns The problems.
 */
function manifestProblems(manifest: Manifest, files: readonly string[]): string[] {
	const tracked = new Set(files);
	const targets = new Set<string>();
	return manifest.moves.flatMap(({ from, to }) => {
		const problems = [
			tracked.has(from) ? "" : `${from} is not tracked`,
			existsSync(join(root, to)) || targets.has(to) ? `${to} is taken` : "",
			workspaceOf(from) === workspaceOf(to) ? "" : `${from} leaves its workspace`,
		];
		targets.add(to);
		return problems.filter(Boolean);
	});
}

/** What applying a manifest writes. */
interface Rewrites {
	texts: Map<string, string>;
	counts: { file: string; changes: number }[];
	blocking: string[];
	notes: string[];
}

/**
 * Compute the new text of every file the moves touch, at its new path, before anything moves.
 * @param files Every tracked file.
 * @param map The moves.
 * @returns The texts, the counts, what blocks the move, and what a person reviews.
 */
function rewrites(files: readonly string[], map: MoveMap): Rewrites {
	const result: Rewrites = { texts: new Map(), counts: [], blocking: [], notes: [] };
	const workspaces = new Set([...map.moves.keys()].map(workspaceOf));
	for (const from of files.filter((file) => !EXCLUDED.test(file))) {
		rewriteFile({ from, to: map.file(from) }, map, workspaces, result);
	}
	return result;
}

/**
 * Compute the new text of one file.
 * @param file The file, before and after the moves.
 * @param file.from Its old path.
 * @param file.to Its new path.
 * @param map The moves.
 * @param workspaces The workspaces that files move in.
 * @param result Where the text, its count and its problems go.
 */
function rewriteFile(
	file: { from: string; to: string },
	map: MoveMap,
	workspaces: ReadonlySet<string | undefined>,
	result: Rewrites,
): void {
	const steps = rewriteSteps(file.from, workspaces);
	if (steps.length === 0) {
		if (TEXT.test(file.from)) noteReferences(file.from, map, result);
		return;
	}
	const original = readFileSync(join(root, file.from), "utf8");
	let text = original;
	let changes = 0;
	for (const step of steps) {
		const next = step(text, file, map, result.blocking, result.notes);
		text = next.text;
		changes += next.changes;
	}
	if (text !== original) result.texts.set(file.to, text);
	if (changes > 0) result.counts.push({ file: file.to, changes });
}

/**
 * Note the moved repository paths that a text file names, which no rewrite owns.
 * @param file The file.
 * @param map The moves.
 * @param result Where the note goes.
 */
function noteReferences(file: string, map: MoveMap, result: Rewrites): void {
	const references = movedReferences(readFileSync(join(root, file), "utf8"), map);
	if (references.length > 0) result.notes.push(`${file}: ${references.join(", ")}`);
}

/** One rewrite of a file's text. */
type Step = (
	text: string,
	file: { from: string; to: string },
	map: MoveMap,
	blocking: string[],
	notes: string[],
) => { text: string; changes: number };

/**
 * The rewrites that apply to a file.
 * @param file An old repository path.
 * @param workspaces The workspaces that files move in.
 * @returns The rewrites, in order.
 */
function rewriteSteps(file: string, workspaces: ReadonlySet<string | undefined>): Step[] {
	const workspace = workspaceOf(file);
	const code = CODE.test(file);
	const steps: Step[] = [];
	if (ALIASED.test(file) && workspaces.has(workspace)) {
		steps.push((text, moved, map, blocking) => rewriteAliases(text, moved, map, blocking));
	}
	if (code) {
		steps.push((text, moved, map, blocking) => rewriteRelatives(text, moved, map, blocking));
	}
	if (code || LISTED.test(file)) {
		steps.push((text, moved, map, _, notes) =>
			rewriteRepositoryPaths(text, moved.from, map, notes),
		);
	}
	return [...steps, ...exportsStep(file, workspace)];
}

/**
 * The rewrite of a workspace manifest's `exports`, for that manifest alone.
 * @param file An old repository path.
 * @param workspace The workspace it lies in.
 * @returns The rewrite, or none for any other file.
 */
function exportsStep(file: string, workspace: string | undefined): Step[] {
	if (workspace === undefined || file !== `${workspace}/package.json`) return [];
	return [(text, _, map) => rewriteExports(text, workspace, map)];
}

/**
 * Move the files with Git and write their new texts.
 * @param moves The moves.
 * @param texts The new texts by new path.
 * @throws {Error} When a `git mv` fails.
 */
function moveFiles(moves: readonly Move[], texts: ReadonlyMap<string, string>): void {
	for (const { from, to } of moves) {
		mkdirSync(dirname(join(root, to)), { recursive: true });
		const result = Bun.spawnSync(["git", "mv", from, to], { cwd: root, stderr: "pipe" });
		if (result.exitCode !== 0) throw new Error(`git mv ${from} ${to}: ${result.stderr.toString()}`);
	}
	for (const [file, text] of texts) writeFileSync(join(root, file), text);
}

/**
 * Apply a reviewed manifest, or print what it would do.
 * @param manifestFile The manifest's file.
 * @param dryRun Whether to change nothing.
 */
async function apply(manifestFile: string, dryRun: boolean): Promise<void> {
	const manifest = readJson(manifestFile, ManifestSchema);
	const files = trackedFiles();
	const map = new MoveMap(manifest.moves, files);
	const reading = readModel(root);
	const context = await vaultContext(root, map, manifest.bindings);
	const changes = vaultChanges(reading, context);
	const planned = rewrites(files, map);
	const blocking = [...manifestProblems(manifest, files), ...planned.blocking, ...context.problems];
	if (dryRun || blocking.length > 0) {
		printSummary(manifest, planned, changes, blocking);
		process.exitCode = blocking.length > 0 ? 1 : 0;
		return;
	}
	moveFiles(manifest.moves, planned.texts);
	report("files rewritten", planned.counts.length, []);
	report("other references to review", planned.notes.length, planned.notes);
	if (changes.length > 0) rebind(reading, changes, manifest);
}

/**
 * Restart the server on the moved source and write the vault intent.
 * @param reading The model the intent is built on.
 * @param changes The statements.
 * @param manifest The manifest, whose moves name the operation.
 */
function rebind(reading: Reading, changes: Change[], manifest: Manifest): void {
	restartServer(root);
	const digest = createHash("sha256").update(JSON.stringify(manifest.moves)).digest("hex");
	const operation = `move-source-${digest.slice(0, 12)}-${Date.now()}`;
	const answer = applyVaultChanges(root, reading, changes, operation);
	console.log(JSON.stringify(answer, null, "\t"));
	if (!answer.success) {
		console.error("The files moved, and the vault refused the rebind. Repair what the answer");
		console.error("names, then run: bun scripts/move-source.ts rebind <manifest>");
		process.exitCode = 2;
	}
}

/**
 * Write the vault intent of a manifest whose files have moved already.
 * @param manifestFile The manifest's file.
 */
async function rebindMoved(manifestFile: string): Promise<void> {
	const manifest = readJson(manifestFile, ManifestSchema);
	const back = new Map(manifest.moves.map((move) => [move.to, move.from]));
	const before = trackedFiles().map((file) => back.get(file) ?? file);
	const map = new MoveMap(manifest.moves, before);
	const reading = readModel(root);
	const context = await vaultContext(root, map, manifest.bindings);
	const changes = vaultChanges(reading, context);
	report("vault statements", changes.length, []);
	report("problems that block the rebind", context.problems.length, context.problems);
	if (context.problems.length > 0) {
		process.exitCode = 1;
	} else if (changes.length > 0) {
		rebind(reading, changes, manifest);
	}
}

/**
 * Print what a manifest would do, and what blocks it.
 * @param manifest The manifest.
 * @param planned The rewrites.
 * @param changes The vault statements.
 * @param blocking What blocks the move.
 */
function printSummary(
	manifest: Manifest,
	planned: Rewrites,
	changes: readonly Change[],
	blocking: readonly string[],
): void {
	const rewritten = planned.counts.toSorted((a, b) => a.file.localeCompare(b.file));
	console.log(JSON.stringify({ moves: manifest.moves.length, rewritten, changes }, null, "\t"));
	report("moves", manifest.moves.length, []);
	report("files rewritten", rewritten.length, []);
	report("vault statements", changes.length, []);
	report("other references to review", planned.notes.length, planned.notes);
	report("problems that block the move", blocking.length, blocking);
}

const [command, ...rest] = process.argv.slice(2);
const overridesAt = rest.indexOf("--overrides");
const overridesFile = overridesAt === -1 ? undefined : rest[overridesAt + 1];
const positional = rest.filter(
	(word, index) => !word.startsWith("--") && (overridesAt === -1 || index !== overridesAt + 1),
);
if (command === "plan" && positional.length > 0) {
	await plan(positional, overridesFile);
} else if (command === "apply" && positional[0] !== undefined) {
	await apply(positional[0], rest.includes("--dry-run"));
} else if (command === "rebind" && positional[0] !== undefined) {
	await rebindMoved(positional[0]);
} else {
	console.error("usage: bun scripts/move-source.ts plan <path>... [--overrides <file>]");
	console.error("       bun scripts/move-source.ts apply <manifest> [--dry-run]");
	console.error("       bun scripts/move-source.ts rebind <manifest>");
	process.exitCode = 2;
}
