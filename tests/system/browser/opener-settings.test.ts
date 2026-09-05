import { expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

import { startOwnedCanvas } from "../support/owned-canvas.ts";
import {
	browserTestRoots,
	canvasTestEnvironment,
	createAgentBrowser,
	pollUntil,
	registerCanvasBase,
} from "./support/agent-browser.ts";
import {
	assertDialogClosedAndFocusReturned,
	fillLabel,
	roleAction,
	setTheme,
} from "./support/opener-settings-interaction.ts";
import {
	dialogSnapshot,
	draftSelection,
	githubHref,
	installFetchDouble,
	noticeSnapshot,
	repository,
	serverPath,
	validationSnapshot,
	verifyVisualModes,
	visualSnapshot,
} from "./support/opener-settings.ts";
import {
	releaseProbe,
	requests,
	setNextGet,
	setProbeHold,
} from "./support/opener-settings-probe.ts";

test("the migrated opener dialog keeps its rendered interaction and persistence contract", async () => {
	await using resources = new AsyncDisposableStack();
	const { ownerRoot } = browserTestRoots();
	const testRoot = join(ownerRoot, "opener-settings");
	resources.defer(() => rmSync(testRoot, { recursive: true, force: true }));
	mkdirSync(testRoot, { recursive: true });
	const vault = join(testRoot, "vault");
	const logPath = join(testRoot, "canvas.log");
	mkdirSync(vault, { recursive: true });
	const canvas = await startOwnedCanvas({
		serverPath,
		vault,
		env: canvasTestEnvironment({
			LOG_FILE_PATH: logPath,
			ARCHBOARD_OPENER_CONFIG: join(testRoot, "machine-state", "opener.json"),
		}),
	});
	resources.defer(() => canvas.dispose());
	registerCanvasBase(canvas.base);
	const browser = resources.use(await createAgentBrowser());

	await browser.run(["open", canvas.base]);
	await browser.run(["set", "viewport", "1920", "1080", "1"]);
	expect(await browser.eval<string>("navigator.userAgent")).toMatch(/headless/i);
	await pollUntil(
		() =>
			browser
				.run(["snapshot", "--interactive", "--compact"])
				.then((value) => value.includes('button "Opener settings"')),
		Boolean,
		"the named opener settings trigger",
	);
	await browser.run(["console", "--clear"]);
	await browser.run(["errors", "--clear"]);
	await installFetchDouble(browser);
	expect(
		await browser.eval<boolean>(`(() => {
			const trigger = [...document.querySelectorAll('button')]
				.find(node => node.getAttribute('aria-label') === 'Opener settings');
			if (!trigger) return false;
			window.__openerTrigger = trigger;
			window.__openerBodyChildren = document.body.childElementCount;
			return true;
		})()`),
	).toBe(true);

	await roleAction(browser, "button", "Opener settings");
	const loading = await pollUntil(
		() => dialogSnapshot(browser),
		(value) => value?.description === "Reading opener settings…" && value.focusInside,
		"the described opener loading state",
	);
	expect(loading).toMatchObject({
		count: 1,
		name: "Opener settings",
		tag: "DIV",
		title: "Opener settings",
		description: "Reading opener settings…",
		rootContainsDialog: false,
		shellContainsDialog: false,
		portalAtBody: true,
		focusInside: true,
	});
	const loadingTree = await browser.run(["snapshot", "--compact", "--selector", '[role="dialog"]']);
	expect(loadingTree).toContain('dialog "Opener settings"');
	expect(loadingTree).toContain("Reading opener settings…");
	expect(loadingTree).toContain('button "Cancel"');
	expect(loadingTree).not.toContain('button "Cancel" [disabled]');
	expect(loading?.focus).toBe("Cancel");
	await roleAction(browser, "button", "Cancel");
	await assertDialogClosedAndFocusReturned(browser);
	await setNextGet(browser, "failure");
	await releaseProbe(browser, "GET:/api/settings/opener");
	await browser.eval<boolean>(
		"new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))",
	);
	expect(
		await browser.eval<boolean>(
			"!document.querySelector('[role=dialog]') && document.body.childElementCount === window.__openerBodyChildren",
		),
	).toBe(true);
	expect(await noticeSnapshot(browser)).toEqual({
		role: null,
		text: null,
		settings: null,
		github: null,
	});
	await setNextGet(browser, "success");

	await roleAction(browser, "button", "Opener settings");

	const initial = await pollUntil(
		() => dialogSnapshot(browser),
		(value) => value?.executable === "/opt/acme/bin/editor" && value.focus === "Cancel",
		"the loaded opener settings with initial Cancel focus",
	);
	expect(initial).toEqual({
		count: 1,
		name: "Opener settings",
		tag: "DIV",
		title: "Opener settings",
		description: null,
		current: "Custom",
		effective: "/opt/acme/bin/editor --reuse-window {path} --wait",
		availability: "Available",
		choices: [
			{ label: "System default", command: "xdg-open {path}" },
			{ label: "VS Code", command: "code {path}" },
			{ label: "Cursor", command: "cursor {path}" },
			{ label: "Zed", command: "zed {path}" },
			{ label: "Custom", command: "Executable and ordered arguments" },
		],
		executable: "/opt/acme/bin/editor",
		arguments: ["--reuse-window", "{path}", "--wait"],
		repositories: [{ value: repository, label: repository }],
		checkout: "/controlled/checkout",
		focus: "Cancel",
		focusInside: true,
		rootContainsDialog: false,
		shellContainsDialog: false,
		portalAtBody: true,
	});
	expect(await requests(browser)).toEqual([
		{ method: "GET", path: "/api/settings/opener", body: null },
		{ method: "GET", path: "/api/settings/opener", body: null },
	]);

	const focusOrder = [
		"Save",
		"Close dialog",
		"Custom opener",
		"Executable",
		"Add argument",
		"Argument 1",
		"Remove argument 1",
		"Argument 2",
		"Remove argument 2",
		"Argument 3",
		"Remove argument 3",
		"Registered checkout for Test",
		"Reset",
		"Test",
		"Cancel",
	];
	const observedFocus: string[] = [];
	for (const expected of focusOrder) {
		await browser.run(["press", "Tab"]);
		const focused = await pollUntil(
			() => dialogSnapshot(browser),
			(value) => value?.focus === expected && value.focusInside,
			`${expected} to receive focus in the dialog Tab cycle`,
		);
		observedFocus.push(focused?.focus ?? "");
		expect({ expected, focus: focused?.focus, focusInside: focused?.focusInside }).toEqual({
			expected,
			focus: expected,
			focusInside: true,
		});
	}
	expect(observedFocus).toEqual(focusOrder);
	await browser.run(["press", "Shift+Tab"]);
	expect((await dialogSnapshot(browser))?.focus).toBe("Test");
	await browser.run(["press", "Tab"]);
	expect((await dialogSnapshot(browser))?.focus).toBe("Cancel");
	const modalTree = await browser.run(["snapshot", "--interactive", "--compact"]);
	expect(modalTree).toContain('heading "Opener settings"');
	expect(modalTree).toContain('button "Cancel"');
	expect(modalTree).not.toContain('button "Opener settings"');

	const accessibilityTree = await browser.run([
		"snapshot",
		"--compact",
		"--selector",
		'[role="dialog"]',
	]);
	for (const contract of [
		'dialog "Opener settings"',
		'radio "Custom opener" [checked=true',
		'textbox "Executable"',
		'textbox "Argument 1"',
		'combobox "Registered checkout for Test',
		'button "Reset"',
		'button "Test"',
		'button "Cancel"',
		'button "Save"',
	]) {
		expect(accessibilityTree).toContain(contract);
	}
	const auditText = await browser.run(["a11y", "--selector", '[role="dialog"]', "--json"]);
	const audit = JSON.parse(auditText) as {
		violations?: unknown[];
		data?: { violations?: unknown[] };
	};
	expect(audit.violations ?? audit.data?.violations ?? []).toEqual([]);
	await verifyVisualModes(browser, "light");

	await fillLabel(browser, "Executable", "./editor");
	const relativeExecutable = await pollUntil(
		() => validationSnapshot(browser),
		(value) => value.saveDisabled && value.testDisabled,
		"the client-side relative executable validation",
	);
	expect(relativeExecutable.message).toBe(
		"A custom executable must be absolute or a bare PATH name.",
	);
	const invalidTree = await browser.run(["snapshot", "--compact", "--selector", '[role="dialog"]']);
	expect([...invalidTree.matchAll(/^\s*- alert$/gm)]).toHaveLength(1);
	expect(invalidTree).toContain(
		'StaticText "A custom executable must be absolute or a bare PATH name."',
	);
	const beforeInvalidActions = await requests(browser);
	await roleAction(browser, "button", "Test").catch(() => undefined);
	await roleAction(browser, "button", "Save").catch(() => undefined);
	expect(await requests(browser)).toEqual(beforeInvalidActions);

	await fillLabel(browser, "Executable", "/opt/acme/bin/editor");
	await fillLabel(browser, "Argument 2", "--without-path");
	const invalid = await pollUntil(
		() => validationSnapshot(browser),
		(value) => value.saveDisabled && value.testDisabled,
		"the client-side path-token validation",
	);
	expect(invalid.message).toBe("argv must contain exactly one {path} token");

	for (const [index, argument] of draftSelection.argv.entries()) {
		await fillLabel(browser, `Argument ${index + 1}`, argument);
	}
	await fillLabel(browser, "Executable", draftSelection.executable);
	await pollUntil(
		() => validationSnapshot(browser),
		(value) => !value.message && !value.saveDisabled && !value.testDisabled,
		"the corrected custom draft",
	);

	await browser.run(["press", "Escape"]);
	await assertDialogClosedAndFocusReturned(browser);
	expect((await requests(browser)).some((request) => request.method === "PUT")).toBe(false);

	await setTheme(browser, "dark");
	await roleAction(browser, "button", "Opener settings");
	await pollUntil(
		() => dialogSnapshot(browser),
		(value) => value?.focus === "Cancel",
		"the dark opener dialog to load",
	);
	expect((await dialogSnapshot(browser))?.count).toBe(1);
	await verifyVisualModes(browser, "dark");
	await browser.run(["set", "viewport", "1920", "1080", "2"]);
	const flip = await visualSnapshot(browser);
	expect(flip.dialogWithinViewport).toBe(true);
	expect(flip.pageOverflow).toBe(false);
	expect(flip.targets.every(({ width, height }) => width >= 43.5 && height >= 43.5)).toBe(true);
	await browser.run(["set", "viewport", "1920", "1080", "1"]);
	expect(
		await browser.eval<boolean>(`(() => {
			const trigger = window.__openerTrigger;
			if (!(trigger instanceof HTMLButtonElement)) return false;
			const probe = { trigger, count: 0, listener: null };
			probe.listener = () => { probe.count += 1; };
			trigger.addEventListener('click', probe.listener);
			window.__coveredOpenerTriggerProbe = probe;
			return true;
		})()`),
	).toBe(true);
	const triggerPoint = await pollUntil(
		() =>
			browser.eval<{ x?: number; y?: number }>(`(() => {
				const rect = window.__openerTrigger.getBoundingClientRect();
				return { x: Math.round(rect.left + rect.width / 2),
					y: Math.round(rect.top + rect.height / 2) };
			})()`),
		(value): value is { x: number; y: number } =>
			Number.isFinite(value.x) && Number.isFinite(value.y),
		"the opener trigger coordinates behind the dialog backdrop",
	);
	const getCountBeforeOutside = (await requests(browser)).filter(
		(request) => request.method === "GET",
	).length;
	await browser.run(["mouse", "move", String(triggerPoint.x), String(triggerPoint.y)]);
	await browser.run(["mouse", "down"]);
	await browser.run(["mouse", "up"]);
	await assertDialogClosedAndFocusReturned(browser);
	const coveredTriggerClicks = await browser.eval<number>(`(() => {
		const probe = window.__coveredOpenerTriggerProbe;
		if (!probe) return -1;
		probe.trigger.removeEventListener('click', probe.listener);
		delete window.__coveredOpenerTriggerProbe;
		return probe.count;
	})()`);
	expect(coveredTriggerClicks).toBe(0);
	expect((await requests(browser)).filter((request) => request.method === "GET").length).toBe(
		getCountBeforeOutside,
	);

	await setTheme(browser, "light");
	await roleAction(browser, "button", "Opener settings");
	await pollUntil(
		() => dialogSnapshot(browser),
		(value) => value?.focus === "Cancel",
		"the opener dialog before Cancel dismissal",
	);
	await roleAction(browser, "button", "Cancel");
	await assertDialogClosedAndFocusReturned(browser);
	expect((await requests(browser)).some((request) => request.method === "PUT")).toBe(false);

	await roleAction(browser, "button", "Opener settings");
	await pollUntil(
		() => dialogSnapshot(browser),
		(value) => value?.executable === "/opt/acme/bin/editor",
		"the persistence workflow dialog",
	);
	await fillLabel(browser, "Executable", draftSelection.executable);
	for (const [index, argument] of draftSelection.argv.entries()) {
		await fillLabel(browser, `Argument ${index + 1}`, argument);
	}
	await setProbeHold(browser, "POST:/api/settings/opener/test");
	await roleAction(browser, "button", "Test");
	await pollUntil(
		() =>
			browser.eval<boolean>(`(() => {
				const dialog = document.querySelector('[role="dialog"]');
				const buttons = [...dialog.querySelectorAll('button')];
				return buttons.find(node => node.textContent?.trim() === 'Testing…')?.disabled === true &&
					buttons.filter(node => ['Reset', 'Cancel', 'Save'].includes(node.textContent?.trim()))
						.every(node => node.disabled);
			})()`),
		Boolean,
		"the pending Test controls",
	);
	await releaseProbe(browser, "POST:/api/settings/opener/test");
	const tested = await pollUntil(
		() => noticeSnapshot(browser),
		(value) => value.text?.includes(`Test opener launched for ${repository}.`) ?? false,
		"the controlled test success notice",
	);
	expect(tested.role).toBe("status");
	let recorded = await requests(browser);
	expect(recorded.at(-1)).toEqual({
		method: "POST",
		path: "/api/settings/opener/test",
		body: { selection: draftSelection, repository },
	});
	expect(recorded.some((request) => request.method === "PUT")).toBe(false);

	expect(
		await browser.eval<boolean>(
			"Boolean(window.__openerProbe && (window.__openerProbe.nextTest = 'failure'))",
		),
	).toBe(true);
	await roleAction(browser, "button", "Test");
	const failed = await pollUntil(
		() => noticeSnapshot(browser),
		(value) => value.text?.includes("Controlled opener failed before launch.") ?? false,
		"the controlled opener failure notice",
	);
	expect(failed.role).toBe("alert");
	expect(failed.settings).toBe("Opener settings");
	expect(failed.github).toEqual({
		text: "Open on GitHub",
		href: githubHref,
		target: "_blank",
		rel: "noopener noreferrer",
	});
	expect((await dialogSnapshot(browser))?.executable).toBe(draftSelection.executable);
	expect((await dialogSnapshot(browser))?.arguments).toEqual([...draftSelection.argv]);

	await roleAction(browser, "button", "Close dialog");
	await assertDialogClosedAndFocusReturned(browser);
	const recoveryGetCount = (await requests(browser)).filter(
		(request) => request.method === "GET",
	).length;
	expect(
		await browser.eval<boolean>(`(() => {
			const notice = document.querySelector('[role="alert"]');
			const action = [...(notice?.querySelectorAll('button') ?? [])]
				.find(node => node.textContent?.trim() === 'Opener settings');
			if (!action) return false;
			action.click();
			return true;
		})()`),
	).toBe(true);
	await pollUntil(
		() => requests(browser),
		(value) => value.filter((request) => request.method === "GET").length === recoveryGetCount + 1,
		"the settings recovery action to fetch fresh state",
	);
	const recovered = await pollUntil(
		() => dialogSnapshot(browser),
		(value) => value?.current === "Custom" && value.executable === "/opt/acme/bin/editor",
		"the recovery settings to render",
	);
	expect(recovered?.arguments).toEqual(["--reuse-window", "{path}", "--wait"]);

	await roleAction(browser, "button", "Reset");
	const reset = await pollUntil(
		() => dialogSnapshot(browser),
		(value) => value?.current === "System default" && value.effective === "xdg-open {path}",
		"reset platform settings to reload",
	);
	expect(reset?.availability).toBe("Available");
	recorded = await requests(browser);
	expect(recorded.slice(-2)).toEqual([
		{ method: "DELETE", path: "/api/settings/opener", body: null },
		{ method: "GET", path: "/api/settings/opener", body: null },
	]);

	await roleAction(browser, "radio", "Custom opener");
	await fillLabel(browser, "Executable", draftSelection.executable);
	for (const [index, argument] of draftSelection.argv.entries()) {
		await fillLabel(browser, `Argument ${index + 1}`, argument);
	}
	await setProbeHold(browser, "PUT:/api/settings/opener");
	await roleAction(browser, "button", "Save");
	await pollUntil(
		() =>
			browser.eval<boolean>(`(() => {
				const dialog = document.querySelector('[role="dialog"]');
				const buttons = [...dialog.querySelectorAll('button')];
				return buttons.find(node => node.textContent?.trim() === 'Saving…')?.disabled === true &&
					buttons.filter(node => ['Reset', 'Test', 'Cancel'].includes(node.textContent?.trim()))
						.every(node => node.disabled);
			})()`),
		Boolean,
		"the pending Save controls",
	);
	await releaseProbe(browser, "PUT:/api/settings/opener");
	await assertDialogClosedAndFocusReturned(browser);
	recorded = await requests(browser);
	expect(recorded.filter((request) => request.method === "PUT")).toEqual([
		{ method: "PUT", path: "/api/settings/opener", body: draftSelection },
	]);
	const saved = await noticeSnapshot(browser);
	expect(saved.role).toBe("status");
	expect(saved.text).toContain(
		"Saved. Every pane and caller uses this opener on the next activation.",
	);

	await roleAction(browser, "button", "Opener settings");
	const reopened = await pollUntil(
		() => dialogSnapshot(browser),
		(value) => value?.executable === draftSelection.executable,
		"the saved opener to persist across reopen",
	);
	expect(reopened?.arguments).toEqual([...draftSelection.argv]);
	expect(reopened?.count).toBe(1);
	await roleAction(browser, "button", "Cancel");
	await assertDialogClosedAndFocusReturned(browser);
	expect(
		await browser.eval<boolean>(
			"document.body.childElementCount === window.__openerBodyChildren && !document.querySelector('[role=dialog]')",
		),
	).toBe(true);

	const consoleOutput = await browser.run(["console"]);
	const pageErrors = await browser.run(["errors"]);
	expect(consoleOutput.trim()).toBe("");
	expect(pageErrors.trim()).toBe("");
	await canvas.assertRunning();
	expect(canvas.stderr.trim()).toBe("");
	const serverLog = existsSync(logPath) ? readFileSync(logPath, "utf8") : "";
	expect(serverLog).not.toMatch(/\[(?:warn|error)\]/i);
}, 30_000);
