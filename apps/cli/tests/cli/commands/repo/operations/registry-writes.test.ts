// Every repo command that changes the registry reads it, changes it and writes
// it whole under a lock (TASK-433): commands that run together keep every
// change, a lock that a dead process left behind lapses, and a registry that
// cannot be written makes the command exit 1 with the file as it was.

import { afterAll, beforeAll, expect, spyOn, test } from "bun:test";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	realpathSync,
	rmSync,
	utimesSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const cwd = process.cwd();
const reposFile = process.env["ARCHBOARD_REPOS"];
const NAMES = ["orders", "billing", "ledger", "audit"] as const;
let scratch = "";
let registry = "";
let runCli: (argv: string[]) => Promise<void>;

/**
 * The checkout of one repository in the scratch directory.
 * @param name Its name.
 * @returns Its root.
 */
const checkoutOf = (name: string): string => join(scratch, name);

beforeAll(async () => {
	scratch = realpathSync(mkdtempSync(join(tmpdir(), "archboard-registry-writes-")));
	registry = join(scratch, "repos.json");
	process.env["ARCHBOARD_REPOS"] = registry;
	for (const name of NAMES) {
		const done = Bun.spawnSync(["git", "init", "-q", checkoutOf(name)], {
			cwd: scratch,
			env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null" },
		});
		if (done.exitCode !== 0) throw new Error(done.stderr.toString());
		Bun.spawnSync(["git", "remote", "add", "origin", `https://github.com/test/${name}.git`], {
			cwd: checkoutOf(name),
		});
	}
	({ runCli } = await import("#cli/routing/operations/run.ts"));
});

afterAll(() => {
	process.chdir(cwd);
	if (reposFile === undefined) delete process.env["ARCHBOARD_REPOS"];
	else process.env["ARCHBOARD_REPOS"] = reposFile;
	rmSync(scratch, { recursive: true, force: true });
});

/**
 * Run the CLI in a directory and capture how it exited.
 * @param directory Where it runs.
 * @param argv The arguments.
 * @returns Its exit code.
 */
async function run(directory: string, argv: string[]): Promise<number | string | undefined> {
	process.chdir(directory);
	const out = spyOn(process.stdout, "write").mockImplementation(() => true);
	const err = spyOn(process.stderr, "write").mockImplementation(() => true);
	process.exitCode = 0;
	try {
		await runCli(argv);
		return process.exitCode;
	} finally {
		out.mockRestore();
		err.mockRestore();
		process.exitCode = 0;
	}
}

/**
 * The roots that the registry file holds.
 * @returns Them, sorted.
 */
function registeredRoots(): string[] {
	const stored = JSON.parse(readFileSync(registry, "utf8")) as { root: string }[];
	return stored.map((entry) => entry.root).toSorted();
}

test("repo commands that run together keep every change", async () => {
	rmSync(registry, { force: true });
	const cli = join(import.meta.dir, "..", "..", "..", "..", "..", "src", "bin.ts");
	const exits = await Promise.all(
		NAMES.map(
			(name) =>
				Bun.spawn([process.execPath, cli, "repo", "add", "."], {
					cwd: checkoutOf(name),
					env: { ...process.env },
					stdout: "ignore",
					stderr: "ignore",
				}).exited,
		),
	);
	expect(exits).toEqual([0, 0, 0, 0]);
	expect(registeredRoots()).toEqual(NAMES.map(checkoutOf).toSorted());
});

test("a repo command takes the lock that a process that died left behind", async () => {
	rmSync(registry, { force: true });
	const lock = `${registry}.lock`;
	mkdirSync(lock);
	const longAgo = new Date(Date.now() - 60_000);
	utimesSync(lock, longAgo, longAgo);
	expect(await run(checkoutOf("orders"), ["repo", "add", "."])).toBe(0);
	expect(existsSync(lock)).toBe(false);
	expect(registeredRoots()).toEqual([checkoutOf("orders")]);
});

test.skipIf(process.getuid?.() === 0)(
	"a repo command exits 1 and leaves the registry as it was when it cannot write it",
	async () => {
		const readOnly = join(scratch, "read-only");
		const file = join(readOnly, "repos.json");
		mkdirSync(readOnly);
		const stored = [
			{
				repo: "github.com/test/orders",
				root: checkoutOf("orders"),
				source: "declared",
				addedAt: "2026-10-01",
			},
		];
		writeFileSync(file, JSON.stringify(stored));
		process.env["ARCHBOARD_REPOS"] = file;
		chmodSync(readOnly, 0o500);
		try {
			expect(await run(checkoutOf("billing"), ["repo", "add", "."])).toBe(1);
			expect(JSON.parse(readFileSync(file, "utf8"))).toEqual(stored);
		} finally {
			chmodSync(readOnly, 0o700);
			process.env["ARCHBOARD_REPOS"] = registry;
		}
	},
);
