// "How an order is placed today", the example shop's walkthrough: each beat's title and words,
// and what it selects, from examples/web-shop/walkthroughs/Shop/MKhTEYqf/vMHQ5pQb.walkthrough.json.
// The second beat reads the order as a sequence.

export interface Beat {
	title: string;
	narrative: string;
	grammar: "architecture" | "sequence";
	selection: string[];
}

export const walkthrough = {
	name: "How an order is placed today",
	beats: [
		{
			title: "The shopper waits for everything",
			narrative:
				"When a shopper hits Pay, Storefront sends POST /orders to Place order and blocks until it returns. Place order loads and prices the basket, then runs four synchronous calls in a row: reserve stock with Inventory service, charge the card with Payment provider, write the paid order to Orders DB, and send the receipt through Email provider. The confirmation page stays blocked until the last call finishes.",
			grammar: "architecture",
			selection: ["Shop/MKhTEYqf#kZjjfq1m", "Shop/MKhTEYqf#LrbGsGwG"],
		},
		{
			title: "Stock is held while the card is charged",
			narrative:
				"Place order reserves stock with Inventory service before calling Payment provider. While the card charge is in flight, those items are already taken off the shelf so no other shopper can buy them. If the payment stalls, inventory stays locked until Timeout guard hits 10 seconds and cancels the order.",
			grammar: "sequence",
			selection: [],
		},
		{
			title: "Receipt email blocks checkout",
			narrative:
				"Even after the card is charged and the order is written to Orders DB, Place order sends the receipt to Email provider and waits for an acknowledgment. The client retries up to 3 times inside the checkout request, so any slowdown or outage in Email provider stalls the confirmation page after the order is already paid.",
			grammar: "architecture",
			selection: ["Shop/MKhTEYqf#lXgq75bO", "Shop/MKhTEYqf#mOCWkDAa"],
		},
		{
			title: "At 10 seconds, the order rolls back",
			narrative:
				"Place order starts Timeout guard on every request. If checkout has not finished after 10 seconds, the guard aborts it: it calls Release route to return the stock, refunds the card if the charge succeeded, and shows the shopper an error page. That includes orders that are already paid and saved, waiting only on the receipt email.",
			grammar: "architecture",
			selection: ["Shop/MKhTEYqf#VONp3yKV", "Shop/MKhTEYqf#C2JNdx5s", "Shop/MKhTEYqf#dkNRueI0"],
		},
	] satisfies Beat[],
};
