import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { pollUntil, type AgentBrowserSession } from "./agent-browser.ts";
import type { ThemeSnapshot } from "./shell-contract-types.ts";

type ShellTheme = "light" | "dark";
type MediaMode = "normal" | "reduced-motion" | "forced-colors";

type MatrixProbe = {
	deviceScaleFactor: number;
	queryTruth: { dark: boolean; reducedMotion: boolean; forcedColors: boolean };
	motion: {
		controlDuration: string;
		statusDuration: string;
		animationDuration: string;
		animationIterationCount: string;
	};
	focus: {
		forcedColorAdjust: string;
		outlineStyle: string;
		outlineWidth: number;
		unclipped: boolean;
	};
	pageOverflow: boolean;
	touchTargets: Array<{ label: string; width: number; height: number }>;
	state: Record<string, string | number>;
	geometry: Record<string, { x: number; y: number; width: number; height: number }>;
	themeSnapshot: ThemeSnapshot;
};

export type ShellMatrixCell = {
	viewport: "desktop" | "flip-scaled";
	width: number;
	height: number;
	deviceScaleFactor: number;
	actualDeviceScaleFactor: number;
	theme: ShellTheme;
	mode: MediaMode;
	queryTruth: MatrixProbe["queryTruth"];
	motion: MatrixProbe["motion"];
	focus: MatrixProbe["focus"];
	pageOverflow: boolean;
	touchTargets: MatrixProbe["touchTargets"];
	stateHash: string;
	geometryHash: string;
	normalizedHash: string;
	screenshot: string;
	screenshotSha256: string;
	themeSnapshot: ThemeSnapshot;
};

export type ShellRenderMatrix = {
	revision: string;
	artifactRoot: string;
	cells: ShellMatrixCell[];
};

const viewports = [
	{ name: "desktop", width: 1440, height: 900, scale: 1 },
	{ name: "flip-scaled", width: 1920, height: 1080, scale: 2 },
] as const;
const themes = ["light", "dark"] as const;
const modes = ["normal", "reduced-motion", "forced-colors"] as const;

function sha256(value: string | Uint8Array): string {
	return createHash("sha256").update(value).digest("hex");
}

function stable(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
	if (value && typeof value === "object") {
		return `{${Object.entries(value as Record<string, unknown>)
			.toSorted(([left], [right]) => left.localeCompare(right))
			.map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
			.join(",")}}`;
	}
	return JSON.stringify(value);
}

export async function emulateMedia(
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
	let nextId = 14_414;
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
	if (!attached.sessionId) throw new Error("CDP did not attach to the shell page");
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

async function setTheme(browser: AgentBrowserSession, theme: ShellTheme): Promise<void> {
	const requested = await browser.eval<boolean>(`(() => {
		const shell = document.querySelector('.shell');
		if (shell?.getAttribute('data-theme') === '${theme}') return true;
		const button = document.querySelector('.bar-actions [aria-label="Use ${theme} theme"]');
		if (!button) return false;
		button.click();
		return true;
	})()`);
	if (!requested) throw new Error(`could not request the ${theme} shell theme`);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('.shell')?.getAttribute('data-theme') === '${theme}'`,
			),
		(value) => value,
		`the ${theme} shell theme to become visible`,
	);
}

async function probe(browser: AgentBrowserSession): Promise<MatrixProbe> {
	return browser.eval<MatrixProbe>(`(() => {
		const shell = document.querySelector('.shell');
		const bar = document.querySelector('.bar');
		const wordmark = document.querySelector('.wordmark');
		const open = document.querySelector('.bar-actions [aria-label="Open board"]');
		const board = document.querySelector('.board-name');
		const meta = document.querySelector('.bar-board-meta');
		const level = document.querySelector('.level-tag');
		const connection = document.querySelector('.status');
		const persistence = document.querySelector('.meta-vault, .chip-held, .chip-elsewhere');
		const pane = document.querySelector('.pane-tab.focused');
		const present = document.querySelector('.present-button');
		if (!shell || !bar || !wordmark || !open || !board || !meta || !level ||
			!connection || !persistence || !pane || !present) throw new Error('shell matrix probe is incomplete');
		const round = value => Math.round(value * 1000) / 1000;
		const rect = node => {
			const value = node.getBoundingClientRect();
			return { x: round(value.x), y: round(value.y), width: round(value.width), height: round(value.height) };
		};
		const metrics = node => {
			const value = getComputedStyle(node);
			return { family: value.fontFamily.toLowerCase(), size: parseFloat(value.fontSize),
				lineHeight: parseFloat(value.lineHeight), weight: parseFloat(value.fontWeight) };
		};
		const rgb = value => (value.match(/[\\d.]+/g) || []).slice(0, 3).map(Number);
		const luminance = value => {
			const channels = rgb(value).map(channel => {
				const unit = channel / 255;
				return unit <= 0.04045 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
			});
			return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
		};
		const flat = ['.shell', '.bar', '.board-nav', '.board-group.active-group',
			'.board-nav-row-current', '.scratch-section', '.scratch-card', '.canvas-zone',
			'.pane-bar', '.agent-rail', '.claim-card', '.statusbar', '.btn-primary']
			.map(selector => document.querySelector(selector)).filter(Boolean);
		const humanLabels = [document.querySelector('.board-nav-title'),
			document.querySelector('.selection-inspector-kicker'),
			document.querySelector('.workbench-overview small')].filter(Boolean);
		open.focus();
		const focusStyle = getComputedStyle(open);
		const focusRect = open.getBoundingClientRect();
		const focusExtent = parseFloat(focusStyle.outlineWidth) + parseFloat(focusStyle.outlineOffset);
		const animationProbe = document.createElement('span');
		animationProbe.className = 'claim-beacon';
		document.body.append(animationProbe);
		const animationStyle = getComputedStyle(animationProbe);
		const shellStyle = getComputedStyle(shell);
		const actionTargets = [...document.querySelectorAll('.bar-actions .btn')].map(rect);
		const touchTargets = [...shell.querySelectorAll('button')]
			.filter(node => !node.closest('.excalidraw') && rect(node).width > 0 && rect(node).height > 0)
			.map(node => ({ label: node.getAttribute('aria-label') || node.textContent.trim().slice(0, 48),
				width: rect(node).width, height: rect(node).height }));
		const duration = name => {
			const value = shellStyle.getPropertyValue(name).trim();
			return value.endsWith('ms') ? String(Number.parseFloat(value)) + 'ms' : value;
		};
		const motion = { controlDuration: duration('--arch-duration-control'),
			statusDuration: duration('--arch-duration-status'),
			animationDuration: animationStyle.animationDuration,
			animationIterationCount: animationStyle.animationIterationCount };
		animationProbe.remove();
		const foreground = luminance(getComputedStyle(wordmark).color);
		const backdrop = luminance(getComputedStyle(bar).backgroundColor);
		const boardRect = board.getBoundingClientRect();
		const metaRect = meta.getBoundingClientRect();
		return {
			deviceScaleFactor: devicePixelRatio,
			queryTruth: { dark: matchMedia('(prefers-color-scheme: dark)').matches,
				reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
				forcedColors: matchMedia('(forced-colors: active)').matches },
			motion,
			focus: { forcedColorAdjust: focusStyle.forcedColorAdjust,
				outlineStyle: focusStyle.outlineStyle, outlineWidth: parseFloat(focusStyle.outlineWidth),
				unclipped: focusRect.left - focusExtent >= 0 && focusRect.top - focusExtent >= 0 &&
					focusRect.right + focusExtent <= innerWidth && focusRect.bottom + focusExtent <= innerHeight },
			pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth ||
				document.documentElement.scrollHeight > document.documentElement.clientHeight ||
				document.body.scrollWidth > innerWidth || document.body.scrollHeight > innerHeight,
			touchTargets,
			state: { board: board.textContent.trim(), level: level.textContent.trim(),
				connection: connection.textContent.trim(), persistence: persistence.textContent.trim(),
				pane: pane.textContent.trim(), paneCount: document.querySelectorAll('.pane-tab').length,
				shellCount: document.querySelectorAll('.shell').length,
				rootChildCount: document.getElementById('root')?.childElementCount ?? 0 },
			geometry: { shell: rect(shell), bar: rect(bar), nav: rect(document.querySelector('.board-nav')),
				canvas: rect(document.querySelector('.canvas-zone')), rail: rect(document.querySelector('.agent-rail')),
				pane: rect(document.querySelector('.pane')), board: rect(board), open: rect(open) },
			themeSnapshot: {
				theme: shell.dataset.theme, wordmark: wordmark.getAttribute('aria-label'),
				wordmarkMask: getComputedStyle(wordmark).maskImage || getComputedStyle(wordmark).webkitMaskImage,
				wordmarkSize: rect(wordmark), unexpectedBrandIconCount: document.querySelectorAll('.bar-brand svg:not(.wordmark), .brand-mark').length,
				headerHeight: bar.getBoundingClientRect().height,
				selection: shellStyle.getPropertyValue('--selection').trim().toLowerCase(),
				status: shellStyle.getPropertyValue('--status').trim().toLowerCase(), background: getComputedStyle(shell).backgroundColor,
				inkContrast: (Math.max(foreground, backdrop) + 0.05) / (Math.min(foreground, backdrop) + 0.05),
				flatSurfaces: flat.every(node => getComputedStyle(node).backgroundImage === 'none'),
				shadowlessSurfaces: flat.every(node => getComputedStyle(node).boxShadow === 'none'),
				visibleFocus: focusStyle.outlineStyle !== 'none' && parseFloat(focusStyle.outlineWidth) >= 2,
				boardIdentity: board.textContent.trim(), level: level.textContent.trim(), connectionState: connection.textContent.trim(),
				persistenceState: persistence.textContent.trim(), paneIdentity: pane.textContent.trim(),
				legacyVaultLineCount: document.querySelectorAll('.vault-name').length,
				boardLeftAligned: Math.abs(boardRect.left - metaRect.left) < 0.5,
				tokens: ['--type-kicker', '--type-tech', '--type-body', '--type-control', '--type-title', '--type-primary']
					.map(name => shellStyle.getPropertyValue(name).trim()),
				weightTokens: ['--weight-regular', '--weight-medium', '--weight-semibold', '--weight-bold']
					.map(name => shellStyle.getPropertyValue(name).trim()),
				wordmarkTracking: shellStyle.getPropertyValue('--wordmark-tracking').trim(),
				fontChecks: [document.fonts.check('400 14px "Archboard Onest"'), document.fonts.check('500 14px "Archboard Onest"'),
					document.fonts.check('600 14px "Archboard Onest"'), document.fonts.check('700 14px "Archboard Onest"'),
					document.fonts.check('400 10px "Archboard DM Mono"'), document.fonts.check('500 10px "Archboard DM Mono"')],
				fontResources: performance.getEntriesByType('resource').map(entry => entry.name)
					.filter(name => /(?:Onest-wght|DMMono-(?:Regular|Medium)).*[.]ttf/.test(name)),
				humanLabels: humanLabels.map(node => { const value = getComputedStyle(node); return {
					family: value.fontFamily.toLowerCase(), transform: value.textTransform, weight: parseFloat(value.fontWeight) }; }),
				titleType: metrics(board), bodyType: metrics(meta), kickerType: metrics(level), controlType: metrics(open), paneType: metrics(pane),
				actionTargets: actionTargets.map(({ width, height }) => ({ width, height })),
				paneTarget: (() => { const value = rect(pane); return { width: value.width, height: value.height }; })(),
				presentTarget: (() => { const value = rect(present); return { width: value.width, height: value.height }; })(),
			}
		};
	})()`);
}

export async function captureShellRenderMatrix(
	browser: AgentBrowserSession,
	repoRoot: string,
): Promise<ShellRenderMatrix> {
	const revision = Bun.spawnSync(["git", "rev-parse", "--short=12", "HEAD"], { cwd: repoRoot })
		.stdout.toString()
		.trim();
	const artifactRoot = join("/tmp", "archboard-task-144-14-shell-matrix", revision);
	mkdirSync(artifactRoot, { recursive: true });
	const cells: ShellMatrixCell[] = [];
	for (const viewport of viewports) {
		await browser.run([
			"set",
			"viewport",
			String(viewport.width),
			String(viewport.height),
			String(viewport.scale),
		]);
		for (const theme of themes) {
			for (const mode of modes) {
				const restoreMedia = await emulateMedia(browser, theme, mode);
				let value: MatrixProbe;
				const name = `${viewport.name}-${theme}-${mode}`;
				const screenshot = join(artifactRoot, `${name}.png`);
				try {
					await setTheme(browser, theme);
					await browser.eval<boolean>(
						"new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))",
					);
					value = await probe(browser);
					await browser.run(["screenshot", screenshot]);
				} finally {
					await restoreMedia();
				}
				const stateHash = sha256(stable(value.state));
				const geometryHash = sha256(
					stable({
						viewport,
						geometry: value.geometry,
						touchTargets: value.touchTargets.map(({ width, height }) => ({ width, height })),
					}),
				);
				const normalizedHash = sha256(
					stable({ viewport, theme, mode, ...value, themeSnapshot: undefined }),
				);
				cells.push({
					viewport: viewport.name,
					width: viewport.width,
					height: viewport.height,
					deviceScaleFactor: viewport.scale,
					actualDeviceScaleFactor: value.deviceScaleFactor,
					theme,
					mode,
					queryTruth: value.queryTruth,
					motion: value.motion,
					focus: value.focus,
					pageOverflow: value.pageOverflow,
					touchTargets: value.touchTargets,
					stateHash,
					geometryHash,
					normalizedHash,
					screenshot,
					screenshotSha256: sha256(readFileSync(screenshot)),
					themeSnapshot: value.themeSnapshot,
				});
			}
		}
	}
	await browser.run(["set", "viewport", "1440", "900", "1"]);
	const restoreMedia = await emulateMedia(browser, "dark", "normal");
	try {
		await setTheme(browser, "dark");
	} finally {
		await restoreMedia();
	}
	writeFileSync(
		join(artifactRoot, "metrics.json"),
		`${JSON.stringify({ revision, cells }, null, 2)}\n`,
	);
	return { revision, artifactRoot, cells };
}
