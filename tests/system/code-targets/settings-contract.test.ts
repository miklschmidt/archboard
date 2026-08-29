import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";

import {
	CodeTargetOpenFailureSchema,
	OpenerSelectionReplySchema,
	OpenerSettingsReplySchema,
	OpenerTestReplySchema,
} from "../../../src/shared/code-target/index.ts";
import { createOpenerFixture, jsonBody } from "./support/opener-fixture.ts";

describe("public opener settings contract", () => {
	test("reads the platform default without creating machine state", async () => {
		await using resources = new AsyncDisposableStack();
		const fixture = await createOpenerFixture();
		resources.defer(() => fixture.dispose());

		const result = await fixture.request("/api/settings/opener");
		expect(result.status).toBe(200);
		expect(OpenerSettingsReplySchema.parse(result.body)).toMatchObject({
			success: true,
			selection: { version: 1, kind: "platform" },
			availability: { available: expect.any(Boolean) },
			repositories: [
				{
					repository: fixture.repository,
					root: fixture.checkout,
					exists: true,
					identityMatches: true,
				},
			],
		});
		expect(result.headers.get("access-control-allow-origin")).toBeNull();
		expect(existsSync(fixture.configFile)).toBeFalse();
	});

	test("reports the effective resolved command without spawning", async () => {
		await using resources = new AsyncDisposableStack();
		const fixture = await createOpenerFixture();
		resources.defer(() => fixture.dispose());
		const available = fixture.invocation("immediate");
		resources.defer(() => available.releaseAndWait());

		expect(
			(
				await fixture.request("/api/settings/opener", {
					method: "PUT",
					body: jsonBody(available.selection),
				})
			).status,
		).toBe(200);
		const current = OpenerSettingsReplySchema.parse(
			(await fixture.request("/api/settings/opener")).body,
		);
		expect(current.effectiveCommand).toEqual({
			executable: process.execPath,
			argv: available.selection.kind === "custom" ? available.selection.argv : [],
		});
		expect(current.availability).toEqual({ available: true });
		expect(readdirSync(available.captureDirectory)).toEqual([]);

		const missing = {
			version: 1,
			kind: "custom",
			executable: `${fixture.root}/missing-opener`,
			argv: ["{path}"],
		} as const;
		expect(
			(
				await fixture.request("/api/settings/opener", {
					method: "PUT",
					body: jsonBody(missing),
				})
			).status,
		).toBe(200);
		const unavailable = OpenerSettingsReplySchema.parse(
			(await fixture.request("/api/settings/opener")).body,
		);
		expect(unavailable.effectiveCommand).toBeNull();
		expect(unavailable.availability).toMatchObject({
			available: false,
			code: "OPENER_UNAVAILABLE",
		});
		expect(readdirSync(available.captureDirectory)).toEqual([]);
	});

	test("strictly saves and resets one machine-wide selection", async () => {
		await using resources = new AsyncDisposableStack();
		const fixture = await createOpenerFixture();
		resources.defer(() => fixture.dispose());

		const saved = await fixture.request("/api/settings/opener", {
			method: "PUT",
			body: jsonBody({ version: 1, kind: "preset", preset: "zed" }),
		});
		expect(saved.status).toBe(200);
		expect(OpenerSelectionReplySchema.parse(saved.body)).toMatchObject({
			selection: { kind: "preset", preset: "zed" },
		});
		expect(JSON.parse(readFileSync(fixture.configFile, "utf8"))).toMatchObject({
			kind: "preset",
			preset: "zed",
		});

		const refused = await fixture.request("/api/settings/opener", {
			method: "PUT",
			body: jsonBody({ version: 1, kind: "platform", extra: true }),
		});
		expect(refused.status).toBe(400);
		expect(refused.body).toMatchObject({ success: false, code: "REQUEST_INVALID" });
		const relativeExecutable = await fixture.request("/api/settings/opener", {
			method: "PUT",
			body: jsonBody({
				version: 1,
				kind: "custom",
				executable: "./editor",
				argv: ["{path}"],
			}),
		});
		expect(relativeExecutable.status).toBe(422);
		expect(relativeExecutable.body).toMatchObject({
			success: false,
			code: "OPENER_CONFIG_INVALID",
		});

		writeFileSync(fixture.configFile, "corrupt");
		const reset = await fixture.request("/api/settings/opener", { method: "DELETE" });
		expect(reset.status).toBe(200);
		expect(OpenerSelectionReplySchema.parse(reset.body)).toMatchObject({
			selection: { kind: "platform" },
		});
	});

	test("tests an unsaved draft only against the registered canonical root", async () => {
		await using resources = new AsyncDisposableStack();
		const fixture = await createOpenerFixture();
		resources.defer(() => fixture.dispose());
		const invocation = fixture.invocation("immediate");
		resources.defer(() => invocation.releaseAndWait());

		const result = await fixture.request("/api/settings/opener/test", {
			method: "POST",
			body: jsonBody({ selection: invocation.selection, repository: fixture.repository }),
		});
		expect(result.status).toBe(200);
		expect(OpenerTestReplySchema.parse(result.body)).toEqual({
			success: true,
			code: "OPENER_TESTED",
			repository: fixture.repository,
		});
		expect(await invocation.waitForCapture()).toMatchObject({ target: fixture.checkout });
		expect(existsSync(fixture.configFile)).toBeFalse();
	});

	test("only reset recovers corrupt state; PUT and test preserve its exact bytes", async () => {
		await using resources = new AsyncDisposableStack();
		const fixture = await createOpenerFixture();
		resources.defer(() => fixture.dispose());
		const invocation = fixture.invocation("immediate");
		resources.defer(() => invocation.releaseAndWait());
		expect(
			(
				await fixture.request("/api/settings/opener", {
					method: "PUT",
					body: jsonBody({ version: 1, kind: "platform" }),
				})
			).status,
		).toBe(200);
		const corrupt = Buffer.from("{not opener state}\n");
		writeFileSync(fixture.configFile, corrupt);

		for (const [path, body] of [
			["/api/settings/opener", invocation.selection],
			[
				"/api/settings/opener/test",
				{ selection: invocation.selection, repository: fixture.repository },
			],
		] as const) {
			const result = await fixture.request(path, {
				method: path.endsWith("test") ? "POST" : "PUT",
				body: jsonBody(body),
			});
			expect(result.status).toBe(500);
			expect(CodeTargetOpenFailureSchema.parse(result.body)).toMatchObject({
				success: false,
				code: "OPENER_CONFIG_INVALID",
			});
			expect(readFileSync(fixture.configFile)).toEqual(corrupt);
		}
		expect(readdirSync(invocation.captureDirectory)).toEqual([]);
		expect((await fixture.request("/api/settings/opener", { method: "DELETE" })).status).toBe(200);
	});

	test.each(["/api/settings/opener", "/api/settings/opener/test", "/api/code-targets/open"])(
		"returns the shared REQUEST_INVALID contract for malformed JSON at %s",
		async (path) => {
			await using resources = new AsyncDisposableStack();
			const fixture = await createOpenerFixture();
			resources.defer(() => fixture.dispose());
			const result = await fixture.request(path, {
				method: path.endsWith("opener") ? "PUT" : "POST",
				body: "{",
			});
			expect(result.status).toBe(400);
			expect(CodeTargetOpenFailureSchema.parse(result.body)).toMatchObject({
				success: false,
				code: "REQUEST_INVALID",
			});
		},
	);

	test("rejects unsafe headers before attempting to parse malformed JSON", async () => {
		await using resources = new AsyncDisposableStack();
		const fixture = await createOpenerFixture();
		resources.defer(() => fixture.dispose());
		const result = await fixture.request("/api/code-targets/open", {
			method: "POST",
			headers: { Origin: "null", "Sec-Fetch-Site": "same-origin" },
			body: "{",
		});
		expect(result.status).toBe(403);
		expect(CodeTargetOpenFailureSchema.parse(result.body)).toMatchObject({
			success: false,
			code: "CROSS_ORIGIN_REFUSED",
		});
	});

	test.each([
		{ Host: "evil.test:3000", Origin: "http://127.0.0.1:3000", "Sec-Fetch-Site": "same-origin" },
		{ Host: "127.0.0.1:3000", Origin: "null", "Sec-Fetch-Site": "same-origin" },
		{ Host: "127.0.0.1:3000", Origin: "http://127.0.0.1:3000", "Sec-Fetch-Site": "same-site" },
	] as const)("rejects unsafe browser mutation headers before state or spawn", async (headers) => {
		await using resources = new AsyncDisposableStack();
		const fixture = await createOpenerFixture();
		resources.defer(() => fixture.dispose());
		const invocation = fixture.invocation("immediate");
		resources.defer(() => invocation.releaseAndWait());

		const result = await fixture.request("/api/settings/opener/test", {
			method: "POST",
			headers,
			body: jsonBody({ selection: invocation.selection, repository: fixture.repository }),
		});
		expect(result.status).toBe(403);
		expect(result.body).toMatchObject({ success: false, code: "CROSS_ORIGIN_REFUSED" });
		expect(existsSync(fixture.configFile)).toBeFalse();
		expect(readdirSync(invocation.captureDirectory)).toEqual([]);
	});
});
