import { expect } from "bun:test";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { pollUntil, type AgentBrowserSession } from "./agent-browser.ts";

type RecordedRequest = { method: string; path: string; body: unknown };
type DialogSnapshot = {
	count: number;
	name: string | null;
	tag: string;
	title: string | null;
	description: string | null;
	current: string | null;
	effective: string | null;
	availability: string | null;
	choices: Array<{ label: string; command: string }>;
	executable: string | null;
	arguments: string[];
	repositories: Array<{ value: string; label: string }>;
	checkout: string | null;
	focus: string | null;
	focusInside: boolean;
	rootContainsDialog: boolean;
	portalAtBody: boolean;
};
type ValidationSnapshot = {
	message: string | null;
	saveDisabled: boolean;
	testDisabled: boolean;
};
type NoticeSnapshot = {
	role: string | null;
	text: string | null;
	settings: string | null;
	github: { text: string; href: string; target: string; rel: string } | null;
};
type VisualSnapshot = {
	theme: string | null;
	queries: { dark: boolean; reducedMotion: boolean; forcedColors: boolean };
	pageOverflow: boolean;
	dialogWithinViewport: boolean;
	dialogScrollable: boolean;
	visibleFocus: boolean;
	focusName: string;
	outlineStyle: string;
	outlineWidth: number;
	forcedColorAdjust: string;
	controlDurationMs: number;
	contrast: number;
	targets: Array<{ name: string; width: number; height: number }>;
	dialogZ: number;
	shellZ: number;
};
type MediaMode = "normal" | "reduced-motion" | "forced-colors";
type ShellTheme = "light" | "dark";

const repoRoot = fileURLToPath(new URL("../../../..", import.meta.url));
export const serverPath = join(repoRoot, "src/server.ts");
export const repository = "github.com/acme/archboard";
export const githubHref = "https://github.com/acme/archboard/actions/workflows/check.yml";
export const draftSelection = {
	version: 1,
	kind: "custom",
	executable: "/opt/draft/bin/editor",
	argv: ["--first", "{path}", "--last"],
} as const;

export function roleAction(
	browser: AgentBrowserSession,
	role: string,
	name: string,
	action: "click" | "text" = "click",
): Promise<string> {
	return browser.run(["find", "role", role, action, "--name", name, "--exact"]);
}

export function fillLabel(
	browser: AgentBrowserSession,
	label: string,
	value: string,
): Promise<string> {
	return browser.run(["find", "label", label, "fill", value, "--exact"]);
}

export async function requests(browser: AgentBrowserSession): Promise<RecordedRequest[]> {
	return browser.eval<RecordedRequest[]>("window.__openerProbe?.requests ?? []");
}

export async function dialogSnapshot(browser: AgentBrowserSession): Promise<DialogSnapshot | null> {
	return browser.eval<DialogSnapshot | null>(`(() => {
		const text = node => node?.textContent?.trim() ?? null;
		const labelledText = (node, attribute) => {
			const ids = (node?.getAttribute(attribute) ?? '').split(/\\s+/).filter(Boolean);
			return ids.length ? ids.map(id => text(document.getElementById(id))).filter(Boolean).join(' ') : null;
		};
		const controlName = node => node?.getAttribute('aria-label') || labelledText(node, 'aria-labelledby') ||
			node?.labels?.[0]?.getAttribute('aria-label') || text(node?.labels?.[0]?.querySelector(':scope > span')) ||
			text(node?.labels?.[0]) || text(node);
		const dialogs = [...document.querySelectorAll('[role="dialog"]')];
		const dialog = dialogs.find(node => labelledText(node, 'aria-labelledby') === 'Opener settings');
		if (!dialog) return null;
		const labelled = label => [...dialog.querySelectorAll('label')]
			.find(node => text(node.querySelector('span')) === label);
		const summaryLabel = [...dialog.querySelectorAll('span')]
			.find(node => text(node) === 'Current selection');
		const commandLabel = [...dialog.querySelectorAll('span')]
			.find(node => text(node) === 'Effective command');
		const availability = [...dialog.querySelectorAll('span')]
			.find(node => ['Available', 'Unavailable'].some(value => text(node)?.startsWith(value)));
		const choices = [...dialog.querySelectorAll('fieldset label')].map(choice => ({
			label: text(choice.querySelector('strong')) ?? '',
			command: text(choice.querySelector('small')) ?? ''
		}));
		const executable = labelled('Executable')?.querySelector('input');
		const checkout = labelled('Registered checkout for Test');
		const root = document.getElementById('root');
		return {
			count: dialogs.length,
			name: labelledText(dialog, 'aria-labelledby'),
			tag: dialog.tagName,
			title: labelledText(dialog, 'aria-labelledby'),
			description: labelledText(dialog, 'aria-describedby'),
			current: text(summaryLabel?.nextElementSibling),
			effective: text(commandLabel?.nextElementSibling),
			availability: text(availability),
			choices,
			executable: executable?.value ?? null,
			arguments: [...dialog.querySelectorAll('input[aria-label^="Argument "]')].map(input => input.value),
			repositories: [...(checkout?.querySelectorAll('option') ?? [])].map(option => ({
				value: option.value,
				label: text(option) ?? ''
			})),
			checkout: text(checkout?.querySelector('small')),
			focus: controlName(document.activeElement),
			focusInside: dialog.contains(document.activeElement),
			rootContainsDialog: Boolean(root?.contains(dialog)),
			portalAtBody: dialog.closest('[data-base-ui-portal]')?.parentElement === document.body
		};
	})()`);
}

export async function validationSnapshot(
	browser: AgentBrowserSession,
): Promise<ValidationSnapshot> {
	return browser.eval<ValidationSnapshot>(`(() => {
		const dialog = [...document.querySelectorAll('[role="dialog"]')].find(node =>
			node.getAttribute('aria-labelledby')?.split(/\\s+/).some(id =>
				document.getElementById(id)?.textContent?.trim() === 'Opener settings'));
		const button = label => [...(dialog?.querySelectorAll('button') ?? [])]
			.find(candidate => candidate.textContent?.trim() === label);
		return {
			message: dialog?.querySelector('[role="alert"]')?.textContent?.trim() ?? null,
			saveDisabled: button('Save')?.disabled ?? false,
			testDisabled: button('Test')?.disabled ?? false
		};
	})()`);
}

export async function noticeSnapshot(browser: AgentBrowserSession): Promise<NoticeSnapshot> {
	return browser.eval<NoticeSnapshot>(`(() => {
		const dialog = document.querySelector('[role="dialog"]');
		const notice = [...document.querySelectorAll('[role="alert"], [role="status"]')]
			.find(node => !dialog?.contains(node));
		const settings = [...(notice?.querySelectorAll('button') ?? [])]
			.find(node => node.textContent?.trim() === 'Opener settings');
		const github = [...(notice?.querySelectorAll('a') ?? [])]
			.find(node => node.textContent?.trim() === 'Open on GitHub');
		return {
			role: notice?.getAttribute('role') ?? null,
			text: notice?.textContent?.trim() ?? null,
			settings: settings?.textContent?.trim() ?? null,
			github: github instanceof HTMLAnchorElement ? {
				text: github.textContent?.trim() ?? '', href: github.href,
				target: github.target, rel: github.rel
			} : null
		};
	})()`);
}

export async function installFetchDouble(browser: AgentBrowserSession): Promise<void> {
	const installed = await browser.eval<boolean>(`(() => {
		const original = window.fetch;
		const initial = {
			version: 1, kind: 'custom', executable: '/opt/acme/bin/editor',
			argv: ['--reuse-window', '{path}', '--wait']
		};
		const probe = window.__openerProbe = {
			requests: [], selection: initial, nextTest: 'success', holdNext: 'GET:/api/settings/opener',
			pending: null,
			hold(key) { this.holdNext = key; },
			release(key) {
				if (!this.pending || this.pending.key !== key) return false;
				const complete = this.pending.complete;
				this.pending = null;
				complete();
				return true;
			}
		};
		const command = selection => selection.kind === 'platform'
			? { executable: 'xdg-open', argv: ['{path}'] }
			: selection.kind === 'preset'
				? { executable: selection.preset, argv: ['{path}'] }
				: { executable: selection.executable, argv: selection.argv };
		const settings = () => ({
			success: true, selection: probe.selection, effectiveCommand: command(probe.selection),
			availability: { available: true },
			platformDefault: { executable: 'xdg-open', argv: ['{path}'] },
			presets: [
				{ preset: 'vscode', command: { executable: 'code', argv: ['{path}'] } },
				{ preset: 'cursor', command: { executable: 'cursor', argv: ['{path}'] } },
				{ preset: 'zed', command: { executable: 'zed', argv: ['{path}'] } }
			],
			repositories: [{ repository: ${JSON.stringify(repository)}, root: '/controlled/checkout',
				exists: true, identityMatches: true }]
		});
		const reply = (body, status = 200) => new Response(JSON.stringify(body), {
			status, headers: { 'Content-Type': 'application/json' }
		});
		const deferred = (key, complete) => {
			if (probe.holdNext !== key) return complete();
			probe.holdNext = null;
			return new Promise(resolve => { probe.pending = { key, complete: () => resolve(complete()) }; });
		};
		window.fetch = async (input, init) => {
			const url = new URL(typeof input === 'string' ? input : input.url, location.href);
			if (url.pathname !== '/api/settings/opener' && url.pathname !== '/api/settings/opener/test') {
				return original.call(window, input, init);
			}
			const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
			const body = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
			const key = method + ':' + url.pathname;
			probe.requests.push({ method, path: url.pathname, body });
			if (url.pathname === '/api/settings/opener/test') return deferred(key, () => {
				if (probe.nextTest === 'failure') return reply({
					success: false, code: 'OPENER_SPAWN_FAILED',
					error: 'Controlled opener failed before launch.',
					actions: [
						{ kind: 'settings', label: 'Opener settings' },
						{ kind: 'github', label: 'Open on GitHub', href: ${JSON.stringify(githubHref)} }
					]
				}, 500);
				return reply({ success: true, code: 'OPENER_TESTED', repository: ${JSON.stringify(repository)} });
			});
			if (method === 'GET') return deferred(key, () => reply(settings()));
			if (method === 'DELETE') return deferred(key, () => {
				probe.selection = { version: 1, kind: 'platform' };
				return reply({ success: true, selection: probe.selection });
			});
			if (method === 'PUT') return deferred(key, () => {
				probe.selection = body;
				return reply({ success: true, selection: body });
			});
			return reply({ success: false, code: 'REQUEST_INVALID', error: 'Unexpected test request.' }, 400);
		};
		return true;
	})()`);
	expect(installed).toBe(true);
}

export async function setProbeHold(browser: AgentBrowserSession, key: string): Promise<void> {
	expect(
		await browser.eval<boolean>(
			`Boolean(window.__openerProbe && (window.__openerProbe.hold(${JSON.stringify(key)}), true))`,
		),
	).toBe(true);
}

export async function releaseProbe(browser: AgentBrowserSession, key: string): Promise<void> {
	await pollUntil(
		() => browser.eval<boolean>(`window.__openerProbe?.pending?.key === ${JSON.stringify(key)}`),
		Boolean,
		`${key} to become pending`,
	);
	expect(
		await browser.eval<boolean>(`window.__openerProbe?.release(${JSON.stringify(key)}) ?? false`),
	).toBe(true);
}

export async function setTheme(browser: AgentBrowserSession, theme: ShellTheme): Promise<void> {
	const current = await browser.eval<string | null>(
		"document.querySelector('.shell')?.getAttribute('data-theme') ?? null",
	);
	if (current !== theme) await roleAction(browser, "button", `Use ${theme} theme`);
	await pollUntil(
		() =>
			browser.eval<string | null>(
				"document.querySelector('.shell')?.getAttribute('data-theme') ?? null",
			),
		(value) => value === theme,
		`the ${theme} theme`,
	);
}

async function emulateMedia(
	browser: AgentBrowserSession,
	theme: ShellTheme,
	mode: MediaMode,
): Promise<() => Promise<void>> {
	const currentUrl = await browser.eval<string>("location.href");
	const output = await browser.run(["get", "cdp-url"]);
	const endpoint = output.match(/ws:\/\/[^\s"']+/)?.[0];
	if (!endpoint) throw new Error(`agent-browser returned no CDP endpoint: ${output.trim()}`);
	const socket = new WebSocket(endpoint);
	await new Promise<void>((resolve, reject) => {
		socket.addEventListener("open", () => resolve(), { once: true });
		socket.addEventListener("error", () => reject(new Error("could not open page CDP socket")), {
			once: true,
		});
	});
	let nextId = 14_411;
	const pending = new Map<
		number,
		{ resolve: (result: Record<string, unknown>) => void; reject: (error: Error) => void }
	>();
	socket.addEventListener("message", (event) => {
		const message = JSON.parse(String(event.data)) as {
			id?: number;
			result?: Record<string, unknown>;
			error?: { message?: string };
		};
		if (message.id === undefined) return;
		const request = pending.get(message.id);
		if (!request) return;
		pending.delete(message.id);
		if (message.error) request.reject(new Error(message.error.message ?? "CDP command failed"));
		else request.resolve(message.result ?? {});
	});
	const command = (
		method: string,
		params: Record<string, unknown> = {},
		sessionId?: string,
	): Promise<Record<string, unknown>> => {
		const id = nextId++;
		const response = new Promise<Record<string, unknown>>((resolve, reject) => {
			pending.set(id, { resolve, reject });
		});
		socket.send(JSON.stringify({ id, method, params, sessionId }));
		return response;
	};
	const targets = (await command("Target.getTargets")) as {
		targetInfos?: Array<{ targetId: string; type: string; url: string }>;
	};
	const page = targets.targetInfos?.find(({ type, url }) => type === "page" && url === currentUrl);
	if (!page) throw new Error(`CDP browser target has no page for ${currentUrl}`);
	const attached = (await command("Target.attachToTarget", {
		targetId: page.targetId,
		flatten: true,
	})) as { sessionId?: string };
	if (!attached.sessionId) throw new Error("CDP did not attach to the opener page");
	await command(
		"Emulation.setEmulatedMedia",
		{
			media: "screen",
			features: [
				{ name: "prefers-color-scheme", value: theme },
				{
					name: "prefers-reduced-motion",
					value: mode === "reduced-motion" ? "reduce" : "no-preference",
				},
				{ name: "forced-colors", value: mode === "forced-colors" ? "active" : "none" },
			],
		},
		attached.sessionId,
	);
	return async () => {
		await command("Target.detachFromTarget", { sessionId: attached.sessionId });
		socket.close();
	};
}

export async function visualSnapshot(browser: AgentBrowserSession): Promise<VisualSnapshot> {
	return browser.eval<VisualSnapshot>(`(() => {
		const dialog = document.querySelector('[role="dialog"]');
		const shell = document.querySelector('.shell');
		if (!dialog || !shell) throw new Error('the opener visual probe is incomplete');
		const controlName = node => node.getAttribute('aria-label') ||
			node.labels?.[0]?.getAttribute('aria-label') || node.labels?.[0]?.textContent?.trim() ||
			node.textContent?.trim() || node.tagName.toLowerCase();
		const rect = node => node.getBoundingClientRect();
		const targets = [...dialog.querySelectorAll('button, input:not([type="radio"]), select'),
			...dialog.querySelectorAll('input[type="radio"]')].map(node => {
			const target = node.type === 'radio' ? node.labels?.[0] ?? node : node;
			const box = rect(target);
			return { name: controlName(node), width: box.width, height: box.height };
		});
		const rgb = value => (value.match(/[\\d.]+/g) ?? []).slice(0, 3).map(Number);
		const luminance = value => {
			const [red, green, blue] = rgb(value).map(channel => {
				const unit = channel / 255;
				return unit <= 0.04045 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
			});
			return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
		};
		const title = document.getElementById(dialog.getAttribute('aria-labelledby'));
		const foreground = luminance(getComputedStyle(title).color);
		const background = luminance(getComputedStyle(dialog).backgroundColor);
		const focused = getComputedStyle(document.activeElement);
		const dialogRect = rect(dialog);
		const scrollOwner = [...dialog.children].find(node => getComputedStyle(node).overflowY === 'auto');
		return {
			theme: shell.getAttribute('data-theme'),
			queries: { dark: matchMedia('(prefers-color-scheme: dark)').matches,
				reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
				forcedColors: matchMedia('(forced-colors: active)').matches },
			pageOverflow: document.documentElement.scrollWidth > innerWidth ||
				document.documentElement.scrollHeight > innerHeight || document.body.scrollWidth > innerWidth ||
				document.body.scrollHeight > innerHeight,
			dialogWithinViewport: dialogRect.left >= 0 && dialogRect.top >= 0 &&
				dialogRect.right <= innerWidth && dialogRect.bottom <= innerHeight,
			dialogScrollable: Boolean(scrollOwner && scrollOwner.scrollHeight >= scrollOwner.clientHeight),
			visibleFocus: focused.outlineStyle !== 'none' && parseFloat(focused.outlineWidth) >= 2,
			focusName: controlName(document.activeElement),
			outlineStyle: focused.outlineStyle,
			outlineWidth: parseFloat(focused.outlineWidth),
			forcedColorAdjust: focused.forcedColorAdjust,
			controlDurationMs: parseFloat(getComputedStyle(document.documentElement)
				.getPropertyValue('--arch-duration-control')),
			contrast: (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05),
			targets,
			dialogZ: Number.parseFloat(getComputedStyle(dialog).zIndex) || 0,
			shellZ: Number.parseFloat(getComputedStyle(shell).zIndex) || 0
		};
	})()`);
}

export async function verifyVisualModes(
	browser: AgentBrowserSession,
	theme: ShellTheme,
): Promise<void> {
	for (const mode of ["normal", "reduced-motion", "forced-colors"] as const) {
		const restore = await emulateMedia(browser, theme, mode);
		try {
			await browser.run(["press", "Tab"]);
			await pollUntil(
				() => dialogSnapshot(browser),
				(value) => value?.focusInside === true,
				`keyboard focus inside the ${theme} ${mode} dialog`,
			);
			const snapshot = await visualSnapshot(browser);
			if (!snapshot.visibleFocus) {
				throw new Error(
					`No visible keyboard focus in the ${theme} ${mode} dialog: ${JSON.stringify({
						focusName: snapshot.focusName,
						outlineStyle: snapshot.outlineStyle,
						outlineWidth: snapshot.outlineWidth,
					})}`,
				);
			}
			expect(snapshot.theme).toBe(theme);
			expect(snapshot.queries).toEqual({
				dark: theme === "dark",
				reducedMotion: mode === "reduced-motion",
				forcedColors: mode === "forced-colors",
			});
			expect(snapshot.pageOverflow).toBe(false);
			expect(snapshot.dialogWithinViewport).toBe(true);
			expect(snapshot.dialogScrollable).toBe(true);
			expect(snapshot.visibleFocus).toBe(true);
			expect(snapshot.forcedColorAdjust).not.toBe("none");
			expect(snapshot.contrast).toBeGreaterThanOrEqual(4.5);
			expect(snapshot.dialogZ).toBeGreaterThan(snapshot.shellZ);
			expect(snapshot.targets.every(({ width, height }) => width >= 43.5 && height >= 43.5)).toBe(
				true,
			);
			if (mode === "reduced-motion") expect(snapshot.controlDurationMs).toBeLessThanOrEqual(0.01);
			else expect(snapshot.controlDurationMs).toBeGreaterThan(0.01);
		} finally {
			await restore();
		}
	}
}

export async function assertDialogClosedAndFocusReturned(
	browser: AgentBrowserSession,
): Promise<void> {
	await pollUntil(
		() => dialogSnapshot(browser),
		(value) => value === null,
		"the opener settings dialog to close",
	);
	expect(
		await browser.eval<boolean>(
			"document.activeElement === window.__openerTrigger && document.querySelectorAll('[role=dialog]').length === 0",
		),
	).toBe(true);
}
