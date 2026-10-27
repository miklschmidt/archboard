// An agent's `browser show` from a checkout that is not chosen chooses it, and
// every pane follows the registry (ADR 0050, TASK-472.14). One owned server with
// a registry of its own knows a repository with a main checkout and a
// worktree, each with a vault. The shipped CLI runs in each checkout against
// that server and that registry, and observed panes say what they are told.

import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { z } from "zod";

import { SEMANTIC_PANE_CONTEXT_ROUTE } from "@archboard/board/pane-context";
import { packageBin } from "../cli/support/package-cli.ts";
import {
	createRepositoryFixture,
	type RepositoryFixture,
} from "../cli/support/repository-fixture.ts";
import { openObservedPane } from "../support/observed-pane.ts";
import { startOwnedServer, type OwnedServer } from "../support/owned-server.ts";
import { ensureSemanticVaultConfiguration } from "../support/semantic-vault.ts";
import { createRequester } from "./support/http.ts";
import { openPaneSession, type PaneSession } from "./support/pane-session.ts";

const repoRoot = resolve(import.meta.dir, "../../..");
const ORDERS = "github.com/acme/orders";
const COMMIT = ["-c", "user.email=t@t", "-c", "user.name=t", "-c", "commit.gpgsign=false"];

const ShownSchema = z.object({
	repository: z.string().nullable(),
	checkout: z.string(),
	chose: z
		.object({ repository: z.string(), checkout: z.string(), replaced: z.string().nullable() })
		.optional(),
});
const PaneSchema = z.object({
	paneId: z.string(),
	vault: z.string(),
	repository: z.string().nullable(),
	checkout: z.string(),
	own: z.boolean(),
	reading: z.object({ selection: z.array(z.object({ id: z.string() })) }),
});
const RegistrySchema = z.object({
	repos: z.array(z.object({ repo: z.string(), root: z.string(), chosen: z.boolean() })),
	vaults: z.array(z.object({ name: z.string(), root: z.string() })),
});

let fixture: RepositoryFixture;
let server: OwnedServer;
let main = "";
let worktree = "";
let mainVault = "";
let worktreeVault = "";

/**
 * The vault of a directory, made and configured.
 * @param holder The checkout, or the directory that holds an untracked vault.
 * @returns The vault's real path.
 */
function vaultOf(holder: string): string {
	const vault = join(holder, ".archboard", "vault");
	mkdirSync(vault, { recursive: true });
	ensureSemanticVaultConfiguration(vault);
	return realpathSync(vault);
}

/**
 * Run the shipped CLI in a directory, against this server and its registry.
 * @param cwd Where it runs.
 * @param args Its arguments.
 * @param input What it reads on standard input.
 * @returns Its JSON answer.
 */
function archboard(cwd: string, args: readonly string[], input?: string): unknown {
	const ran = spawnSync(packageBin, args, {
		cwd,
		input,
		encoding: "utf8",
		env: { ...fixture.serverEnvironment, ARCHBOARD_URL: server.base },
	});
	if (ran.status !== 0) throw new Error(`${args.join(" ")} in ${cwd}: ${ran.stderr}`);
	return JSON.parse(ran.stdout);
}

/**
 * The registry, as `repo list` reports it.
 * @returns The checkouts and the untracked vaults.
 */
function registry(): z.infer<typeof RegistrySchema> {
	return RegistrySchema.parse(archboard(fixture.nowhere, ["repo", "list"]));
}

/**
 * The checkout this machine reads for the repository.
 * @returns Its root.
 */
function chosenCheckout(): string | undefined {
	return registry().repos.find((each) => each.repo === ORDERS && each.chosen)?.root;
}

/**
 * Create a board in a vault.
 * @param vault The vault.
 * @param board The board.
 */
async function createBoard(vault: string, board: string): Promise<void> {
	writeFileSync(
		join(vault, "model.json"),
		JSON.stringify({ schemaVersion: 1, id: "Payments", name: board, current: null }),
	);
}

/**
 * Open an observed pane on `payments` in a vault.
 * @param vault The vault.
 * @param clientId The pane.
 * @param x Where it sits.
 * @returns The pane.
 */
function paneIn(vault: string, clientId: string, x = 0): Promise<PaneSession> {
	return openPaneSession(server.base, createRequester({ ...server, vault }), {
		clientId,
		board: "payments",
		x,
	});
}

/**
 * The panes as `browser panes` in a directory reports them.
 * @param cwd Where the command runs.
 * @returns The panes, by pane id.
 */
function panesFrom(cwd: string): Record<string, z.infer<typeof PaneSchema>> {
	const { panes } = z
		.object({ panes: z.array(PaneSchema) })
		.parse(archboard(cwd, ["browser", "panes"]));
	return Object.fromEntries(panes.map((pane) => [pane.paneId, pane]));
}

/**
 * Show `payments` in a pane, as an agent in a checkout does.
 * @param cwd The checkout.
 * @param pane The pane.
 * @returns The answer.
 */
function show(cwd: string, pane: string): z.infer<typeof ShownSchema> {
	return ShownSchema.parse(archboard(cwd, ["browser", "show", "payments", "--pane", pane]));
}

beforeAll(async () => {
	fixture = createRepositoryFixture();
	main = fixture.repository("orders", `https://${ORDERS}.git`);
	const target = join(fixture.root, "orders-feature");
	execFileSync("git", ["worktree", "add", "-q", "-b", "feature", target], {
		cwd: main,
		stdio: "ignore",
	});
	worktree = realpathSync.native(target);
	mainVault = vaultOf(main);
	worktreeVault = vaultOf(worktree);
	server = await startOwnedServer({
		serverPath: join(repoRoot, "apps/server/src/server.ts"),
		vault: fixture.vault,
		env: fixture.serverEnvironment,
	});
	// The main checkout registers first, so it is chosen, and the worktree becomes known with it.
	archboard(main, ["repo", "add"]);
	await createBoard(mainVault, "payments");
	await createBoard(worktreeVault, "payments");
});

afterAll(async () => {
	await server?.dispose();
	fixture?.dispose();
});

describe.serial("browser show and the chosen checkout", () => {
	test("a show from a checkout that is not chosen chooses it, and every pane of the repository follows", async () => {
		await using resources = new AsyncDisposableStack();
		const left = await paneIn(mainVault, "pane-left");
		resources.defer(() => left.close());
		const right = await paneIn(mainVault, "pane-right", 640);
		resources.defer(() => right.close());

		// Each pane names its repository and checkout, and whether it is the caller's own.
		expect(panesFrom(worktree)["pane-left"]).toMatchObject({
			vault: mainVault,
			repository: ORDERS,
			checkout: main,
			own: false,
		});
		expect(panesFrom(main)["pane-left"]?.own).toBe(true);
		// What the person picked out on the main checkout's board.
		const picked = await createRequester({ ...server, vault: mainVault })(
			SEMANTIC_PANE_CONTEXT_ROUTE,
			{
				method: "POST",
				doing: false,
				body: {
					paneId: "pane-left",
					clientId: "pane-left",
					board: { name: "payments", key: "payments" },
					variant: null,
					view: null,
					selection: [{ id: "ab12" }],
					version: null,
					at: new Date().toISOString(),
					sequence: 0,
				},
			},
		);
		expect(picked.status).toBe(200);
		expect(panesFrom(main)["pane-left"]?.reading.selection).toEqual([{ id: "ab12" }]);

		const mark = left.mark();
		const targetMark = right.mark();
		expect(show(worktree, "pane-right")).toEqual({
			repository: ORDERS,
			checkout: worktree,
			chose: { repository: ORDERS, checkout: worktree, replaced: main },
		});
		expect(await right.waitFor("pane_model", targetMark)).toMatchObject({
			model: "Payments",
			reading: { model: "Payments", grammar: "architecture" },
			vault: worktreeVault,
		});
		expect(chosenCheckout()).toBe(worktree);
		// The pane the show did not name follows the choice with its board.
		expect(await left.waitFor("pane_board", mark)).toMatchObject({
			board: "payments",
			vault: worktreeVault,
			repository: ORDERS,
		});
		expect(await left.waitFor("repositories_changed", mark)).toBeDefined();
		const after = panesFrom(worktree);
		for (const paneId of ["pane-left", "pane-right"]) {
			expect(after[paneId]).toMatchObject({ vault: worktreeVault, checkout: worktree, own: true });
		}
		// The pick was of the main checkout's board, so it is not reported as one of the worktree's.
		expect(after["pane-left"]?.reading.selection).toEqual([]);

		// A show from the chosen checkout changes no choice and says nothing of one.
		expect(show(worktree, "pane-left").chose).toBeUndefined();
		expect(chosenCheckout()).toBe(worktree);
	});

	test("no board command changes the choice, and a command that registers a checkout tells the server", async () => {
		await using resources = new AsyncDisposableStack();
		const pane = await paneIn(worktreeVault, "pane-watch");
		resources.defer(() => pane.close());
		archboard(main, ["model", "read"]);
		// The first command in a new worktree registers it without choosing it.
		const target = join(fixture.root, "orders-fix");
		execFileSync("git", ["worktree", "add", "-q", "-b", "fix", target], {
			cwd: main,
			stdio: "ignore",
		});
		const fix = realpathSync.native(target);
		await createBoard(vaultOf(fix), "payments");
		const mark = pane.mark();
		expect(archboard(fix, ["model", "read"])).toMatchObject({
			vault: { registered: { root: fix, chosen: false } },
		});
		expect(await pane.waitFor("repositories_changed", mark)).toBeDefined();
		expect(chosenCheckout()).toBe(worktree);
	});

	test("repo use and repo forget reach the panes: they move, or hear the name their repository has now", async () => {
		await using resources = new AsyncDisposableStack();
		const pane = await paneIn(worktreeVault, "pane-follow");
		resources.defer(() => pane.close());

		const mark = pane.mark();
		archboard(fixture.nowhere, ["repo", "use", main]);
		expect(await pane.waitFor("pane_board", mark)).toMatchObject({
			board: "payments",
			vault: mainVault,
			repository: ORDERS,
		});

		// Forgotten, the main checkout is no repository's, so the pane in its vault names none.
		const forgot = pane.mark();
		archboard(fixture.nowhere, ["repo", "forget", main]);
		expect(await pane.waitFor("pane_board", forgot)).toMatchObject({
			vault: mainVault,
			repository: null,
		});
		expect(panesFrom(fixture.nowhere)["pane-follow"]).toMatchObject({ repository: null });
	});

	test("a pane that comes back naming the vault of a removed checkout is put in the chosen checkout's vault", async () => {
		await using resources = new AsyncDisposableStack();
		const target = join(fixture.root, "orders-gone");
		execFileSync("git", ["worktree", "add", "-q", "-b", "gone", target], {
			cwd: main,
			stdio: "ignore",
		});
		const gone = realpathSync.native(target);
		const goneVault = vaultOf(gone);
		await createBoard(goneVault, "payments");
		archboard(fixture.nowhere, ["repo", "use", gone]);
		const before = await paneIn(goneVault, "pane-gone");
		await before.close();

		// The chosen worktree is removed, and the main checkout is chosen in its place.
		execFileSync("git", ["worktree", "remove", "--force", gone], { cwd: main, stdio: "ignore" });
		archboard(fixture.nowhere, ["repo", "use", main]);

		// The page reconnects naming the vault it was in, which the server cannot read now.
		const back = await openObservedPane<{ type: string; board?: string; vault?: unknown }>({
			base: server.base,
			clientId: "pane-gone",
			vault: goneVault,
			register: (board, signal) =>
				createRequester({ ...server, vault: mainVault })("/api/panes", {
					method: "POST",
					doing: false,
					signal,
					body: {
						clientId: "pane-gone",
						paneId: "pane-gone",
						primary: true,
						focused: false,
						rect: { x: 0, y: 0, width: 640, height: 800 },
						board,
					},
				}),
			readPanes: (signal) =>
				createRequester({ ...server, vault: mainVault })("/api/panes", { signal }),
		});
		resources.defer(() => back.close());
		expect(back.events.find((event) => event.type === "pane_board")).toMatchObject({
			vault: mainVault,
			repository: ORDERS,
		});
	});

	test("a repository named like an untracked vault keeps its name, and the vault and its pane take another", async () => {
		await using resources = new AsyncDisposableStack();
		const shelf = join(fixture.root, "shelf", "notes");
		const shelfVault = vaultOf(shelf);
		archboard(fixture.nowhere, ["repo", "add", shelf]);
		await createBoard(shelfVault, "payments");
		const pane = await paneIn(shelfVault, "pane-notes");
		resources.defer(() => pane.close());

		// A repository with no remote is named by the directory of its main checkout.
		const notes = join(fixture.root, "notes");
		mkdirSync(notes, { recursive: true });
		writeFileSync(join(notes, "README.md"), "notes\n");
		const git = (...args: string[]) => execFileSync("git", args, { cwd: notes, stdio: "ignore" });
		git("init", "-q", "-b", "main");
		git(...COMMIT, "add", ".");
		git(...COMMIT, "commit", "-qm", "init");

		const mark = pane.mark();
		const root = realpathSync.native(shelf);
		expect(archboard(fixture.nowhere, ["repo", "add", notes])).toMatchObject({
			repo: "notes",
			renamed: { root, from: "notes", to: "notes-2" },
		});
		expect(registry().vaults.find((each) => each.root === root)?.name).toBe("notes-2");
		expect(await pane.waitFor("pane_board", mark)).toMatchObject({
			vault: shelfVault,
			repository: "notes-2",
		});
	});
});
