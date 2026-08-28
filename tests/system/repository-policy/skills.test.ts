import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isEscaped(text: string, index: number): boolean {
	let slashes = 0;
	for (let cursor = index - 1; cursor >= 0 && text[cursor] === "\\"; cursor -= 1) slashes += 1;
	return slashes % 2 === 1;
}

function tableCells(line: string): string[] {
	const cells: string[] = [];
	let start = 0;
	for (let index = 0; index < line.length; index += 1) {
		if (line[index] !== "|" || isEscaped(line, index)) continue;
		cells.push(line.slice(start, index));
		start = index + 1;
	}
	cells.push(line.slice(start));
	if (line.startsWith("|")) cells.shift();
	if (line.endsWith("|") && !isEscaped(line, line.length - 1)) cells.pop();
	return cells.map((cell) => cell.trim());
}

function isTableSeparator(line: string): boolean {
	const cells = tableCells(line);
	return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function validateSkillText(source: string, label: string): string[] {
	const errors: string[] = [];
	const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
	if (!match) {
		errors.push(`${label}: missing YAML frontmatter delimited by --- lines`);
	} else {
		try {
			const frontmatter = Bun.YAML.parse(match[1] ?? "");
			if (!isPlainObject(frontmatter)) {
				errors.push(`${label}: YAML frontmatter must be a mapping`);
			} else {
				for (const field of ["name", "description"]) {
					const value = frontmatter[field];
					if (typeof value !== "string" || value.trim() === "") {
						errors.push(`${label}: YAML frontmatter field ${field} must be a non-empty string`);
					}
				}
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			errors.push(`${label}: invalid YAML frontmatter: ${message}`);
		}
	}

	const lines = source.split(/\r?\n/);
	let fence: string | undefined;
	for (let index = 0; index < lines.length - 1; index += 1) {
		const line = lines[index] ?? "";
		const fenceMatch = line.trim().match(/^(```+|~~~+)/);
		if (fenceMatch) {
			const marker = fenceMatch[1]?.[0];
			if (fence === undefined) fence = marker;
			else if (fence === marker) fence = undefined;
			continue;
		}
		if (fence !== undefined || !line.trimStart().startsWith("|")) continue;
		const next = lines[index + 1] ?? "";
		if (!isTableSeparator(next)) continue;

		const expected = tableCells(line).length;
		const separator = tableCells(next).length;
		if (separator !== expected) {
			errors.push(
				`${label}:${index + 2}: Markdown table separator has ${separator} columns; header has ${expected}`,
			);
		}
		for (let row = index + 2; row < lines.length; row += 1) {
			const value = lines[row] ?? "";
			if (!value.trimStart().startsWith("|")) break;
			const actual = tableCells(value).length;
			if (actual !== expected) {
				errors.push(
					`${label}:${row + 1}: Markdown table row has ${actual} columns; expected ${expected}. Escape literal pipes as \\|.`,
				);
			}
		}
		index += 1;
	}
	return errors;
}

describe("skill repository policy", () => {
	test("accepts valid frontmatter, YAML metadata, and escaped table pipes", () => {
		const valid = `---\nname: demo\ndescription: >-\n  Draw a diagram: safely.\n---\n\n| Task | Command |\n| --- | --- |\n| Import | \`import [file\\|-]\` |\n`;
		expect(validateSkillText(valid, "valid fixture")).toEqual([]);
	});

	test("rejects missing frontmatter", () => {
		expect(validateSkillText("# Demo\n", "missing fixture")).toEqual([
			"missing fixture: missing YAML frontmatter delimited by --- lines",
		]);
	});

	test("rejects malformed YAML", () => {
		const errors = validateSkillText(
			"---\nname: demo\ndescription: Draw a diagram: safely.\n---\n",
			"invalid YAML fixture",
		);
		expect(errors.some((error) => error.includes("invalid YAML"))).toBeTrue();
	});

	test("rejects non-mapping and incomplete metadata", () => {
		expect(validateSkillText("---\n- demo\n---\n", "list fixture")).toContain(
			"list fixture: YAML frontmatter must be a mapping",
		);
		expect(validateSkillText("---\nname: demo\n---\n", "metadata fixture")).toContain(
			"metadata fixture: YAML frontmatter field description must be a non-empty string",
		);
	});

	test("rejects unescaped table pipes and mismatched separators", () => {
		const unescaped = `---\nname: demo\ndescription: Demo\n---\n\n| Task | Command |\n| --- | --- |\n| Import | \`import [file|-]\` |\n`;
		expect(validateSkillText(unescaped, "table fixture")).toContain(
			"table fixture:8: Markdown table row has 3 columns; expected 2. Escape literal pipes as \\|.",
		);
		const separator = `---\nname: demo\ndescription: Demo\n---\n\n| A | B |\n| --- |\n`;
		expect(validateSkillText(separator, "separator fixture")).toContain(
			"separator fixture:7: Markdown table separator has 1 columns; header has 2",
		);
	});

	test("ignores table-like text inside fenced code", () => {
		const fenced = `---\nname: demo\ndescription: Demo\n---\n\n\`\`\`md\n| A | B |\n| --- | --- |\n| broken | pipe | here |\n\`\`\`\n`;
		expect(validateSkillText(fenced, "fenced fixture")).toEqual([]);
	});

	test("the distributable skills tree is valid", () => {
		const skillsRoot = path.join(repoRoot, "skills");
		const files = fs
			.readdirSync(skillsRoot, { withFileTypes: true })
			.filter((entry) => entry.isDirectory())
			.map((entry) => path.join(skillsRoot, entry.name, "SKILL.md"))
			.filter((file) => fs.existsSync(file))
			.toSorted();
		expect(files.length).toBeGreaterThan(0);
		const errors = files.flatMap((file) =>
			validateSkillText(fs.readFileSync(file, "utf8"), path.relative(repoRoot, file)),
		);
		expect(errors).toEqual([]);
	});
});
