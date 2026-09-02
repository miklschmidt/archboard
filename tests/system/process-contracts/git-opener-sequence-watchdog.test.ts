import { expect, test } from "bun:test";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "../../..");
const OWNERS = [
	"src/runtime/engine/tests/git-async.test.ts",
	"tests/system/code-targets/settings-contract.test.ts",
	"tests/system/code-targets/activation-contract.test.ts",
	"tests/system/code-targets/opener-persistence.test.ts",
] as const;
const WATCHDOG_MS = 20_000;

function groupExists(pgid: number): boolean {
	try {
		process.kill(-pgid, 0);
		return true;
	} catch (cause) {
		if ((cause as NodeJS.ErrnoException).code === "ESRCH") return false;
		throw cause;
	}
}

test("Git lifecycle and the former opener deadlock sequence settle under an external watchdog", async () => {
	const child = Bun.spawn(
		[process.execPath, "test", "--isolate", "--max-concurrency=1", ...OWNERS],
		{
			cwd: ROOT,
			detached: true,
			stdin: "ignore",
			stdout: "pipe",
			stderr: "pipe",
			env: { ...process.env, ARCHBOARD_REPOS: resolve(ROOT, ".absent-watchdog-repos.json") },
		},
	);
	const stdout = new Response(child.stdout).text();
	const stderr = new Response(child.stderr).text();
	let timer: ReturnType<typeof setTimeout> | undefined;
	const result = await Promise.race([
		child.exited.then((exitCode) => ({ exitCode, timedOut: false as const })),
		new Promise<{ exitCode: null; timedOut: true }>((resolveTimeout) => {
			timer = setTimeout(() => resolveTimeout({ exitCode: null, timedOut: true }), WATCHDOG_MS);
		}),
	]);
	if (timer !== undefined) clearTimeout(timer);
	if (result.timedOut) {
		try {
			process.kill(-child.pid, "SIGKILL");
		} catch (cause) {
			if ((cause as NodeJS.ErrnoException).code !== "ESRCH") throw cause;
		}
		await child.exited;
	}
	const [out, err] = await Promise.all([stdout, stderr]);
	const output = `${out}\n${err}`;
	expect(result.timedOut, `watchdog expired\nstdout:\n${out}\nstderr:\n${err}`).toBeFalse();
	expect(result.exitCode, `stdout:\n${out}\nstderr:\n${err}`).toBe(0);
	for (const owner of OWNERS) expect(output).toContain(owner);
	const deadline = Date.now() + 1_000;
	while (groupExists(child.pid) && Date.now() < deadline) await Bun.sleep(5);
	expect(groupExists(child.pid), `process group ${child.pid} survived`).toBeFalse();
});
