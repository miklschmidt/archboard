// `bun run readme:assets [name ...] [--codex] [--replay] [--dry-run]`: make README assets from the
// checkout.
//
// With no name it makes every asset that needs no Codex sign-in, one at a time. A named asset is
// made whatever it needs, and --codex adds every asset that needs Codex. --replay renders a
// narrated asset again from the talk its last recording kept, which spends no Codex usage (with no
// name it selects the narrated assets). --dry-run prints each asset's plan and where each tool
// comes from, and starts nothing. Each asset made records the
// hash of its sources in docs/readme/assets.json; docs/agents/readme-assets.md says more.

import { statSync } from "node:fs";
import { join } from "node:path";

import { resolveCodexExecutable } from "@archboard/codex-app-server/process";
import { SOURCE_CHECKOUT } from "@archboard/workspace/source-checkout";

// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no # imports; sibling imports stay relative
import { PRODUCERS } from "./assets.ts";
import {
	MANIFEST_PATH,
	checkoutHasher,
	readManifest,
	writeManifest,
	type ReadmeAsset,
	type ReadmeManifest,
	// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no # imports; sibling imports stay relative
} from "./manifest.ts";
// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no # imports; sibling imports stay relative
import { disagreements, inRepository, type Need, type Producer } from "./producer.ts";
import {
	ROOT,
	chromiumPath,
	inOrder,
	pyftsubsetCommand,
	requireEncoders,
	run,
	toolLines,
	// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no # imports; sibling imports stay relative
} from "./tools.ts";

/** The largest image GitHub takes as an attachment: an upload of 21 MB was refused with HTTP 422. */
const ATTACHED_IMAGE_LIMIT = 10_000_000;

/** The encoders every filmed or rasterized asset is written with. */
const ENCODERS = ["libwebp_anim", "libwebp", "libx264"] as const;

/** What the command line asked for. */
interface Request {
	readonly names: readonly string[];
	readonly codex: boolean;
	readonly replay: boolean;
	readonly dryRun: boolean;
}

/** A command line the command does not read; it exits 2 and makes nothing. */
class UsageError extends Error {
	/**
	 * Refuse a command line.
	 * @param message What was wrong and what the command reads.
	 */
	constructor(message: string) {
		super(message);
		this.name = "UsageError";
	}

	/**
	 * The refusal as the command prints it.
	 * @returns The message alone.
	 */
	override toString(): string {
		return this.message;
	}
}

/**
 * Read the command line.
 * @param argv The arguments after the script.
 * @returns The request.
 * @throws {UsageError} When an option is not one the command reads.
 */
function requestOf(argv: readonly string[]): Request {
	const unknown = argv.filter(
		(word) => word.startsWith("-") && !["--codex", "--replay", "--dry-run"].includes(word),
	);
	if (unknown.length > 0) {
		throw new UsageError(
			`readme:assets reads --codex, --replay and --dry-run, not ${unknown.join(" ")}.`,
		);
	}
	return {
		names: argv.filter((word) => !word.startsWith("-")),
		codex: argv.includes("--codex"),
		replay: argv.includes("--replay"),
		dryRun: argv.includes("--dry-run"),
	};
}

/**
 * The assets a request selects, in the manifest's order.
 * @param manifest The manifest.
 * @param request The request.
 * @returns The assets.
 * @throws {UsageError} When a name is not an asset's, or --replay reaches an asset with no kept talk.
 */
function selected(manifest: ReadmeManifest, request: Request): readonly ReadmeAsset[] {
	const known = manifest.assets.map((asset) => asset.name);
	const strange = request.names.filter((name) => !known.includes(name));
	if (strange.length > 0) {
		throw new UsageError(
			`No README asset is named ${strange.join(", ")}. The assets: ${known.join(", ")}.`,
		);
	}
	const chosen = manifest.assets.filter((asset) => {
		if (request.names.length > 0) return request.names.includes(asset.name);
		if (request.replay) return asset.kind === "narrated";
		return request.codex || !asset.codex;
	});
	const unkept = request.replay ? chosen.filter((asset) => asset.kind !== "narrated") : [];
	if (unkept.length > 0) {
		throw new UsageError(
			`--replay renders a narrated asset from its kept talk, and ${unkept.map((asset) => asset.name).join(", ")} keeps none.`,
		);
	}
	return chosen;
}

/**
 * The producer of an asset.
 * @param asset The asset.
 * @returns Its producer.
 * @throws {Error} When the kit has none.
 */
function producerOf(asset: ReadmeAsset): Producer {
	const producer = PRODUCERS[asset.name];
	if (producer === undefined) throw new Error(`The kit has no producer for ${asset.name}.`);
	return producer;
}

/**
 * Prove one tool is there before anything is made.
 * @param need The tool.
 */
async function prove(need: Need): Promise<void> {
	if (need === "chromium") chromiumPath();
	if (need === "ffmpeg") await requireEncoders(ENCODERS);
	if (need === "pyftsubset") pyftsubsetCommand();
	if (need === "codex") resolveCodexExecutable({ installedIn: SOURCE_CHECKOUT });
}

/**
 * Say what one asset is and what making it does.
 * @param asset The asset.
 * @param index Its place in the run, counted from one.
 * @param total How many assets the run makes.
 * @param replay Whether narrated assets are rendered again from their kept talks, with no Codex.
 * @returns The lines.
 */
function planLines(
	asset: ReadmeAsset,
	index: number,
	total: number,
	replay: boolean,
): readonly string[] {
	const producer = producerOf(asset);
	const codex = asset.codex && !replay ? ", needs a Codex sign-in" : "";
	return [
		`[${index}/${total}] ${asset.name} (${asset.kind}${codex})`,
		...producer.plan.map((step) => `  - ${step}`),
		asset.files.length === 0
			? "  writes nothing in the repository"
			: `  writes ${asset.files.join(", ")}`,
	];
}

/**
 * The size of each file an asset wrote.
 * @param asset The asset.
 * @returns One phrase per file.
 */
function sizes(asset: ReadmeAsset): string {
	if (asset.files.length === 0) return "nothing in the repository";
	return asset.files
		.map((file) => `${file} (${Math.round(statSync(inRepository(file)).size / 1024)} KB)`)
		.join(", ");
}

/**
 * Tell the reader to attach a file that was written in the scratch directory, or that GitHub will
 * refuse it.
 * @param file The file.
 * @returns The line.
 */
function attachLine(file: string): string {
	const { size } = statSync(file);
	const said = `${file} (${Math.round(size / 1024)} KB)`;
	return file.endsWith(".webp") && size > ATTACHED_IMAGE_LIMIT
		? `${said} is over GitHub's 10 MB limit for an image: make it narrower or shorter before you attach it`
		: `attach ${said}: run gh attach on it, and put the address it prints in README.md`;
}

/**
 * Say what a producer is doing, under its asset's line.
 * @param line The sentence.
 */
function say(line: string): void {
	console.log(`  ${line}`);
}

/**
 * Make the selected assets one at a time, and record each one's source hash as it is made.
 * @param manifest The manifest.
 * @param assets The assets.
 * @param replay Whether narrated assets are rendered again from their kept talks.
 */
async function makeAll(
	manifest: ReadmeManifest,
	assets: readonly ReadmeAsset[],
	replay: boolean,
): Promise<void> {
	const needs = new Set(
		assets
			.flatMap((asset) => producerOf(asset).needs)
			.filter((need) => !replay || need !== "codex"),
	);
	// Every tool is proved before anything starts.
	await inOrder(needs, prove);
	if (needs.has("chromium")) {
		console.log("Building the frontend the takes are filmed from.");
		await run([process.execPath, "run", "build"]);
	}
	const hasher = checkoutHasher(ROOT);
	let made = manifest;
	// Assets are made one at a time, so a take has the machine to itself.
	await inOrder(assets, async (asset, index) => {
		console.log(planLines(asset, index + 1, assets.length, replay)[0]);
		const hash = hasher.hash(asset.sources);
		await producerOf(asset).make({ say, replay });
		made = {
			...made,
			assets: made.assets.map((one) => (one.name === asset.name ? { ...one, hash } : one)),
		};
		writeManifest(ROOT, made);
		await run([
			join(ROOT, "node_modules/.bin/vp"),
			"fmt",
			"--config",
			join(ROOT, "vite.config.ts"),
			MANIFEST_PATH,
		]);
		console.log(`  made ${sizes(asset)}`);
		for (const file of producerOf(asset).attachments) say(attachLine(file));
	});
}

/**
 * Print the plan of each selected asset and where each tool comes from; start nothing.
 * @param assets The assets.
 * @param replay Whether narrated assets are rendered again from their kept talks.
 */
function dryRun(assets: readonly ReadmeAsset[], replay: boolean): void {
	console.log("A dry run: nothing is started, filmed, generated or spent.");
	for (const line of toolLines()) console.log(line);
	for (const [index, asset] of assets.entries()) {
		console.log(planLines(asset, index + 1, assets.length, replay).join("\n"));
	}
}

/**
 * Read the command line and the manifest, then plan or make what was asked for.
 * @throws {Error} When the manifest and the kit disagree.
 */
async function main(): Promise<void> {
	const request = requestOf(process.argv.slice(2));
	const manifest = readManifest(ROOT);
	const disagreeing = manifest.assets.flatMap((asset) =>
		disagreements(asset, PRODUCERS[asset.name]),
	);
	if (disagreeing.length > 0) {
		throw new Error(`${MANIFEST_PATH} and the kit disagree:\n${disagreeing.join("\n")}`);
	}
	const assets = selected(manifest, request);
	if (request.dryRun) dryRun(assets, request.replay);
	else await makeAll(manifest, assets, request.replay);
}

await main().catch((error: unknown) => {
	const usage = error instanceof UsageError;
	console.error(
		usage || !(error instanceof Error) ? String(error) : (error.stack ?? error.message),
	);
	process.exitCode = usage ? 2 : 1;
});
