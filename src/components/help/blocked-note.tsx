import { Icon } from "@/components/icons";
import type { HelpTopicId } from "@/lib/help-topics";
import { HelpTip } from "./help-tip";

/**
 * Says in plain words why something can't be done right now — next to the
 * disabled button or read-only table — instead of a tooltip phones never show.
 */
export function BlockedNote({
  children,
  topic,
  icon = "info",
  className,
}: {
  children: React.ReactNode;
  topic?: HelpTopicId;
  icon?: "info" | "lock";
  className?: string;
}) {
  const I = icon === "lock" ? Icon.Lock : Icon.Info;
  return (
    <p className={className ? `blocked-note ${className}` : "blocked-note"}>
      <I aria-hidden className="blocked-note-ico" />
      <span>
        {children}
        {topic && <> <HelpTip topic={topic} /></>}
      </span>
    </p>
  );
}
