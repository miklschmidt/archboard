import { describe, expect, test } from "bun:test";

import { PATH_TOKEN } from "@/shared/code-target";
import {
	argvOfText,
	checkCustomCommand,
	choiceOfSelection,
	draftOfSelection,
	presetOfChoice,
	selectionOfChoice,
} from "@/ui/opener-settings";

describe("opener custom command", () => {
	test("maps every selection kind to its radio entry and back", () => {
		expect(choiceOfSelection({ version: 1, kind: "platform" })).toBe("platform");
		expect(choiceOfSelection({ version: 1, kind: "preset", preset: "zed" })).toBe("preset:zed");
		expect(
			choiceOfSelection({ version: 1, kind: "custom", executable: "code", argv: [PATH_TOKEN] }),
		).toBe("custom");
		expect(presetOfChoice("preset:cursor")).toBe("cursor");
		expect(presetOfChoice("custom")).toBeNull();
	});

	test("a custom draft round-trips its argv one per line", () => {
		const draft = draftOfSelection({
			version: 1,
			kind: "custom",
			executable: "/usr/bin/code",
			argv: ["--goto", PATH_TOKEN],
		});
		expect(draft).toEqual({ executable: "/usr/bin/code", argvText: `--goto\n${PATH_TOKEN}` });
		expect(argvOfText(" --goto \n\n{path}\r\n")).toEqual(["--goto", "{path}"]);
		expect(draftOfSelection({ version: 1, kind: "platform" }).argvText).toBe(PATH_TOKEN);
	});

	test("accepts a bare or absolute executable with exactly one path token", () => {
		const check = checkCustomCommand({ executable: " code ", argvText: `--goto\n${PATH_TOKEN}` });
		expect(check).toEqual({
			ok: true,
			selection: { version: 1, kind: "custom", executable: "code", argv: ["--goto", PATH_TOKEN] },
		});
	});

	test("routes the executable shape and the schema's argv rule to their fields", () => {
		const relative = checkCustomCommand({ executable: "bin/code", argvText: PATH_TOKEN });
		expect(relative.ok).toBe(false);
		if (!relative.ok) {
			expect(relative.issues.executable).toHaveLength(1);
			expect(relative.issues.argv).toEqual([]);
		}
		const noToken = checkCustomCommand({ executable: "code", argvText: "--goto" });
		expect(noToken.ok).toBe(false);
		if (!noToken.ok) {
			expect(noToken.issues.executable).toEqual([]);
			expect(noToken.issues.argv.join(" ")).toContain("{path}");
		}
		const blank = checkCustomCommand({ executable: "", argvText: PATH_TOKEN });
		expect(blank.ok).toBe(false);
		if (!blank.ok) {
			expect(blank.issues.executable).toHaveLength(1);
		}
	});

	test("a radio choice other than custom never reads the draft", () => {
		const broken = { executable: "bin/x", argvText: "" };
		expect(selectionOfChoice("platform", broken)).toEqual({
			ok: true,
			selection: { version: 1, kind: "platform" },
		});
		expect(selectionOfChoice("preset:vscode", broken)).toEqual({
			ok: true,
			selection: { version: 1, kind: "preset", preset: "vscode" },
		});
		expect(selectionOfChoice("custom", broken).ok).toBe(false);
	});
});
