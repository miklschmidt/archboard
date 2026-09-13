import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve as resolvePath } from "node:path";

import { browserTestRoots, type AgentBrowserSession } from "./agent-browser.ts";
import type { ThemeSnapshot } from "./shell-contract-types.ts";
import { BOARD_BREADCRUMB, PANE_TABS, STAGE_ROOT, switchTheme } from "./shell-dom.ts";

type ShellTheme = "light" | "dark";
type MediaMode = "normal" | "reduced-motion" | "forced-colors";

type MatrixProbe = {
	deviceScaleFactor: number;
	queryTruth: { dark: boolean; reducedMotion: boolean; forcedColors: boolean };
	motion: {
		controlDuration: string;
		animationDuration: string;
		animationIterationCount: string;
	};
	focus: {
		forcedColorAdjust: string;
		outlineStyle: string;
		outlineWidth: number;
		focusVisible?: boolean;
		outline?: string;
		active?: boolean;
		ringVisible: boolean;
		unclipped: boolean;
	};
	pageOverflow: boolean;
	touchTargets: Array<{ label: string; width: number; height: number }>;
	state: Record<string, string | number>;
	geometry: Record<string, { x: number; y: number; width: number; height: number }>;
	themeSnapshot: ThemeSnapshot;
};

type ShellMatrixCell = {
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

type ShellRenderMatrix = {
	revision: string;
	artifactRoot: string;
	cells: ShellMatrixCell[];
};

const viewports = [
	{ name: "desktop", width: 1920, height: 1080, scale: 1 },
	{ name: "flip-scaled", width: 1920, height: 1080, scale: 2 },
] as const;
const themes = ["light", "dark"] as const;
const modes = ["normal", "reduced-motion", "forced-colors"] as const;

function sha256(value: string | Uint8Array): string {
	return createHash("sha256").update(value).digest("hex");
}

function stable(value: unknown): string {
	if (Array.isArray(value)) {
		return `[${value.map(stable).join(",")}]`;
	}
	if (value && typeof value === "object") {
		return `{${Object.entries(value as Record<string, unknown>)
			.toSorted(([left], [right]) => left.localeCompare(right))
			.map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
			.join(",")}}`;
	}
	return JSON.stringify(value);
}

async function emulateMedia(
	browser: AgentBrowserSession,
	theme: ShellTheme,
	mode: MediaMode,
): Promise<() => Promise<void>> {
	const currentUrl = await browser.eval<string>("location.href");
	const output = await browser.run(["get", "cdp-url"]);
	const endpoint = output.match(/ws:\/\/[^\s"']+/)?.[0];
	if (!endpoint) {
		throw new Error(`agent-browser returned no CDP endpoint: ${output.trim()}`);
	}
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
		if (message.id === undefined) {
			return;
		}
		const request = pending.get(message.id);
		if (!request) {
			return;
		}
		pending.delete(message.id);
		if (message.error) {
			request.reject(new Error(message.error.message ?? "CDP command failed"));
		} else {
			request.resolve(message.result ?? {});
		}
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
	if (!page) {
		throw new Error(`CDP browser target has no page for ${currentUrl}`);
	}
	const attached = (await command("Target.attachToTarget", {
		targetId: page.targetId,
		flatten: true,
	})) as { sessionId?: string };
	if (!attached.sessionId) {
		throw new Error("CDP did not attach to the shell page");
	}
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

/**
 * Read the shell's visual outcome: the parts by role and accessible name,
 * the new tokens, fonts, contrast, flatness, focus and target sizes.
 * @param browser The page.
 * @returns The probe.
 */
async function probe(browser: AgentBrowserSession): Promise<MatrixProbe> {
	return browser.eval<MatrixProbe>(`(() => {
		const shell = document.getElementById('root')?.firstElementChild;
		const header = document.querySelector('header');
		const wordmark = header?.querySelector('h1');
		const named = (root, name) => [...(root?.querySelectorAll('button') ?? [])]
			.find(node => (node.getAttribute('aria-label') ?? node.textContent ?? '').trim() === name) ?? null;
		// The header's one control. Nothing on the header opens a board any more:
		// a person reads what an agent has authored, and moving a pane is the
		// navigator's job (ADR 0023).
		const control = named(header, 'Settings');
		const breadcrumb = document.querySelector('${BOARD_BREADCRUMB}');
		const board = breadcrumb?.querySelector('span');
		// The variant beside the board's name, which is what the header says a
		// person is reading. There is no level here any more: a board's altitude
		// is metadata, and which of its variants is on screen is the fact that
		// changes while somebody watches (ADR 0023).
		const variant = breadcrumb?.querySelector('span.font-mono');
		const ownText = node => [...node.childNodes].filter(child => child.nodeType === 3).map(child => child.textContent).join('').trim();
		const connection = [...(header?.querySelectorAll('span') ?? [])]
			.find(node => /^(Connected|Disconnected)$/.test(ownText(node)));
		const notSaving = [...(header?.querySelectorAll('span') ?? [])]
			.find(node => /Not saving|Note written elsewhere/.test(ownText(node)));
		const pane = document.querySelector('${PANE_TABS}[aria-pressed="true"]');
		const present = document.querySelector('button[aria-label^="Present pane"]');
		const nav = document.querySelector('[data-slot="sidebar"]');
		const stages = document.querySelector('${STAGE_ROOT}');
		const dock = [...document.querySelectorAll('[data-slot="collapsible"]')]
			.find(node => node.querySelector('button[aria-label$="workbench"]'));
		const navControl = named(nav, 'Refresh boards');
		const groupLabel = nav?.querySelector('[data-sidebar="group-label"]');
		const dockTitle = [...(dock?.querySelectorAll('span') ?? [])]
			.find(node => node.textContent.trim() === 'Agent workbench');
		if (!shell || !header || !wordmark || !control || !board || !variant || !connection || !pane ||
			!present || !nav || !stages || !dock || !navControl || !groupLabel || !dockTitle) {
			throw new Error('shell matrix probe is incomplete: ' + JSON.stringify({
				shell: !!shell, header: !!header, wordmark: !!wordmark, control: !!control, board: !!board,
				variant: !!variant, connection: !!connection, pane: !!pane, present: !!present, nav: !!nav,
				stages: !!stages, dock: !!dock, navControl: !!navControl, groupLabel: !!groupLabel,
				dockTitle: !!dockTitle }));
		}
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
		const colorContext = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
		const rgb = value => { colorContext.clearRect(0, 0, 1, 1); colorContext.fillStyle = value;
			colorContext.fillRect(0, 0, 1, 1); return [...colorContext.getImageData(0, 0, 1, 1).data].slice(0, 3); };
		const hairline = shadow => shadow === 'none' || shadow.split(/\\),\\s*/).every(part =>
			(part.replace(/(rgba?|oklch|color)\\([^)]*\\)/g, '').match(/-?[\\d.]+px/g) ?? []).slice(0, 3).every(px => parseFloat(px) === 0));
		const luminance = value => {
			const channels = rgb(value).map(channel => {
				const unit = channel / 255;
				return unit <= 0.04045 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
			});
			return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
		};
		const flat = [shell, header, nav, stages, dock, navControl, pane];
		// Human labels: the board group's name and the header's board name. The
		// section label beside them is a kicker, checked on its own terms.
		const groupName = [...nav.querySelectorAll('[role="treeitem"][aria-level="1"] span')]
			.find(node => node.textContent.trim() === board.textContent.trim());
		if (!groupName) throw new Error('shell matrix probe found no board-group name');
		const paneSection = document.querySelector('section[aria-label^="Pane "]');
		if (!paneSection) {
			throw new Error('shell matrix probe found no pane section on screen');
		}
		const humanLabels = [groupName, board];
		control.focus();
		const focusStyle = getComputedStyle(control);
		const focusRect = control.getBoundingClientRect();
		const ringVisible = focusStyle.boxShadow !== 'none' || (focusStyle.outlineStyle !== 'none' && parseFloat(focusStyle.outlineWidth) >= 1);
		const focusExtent = Math.max(parseFloat(focusStyle.outlineWidth) + parseFloat(focusStyle.outlineOffset), 3);
		const animationProbe = document.createElement('span');
		animationProbe.className = 'animate-pulse';
		document.body.append(animationProbe);
		const animationStyle = getComputedStyle(animationProbe);
		const rootStyle = getComputedStyle(document.documentElement);
		// Every control the header actually offers. The drawing controls it used to
		// name are gone: a person reads a board and does not author one (ADR 0023),
		// so the list is read off the header rather than written down here, and an
		// empty header is a failure rather than a vacuous pass.
		const actionTargets = [...header.querySelectorAll('button')].map(node => rect(node));
		if (actionTargets.length === 0) {
			throw new Error('shell matrix probe found no header controls');
		}
		const touchTargets = [...shell.querySelectorAll('button')]
			.filter(node => !node.closest('.excalidraw') && rect(node).width > 0 && rect(node).height > 0)
			.map(node => ({ label: node.getAttribute('aria-label') || node.textContent.trim().slice(0, 48),
				width: rect(node).width, height: rect(node).height }));
		const motion = { controlDuration: focusStyle.transitionDuration,
			animationDuration: animationStyle.animationDuration,
			animationIterationCount: animationStyle.animationIterationCount };
		animationProbe.remove();
		const foreground = luminance(getComputedStyle(wordmark).color);
		const backdrop = luminance(getComputedStyle(header).backgroundColor);
		const boardRect = board.getBoundingClientRect();
		const metaRect = connection.getBoundingClientRect();
		return {
			deviceScaleFactor: devicePixelRatio,
			queryTruth: { dark: matchMedia('(prefers-color-scheme: dark)').matches,
				reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
				forcedColors: matchMedia('(forced-colors: active)').matches },
			motion,
			focus: { forcedColorAdjust: focusStyle.forcedColorAdjust,
				outlineStyle: focusStyle.outlineStyle, outlineWidth: parseFloat(focusStyle.outlineWidth),
				focusVisible: control.matches(':focus-visible'), outline: focusStyle.outline, active: document.activeElement === control,
				ringVisible,
				unclipped: focusRect.left - focusExtent >= 0 && focusRect.top - focusExtent >= 0 &&
					focusRect.right + focusExtent <= innerWidth && focusRect.bottom + focusExtent <= innerHeight },
			pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth ||
				document.documentElement.scrollHeight > document.documentElement.clientHeight ||
				document.body.scrollWidth > innerWidth || document.body.scrollHeight > innerHeight,
			touchTargets,
			state: { board: board.textContent.trim(), variant: variant.textContent.trim(),
				connection: connection.textContent.trim(), persistence: notSaving?.textContent.trim() ?? '',
				pane: pane.textContent.trim(), paneCount: document.querySelectorAll('${PANE_TABS}').length,
				rootChildCount: document.getElementById('root')?.childElementCount ?? 0 },
			geometry: { shell: rect(shell), header: rect(header), nav: rect(nav), stages: rect(stages),
				dock: rect(dock), pane: rect(paneSection),
				board: rect(board), control: rect(control) },
			themeSnapshot: {
				theme: document.documentElement.dataset.theme, wordmark: wordmark.textContent.trim(),
				wordmarkMask: getComputedStyle(wordmark).maskImage || getComputedStyle(wordmark).webkitMaskImage,
				wordmarkSize: rect(wordmark), unexpectedBrandIconCount: wordmark.querySelectorAll('svg, img').length,
				headerHeight: header.getBoundingClientRect().height,
				selection: rootStyle.getPropertyValue('--primary').trim().toLowerCase(),
				status: rootStyle.getPropertyValue('--status').trim().toLowerCase(), background: getComputedStyle(shell).backgroundColor,
				inkContrast: (Math.max(foreground, backdrop) + 0.05) / (Math.min(foreground, backdrop) + 0.05),
				flatSurfaces: flat.every(node => getComputedStyle(node).backgroundImage === 'none'),
				shadowlessSurfaces: flat.every(node => hairline(getComputedStyle(node).boxShadow)),
				visibleFocus: ringVisible,
				boardIdentity: board.textContent.trim(), variant: variant.textContent.trim(), connectionState: connection.textContent.trim(),
				persistenceState: notSaving?.textContent.trim() ?? '', paneIdentity: pane.textContent.trim(),
				legacyVaultLineCount: 0,
				headerSectionsAligned: boardRect.right < metaRect.left && Math.abs((boardRect.top + boardRect.height / 2) - (metaRect.top + metaRect.height / 2)) < 0.5,
				tokens: [], weightTokens: [],
				wordmarkTracking: rootStyle.getPropertyValue('--tracking-wordmark').trim(),
				fontChecks: [document.fonts.check('400 14px "Archboard Onest"'), document.fonts.check('500 14px "Archboard Onest"'),
					document.fonts.check('600 14px "Archboard Onest"'), document.fonts.check('700 14px "Archboard Onest"'),
					document.fonts.check('400 10px "Archboard DM Mono"'), document.fonts.check('500 10px "Archboard DM Mono"')],
				fontResources: performance.getEntriesByType('resource').map(entry => entry.name)
					.filter(name => /(?:Onest-wght|DMMono-(?:Regular|Medium)).*[.]ttf/.test(name))
					.filter(name => !name.includes('/assets/diagram-fonts/')),
				// The faces the drawn board registers, which are the same files the
				// server measured its text against. Served from here, never from a
				// font CDN: a picture whose text was measured in one face and drawn
				// in another has boxes that do not fit their words.
				diagramFontResources: performance.getEntriesByType('resource').map(entry => entry.name)
					.filter(name => name.includes('/assets/diagram-fonts/')),
				humanLabels: humanLabels.map(node => { const value = getComputedStyle(node); return {
					family: value.fontFamily.toLowerCase(), transform: value.textTransform, weight: parseFloat(value.fontWeight) }; }),
				sectionKicker: { ...metrics(groupLabel), transform: getComputedStyle(groupLabel).textTransform },
				titleType: metrics(board), bodyType: metrics(connection), kickerType: metrics(variant), controlType: metrics(control), paneType: metrics(pane),
				actionTargets: actionTargets.map(({ width, height }) => ({ width, height })),
				paneTarget: (() => { const value = rect(pane); return { width: value.width, height: value.height }; })(),
				presentTarget: (() => { const value = rect(present); return { width: value.width, height: value.height }; })(),
			}
		};
	})()`);
}

/**
 * The short git revision of the checkout under test.
 * @returns Twelve hex characters.
 */
function currentRevision(): string {
	return Bun.spawnSync(["git", "rev-parse", "--short=12", "HEAD"], {
		cwd: resolvePath(import.meta.dir, "../../../.."),
	})
		.stdout.toString()
		.trim();
}

/**
 * Where rendered evidence goes: beside the lane root, in the runner's
 * temporary directory, so it outlives the lane's own cleanup.
 * @param revision The short git revision.
 * @returns The directory, created.
 */
function evidenceRoot(revision: string = currentRevision()): string {
	const root = join(dirname(browserTestRoots().laneRoot), "archboard-shell-matrix", revision);
	mkdirSync(root, { recursive: true });
	return root;
}

async function captureShellRenderMatrix(
	browser: AgentBrowserSession,
	repoRoot: string,
): Promise<ShellRenderMatrix> {
	const revision = Bun.spawnSync(["git", "rev-parse", "--short=12", "HEAD"], { cwd: repoRoot })
		.stdout.toString()
		.trim();
	const artifactRoot = evidenceRoot(revision);
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
					await switchTheme(browser, theme);
					// The default shell has no technical footer. Check its declared
					// technical face after viewport changes recreate the page context.
					await browser.eval<boolean>(
						`document.fonts.load('400 10px "Archboard DM Mono"').then(() => document.fonts.load('500 10px "Archboard DM Mono"')).then(() => document.fonts.ready).then(() => true)`,
					);
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
	await browser.run(["set", "viewport", "1920", "1080", "1"]);
	const restoreMedia = await emulateMedia(browser, "dark", "normal");
	try {
		await switchTheme(browser, "dark");
	} finally {
		await restoreMedia();
	}
	writeFileSync(
		join(artifactRoot, "metrics.json"),
		`${JSON.stringify({ revision, cells }, null, 2)}\n`,
	);
	return { revision, artifactRoot, cells };
}

export {
	type ShellMatrixCell,
	type ShellRenderMatrix,
	emulateMedia,
	evidenceRoot,
	captureShellRenderMatrix,
};
