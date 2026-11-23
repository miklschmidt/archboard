import { describe, expect, spyOn, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ownProcess, runProcess } from "#runtime/evaluation/processes/process.ts";
import { startServer } from "#runtime/evaluation/run-world/processes/server.ts";
import { readProcessObservation } from "@archboard/process/observation";
import { ms } from "@archboard/timing";

/** A short pause for the test's own looks, and the shortened phase of a stop. */
const TEST_POLL_MS = 100;

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
				timeoutMs: ms("skillEval.healthRequest"),
			});
			expect(result.exitCode).toBe(0);
		}
	});
	test("retains output and exit status and cleans descendants after the leader exits", async () => {
		const result = await runProcess({
			argv: ["sh", "-c", "sleep 60 & echo $!; echo problem >&2; exit 7"],
			cwd,
			env,
			timeoutMs: ms("skillEval.healthRequest"),
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
				timeoutMs: ms("skillEval.healthRequest"),
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
		const owner = await ownProcess(child);
		// Each phase of the stop is shortened by name, so TERM's refusal costs a tenth of a second.
		const schedule = globalThis.setTimeout;
		globalThis.setTimeout = ((
			handler: (...args: unknown[]) => void,
			delay?: number,
			...args: unknown[]
		) =>
			schedule(
				handler,
				args[0] === "skillEval.groupStop" ? TEST_POLL_MS : delay,
				...args,
			)) as typeof globalThis.setTimeout;
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
			globalThis.setTimeout = schedule;
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
					timeoutMs: ms("skillEval.healthRequest"),
					signal: AbortSignal.abort(),
				}),
			).rejects.toBeInstanceOf(Error);
			expect(existsSync(output)).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});

test("cancellation during a successful health probe stops the server and its inherited child", async () => {
	const root = mkdtempSync(path.join(tmpdir(), "skill-server-cancel-"));
	const controller = new AbortController();
	const cancelled = new Error("Cancelled during the health probe.");
	const pids = path.join(root, "pids");
	mkdirSync(path.join(root, "apps/server/src"), { recursive: true });
	writeFileSync(
		path.join(root, "apps/server/src/server.ts"),
		`
		const child = Bun.spawn(["sleep", "60"], { stdout: "ignore", stderr: "ignore" });
		await Bun.write(${JSON.stringify(pids)}, JSON.stringify([process.pid, child.pid]));
		Bun.serve({ port: Number(process.env.PORT), fetch() { return Response.json({ pid: process.pid }); } });
	`,
	);
	const fetchHealth = globalThis.fetch;
	const healthProbe = spyOn(globalThis, "fetch").mockImplementation(
		Object.assign(
			async (...args: Parameters<typeof fetchHealth>) => {
				const response = await fetchHealth(...args);
				if (response.ok) controller.abort(cancelled);
				return response;
			},
			{ preconnect: fetchHealth.preconnect },
		),
	);
	let server: Awaited<ReturnType<typeof startServer>> | undefined;
	try {
		await expect(
			startServer(root, { serverLog: path.join(root, "server.log") }, env, controller.signal).then(
				(started) => (server = started),
			),
		).rejects.toBe(cancelled);
		const identities: number[] = JSON.parse(readFileSync(pids, "utf8"));
		identities.forEach(expectStopped);
	} finally {
		healthProbe.mockRestore();
		await server?.stop();
		rmSync(root, { recursive: true, force: true });
	}
});
