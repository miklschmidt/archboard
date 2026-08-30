export type TypeMetric = [family: string, size: number, lineHeight: number, weight: number];

export interface WorkbenchTechnicalContrast {
	background: string;
	color: string;
	ratio: number;
	selector: string;
	size: number;
}

export interface WorkbenchMetrics {
	agentTileCount: number;
	beacon: string | null;
	bodyHeight: number;
	claimCopyType: TypeMetric | null;
	claimReasonType: TypeMetric | null;
	claimStatusType: TypeMetric | null;
	currentRatio: number;
	currentType: TypeMetric | null;
	focusHierarchy: string[];
	hierarchy: string[];
	historyRatio: number;
	historyRowHeight: number | null;
	historyRowMinHeight: number | null;
	historyTextType: TypeMetric | null;
	summaryHeight: number;
	summaryHierarchy: string[];
	summaryValuesSingleLine: boolean;
	takeBackHeight: number | null;
	takeBackType: TypeMetric | null;
	technicalContrast: WorkbenchTechnicalContrast[];
	sectionTitleType: TypeMetric | null;
	theme: string | null;
	timeColumnWidth: number | null;
	timeNoWrap: boolean | null;
	timeType: TypeMetric | null;
}

export interface WorkbenchSnapshot {
	bar: string | null;
	beacon: string | null;
	copy: string | null;
	heading: string | null;
	holder: string | null;
	live: string | null;
	pane: string | null;
	reason: string | null;
	state: string | null;
	steps: string[];
	take: string | null;
	what: string | null;
	workbench: WorkbenchMetrics | null;
}

export const WORKBENCH_SNAPSHOT_EXPRESSION = `(() => {
	const what = document.querySelector(".pane-claim-what");
	const workbench = document.querySelector(".agent-workbench");
	const summary = document.querySelector(".workbench-summary");
	const body = document.querySelector(".workbench-body");
	const history = document.querySelector(".workbench-history");
	const focus = document.querySelector(".workbench-focus");
	const current = document.querySelector(".workbench-current");
	const claimPanel = document.querySelector(".workbench-claim");
	const type = node => {
		if (!node) return null;
		const style = getComputedStyle(node);
		return [style.fontFamily.toLowerCase(), parseFloat(style.fontSize),
			parseFloat(style.lineHeight), parseFloat(style.fontWeight)];
	};
	const channels = value => (value.match(/[\\d.]+/g) || []).map(Number);
	const luminance = value => {
		const rgb = channels(value).slice(0, 3).map(channel => {
			const unit = channel / 255;
			return unit <= 0.04045 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
		});
		return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
	};
	const backgroundFor = node => {
		for (let current = node; current; current = current.parentElement) {
			const color = getComputedStyle(current).backgroundColor;
			const rgba = channels(color);
			if ((rgba[3] ?? 1) > 0) return color;
		}
		return "rgb(255, 255, 255)";
	};
	const technicalContrast = [
		".workbench-overview small",
		".workbench-section-title",
		".activity-header h2",
		".workbench-current time",
		".activity-time",
	].flatMap(selector => {
		const node = [...document.querySelectorAll(selector)]
			.find(candidate => candidate.getClientRects().length > 0);
		if (!node) return [];
		const style = getComputedStyle(node);
		const color = style.color;
		const background = backgroundFor(node);
		const foregroundLuminance = luminance(color);
		const backgroundLuminance = luminance(background);
		return [{
				background,
				color,
				ratio: (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
					(Math.min(foregroundLuminance, backgroundLuminance) + 0.05),
				selector,
				size: parseFloat(style.fontSize),
			}];
	});
	const bodyRect = body?.getBoundingClientRect();
	const historyRect = history?.getBoundingClientRect();
	const focusRect = focus?.getBoundingClientRect();
	const currentRect = current?.getBoundingClientRect();
	const activityLine = document.querySelector(".activity-line");
	const activityTime = document.querySelector(".activity-time");
	const takeBack = document.querySelector(".take-back");
	const summaryValues = [...document.querySelectorAll(
		".live-badge > span, .workbench-claim-summary > span:last-child, .doing-now, .workbench-pane > span"
	)];
	return {
		beacon: document.querySelector(".claim-beacon span")?.textContent?.trim() ?? null,
		holder: document.querySelector(".claim-kicker")?.textContent?.trim() ?? null,
		live: document.querySelector(".workbench-overview")?.getAttribute("aria-live") ?? null,
		pane: document.querySelector(".workbench-pane > span")?.textContent?.trim() ?? null,
		heading: what?.querySelector("small")?.textContent?.trim() ?? null,
		reason: what?.lastChild?.textContent?.trim() ?? null,
		copy: document.querySelector(".claim-copy")?.textContent?.replace(/\\s+/g, " ").trim() ?? null,
		take: document.querySelector(".pane-claim-take")?.textContent?.trim() ?? null,
		state: workbench?.getAttribute("data-state") ?? null,
		steps: [...document.querySelectorAll(".pane-doing-text")]
			.map(line => line.textContent?.trim() ?? ""),
		bar: document.querySelector(".doing-now")?.textContent?.trim() ?? null,
		what: what?.textContent?.replace(/\\s+/g, " ").trim() ?? null,
		workbench: workbench && summary && body && history && focus && current && claimPanel &&
			bodyRect && historyRect && focusRect && currentRect ? {
			agentTileCount: document.querySelectorAll(".agent-avatar").length,
			beacon: document.querySelector(".claim-beacon")
				? getComputedStyle(document.querySelector(".claim-beacon")).backgroundColor
				: null,
			bodyHeight: bodyRect.height,
			claimCopyType: type(document.querySelector(".claim-copy")),
			claimReasonType: type(document.querySelector(".claim-title")),
			claimStatusType: type(document.querySelector(".claim-kicker")),
			currentRatio: currentRect.width / focusRect.width,
			currentType: type(document.querySelector(".workbench-current strong")),
			focusHierarchy: [...focus.children].map(node => node.classList[0] ?? ""),
			hierarchy: [...body.children].map(node => node.classList[0] ?? ""),
			historyRatio: historyRect.width / bodyRect.width,
			historyRowHeight: activityLine?.getBoundingClientRect().height ?? null,
			historyRowMinHeight: activityLine
				? parseFloat(getComputedStyle(activityLine).minHeight)
				: null,
			historyTextType: type(document.querySelector(".activity-text")),
			summaryHeight: summary.getBoundingClientRect().height,
			summaryHierarchy: [...document.querySelector(".workbench-overview").children]
				.map(node => node.classList[0] ?? ""),
			summaryValuesSingleLine: summaryValues.every(node => {
				const style = getComputedStyle(node);
				return node.getBoundingClientRect().height <= parseFloat(style.lineHeight) + 0.5;
			}),
			takeBackHeight: takeBack?.getBoundingClientRect().height ?? null,
			takeBackType: type(takeBack),
			technicalContrast,
			sectionTitleType: type(document.querySelector(".workbench-section-title")),
			theme: workbench.closest(".shell")?.getAttribute("data-theme") ?? null,
			timeColumnWidth: activityTime?.getBoundingClientRect().width ?? null,
			timeNoWrap: activityTime ? getComputedStyle(activityTime).whiteSpace === "nowrap" : null,
			timeType: type(activityTime),
		} : null,
	};
})()`;
