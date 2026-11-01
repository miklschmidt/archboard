import { expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { cpSync } from "node:fs";
import { join, resolve } from "node:path";
import {
	ArchitectureClaimResultSchema,
	ArchitectureModelReadSchema,
	ArchitectureModuleEditResultSchema,
	type ArchitectureClaim,
} from "@archboard/board/model";
import type { AgentActivityMessage } from "@archboard/server-lifecycle/pane-messages";
import { createRepositoryFixture } from "../cli/support/repository-fixture.ts";
import { createJsonRequester } from "../support/http.ts";
import { startOwnedServer } from "../support/owned-server.ts";
import { openTestPane, type PaneMessage } from "../support/pane-websocket.ts";
import { runServerCli } from "../support/run-cli.ts";
import { vaultIn } from "../support/test-vault.ts";
import { TEST_CROSS_PROCESS_LOCK_WATCH_TIMEOUT_MS } from "../support/timing.ts";

const repoRoot = resolve(import.meta.dir, "../../..");

test("two servers share subject claims, foreign claim news, and human take-back", async () => {
	await using resources = new AsyncDisposableStack();
	const fixture = createRepositoryFixture();
	resources.defer(() => fixture.dispose());
	const checkout = fixture.repository("shop", "https://github.com/acme/shop.git");
	const vault = vaultIn(checkout);
	cpSync(join(repoRoot, "examples/canonical-model/.archboard/vault"), vault, { recursive: true });
	for (const [key, value] of [
		["user.name", "Topology Author"],
		["user.email", "topology@example.test"],
		["commit.gpgsign", "false"],
	] as const) {
		execFileSync("git", ["-C", checkout, "config", key, value]);
	}
	const first = await startOwnedServer({
		serverPath: join(repoRoot, "apps/server/src/server.ts"),
		vault,
	});
	resources.defer(() => first.dispose());
	const second = await startOwnedServer({
		serverPath: join(repoRoot, "apps/server/src/server.ts"),
		vault,
	});
	resources.defer(() => second.dispose());
	const requestFirst = createJsonRequester(first);
	const requestSecond = createJsonRequester(second);
	const pane = await openTestPane(first.base, requestFirst, "topology-pane", 0);
	resources.defer(() => pane.close());
	const reading = ArchitectureModelReadSchema.parse(
		(await requestFirst("/api/architecture/model")).body,
	);
	if (!reading.success) throw new Error(JSON.stringify(reading));
	const target = { model: reading.manifest.id, state: reading.selectedState!.id };
	const claimsIn = (message: PaneMessage) =>
		message.type === "agent_activity" && message["vault"] === vault
			? (message as unknown as AgentActivityMessage).activity.flatMap((entry) => entry.claims)
			: undefined;
	const news = async (claims: ArchitectureClaim[], start: number) => {
		// Only the foreign server's disk observation can deliver these changes.
		// Keep the existing topology deadline and return as soon as the snapshot arrives.
		const message = await pane.waitFor(
			(event) => {
				const observed = claimsIn(event);
				return (
					observed !== undefined &&
					observed.length === claims.length &&
					claims.every((claim) => observed.some((one) => one.id === claim.id))
				);
			},
			start,
			TEST_CROSS_PROCESS_LOCK_WATCH_TIMEOUT_MS,
		);
		expect(message).toBeDefined();
		expect(claimsIn(message!)).toEqual(claims);
	};
	const claim = async (request: typeof requestFirst, writer: string, subject: string) => {
		const response = await request("/api/architecture/claims", {
			method: "POST",
			body: { target, writer, subjects: [subject], reason: "Exercise cross-process claims" },
		});
		expect(response.status).toBe(200);
		const result = ArchitectureClaimResultSchema.parse(response.body);
		if (!result.success) throw new Error(JSON.stringify(result));
		return result.claim;
	};
	let start = pane.since();
	const foreign = await claim(requestSecond, "second-writer", "Shop#Gateway");
	await news([foreign], start);
	const held = await requestFirst("/api/architecture/claims", {
		method: "POST",
		body: {
			target,
			writer: "first-writer",
			subjects: ["Shop#Gateway"],
			reason: "A conflicting subject claim",
		},
	});
	expect(held).toMatchObject({ status: 409, body: { success: false, code: "CLAIM_HELD" } });
	const independent = await claim(requestFirst, "first-writer", "Shop#Worker");
	const edit = {
		target,
		subject: "Shop#Gateway",
		writer: "first-writer",
		claim: independent.id,
		expectedRevision: reading.revision,
		operationId: "cross-process-held",
		doing: "Describe the gateway across processes",
		description: "Accepts requests across the public HTTP boundary.",
	};
	expect(
		await requestFirst("/api/architecture/module", { method: "POST", body: edit }),
	).toMatchObject({ status: 409, body: { success: false, code: "CLAIM_HELD" } });
	expect((await requestFirst("/api/architecture/model")).body).toMatchObject({
		revision: reading.revision,
	});
	start = pane.since();
	expect(
		await requestSecond("/api/architecture/claims/release", {
			method: "POST",
			body: { claim: foreign.id, writer: foreign.writer },
		}),
	).toMatchObject({ status: 200, body: { success: true, claims: [independent] } });
	await news([independent], start);
	const available = await claim(requestFirst, "first-writer", "Shop#Gateway");
	const written = await requestFirst("/api/architecture/module", {
		method: "POST",
		body: { ...edit, operationId: "cross-process-released", claim: available.id },
	});
	expect(written.status).toBe(200);
	const result = ArchitectureModuleEditResultSchema.parse(written.body);
	if (!result.success) throw new Error(JSON.stringify(result));
	await requestFirst("/api/architecture/claims/release", {
		method: "POST",
		body: { claim: available.id, writer: available.writer },
	});
	const reclaimed = await claim(requestSecond, "second-writer", "Shop#Gateway");
	expect(
		await requestFirst("/api/architecture/claims/take-back", {
			method: "POST",
			body: { claim: reclaimed.id, origin: "human" },
		}),
	).toMatchObject({ status: 200, body: { success: true, claims: [independent] } });
	// Canonical take-back records revocation durably. The next write needs no renewal sleep.
	const { doing, ...intent } = edit;
	const revoked = runServerCli({
		repoRoot,
		server: second,
		args: ["model", "edit", "--doing", doing],
		input: JSON.stringify({
			...intent,
			operationId: "cross-process-revoked",
			writer: reclaimed.writer,
			claim: reclaimed.id,
			expectedRevision: result.after,
		}),
	});
	expect(revoked.status, revoked.stderr).toBe(2);
	expect(JSON.parse(revoked.stdout)).toMatchObject({ success: false, code: "CLAIM_REVOKED" });
	expect((await requestSecond("/api/architecture/model")).body).toMatchObject({
		success: true,
		revision: result.after,
		modules: expect.arrayContaining([
			expect.objectContaining({ id: "Shop#Gateway", description: edit.description }),
		]),
	});
}, 30_000);
