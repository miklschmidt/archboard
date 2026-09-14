import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ownProcess, runProcess, startCanvas } from "@/runtime/skill-evaluation/index";
import { readProcessObservation } from "@/shared/process-observation";
import { SKILL_EVAL_HEALTH_POLL_MS, SKILL_EVAL_HEALTH_REQUEST_MS } from "@/shared/timing/timing";

const env = { PATH: process.env["PATH"] ?? "" };
const cwd = process.cwd();

function expectStopped(pid: number): void {
	expect(pid).toBeGreaterThan(0);
	expect(readProcessObservation(pid)?.state).not.toBe("live");
}

describe("evaluation process ownership with local shell fakes", () => {
	test("accepts commands that finish immediately", async () => {
		for (let attempt = 0; attempt < 20; attempt++) {
			const result = await runProcess({
				argv: ["true"],
				cwd,
				env,
				timeoutMs: SKILL_EVAL_HEALTH_REQUEST_MS,
			});
			expect(result.exitCode).toBe(0);
		}
	});
	test("retains output and exit status and cleans descendants after the leader exits", async () => {
		const result = await runProcess({
			argv: ["sh", "-c", "sleep 60 & echo $!; echo problem >&2; exit 7"],
			cwd,
			env,
			timeoutMs: SKILL_EVAL_HEALTH_REQUEST_MS,
		});
		expect(result).toMatchObject({
			exitCode: 7,
			stderr: "problem\n",
			timedOut: false,
			cancelled: false,
		});
		expectStopped(Number(result.stdout.trim()));
	});

	test.each(["timeout", "cancel", "sink-failure"] as const)(
		"cleans inherited pipes and descendants on %s",
		async (ending) => {
			const controller = new AbortController();
			let descendant = 0;
			const pending = runProcess({
				argv: ["sh", "-c", "sleep 60 & echo $!; wait"],
				cwd,
				env,
				timeoutMs: SKILL_EVAL_HEALTH_REQUEST_MS,
				signal: controller.signal,
				onStdout: (chunk) => {
					descendant = Number(chunk.trim());
					if (ending === "cancel") controller.abort();
					if (ending === "sink-failure") throw new Error("synthetic sink failure");
				},
			});
			if (ending === "sink-failure") {
				await expect(pending).rejects.toBeInstanceOf(Error);
			} else {
				const result = await pending;
				expect(result).toMatchObject({
					timedOut: ending === "timeout",
					cancelled: ending === "cancel",
				});
			}
			expectStopped(descendant);
		},
	);

	test("escalates the whole group when a descendant ignores TERM, and stop is idempotent", async () => {
		const child = Bun.spawn(["sh", "-c", "trap '' TERM; sleep 60 & echo $!; wait"], {
			cwd,
			env,
			detached: true,
			stdin: "ignore",
			stdout: "pipe",
			stderr: "ignore",
		});
		const owner = await ownProcess(child, SKILL_EVAL_HEALTH_POLL_MS);
		try {
			const reader = child.stdout.getReader();
			const { value } = await reader.read();
			reader.releaseLock();
			const descendant = Number(new TextDecoder().decode(value).trim());
			const stopping = owner.stop();
			expect(owner.stop()).toBe(stopping);
			await stopping;
			expectStopped(child.pid);
			expectStopped(descendant);
		} finally {
			await owner.stop();
		}
	});

	test("an already cancelled request never starts its command", async () => {
		const root = mkdtempSync(path.join(tmpdir(), "skill-process-cancel-"));
		try {
			const output = path.join(root, "started");
			await expect(
				runProcess({
					argv: ["touch", output],
					cwd,
					env,
					timeoutMs: SKILL_EVAL_HEALTH_REQUEST_MS,
					signal: AbortSignal.abort(),
				}),
			).rejects.toBeInstanceOf(Error);
			expect(existsSync(output)).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});

test("cancelled canvas readiness stops the exact fake server and its inherited child", async () => {
	const root = mkdtempSync(path.join(tmpdir(), "skill-canvas-cancel-"));
	const controller = new AbortController();
	const pids = path.join(root, "pids");
	mkdirSync(path.join(root, "src"));
	writeFileSync(
		path.join(root, "src/server.ts"),
		`
		const child = Bun.spawn(["sleep", "60"], { stdout: "ignore", stderr: "ignore" });
		await Bun.write(${JSON.stringify(pids)}, JSON.stringify([process.pid, child.pid]));
		Bun.serve({ port: Number(process.env.PORT), fetch() { return Response.json({ pid: 0 }); } });
	`,
	);
	let timer: ReturnType<typeof setInterval> | undefined;
	try {
		timer = setInterval(() => {
			if (existsSync(pids)) controller.abort();
		}, SKILL_EVAL_HEALTH_POLL_MS);
		await expect(
			startCanvas(root, { canvasLog: path.join(root, "canvas.log") }, env, controller.signal),
		).rejects.toBeInstanceOf(Error);
		const identities: number[] = JSON.parse(readFileSync(pids, "utf8"));
		identities.forEach(expectStopped);
	} finally {
		clearInterval(timer);
		rmSync(root, { recursive: true, force: true });
	}
});
