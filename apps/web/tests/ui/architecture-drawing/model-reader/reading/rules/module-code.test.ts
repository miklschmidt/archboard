import { expect, test } from "bun:test";
import { codeByModule } from "#ui/architecture-drawing/model-reader/reading/rules/module-code.ts";

test("a withheld shallow verdict leaves the measured width and marks the module partial", () => {
	const subject = { kind: "node", id: "api", name: "API" } as const;
	const modules = codeByModule({
		model: "Shop",
		state: null,
		revision: { digest: "a".repeat(64), files: [] },
		checkedAt: "2026-11-19T12:00:00.000Z",
		findings: [],
		depth: [
			{
				model: "Shop",
				subject,
				repo: "example/shop",
				directory: "src/api",
				languages: ["typescript"],
				unjudged: [],
				exports: { functions: 1, classes: 0, methods: 0, values: 0, types: 0 },
				logic: 4,
				width: 1,
				switchboards: [],
			},
		],
		skipped: [{ reason: "key-unclosed", subject, detail: "dispatch: Operation" }],
	});
	expect(modules.get("api")).toMatchObject({
		kind: "read",
		width: 1,
		findings: 0,
		partial: ["shallow verdict withheld for unresolved switchboard keys (dispatch: Operation)"],
	});
});
