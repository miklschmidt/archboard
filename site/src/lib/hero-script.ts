// What the agent does in the hero, line by line. The commands and their options are the real
// CLI's; the replies summarize its JSON answers for the example shop (8 root modules and 8
// relationships, as the drawing's own label says). `at` is when a line starts, in milliseconds.

export type LineKind = "you" | "command" | "reply";

export interface DockLine {
	kind: LineKind;
	text: string;
	at: number;
	/** What the picture does when this line has been typed. */
	cue?: "claim" | "cards" | "lines" | "release" | "show";
}

export const heroScript: DockLine[] = [
	{
		kind: "you",
		text: "Map this repository: its modules, what contains what, and how they talk.",
		at: 300,
	},
	{ kind: "command", text: "archboard model claim --input claim.json", at: 1500, cue: "claim" },
	{ kind: "reply", text: "Claimed Shop for codex: mapping the shop", at: 2300 },
	{
		kind: "command",
		text: 'archboard model edit --input map.json --doing "mapping the shop"',
		at: 2700,
		cue: "cards",
	},
	{
		kind: "reply",
		text: "8 modules and 8 relationships, at one new revision",
		at: 4300,
		cue: "lines",
	},
	{
		kind: "command",
		text: "archboard model release --input release.json",
		at: 6100,
		cue: "release",
	},
	{ kind: "command", text: "archboard browser show Shop", at: 6900, cue: "show" },
];
