import type { IconName } from "@/components/icons";

export type NavItem = {
  href: string;
  label: string;
  icon: IconName;
  badge?: string;
};

export type NavGroup = { group: string; items: NavItem[] };

export const NAV: NavGroup[] = [
  {
    group: "Workspace",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: "Home" },
      { href: "/builder", label: "BOM Builder", icon: "List" },
      { href: "/preview", label: "Preview & Generate", icon: "Doc" },
      { href: "/history", label: "History", icon: "History" },
    ],
  },
  {
    group: "Master Data",
    items: [
      { href: "/catalog", label: "Item Catalog", icon: "Box" },
      { href: "/vendors", label: "Vendors", icon: "Truck" },
    ],
  },
  {
    group: "Process",
    items: [
      { href: "/approvals", label: "Approvals", icon: "CheckCircle" },
    ],
  },
];
