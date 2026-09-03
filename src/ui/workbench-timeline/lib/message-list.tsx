import type { ElementType, ReactNode } from "react";

interface TimelineMessageListProps {
	readonly component: ElementType;
	readonly render: (messageId: string) => ReactNode;
}

export function TimelineMessageList({ component: Messages, render }: TimelineMessageListProps) {
	return (
		<Messages>
			{({ message }: { readonly message: { readonly id: string } }) => render(message.id)}
		</Messages>
	);
}
