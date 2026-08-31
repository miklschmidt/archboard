import { describe, expect, test } from "bun:test";
import { withPrimaryAndCleanup } from "./support/vite-tailwind-fixture.ts";

async function failureRecord(
	action: () => Promise<unknown>,
): Promise<{ thrown: boolean; error: unknown }> {
	try {
		await action();
		return { thrown: false, error: undefined };
	} catch (error) {
		return { thrown: true, error };
	}
}

describe("Vite Tailwind failure pairing", () => {
	test("preserves undefined cleanup failures alone and after a primary failure", async () => {
		const primary = new Error("primary");
		const cleanupOnly = await failureRecord(() =>
			withPrimaryAndCleanup(
				async () => "ok",
				() => {
					throw undefined;
				},
			),
		);
		const both = await failureRecord(() =>
			withPrimaryAndCleanup(
				async () => {
					throw primary;
				},
				() => {
					throw undefined;
				},
			),
		);
		expect(cleanupOnly).toEqual({ thrown: true, error: undefined });
		expect(both.thrown).toBe(true);
		expect((both.error as AggregateError).errors).toEqual([primary, undefined]);
	});
});
