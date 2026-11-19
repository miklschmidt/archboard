import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { parseModelRequest, readModelReply } from "@archboard/model-contract";

describe("an answer that came with an HTTP failure", () => {
	const refusal = {
		success: false,
		code: "MODEL_NOT_FOUND",
		error: "No model is stored here.",
		diagnostics: [
			{
				code: "MODEL_NOT_FOUND",
				file: "model.json",
				message: "No model is stored here.",
				recovery: "Initialize the model first.",
			},
		],
	};
	const success = { success: true };

	test("is read only when it is a structured refusal", () => {
		const read = readModelReply("recover", refusal, "failed");
		expect(read.success).toBe(true);
		expect(read.success && read.data).toMatchObject({ success: false, code: "MODEL_NOT_FOUND" });
	});

	test("is not an answer when it is a success body", () => {
		const read = readModelReply("recover", success, "failed");
		expect(read.success).toBe(false);
		expect(readModelReply("recover", { success: false, code: "NOPE" }, "failed").success).toBe(
			false,
		);
	});

	test("is read either way when it was delivered as answered", () => {
		expect(readModelReply("recover", success).success).toBe(true);
		expect(readModelReply("recover", refusal, "answered").success).toBe(true);
	});
});

describe("a request's vault envelope", () => {
	const edit = {
		target: { model: "Shop", state: null },
		subject: "Shop#Box",
		expectedRevision: { digest: "d", files: [] },
		operationId: "op-1",
		writer: "agent",
		doing: "describing the box",
		claim: "claim1",
		description: "Takes the orders.",
	};
	const initialize = { name: "Shop", operationId: "op-1", writer: "agent", doing: "starting" };

	test("an envelope operation takes the vault off the body and reads the intent without it", () => {
		const parsed = parseModelRequest("edit", { vault: "/shop", ...edit });
		expect(parsed).toEqual({ success: true, vault: "/shop", data: edit });
		expect(parseModelRequest("edit", edit)).toMatchObject({ success: true, vault: undefined });
	});

	test("an extended operation reads the vault beside its own fields", () => {
		const parsed = parseModelRequest("initialize", { vault: "/shop", ...initialize });
		expect(parsed).toEqual({ success: true, vault: "/shop", data: initialize });
	});

	test.each([
		["edit", edit],
		["initialize", initialize],
	] as const)(
		"%s refuses a vault that is not a string with the refusal a server answers",
		(operation, body) => {
			const parsed = parseModelRequest(operation, { vault: 7, ...body });
			expect(parsed.success).toBe(false);
			if (parsed.success) return;
			expect(parsed.refusal).toEqual({
				success: false,
				code: "INVALID_REQUEST",
				error: z.prettifyError(parsed.error),
			});
			expect(parsed.refusal.error).toContain("vault");
		},
	);

	test("a field the intent does not know is refused by name, and the vault is no excuse", () => {
		const parsed = parseModelRequest("edit", { vault: "/shop", ...edit, surprise: true });
		expect(parsed.success).toBe(false);
		expect(!parsed.success && parsed.refusal.error).toContain("surprise");
	});
});
