// A conversation with the Codex voice about the example shop, line by line. The voice model
// listens and speaks in real time. It hands the question to the coordinator, a fast Codex thread
// that works in no checkout, so it passes -C. The coordinator reads the architecture, gives
// sustained work to the workhorse, a full Codex thread in the shop's checkout, and decides what
// the voice says. The commands and their options are the real CLI's; the replies summarize its
// answers for the example shop, whose code is example data.

export type Thread = "coordinator" | "workhorse";

export type TalkLine =
	/** Words said aloud: by you, or by the voice. */
	| { kind: "said"; who: "you" | "voice"; text: string }
	/** What a thread runs and what it reads back. */
	| { kind: "command" | "reply"; thread: Thread; text: string }
	/** Words that pass between the voice, the coordinator and the workhorse. */
	| { kind: "relay"; thread: Thread; from: string; text: string };

export const talkScript: TalkLine[] = [
	{ kind: "said", who: "you", text: "Why is checkout taking so long to respond?" },
	{
		kind: "relay",
		thread: "coordinator",
		from: "From voice",
		text: "Why is checkout taking so long to respond?",
	},
	{ kind: "command", thread: "coordinator", text: "archboard model read -C ~/shop" },
	{
		kind: "reply",
		thread: "coordinator",
		text: "Place an order: reserve stock, charge card, save order, send receipt",
	},
	{
		kind: "said",
		who: "voice",
		text: "Checkout blocks on four calls in sequence: reserving stock, charging the card, saving the order, and waiting on the receipt email.",
	},
	{
		kind: "said",
		who: "you",
		text: "Draft a proposal that returns once payment starts and queues the rest.",
	},
	{ kind: "said", who: "voice", text: "Handing that to the workhorse to draft." },
	{
		kind: "relay",
		thread: "coordinator",
		from: "To workhorse",
		text: "Draft a proposal: return from checkout once payment starts, and move stock reservation and receipts to a worker.",
	},
	{ kind: "command", thread: "workhorse", text: 'rg -n "payments.charge" services/checkout' },
	{
		kind: "reply",
		thread: "workhorse",
		text: "services/checkout/src/place-order.ts:44: await payments.charge(order.card)",
	},
	{ kind: "command", thread: "workhorse", text: "archboard model claim --input claim.json" },
	{
		kind: "reply",
		thread: "workhorse",
		text: "Claimed Checkout API for codex: drafting queued fulfilment",
	},
	{
		kind: "command",
		thread: "workhorse",
		text: 'archboard model edit --input queued.json --doing "drafting queued fulfilment"',
	},
	{ kind: "reply", thread: "workhorse", text: "Saved proposal Queued fulfilment" },
	{
		kind: "command",
		thread: "workhorse",
		text: 'archboard model compare --state "Queued fulfilment"',
	},
	{ kind: "reply", thread: "workhorse", text: "23 added · 14 removed · 10 changed" },
	{ kind: "command", thread: "workhorse", text: "archboard model release --input release.json" },
	{
		kind: "relay",
		thread: "coordinator",
		from: "From workhorse",
		text: "Queued fulfilment is ready.",
	},
	{
		kind: "command",
		thread: "coordinator",
		text: 'archboard browser show Shop --state "Queued fulfilment" -C ~/shop',
	},
	{
		kind: "said",
		who: "voice",
		text: "Queued fulfilment is up. Checkout now returns as soon as payment starts, and a fulfilment worker handles stock reservation and the receipt.",
	},
];
