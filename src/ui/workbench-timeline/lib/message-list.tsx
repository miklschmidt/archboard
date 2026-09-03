import type { ComponentProps } from "react";

import { assistantTimelinePrimitives } from "../timeline.js";

type TimelineMessagesProps = ComponentProps<
	typeof assistantTimelinePrimitives.ThreadPrimitive.Messages
>;
type TimelineMessagesChildren = NonNullable<
	Extract<TimelineMessagesProps, { readonly components?: never }>["children"]
>;
type TimelineMessage = Parameters<TimelineMessagesChildren>[0]["message"];
type TimelineMessageNode = ReturnType<TimelineMessagesChildren>;

interface TimelineMessageListProps {
	readonly render: (messageId: TimelineMessage["id"]) => TimelineMessageNode;
}

export function TimelineMessageList({ render }: TimelineMessageListProps) {
	const Messages = assistantTimelinePrimitives.ThreadPrimitive.Messages;
	const renderMessage: TimelineMessagesChildren = ({ message }) => render(message.id);
	return <Messages>{renderMessage}</Messages>;
}
