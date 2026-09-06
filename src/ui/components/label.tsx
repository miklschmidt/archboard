import * as React from "react";
import { cn } from "@/ui/components/class-names";

function Label({ className, ...props }: React.ComponentProps<"label">) {
	return (
		// The control association arrives through props (htmlFor or a wrapped
		// control); the rule cannot see spread props, so this is a false positive.
		// oxlint-disable-next-line jsx-a11y/label-has-associated-control
		<label
			data-slot="label"
			className={cn(
				"text-control flex items-center gap-2 leading-none select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
				className,
			)}
			{...props}
		/>
	);
}

export { Label };
