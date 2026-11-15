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
				"When a shopper presses Pay, Storefront sends POST /orders to Place order and waits for its answer. Place order loads and prices the basket, then makes four calls one after another and waits for each: Inventory service reserves the items, Payment provider charges the card, Orders DB saves the paid order, and Email provider takes the receipt. Only when the last of them answers does Place order confirm the order, so the shopper waits through all four calls in turn.",
			grammar: "architecture",
			selection: ["Shop/MKhTEYqf#kZjjfq1m", "Shop/MKhTEYqf#LrbGsGwG"],
		},
		{
			title: "Stock is held while the card is charged",
			narrative:
				"Place order reserves the items with Inventory service first, and charges the card only after the reservation answers. So the items are already set aside while Payment provider works on the charge: no other order can reserve them, and other shoppers no longer see them as available. However slow the payment is, the items stay held, unless Timeout guard cancels the order 10 seconds after it started and gives them back.",
			grammar: "sequence",
			selection: [],
		},
		{
			title: "A slow email makes a slow checkout",
			narrative:
				"After the card is charged and the paid order is saved, Place order sends the receipt to Email provider and waits until it is accepted. The email client tries up to 3 times, all inside the shopper's request, and the confirmation page waits for it. So a slow or failing Email provider slows every checkout, at a point where the payment and the order are already done.",
			grammar: "architecture",
			selection: ["Shop/MKhTEYqf#lXgq75bO", "Shop/MKhTEYqf#mOCWkDAa"],
		},
		{
			title: "After 10 seconds, the order is undone",
			narrative:
				"Place order starts Timeout guard for every order. If the order is still running after 10 seconds, the guard cancels it: it calls Release route to give the stock back, refunds a charge that went through, and the shopper sees an error page. That includes an order that is already paid and saved and is only waiting for the receipt email.",
			grammar: "architecture",
			selection: ["Shop/MKhTEYqf#VONp3yKV", "Shop/MKhTEYqf#C2JNdx5s", "Shop/MKhTEYqf#dkNRueI0"],
		},
	] satisfies Beat[],
};
