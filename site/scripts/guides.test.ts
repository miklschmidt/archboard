import { expect, test } from "bun:test";
import { guideProblems } from "./guides";
import reference from "../src/generated/reference.json" with { type: "json" };

const code = (language: string, body: string): string => `\`\`\`${language}\n${body}\n\`\`\``;
const problems = (source: string): string[] => guideProblems("example.mdx", source);

test("continued shell commands and the pinned executable retain flag validation", () => {
	for (const executable of ["archboard", "./node_modules/.bin/archboard"]) {
		expect(problems(code("bash", `${executable} check code \\\n  --review-invalid`))).toHaveLength(
			1,
		);
	}
});

test("quoted directories and option values do not become commands or flags", () => {
	expect(problems(code("bash", 'archboard -C "checkout with spaces" model read'))).toEqual([]);
	expect(problems(code("bash", "archboard --url=http://127.0.0.1:4242 check --fix"))).toEqual([]);
	expect(
		problems(
			code("bash", "archboard repo language-server python pyright-langserver --arg --stdio"),
		),
	).toEqual([]);
});

test("workflow shell commands use the same CLI contract", () => {
	for (const key of ["run", "script"]) {
		expect(problems(code("yaml", `steps:\n  - ${key}: archboard review-invalid`))).toHaveLength(1);
	}
});

test("environment variables are validated in shell and workflow examples", () => {
	for (const source of [
		code("bash", "ARCHBOARD_REVIEW_UNKNOWN=1 archboard check"),
		code("yaml", "env:\n  ARCHBOARD_REVIEW_UNKNOWN: 1"),
	])
		expect(problems(source)).toHaveLength(1);
	for (const entry of reference.environment) {
		expect(problems(code("yaml", `env:\n  ${entry.name}: example`))).toEqual([]);
	}
});

test("a linked input, output, or finding must point to its own reference row", () => {
	for (const action of reference.actions) {
		for (const port of [...action.inputs, ...action.outputs]) {
			const label = `\`${port.name}\``;
			expect(problems(`[${label}](../reference/actions/#${action.slug}-${port.name})`)).toEqual([]);
			expect(problems(`[${label}](../reference/actions/#review-wrong-row)`)).toHaveLength(1);
		}
	}
	for (const finding of reference.findings.flatMap((entry) => entry.codes)) {
		const anchor = finding.toLowerCase().replaceAll("_", "-");
		expect(problems(`[\`${finding}\`](../reference/findings/#${anchor})`)).toEqual([]);
		expect(problems(`[\`${finding}\`](../reference/findings/#review-wrong-row)`)).toHaveLength(1);
	}
});

test("a deep checkout must precede the Action in its own job and directory", () => {
	const checkout = "- uses: actions/checkout@v5\n        with:\n          fetch-depth: 0";
	const action = "- uses: miklschmidt/archboard/actions/pull-request@{{sha}} # {{ref}}";
	const job = (steps: string): string => `    steps:\n      ${steps}`;
	const workflow = (steps: string): string => code("yaml", `jobs:\n  report:\n${job(steps)}`);
	expect(problems(workflow(`${checkout}\n      ${action}`))).toEqual([]);
	expect(problems(workflow(`${action}\n      ${checkout}`))).toHaveLength(1);
	expect(problems(workflow(`${checkout}\n          path: other\n      ${action}`))).toHaveLength(1);
	expect(
		problems(code("yaml", `jobs:\n  unrelated:\n${job(checkout)}\n  report:\n${job(action)}`)),
	).toHaveLength(1);
	expect(
		problems(
			workflow(
				`${checkout}\n          path: app\n      ${action}\n        with:\n          working-directory: app`,
			),
		),
	).toEqual([]);
});

test("a CLI version written by hand is refused, with or without a range", () => {
	const byHand = (source: string): boolean =>
		problems(source).some((problem) => problem.includes("pins by hand"));
	for (const pin of ["0.3.0", "^0.3.0", "~0.3.0", ">=0.3.0"]) {
		expect(byHand(code("bash", `npm install --global archboard@${pin}`))).toBe(true);
		expect(byHand(code("yaml", `with:\n  version: ${pin}`))).toBe(true);
	}
	expect(byHand(code("bash", "npm install --global archboard@{{version}}"))).toBe(false);
	expect(byHand(code("yaml", "with:\n  version: {{version}}"))).toBe(false);
});
