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
				"When a shopper presses Pay, Place order reserves stock, charges the card, saves the order and sends the receipt before it answers. Every one of those calls runs while the shopper watches a spinner.",
			grammar: "architecture",
			selection: ["Shop/MKhTEYqf#kZjjfq1m", "Shop/MKhTEYqf#LrbGsGwG"],
		},
		{
			title: "Stock is held while the card is charged",
			narrative:
				"Place order reserves the items first and only then charges the card. While the bank takes its time, nobody else can buy those items.",
			grammar: "sequence",
			selection: [],
		},
		{
			title: "A slow email makes a slow checkout",
			narrative:
				"The confirmation page waits until Email provider accepts the receipt, and the email is tried up to 3 times. When the email service is slow, so is every checkout.",
			grammar: "architecture",
			selection: ["Shop/MKhTEYqf#lXgq75bO", "Shop/MKhTEYqf#mOCWkDAa"],
		},
		{
			title: "After 10 seconds, the order is undone",
			narrative:
				"Timeout guard cancels any order still running after 10 seconds. It gives the stock back and refunds the card, even when the payment went through a moment later.",
			grammar: "architecture",
			selection: ["Shop/MKhTEYqf#VONp3yKV", "Shop/MKhTEYqf#C2JNdx5s", "Shop/MKhTEYqf#dkNRueI0"],
		},
	] satisfies Beat[],
};
