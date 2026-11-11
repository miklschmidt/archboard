import { createHash } from "node:crypto";

import type { AgentBrowserSession } from "./agent-browser.ts";
import type { ThemeSnapshot } from "./shell-contract-types.ts";
import {
	AGENT_DOCK,
	BRAND_BAR,
	NAVIGATOR,
	NAVIGATOR_COLUMN,
	PANE_HEADER,
	PANE_LETTERS,
	PANE_SECTIONS,
	STAGE_ROOT,
	switchTheme,
} from "./shell-dom.ts";

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
	/** The shell's measured rectangles, so an owner can hold them to the shared shell geometry. */
	geometry: MatrixProbe["geometry"];
	geometryHash: string;
	themeSnapshot: ThemeSnapshot;
};

type ShellRenderMatrix = {
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
 * Read the shell's visual outcome: the parts by role, accessible name and
 * data-slot hook, the tokens, fonts, contrast, flatness, focus and target sizes.
 * @param browser The page.
 * @returns The probe.
 */
async function probe(browser: AgentBrowserSession): Promise<MatrixProbe> {
	return browser.eval<MatrixProbe>(`(async () => {
		// Every declared face, loaded here rather than checked. A change of the
		// emulated media replaces the page's CSS font faces with new, unloaded
		// ones, and one that no text uses stays unloaded until asked for.
		const faces = [...document.fonts];
		const fontsLoaded = faces.length > 0 && (await Promise.all(
			faces.map(face => face.load().then(() => true, () => false)))).every(Boolean);
		const shell = document.getElementById('root')?.firstElementChild;
		// The navigator's top row: the brand and the application's own controls.
		const header = document.querySelector('${BRAND_BAR}');
		const wordmark = header?.querySelector('h1 > span[aria-hidden="true"]');
		const named = (root, name) => [...(root?.querySelectorAll('button') ?? [])]
			.find(node => (node.getAttribute('aria-label') ?? node.textContent ?? '').trim() === name) ?? null;
		// The settings. Nothing in the brand bar opens a model: a person reads
		// what an agent has authored, and moving a pane is the navigator's job
		// (ADR 0023).
		const control = named(header, 'Settings');
		const panes = [...document.querySelectorAll('${PANE_SECTIONS}')];
		const pane = panes.find(node => node.getAttribute('aria-current') === 'true');
		// The pane's own top row, level with the brand bar: where the model sits,
		// the ways to read it and the pane's controls.
		const paneHeader = pane?.querySelector('${PANE_HEADER}');
		const modelCrumb = paneHeader?.querySelector('[data-slot="model-breadcrumbs"] button');
		// Which variant is on screen, named after the model: the fact that
		// changes while somebody watches (ADR 0023).
		const variant = paneHeader?.querySelector('[data-slot="model-reading-selector"]');
		const present = paneHeader?.querySelector('button[aria-label^="Present"]');
		const column = document.querySelector('${NAVIGATOR_COLUMN}');
		const nav = document.querySelector('${NAVIGATOR}');
		// A technical token in the mono face: the count on the head of a section of the left column.
		const technical = nav?.querySelector('[data-slot="section-count"]');
		const stages = document.querySelector('${STAGE_ROOT}');
		const bar = document.querySelector('${AGENT_DOCK}');
		// The switcher names the repository of the focused pane, a human label beside the header's.
		const selectedModel = nav?.querySelector('[data-slot="repository-switcher"]');
		// The pane's window on the picture: the room the camera fits a drawing into.
		const picture = pane?.querySelector('[data-slot="model-diagram"]');
		const panel = pane?.querySelector('[data-slot="model-panel"]');
		if (!shell || !header || !wordmark || !control || !paneHeader || !modelCrumb || !variant || !technical ||
			!present || !column || !nav || !stages || !bar || !pane || !selectedModel ||
			!picture || !panel) {
			throw new Error('shell matrix probe is incomplete: ' + JSON.stringify({
				shell: !!shell, header: !!header, wordmark: !!wordmark, control: !!control,
				paneHeader: !!paneHeader, modelCrumb: !!modelCrumb, variant: !!variant, technical: !!technical,
				present: !!present, column: !!column, nav: !!nav, stages: !!stages, bar: !!bar,
				pane: !!pane, selectedModel: !!selectedModel,
				picture: !!picture, panel: !!panel }));
		}
		const round = value => Math.round(value * 1000) / 1000;
		const rect = node => {
			const value = node.getBoundingClientRect();
			return { x: round(value.x), y: round(value.y), width: round(value.width), height: round(value.height) };
		};
		const colorContext = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
		const rgb = value => { colorContext.clearRect(0, 0, 1, 1); colorContext.fillStyle = value;
			colorContext.fillRect(0, 0, 1, 1); return [...colorContext.getImageData(0, 0, 1, 1).data].slice(0, 3); };
		const luminance = value => {
			const channels = rgb(value).map(channel => {
				const unit = channel / 255;
				return unit <= 0.04045 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
			});
			return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
		};
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
		// Every control the two top rows actually offer, read off them rather
		// than written down here; no control is a failure, not a vacuous pass.
		const actionTargets = [...header.querySelectorAll('button'), ...paneHeader.querySelectorAll('button')]
			.map(node => rect(node));
		if (actionTargets.length === 0) {
			throw new Error('shell matrix probe found no header controls');
		}
		const touchTargets = [...shell.querySelectorAll('button')]
			.filter(node => node.checkVisibility() && rect(node).width > 0 && rect(node).height > 0)
			.map(node => ({ label: node.getAttribute('aria-label') || node.textContent.trim().slice(0, 48),
				width: rect(node).width, height: rect(node).height }));
		const motion = { controlDuration: focusStyle.transitionDuration,
			animationDuration: animationStyle.animationDuration,
			animationIterationCount: animationStyle.animationIterationCount };
		animationProbe.remove();
		// The surface a node is drawn on: its own fill, else the nearest one under it.
		const surface = node => {
			for (let at = node; at; at = at.parentElement) {
				const fill = getComputedStyle(at).backgroundColor;
				if (fill !== 'transparent' && !/^rgba\\(.*,\\s*0\\)$/.test(fill)) return fill;
			}
			return getComputedStyle(document.body).backgroundColor;
		};
		const foreground = luminance(getComputedStyle(wordmark).color);
		const backdrop = luminance(surface(header));
		// A live socket is the normal state and says nothing: the pane header's
		// only visible output is the reconnecting warning.
		const connectionTrouble = [...paneHeader.querySelectorAll('output')]
			.filter(node => !node.classList.contains('sr-only')).length;
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
			state: { modelCrumb: modelCrumb.textContent.trim(), variant: variant.textContent.trim(),
				technical: technical.textContent.trim(), connectionTrouble, pane: pane.getAttribute('aria-label'),
				paneCount: panes.length, paneLetterCount: document.querySelectorAll('${PANE_LETTERS}').length,
				rootChildCount: document.getElementById('root')?.childElementCount ?? 0 },
			geometry: { shell: rect(shell), header: rect(header), paneHeader: rect(paneHeader), column: rect(column),
				nav: rect(nav), stages: rect(stages), bar: rect(bar), pane: rect(pane), picture: rect(picture),
				panel: rect(panel), modelCrumb: rect(modelCrumb), control: rect(control) },
			themeSnapshot: {
				theme: document.documentElement.dataset.theme, wordmark: wordmark.textContent.trim(),
				status: rootStyle.getPropertyValue('--status').trim().toLowerCase(), background: getComputedStyle(shell).backgroundColor,
				inkContrast: (Math.max(foreground, backdrop) + 0.05) / (Math.min(foreground, backdrop) + 0.05),
				visibleFocus: ringVisible,
				modelIdentity: modelCrumb.textContent.trim(), stateName: variant.textContent.trim(),
				selectedRepository: selectedModel.getAttribute('title'),
				focusedPaneCount: panes.filter(node => node.getAttribute('aria-current') === 'true').length,
				connectionTrouble,
				fontsLoaded,
				fontResources: performance.getEntriesByType('resource').map(entry => entry.name)
					.filter(name => /[.](?:ttf|otf|woff2?)(?:[?#]|$)/.test(name)),
				actionTargets: actionTargets.map(({ width, height }) => ({ width, height })),
				presentTarget: (() => { const value = rect(present); return { width: value.width, height: value.height }; })(),
			}
		};
	})()`);
}

async function captureShellRenderMatrix(browser: AgentBrowserSession): Promise<ShellRenderMatrix> {
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
				try {
					await switchTheme(browser, theme);
					// The sizes the probe reads are those of the loaded faces.
					await browser.eval<boolean>("document.fonts.ready.then(() => true)");
					await browser.eval<boolean>(
						"new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))",
					);
					value = await probe(browser);
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
					geometry: value.geometry,
					geometryHash,
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
	return { cells };
}

export { type ShellMatrixCell, type ShellRenderMatrix, emulateMedia, captureShellRenderMatrix };
