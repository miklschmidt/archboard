import type { BrowserTimeline } from "@archboard/agent-workbench/contract";

type TimelineItem = BrowserTimeline["turns"][number]["items"][number];

/**
 * Show the workhorse's messages and observable progress.
 * @param props The rendered state and its action owners.
 * @param props.timeline The workhorse timeline.
 * @returns The rendered controls or content.
 */
function Conversation({ timeline }: { readonly timeline: BrowserTimeline | null | undefined }) {
	if (!timeline?.turns.length)
		return <p className="empty">Send a message to start work in this checkout.</p>;
	return (
		<div className="conversation" aria-label="Workhorse conversation">
			{timeline.turns.map((turn) => (
				<section key={turn.turnId}>
					{turn.items.map((item) => (
						<ConversationItem key={item.itemId} item={item} />
					))}
					{turn.plan && (
						<pre className="plan">
							{turn.plan.steps.map((step) => `${step.step} · ${step.status}`).join("\n")}
						</pre>
					)}
					{turn.error && <p role="alert">{turn.error.message}</p>}
				</section>
			))}
		</div>
	);
}

/**
 * Keep each supported timeline item with its protocol family.
 * @returns The rendered timeline item.
 * @param props The rendered state and its action owners.
 * @param props.item The timeline item.
 */
function ConversationItem({ item }: { readonly item: TimelineItem }) {
	switch (item.media) {
		case "prompt":
		case "text":
			return (
				<div className={`message ${item.media}`}>
					<span>{messageAuthor(item.media)}</span>
					<p>{item.text}</p>
				</div>
			);
		case "command":
			return (
				<details>
					<summary>
						{item.command} · {item.status}
					</summary>
					<pre>{item.output}</pre>
				</details>
			);
		case "tool":
			return (
				<p className="activity">
					{item.name} · {item.status}
				</p>
			);
		case "fileChange":
			return (
				<p className="activity">
					{item.changes.map((file) => file.path).join(", ")} · {item.status}
				</p>
			);
		default:
			return null;
	}
}

/**
 * Name the author of a text item.
 * @param media The media value.
 * @returns The rendered controls or content.
 */
function messageAuthor(media: "prompt" | "text"): string {
	return media === "prompt" ? "You" : "Workhorse";
}

export { Conversation };
