import type { LucideIcon } from "lucide-react";

/** A Lucide icon in a soft mint circle, used for empty states and side cards. */
export function IconBadge({ icon: Icon, size = 64 }: { icon: LucideIcon; size?: number }) {
  return (
    <span className="iconBadge" style={{ width: size, height: size }} aria-hidden="true">
      <Icon size={Math.round(size * 0.44)} strokeWidth={1.75} />
    </span>
  );
}
