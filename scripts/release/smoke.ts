// The smoke test of a release (ADR 0076): install the packed packages from a registry, as a user
// does, then run the installed `archboard` with a PATH that holds no Bun, Node.js or Rust:
// `--version`, `start`, `status` and `stop`.
//
//   bun scripts/release/smoke.ts --installer <npm|bun> [--name <archboard|@archboard/cli>]
//                                [--packages <directory of the tarballs>] [--keep]
//
// npm has not seen the packages yet, so a local registry serves the tarballs of `bun run release`
// and passes every other request to registry.npmjs.org: the Codex platform package comes from
// npm under its alias, as it does for a user. The script imports nothing from the checkout, so a
// runner with Bun and npm and no dev shell runs it. Every server state lives in a scratch
// directory, and the server listens on a free loopback port.

import { createHash } from "node:crypto";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	realpathSync,
	rmSync,
} from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";

const UPSTREAM = "https://registry.npmjs.org";
const RELEASED = new Set(["linux-x64", "linux-arm64", "darwin-arm64"]);
/** The directories of the PATH that `archboard` runs with, besides the bin of the install. */
const SYSTEM_PATH = ["/run/current-system/sw/bin", "/usr/bin", "/bin", "/usr/sbin", "/sbin"];
/** The programs that the PATH of the run must not hold, because a release needs none of them. */
const BUILD_TOOLS = ["bun", "node", "nodejs", "npm", "npx", "cargo", "rustc"];
const COMMAND_MS = 120_000;

/** One packed package. */
interface Packed {
	readonly name: string;
	readonly version: string;
	readonly manifest: Record<string, unknown>;
	readonly file: string;
	/** The `dist` digests of the tarball, which the installer checks. */
	readonly integrity: string;
	readonly shasum: string;
}

/**
 * Stop with a message that says what failed.
 * @param message What failed.
 * @throws {Error} Always.
 */
function fail(message: string): never {
	throw new Error(message);
}

/**
 * A parsed JSON object, refused when it is none.
 * @param text The JSON text.
 * @param what What it is, for the refusal.
 * @returns Its fields.
 */
function jsonObject(text: string, what: string): Record<string, unknown> {
	const parsed: unknown = JSON.parse(text);
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
		fail(`${what} is no JSON object.`);
	}
	return Object.fromEntries(Object.entries(parsed));
}

/**
 * Read one tarball and its manifest.
 * @param file The tarball.
 * @returns The package.
 */
function readPacked(file: string): Packed {
	const extracted = Bun.spawnSync(["tar", "-xzOf", file, "package/package.json"], {
		stdout: "pipe",
		stderr: "pipe",
	});
	if (extracted.exitCode !== 0) fail(`${file} holds no package/package.json.`);
	const manifest = jsonObject(extracted.stdout.toString(), `The manifest of ${file}`);
	const { name, version } = manifest;
	if (typeof name !== "string" || typeof version !== "string") fail(`${file} names no package.`);
	const bytes = readFileSync(file);
	return {
		name,
		version,
		manifest,
		file,
		integrity: `sha512-${createHash("sha512").update(bytes).digest("base64")}`,
		shasum: createHash("sha1").update(bytes).digest("hex"),
	};
}

/**
 * The registry document of one local package, which npm and Bun read before they download it.
 * @param packed The package.
 * @param origin The registry's address.
 * @returns The document.
 */
function packument(packed: Packed, origin: string): object {
	const { integrity, shasum } = packed;
	return {
		name: packed.name,
		"dist-tags": { latest: packed.version },
		versions: {
			[packed.version]: {
				...packed.manifest,
				_id: `${packed.name}@${packed.version}`,
				dist: { tarball: `${origin}/-/tarball/${path.basename(packed.file)}`, integrity, shasum },
			},
		},
	};
}

/**
 * Serve the local packages, and pass every other request to npm.
 * @param packages The local packages.
 * @returns The registry's address and a function that stops it.
 */
function startRegistry(packages: readonly Packed[]): { origin: string; stop: () => void } {
	const byName = new Map(packages.map((packed) => [packed.name, packed]));
	const byFile = new Map(packages.map((packed) => [path.basename(packed.file), packed]));
	/**
	 * Answer one request: a local tarball, the document of a local package, or npm's answer.
	 * @param request The request.
	 * @returns The answer.
	 */
	async function answer(request: Request): Promise<Response> {
		const url = new URL(request.url);
		const tarball = byFile.get(url.pathname.replace(/^\/-\/tarball\//, ""));
		if (tarball !== undefined) return new Response(Bun.file(tarball.file));
		const local = byName.get(decodeURIComponent(url.pathname.slice(1)));
		if (local !== undefined) return Response.json(packument(local, url.origin));
		const upstream = await fetch(`${UPSTREAM}${url.pathname}${url.search}`, {
			headers: { accept: request.headers.get("accept") ?? "application/json" },
		});
		return new Response(await upstream.arrayBuffer(), {
			status: upstream.status,
			headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
		});
	}
	const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: answer });
	return {
		origin: `http://127.0.0.1:${String(server.port)}`,
		/** Stop the registry and its connections. */
		stop: () => {
			void server.stop(true);
		},
	};
}

/**
 * A loopback port that nothing listens on.
 * @returns The port.
 */
async function freePort(): Promise<number> {
	const server = createServer();
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address();
	await new Promise((resolve) => server.close(resolve));
	return typeof address === "object" && address !== null ? address.port : fail("No free port.");
}

/**
 * Run a command to completion and require that it succeeds. The registry answers on the event
 * loop of this process, so the command never blocks that loop.
 * @param command The command and its arguments.
 * @param options Where it runs and its environment.
 * @param options.cwd Where it runs.
 * @param options.env Its environment.
 * @returns Its standard output.
 */
async function run(
	command: readonly string[],
	options: { readonly cwd: string; readonly env: Record<string, string | undefined> },
): Promise<string> {
	const child = Bun.spawn([...command], {
		...options,
		stdout: "pipe",
		stderr: "pipe",
		timeout: COMMAND_MS,
	});
	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
		child.exited,
	]);
	if (exitCode !== 0) {
		fail(`${command.join(" ")} exited with ${String(exitCode)}:\n${stdout}${stderr}`);
	}
	process.stdout.write(`$ ${command.join(" ")}\n${stdout}${stderr}`);
	return stdout;
}

/**
 * Install one launcher from the registry into a scratch directory.
 * @param installer `npm` or `bun`.
 * @param spec The package and its version.
 * @param origin The registry's address.
 * @param scratch The scratch directory.
 * @returns The directory that the install puts `archboard` in.
 */
async function install(
	installer: string,
	spec: string,
	origin: string,
	scratch: string,
): Promise<string> {
	const work = { cwd: scratch, env: process.env };
	if (installer === "npm") {
		const prefix = path.join(scratch, "npm");
		const npm = Bun.which("npm") ?? fail("npm is not on PATH.");
		const flags = ["--global", "--prefix", prefix, "--registry", origin, "--no-audit", "--no-fund"];
		await run([npm, "install", ...flags, spec], work);
		return path.join(prefix, "bin");
	}
	const home = path.join(scratch, "bun");
	await run([process.execPath, "add", "--global", spec], {
		...work,
		env: { ...process.env, BUN_INSTALL: home, BUN_CONFIG_REGISTRY: origin },
	});
	return path.join(home, "bin");
}

/**
 * The PATH of the run, refused when it holds a build tool.
 * @param bin The bin of the install.
 * @returns The PATH.
 */
function barePath(bin: string): string {
	const directories = [bin, ...SYSTEM_PATH.filter((directory) => existsSync(directory))];
	const found = directories.flatMap((directory) =>
		BUILD_TOOLS.map((tool) => path.join(directory, tool)).filter((file) => existsSync(file)),
	);
	if (found.length > 0)
		fail(`The PATH of the run holds ${found.join(", ")}, so it proves nothing.`);
	return directories.join(path.delimiter);
}

/**
 * Run `--version`, `start`, `status` and `stop` with the installed `archboard`.
 * @param bin The bin of the install.
 * @param version The version it must report.
 * @param scratch The scratch directory.
 */
async function smoke(bin: string, version: string, scratch: string): Promise<void> {
	const archboard = path.join(bin, "archboard");
	const cwd = path.join(scratch, "work");
	mkdirSync(cwd);
	const env = {
		PATH: barePath(bin),
		HOME: path.join(scratch, "home"),
		XDG_STATE_HOME: path.join(scratch, "state"),
		XDG_CONFIG_HOME: path.join(scratch, "config"),
		XDG_DATA_HOME: path.join(scratch, "data"),
		XDG_CACHE_HOME: path.join(scratch, "cache"),
		CODEX_HOME: path.join(scratch, "codex-home"),
		ARCHBOARD_URL: `http://127.0.0.1:${String(await freePort())}`,
	};
	const at = { cwd, env };
	const reported = (await run([archboard, "--version"], at)).trim();
	if (reported !== version) fail(`archboard --version said ${reported}, not ${version}.`);
	try {
		const started = jsonObject(await run([archboard, "start"], at), "The answer of start");
		if (started["running"] !== true) fail("archboard start did not report a running server.");
		const status = jsonObject(await run([archboard, "status"], at), "The answer of status");
		if (status["mode"] !== "release" || status["version"] !== version) {
			fail(
				`archboard status reported a ${String(status["mode"])} server of ${String(status["version"])}.`,
			);
		}
	} finally {
		await run([archboard, "stop"], at);
	}
}

const { values } = parseArgs({
	options: {
		installer: { type: "string" },
		name: { type: "string", default: "archboard" },
		packages: { type: "string", default: path.resolve(import.meta.dir, "../../dist/release") },
		keep: { type: "boolean", default: false },
	},
});
if (
	(values.installer !== "npm" && values.installer !== "bun") ||
	!["archboard", "@archboard/cli"].includes(values.name)
) {
	process.stderr.write(
		"Usage: bun scripts/release/smoke.ts --installer <npm|bun> [--name <archboard|@archboard/cli>] [--packages <directory>] [--keep]\n",
	);
	process.exit(2);
}
const platform = `${process.platform}-${process.arch}`;
if (!RELEASED.has(platform)) fail(`Archboard has no release for ${platform}.`);
const packages = readdirSync(values.packages)
	.filter((file) => file.endsWith(".tgz"))
	.map((file) => readPacked(path.join(values.packages, file)));
const launcher =
	packages.find(({ name }) => name === values.name) ??
	fail(`${values.packages} holds no ${values.name} tarball.`);
const registry = startRegistry(packages);
const scratch = realpathSync(mkdtempSync(path.join(tmpdir(), "archboard-smoke-")));
try {
	const bin = await install(
		values.installer,
		`${launcher.name}@${launcher.version}`,
		registry.origin,
		scratch,
	);
	process.stdout.write(`archboard is ${realpathSync(path.join(bin, "archboard"))}\n`);
	await smoke(bin, launcher.version, scratch);
	process.stdout.write(
		`The ${values.installer} install of ${launcher.name}@${launcher.version} passed the smoke test on ${platform}.\n`,
	);
} finally {
	registry.stop();
	if (values.keep) process.stdout.write(`Kept ${scratch}.\n`);
	else rmSync(scratch, { recursive: true, force: true });
}
