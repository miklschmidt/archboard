import { PANE_SETTLE_CAP_MS } from "../../../../src/shared/timing/timing.ts";
import { pollUntil, type AgentBrowserSession } from "./agent-browser.ts";
import type { InspectorContract } from "./shell-contract-types.ts";
import { INSPECTOR } from "./shell-dom.ts";

/**
 * The inspector as a person reads it: which kind of selection it shows,
 * derived from the words on it, its text, and its title.
 */
type InspectorView = { state: string | null; text: string; pane: string; title: string };

/**
 * The selection kind the inspector presents, from what it shows rather than
 * an attribute: a title and a binding section for one element, a count for
 * many, the missing line, or nothing at all.
 */
const INSPECTOR_VIEW = `(() => {
	const inspector = document.querySelector('${INSPECTOR}');
	if (!inspector) return { state: null, text: '', pane: '', title: '' };
	const text = inspector.innerText;
	const title = inspector.querySelector('h2')?.textContent?.trim() ?? '';
	const active = document.querySelector('section[aria-label^="Pane "][aria-current="true"]')?.getAttribute('aria-label') ?? '';
	const state = /elements selected\\./.test(text) ? 'multiple'
		: /is no longer on the board/.test(text) ? 'missing'
		: /The binding cannot be read/.test(text) ? 'malformed'
		: /Not bound to code/.test(text) ? 'unbound'
		: /bound repository/i.test(text) && /\\brepo\\b/.test(text) ? 'bound'
		: 'empty';
	return { state, text, pane: active, title };
})()`;

function readInspector(browser: AgentBrowserSession): Promise<InspectorView> {
	return browser.eval<InspectorView>(INSPECTOR_VIEW);
}

/**
 * The inspector's type and contrast outcomes: human words in the sans face,
 * technical values in the mono face, readable section labels, and controls
 * of usable size. Read by role and words, never by class.
 * @param browser The page.
 * @returns The contract.
 */
function readInspectorContract(browser: AgentBrowserSession): Promise<InspectorContract> {
	return browser.eval<InspectorContract>(`(() => {
		const inspector = document.querySelector('${INSPECTOR}');
		const metricsOf = node => {
			const style = getComputedStyle(node);
			return {
				family: style.fontFamily.toLowerCase(),
				size: parseFloat(style.fontSize),
				lineHeight: parseFloat(style.lineHeight),
				weight: parseFloat(style.fontWeight),
				transform: style.textTransform,
			};
		};
		const colorContext = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
		const rgb = value => { colorContext.clearRect(0, 0, 1, 1); colorContext.fillStyle = value;
			colorContext.fillRect(0, 0, 1, 1); return [...colorContext.getImageData(0, 0, 1, 1).data].slice(0, 3); };
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
		const headings = [...inspector.querySelectorAll('h3')];
		const kicker = headings[0];
		const label = inspector.querySelector('dl dt');
		const human = [...inspector.querySelectorAll('dl dd')].find(node => !node.classList.contains('font-mono'));
		const technical = inspector.querySelector('dl dd.font-mono');
		const copy = [...inspector.querySelectorAll('p')].at(-1) ?? human ?? label;
		const named = name => [...inspector.querySelectorAll('button')].find(node => node.textContent.trim() === name);
		const control = named('Focus path') ?? named('Exit focus');
		const open = named('Open code');
		return {
			sections: headings.map(heading => heading.textContent.trim()),
			titleType: metricsOf(inspector.querySelector('h2')),
			statusType: metricsOf(inspector.querySelector('h2 + span') ?? inspector.querySelector('h2')),
			kickerType: metricsOf(kicker),
			sectionType: metricsOf(headings[1] ?? kicker),
			labelType: metricsOf(label),
			humanType: metricsOf(human ?? label),
			technicalType: metricsOf(technical),
			copyType: metricsOf(copy),
			controlType: metricsOf(control),
			kickerContrast: contrast(getComputedStyle(kicker).color, background),
			labelContrast: contrast(getComputedStyle(label).color, background),
			openHeight: open?.getBoundingClientRect().height ?? 0,
			focusHeight: control?.getBoundingClientRect().height ?? 0,
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
