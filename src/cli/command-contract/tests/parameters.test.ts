// The facts a contract declares about its parameters, held to at the parser
// and shown by the projection: an option that must be present, a value that
// must be one of a few, a positional that must be given, a tail that parses
// and is never advertised, and a staged parameter that is advertised and left
// to its stage.

import { afterEach, describe, expect, test } from "bun:test";
import { z } from "zod";
import { declareCommand } from "../commander.js";
import { defineCommand, type TokenParameter } from "../contract.js";
import { inapplicableSharedOptions, sharedOptionsFor } from "../shared-options.js";
import { cleanupCommandContractTest, executePublic, proofContract } from "./support.js";

afterEach(cleanupCommandContractTest);

/**
 * A contract with these parameters that answers with whatever it parsed.
 * @param parameters - The parameters to declare.
 * @param ingress - The keys the ingress schema accepts.
 * @returns The contract.
 */
function echoing(parameters: readonly TokenParameter[], ingress: z.ZodRawShape) {
	return defineCommand({
		...proofContract({ result: null, resultSchema: z.record(z.string(), z.unknown()) }),
		parameters,
		input: { ingress: z.object(ingress) },
		async handler(input) {
			return { result: input };
		},
	});
}

describe("declared parameter facts", () => {
	test("a required option is refused when absent, not when present without a value", async () => {
		const contract = echoing(
			[
				{
					kind: "option",
					key: "out",
					spellings: ["--out"],
					value: "required",
					required: true,
					description: "where",
				},
			],
			{ out: z.string().optional() },
		);
		const absent = await executePublic(contract, []);
		expect((absent.error as Error).message).toContain("--out");
		expect((absent.error as Error).message).toContain("required");
		const valueless = await executePublic(contract, ["--out"]);
		expect((valueless.error as Error).message).toContain("--out");
		expect((valueless.error as Error).message).toContain("value");
		expect(JSON.parse((await executePublic(contract, ["--out", "x.svg"])).stdout)).toEqual({
			out: "x.svg",
		});
	});

	test("choices are enforced and a default is shown, not injected", async () => {
		const contract = echoing(
			[
				{
					kind: "option",
					key: "theme",
					spellings: ["--theme"],
					value: "required",
					choices: ["light", "dark"],
					default: "light",
					description: "ground",
				},
			],
			{ theme: z.string().optional() },
		);
		const rejected = await executePublic(contract, ["--theme", "blue"]);
		expect((rejected.error as Error).message).toContain("--theme");
		expect((rejected.error as Error).message).toContain("light");
		expect(JSON.parse((await executePublic(contract, ["--theme", "dark"])).stdout)).toEqual({
			theme: "dark",
		});
		// The default is a fact for help; the handler still sees an absent option.
		expect(JSON.parse((await executePublic(contract, [])).stdout)).toEqual({});
	});

	test("a required positional is refused when missing, and a hidden tail still parses", async () => {
		const contract = echoing(
			[
				{ kind: "positional", key: "name", name: "name", required: true, description: "who" },
				{
					kind: "positional",
					key: "tail",
					name: "ignored",
					repeatable: true,
					route: "pass-through",
					hidden: true,
					description: "legacy",
				},
			],
			{ name: z.string(), tail: z.array(z.string()).default([]) },
		);
		const missing = await executePublic(contract, []);
		expect((missing.error as Error).message).toContain("name");
		expect(JSON.parse((await executePublic(contract, ["ada", "extra"])).stdout)).toEqual({
			name: "ada",
			tail: ["extra"],
		});
		const help = declareCommand(contract, "help").command.helpInformation();
		expect(help).toContain("<name>");
		expect(help).not.toContain("ignored");
	});

	test("a staged parameter is shown by help and left in the staged tokens by the parser", async () => {
		const contract = echoing(
			[
				{
					kind: "positional",
					key: "board",
					name: "board",
					required: true,
					route: "staged",
					description: "which",
				},
				{
					kind: "option",
					key: "pane",
					spellings: ["--pane"],
					value: "required",
					route: "staged",
					requiredWhen: "once two panes are open",
					description: "where",
				},
				{
					kind: "positional",
					key: "tokens",
					name: "tokens",
					repeatable: true,
					route: "staged-tokens",
					hidden: true,
					description: "everything",
				},
			],
			{ tokens: z.array(z.string()).default([]) },
		);
		expect(
			JSON.parse((await executePublic(contract, ["pipeline", "--pane", "right"])).stdout),
		).toEqual({ tokens: ["pipeline", "--pane", "right"] });
		const help = declareCommand(contract, "help").command.helpInformation();
		expect(help).toContain("<board>");
		expect(help).toContain("--pane");
		expect(help).toContain("once two panes are open");
	});

	test("contradictory option facts are refused when the contract is defined", () => {
		const base = proofContract({ result: null });
		expect(() =>
			defineCommand({
				...base,
				parameters: [
					{
						kind: "option",
						key: "name",
						spellings: ["--name"],
						value: "none",
						default: "x",
						description: "flag",
					},
				],
			}),
		).toThrow(/takes no value/u);
		expect(() =>
			defineCommand({
				...base,
				parameters: [
					{
						kind: "option",
						key: "name",
						spellings: ["--name"],
						value: "required",
						choices: ["a"],
						default: "b",
						description: "choice",
					},
				],
			}),
		).toThrow(/outside its choices/u);
	});
});

describe("shared options", () => {
	test("help lists exactly the shared options a contract reads, after its own", () => {
		const contract = echoing(
			[{ kind: "option", key: "name", spellings: ["--name"], value: "required", description: "n" }],
			{ name: z.string().optional() },
		);
		const reading = { ...contract, shared: ["doing", "url"] as const };
		const help = declareCommand(reading, "help").command.helpInformation();
		const own = help.indexOf("--name");
		expect(own).toBeGreaterThan(-1);
		for (const option of sharedOptionsFor(reading.shared)) {
			expect(help.indexOf(option.spellings[0])).toBeGreaterThan(own);
		}
		expect(help).not.toContain("--board");
		expect(declareCommand(reading, "parse").command.helpInformation()).not.toContain("--doing");
	});

	test("what a command does not read is what an invocation is refused for", () => {
		expect(inapplicableSharedOptions(["url", "doing"], ["doing", "board", "as-session"])).toEqual([
			"--board",
			"--as-session",
		]);
		expect(inapplicableSharedOptions([], [])).toEqual([]);
	});
});
