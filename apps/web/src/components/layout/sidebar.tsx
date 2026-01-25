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

  const getBackgroundClasses = (isActive: boolean) => {
    const colorMap: { [key: string]: string } = {
      "purple-600": "bg-purple-600",
      "blue-600": "bg-blue-600",
      "green-600": "bg-green-600",
      "orange-600": "bg-orange-600",
      "red-600": "bg-red-600",
      "indigo-600": "bg-indigo-600",
      "pink-600": "bg-pink-600",
      "teal-600": "bg-teal-600",
    };
    return colorMap[theme.primary] || "bg-orange-600";
  };

  const getHoverBackgroundClasses = () => {
    const colorMap: { [key: string]: string } = {
      "purple-600": "hover:bg-purple-600",
      "blue-600": "hover:bg-blue-600",
      "green-600": "hover:bg-green-600",
      "orange-600": "hover:bg-orange-600",
      "red-600": "hover:bg-red-600",
      "indigo-600": "hover:bg-indigo-600",
      "pink-600": "hover:bg-pink-600",
      "teal-600": "hover:bg-teal-600",
    };
    return colorMap[theme.primary] || "hover:bg-orange-600";
  };

  const getGradientBackgroundClasses = () => {
    const colorMap: { [key: string]: string } = {
      "purple-600": "bg-gradient-to-br from-purple-600 to-purple-700",
      "blue-600": "bg-gradient-to-br from-blue-600 to-blue-700",
      "green-600": "bg-gradient-to-br from-green-600 to-green-700",
      "orange-600": "bg-gradient-to-br from-orange-600 to-orange-700",
      "red-600": "bg-gradient-to-br from-red-600 to-red-700",
      "indigo-600": "bg-gradient-to-br from-indigo-600 to-indigo-700",
      "pink-600": "bg-gradient-to-br from-pink-600 to-pink-700",
      "teal-600": "bg-gradient-to-br from-teal-600 to-teal-700",
    };
    return colorMap[theme.primary] || "bg-gradient-to-br from-orange-600 to-orange-700";
  };

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
            className={`h-16 w-16 rounded-lg ${getGradientBackgroundClasses()} flex items-center justify-center shadow-lg`}
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
                        className={cn(
                          "group flex w-full items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                          isActiveItem
                            ? `${getBackgroundClasses(true)} text-white`
                            : `text-gray-700 ${getHoverBackgroundClasses()} hover:text-white`
                        )}
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
                        className={cn(
                          "group flex items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors w-full text-left",
                          isActiveItem
                            ? `${getBackgroundClasses(true)} text-white`
                            : `text-gray-700 ${getHoverBackgroundClasses()} hover:text-white`
                        )}
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
                            className={cn(
                              "group flex items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors w-full text-left",
                              isActive(child.href)
                                ? `text-${theme.primary} font-medium`
                                : "text-gray-600 hover:text-gray-900"
                            )}
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

