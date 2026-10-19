import { describe, expect, test } from "bun:test";
import { withoutOldBlock } from "#cli/operations/install-skill/install-skill.ts";

// Which bytes of an agent document an upgrade cuts. The install system test
// owns the plain case end to end; owned here are the documents a person edited
// by hand or saved with other line endings, where a wider cut deletes their text.

const block = (eol: string) =>
	[
		"<!-- archboard:begin -->",
		"<!-- Written by `archboard install-skill`. Re-running replaces this block. -->",
		"```bash",
		"export ARCHBOARD_VAULT=/home/somebody/repo/.archboard/vault",
		"```",
		"<!-- archboard:end -->",
		"",
	].join(eol);

describe("removing the block of an earlier version", () => {
	test("a document saved with CRLF line endings loses the block and its line endings", () => {
		expect(withoutOldBlock(`# A\r\n\r\n${block("\r\n")}## B\r\n`)).toBe("# A\r\n\r\n## B\r\n");
	});

	test("markers quoted inside a line are prose, and the document is left alone", () => {
		const prose =
			"Old versions wrote `<!-- archboard:begin -->` through `<!-- archboard:end -->`.\n";
		expect(withoutOldBlock(prose)).toBeUndefined();
	});

	test("a begin marker without its end keeps the text after it, and a later block still goes", () => {
		const orphan = "# A\n<!-- archboard:begin -->\nmy own notes\n\n";
		expect(withoutOldBlock(`${orphan}${block("\n")}tail\n`)).toBe(`${orphan}tail\n`);
		expect(withoutOldBlock(orphan)).toBeUndefined();
	});

	test("every block goes, and the text between them stays", () => {
		expect(withoutOldBlock(`# A\n${block("\n")}mid\n${block("\n")}`)).toBe("# A\nmid\n");
	});
});
