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
	fillArguments,
	fillLabel,
	openOpenerSettings,
	roleAction,
	setTheme,
} from "./support/opener-settings-interaction.ts";
import {
	MIN_TARGET,
	dialogSnapshot,
	draftSelection,
	focusedControl,
	githubHref,
	installFetchDouble,
	noticeSnapshot,
	pendingControls,
	repository,
	serverPath,
	testResultSnapshot,
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
import { dismissNotice, shellNotices } from "./support/shell-dom.ts";

test("the opener dialog keeps its rendered interaction and persistence contract", async () => {
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
				.then((value) => value.includes('button "Settings"')),
		Boolean,
		"the named settings trigger",
	);
	await browser.run(["console", "--clear"]);
	await browser.run(["errors", "--clear"]);
	await installFetchDouble(browser);
	expect(
		await browser.eval<boolean>(`(() => {
			const trigger = [...document.querySelectorAll('button')]
				.find(node => node.getAttribute('aria-label') === 'Settings');
			if (!trigger) return false;
			window.__openerTrigger = trigger;
			return true;
		})()`),
	).toBe(true);

	await openOpenerSettings(browser);
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
		portalAtBody: true,
		focusInside: true,
	});
	const loadingTree = await browser.run(
		["snapshot", "--compact", "--selector", '[role="dialog"]'],
		{
			timeoutMs: 10_000,
		},
	);
	expect(loadingTree).toContain('dialog "Opener settings"');
	expect(loadingTree).toContain('button "Close"');
	await browser.run(["press", "Escape"]);
	await assertDialogClosedAndFocusReturned(browser);
	await setNextGet(browser, "failure");
	await releaseProbe(browser, "GET:/api/settings/opener");
	await browser.eval<boolean>(
		"new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))",
	);
	expect(await browser.eval<boolean>("!document.querySelector('[role=dialog]')")).toBe(true);
	expect(await noticeSnapshot(browser)).toEqual({
		role: null,
		text: null,
		settings: null,
		github: null,
	});
	await setNextGet(browser, "success");

	await openOpenerSettings(browser);
	const initial = await pollUntil(
		() => dialogSnapshot(browser),
		(value) => value?.executable === "/opt/acme/bin/editor" && value.focusInside,
		"the loaded opener settings with focus inside",
	);
	expect(initial).toMatchObject({
		count: 1,
		name: "Opener settings",
		tag: "DIV",
		title: "Opener settings",
		current: "Custom command",
		effective: "/opt/acme/bin/editor --reuse-window {path} --wait",
		availability: "Available",
		choices: [
			{ label: "Platform default", command: "xdg-open {path}" },
			{ label: "Visual Studio Code", command: "code {path}" },
			{ label: "Cursor", command: "cursor {path}" },
			{ label: "Zed", command: "zed {path}" },
			{ label: "Custom command", command: "/opt/acme/bin/editor --reuse-window {path} --wait" },
		],
		executable: "/opt/acme/bin/editor",
		arguments: ["--reuse-window", "{path}", "--wait"],
		repository,
		checkout: "/controlled/checkout",
		focusInside: true,
		rootContainsDialog: false,
		portalAtBody: true,
	});
	expect(await requests(browser)).toEqual([
		{ method: "GET", path: "/api/settings/opener", body: null },
		{ method: "GET", path: "/api/settings/opener", body: null },
	]);

	// The dialog opens on its first field, the opener choice group at its tab
	// stop (TASK-150.08); from there Tab reaches every control in reading order
	// and stays inside the dialog. The wrap past the last control is the dialog
	// primitive's own.
	await pollUntil(
		() => focusedControl(browser),
		(value) => value.focus === "Platform default" && value.focusInside,
		"the opener choice group to hold the dialog's initial focus",
		{ timeoutMs: 5_000 },
	);
	const focusOrder = [
		"Executable",
		"Arguments",
		"Test with repository",
		"Reset",
		"Test",
		"Close",
		"Save",
		"Close",
	];
	const observedFocus: string[] = [];
	for (const expected of focusOrder) {
		await browser.run(["press", "Tab"]);
		const focused = await pollUntil(
			() => focusedControl(browser),
			(value) => value.focus === expected && value.focusInside,
			`${expected} to receive focus in the dialog Tab cycle`,
			{ timeoutMs: 5_000 },
		);
		observedFocus.push(focused.focus ?? "");
	}
	expect(observedFocus).toEqual(focusOrder);
	await browser.run(["press", "Shift+Tab"]);
	expect((await dialogSnapshot(browser))?.focus).toBe("Save");
	await browser.run(["press", "Tab"]);
	expect((await dialogSnapshot(browser))?.focus).toBe("Close");
	const modalTree = await browser.run(["snapshot", "--interactive", "--compact"], {
		timeoutMs: 10_000,
	});
	expect(modalTree).toContain('heading "Opener settings"');
	expect(modalTree).toContain('button "Save"');
	expect(modalTree).not.toContain('button "Settings"');

	const accessibilityTree = await browser.run(
		["snapshot", "--compact", "--selector", '[role="dialog"]'],
		{ timeoutMs: 10_000 },
	);
	for (const contract of [
		'dialog "Opener settings"',
		'radio "Custom command Available" [checked=true',
		'textbox "Executable"',
		'textbox "Arguments"',
		'combobox "Test with repository"',
		'button "Reset"',
		'button "Test"',
		'button "Close"',
		'button "Save"',
	]) {
		expect(accessibilityTree).toContain(contract);
	}
	const auditText = await browser.run(["a11y", "--selector", '[role="dialog"]', "--json"], {
		timeoutMs: 10_000,
	});
	const audit = JSON.parse(auditText) as {
		violations?: unknown[];
		data?: { violations?: unknown[] };
	};
	expect(audit.violations ?? audit.data?.violations ?? []).toEqual([]);
	await verifyVisualModes(browser, "light");

	// A relative executable is refused on the way out, before any request.
	await fillLabel(browser, "Executable", "./editor");
	const beforeInvalidActions = await requests(browser);
	await roleAction(browser, "button", "Save");
	const relativeExecutable = await pollUntil(
		() => validationSnapshot(browser),
		(value) => value.message !== null,
		"the client-side relative executable validation",
	);
	expect(relativeExecutable.message).toContain("absolute path");
	const invalidTree = await browser.run(
		["snapshot", "--compact", "--selector", '[role="dialog"]'],
		{
			timeoutMs: 10_000,
		},
	);
	expect(invalidTree).toContain("alert");
	await roleAction(browser, "button", "Test");
	expect(await requests(browser)).toEqual(beforeInvalidActions);

	await fillLabel(browser, "Executable", "/opt/acme/bin/editor");
	await fillArguments(browser, ["--reuse-window", "--without-path", "--wait"]);
	await roleAction(browser, "button", "Save");
	const invalid = await pollUntil(
		() => validationSnapshot(browser),
		(value) => /\{path\}/.test(value.message ?? ""),
		"the client-side path-token validation",
	);
	expect(invalid.message).toContain("exactly one {path} token");
	expect(await requests(browser)).toEqual(beforeInvalidActions);

	await fillArguments(browser, draftSelection.argv);
	await fillLabel(browser, "Executable", draftSelection.executable);
	await browser.run(["press", "Escape"]);
	await assertDialogClosedAndFocusReturned(browser);
	expect((await requests(browser)).some((request) => request.method === "PUT")).toBe(false);

	await setTheme(browser, "dark");
	await openOpenerSettings(browser);
	await pollUntil(
		() => dialogSnapshot(browser),
		(value) => value?.executable === "/opt/acme/bin/editor",
		"the dark opener dialog to load",
	);
	expect((await dialogSnapshot(browser))?.count).toBe(1);
	await verifyVisualModes(browser, "dark");
	await browser.run(["set", "viewport", "1920", "1080", "2"]);
	const flip = await visualSnapshot(browser);
	expect(flip.dialogWithinViewport).toBe(true);
	expect(flip.pageOverflow).toBe(false);
	expect(
		flip.targets.every(({ width, height }) => width >= MIN_TARGET && height >= MIN_TARGET),
	).toBe(true);
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
		"the settings trigger coordinates behind the dialog backdrop",
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
	await openOpenerSettings(browser);
	await pollUntil(
		() => dialogSnapshot(browser),
		(value) => value?.executable === "/opt/acme/bin/editor",
		"the opener dialog before Close dismissal",
	);
	await roleAction(browser, "button", "Close");
	await assertDialogClosedAndFocusReturned(browser);
	expect((await requests(browser)).some((request) => request.method === "PUT")).toBe(false);

	await openOpenerSettings(browser);
	await pollUntil(
		() => dialogSnapshot(browser),
		(value) => value?.executable === "/opt/acme/bin/editor",
		"the persistence workflow dialog",
	);
	await fillLabel(browser, "Executable", draftSelection.executable);
	await fillArguments(browser, draftSelection.argv);
	await setProbeHold(browser, "POST:/api/settings/opener/test");
	await roleAction(browser, "button", "Test");
	await pollUntil(
		() => pendingControls(browser, "Testing the opener"),
		(value) =>
			value.busy &&
			Object.keys(value.disabled).length === 4 &&
			Object.values(value.disabled).every(Boolean),
		"the pending Test controls",
		{ timeoutMs: 5_000 },
	);
	await releaseProbe(browser, "POST:/api/settings/opener/test");
	const tested = await pollUntil(
		() => testResultSnapshot(browser),
		(value) => value.text?.includes("Opener works") ?? false,
		"the controlled test success inside the dialog",
		{ timeoutMs: 5_000 },
	);
	expect(tested.role).toBe("alert");
	expect(tested.text).toContain(repository);
	let recorded = await requests(browser);
	expect(recorded.at(-1)).toEqual({
		method: "POST",
		path: "/api/settings/opener/test",
		body: { selection: draftSelection, repository },
	});
	expect(recorded.some((request) => request.method === "PUT")).toBe(false);
	// The page must still answer after the result renders: a frozen main thread here is a product bug.
	expect(
		(await browser.run(["eval", "--stdin"], { stdin: "1 + 1", timeoutMs: 5_000 })).trim(),
	).toBe("2");

	expect(
		(
			await browser.run(["eval", "--stdin"], {
				stdin: "Boolean(window.__openerProbe && (window.__openerProbe.nextTest = 'failure'))",
				timeoutMs: 5_000,
			})
		).trim(),
	).toBe("true");
	await roleAction(browser, "button", "Test");
	const failed = await pollUntil(
		() => testResultSnapshot(browser),
		(value) => value.text?.includes("Controlled opener failed before launch.") ?? false,
		"the controlled opener failure inside the dialog",
		{ timeoutMs: 5_000 },
	);
	expect(failed.role).toBe("alert");
	expect(failed.text).toContain("OPENER_SPAWN_FAILED");
	expect(failed.github).toMatchObject({
		text: "Open on GitHub",
		href: githubHref,
		target: "_blank",
	});
	expect(failed.github?.rel).toContain("noreferrer");
	expect((await dialogSnapshot(browser))?.executable).toBe(draftSelection.executable);
	expect((await dialogSnapshot(browser))?.arguments).toEqual([...draftSelection.argv]);

	await roleAction(browser, "button", "Reset");
	const reset = await pollUntil(
		() => dialogSnapshot(browser),
		(value) => value?.current === "Platform default" && value.effective === "xdg-open {path}",
		"reset platform settings to reload",
	);
	expect(reset?.availability).toBe("Available");
	recorded = await requests(browser);
	expect(recorded.slice(-2)).toEqual([
		{ method: "DELETE", path: "/api/settings/opener", body: null },
		{ method: "GET", path: "/api/settings/opener", body: null },
	]);

	await roleAction(browser, "radio", "Custom command");
	await fillLabel(browser, "Executable", draftSelection.executable);
	await fillArguments(browser, draftSelection.argv);
	await setProbeHold(browser, "PUT:/api/settings/opener");
	await roleAction(browser, "button", "Save");
	await pollUntil(
		() => pendingControls(browser, "Saving the opener"),
		(value) =>
			value.busy &&
			Object.keys(value.disabled).length === 4 &&
			Object.values(value.disabled).every(Boolean),
		"the pending Save controls",
		{ timeoutMs: 5_000 },
	);
	await releaseProbe(browser, "PUT:/api/settings/opener");
	await assertDialogClosedAndFocusReturned(browser);
	recorded = await requests(browser);
	expect(recorded.filter((request) => request.method === "PUT")).toEqual([
		{ method: "PUT", path: "/api/settings/opener", body: draftSelection },
	]);
	const savedNotices = await pollUntil(
		() => shellNotices(browser),
		(notices) =>
			notices.some(
				(notice) => notice.title === "Opener settings" && notice.description.includes("Saved."),
			),
		"the saved opener notice",
	);
	expect(savedNotices.find((notice) => notice.title === "Opener settings")?.role).toBe("alert");
	expect(await dismissNotice(browser, "Opener settings")).toBe(true);

	await openOpenerSettings(browser);
	const reopened = await pollUntil(
		() => dialogSnapshot(browser),
		(value) => value?.executable === draftSelection.executable,
		"the saved opener to persist across reopen",
	);
	expect(reopened?.arguments).toEqual([...draftSelection.argv]);
	expect(reopened?.count).toBe(1);
	await roleAction(browser, "button", "Close");
	await assertDialogClosedAndFocusReturned(browser);
	expect(await browser.eval<boolean>("!document.querySelector('[role=dialog]')")).toBe(true);

	const consoleOutput = await browser.run(["console"]);
	const pageErrors = await browser.run(["errors"]);
	expect(consoleOutput.trim()).toBe("");
	expect(pageErrors.trim()).toBe("");
	await canvas.assertRunning();
	expect(canvas.stderr.trim()).toBe("");
	const serverLog = existsSync(logPath) ? readFileSync(logPath, "utf8") : "";
	expect(serverLog).not.toMatch(/\[(?:warn|error)\]/i);
}, 30_000);
