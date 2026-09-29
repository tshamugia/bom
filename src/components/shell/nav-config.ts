import type { IconName } from "@/components/icons";
import type { UserRole } from "@/lib/roles";

export type NavItem = {
  href: string;
  label: string;
  icon: IconName;
  badge?: string;
  roles?: UserRole[];
  /** Label shown to viewers when the default one names something they can't do. */
  viewerLabel?: string;
};

export type NavGroup = {
  group: string;
  /** CSS color value used for group label, item icons, and active accent. */
  accent: string;
  items: NavItem[];
};

export const NAV: NavGroup[] = [
  {
    group: "Workspace",
    accent: "var(--color-cat-indigo)",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: "Home" },
      { href: "/projects", label: "Projects", icon: "Folder" },
      { href: "/builder", label: "BOM Builder", icon: "List", roles: ["admin", "member"] },
      { href: "/preview", label: "Preview & Generate", icon: "Doc", viewerLabel: "BOMs" },
      { href: "/drawings", label: "Drawings", icon: "Drawing" },
      { href: "/history", label: "History", icon: "History" },
    ],
  },
  {
    group: "Master Data",
    accent: "var(--color-cat-teal)",
    items: [
      { href: "/catalog", label: "Item Catalog", icon: "Box" },
      { href: "/vendors", label: "Vendors", icon: "Truck" },
    ],
  },
  {
    group: "Process",
    accent: "var(--color-cat-amber)",
    items: [
      { href: "/approvals", label: "Sent BOMs", icon: "CheckCircle" },
    ],
  },
  {
    group: "Admin",
    accent: "var(--color-cat-violet)",
    items: [
      { href: "/users", label: "Users", icon: "Users", roles: ["admin"] },
      { href: "/audit", label: "Audit log", icon: "Shield", roles: ["admin"] },
    ],
  },
];

/** Phone tab bar: the read-mostly pages people open on site. "More" opens the full drawer. */
export const MOBILE_TABS: Array<{ href: string; label: string; icon: IconName }> = [
  { href: "/dashboard", label: "Dashboard", icon: "Home" },
  { href: "/projects", label: "Projects", icon: "Folder" },
  { href: "/drawings", label: "Drawings", icon: "Drawing" },
  { href: "/preview", label: "BOMs", icon: "Doc" },
];
