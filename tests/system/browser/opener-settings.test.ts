import { expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { startOwnedCanvas } from "../support/owned-canvas.ts";
import {
	browserTestRoots,
	canvasTestEnvironment,
	createAgentBrowser,
	pollUntil,
	registerCanvasBase,
	type AgentBrowserSession,
} from "./support/agent-browser.ts";

type RecordedRequest = { method: string; path: string; body: unknown };
type DialogSnapshot = {
	title: string | null;
	current: string | null;
	effective: string | null;
	availability: string | null;
	choices: Array<{ label: string; command: string }>;
	executable: string | null;
	arguments: string[];
	repositories: Array<{ value: string; label: string }>;
	checkout: string | null;
};
type ValidationSnapshot = {
	message: string | null;
	saveDisabled: boolean;
	testDisabled: boolean;
};
type NoticeSnapshot = {
	kind: string | null;
	text: string | null;
	settings: string | null;
	github: { text: string; href: string; target: string; rel: string } | null;
};

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const serverPath = join(repoRoot, "src/server.ts");
const repository = "github.com/acme/archboard";
const githubHref = "https://github.com/acme/archboard/actions/workflows/check.yml";
const draftSelection = {
	version: 1,
	kind: "custom",
	executable: "/opt/draft/bin/editor",
	argv: ["--first", "{path}", "--last"],
} as const;

async function click(browser: AgentBrowserSession, selector: string): Promise<void> {
	const clicked = await browser.eval<boolean>(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!(element instanceof HTMLElement)) return false;
    element.click();
    return true;
  })()`);
	expect(clicked).toBe(true);
}

async function fill(browser: AgentBrowserSession, selector: string, value: string): Promise<void> {
	const written = await browser.eval<string | null>(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!(element instanceof HTMLInputElement)) return null;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(element, ${JSON.stringify(value)});
    element.dispatchEvent(new Event("input", { bubbles: true }));
    return element.value;
  })()`);
	expect(written).toBe(value);
}

async function requests(browser: AgentBrowserSession): Promise<RecordedRequest[]> {
	return browser.eval<RecordedRequest[]>("window.__openerProbe?.requests ?? []");
}

async function dialogSnapshot(browser: AgentBrowserSession): Promise<DialogSnapshot | null> {
	return browser.eval<DialogSnapshot | null>(`(() => {
    const dialog = document.querySelector('dialog[aria-label="Opener settings"]');
    if (!(dialog instanceof HTMLDialogElement)) return null;
    const text = selector => dialog.querySelector(selector)?.textContent?.trim() ?? null;
    return {
      title: text('.modal-title'),
      current: text('.opener-summary strong'),
      effective: text('.opener-summary code'),
      availability: text('.opener-availability'),
      choices: [...dialog.querySelectorAll('.opener-choice')].map(choice => ({
        label: choice.querySelector('strong')?.textContent?.trim() ?? '',
        command: choice.querySelector('small')?.textContent?.trim() ?? ''
      })),
      executable: dialog.querySelector('.opener-custom input')?.value ?? null,
      arguments: [...dialog.querySelectorAll('.opener-argument input')].map(input => input.value),
      repositories: [...dialog.querySelectorAll('.opener-checkout option')].map(option => ({
        value: option.value,
        label: option.textContent?.trim() ?? ''
      })),
      checkout: text('.opener-checkout small')
    };
  })()`);
}

async function validationSnapshot(browser: AgentBrowserSession): Promise<ValidationSnapshot> {
	return browser.eval<ValidationSnapshot>(`(() => {
    const dialog = document.querySelector('dialog[aria-label="Opener settings"]');
    const button = label => [...(dialog?.querySelectorAll('.modal-footer button') ?? [])]
      .find(candidate => candidate.textContent?.trim() === label);
    return {
      message: dialog?.querySelector('[role="alert"]')?.textContent?.trim() ?? null,
      saveDisabled: button('Save')?.disabled ?? false,
      testDisabled: button('Test')?.disabled ?? false
    };
  })()`);
}

async function noticeSnapshot(browser: AgentBrowserSession): Promise<NoticeSnapshot> {
	return browser.eval<NoticeSnapshot>(`(() => {
    const notice = document.querySelector('.notice-shell');
    const github = notice?.querySelector('.notice-actions a');
    return {
      kind: notice?.getAttribute('class') ?? null,
      text: notice?.querySelector('.notice-text')?.childNodes[0]?.textContent?.trim() ?? null,
      settings: notice?.querySelector('.notice-actions button')?.textContent?.trim() ?? null,
      github: github instanceof HTMLAnchorElement ? {
        text: github.textContent?.trim() ?? '',
        href: github.href,
        target: github.target,
        rel: github.rel
      } : null
    };
  })()`);
}

async function installFetchDouble(browser: AgentBrowserSession): Promise<void> {
	const installed = await browser.eval<boolean>(`(() => {
    const original = window.fetch;
    const initial = {
      version: 1,
      kind: 'custom',
      executable: '/opt/acme/bin/editor',
      argv: ['--reuse-window', '{path}', '--wait']
    };
    const probe = window.__openerProbe = {
      requests: [],
      selection: initial,
      nextTest: 'success'
    };
    const command = selection => selection.kind === 'platform'
      ? { executable: 'xdg-open', argv: ['{path}'] }
      : selection.kind === 'preset'
        ? { executable: selection.preset, argv: ['{path}'] }
        : { executable: selection.executable, argv: selection.argv };
    const settings = () => ({
      success: true,
      selection: probe.selection,
      effectiveCommand: command(probe.selection),
      availability: { available: true },
      platformDefault: { executable: 'xdg-open', argv: ['{path}'] },
      presets: [
        { preset: 'vscode', command: { executable: 'code', argv: ['{path}'] } },
        { preset: 'cursor', command: { executable: 'cursor', argv: ['{path}'] } },
        { preset: 'zed', command: { executable: 'zed', argv: ['{path}'] } }
      ],
      repositories: [{
        repository: ${JSON.stringify(repository)},
        root: '/controlled/checkout',
        exists: true,
        identityMatches: true
      }]
    });
    const reply = (body, status = 200) => new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' }
    });
    window.fetch = async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input.url, location.href);
      if (url.pathname !== '/api/settings/opener' &&
          url.pathname !== '/api/settings/opener/test') {
        return original.call(window, input, init);
      }
      const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
      probe.requests.push({ method, path: url.pathname, body });
      if (url.pathname === '/api/settings/opener/test') {
        if (probe.nextTest === 'failure') return reply({
          success: false,
          code: 'OPENER_SPAWN_FAILED',
          error: 'Controlled opener failed before launch.',
          actions: [
            { kind: 'settings', label: 'Opener settings' },
            { kind: 'github', label: 'Open on GitHub', href: ${JSON.stringify(githubHref)} }
          ]
        }, 500);
        return reply({ success: true, code: 'OPENER_TESTED', repository: ${JSON.stringify(repository)} });
      }
      if (method === 'GET') return reply(settings());
      if (method === 'DELETE') {
        probe.selection = { version: 1, kind: 'platform' };
        return reply({ success: true, selection: probe.selection });
      }
      if (method === 'PUT') {
        probe.selection = body;
        return reply({ success: true, selection: body });
      }
      return reply({ success: false, code: 'REQUEST_INVALID', error: 'Unexpected test request.' }, 400);
    };
    return true;
  })()`);
	expect(installed).toBe(true);
}

test("global opener settings validate, test, reset, and save through the rendered shell", async () => {
	await using resources = new AsyncDisposableStack();
	const { ownerRoot } = browserTestRoots();
	const testRoot = join(ownerRoot, "opener-settings");
	resources.defer(() => rmSync(testRoot, { recursive: true, force: true }));
	mkdirSync(testRoot, { recursive: true });
	const vault = join(testRoot, "vault");
	mkdirSync(vault, { recursive: true });
	const canvas = await startOwnedCanvas({
		serverPath,
		vault,
		env: canvasTestEnvironment({
			LOG_FILE_PATH: join(testRoot, "canvas.log"),
			ARCHBOARD_OPENER_CONFIG: join(testRoot, "machine-state", "opener.json"),
		}),
	});
	resources.defer(() => canvas.dispose());
	registerCanvasBase(canvas.base);
	const browser = resources.use(await createAgentBrowser());

	await browser.run(["open", canvas.base]);
	expect(await browser.eval<string>("navigator.userAgent")).toMatch(/headless/i);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				'Boolean(document.querySelector("button[aria-label=\\"Opener settings\\"]"))',
			),
		Boolean,
		"the opener settings gear to render",
	);
	await installFetchDouble(browser);

	await click(browser, 'button[aria-label="Opener settings"]');
	const initial = await pollUntil(
		() => dialogSnapshot(browser),
		(value) => value?.executable === "/opt/acme/bin/editor",
		"the custom opener settings to render",
	);
	expect(initial).toEqual({
		title: "Opener settings",
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
	});
	expect(await requests(browser)).toEqual([
		{ method: "GET", path: "/api/settings/opener", body: null },
	]);

	await fill(browser, ".opener-custom .field input", "./editor");
	const relativeExecutable = await pollUntil(
		() => validationSnapshot(browser),
		(value) => value.saveDisabled && value.testDisabled,
		"the client-side relative executable validation",
	);
	expect(relativeExecutable.message).toBe(
		"A custom executable must be absolute or a bare PATH name.",
	);
	await fill(browser, ".opener-custom .field input", "/opt/acme/bin/editor");

	await fill(browser, '.opener-argument input[aria-label="Argument 2"]', "--without-path");
	const invalid = await pollUntil(
		() => validationSnapshot(browser),
		(value) => value.saveDisabled && value.testDisabled,
		"the client-side path-token validation",
	);
	expect(invalid.message).toBe("argv must contain exactly one {path} token");

	await fill(browser, ".opener-custom .field input", draftSelection.executable);
	for (const [index, argument] of draftSelection.argv.entries()) {
		await fill(browser, `.opener-argument input[aria-label="Argument ${index + 1}"]`, argument);
	}
	await pollUntil(
		() => validationSnapshot(browser),
		(value) => !value.message && !value.saveDisabled && !value.testDisabled,
		"the corrected custom draft",
	);
	await click(browser, ".modal-footer .btn-secondary");
	const tested = await pollUntil(
		() => noticeSnapshot(browser),
		(value) => value.text === `Test opener launched for ${repository}.`,
		"the controlled test success notice",
	);
	expect(tested.kind).toContain("notice-info");
	let recorded = await requests(browser);
	expect(recorded.at(-1)).toEqual({
		method: "POST",
		path: "/api/settings/opener/test",
		body: { selection: draftSelection, repository },
	});
	expect(recorded.some((request) => request.method === "PUT")).toBe(false);

	await browser.eval<boolean>(
		"Boolean(window.__openerProbe && (window.__openerProbe.nextTest = 'failure'))",
	);
	await click(browser, ".modal-footer .btn-secondary");
	const failed = await pollUntil(
		() => noticeSnapshot(browser),
		(value) => value.text === "Controlled opener failed before launch.",
		"the controlled opener failure notice",
	);
	expect(failed.kind).toContain("notice-error");
	expect(failed.settings).toBe("Opener settings");
	expect(failed.github).toEqual({
		text: "Open on GitHub",
		href: githubHref,
		target: "_blank",
		rel: "noopener noreferrer",
	});

	await click(browser, ".modal-close");
	await pollUntil(
		() => dialogSnapshot(browser),
		(value) => value === null,
		"the failed settings dialog to close",
	);
	await click(browser, ".notice-actions button");
	await pollUntil(
		() => requests(browser),
		(value) => value.filter((request) => request.method === "GET").length === 2,
		"the settings action to fetch fresh state",
	);
	expect((await dialogSnapshot(browser))?.current).toBe("Custom");

	await click(browser, ".opener-reset");
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

	await click(browser, 'label[aria-label="Custom opener"]');
	await fill(browser, ".opener-custom .field input", draftSelection.executable);
	for (const [index, argument] of draftSelection.argv.entries()) {
		await fill(browser, `.opener-argument input[aria-label="Argument ${index + 1}"]`, argument);
	}
	await click(browser, ".modal-footer .btn-primary");
	await pollUntil(
		() => dialogSnapshot(browser),
		(value) => value === null,
		"save to close the settings dialog",
	);
	recorded = await requests(browser);
	expect(recorded.at(-1)).toEqual({
		method: "PUT",
		path: "/api/settings/opener",
		body: draftSelection,
	});
	const saved = await noticeSnapshot(browser);
	expect(saved.kind).toContain("notice-info");
	expect(saved.text).toBe("Saved. Every pane and caller uses this opener on the next activation.");
	await canvas.assertRunning();
});
