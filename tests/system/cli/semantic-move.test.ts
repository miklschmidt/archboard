// `archboard semantic move` (ADR 0051, TASK-472.15): the real command moves a
// board from the vault it finds into the vault found from `--to`, through an
// owned server with a registry, home and state directory of its own. The store
// owner (`src/runtime/semantic-board-store/tests/move.test.ts`) holds what the
// move writes and refuses; this owner holds the command around it: its answer,
// the files it leaves in both vaults, what the panes of the source vault are
// told, the checkout a move into a worktree chooses, and the exit status of a
// refusal.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, expect, test } from "bun:test";
import { startOwnedServer, type OwnedServer } from "../support/owned-server.ts";
import { runServerCli } from "../support/run-cli.ts";
import { createRequester } from "../server-state/support/http.ts";
import { openPaneSession } from "../server-state/support/pane-session.ts";
import { createRepositoryFixture, type RepositoryFixture } from "./support/repository-fixture.ts";

const repoRoot = resolve(import.meta.dir, "../../..");
const META = "github.com/acme/meta";
const PRODUCT = "github.com/acme/product";
let fixture: RepositoryFixture;
let server: OwnedServer;
let product = "";
let metaVault = "";
let productVault = "";

/**
 * Run the archboard command of this package in the directory that holds a vault.
 * @param vault The vault the command finds.
 * @param args The command line.
 * @param input What to put on standard input.
 * @returns What the command printed and how it exited.
 */
function cli(vault: string, args: readonly string[], input?: string) {
	return runServerCli({ repoRoot, server, vault, args, input });
}

/**
 * Make a board in the meta project's vault.
 * @param name The board's name.
 * @param nodes Its parts; every part after the first is wired to the first.
 */
function made(name: string, nodes: readonly Record<string, unknown>[]): void {
	const [first, ...rest] = nodes;
	const payload = {
		level: "service",
		nodes,
		edges: rest.map((node) => ({ from: first?.["name"], to: node["name"], kind: "http" })),
	};
	const result = cli(
		metaVault,
		["semantic", "new", name, "--doing", "drawing a board to move"],
		JSON.stringify(payload),
	);
	expect(result.status, result.stderr).toBe(0);
}

/**
 * A part that opens a board of its own vault.
 * @param name The part's name.
 * @param board The board it opens.
 * @returns The node.
 */
function opening(name: string, board: string) {
	return { name, kind: "service", drillDown: { board, variant: { kind: "current" } } };
}

/**
 * Whether a vault holds a board's file.
 * @param vault The vault.
 * @param name The board's name.
 * @returns True when the file is there.
 */
function holds(vault: string, name: string): boolean {
	return existsSync(join(vault, `${name}.semantic.json`));
}

beforeAll(async () => {
	fixture = createRepositoryFixture();
	const meta = fixture.repository("meta", META);
	product = fixture.repository("product", PRODUCT);
	metaVault = join(meta, ".archboard", "vault");
	productVault = join(product, ".archboard", "vault");
	mkdirSync(metaVault, { recursive: true });
	mkdirSync(productVault, { recursive: true });
	server = await startOwnedServer({
		serverPath: join(repoRoot, "src/server.ts"),
		vault: metaVault,
		env: fixture.serverEnvironment,
	});
});

afterAll(async () => {
	await server?.dispose();
	fixture?.dispose();
});

test("semantic move moves the board to the vault --to finds and lists every rewritten drill-down", () => {
	made("Ledger", [{ name: "Books", kind: "module" }]);
	made("Payments", [{ name: "API", kind: "app" }, opening("Books", "Ledger")]);
	made("Platform", [{ name: "Web", kind: "app" }, opening("Pay", "Payments")]);

	const moved = cli(metaVault, [
		"semantic",
		"move",
		"Payments",
		"--to",
		product,
		"--expect-version",
		"1",
		"--doing",
		"moving the board into the repository it describes",
	]);

	expect(moved.status, moved.stderr).toBe(0);
	const answer = JSON.parse(moved.stdout) as {
		to: { repository: string | null; registered?: { kind: string; repository?: string } };
		rewritten: { board: string; drillDown: { repo?: string } }[];
	};
	expect(answer.to.repository).toBe(PRODUCT);
	// The registry did not know the product checkout, so a drill-down that names
	// its identity could open nothing until the move registered it.
	expect(answer.to.registered).toMatchObject({ kind: "checkout", repository: PRODUCT });
	expect(answer.rewritten.map((one) => `${one.board} ${one.drillDown.repo}`).toSorted()).toEqual([
		`Payments ${META}`,
		`Platform ${PRODUCT}`,
	]);
	expect([holds(metaVault, "Payments"), holds(productVault, "Payments")]).toEqual([false, true]);
}, 120_000);

test("a pane on the moved board follows it to its new repository, and a pane on a rewritten board is told why it changed", async () => {
	made("Billing", [{ name: "Invoices", kind: "module" }]);
	made("Checkout", [{ name: "Cart", kind: "app" }, opening("Bill", "Billing")]);
	const request = createRequester({ ...server, vault: metaVault });
	const onMoved = await openPaneSession(server.base, request, {
		clientId: "on-moved",
		board: "billing",
	});
	const onRewritten = await openPaneSession(server.base, request, {
		clientId: "on-rewritten",
		board: "checkout",
		x: 640,
	});
	try {
		const [movedMark, rewrittenMark] = [onMoved.mark(), onRewritten.mark()];
		const doing = "moving the billing board into the repository it describes";
		const moved = cli(metaVault, [
			"semantic",
			"move",
			"Billing",
			"--to",
			product,
			"--expect-version",
			"1",
			"--doing",
			doing,
		]);
		expect(moved.status, moved.stderr).toBe(0);

		expect(await onMoved.waitFor("pane_board", movedMark)).toMatchObject({
			board: "billing",
			vault: productVault,
			repository: PRODUCT,
		});
		// Every message the move made went out before its answer did.
		await onRewritten.sync();
		const said = onRewritten.events
			.slice(rewrittenMark)
			.filter((event) => event.type === "board_doing" && event.board === "checkout");
		expect(said.map((event) => (event["doing"] as { doing?: string } | undefined)?.doing)).toEqual([
			doing,
		]);
	} finally {
		await onMoved.close();
		await onRewritten.close();
	}
}, 120_000);

test("a refused move exits with the status its refusal declares and moves nothing", () => {
	made("Refunds", [{ name: "Store", kind: "module" }]);
	const refused = cli(metaVault, [
		"semantic",
		"move",
		"Refunds",
		"--to",
		join(metaVault, ".."),
		"--expect-version",
		"1",
		"--doing",
		"moving the board into its own repository",
	]);
	expect(refused.status).toBe(2);
	// A move states the version it read, as every write to a board does.
	const unversioned = cli(metaVault, [
		"semantic",
		"move",
		"Refunds",
		"--to",
		product,
		"--doing",
		"moving the board without saying which version it read",
	]);
	expect(unversioned.status).toBe(2);
	expect([holds(metaVault, "Refunds"), holds(productVault, "Refunds")]).toEqual([true, false]);
}, 120_000);

test("a move into a checkout that is not chosen chooses it, and a pane on the board stays there", async () => {
	made("Audit", [{ name: "Trail", kind: "module" }]);
	const added = join(fixture.root, "product-audit");
	execFileSync("git", ["worktree", "add", "-q", "-b", "audit", added], {
		cwd: product,
		stdio: "ignore",
	});
	const worktree = realpathSync.native(added);
	const worktreeVault = join(worktree, ".archboard", "vault");
	mkdirSync(worktreeVault, { recursive: true });
	const pane = await openPaneSession(
		server.base,
		createRequester({ ...server, vault: metaVault }),
		{
			clientId: "on-audit",
			board: "audit",
		},
	);
	try {
		const mark = pane.mark();
		const moved = cli(metaVault, [
			"semantic",
			"move",
			"Audit",
			"--to",
			worktree,
			"--expect-version",
			"1",
			"--doing",
			"moving the audit board into the worktree that builds it",
		]);
		expect(moved.status, moved.stderr).toBe(0);
		const answer = JSON.parse(moved.stdout) as { chose?: unknown };
		expect(answer.chose).toEqual({ repository: PRODUCT, checkout: worktree, replaced: product });
		await pane.sync();
		expect(
			pane.events.slice(mark).some((e) => e.type === "pane_board" && e["vault"] === worktreeVault),
		).toBe(true);

		// Another change to the registry, which every server follows, leaves the
		// pane in the checkout the move chose rather than in one without the board.
		const before = pane.mark();
		const other = fixture.repository("other", "github.com/acme/other");
		expect(cli(metaVault, ["repo", "add", other]).status).toBe(0);
		expect(await pane.waitFor("repositories_changed", before)).toBeDefined();
		const told = pane.events
			.slice(mark)
			.filter((event) => event.type === "pane_board")
			.map((event) => event["vault"]);
		expect(told.at(-1)).toBe(worktreeVault);
		expect(told).not.toContain(productVault);
	} finally {
		await pane.close();
	}
}, 120_000);
