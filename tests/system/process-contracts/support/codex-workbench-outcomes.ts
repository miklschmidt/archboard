import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { extendFixture } from "./codex-workbench-lifecycle.ts";

/**
 * Adds deterministic mutation-result controls to the exact production process fixture.
 * @param root - Disposable fixture directory.
 * @returns Path to the extended fixture.
 */
export function extendOutcomeFixture(root: string): string {
	const base = extendFixture(root);
	const source = readFileSync(base, "utf8");
	const scenarioSupport = String.raw`
type MutationScenario = "initial_not_delivered" | "initial_unknown" | "outer_unknown";
let mutationScenario: MutationScenario | null = null;
let pendingInitialScenario: Exclude<MutationScenario, "outer_unknown"> | null = null;
const emittedMutationScenarios = new Set<MutationScenario>();

const emitMutationScenario = (scenario: MutationScenario): void => {
	if (workhorseThreadId === null || emittedMutationScenarios.has(scenario)) return;
	emittedMutationScenarios.add(scenario);
	mutationScenario = scenario;
	const callId = "scenario-" + scenario;
	const argumentsValue = { prompt: "Exercise " + scenario + " through the real process." };
	registerDynamicCall(callId, "create_thread", argumentsValue);
	request(callId, "item/tool/call", { threadId: workhorseThreadId, turnId: "turn-1", callId, namespace: "archboard_app", tool: "create_thread", arguments: argumentsValue });
	record({ kind: "scenario_emitted", scenario, callId });
};
`;
	const withSupport = source.replace(
		"const handle = (frame: WireFrame): void => {",
		`${scenarioSupport}\nconst handle = (frame: WireFrame): void => {`,
	);
	const withThreadOutcomes = withSupport.replace(
		'\t\tcase "thread/start": {\n\t\t\tconst thread = createThread(params);\n\t\t\trespond(frame as never, threadStartResponse(params, thread));\n\t\t\treturn;\n\t\t}',
		String.raw`		case "thread/start": {
			if (mutationScenario !== null) {
				const scenario = mutationScenario;
				mutationScenario = null;
				const thread = createThread(params);
				record({ kind: "mutation_effect", scenario, method: "thread/start", threadId: thread.id });
				if (scenario === "outer_unknown") respond(frame as never, {});
				else {
					pendingInitialScenario = scenario;
					respond(frame as never, threadStartResponse(params, thread));
				}
				return;
			}
			const thread = createThread(params);
			respond(frame as never, threadStartResponse(params, thread));
			return;
		}`,
	);
	const withTurnOutcomes = withThreadOutcomes.replace(
		'\t\tcase "turn/start": {\n\t\t\tconst thread = threads.get(String(params.threadId));',
		String.raw`		case "turn/start": {
			if (pendingInitialScenario !== null) {
				const scenario = pendingInitialScenario;
				pendingInitialScenario = null;
				record({ kind: "mutation_effect", scenario, method: "turn/start", threadId: params.threadId });
				if (scenario === "initial_unknown") respond(frame as never, {});
				else send({ id: frame.id, error: { code: -32000, message: "controlled initial turn refusal" } });
				return;
			}
			const thread = threads.get(String(params.threadId));`,
	);
	const withControl = withTurnOutcomes.replace(
		"if (control.exit === true) process.exit(17);",
		'if (["initial_not_delivered", "initial_unknown", "outer_unknown"].includes(String((control as { scenario?: unknown }).scenario))) emitMutationScenario((control as { scenario: MutationScenario }).scenario);\n\t\tif (control.exit === true) process.exit(17);',
	);
	if (
		withSupport === source ||
		withThreadOutcomes === withSupport ||
		withTurnOutcomes === withThreadOutcomes ||
		withControl === withTurnOutcomes
	) {
		throw new Error("The controlled mutation outcome injection point drifted.");
	}
	const fixturePath = path.join(root, "fake-codex-outcomes.ts");
	writeFileSync(fixturePath, withControl);
	chmodSync(fixturePath, 0o700);
	return fixturePath;
}
