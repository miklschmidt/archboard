import { describe, expect, test } from "bun:test";

import { CodexTransportUsageError } from "../errors.js";
import { captureRejection, createHarness, frameAt, frames, sendJson } from "./fake-child.js";

function errorMessage(value: unknown): string {
	if (value instanceof Error) {
		return value.message;
	}
	throw new Error("Expected an Error rejection");
}

describe("Codex app-server no-parameter requests", () => {
	test("omits params for the exact generated methods and rejects invented objects", async () => {
		const { child, transport, close } = createHarness();
		try {
			const requirementsPromise = Reflect.apply(transport.request, transport, [
				"configRequirements/read",
				undefined,
			]);
			const requirementsFrame = frameAt(child, 0);
			expect(requirementsFrame).toEqual({
				id: expect.any(String),
				method: "configRequirements/read",
			});
			sendJson(child, { id: requirementsFrame["id"], result: { requirements: null } });
			const requirementsResponse = await requirementsPromise;
			expect(requirementsResponse.result).toEqual({ requirements: null });

			const logoutPromise = Reflect.apply(transport.request, transport, [
				"account/logout",
				undefined,
			]);
			const logoutFrame = frameAt(child, 1);
			expect(logoutFrame).toEqual({ id: expect.any(String), method: "account/logout" });
			sendJson(child, { id: logoutFrame["id"], result: {} });
			const logoutResponse = await logoutPromise;
			expect(logoutResponse.result).toEqual({});

			const requirementsError = await captureRejection(
				Reflect.apply(transport.request, transport, ["configRequirements/read", {}]),
			);
			expect(requirementsError).toBeInstanceOf(CodexTransportUsageError);
			expect(errorMessage(requirementsError)).toBe(
				"Invalid Codex transport operation: Codex request configRequirements/read must omit params",
			);

			const logoutError = await captureRejection(
				Reflect.apply(transport.request, transport, ["account/logout", {}]),
			);
			expect(logoutError).toBeInstanceOf(CodexTransportUsageError);
			expect(errorMessage(logoutError)).toBe(
				"Invalid Codex transport operation: Codex request account/logout must omit params",
			);

			const objectParamsError = await captureRejection(
				Reflect.apply(transport.request, transport, ["config/read", undefined]),
			);
			expect(objectParamsError).toBeInstanceOf(CodexTransportUsageError);
			expect(errorMessage(objectParamsError)).toBe(
				"Invalid Codex transport operation: Codex request params must be a JSON object",
			);
			expect(frames(child)).toHaveLength(2);
		} finally {
			await close();
		}
	});
});
