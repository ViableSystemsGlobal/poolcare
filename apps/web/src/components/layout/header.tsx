"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTheme } from "@/contexts/theme-context";
import { useAuth } from "@/contexts/auth-context";
import { Search, Bell, HelpCircle, User, LogOut } from "lucide-react";

export function Header() {
  const router = useRouter();
  const { getThemeClasses } = useTheme();
  const theme = getThemeClasses();
  const { user, org, logout } = useAuth();

  const getHoverTextClasses = () => {
    const colorMap: { [key: string]: string } = {
      "purple-600": "hover:text-purple-600",
      "blue-600": "hover:text-blue-600",
      "green-600": "hover:text-green-600",
      "orange-600": "hover:text-orange-600",
      "red-600": "hover:text-red-600",
      "indigo-600": "hover:text-indigo-600",
      "pink-600": "hover:text-pink-600",
      "teal-600": "hover:text-teal-600",
    };
    return colorMap[theme.primary] || "hover:text-orange-600";
  };

  const getHoverBgClasses = () => {
    const colorMap: { [key: string]: string } = {
      "purple-600": "hover:bg-purple-50",
      "blue-600": "hover:bg-blue-50",
      "green-600": "hover:bg-green-50",
      "orange-600": "hover:bg-orange-50",
      "red-600": "hover:bg-red-50",
      "indigo-600": "hover:bg-indigo-50",
      "pink-600": "hover:bg-pink-50",
      "teal-600": "hover:bg-teal-50",
    };
    return colorMap[theme.primary] || "hover:bg-orange-50";
  };

  const getGradientClasses = () => {
    const colorMap: { [key: string]: string } = {
      "purple-600": "bg-gradient-to-br from-purple-500 to-purple-600",
      "blue-600": "bg-gradient-to-br from-blue-500 to-blue-600",
      "green-600": "bg-gradient-to-br from-green-500 to-green-600",
      "orange-600": "bg-gradient-to-br from-orange-500 to-orange-600",
      "red-600": "bg-gradient-to-br from-red-500 to-red-600",
      "indigo-600": "bg-gradient-to-br from-indigo-500 to-indigo-600",
      "pink-600": "bg-gradient-to-br from-pink-500 to-pink-600",
      "teal-600": "bg-gradient-to-br from-teal-500 to-teal-600",
    };
    return colorMap[theme.primary] || "bg-gradient-to-br from-orange-500 to-orange-600";
  };

  return (
    <header className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-6">
      <div className="flex items-center space-x-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Search jobs, clients, pools..."
            className="w-80 pl-10 h-9 border-gray-200"
          />
        </div>
      </div>

      <div className="flex items-center space-x-3">
        <Button 
          variant="ghost" 
          size="icon" 
          className={`h-9 w-9 text-gray-500 ${getHoverTextClasses()} ${getHoverBgClasses()}`}
          onClick={() => router.push("/notifications")}
          title="Notifications"
        >
          <Bell className="h-4 w-4" />
        </Button>

        <Button variant="ghost" size="icon" className={`h-9 w-9 text-gray-500 ${getHoverTextClasses()} ${getHoverBgClasses()}`}>
          <HelpCircle className="h-4 w-4" />
        </Button>

        <div className="flex items-center space-x-3 pl-3 border-l border-gray-200">
          <div className="flex items-center space-x-3">
            <div className={`w-8 h-8 ${getGradientClasses()} rounded-full flex items-center justify-center`}>
              <User className="h-4 w-4 text-white" />
            </div>
            <div className="text-right">
              <p className="text-sm font-medium text-gray-900">
                {user?.name || user?.email || user?.phone || "User"}
              </p>
              <p className="text-xs text-gray-500">{org?.name || ""}</p>
            </div>
          </div>

          <Button
            variant="ghost"
            size="icon"
            className={`h-8 w-8 text-gray-500 ${getHoverTextClasses()} ${getHoverBgClasses()}`}
            onClick={logout}
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}

