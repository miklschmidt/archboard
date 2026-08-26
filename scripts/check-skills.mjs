import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const skillsRoot = path.join(repoRoot, "skills");

function isPlainObject(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isEscaped(text, index) {
	let slashes = 0;
	for (let cursor = index - 1; cursor >= 0 && text[cursor] === "\\"; cursor -= 1) {
		slashes += 1;
	}
	return slashes % 2 === 1;
}

function tableCells(line) {
	const cells = [];
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

function isTableSeparator(line) {
	const cells = tableCells(line);
	return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

export function validateSkillText(source, label) {
	const errors = [];
	const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
	if (!match) {
		errors.push(`${label}: missing YAML frontmatter delimited by --- lines`);
	} else {
		try {
			const frontmatter = Bun.YAML.parse(match[1]);
			if (!isPlainObject(frontmatter)) {
				errors.push(`${label}: YAML frontmatter must be a mapping`);
			} else {
				for (const field of ["name", "description"]) {
					if (typeof frontmatter[field] !== "string" || frontmatter[field].trim() === "") {
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
	let fence = null;
	for (let index = 0; index < lines.length - 1; index += 1) {
		const trimmed = lines[index].trim();
		const fenceMatch = trimmed.match(/^(```+|~~~+)/);
		if (fenceMatch) {
			if (fence === null) fence = fenceMatch[1][0];
			else if (fence === fenceMatch[1][0]) fence = null;
			continue;
		}
		if (fence !== null || !lines[index].trimStart().startsWith("|")) continue;
		if (!isTableSeparator(lines[index + 1])) continue;

		const expected = tableCells(lines[index]).length;
		const separator = tableCells(lines[index + 1]).length;
		if (separator !== expected) {
			errors.push(
				`${label}:${index + 2}: Markdown table separator has ${separator} columns; header has ${expected}`,
			);
		}

		for (let row = index + 2; row < lines.length; row += 1) {
			if (!lines[row].trimStart().startsWith("|")) break;
			const actual = tableCells(lines[row]).length;
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

function runSelfTest() {
	const valid = `---\nname: demo\ndescription: >-\n  Draw a diagram: safely.\n---\n\n| Task | Command |\n| --- | --- |\n| Import | \`import [file\\|-]\` |\n`;
	const invalidYaml = `---\nname: demo\ndescription: Draw a diagram: safely.\n---\n`;
	const invalidTable = `---\nname: demo\ndescription: Demo\n---\n\n| Task | Command |\n| --- | --- |\n| Import | \`import [file|-]\` |\n`;

	if (validateSkillText(valid, "valid fixture").length !== 0) {
		throw new Error("valid skill fixture was rejected");
	}
	if (
		!validateSkillText(invalidYaml, "invalid YAML fixture").some((error) =>
			error.includes("invalid YAML"),
		)
	) {
		throw new Error("invalid YAML fixture was accepted");
	}
	if (
		!validateSkillText(invalidTable, "invalid table fixture").some((error) =>
			error.includes("3 columns"),
		)
	) {
		throw new Error("unescaped table pipe fixture was accepted");
	}
	console.log("Skill lint self-test passed.");
}

function skillFiles() {
	return fs
		.readdirSync(skillsRoot, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => path.join(skillsRoot, entry.name, "SKILL.md"))
		.filter((file) => fs.existsSync(file))
		.toSorted();
}

if (process.argv.includes("--self-test")) {
	runSelfTest();
} else {
	const files = skillFiles();
	if (files.length === 0) throw new Error("No distributable skills found under skills/*/SKILL.md");
	const errors = files.flatMap((file) =>
		validateSkillText(fs.readFileSync(file, "utf8"), path.relative(repoRoot, file)),
	);
	if (errors.length > 0) {
		console.error(errors.join("\n"));
		process.exit(1);
	}
	console.log(`Validated ${files.length} distributable skill frontmatter and Markdown tables.`);
}
