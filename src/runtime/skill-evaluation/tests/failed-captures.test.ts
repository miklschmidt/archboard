import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { SemanticRasterReceipt } from "@/runtime/semantic-rasterizer/receipt";
import {
	executeRun,
	loadSuite,
	type RunBundle,
	type RunJob,
} from "@/runtime/skill-evaluation/index";

const checkout = path.resolve(import.meta.dir, "../../../..");
const loaded = loadSuite(path.join(checkout, "evals"));

const CAPTURE_RECEIPT = {
	success: true,
	version: 3,
	variant: { id: "v1", name: "Local stacks", lifecycle: "current" },
	view: { id: "w1", name: "Contexts", grammar: "architecture" },
	theme: "light",
	width: 1,
	height: 1,
	scale: 1,
	diagram: { width: 1, height: 1 },
	region: null,
	source: {
		renderer: "semantic-renderer",
		fonts: "embedded",
		svgSha256: "ab".repeat(32),
		facesLoaded: 4,
		motion: "paused-at-start",
	},
} satisfies Omit<SemanticRasterReceipt, "board" | "file">;

/** A job that cannot run a model, using a scenario with two declared captures. */
function jobAt(root: string, signal = new AbortController().signal): RunJob {
	const scenario = loaded.suite.evals.find((entry) => entry.id === "S02");
	const fixture = loaded.fixtures.get("S02");
	if (scenario === undefined || fixture === undefined) throw new Error("missing fixture");
	return {
		arm: "candidate",
		scenario,
		fixture,
		repetition: 1,
		root: path.join(root, "run"),
		batchRoot: root,
		salt: "failed-captures",
		checkout,
		cache: path.join(root, "absent-cache"),
		pins: {
			...loaded.pins,
			codex: { ...loaded.pins.codex, executable: path.join(root, "no-model") },
		},
		frozenSkill: "unused",
		signal,
	};
}

/** Read the durable artifact the grader discovers, independently of the returned run. */
function savedBundle(job: RunJob): RunBundle {
	return JSON.parse(readFileSync(path.join(job.root, "bundle.json"), "utf8"));
}

describe("failed runs keep grader capture evidence", () => {
	test.each([false, true])("unavailable canvas, cancelled=%s", async (cancelled) => {
		const root = mkdtempSync(path.join(tmpdir(), "failed-captures-"));
		try {
			const job = jobAt(root, cancelled ? AbortSignal.abort() : undefined);
			const run = await executeRun(job);
			const bundle = savedBundle(job);
			expect(bundle.status).toBe(cancelled ? "cancelled" : "failed");
			expect(bundle.captures.map((capture) => capture.label)).toEqual(
				job.scenario.captures.map((capture) => capture.label),
			);
			for (const capture of bundle.captures) {
				expect(capture.ok).toBe(false);
				expect(capture.detail.length).toBeGreaterThan(0);
				expect(capture.file).toBeNull();
				expect(capture.provenance).toBeNull();
			}
			expect(bundle.harnessOutcomes[0]?.passed).toBe(false);
			expect(run.status).toBe(bundle.status);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("an available capture and a refusal survive a setup failure in the blinded bundle", async () => {
		const root = mkdtempSync(path.join(tmpdir(), "partial-captures-"));
		try {
			const cache = path.join(root, "cache");
			mkdirSync(cache);
			for (const args of [
				["init", "--quiet"],
				[
					"-c",
					"user.name=Test",
					"-c",
					"user.email=test@example.invalid",
					"-c",
					"commit.gpgsign=false",
					"commit",
					"--quiet",
					"--allow-empty",
					"-m",
					"fixture",
				],
			]) {
				const result = Bun.spawnSync(["git", ...args], { cwd: cache });
				expect(result.exitCode, result.stderr.toString()).toBe(0);
			}
			const commit = Bun.spawnSync(["git", "rev-parse", "HEAD"], { cwd: cache })
				.stdout.toString()
				.trim();
			const fake = path.join(root, "fake");
			mkdirSync(path.join(fake, "src"), { recursive: true });
			writeFileSync(
				path.join(fake, "src/server.ts"),
				`
				Bun.serve({ hostname: "127.0.0.1", port: Number(process.env.PORT),
					fetch() { return Response.json({ pid: process.pid }); } });
			`,
			);
			writeFileSync(
				path.join(fake, "src/bin.ts"),
				`
				const args = process.argv.slice(2);
				if (args[0] === "install-skill") {
					console.error("setup failed"); process.exit(71);
				}
				if (args.includes("--variant")) {
					console.error("capture failed"); process.exit(72);
				}
				const file = args[args.indexOf("--out") + 1];
				await Bun.write(file, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aDR8AAAAASUVORK5CYII=", "base64"));
				console.log(JSON.stringify({ ...${JSON.stringify(CAPTURE_RECEIPT)}, board: args[2], file }));
			`,
			);
			const base = jobAt(root);
			const job = {
				...base,
				cache,
				checkout: fake,
				pins: {
					...base.pins,
					flask: {
						...base.pins.flask,
						revisions: { ...base.pins.flask.revisions, [base.scenario.flask]: commit },
					},
				},
			};
			const run = await executeRun(job);
			const bundle = savedBundle(job);
			expect(run.status).toBe("failed");
			expect(
				bundle.captures.map((capture) => capture.ok),
				JSON.stringify(bundle),
			).toEqual([true, false]);
			expect(bundle.captures[0]?.provenance?.version).toBe(3);
			expect(bundle.captures[0]?.file).toStartWith("captures/");
			expect(bundle.captures[1]?.file).toBeNull();
			expect(bundle.harnessOutcomes[0]?.detail).toContain("71");
			expect(bundle.captures[1]?.detail).toContain("72");
			expect(JSON.stringify(bundle)).not.toContain(job.root);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
