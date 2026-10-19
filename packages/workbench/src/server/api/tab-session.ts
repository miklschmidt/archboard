// The tab session id that a pane socket names, and the key that links a tab session to the workhorse of one checkout. Bun only.
export {
	parseTabSessionId,
	parseWorkhorseLinkKey,
	workhorseLinkKey,
} from "#server/rules/tab-session/tab-session.ts";
export type { TabSessionId } from "#server/rules/tab-session/tab-session.ts";
