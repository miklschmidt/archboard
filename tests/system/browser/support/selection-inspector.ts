import { PANE_SETTLE_CAP_MS } from "../../../../src/shared/timing/timing.ts";
import { pollUntil, type AgentBrowserSession } from "./agent-browser.ts";
import type { InspectorContract } from "./shell-contract-types.ts";

type InspectorView = { state: string | null; text: string; pane: string; title: string };

function readInspector(browser: AgentBrowserSession): Promise<InspectorView> {
	return browser.eval<InspectorView>(`(() => {
		const inspector = document.querySelector('.selection-inspector');
		return {
			state: inspector?.getAttribute('data-selection-state') ?? null,
			text: inspector?.innerText ?? '',
			pane: inspector?.getAttribute('aria-label') ?? '',
			title: inspector?.querySelector('.selection-inspector-title')?.textContent ?? ''
		};
	})()`);
}

function readInspectorContract(browser: AgentBrowserSession): Promise<InspectorContract> {
	return browser.eval<InspectorContract>(`(() => {
		const inspector = document.querySelector('.selection-inspector');
		const metrics = selector => {
			const style = getComputedStyle(inspector.querySelector(selector));
			return {
				family: style.fontFamily.toLowerCase(),
				size: parseFloat(style.fontSize),
				lineHeight: parseFloat(style.lineHeight),
				weight: parseFloat(style.fontWeight),
				transform: style.textTransform,
			};
		};
		const rgb = value => (value.match(/[\\d.]+/g) ?? []).slice(0, 3).map(Number);
		const luminance = value => {
			const [red, green, blue] = rgb(value).map(channel => {
				const normalized = channel / 255;
				return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
			});
			return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
		};
		const contrast = (foreground, background) => {
			const light = Math.max(luminance(foreground), luminance(background));
			const dark = Math.min(luminance(foreground), luminance(background));
			return (light + 0.05) / (dark + 0.05);
		};
		const background = getComputedStyle(inspector).backgroundColor;
		const kicker = inspector.querySelector('.selection-inspector-kicker');
		const label = inspector.querySelector('.selection-inspector-row dt');
		return {
			sections: [...inspector.querySelectorAll('.selection-inspector-section > h2')]
				.map(heading => heading.textContent),
			titleType: metrics('.selection-inspector-title'),
			statusType: metrics('.selection-inspector-status'),
			kickerType: metrics('.selection-inspector-kicker'),
			sectionType: metrics('.selection-inspector-section > h2'),
			labelType: metrics('.selection-inspector-row dt'),
			humanType: metrics('.selection-inspector-value-human'),
			technicalType: metrics('.selection-inspector-value-technical'),
			copyType: metrics('.path-focus-section .selection-inspector-copy'),
			controlType: metrics('.selection-inspector-focus'),
			kickerContrast: contrast(getComputedStyle(kicker).color, background),
			labelContrast: contrast(getComputedStyle(label).color, background),
			openHeight: inspector.querySelector('.selection-inspector-open').getBoundingClientRect().height,
			focusHeight: inspector.querySelector('.selection-inspector-focus').getBoundingClientRect().height
		};
	})()`);
}

function waitInspector(
	browser: AgentBrowserSession,
	state: string,
	text: string,
): Promise<InspectorView> {
	return pollUntil(
		() => readInspector(browser),
		(view) => view.state === state && view.text.includes(text),
		`${state} selection inspector state`,
		{ timeoutMs: PANE_SETTLE_CAP_MS },
	);
}

export { type InspectorView, readInspector, readInspectorContract, waitInspector };
