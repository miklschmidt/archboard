import { afterAll, beforeAll, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { startOwnedServer, type OwnedServer } from "../support/owned-server.ts";
import { vaultIn } from "../support/test-vault.ts";
import { seedCanonicalFixture } from "../support/canonical-fixture.ts";
const root = mkdtempSync(join(tmpdir(), "archboard-named-models-"));
const vaults = [vaultIn(join(root, "a")), vaultIn(join(root, "b"))];
let server: OwnedServer;
beforeAll(async () => {
	for (const [index, vault] of vaults.entries()) seedCanonicalFixture(vault, `Model ${index}`, []);
	server = await startOwnedServer({
		serverPath: resolve(import.meta.dir, "../../../apps/server/src/server.ts"),
		vault: vaults[0]!,
	});
});
afterAll(async () => {
	await server?.dispose();
	rmSync(root, { recursive: true, force: true });
});
test("canonical models and subject claims remain isolated by their explicit vault", async () => {
	for (const [index, vault] of vaults.entries()) {
		const reading = await fetch(
			`${server.base}/api/architecture/model?${new URLSearchParams({ vault })}`,
		);
		expect(reading.status).toBe(200);
		expect(await reading.json()).toMatchObject({
			success: true,
			manifest: { id: "Fixture", name: `Model ${index}` },
		});
		const response = await fetch(`${server.base}/api/architecture/claims`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				vault,
				target: { model: "Fixture", state: "Now" },
				writer: `writer-${index}`,
				reason: "Inspect vault isolation",
				subjects: ["Fixture"],
			}),
		});
		expect(response.status).toBe(200);
	}
	for (const [index, vault] of vaults.entries()) {
		const response = await fetch(
			`${server.base}/api/architecture/claims?${new URLSearchParams({ vault })}`,
		);
		const answer = (await response.json()) as { claims: { id: string; writer: string }[] };
		expect(answer.claims).toMatchObject([{ writer: `writer-${index}` }]);
		const claim = answer.claims[0]!;
		expect(
			(
				await fetch(`${server.base}/api/architecture/claims/release`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ vault, writer: claim.writer, claim: claim.id }),
				})
			).status,
		).toBe(200);
	}
});
test("live canonical requests refuse an absent or unreadable vault before they create inputs", async () => {
	const missing = join(root, "missing/.archboard/vault");
	for (const route of [
		"/api/architecture/model",
		"/api/architecture/claims",
		"/api/architecture/render",
		"/api/architecture/locality",
		"/api/vault/check",
		"/api/vault/code-check",
	]) {
		const absent = await fetch(`${server.base}${route}`);
		expect(absent.status).toBe(400);
		expect(await absent.json()).toMatchObject({ code: "VAULT_REQUIRED" });
		const unreadable = await fetch(
			`${server.base}${route}?${new URLSearchParams({ vault: missing })}`,
		);
		expect(unreadable.status).toBe(404);
		expect(await unreadable.json()).toMatchObject({ code: "VAULT_UNREADABLE" });
	}
	expect(existsSync(missing)).toBe(false);
});
