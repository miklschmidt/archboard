// The check action turns the answer of `archboard check` into annotations on a pull request, a
// job summary, outputs and an exit status. The pure parts run on a real-shaped answer. The entry
// runs against a stand-in `archboard` that prints it.

import { beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CodeCheckAnswerSchema } from "@archboard/code-intel/code-check";
import { annotationsFor } from "../../../actions/check/annotations.ts";
import { cachedFileReader } from "../../../actions/shared/checkouts.ts";
import { collectFindings } from "../../../actions/check/findings.ts";
import type { CheckReading } from "../../../actions/check/findings.ts";
import { decideOutcome } from "../../../actions/check/outcome.ts";
import { splitArguments } from "../../../actions/shared/arguments.ts";
import { annotationLine } from "../../../actions/shared/workflow-commands.ts";
import { fixture, runEntry, scratch, writeStandIn } from "./support.ts";

const workspace = scratch();
const entry = join(import.meta.dir, "../../../actions/check/run.ts");
let answer: CheckReading;

beforeAll(() => {
	mkdirSync(join(workspace, "app/src"), { recursive: true });
	mkdirSync(join(workspace, "infra"), { recursive: true });
	writeFileSync(
		join(workspace, "app/src/config.ts"),
		"// config\nexport const orders = {\n\turl: process.env.ORDERS_URL,\n};\n",
	);
	writeFileSync(
		join(workspace, "infra/compose.yaml"),
		"services:\n  web:\n    environment:\n      ORDERS_URL: http://orders:8000\n    build: ./web\n",
	);
	answer = JSON.parse(fixture("hop-check.json", { WORKSPACE: workspace }));
});

const locations = (repository = join(workspace, "app")) => ({
	workspace,
	repository,
	roots: new Map([
		["github.com/test/app", join(workspace, "app")],
		["github.com/test/infra", join(workspace, "infra")],
	]),
	vault: join(workspace, "app/.archboard/vault"),
	home: join(workspace, "app"),
	files: cachedFileReader(),
});

describe("the fixture is an answer of the CLI", () => {
	test("its code part parses with the code check's own schema", () => {
		expect(() => CodeCheckAnswerSchema.parse(answer.code)).not.toThrow();
	});
});

describe("a finding that crosses a network hop", () => {
	test("is annotated at each end in one repository, and each annotation carries both ends and both excerpts", () => {
		const hop = collectFindings(answer).find((finding) => finding.evidence.length === 2);
		expect(hop).toBeDefined();
		const annotations = annotationsFor(hop!, locations(workspace));
		expect(annotations.map((one) => [one.properties.file, one.properties.line])).toEqual([
			["app/src/config.ts", 3],
			["infra/compose.yaml", 4],
		]);
		for (const annotation of annotations) {
			expect(annotation.level).toBe("warning");
			expect(annotation.properties.title).toContain("RELATIONSHIP_UNSUPPORTED");
			expect(annotation.message).toContain("src/config.ts:3");
			expect(annotation.message).toContain("compose.yaml:4");
			expect(annotation.message).toContain("process.env.ORDERS_URL");
			expect(annotation.message).toContain("ORDERS_URL: http://orders:8000");
		}
	});

	test("names files by their path in the checked repository, and annotates no end in another", () => {
		const hop = collectFindings(answer).find((finding) => finding.evidence.length === 2);
		const annotations = annotationsFor(hop!, locations());
		expect(annotations.map((one) => [one.properties.file, one.properties.line])).toEqual([
			["src/config.ts", 3],
		]);
		expect(annotations[0]?.message).toContain("ORDERS_URL: http://orders:8000");
	});

	test("falls back to the vault file when no end is on this machine", () => {
		const hop = collectFindings(answer).find((finding) => finding.evidence.length === 2);
		mkdirSync(join(workspace, "app/.archboard/vault/modules/Shop"), { recursive: true });
		writeFileSync(join(workspace, "app/.archboard/vault/modules/Shop/rel.module.json"), "{}");
		const annotations = annotationsFor(hop!, { ...locations(), roots: new Map() });
		expect(annotations.map((one) => one.properties.file)).toEqual([
			".archboard/vault/modules/Shop/rel.module.json",
		]);
	});
});

describe("workflow commands", () => {
	test("escape the characters GitHub reads as syntax", () => {
		expect(
			annotationLine("warning", { file: "a,b:c.ts", line: 1, title: "T: x" }, "50%\r\nnext"),
		).toBe("::warning file=a%2Cb%3Ac.ts,line=1,title=T%3A x::50%25%0D%0Anext");
	});

	test("extra arguments keep quoted words whole", () => {
		expect(splitArguments(`--state "Queued fulfilment" --every-draft 'a b'`)).toEqual([
			"--state",
			"Queued fulfilment",
			"--every-draft",
			"a b",
		]);
	});
});

describe("the step's outcome", () => {
	test("information alone passes, a warning fails, and fail-on never reports only", () => {
		expect(decideOutcome(0, "warning").failed).toBe(false);
		expect(decideOutcome(1, "warning").failed).toBe(true);
		expect(decideOutcome(1, "never").failed).toBe(false);
	});

	test("a check that could not run fails whatever fail-on says", () => {
		expect(decideOutcome(2, "never").failed).toBe(true);
		expect(decideOutcome(3, "never").failed).toBe(true);
	});
});

describe("the entry", () => {
	const home = scratch();
	const repos = JSON.stringify({
		repos: [
			{ repo: "github.com/test/app", root: join(workspace, "app"), chosen: true, exists: true },
			{ repo: "github.com/test/infra", root: join(workspace, "infra"), chosen: true, exists: true },
		],
	});

	/**
	 * Run the entry against the stand-in.
	 * @param exit The exit status the stand-in's `check` ends with.
	 * @param inputs The action's inputs, as the step sets them.
	 * @param check The answer to print.
	 * @returns The step's exit status, its output, and what it wrote for the runner.
	 */
	function step(exit: number, inputs: Record<string, string> = {}, check: object = answer) {
		const folder = scratch();
		writeFileSync(join(folder, "check.json"), JSON.stringify(check));
		writeFileSync(join(folder, "repos.json"), repos);
		const summary = join(folder, "summary.md");
		const outputs = join(folder, "outputs");
		writeFileSync(summary, "");
		writeFileSync(outputs, "");
		const result = runEntry(entry, {
			ARCHBOARD_BIN: writeStandIn(home),
			FAKE_DIR: folder,
			FAKE_EXIT: String(exit),
			GITHUB_WORKSPACE: workspace,
			GITHUB_STEP_SUMMARY: summary,
			GITHUB_OUTPUT: outputs,
			RUNNER_TEMP: folder,
			ARCHBOARD_INPUT_WORKING_DIRECTORY: "app",
			...inputs,
		});
		return {
			...result,
			summary: readFileSync(summary, "utf8"),
			outputs: readFileSync(outputs, "utf8"),
		};
	}

	test("a seeded warning annotates the diff, fails the step and sets the outputs", () => {
		const result = step(1);
		expect(result.exitCode).toBe(1);
		expect(result.stdout).toContain("::warning file=src/config.ts,line=3,");
		expect(result.stdout).not.toContain("file=infra/compose.yaml");
		expect(result.outputs).toContain("exit-code=1");
		expect(result.outputs).toContain("warnings=1");
		expect(result.outputs).toContain("information=1");
		expect(result.summary).toContain("RELATIONSHIP_UNSUPPORTED");
	});

	test("information alone passes", () => {
		const onlyInformation = {
			...answer,
			code: { ...answer.code, findings: answer.code?.findings.slice(1) },
		};
		const result = step(0, {}, onlyInformation);
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("::notice");
		expect(result.outputs).toContain("warnings=0");
	});

	test("fail-on never reports findings and passes, but a check that cannot run still fails", () => {
		expect(step(1, { ARCHBOARD_INPUT_FAIL_ON: "never" }).exitCode).toBe(0);
		expect(step(3, { ARCHBOARD_INPUT_FAIL_ON: "never" }).exitCode).toBe(1);
	});

	test("allow-codes keeps a finding on the diff and in the summary and lets the step pass", () => {
		const allowed = step(1, {
			ARCHBOARD_INPUT_ALLOW_CODES: "OTHER_CODE,\nRELATIONSHIP_UNSUPPORTED",
		});
		expect(allowed.exitCode).toBe(0);
		expect(allowed.stdout).toContain("::warning file=src/config.ts");
		expect(allowed.summary).toContain("(allowed)");
		expect(allowed.summary).toContain("/docs/reference/findings/#relationship-unsupported");
		const another = {
			...answer,
			code: {
				...answer.code,
				findings: [
					...(answer.code?.findings ?? []),
					{ ...answer.code?.findings[0], code: "RELATIONSHIP_UNDRAWN", evidence: undefined },
				],
			},
		};
		const blocked = step(1, { ARCHBOARD_INPUT_ALLOW_CODES: "RELATIONSHIP_UNSUPPORTED" }, another);
		expect(blocked.exitCode).toBe(1);
	});
});
