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
          className="h-9 w-9 text-gray-500 hover:text-orange-600 hover:bg-orange-50"
          onClick={() => router.push("/notifications")}
          title="Notifications"
        >
          <Bell className="h-4 w-4" />
        </Button>

        <Button variant="ghost" size="icon" className="h-9 w-9 text-gray-500 hover:text-orange-600 hover:bg-orange-50">
          <HelpCircle className="h-4 w-4" />
        </Button>

        <div className="flex items-center space-x-3 pl-3 border-l border-gray-200">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-gradient-to-br from-orange-500 to-orange-600 rounded-full flex items-center justify-center">
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
            className="h-8 w-8 text-gray-500 hover:text-orange-600 hover:bg-orange-50"
            onClick={logout}
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}

