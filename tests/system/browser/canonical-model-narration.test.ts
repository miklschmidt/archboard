import { expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { captureCanonicalWalkthrough } from "../support/canonical-walkthrough.ts";
import { startOwnedServer } from "../support/owned-server.ts";
import {
	prepareProductionFixture,
	productionRecords,
} from "../server-state/support/codex-production.ts";
import { productionServer } from "../server-state/support/production-server.ts";
import {
	createAgentBrowser,
	pollUntil,
	registerServerBase,
	serverTestEnvironment,
} from "./support/agent-browser.ts";
import { openForVoice } from "./support/voice-box-page.ts";
import { DOCK_VOICE, voiceNow } from "./support/voice-page.ts";

const WAIT = { timeoutMs: 10_000 } as const;
const PANE = '[data-pane="A"]';

test("canonical narration follows the captured walkthrough in its own pane", async () => {
	await using resources = new AsyncDisposableStack();
	const fixture = prepareProductionFixture(
		resources,
		join(import.meta.dir, "../server-state/fixtures/fake-codex-production.ts"),
	);
	const { vault } = await captureCanonicalWalkthrough(fixture.root);
	const server = await startOwnedServer({
		...productionServer,
		vault,
		env: serverTestEnvironment({
			ARCHBOARD_TEST_CODEX_EXECUTABLE: fixture.executablePath,
			ARCHBOARD_TEST_CODEX_LOG: fixture.logPath,
			ARCHBOARD_TEST_CODEX_CONTROL: fixture.controlPath,
		}),
	});
	resources.defer(() => server.dispose());
	registerServerBase(server.base);
	const browser = resources.use(await createAgentBrowser());
	await openForVoice(browser, `${server.base}/?modelA=Shop&modelB=Shop&pane=A`);
	await browser.run(["set", "viewport", "1920", "1080"]);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelectorAll('[data-slot="model-walkthrough-selector"]').length === 2`,
			),
		Boolean,
		"both canonical panes",
		WAIT,
	);
	await browser.run(["click", `${PANE} [data-slot="model-walkthrough-selector"]`]);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`(() => { const choice = document.querySelector('[data-walkthrough-id="Shop#Tour"]'); return choice !== null && choice.getBoundingClientRect().height > 0; })()`,
			),
		Boolean,
		"the authored walkthrough choice",
		WAIT,
	);
	await browser.run(["click", '[data-walkthrough-id="Shop#Tour"]']);
	const atBeat = (index: number) =>
		pollUntil(
			() =>
				browser.eval<boolean>(
					`document.querySelector('${PANE} [data-slot="semantic-presentation"][data-step="${index}"]') !== null && document.querySelector('${PANE} [data-slot="model-diagram"] svg') !== null`,
				),
			Boolean,
			`captured beat ${index}`,
			WAIT,
		);
	await atBeat(0);
	await browser.run(["click", `${PANE} [data-slot="semantic-presentation-next"]`]);
	await atBeat(1);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`(() => { const key = document.querySelector('${PANE} [data-slot="semantic-presentation-narrate"]'); if (!key || key.getAttribute('aria-disabled') === 'true') return false; const r = key.getBoundingClientRect(); return r.height > 0 && key.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); })()`,
			),
		Boolean,
		"the available narration control",
		WAIT,
	);
	const speeches = () =>
		productionRecords(fixture.logPath)
			.filter((entry) => entry.kind === "frame" && entry.method === "thread/realtime/appendSpeech")
			.map((entry) => String(entry.params?.["text"]));
	await browser.run(["click", `${PANE} [data-slot="semantic-presentation-narrate"]`]);
	await atBeat(0);
	const first = await pollUntil(
		speeches,
		(lines) => lines.length >= 1,
		"the first arrived beat to be spoken",
		WAIT,
	);
	expect(first).toHaveLength(1);
	expect(first[0]).toContain("The services");
	await pollUntil(
		() => voiceNow(browser),
		(voice) => voice.box?.place === "foot" && voice.box.pane === "Pane A",
		"the voice in the narrative foot",
		WAIT,
	);
	expect(
		await browser.eval<number>(
			`document.querySelectorAll('[data-pane="B"] [data-slot="model-walkthrough"]').length`,
		),
	).toBe(0);
	const file = join(vault, "tour.walkthrough.json");
	const authored = JSON.parse(readFileSync(file, "utf8"));
	authored.beats[1].title = "Changed after capture";
	writeFileSync(file, JSON.stringify(authored));
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('${PANE} [data-slot="model-walkthrough-restart"]') !== null`,
			),
		Boolean,
		"a restart choice without changing the capture",
		WAIT,
	);
	await browser.run(["click", `${PANE} [data-slot="semantic-presentation-next"]`]);
	await atBeat(1);
	const second = await pollUntil(
		speeches,
		(lines) => lines.length >= 2,
		"the person's next captured beat to be spoken",
		WAIT,
	);
	expect(second).toHaveLength(2);
	expect(second[1]).toContain("The handler");
	expect(second[1]).not.toContain("Changed after capture");
	await browser.run(["click", `${PANE} [data-slot="semantic-presentation-leave"]`]);
	await pollUntil(
		speeches,
		(lines) => lines.length === 3,
		"leaving the walkthrough to reach the narrator",
		WAIT,
	);
	await browser.run(["click", DOCK_VOICE]);
	await pollUntil(
		() => voiceNow(browser),
		(voice) => voice.state === "off",
		"voice to stop",
		WAIT,
	);
	expect(
		await browser.eval<number>(
			`document.querySelectorAll('[data-slot="model-walkthrough"]').length`,
		),
	).toBe(0);
	await server.assertRunning();
}, 60_000);
