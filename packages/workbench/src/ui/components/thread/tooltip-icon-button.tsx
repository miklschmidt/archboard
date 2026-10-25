import { type ComponentPropsWithRef, forwardRef } from "react";

import { Button, cn, Tooltip } from "@archboard/ui-kit/components";

export type TooltipIconButtonProps = ComponentPropsWithRef<typeof Button> & {
	tooltip: string;
	side?: "top" | "bottom" | "left" | "right";
};

export const TooltipIconButton = forwardRef<HTMLButtonElement, TooltipIconButtonProps>(
	({ children, tooltip, side = "bottom", className, ...rest }, ref) => {
		return (
			<Tooltip.Provider>
				<Tooltip>
					<Tooltip.Trigger
						render={
							<Button
								variant="ghost"
								size="icon"
								{...rest}
								className={cn("aui-button-icon size-6 p-1 active:scale-90", className)}
								ref={ref}
							/>
						}
					>
						{children}
						<span className="aui-sr-only sr-only">{tooltip}</span>
					</Tooltip.Trigger>
					<Tooltip.Content side={side}>{tooltip}</Tooltip.Content>
				</Tooltip>
			</Tooltip.Provider>
		);
	},
);

TooltipIconButton.displayName = "TooltipIconButton";
