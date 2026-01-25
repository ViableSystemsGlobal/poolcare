import * as React from "react"
import { cn } from "@/lib/utils"

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "secondary" | "destructive" | "outline"
}

function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
        {
          "bg-gray-900 text-white": variant === "default",
          "bg-gray-100 text-gray-900": variant === "secondary",
          "bg-red-100 text-red-900": variant === "destructive",
          "border border-gray-300 bg-transparent text-gray-900": variant === "outline",
        },
        className
      )}
      {...props}
    />
  )
}

export { Badge }

