"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import { useTheme } from "@/contexts/theme-context";
import {
  LayoutDashboard,
  Users,
  Droplet,
  Calendar,
  FileText,
  Receipt,
  MessageSquare,
  Bell,
  Settings,
  ChevronDown,
  ChevronRight,
  HelpCircle,
  ClipboardCheck,
  AlertCircle,
  UserCheck,
  DollarSign,
  BarChart3,
  FolderOpen,
  Phone,
  Mail,
  Package,
  Warehouse,
  Truck,
  Sparkles,
  ShoppingCart,
} from "lucide-react";

const navigationGroups = [
  {
    label: "Operations",
    items: [
      {
        name: "Dashboard",
        href: "/dashboard",
        icon: LayoutDashboard,
        module: "dashboard",
      },
      {
        name: "Jobs",
        href: "/jobs",
        icon: Calendar,
        module: "jobs",
      },
      {
        name: "Visits",
        href: "/visits",
        icon: ClipboardCheck,
        module: "visits",
      },
      {
        name: "Carers",
        href: "/carers",
        icon: UserCheck,
        module: "carers",
        children: [
          { name: "Team", href: "/carers", icon: UserCheck },
          { name: "Schedule", href: "/carers/schedule", icon: Calendar },
        ],
      },
      {
        name: "Supplies",
        href: "/supplies",
        icon: Package,
        module: "supplies",
      },
      {
        name: "Inventory",
        href: "/inventory",
        icon: Warehouse,
        module: "inventory",
        children: [
          { name: "Overview", href: "/inventory", icon: Warehouse },
          { name: "Products", href: "/inventory/products", icon: Package },
          { name: "Stock Levels", href: "/inventory/stock", icon: BarChart3 },
          { name: "Movements", href: "/inventory/movements", icon: Truck },
          { name: "Warehouses", href: "/inventory/warehouses", icon: Warehouse },
          { name: "Suppliers", href: "/inventory/suppliers", icon: Users },
        ],
      },
      {
        name: "Visit Templates",
        href: "/visit-templates",
        icon: ClipboardCheck,
        module: "visit-templates",
      },
    ],
  },
  {
    label: "Customers",
    items: [
      {
        name: "Clients & Pools",
        href: "/clients",
        icon: Users,
        module: "clients",
        children: [
          { name: "Clients", href: "/clients", icon: Users },
          { name: "Pools", href: "/pools", icon: Droplet },
        ],
      },
      {
        name: "Service Plans",
        href: "/plans",
        icon: FileText,
        module: "plans",
        children: [
          { name: "Plans", href: "/plans", icon: FileText },
          { name: "Templates", href: "/subscription-templates", icon: FileText },
        ],
      },
      {
        name: "Shop Orders",
        href: "/orders",
        icon: ShoppingCart,
        module: "orders",
      },
      {
        name: "Financial",
        href: "/invoices",
        icon: DollarSign,
        module: "financial",
        children: [
          { name: "Quotes", href: "/quotes", icon: FileText },
          { name: "Invoices", href: "/invoices", icon: Receipt },
          { name: "Subscription Billing", href: "/billing", icon: Calendar },
          { name: "Payments", href: "/payments", icon: DollarSign },
          { name: "Receipts", href: "/receipts", icon: Receipt },
          { name: "Credit Notes", href: "/credit-notes", icon: FileText },
        ],
      },
      {
        name: "Issues",
        href: "/issues",
        icon: AlertCircle,
        module: "issues",
      },
    ],
  },
  {
    label: "Communication",
    items: [
      {
        name: "Inbox",
        href: "/inbox",
        icon: MessageSquare,
        module: "inbox",
      },
      {
        name: "SMS",
        href: "/sms",
        icon: Phone,
        module: "sms",
      },
      {
        name: "Email",
        href: "/email",
        icon: Mail,
        module: "email",
      },
    ],
  },
  {
    label: "Management",
    items: [
      {
        name: "AI Business Partner",
        href: "/ai-partner",
        icon: Sparkles,
        module: "ai-partner",
      },
      {
        name: "Reports & Data",
        href: "/analytics",
        icon: BarChart3,
        module: "reports",
        children: [
          { name: "Analytics", href: "/analytics", icon: BarChart3 },
          { name: "Files", href: "/files", icon: FolderOpen },
        ],
      },
      {
        name: "Team",
        href: "/team",
        icon: Users,
        module: "team",
      },
      {
        name: "Settings",
        href: "/settings",
        icon: Settings,
        module: "settings",
      },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [expandedSections, setExpandedSections] = useState<string[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const { getThemeClasses, customLogo, getThemeColor } = useTheme();
  const theme = getThemeClasses();

  const isActive = (href: string) => {
    if (pathname === href) return true;
    if (pathname.startsWith(href + "/")) {
      const remainingPath = pathname.slice(href.length + 1);
      return !remainingPath.includes("/");
    }
    return false;
  };

  useEffect(() => {
    const shouldExpandSections: string[] = [];
    navigationGroups.forEach((group) => {
      group.items.forEach((section) => {
        if (section.children) {
          const hasActiveChild = section.children.some((child) => isActive(child.href));
          if (hasActiveChild) {
            shouldExpandSections.push(section.name);
          }
        }
      });
    });
    if (shouldExpandSections.length > 0) {
      setExpandedSections((prev) => [...new Set([...prev, ...shouldExpandSections])]);
    }
  }, [pathname]);

  const themeHex = getThemeColor();
  const themeHexDark = `var(--theme-color-dark, ${themeHex})`;

  // Return inline style objects that use the exact custom color
  const getActiveStyle = (): React.CSSProperties => ({
    backgroundColor: themeHex,
    color: '#ffffff',
  });

  const getGradientStyle = (): React.CSSProperties => ({
    background: `linear-gradient(to bottom right, ${themeHex}, var(--theme-color-dark, ${themeHex}))`,
    color: '#ffffff',
  });

  const toggleSection = (sectionName: string) => {
    setExpandedSections((prev) =>
      prev.includes(sectionName)
        ? prev.filter((name) => name !== sectionName)
        : [...prev, sectionName]
    );
  };

  return (
    <div
      className={cn(
        "flex h-full flex-col bg-white border-r border-gray-200 transition-all duration-200",
        collapsed ? "w-16" : "w-64"
      )}
    >
      {/* Header */}
      <div className="flex h-20 items-center justify-center border-b border-gray-200 px-2">
        {customLogo ? (
          <img
            src={customLogo}
            alt="Logo"
            className="h-16 w-auto max-w-full rounded-lg object-contain"
          />
        ) : (
          <div
            className="h-16 w-16 rounded-lg flex items-center justify-center shadow-lg"
            style={getGradientStyle()}
          >
            <Droplet className="h-9 w-9 text-white" />
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 p-4 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent hover:scrollbar-thumb-gray-400">
        {navigationGroups.map((group, groupIndex) => (
          <div key={group.label}>
            {!collapsed && groupIndex > 0 && (
              <div className="my-4 border-t border-gray-200"></div>
            )}
            {!collapsed && (
              <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                {group.label}
              </div>
            )}
            <div className="space-y-1">
              {group.items.map((item) => {
                const hasChildren = item.children && item.children.length > 0;
                const isExpanded = expandedSections.includes(item.name);
                const isActiveItem =
                  (item.href && isActive(item.href)) ||
                  (hasChildren && item.children!.some((child) => isActive(child.href)));

                return (
                  <div key={item.name}>
                    {hasChildren ? (
                      <button
                        onClick={() => toggleSection(item.name)}
                        className="group flex w-full items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors text-gray-700 hover:text-white"
                        style={isActiveItem ? getActiveStyle() : undefined}
                        onMouseEnter={(e) => { if (!isActiveItem) { e.currentTarget.style.backgroundColor = themeHex; e.currentTarget.style.color = '#fff'; } }}
                        onMouseLeave={(e) => { if (!isActiveItem) { e.currentTarget.style.backgroundColor = ''; e.currentTarget.style.color = ''; } }}
                      >
                        <item.icon className="mr-3 h-5 w-5 flex-shrink-0" />
                        {!collapsed && (
                          <>
                            {item.name}
                            <span
                              className={cn(
                                "ml-auto transition-colors",
                                isActiveItem ? "text-white" : "text-gray-400 group-hover:text-white"
                              )}
                            >
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </span>
                          </>
                        )}
                      </button>
                    ) : (
                      <Link
                        href={item.href || "#"}
                        className="group flex items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors w-full text-left text-gray-700 hover:text-white"
                        style={isActiveItem ? getActiveStyle() : undefined}
                        onMouseEnter={(e) => { if (!isActiveItem) { e.currentTarget.style.backgroundColor = themeHex; e.currentTarget.style.color = '#fff'; } }}
                        onMouseLeave={(e) => { if (!isActiveItem) { e.currentTarget.style.backgroundColor = ''; e.currentTarget.style.color = ''; } }}
                      >
                        <item.icon className="mr-3 h-5 w-5 flex-shrink-0" />
                        {!collapsed && item.name}
                      </Link>
                    )}

                    {/* Children */}
                    {hasChildren && isExpanded && !collapsed && (
                      <div className="ml-6 mt-1 space-y-1">
                        {item.children!.map((child) => (
                          <Link
                            key={child.name}
                            href={child.href}
                            className="group flex items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors w-full text-left text-gray-600 hover:text-gray-900"
                            style={isActive(child.href) ? { color: themeHex, fontWeight: 500 } : undefined}
                          >
                            <child.icon className="mr-3 h-4 w-4 flex-shrink-0" />
                            {child.name}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-gray-200 p-4">
        {!collapsed && (
          <button
            className="flex items-center w-full text-sm text-gray-500 transition-colors hover:text-orange-600"
            onClick={() => {
              alert("Help & Keyboard shortcuts coming soon!");
            }}
          >
            <HelpCircle className="mr-2 h-4 w-4" />
            Help & Keyboard shortcuts
          </button>
        )}
      </div>

      {/* Collapse Toggle */}
      <div className="border-t border-gray-200 p-2">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-full rounded-lg px-3 py-2 text-sm text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? "▶" : "◀"}
        </button>
      </div>
    </div>
  );
}

