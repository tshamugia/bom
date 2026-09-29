import type { IconName } from "@/components/icons";
import { EDITOR_ROLES, type UserRole } from "@/lib/roles";

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

/**
 * Viewers (site managers, PMs) get a status-only app: the overview, projects,
 * drawings and what was sent. Editing tools, master data and history are
 * hidden here and blocked for them in `src/proxy.ts`.
 */
const EDITORS: UserRole[] = [...EDITOR_ROLES];

export const NAV: NavGroup[] = [
  {
    group: "Workspace",
    accent: "var(--color-cat-indigo)",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: "Home", viewerLabel: "Overview" },
      { href: "/projects", label: "Projects", icon: "Folder" },
      { href: "/builder", label: "BOM Builder", icon: "List", roles: EDITORS },
      { href: "/preview", label: "Preview & Generate", icon: "Doc", roles: EDITORS },
      { href: "/drawings", label: "Drawings", icon: "Drawing" },
      { href: "/history", label: "History", icon: "History", roles: EDITORS },
    ],
  },
  {
    group: "Master Data",
    accent: "var(--color-cat-teal)",
    items: [
      { href: "/catalog", label: "Item Catalog", icon: "Box", roles: EDITORS },
      { href: "/vendors", label: "Vendors", icon: "Truck", roles: EDITORS },
    ],
  },
  {
    group: "Process",
    accent: "var(--color-cat-amber)",
    items: [
      { href: "/approvals", label: "Sent", icon: "Send" },
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

export type MobileTab = { href: string; label: string; icon: IconName };

/** Phone tab bar: the pages people open on site. "More" opens the full drawer. */
export const MOBILE_TABS: MobileTab[] = [
  { href: "/dashboard", label: "Dashboard", icon: "Home" },
  { href: "/projects", label: "Projects", icon: "Folder" },
  { href: "/drawings", label: "Drawings", icon: "Drawing" },
  { href: "/preview", label: "BOMs", icon: "Doc" },
];

/** Viewers only look things up: status first, then drawings and what was sent. */
export const VIEWER_MOBILE_TABS: MobileTab[] = [
  { href: "/dashboard", label: "Overview", icon: "Home" },
  { href: "/drawings", label: "Drawings", icon: "Drawing" },
  { href: "/approvals", label: "Sent", icon: "Send" },
  { href: "/projects", label: "Projects", icon: "Folder" },
];
