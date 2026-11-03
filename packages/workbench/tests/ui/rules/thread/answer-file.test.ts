import { expect, test } from "bun:test";

import { answerFile } from "#ui/rules/thread/answer-file.ts";

test("a link to an absolute path names that file and the line Codex writes after it", () => {
	const file = "/Users/msc/repo/scripts/command.ts";
	expect(answerFile(`${file}:24`)).toEqual({ path: file, line: 24 });
	expect(answerFile(`${file}:24:7`)).toEqual({ path: file, line: 24 });
	expect(answerFile(`${file}#L24`)).toEqual({ path: file, line: 24 });
	expect(answerFile(`${file}#L24C7`)).toEqual({ path: file, line: 24 });
	expect(answerFile(file)).toEqual({ path: file });
	expect(answerFile(`${file}:0`)).toEqual({ path: file });
	// Markdown escapes what a link destination cannot hold.
	expect(answerFile("/Users/msc/My%20Repo/caf%C3%A9.ts:3")).toEqual({
		path: "/Users/msc/My Repo/café.ts",
		line: 3,
	});
});

test("a link that names no local file names none", () => {
	for (const href of [
		undefined,
		"https://github.com/acme/payments",
		"//example.com/path",
		"mailto:someone@example.com",
		"src/relative.ts:3",
		"#section",
	]) {
		expect(answerFile(href)).toBeNull();
	}
});
