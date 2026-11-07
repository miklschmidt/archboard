// `bun run release`: the npm packages of one release (ADR 0076), laid out and packed in
// dist/release:
//
//   archboard/, archboard-cli/        the launchers `archboard` and `@archboard/cli`: one shell
//                                      script, under two names
//   archboard-cli-<os>-<cpu>/         the platform packages `@archboard/cli-<os>-<cpu>`: the
//                                      compiled executable and its assets
//   *.tgz                              each package packed, as `npm publish` takes it
//
// Every version is the version of the root package.json, which release-please sets. A package
// has no install script, and the build fails when a packed package is larger than its budget.
// Run it in a checkout inside `nix develop`, after `bun install`: the Vite+ task builds the
// frontend and the core first.

import {
	chmodSync,
	copyFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import path from "node:path";
import { z } from "zod";
import { CODEX_PROTOCOL_VERSION } from "@archboard/codex-app-server/protocol";
import { CHECKOUT } from "@archboard/renderer/core";
// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no # imports; sibling imports stay relative
import { compileRelease, TARGETS, type Target } from "./compile.ts";
// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no # imports; sibling imports stay relative
import { thirdPartyNotices } from "./notices.ts";

const OUT = path.join(CHECKOUT, "dist", "release");
const LAUNCHER = path.join(CHECKOUT, "scripts", "release", "launcher.sh");
const LAUNCHERS = ["archboard", "@archboard/cli"];
const MB = 1024 * 1024;
/**
 * The largest packed size of each package, a little above its size when the budget was set. A
 * package that grows past it fails the build, so the growth is a decision and not an accident.
 */
const BUDGETS: Readonly<Record<string, number>> = {
	// 3.3 KB on 2026-11-05.
	archboard: 4 * 1024,
	"@archboard/cli": 4 * 1024,
	// 62.9, 62.6 and 52.7 MB on 2026-11-05.
	"@archboard/cli-linux-x64": 66 * MB,
	"@archboard/cli-linux-arm64": 66 * MB,
	"@archboard/cli-darwin-arm64": 56 * MB,
};
/** The line of LICENSE that names the Licensed Work and its version. */
const LICENSED_WORK = /^(Licensed Work: +Archboard )\S+$/m;

const root = z
	.object({
		version: z.string(),
		description: z.string(),
		license: z.string(),
		author: z.object({ name: z.string(), email: z.string() }),
		homepage: z.string(),
		bugs: z.object({ url: z.string() }),
		repository: z.object({ type: z.string(), url: z.string() }),
	})
	.parse(JSON.parse(readFileSync(path.join(CHECKOUT, "package.json"), "utf8")));

/** What every manifest of the release says alike. */
const COMMON = {
	version: root.version,
	license: root.license,
	author: root.author,
	homepage: root.homepage,
	bugs: root.bugs,
	repository: root.repository,
	publishConfig: { access: "public" },
};

/**
 * Refuse with a message that says what to do.
 * @param message What is wrong, and the remedy.
 * @throws {Error} Always.
 */
function refuse(message: string): never {
	throw new Error(message);
}

/**
 * The platform of a Bun target, as npm's `os` and `cpu` and the package suffix name it.
 * @param target The Bun target, such as `bun-linux-x64`.
 * @returns Its `os`, `cpu` and suffix.
 */
function platformOf(target: Target): { os: string; cpu: string; suffix: string } {
	const suffix = target.slice("bun-".length);
	const [os = "", cpu = ""] = suffix.split("-");
	return { os, cpu, suffix };
}

/**
 * The LICENSE of this release: the repository's, with this version as the Licensed Work, since
 * the Change Date counts from the first publication of each version.
 * @returns The text.
 * @throws {Error} When LICENSE names no Licensed Work to replace.
 */
function license(): string {
	const text = readFileSync(path.join(CHECKOUT, "LICENSE"), "utf8");
	if (!LICENSED_WORK.test(text)) {
		refuse("LICENSE has no `Licensed Work: Archboard <version>` line to name the release.");
	}
	return text.replace(LICENSED_WORK, `$1${root.version}`);
}

/**
 * Write a package's manifest, licence and readme.
 * @param directory The package directory.
 * @param manifest Its package.json.
 * @param readme Its README.md.
 */
function writePackage(directory: string, manifest: object, readme: string): void {
	writeFileSync(path.join(directory, "package.json"), `${JSON.stringify(manifest, null, "\t")}\n`);
	writeFileSync(path.join(directory, "LICENSE"), license());
	writeFileSync(path.join(directory, "README.md"), readme);
}

/**
 * The directory of a package in dist/release.
 * @param name The package name.
 * @returns The directory.
 */
function directoryOf(name: string): string {
	return path.join(OUT, name.replace("@", "").replace("/", "-"));
}

/**
 * Lay out the platform package of one target.
 * @param target The Bun target.
 * @returns The package name.
 * @throws {Error} When the compile fails or pins another Codex than the protocol.
 */
async function platformPackage(target: Target): Promise<string> {
	const { os, cpu, suffix } = platformOf(target);
	const name = `@archboard/cli-${suffix}`;
	const directory = directoryOf(name);
	const compiled = await compileRelease(target, directory);
	if (compiled.marker.codexVersion !== CODEX_PROTOCOL_VERSION) {
		refuse(
			`package.json pins @openai/codex ${compiled.marker.codexVersion}, and the protocol is built for ${CODEX_PROTOCOL_VERSION}. Upgrade both together (docs/agents/codex-upgrades.md).`,
		);
	}
	writeFileSync(
		path.join(directory, "THIRD_PARTY_NOTICES.md"),
		thirdPartyNotices({ version: root.version, bundledPackages: compiled.bundledPackages }),
	);
	writePackage(
		directory,
		{
			name,
			description: `The Archboard executable for ${os} on ${cpu}. Install archboard, which starts it.`,
			...COMMON,
			os: [os],
			cpu: [cpu],
			files: [
				"bin",
				"frontend",
				"core",
				"skills",
				"archboard-release.json",
				"THIRD_PARTY_NOTICES.md",
			],
			// The alias that @openai/codex gives its own platform binary, at the pinned version.
			dependencies: {
				[`@openai/codex-${suffix}`]: `npm:@openai/codex@${CODEX_PROTOCOL_VERSION}-${suffix}`,
			},
		},
		`# ${name}\n\nThe Archboard ${root.version} executable for ${os} on ${cpu}. Install \`archboard\` or \`@archboard/cli\`, which starts it: ${root.homepage}\n`,
	);
	return name;
}

/**
 * Lay out one launcher.
 * @param name The package name.
 * @param platforms The platform packages it starts one of.
 */
function launcherPackage(name: string, platforms: readonly string[]): void {
	const directory = directoryOf(name);
	rmSync(directory, { recursive: true, force: true });
	mkdirSync(path.join(directory, "bin"), { recursive: true });
	const bin = path.join(directory, "bin", "archboard");
	copyFileSync(LAUNCHER, bin);
	chmodSync(bin, 0o755);
	writePackage(
		directory,
		{
			name,
			description: root.description,
			...COMMON,
			// The launcher is a POSIX shell script.
			os: ["darwin", "linux"],
			bin: { archboard: "bin/archboard" },
			files: ["bin"],
			// The package manager installs only the one whose `os` and `cpu` match.
			optionalDependencies: Object.fromEntries(
				platforms.map((platform) => [platform, root.version]),
			),
		},
		`# ${name}\n\nArchboard ${root.version}: agents author architecture models, and Archboard draws them. Linux on x64 and arm64, and macOS on Apple silicon.\n\n\`\`\`sh\nnpm install --global ${name}\narchboard start\n\`\`\`\n\nThe documentation is at ${root.homepage}.\n`,
	);
}

/**
 * Refuse a package that an install would run code for: a `scripts` field, whose install hooks
 * npm and Bun run, or a `binding.gyp`, for which npm runs `node-gyp rebuild`.
 * @param directory The package directory.
 * @throws {Error} When the package has either.
 */
function refuseInstallScripts(directory: string): void {
	const manifest = z
		.object({ scripts: z.unknown(), gypfile: z.unknown() })
		.partial()
		.parse(JSON.parse(readFileSync(path.join(directory, "package.json"), "utf8")));
	const gyp = existsSync(path.join(directory, "binding.gyp"));
	if (manifest.scripts !== undefined || manifest.gypfile !== undefined || gyp) {
		refuse(`${directory} would run code on install. A release package has no install script.`);
	}
}

/**
 * Pack one package into dist/release, and refuse it above its budget.
 * @param name The package name.
 * @returns The tarball and its size.
 * @throws {Error} When packing fails, or the tarball exceeds its budget.
 */
function pack(name: string): { tarball: string; bytes: number; budget: number } {
	const directory = directoryOf(name);
	refuseInstallScripts(directory);
	const packed = Bun.spawnSync(
		[process.execPath, "pm", "pack", "--destination", OUT, "--ignore-scripts", "--quiet"],
		{ cwd: directory, stdout: "pipe", stderr: "pipe" },
	);
	const tarball = packed.stdout.toString().trim();
	if (packed.exitCode !== 0 || tarball === "") {
		refuse(`${name} did not pack:\n${packed.stderr.toString()}`);
	}
	const bytes = statSync(tarball).size;
	const budget = BUDGETS[name] ?? refuse(`${name} has no size budget in scripts/release/build.ts.`);
	if (bytes > budget) {
		refuse(
			`${name} packs to ${String(bytes)} bytes, above its budget of ${String(budget)}. Find what grew; raise the budget in scripts/release/build.ts only if the growth is meant.`,
		);
	}
	return { tarball: path.relative(CHECKOUT, tarball), bytes, budget };
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const platforms = await Promise.all(TARGETS.map(platformPackage));
for (const name of LAUNCHERS) launcherPackage(name, platforms);
const packed = [...platforms, ...LAUNCHERS].map((name) => ({ name, ...pack(name) }));
process.stdout.write(
	`${JSON.stringify({ version: root.version, packages: packed }, null, "\t")}\n`,
);
