import { describe, expect, test } from "bun:test";
import { readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { CodeTargetOpenReplySchema } from "@archboard/code-opener/opening";
import { createOpenerFixture, jsonBody, type OpenerFixture } from "./support/opener-fixture.ts";

const LEDGER = `// The ledger.
export const rate = 3;

export class Ledger {
	post(): void {}
}

export function settle(): void {}
`;

const REPOSITORY = "github.com/acme/payments";

/**
 * A fixture whose opener writes the line it was given beside the path, and whose
 * `src/ledger.ts` defines `Ledger.post` on line 5 and `settle` on line 8.
 * @param resources Where the fixture and the opener are released.
 * @returns The fixture and its opener.
 */
async function openerAtLine(resources: AsyncDisposableStack) {
	const fixture = await createOpenerFixture();
	resources.defer(() => fixture.dispose());
	writeFileSync(join(fixture.checkout, "src", "ledger.ts"), LEDGER);
	const invocation = fixture.invocation("immediate", ["--at={line}"]);
	resources.defer(() => invocation.releaseAndWait());
	const saved = await fixture.request("/api/settings/opener", {
		method: "PUT",
		body: jsonBody(invocation.selection),
	});
	expect(saved.status).toBe(200);
	return { fixture, invocation };
}

/**
 * Open the bound element of the fixture.
 * @param fixture The fixture.
 * @returns The route's answer.
 */
function open(fixture: OpenerFixture) {
	return fixture.request("/api/code-targets/open", {
		method: "POST",
		body: jsonBody({ board: "system/payments", element: "node" }),
	});
}

describe("open code at the bound symbol", () => {
	test("opens the file at the line that defines the symbol", async () => {
		await using resources = new AsyncDisposableStack();
		const { fixture, invocation } = await openerAtLine(resources);
		fixture.writeBinding({ repo: REPOSITORY, path: "src/ledger.ts", symbol: "Ledger.post" });

		expect((await open(fixture)).status).toBe(200);
		expect(await invocation.waitForCapture()).toMatchObject({
			target: join(fixture.checkout, "src/ledger.ts"),
			extra: ["--at=5"],
		});
	});

	// Each way to have no line (no symbol, a directory, text) is the symbol-line owner's.
	test("opens the file as it always did where the file does not define the symbol", async () => {
		await using resources = new AsyncDisposableStack();
		const { fixture, invocation } = await openerAtLine(resources);
		fixture.writeBinding({ repo: REPOSITORY, path: "src/ledger.ts", symbol: "missing" });

		const result = await open(fixture);
		expect(result.status).toBe(200);
		expect(CodeTargetOpenReplySchema.parse(result.body)).toMatchObject({ success: true });
		expect(await invocation.waitForCapture()).toMatchObject({
			target: join(fixture.checkout, "src/ledger.ts"),
			extra: ["--at=1"],
		});
	});

	test("the GitHub link names the line when the opener fails, and never for a checkout on another ref", async () => {
		await using resources = new AsyncDisposableStack();
		const { fixture, invocation } = await openerAtLine(resources);
		for (const args of [
			["checkout", "-q", "-b", "work"],
			["commit", "-q", "--allow-empty", "-m", "first"],
		]) {
			Bun.spawnSync(["git", "-c", "user.name=t", "-c", "user.email=t@example.com", ...args], {
				cwd: fixture.checkout,
			});
		}
		const missing = {
			version: 1,
			kind: "custom",
			executable: join(fixture.root, "none"),
			argv: ["{path}"],
		};
		expect(
			(await fixture.request("/api/settings/opener", { method: "PUT", body: jsonBody(missing) }))
				.status,
		).toBe(200);

		// On the bound branch the line was read from the ref that the link names.
		fixture.writeBinding({
			repo: REPOSITORY,
			path: "src/ledger.ts",
			symbol: "settle",
			branch: "work",
		});
		const here = await open(fixture);
		expect(CodeTargetOpenReplySchema.parse(here.body)).toMatchObject({
			code: "OPENER_UNAVAILABLE",
			actions: [
				{ kind: "settings" },
				{ kind: "github", href: "https://github.com/acme/payments/blob/work/src/ledger.ts#L8" },
			],
		});

		// On another ref the working tree is another version: GitHub gets the file and no line.
		fixture.writeBinding({
			repo: REPOSITORY,
			path: "src/ledger.ts",
			symbol: "settle",
			branch: "release/2.1",
		});
		const elsewhere = await open(fixture);
		expect(CodeTargetOpenReplySchema.parse(elsewhere.body)).toMatchObject({
			code: "CHECKOUT_ON_OTHER_REF",
			actions: [
				{
					kind: "github",
					href: "https://github.com/acme/payments/tree/release%2F2.1/src/ledger.ts",
				},
			],
		});
		expect(readdirSync(invocation.captureDirectory)).toEqual([]);
	});
});
