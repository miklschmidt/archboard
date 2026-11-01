// The design lens through the real CLI and server: `model inspect` states what
// the model claims about one module or one group, and `model compare` states
// interface changes first and the measures of each state side by side. The
// derivation's own rules are owned in `packages/board/tests/shared/rules`.

import { afterAll, beforeAll, expect, test } from "bun:test";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { ArchitectureModelReadSchema } from "@archboard/board/model";
import { startOwnedServer, type OwnedServer } from "../support/owned-server.ts";
import { runServerCli } from "../support/run-cli.ts";
import { vaultIn } from "../support/test-vault.ts";

const repoRoot = resolve(import.meta.dir, "../../..");
const home = mkdtempSync(join(tmpdir(), "archboard-design-lens-"));
const vault = vaultIn(home);
let server: OwnedServer | undefined;
/**
 * The identity of the example's Queued fulfilment draft. A shelved first draft still holds that
 * name as a former one, so a name does not select the draft alone.
 */
const QUEUED = "wyzlP1Nf";

/**
 * Run one command in the directory that holds the example's vault.
 * @param args The command.
 * @returns What it did.
 */
function run(...args: readonly string[]) {
	if (server === undefined) throw new Error("The server did not start");
	return runServerCli({ repoRoot, server, args, input: undefined });
}

/**
 * The names of some subjects.
 * @param subjects What an answer lists.
 * @returns Their names, in order.
 */
const names = (subjects: readonly { readonly name: string }[]) =>
	subjects.map((subject) => subject.name);

/**
 * The reading a successful compare answers with.
 * @param args The compare selectors.
 * @returns The comparison, with what the command wrote.
 */
function compared(...args: readonly string[]) {
	const result = run("model", "compare", ...args);
	expect(result.status, result.stderr).toBe(0);
	const { vault: _address, ...answer } = JSON.parse(result.stdout);
	const model = ArchitectureModelReadSchema.parse(answer);
	if (!model.success || model.comparison === undefined) throw new Error(result.stdout);
	return { comparison: model.comparison, raw: JSON.parse(result.stdout), stderr: result.stderr };
}

beforeAll(async () => {
	cpSync(join(repoRoot, "examples/web-shop"), vault, { recursive: true });
	for (const args of [
		["init", "--quiet"],
		["config", "user.name", "Lens Author"],
		["config", "user.email", "lens@example.test"],
		["config", "commit.gpgsign", "false"],
		["add", "."],
		["commit", "--quiet", "-m", "test: seed model"],
	]) {
		const result = Bun.spawnSync(["git", "-C", home, ...args]);
		if (result.exitCode !== 0) throw new Error(result.stderr.toString());
	}
	server = await startOwnedServer({
		serverPath: join(repoRoot, "apps/server/src/server.ts"),
		vault,
	});
	const imported = run("model", "import", "--input", join(vault, "history.import.json"));
	if (imported.status !== 0) throw new Error(imported.stderr);
});

afterAll(async () => {
	await server?.dispose();
	rmSync(home, { recursive: true, force: true });
});

test("model inspect states one module's interface", () => {
	const { status, stdout, stderr } = run("model", "inspect", "Inventory service");
	expect(status, stderr).toBe(0);
	const answer = JSON.parse(stdout);
	expect(answer).toMatchObject({
		success: true,
		model: { id: "Shop", name: "Shop" },
		state: { name: "Synchronous checkout", lifecycle: "current" },
		module: { name: "Inventory service", parent: null, groups: ["fulfilment"] },
		holdsParts: true,
		measures: { entryPoints: 1, hiddenParts: 3, callers: 3, outgoing: 1, passThrough: 0 },
		vault: { path: vault },
	});
	expect(names(answer.entryPoints)).toEqual(["Stock API"]);
	expect(answer.entryPoints[0].reachedBy.map((one: { toName: string }) => one.toName)).toEqual([
		"Availability route",
		"Reserve route",
		"Release route",
	]);
	expect(names(answer.hiddenParts)).toEqual(["Reservation ledger", "Stock DB", "Warehouse sync"]);
	expect(names(answer.callers)).toEqual(["Storefront", "Place order", "Timeout guard"]);
	const [stockApi] = answer.entryPoints;
	expect(answer.callers.map((one: { reaches: string[] }) => one.reaches)).toEqual([
		[stockApi.id],
		[stockApi.id],
		[stockApi.id],
	]);
	expect(answer.onContainer).toEqual([]);
	expect(answer.outgoing.map((one: { toName: string }) => one.toName)).toEqual([
		"Warehouse system",
	]);
	expect(stderr).toContain("Inventory service");
	expect(stderr).not.toMatch(/\b(?:deep|shallow|smell)/iu);
});

test("model inspect answers that a module with no parts has no interface", () => {
	const { status, stdout, stderr } = run("model", "inspect", "Stock DB");
	expect(status, stderr).toBe(0);
	const answer = JSON.parse(stdout);
	expect(answer).toMatchObject({ module: { name: "Stock DB" }, holdsParts: false });
	expect(answer.measures).toBeUndefined();
});

test("model inspect reads the state it selects", () => {
	const { status, stdout, stderr } = run("model", "inspect", "Checkout API", "--state", QUEUED);
	expect(status, stderr).toBe(0);
	const answer = JSON.parse(stdout);
	expect(answer.state).toMatchObject({ name: "Queued fulfilment", lifecycle: "draft" });
	expect(names(answer.entryPoints)).toContain("Payment webhook");
	// The comparison's column is this same derivation.
	const row = compared("--state", QUEUED).comparison.interfaceMeasures.containers.find(
		({ container }) => container.name === "Checkout API",
	);
	expect(row?.byState[0]).toMatchObject({ holdsParts: true, measures: answer.measures });
});

test("model inspect --group reads a group's boundary in the state it selects", () => {
	const { status, stdout, stderr } = run("model", "inspect", "--group", "fulfilment");
	expect(status, stderr).toBe(0);
	const answer = JSON.parse(stdout);
	expect(answer.group).toEqual({ id: "fulfilment", name: "Fulfilment" });
	expect(names(answer.members)).toEqual(["Email provider", "Inventory service"]);
	expect(answer.internal).toEqual([]);
	expect(
		answer.boundary.map((one: { fromName: string; toName: string; direction: string }) => [
			one.fromName,
			one.toName,
			one.direction,
		]),
	).toEqual([
		["Storefront", "Availability route", "incoming"],
		["Place order", "Email provider", "incoming"],
		["Place order", "Reserve route", "incoming"],
		["Timeout guard", "Release route", "incoming"],
		["Warehouse sync", "Warehouse system", "outgoing"],
	]);
	expect(names(answer.neighbors)).toEqual([
		"Storefront",
		"Place order",
		"Timeout guard",
		"Warehouse system",
	]);
	const proposed = run("model", "inspect", "--group", "fulfilment", "--state", QUEUED);
	expect(proposed.status, proposed.stderr).toBe(0);
	const { members, internal } = JSON.parse(proposed.stdout);
	expect(members).toHaveLength(4);
	expect(internal).toHaveLength(3);
});

test("model inspect refuses without one subject, and an unknown one with its reason", () => {
	for (const args of [[], ["Stock DB", "--group", "fulfilment"], ["--group", "absent"]]) {
		const refused = run("model", "inspect", ...args);
		expect(refused.status).toBe(2);
		expect(refused.stdout).toBe("");
	}
	const missing = run("model", "inspect", "Absent module");
	expect(missing.status).toBe(2);
	expect(JSON.parse(missing.stdout)).toMatchObject({ success: false, code: "MODULE_NOT_FOUND" });
});

test("model compare with no base states interface changes first, against the default base", () => {
	const { comparison, raw, stderr } = compared("--state", QUEUED);
	expect(comparison.reason).toBe("current");
	const [checkout, stock, inventory, ...others] = comparison.interfaceChanges.changed;
	expect(others).toEqual([]);
	expect(checkout?.container.name).toBe("Checkout API");
	expect(names(checkout?.entryPointsAdded ?? [])).toEqual(["Payment webhook"]);
	expect(names(checkout?.callersGained ?? [])).toEqual(["Payment provider"]);
	expect(stock?.container.name).toBe("Stock API");
	expect(names(inventory?.callersGained ?? [])).toEqual(["Fulfilment worker"]);
	expect(names(inventory?.callersLost ?? [])).toEqual(["Place order", "Timeout guard"]);
	expect(names(comparison.interfaceChanges.unchanged)).toEqual([]);
	const sections = Object.keys(raw.comparison);
	expect(sections.indexOf("interfaceChanges")).toBeLessThan(sections.indexOf("subjects"));
	// The words say what moved, then the counts of each state beside each other.
	expect(stderr.indexOf("Payment webhook")).toBeGreaterThanOrEqual(0);
	expect(stderr.indexOf("Payment webhook")).toBeLessThan(stderr.indexOf("3, 0, 2, 6, 0"));
	expect(stderr.indexOf("3, 0, 2, 6, 0")).toBeLessThan(stderr.indexOf("2, 1, 1, 8, 0"));
	expect(stderr).not.toMatch(/\b(?:deep|shallow|smell)/iu);
});

test("model compare puts competing proposals beside each other, in the order named", async () => {
	if (server === undefined) throw new Error("The server did not start");
	const { comparison } = compared(
		"--state",
		"Nightly batch",
		"--beside",
		"Live events",
		"--beside",
		QUEUED,
	);
	const { states, containers } = comparison.interfaceMeasures;
	expect(states.map(({ state }) => state?.name)).toEqual([
		"Nightly batch",
		"Synchronous checkout",
		"Live events",
		"Queued fulfilment",
	]);
	const row = containers.find(({ container }) => container.name === "Recommendations API");
	expect(row?.byState.map((on) => on.holdsParts)).toEqual([true, false, true, false]);
	// A competing state is measured, and stays out of what the comparison says changed.
	expect(comparison.against).toMatchObject({ name: "Synchronous checkout" });
	expect(
		comparison.interfaceChanges.changed.some(({ container }) => container.name === "Checkout API"),
	).toBe(true);
	const query = new URLSearchParams({ vault, state: "Nightly batch", beside: "Live events" });
	const response = await fetch(`${server.base}/api/architecture/model?${query}`);
	expect(response.status).toBe(200);
	const answer = ArchitectureModelReadSchema.parse(await response.json());
	if (!answer.success) throw new Error(JSON.stringify(answer));
	expect(answer.comparison?.interfaceMeasures.states).toHaveLength(3);
});

test("model compare refuses a state to put beside a reading that compares nothing", () => {
	const refused = run("model", "compare", "--beside", "Live events");
	expect(refused.status).toBe(2);
	expect(JSON.parse(refused.stdout)).toMatchObject({
		success: false,
		code: "COMPARISON_REQUIRED",
	});
});
