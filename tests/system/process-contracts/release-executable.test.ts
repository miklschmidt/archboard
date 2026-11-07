// The compiled executable of a release runs outside any checkout (ADR 0076): the platform package
// that scripts/release/compile.ts lays out, with the Codex package of its platform beside it and
// no Bun on PATH, starts its server, authors and renders a model, checks its code and stops.
import { afterAll, expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	realpathSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { freeLoopbackPort } from "../support/loopback-port.ts"; // sibling support of the system tests

const root = path.resolve(import.meta.dir, "../../..");
const platform = `${process.platform}-${process.arch}`;
/** The platforms a release is built for, as the Bun target and the Codex package suffix name them. */
const RELEASED = new Set(["linux-x64", "linux-arm64", "darwin-arm64"]);
const scratch = realpathSync(mkdtempSync(path.join(tmpdir(), "archboard-release-")));

afterAll(() => {
	rmSync(scratch, { recursive: true, force: true });
});

/**
 * Run a command to completion.
 * @param command The command and its arguments.
 * @param options Where it runs and its environment.
 * @param options.cwd Where it runs.
 * @param options.env Its whole environment.
 * @returns Its exit status and output.
 */
function run(
	command: readonly string[],
	options: { readonly cwd: string; readonly env?: Record<string, string> },
): { readonly exitCode: number; readonly stdout: string; readonly output: string } {
	const result = Bun.spawnSync([...command], { ...options, stdout: "pipe", stderr: "pipe" });
	const stdout = result.stdout.toString();
	return { exitCode: result.exitCode, stdout, output: `${stdout}${result.stderr.toString()}` };
}

/**
 * The JSON answer of a command that must succeed.
 * @param command The command and its arguments.
 * @param options Where it runs and its environment.
 * @param options.cwd Where it runs.
 * @param options.env Its whole environment.
 * @returns The parsed standard output.
 */
function answer(
	command: readonly string[],
	options: { readonly cwd: string; readonly env: Record<string, string> },
): Record<string, unknown> {
	const result = run(command, options);
	expect(result.exitCode, `${command.join(" ")}\n${result.output}`).toBe(0);
	return JSON.parse(result.stdout) as Record<string, unknown>;
}

test.skipIf(!RELEASED.has(platform))(
	"a release runs start, model read, a render, the code check and stop outside any checkout",
	async () => {
		const pkg = path.join(scratch, "package");
		const compiled = run(
			["bun", "scripts/release/compile.ts", "--target", `bun-${platform}`, "--out", pkg],
			{ cwd: root },
		);
		expect(compiled.exitCode, compiled.output).toBe(0);
		const codex = path.join(scratch, "node_modules", "@openai", `codex-${platform}`);
		mkdirSync(path.dirname(codex), { recursive: true });
		symlinkSync(
			realpathSync(path.join(root, "node_modules", "@openai", `codex-${platform}`)),
			codex,
		);
		// A PATH with git and nothing else, so the release can start no Bun, Node.js or Rust.
		const bin = path.join(scratch, "path");
		mkdirSync(bin);
		symlinkSync(Bun.which("git") ?? "git", path.join(bin, "git"));

		const repo = path.join(scratch, "repo");
		mkdirSync(path.join(repo, "src"), { recursive: true });
		writeFileSync(path.join(repo, "go.mod"), "module example.com/shop\n\ngo 1.22\n");
		writeFileSync(path.join(repo, "src", "store.go"), "package store\n\nfunc Save() {}\n");
		const env = {
			PATH: bin,
			XDG_STATE_HOME: path.join(scratch, "state"),
			CODEX_HOME: path.join(scratch, "codex-home"),
			ARCHBOARD_URL: `http://127.0.0.1:${String(await freeLoopbackPort())}`,
			GIT_AUTHOR_NAME: "Release",
			GIT_AUTHOR_EMAIL: "release@example.com",
			GIT_COMMITTER_NAME: "Release",
			GIT_COMMITTER_EMAIL: "release@example.com",
			GIT_CONFIG_GLOBAL: "/dev/null",
			GIT_CONFIG_NOSYSTEM: "1",
		};
		const archboard = path.join(pkg, "bin", "archboard");
		const inRepo = { cwd: repo, env };
		for (const step of [
			["init", "-q", "."],
			["add", "."],
			["commit", "-qm", "a shop"],
		]) {
			expect(run(["git", ...step], inRepo).exitCode).toBe(0);
		}

		const marker = JSON.parse(readFileSync(path.join(pkg, "archboard-release.json"), "utf8")) as {
			version: string;
		};
		expect(run([archboard, "--version"], inRepo).stdout.trim()).toBe(marker.version);
		try {
			expect(answer([archboard, "start"], inRepo)["running"]).toBe(true);
			const health = (await (await fetch(`${env.ARCHBOARD_URL}/health`)).json()) as {
				mode: string;
			};
			expect(health.mode).toBe("release");

			answer([archboard, "install-skill", "--dir", path.join(scratch, "skills")], inRepo);
			const empty = answer([archboard, "model", "read"], inRepo) as {
				manifest: { id: string };
				revision: unknown;
			};
			const model = empty.manifest.id;
			const claimFile = path.join(scratch, "claim.json");
			writeFileSync(
				claimFile,
				JSON.stringify({
					target: { model, state: null },
					writer: "release-test",
					reason: "a shop",
					subjects: [model],
				}),
			);
			const claim = answer([archboard, "model", "claim", "--input", claimFile], inRepo) as {
				claim: { id: string };
			};
			const editFile = path.join(scratch, "edit.json");
			writeFileSync(
				editFile,
				JSON.stringify({
					target: { model, state: null },
					expectedRevision: empty.revision,
					operationId: "release-shop-1",
					writer: "release-test",
					claim: claim.claim.id,
					proposal: { type: "create", name: "Shop" },
					changes: [
						{ type: "add-module", module: { name: "Shop", kind: "service", order: 10 } },
						{
							type: "add-module",
							module: {
								name: "Store",
								kind: "module",
								order: 20,
								binding: { repo: "repo", path: "src/store.go", symbol: "Save" },
							},
						},
						{
							type: "add-module",
							module: {
								name: "Ghost",
								kind: "module",
								order: 30,
								binding: { repo: "repo", path: "src/store.go", symbol: "Load" },
							},
						},
						{
							type: "add-relationship",
							source: "Shop",
							relationship: { to: "Store", kind: "call", order: 10 },
						},
					],
				}),
			);
			answer(
				[archboard, "model", "edit", "--input", editFile, "--doing", "drawing a shop"],
				inRepo,
			);

			const read = answer([archboard, "model", "read", "--state", "Shop"], inRepo) as {
				modules: { name: string }[];
			};
			expect(read.modules.map((module) => module.name).toSorted()).toEqual([
				"Ghost",
				"Shop",
				"Store",
			]);
			const picture = path.join(scratch, "shop.svg");
			answer([archboard, "model", "render", "--state", "Shop", "--out", picture], inRepo);
			expect(readFileSync(picture, "utf8")).toStartWith("<svg");
			// The Go grammar reads the file: it defines Save, and it does not define Load.
			const checked = run([archboard, "check", "code", "--state", "Shop"], inRepo);
			const findings = (
				JSON.parse(checked.stdout) as {
					code: { findings: { code: string; subject: { name: string } }[] };
				}
			).code.findings;
			expect(
				findings
					.filter((finding) => finding.code === "BINDING_SYMBOL_MISSING")
					.map((finding) => finding.subject.name),
			).toEqual(["Ghost"]);
		} finally {
			const stopped = run([archboard, "stop"], inRepo);
			expect(stopped.exitCode, stopped.output).toBe(0);
		}
		expect(existsSync(path.join(scratch, "skills", "archboard"))).toBe(true);
	},
	120_000,
);
