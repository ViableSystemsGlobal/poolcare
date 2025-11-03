"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, Sparkles, TrendingUp, AlertCircle, Target, Brain, Zap, BarChart3 } from "lucide-react";
import { useTheme } from "@/contexts/theme-context";

interface Recommendation {
  id: string;
  title: string;
  description: string;
  priority: "high" | "medium" | "low";
  completed: boolean;
  action?: string;
  href?: string;
}

interface DashboardAICardProps {
  title: string;
  subtitle: string;
  recommendations: Recommendation[];
  onRecommendationComplete: (id: string) => void;
  icon?: React.ReactNode;
  className?: string;
  layout?: "vertical" | "horizontal"; // vertical for dashboard (1 per row), horizontal for list pages (3 per row)
}

export function DashboardAICard({
  title,
  subtitle,
  recommendations,
  onRecommendationComplete,
  icon,
  className = "",
  layout = "horizontal", // Default to horizontal for list pages
}: DashboardAICardProps) {
  const { getThemeClasses } = useTheme();
  const theme = getThemeClasses();
  const router = useRouter();
  const [completedItems, setCompletedItems] = useState<string[]>([]);

  const getGradientBackgroundClasses = () => {
    switch (theme.primary) {
      case "blue":
        return "bg-gradient-to-br from-blue-500 to-blue-600";
      case "green":
        return "bg-gradient-to-br from-green-500 to-green-600";
      case "purple":
        return "bg-gradient-to-br from-purple-500 to-purple-600";
      case "red":
        return "bg-gradient-to-br from-red-500 to-red-600";
      case "orange":
        return "bg-gradient-to-br from-orange-500 to-orange-600";
      case "pink":
        return "bg-gradient-to-br from-pink-500 to-pink-600";
      case "indigo":
        return "bg-gradient-to-br from-indigo-500 to-indigo-600";
      case "teal":
        return "bg-gradient-to-br from-teal-500 to-teal-600";
      default:
        return "bg-gradient-to-br from-orange-500 to-orange-600";
    }
  };

  const getSmallIconBackgroundClasses = () => {
    switch (theme.primary) {
      case "blue":
        return "bg-blue-500";
      case "green":
        return "bg-green-500";
      case "purple":
        return "bg-purple-500";
      case "red":
        return "bg-red-500";
      case "orange":
        return "bg-orange-500";
      case "pink":
        return "bg-pink-500";
      case "indigo":
        return "bg-indigo-500";
      case "teal":
        return "bg-teal-500";
      default:
        return "bg-orange-500";
    }
  };

  const handleComplete = (id: string) => {
    setCompletedItems((prev) => [...prev, id]);
    onRecommendationComplete(id);
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high":
        return "text-red-600 bg-red-100";
      case "medium":
        return "text-yellow-600 bg-yellow-100";
      case "low":
        return "text-green-600 bg-green-100";
      default:
        return "text-gray-600 bg-gray-100";
    }
  };

  const getPriorityIcon = (priority: string) => {
    switch (priority) {
      case "high":
        return <AlertCircle className="w-3 h-3" />;
      case "medium":
        return <TrendingUp className="w-3 h-3" />;
      case "low":
        return <Target className="w-3 h-3" />;
      default:
        return <Target className="w-3 h-3" />;
    }
  };

  const handleRecommendationClick = (rec: Recommendation) => {
    if (rec.href) {
      router.push(rec.href);
    }
  };

  return (
    <Card
      className={`p-3 bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 border border-blue-200 shadow-lg h-full ${className}`}
    >
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center space-x-1">
          <div
            className={`p-1 rounded-lg ${getGradientBackgroundClasses()} shadow-lg`}
          >
            {icon || <Sparkles className="w-3 h-3 text-white" />}
          </div>
          <div>
            <h3 className="text-sm font-bold text-gray-900">{title}</h3>
            <p className="text-xs text-gray-600">{subtitle}</p>
          </div>
        </div>
        <div className="flex items-center space-x-1">
          <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></div>
          <span className="text-xs text-gray-500">AI</span>
        </div>
      </div>

      <div className="space-y-1">
        <div className="flex items-center space-x-1 mb-1">
          <div
            className={`w-3 h-3 ${getSmallIconBackgroundClasses()} rounded-full flex items-center justify-center`}
          >
            <Sparkles className="w-2 h-2 text-white" />
          </div>
          <h4 className="text-xs font-semibold text-gray-800">
            Recommendations
          </h4>
        </div>

        {layout === "vertical" ? (
          // Vertical layout for dashboard (1 per row, max 5)
          <div className="space-y-2">
            {recommendations.length === 0 ? (
              <div className="text-center py-4 text-gray-500">
                <Brain className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                <p className="text-xs">No recommendations</p>
              </div>
            ) : (
              recommendations.map((rec) => {
                const isCompleted = completedItems.includes(rec.id);
                return (
                  <div
                    key={rec.id}
                    className={`p-2 rounded-lg border transition-all duration-200 ${
                      isCompleted
                        ? "bg-green-50 border-green-200"
                        : "bg-white border-gray-200 hover:border-gray-300"
                    } ${rec.href ? "cursor-pointer" : ""}`}
                    onClick={() => handleRecommendationClick(rec)}
                  >
                    <div className="flex items-start justify-between mb-1">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium flex items-center space-x-1 ${getPriorityColor(
                          rec.priority
                        )}`}
                      >
                        {getPriorityIcon(rec.priority)}
                        <span className="capitalize">{rec.priority}</span>
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!isCompleted) {
                            handleComplete(rec.id);
                          }
                        }}
                        disabled={isCompleted}
                        className={`h-6 w-6 flex-shrink-0 ${
                          isCompleted
                            ? "text-green-600 bg-green-100"
                            : "text-gray-400 hover:text-green-600 hover:bg-green-50"
                        }`}
                      >
                        <Check className="w-4 h-4" />
                      </Button>
                    </div>
                    <h5 className="text-sm font-medium text-gray-900 mb-1">
                      {rec.title}
                    </h5>
                    <p className="text-xs text-gray-600 leading-relaxed">
                      {rec.description}
                    </p>
                  </div>
                );
              })
            )}
          </div>
        ) : (
          // Horizontal layout for list pages (3 per row, max 3)
          <div className="grid grid-cols-3 gap-1">
            {recommendations.length === 0 ? (
              <div className="col-span-3 text-center py-4 text-gray-500">
                <Brain className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                <p className="text-xs">No recommendations</p>
              </div>
            ) : (
              recommendations.map((rec) => {
                const isCompleted = completedItems.includes(rec.id);
                return (
                  <div
                    key={rec.id}
                    className={`p-1 rounded-lg border transition-all duration-200 ${
                      isCompleted
                        ? "bg-green-50 border-green-200"
                        : "bg-white border-gray-200 hover:border-gray-300"
                    } ${rec.href ? "cursor-pointer" : ""}`}
                    onClick={() => handleRecommendationClick(rec)}
                  >
                    <div className="flex items-start justify-between mb-1">
                      <span
                        className={`px-1.5 py-0.5 rounded-full text-xs font-medium flex items-center space-x-0.5 ${getPriorityColor(
                          rec.priority
                        )}`}
                      >
                        {getPriorityIcon(rec.priority)}
                        <span className="capitalize text-xs">{rec.priority}</span>
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!isCompleted) {
                            handleComplete(rec.id);
                          }
                        }}
                        disabled={isCompleted}
                        className={`p-0.5 h-5 w-5 flex-shrink-0 ${
                          isCompleted
                            ? "text-green-600 bg-green-100"
                            : "text-gray-400 hover:text-green-600 hover:bg-green-50"
                        }`}
                      >
                        <Check className="w-3 h-3" />
                      </Button>
                    </div>
                    <h5 className="text-xs font-medium text-gray-900 mb-0.5 line-clamp-1">
                      {rec.title}
                    </h5>
                    <p className="text-xs text-gray-600 leading-tight line-clamp-2">
                      {rec.description}
                    </p>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {recommendations.length > 0 && (
        <div className="mt-1 pt-1 border-t border-gray-200">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-500">
              {completedItems.length} of {recommendations.length} completed
            </span>
            <div className="flex items-center space-x-1">
              <div className="w-1 h-1 bg-blue-500 rounded-full"></div>
              <span className="text-blue-600 font-medium">AI Powered</span>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

