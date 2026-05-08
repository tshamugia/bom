import type { IconName } from "@/components/icons";

export type NavItem = {
  href: string;
  label: string;
  icon: IconName;
  badge?: string;
  roles?: Array<"owner" | "admin" | "member">;
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
      { href: "/projects", label: "Projects", icon: "Folder" },
      { href: "/dashboard", label: "Dashboard", icon: "Home" },
      { href: "/builder", label: "BOM Builder", icon: "List" },
      { href: "/preview", label: "Preview & Generate", icon: "Doc" },
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
      { href: "/users", label: "Users", icon: "Users", roles: ["owner", "admin"] },
    ],
  },
];
