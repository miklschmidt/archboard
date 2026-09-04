import { describe, expect, test } from "bun:test";

import {
	applyApprovalFormEvent,
	approvalFields,
	initialApprovalForm,
	isGenuineBinaryApproval,
	validateApprovalForm,
	type WorkbenchApprovalControl,
	type WorkbenchApprovalField,
} from "../index.js";
import {
	commandApproval,
	elicitationApproval,
	elicitationField,
	userInputApproval,
} from "./fixtures.js";

type Overrides = Readonly<Record<string, unknown>>;

function fieldsFor(overrides: Overrides): readonly WorkbenchApprovalField[] {
	return approvalFields(elicitationApproval({ fields: [elicitationField(overrides)] }));
}

function errorFor(overrides: Overrides, value: string): string | null {
	const fields = fieldsFor(overrides);
	const form = applyApprovalFormEvent(initialApprovalForm(fields), {
		kind: "value",
		name: "field:value",
		value,
	});
	return validateApprovalForm(fields, form)[0]?.message ?? null;
}

describe("reviewed field descriptors", () => {
	const controls: readonly (readonly [Overrides, WorkbenchApprovalControl])[] = [
		[{ type: "string" }, "text"],
		[{ type: "string", maxLength: 2048 }, "multiline"],
		[{ type: "string", secret: true }, "secret"],
		[{ type: "string", format: "email" }, "email"],
		[{ type: "string", format: "uri" }, "url"],
		[{ type: "string", format: "date" }, "date"],
		[{ type: "string", format: "date-time" }, "date_time"],
		[{ type: "number" }, "number"],
		[{ type: "integer" }, "integer"],
		[{ type: "boolean" }, "boolean"],
		[{ type: "enum", options: ["a", "b"] }, "enum"],
		[{ type: "enum", options: ["a", "b"], maximumItems: 2 }, "multi_enum"],
	];

	for (const [source, control] of controls)
		test(`maps ${JSON.stringify(source)} to the ${control} control`, () => {
			expect(fieldsFor(source)[0]?.control).toBe(control);
		});

	test("never projects a secret default", () => {
		expect(fieldsFor({ secret: true, defaultValue: null })[0]?.defaultValue).toBeNull();
		expect(fieldsFor({ defaultValue: "kept" })[0]?.defaultValue).toBe("kept");
	});

	test("carries a requestUserInput question with its options and other answer", () => {
		const fields = approvalFields(userInputApproval());

		expect(fields.map((field) => field.name)).toEqual(["question:environment", "question:token"]);
		expect(fields[0]?.control).toBe("multi_enum");
		expect(fields[0]?.allowsOther).toBe(true);
		expect(fields[0]?.options?.map((option) => option.label)).toEqual(["staging", "production"]);
		expect(fields[1]?.secret).toBe(true);
		expect(fields[1]?.control).toBe("secret");
	});

	test("gives a command execution and file change request no reviewed fields", () => {
		expect(approvalFields(commandApproval())).toHaveLength(0);
	});
});

describe("reviewed field validation", () => {
	test("requires an answer only when the host required one", () => {
		expect(errorFor({ required: true }, "")).toContain("needs an answer");
		expect(errorFor({ required: false }, "")).toBeNull();
	});

	test("holds text length bounds", () => {
		expect(errorFor({ minLength: 4 }, "ab")).toContain("at least 4 characters");
		expect(errorFor({ maxLength: 3 }, "abcd")).toContain("at most 3 characters");
	});

	test("holds numeric type and bounds", () => {
		expect(errorFor({ type: "number" }, "abc")).toContain("must be a number");
		expect(errorFor({ type: "integer" }, "1.5")).toContain("whole number");
		expect(errorFor({ type: "number", minimum: 2 }, "1")).toContain("at least 2");
		expect(errorFor({ type: "number", maximum: 2 }, "3")).toContain("at most 2");
		expect(errorFor({ type: "integer", minimum: 1, maximum: 9 }, "5")).toBeNull();
	});

	test("holds the safe-URL, email and date formats", () => {
		expect(errorFor({ format: "uri" }, "javascript:alert(1)")).toContain("http or https URL");
		expect(errorFor({ format: "uri" }, "file:///etc/passwd")).toContain("http or https URL");
		expect(errorFor({ format: "uri" }, "https://example.test")).toBeNull();
		expect(errorFor({ format: "email" }, "not-an-address")).toContain("email address");
		expect(errorFor({ format: "email" }, "a@example.test")).toBeNull();
		expect(errorFor({ format: "date" }, "2026-13")).toContain("YYYY-MM-DD");
		expect(errorFor({ format: "date" }, "2026-09-04")).toBeNull();
		expect(errorFor({ format: "date-time" }, "not a time")).toContain("date and time");
	});

	test("holds the offered enum answers", () => {
		expect(errorFor({ type: "enum", options: ["a", "b"] }, "c")).toContain('does not offer "c"');
		expect(errorFor({ type: "enum", options: ["a", "b"] }, "b")).toBeNull();
	});

	test("holds item bounds and the offered answers of a multi-choice field", () => {
		const fields = fieldsFor({
			type: "enum",
			options: ["a", "b", "c"],
			minimumItems: 2,
			maximumItems: 2,
			required: true,
		});
		const select = (value: readonly string[]) =>
			validateApprovalForm(
				fields,
				applyApprovalFormEvent(initialApprovalForm(fields), {
					kind: "selection",
					name: "field:value",
					value,
				}),
			);

		expect(select([])[0]?.message).toContain("at least 2 answers");
		expect(select(["a", "b", "c"])[0]?.message).toContain("at most 2 answers");
		expect(select(["a", "z"])[0]?.message).toContain('does not offer "z"');
		expect(select(["a", "b"])).toHaveLength(0);
	});
});

describe("form state", () => {
	test("seeds published defaults and never a secret", () => {
		const fields = approvalFields(elicitationApproval());
		const form = initialApprovalForm(fields);

		expect(form.values["field:host"]).toBe("https://example.test");
		expect(form.values["field:port"]).toBe("443");
		expect(form.values["field:apiKey"]).toBeUndefined();
		expect(form.flags["field:tls"]).toBe(false);
	});

	test("records values, flags and selections without touching the others", () => {
		const fields = approvalFields(userInputApproval());
		const withSelection = applyApprovalFormEvent(initialApprovalForm(fields), {
			kind: "selection",
			name: "question:environment",
			value: ["staging"],
		});
		const withFlag = applyApprovalFormEvent(withSelection, {
			kind: "flag",
			name: "question:environment",
			value: true,
		});

		expect(withFlag.selections["question:environment"]).toEqual(["staging"]);
		expect(withFlag.flags["question:environment"]).toBe(true);
		expect(withFlag.values["question:environment"]).toBeUndefined();
	});
});

describe("genuine binary approvals", () => {
	test("accepts exactly one accept and one decline on a command execution", () => {
		expect(isGenuineBinaryApproval(commandApproval())).toBe(true);
		expect(
			isGenuineBinaryApproval(commandApproval({ availableDecisions: ["decline", "accept"] })),
		).toBe(true);
	});

	test("refuses a broader grant, an amendment, an incomplete set and every other family", () => {
		for (const decisions of [
			["accept"],
			["accept", "decline", "cancel"],
			["acceptForSession", "decline"],
			[{ acceptWithExecpolicyAmendment: { execpolicy_amendment: ["allow"] } }, "decline"],
		])
			expect(isGenuineBinaryApproval(commandApproval({ availableDecisions: decisions }))).toBe(
				false,
			);
		expect(isGenuineBinaryApproval(userInputApproval())).toBe(false);
		expect(isGenuineBinaryApproval(elicitationApproval())).toBe(false);
	});
});
