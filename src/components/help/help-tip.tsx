"use client";

import { Icon } from "@/components/icons";
import {
  Popover, PopoverContent, PopoverDescription, PopoverTitle, PopoverTrigger,
} from "@/components/ui/popover";
import { HELP_TOPICS, helpHref, type HelpTopicId } from "@/lib/help-topics";

/**
 * A (?) next to a rule that isn't obvious from the screen. Opens a short
 * explanation; the link opens the full Help section in a new tab so a
 * half-filled dialog isn't lost.
 */
export function HelpTip({
  topic,
  side = "bottom",
  className,
}: {
  topic: HelpTopicId;
  side?: "top" | "bottom" | "left" | "right";
  className?: string;
}) {
  const t = HELP_TOPICS[topic];
  return (
    <Popover>
      <PopoverTrigger className={className ? `help-tip ${className}` : "help-tip"} aria-label={`Help: ${t.title}`}>
        <Icon.Help aria-hidden />
      </PopoverTrigger>
      <PopoverContent side={side} className="grid gap-1.5">
        <PopoverTitle>{t.title}</PopoverTitle>
        <PopoverDescription>{t.summary}</PopoverDescription>
        <a href={helpHref(topic)} target="_blank" rel="noopener" className="help-tip-link">
          Read more in Help <Icon.ExternalLink aria-hidden />
        </a>
      </PopoverContent>
    </Popover>
  );
}
