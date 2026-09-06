import { expect } from "bun:test";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { pollUntil, type AgentBrowserSession } from "./agent-browser.ts";
import { SHELL_NOTICES, THEME_EXPRESSION } from "./shell-dom.ts";
import { emulateMedia } from "./shell-render-matrix.ts";

/** The opener dialog as a person reads it: names, choices, values and focus. */
type DialogSnapshot = {
	count: number;
	name: string | null;
	tag: string;
	title: string | null;
	description: string | null;
	/** The checked opener choice's label. */
	current: string | null;
	/** The saved opener command the dialog reports. */
	effective: string | null;
	/** The availability badge on the saved choice. */
	availability: string | null;
	choices: Array<{ label: string; command: string }>;
	executable: string | null;
	arguments: string[];
	/** The test checkout the select shows, and its root beneath it. */
	repository: string | null;
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
/** What the last test answered, inside the dialog. */
type TestResultSnapshot = {
	role: string | null;
	text: string | null;
	github: { text: string; href: string; target: string; rel: string } | null;
};
/** A persistent shell notice by title. */
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
	backdropCovers: boolean;
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
/** WCAG 2.5.8 target size floor. */
export const MIN_TARGET = 24;

/** The opener dialog by its accessible name. */
const OPENER_DIALOG = `[...document.querySelectorAll('[role="dialog"]')].find(node =>
	[...node.querySelectorAll('[data-slot="dialog-title"]')].some(title => title.textContent?.trim() === 'Opener settings'))`;

/** The accessible name of a control: its label, its aria-label, or its words. */
const CONTROL_NAME = `node => {
	if (!node) return null;
	const stripBadge = element => (element.textContent ?? '').replace([...element.querySelectorAll('span')].filter(span => span.childElementCount === 0).at(-1)?.textContent ?? '', '').trim();
	const ids = (node.getAttribute('aria-labelledby') ?? '').split(/\\s+/).filter(Boolean);
	const byIds = ids.map(id => document.getElementById(id)).filter(Boolean).map(element => stripBadge(element)).join(' ');
	const fieldLabel = node.getAttribute('role') === 'radio' ? node.closest('[data-slot="field"]')?.querySelector('label') : null;
	const withoutBadge = element => (element.textContent ?? '').replace([...element.querySelectorAll('span')].filter(span => span.childElementCount === 0).at(-1)?.textContent ?? '', '').trim();
	const labelElement = fieldLabel ?? node.labels?.[0] ?? document.querySelector('label[for="' + node.id + '"]');
	const label = labelElement ? withoutBadge(labelElement) : undefined;
	return node.getAttribute('aria-label') || byIds || label || node.textContent?.trim() || node.tagName.toLowerCase();
}`;

export async function dialogSnapshot(browser: AgentBrowserSession): Promise<DialogSnapshot | null> {
	return browser.eval<DialogSnapshot | null>(`(() => {
		const text = node => node?.textContent?.trim() ?? null;
		const controlName = ${CONTROL_NAME};
		const dialog = ${OPENER_DIALOG};
		if (!dialog) return null;
		const title = dialog.querySelector('[data-slot="dialog-title"]');
		const description = dialog.querySelector('[data-slot="dialog-description"]');
		const loading = [...dialog.querySelectorAll('p')].find(node => /Reading opener settings/.test(node.textContent));
		const radios = [...dialog.querySelectorAll('[role="radio"]')];
		const choiceOf = radio => {
			const field = radio.closest('[data-slot="field"]');
			const label = field?.querySelector('label');
			return { label: label ? (label.textContent ?? '').replace([...label.querySelectorAll('span')].filter(span => span.childElementCount === 0).at(-1)?.textContent ?? '', '').trim() : '',
				command: text(field?.querySelector('[data-slot="field-description"]')) ?? '',
				availability: text(label?.querySelector('span')) };
		};
		const checked = radios.find(radio => radio.getAttribute('aria-checked') === 'true');
		const effective = [...dialog.querySelectorAll('p')].find(node => /^Saved opener:/.test(node.textContent));
		const executable = [...dialog.querySelectorAll('input')].find(node => controlName(node) === 'Executable');
		const argv = [...dialog.querySelectorAll('textarea')].find(node => controlName(node) === 'Arguments');
		const select = [...dialog.querySelectorAll('[role="combobox"]')].find(node => controlName(node) === 'Test with repository');
		const selectField = select?.closest('[data-slot="field"]');
		const root = document.getElementById('root');
		const bodyChild = [...document.body.children].find(node => node.contains(dialog));
		return {
			count: document.querySelectorAll('[role="dialog"]').length,
			name: text(title),
			tag: dialog.tagName,
			title: text(title),
			description: loading ? text(loading) : text(description),
			current: checked ? choiceOf(checked).label : null,
			effective: effective ? effective.textContent.replace(/^Saved opener:\\s*/, '').trim() : null,
			availability: checked ? choiceOf(checked).availability : null,
			choices: radios.map(radio => { const { label, command } = choiceOf(radio); return { label, command }; }),
			executable: executable?.value ?? null,
			arguments: argv ? argv.value.split('\\n').filter(Boolean) : [],
			repository: text(select?.querySelector('[data-slot="select-value"]')),
			checkout: text(selectField?.querySelector('[data-slot="field-description"]')),
			focus: controlName(document.activeElement),
			focusInside: dialog.contains(document.activeElement),
			rootContainsDialog: Boolean(root?.contains(dialog)),
			portalAtBody: document.body.contains(dialog) && bodyChild?.parentElement === document.body && bodyChild !== root,
		};
	})()`);
}

export async function validationSnapshot(
	browser: AgentBrowserSession,
): Promise<ValidationSnapshot> {
	return browser.eval<ValidationSnapshot>(`(() => {
		const dialog = ${OPENER_DIALOG};
		const button = label => [...(dialog?.querySelectorAll('button') ?? [])]
			.find(candidate => candidate.textContent?.trim() === label);
		return {
			message: [...(dialog?.querySelectorAll('[data-slot="field-error"]') ?? [])].map(node => node.textContent.trim()).join(' ') || null,
			saveDisabled: button('Save')?.disabled ?? false,
			testDisabled: button('Test')?.disabled ?? false
		};
	})()`);
}

export async function testResultSnapshot(
	browser: AgentBrowserSession,
): Promise<TestResultSnapshot> {
	return browser.eval<TestResultSnapshot>(`(() => {
		const dialog = ${OPENER_DIALOG};
		const alert = [...(dialog?.querySelectorAll('[data-slot="alert"]') ?? [])]
			.find(node => /Opener works|Test failed/.test(node.textContent));
		const github = [...(alert?.querySelectorAll('a') ?? [])].find(node => node.textContent?.trim() === 'Open on GitHub');
		return {
			role: alert?.getAttribute('role') ?? null,
			text: alert?.textContent?.replace(/\\s+/g, ' ').trim() ?? null,
			github: github instanceof HTMLAnchorElement ? {
				text: github.textContent?.trim() ?? '', href: github.href, target: github.target, rel: github.rel
			} : null
		};
	})()`);
}

export async function noticeSnapshot(browser: AgentBrowserSession): Promise<NoticeSnapshot> {
	return browser.eval<NoticeSnapshot>(`(() => {
		const notice = ${SHELL_NOTICES}.at(-1) ?? null;
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
			requests: [], selection: initial, nextGet: 'success', nextTest: 'success',
			holdNext: 'GET:/api/settings/opener',
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
			if (method === 'GET') return deferred(key, () => probe.nextGet === 'failure'
				? reply({
					success: false, code: 'OPENER_CONFIG_INVALID',
					error: 'Controlled settings read failed after cancellation.',
					actions: [
						{ kind: 'settings', label: 'Opener settings' },
						{ kind: 'github', label: 'Open on GitHub', href: ${JSON.stringify(githubHref)} }
					]
				}, 500)
				: reply(settings()));
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

export async function visualSnapshot(browser: AgentBrowserSession): Promise<VisualSnapshot> {
	return browser.eval<VisualSnapshot>(`(() => {
		const dialog = ${OPENER_DIALOG};
		const shell = document.getElementById('root')?.firstElementChild;
		if (!dialog || !shell) throw new Error('the opener visual probe is incomplete');
		const controlName = ${CONTROL_NAME};
		const rect = node => node.getBoundingClientRect();
		const backdrop = document.querySelector('[data-slot="dialog-overlay"]');
		const backdropRect = backdrop ? rect(backdrop) : null;
		// A radio's target is its whole row (control and label); Base UI's hidden form inputs are not targets.
		const targets = [...dialog.querySelectorAll('button, input, textarea, [role="combobox"], [role="radio"]')]
			.filter(node => !(node instanceof HTMLInputElement && node.type === 'radio') && rect(node).width > 1)
			.map(node => {
				const target = node.getAttribute('role') === 'radio' ? (node.closest('[data-slot="field"]') ?? node) : node;
				const box = rect(target);
				return { name: controlName(node), width: box.width, height: box.height };
			});
		const colorContext = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
		const rgb = value => { colorContext.clearRect(0, 0, 1, 1); colorContext.fillStyle = value;
			colorContext.fillRect(0, 0, 1, 1); return [...colorContext.getImageData(0, 0, 1, 1).data].slice(0, 3); };
		const luminance = value => {
			const [red, green, blue] = rgb(value).map(channel => {
				const unit = channel / 255;
				return unit <= 0.04045 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
			});
			return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
		};
		const title = dialog.querySelector('[data-slot="dialog-title"]');
		const foreground = luminance(getComputedStyle(title).color);
		const background = luminance(getComputedStyle(dialog).backgroundColor);
		const focused = getComputedStyle(document.activeElement);
		const dialogRect = rect(dialog);
		return {
			theme: ${THEME_EXPRESSION},
			queries: { dark: matchMedia('(prefers-color-scheme: dark)').matches,
				reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
				forcedColors: matchMedia('(forced-colors: active)').matches },
			pageOverflow: document.documentElement.scrollWidth > innerWidth ||
				document.documentElement.scrollHeight > innerHeight || document.body.scrollWidth > innerWidth ||
				document.body.scrollHeight > innerHeight,
			dialogWithinViewport: dialogRect.left >= 0 && dialogRect.top >= 0 &&
				dialogRect.right <= innerWidth && dialogRect.bottom <= innerHeight,
			visibleFocus: focused.boxShadow !== 'none' || (focused.outlineStyle !== 'none' && parseFloat(focused.outlineWidth) >= 1),
			focusName: controlName(document.activeElement),
			outlineStyle: focused.outlineStyle,
			outlineWidth: parseFloat(focused.outlineWidth),
			forcedColorAdjust: focused.forcedColorAdjust,
			controlDurationMs: parseFloat(focused.transitionDuration) * 1000,
			contrast: (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05),
			targets,
			dialogZ: Number.parseFloat(getComputedStyle(dialog).zIndex) || 0,
			shellZ: Number.parseFloat(getComputedStyle(shell).zIndex) || 0,
			backdropCovers: !!backdropRect && backdropRect.left <= 0 && backdropRect.top <= 0 &&
				backdropRect.right >= innerWidth && backdropRect.bottom >= innerHeight
		};
	})()`);
}

/**
 * The dialog keeps keyboard focus visible, its words readable, its controls
 * usable and its portal above the shell in every media mode of one theme.
 * @param browser The page.
 * @param theme The theme the dialog is open in.
 */
export async function verifyVisualModes(
	browser: AgentBrowserSession,
	theme: ShellTheme,
): Promise<void> {
	for (const mode of ["normal", "reduced-motion", "forced-colors"] as const satisfies MediaMode[]) {
		const restore = await emulateMedia(browser, theme, mode);
		try {
			await browser.run(["press", "Tab"]);
			await pollUntil(
				() => dialogSnapshot(browser),
				(value) => value?.focusInside === true,
				`keyboard focus inside the ${theme} ${mode} dialog`,
				{ timeoutMs: 5_000 },
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
			expect(snapshot.backdropCovers).toBe(true);
			expect(snapshot.visibleFocus).toBe(true);
			expect(snapshot.forcedColorAdjust).not.toBe("none");
			expect(snapshot.contrast).toBeGreaterThanOrEqual(4.5);
			expect(snapshot.dialogZ).toBeGreaterThan(snapshot.shellZ);
			expect(
				snapshot.targets.filter(({ width, height }) => width < MIN_TARGET || height < MIN_TARGET),
			).toEqual([]);
			if (mode === "reduced-motion") {
				expect(snapshot.controlDurationMs).toBeLessThanOrEqual(0.01);
			}
		} finally {
			await restore();
		}
	}
}

/** The focused control's accessible name and whether it sits inside the opener dialog. */
export async function focusedControl(
	browser: AgentBrowserSession,
): Promise<{ focus: string | null; focusInside: boolean }> {
	return browser.eval<{ focus: string | null; focusInside: boolean }>(`(() => {
		const controlName = ${CONTROL_NAME};
		const dialog = ${OPENER_DIALOG};
		return { focus: controlName(document.activeElement), focusInside: !!dialog && dialog.contains(document.activeElement) };
	})()`);
}

/** The busy line and the footer controls' disabled state while a request is pending. */
export async function pendingControls(
	browser: AgentBrowserSession,
	busyWords: string,
): Promise<{ requests: string[]; busy: boolean; disabled: Record<string, boolean> }> {
	return browser.eval<{
		requests: string[];
		busy: boolean;
		disabled: Record<string, boolean>;
	}>(`(() => {
		const dialog = ${OPENER_DIALOG};
		const buttons = [...(dialog?.querySelectorAll('button') ?? [])].filter(node => !node.querySelector('.sr-only'));
		return {
			requests: (window.__openerProbe?.requests ?? []).map(request => request.method + ' ' + request.path),
			busy: [...(dialog?.querySelectorAll('p') ?? [])].some(node => node.textContent.includes(${JSON.stringify(busyWords)})),
			disabled: Object.fromEntries(buttons
				.filter(node => ['Reset', 'Test', 'Close', 'Save'].includes(node.textContent.trim()))
				.map(node => [node.textContent.trim(), node.disabled || node.getAttribute('aria-disabled') === 'true'])),
		};
	})()`);
}
