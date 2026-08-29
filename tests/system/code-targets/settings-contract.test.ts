import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";

import {
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
