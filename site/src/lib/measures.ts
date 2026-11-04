// Measures of Archboard's own model, read on 2026-11-04 from this repository: `archboard model
// inspect <module>` for the interface counts and `archboard model locality` for a year of Git
// history (509 parts read, 2323 commits, 66 coupled pairs). A module with no parts has no
// interface, so its interface counts are empty.

export interface MeasureRow {
	name: string;
	entries: number | null;
	hidden: number | null;
	passThrough: number | null;
	callers: number | null;
	commits: number;
	changesWith: number;
	unjoined: number;
}

export const measureColumns = [
	{ key: "entries", label: "Entries", hint: "Parts that outside relationships reach" },
	{ key: "hidden", label: "Hidden", hint: "Parts that nothing outside reaches" },
	{ key: "passThrough", label: "Pass-through", hint: "Entries that only pass a call on" },
	{ key: "callers", label: "Callers", hint: "Modules outside that call in" },
	{ key: "commits", label: "Commits", hint: "Commits in the last year" },
	{ key: "changesWith", label: "Changes with", hint: "Modules that change in the same commits" },
	{ key: "unjoined", label: "Unjoined", hint: "Of those, the ones with no authored relationship" },
] as const;

export type MeasureKey = (typeof measureColumns)[number]["key"];

export const measureRows: MeasureRow[] = [
	{
		name: "renderer",
		entries: 6,
		hidden: 7,
		passThrough: 0,
		callers: 13,
		commits: 567,
		changesWith: 0,
		unjoined: 0,
	},
	{
		name: "workbench",
		entries: 10,
		hidden: 7,
		passThrough: 1,
		callers: 26,
		commits: 437,
		changesWith: 2,
		unjoined: 0,
	},
	{
		name: "Browser",
		entries: 3,
		hidden: 5,
		passThrough: 0,
		callers: 5,
		commits: 368,
		changesWith: 0,
		unjoined: 0,
	},
	{
		name: "codex-realtime-voice",
		entries: 6,
		hidden: 0,
		passThrough: 1,
		callers: 17,
		commits: 294,
		changesWith: 1,
		unjoined: 0,
	},
	{
		name: "Archboard server",
		entries: 3,
		hidden: 1,
		passThrough: 0,
		callers: 16,
		commits: 212,
		changesWith: 1,
		unjoined: 0,
	},
	{
		name: "code-intel",
		entries: 2,
		hidden: 3,
		passThrough: 0,
		callers: 4,
		commits: 177,
		changesWith: 0,
		unjoined: 0,
	},
	{
		name: "Walkthrough recording",
		entries: 4,
		hidden: 3,
		passThrough: 1,
		callers: 4,
		commits: 8,
		changesWith: 5,
		unjoined: 5,
	},
	{
		name: "Diagram surface",
		entries: null,
		hidden: null,
		passThrough: null,
		callers: null,
		commits: 24,
		changesWith: 6,
		unjoined: 2,
	},
	{
		name: "Talk contract",
		entries: null,
		hidden: null,
		passThrough: null,
		callers: null,
		commits: 11,
		changesWith: 5,
		unjoined: 3,
	},
	{
		name: "Recorder",
		entries: null,
		hidden: null,
		passThrough: null,
		callers: null,
		commits: 8,
		changesWith: 5,
		unjoined: 5,
	},
];
