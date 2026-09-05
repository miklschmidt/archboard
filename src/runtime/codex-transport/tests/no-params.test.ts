import { describe, expect, test } from "bun:test";

import { CodexTransportUsageError } from "../errors.js";
import { captureRejection, createHarness, frameAt, frames, sendJson } from "./fake-child.js";

describe("Codex app-server no-parameter requests", () => {
	test("omits params for the exact generated methods and rejects invented objects", async () => {
		const { child, transport, close } = createHarness();
		try {
			const requirementsPromise = transport.request("configRequirements/read", undefined);
			const requirementsFrame = frameAt(child, 0);
			expect(requirementsFrame).toEqual({
				id: expect.any(String),
				method: "configRequirements/read",
			});
			sendJson(child, { id: requirementsFrame["id"], result: { requirements: null } });
			expect((await requirementsPromise).result).toEqual({ requirements: null });

			const logoutPromise = transport.request("account/logout", undefined);
			const logoutFrame = frameAt(child, 1);
			expect(logoutFrame).toEqual({ id: expect.any(String), method: "account/logout" });
			sendJson(child, { id: logoutFrame["id"], result: {} });
			expect((await logoutPromise).result).toEqual({});

			const requirementsError = await captureRejection(
				transport.request("configRequirements/read", {} as never),
			);
			expect(requirementsError).toBeInstanceOf(CodexTransportUsageError);
			expect((requirementsError as Error).message).toBe(
				"Invalid Codex transport operation: Codex request configRequirements/read must omit params",
			);

			const logoutError = await captureRejection(transport.request("account/logout", {} as never));
			expect(logoutError).toBeInstanceOf(CodexTransportUsageError);
			expect((logoutError as Error).message).toBe(
				"Invalid Codex transport operation: Codex request account/logout must omit params",
			);

			const objectParamsError = await captureRejection(transport.request("config/read", undefined));
			expect(objectParamsError).toBeInstanceOf(CodexTransportUsageError);
			expect((objectParamsError as Error).message).toBe(
				"Invalid Codex transport operation: Codex request params must be a JSON object",
			);
			expect(frames(child)).toHaveLength(2);
		} finally {
			await close();
		}
	});
});
