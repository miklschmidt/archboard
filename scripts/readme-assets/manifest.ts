// The README asset manifest, docs/readme/assets.json, and what makes an asset stale.
//
// The manifest names each asset, the files it writes, the command that makes it, whether that
// command needs a Codex sign-in, and the sources the asset shows. When the kit makes an asset it
// records a hash of those sources. An asset is stale when it has no hash (the kit never made it),
// when its sources hash to something else now, or when one of its files is missing. A source is a
// repository path: a file, a directory, or a glob. Files under a `tests` directory never count,
// because no test changes what an asset shows.

import { existsSync, lstatSync, readFileSync, readlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

/** Where the manifest lives, from the repository root. */
const MANIFEST_PATH = "docs/readme/assets.json";

/** The directory whose every file an asset must claim. */
const README_DIRECTORY = "docs/readme";

/**
 * The command that makes one asset.
 * @param name The asset's name.
 * @returns The command line.
 */
function commandFor(name: string): string {
	return `bun run readme:assets ${name}`;
}

const AssetSchema = z
	.object({
		name: z.string().regex(/^[a-z][a-z0-9-]*$/),
		kind: z.enum(["svg", "clip", "art", "narrated"]),
		codex: z.boolean(),
		command: z.string(),
		files: z.array(z.string().min(1)),
		sources: z.array(z.string().min(1)).min(1),
		hash: z
			.string()
			.regex(/^[0-9a-f]{64}$/)
			.nullable(),
	})
	.strict()
	.refine((asset) => asset.command === commandFor(asset.name), {
		message: "An asset's command is `bun run readme:assets <its name>`.",
		path: ["command"],
	});

const ManifestSchema = z
	.object({
		about: z.string(),
		assets: z.array(AssetSchema),
	})
	.strict()
	.superRefine((manifest, context) => {
		const names = manifest.assets.map((asset) => asset.name);
		const files = manifest.assets.flatMap((asset) => asset.files);
		for (const [label, values] of [
			["name", names],
			["file", files],
		] as const) {
			const twice = values.filter((value, index) => values.indexOf(value) !== index);
			if (twice.length > 0) {
				context.addIssue({
					code: "custom",
					message: `More than one asset has the ${label} ${twice.join(", ")}.`,
				});
			}
		}
	});

type ReadmeAsset = z.infer<typeof AssetSchema>;
type ReadmeManifest = z.infer<typeof ManifestSchema>;

/**
 * Read and check the manifest.
 * @param root The repository root.
 * @returns The manifest.
 * @throws {Error} When it is missing or does not hold a valid manifest.
 */
function readManifest(root: string): ReadmeManifest {
	const parsed = ManifestSchema.safeParse(
		JSON.parse(readFileSync(join(root, MANIFEST_PATH), "utf8")),
	);
	if (!parsed.success) {
		throw new Error(`${MANIFEST_PATH} is not a valid manifest: ${z.prettifyError(parsed.error)}`);
	}
	return parsed.data;
}

/**
 * Write the manifest back. The caller formats it as the repository keeps JSON.
 * @param root The repository root.
 * @param manifest The manifest.
 */
function writeManifest(root: string, manifest: ReadmeManifest): void {
	writeFileSync(join(root, MANIFEST_PATH), `${JSON.stringify(manifest, null, "\t")}\n`);
}

/**
 * Whether a repository path is under a `tests` directory.
 * @param path The path.
 * @returns Whether it belongs to a test.
 */
function isTestPath(path: string): boolean {
	return path.split("/").slice(0, -1).includes("tests");
}

/**
 * Every file of the checkout an asset can show: tracked files and new files git does not ignore,
 * that exist, and that do not belong to a test.
 * @param root The repository root.
 * @returns The paths, sorted.
 * @throws {Error} When git cannot list the checkout.
 */
function checkoutFiles(root: string): readonly string[] {
	const listed = Bun.spawnSync(
		["git", "ls-files", "-z", "--cached", "--others", "--exclude-standard"],
		{ cwd: root, stdout: "pipe", stderr: "pipe" },
	);
	if (listed.exitCode !== 0) {
		throw new Error(`git ls-files failed in ${root}: ${listed.stderr.toString().trim()}`);
	}
	const paths = new Set(listed.stdout.toString().split("\0"));
	return [...paths]
		.filter((path) => path !== "" && !isTestPath(path) && existsSync(join(root, path)))
		.toSorted();
}

/**
 * Whether one source names a path: the path itself, a directory above it, or a glob it matches.
 * @param source The source.
 * @param path The path.
 * @returns Whether the source covers it.
 */
function covers(source: string, path: string): boolean {
	if (/[*?[{]/.test(source)) return new Bun.Glob(source).match(path);
	const directory = source.endsWith("/") ? source : `${source}/`;
	return path === source || path.startsWith(directory);
}

/**
 * The files a list of sources covers.
 * @param sources The sources.
 * @param files Every file of the checkout.
 * @returns The covered files, in the checkout's order.
 */
function filesOf(sources: readonly string[], files: readonly string[]): readonly string[] {
	return files.filter((path) => sources.some((source) => covers(source, path)));
}

/** Hashes files once each, however many assets show them. */
class SourceHasher {
	readonly #root: string;
	readonly #files: readonly string[];
	readonly #digests = new Map<string, string>();

	/**
	 * Hash the files of one checkout.
	 * @param root The repository root.
	 * @param files Every file of the checkout an asset can show.
	 */
	constructor(root: string, files: readonly string[]) {
		this.#root = root;
		this.#files = files;
	}

	/**
	 * The sources that cover no file of the checkout, which a manifest must not name.
	 * @param sources The sources.
	 * @returns The ones that cover nothing.
	 */
	unmatched(sources: readonly string[]): readonly string[] {
		return sources.filter((source) => !this.#files.some((path) => covers(source, path)));
	}

	/**
	 * The hash of what a list of sources covers: every covered path and its content.
	 * @param sources The sources.
	 * @returns The hash, as hex.
	 */
	hash(sources: readonly string[]): string {
		const hasher = new Bun.CryptoHasher("sha256");
		for (const path of filesOf(sources, this.#files)) {
			hasher.update(`${path}\0${this.#digest(path)}\n`);
		}
		return hasher.digest("hex");
	}

	/**
	 * One file's content hash. A symbolic link is hashed as the path it holds, as git tracks it.
	 * @param path The file.
	 * @returns Its hash, as hex.
	 */
	#digest(path: string): string {
		const known = this.#digests.get(path);
		if (known !== undefined) return known;
		const file = join(this.#root, path);
		const content = lstatSync(file).isSymbolicLink() ? readlinkSync(file) : readFileSync(file);
		const digest = new Bun.CryptoHasher("sha256").update(content).digest("hex");
		this.#digests.set(path, digest);
		return digest;
	}
}

/**
 * A hasher over the checkout as it is now.
 * @param root The repository root.
 * @returns The hasher.
 */
function checkoutHasher(root: string): SourceHasher {
	return new SourceHasher(root, checkoutFiles(root));
}

/** What the checkout says about the assets, which is all an assessment reads. */
interface CheckoutFacts {
	/**
	 * The hash of an asset's sources as they are now.
	 * @param sources The sources.
	 * @returns The hash.
	 */
	readonly hash: (sources: readonly string[]) => string;
	/**
	 * The sources that cover no file.
	 * @param sources The sources.
	 * @returns The ones that cover nothing.
	 */
	readonly unmatched: (sources: readonly string[]) => readonly string[];
	/**
	 * Whether a file exists.
	 * @param path The file, from the repository root.
	 * @returns Whether it exists.
	 */
	readonly exists: (path: string) => boolean;
	/** Every file in docs/readme, from the repository root. */
	readonly readmeFiles: readonly string[];
}

/** One stale asset, and why. */
interface StaleAsset {
	readonly asset: ReadmeAsset;
	readonly reasons: readonly string[];
}

/** What the check reports. */
interface Assessment {
	readonly current: readonly ReadmeAsset[];
	readonly stale: readonly StaleAsset[];
	/** What is wrong with the manifest itself; fixed by editing it, not by making assets. */
	readonly problems: readonly string[];
}

/**
 * Why one asset is stale; empty when it is current.
 * @param asset The asset.
 * @param facts The checkout.
 * @returns The reasons.
 */
function reasonsFor(asset: ReadmeAsset, facts: CheckoutFacts): readonly string[] {
	const reasons: string[] = [];
	if (asset.hash === null) reasons.push("never generated by the kit");
	else if (asset.hash !== facts.hash(asset.sources)) {
		reasons.push("its sources changed since it was made");
	}
	for (const file of asset.files) {
		if (!facts.exists(file)) reasons.push(`${file} is missing`);
	}
	return reasons;
}

/**
 * What is wrong with the manifest: a source that covers no file, and a file in docs/readme that
 * no asset makes.
 * @param manifest The manifest.
 * @param facts The checkout.
 * @returns The problems.
 */
function problemsOf(manifest: ReadmeManifest, facts: CheckoutFacts): readonly string[] {
	const claimed = new Set([MANIFEST_PATH, ...manifest.assets.flatMap((asset) => asset.files)]);
	return [
		...manifest.assets.flatMap((asset) =>
			facts
				.unmatched(asset.sources)
				.map((source) => `${asset.name}: the source ${source} covers no file.`),
		),
		...facts.readmeFiles
			.filter((file) => !claimed.has(file))
			.map((file) => `${file}: no asset makes this file.`),
	];
}

/**
 * Assess every asset of the manifest against the checkout.
 * @param manifest The manifest.
 * @param facts The checkout.
 * @returns Which assets are current, which are stale and why, and what is wrong with the manifest.
 */
function assess(manifest: ReadmeManifest, facts: CheckoutFacts): Assessment {
	const current: ReadmeAsset[] = [];
	const stale: StaleAsset[] = [];
	for (const asset of manifest.assets) {
		const reasons = reasonsFor(asset, facts);
		if (reasons.length === 0) current.push(asset);
		else stale.push({ asset, reasons });
	}
	return { current, stale, problems: problemsOf(manifest, facts) };
}

/**
 * The facts of the checkout at a repository root.
 * @param root The repository root.
 * @returns The facts.
 */
function checkoutFacts(root: string): CheckoutFacts {
	const hasher = checkoutHasher(root);
	const listed = Bun.spawnSync(
		["git", "ls-files", "-z", "--cached", "--others", "--", README_DIRECTORY],
		{
			cwd: root,
			stdout: "pipe",
		},
	);
	/**
	 * Whether a file of the checkout exists.
	 * @param path The file, from the repository root.
	 * @returns Whether it exists.
	 */
	const exists = (path: string): boolean => existsSync(join(root, path));
	return {
		hash: hasher.hash.bind(hasher),
		unmatched: hasher.unmatched.bind(hasher),
		exists,
		readmeFiles: [...new Set(listed.stdout.toString().split("\0"))].filter(
			(path) => path !== "" && exists(path),
		),
	};
}

export {
	MANIFEST_PATH,
	SourceHasher,
	assess,
	checkoutFacts,
	checkoutFiles,
	checkoutHasher,
	readManifest,
	writeManifest,
	type CheckoutFacts,
	type ReadmeAsset,
	type ReadmeManifest,
	type StaleAsset,
};
