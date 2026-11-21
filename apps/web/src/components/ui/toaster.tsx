"use client"

import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"
import { useToast } from "@/hooks/use-toast"
import { useTheme } from "@/contexts/theme-context"
import { CheckCircle2, AlertCircle } from "lucide-react"

export function Toaster() {
  const { toasts } = useToast()
  const { getThemeColor } = useTheme()
  const themeHex = getThemeColor()

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, ...props }) {
        const v = (props as any).variant
        const Icon = v === "destructive" ? AlertCircle : CheckCircle2
        const color = v === "destructive" ? "#dc2626" : v === "success" ? "#16a34a" : themeHex
        return (
          <Toast key={id} {...props}>
            <span
              className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full"
              style={{ backgroundColor: `${color}1a` }}
            >
              <Icon className="h-[18px] w-[18px]" style={{ color }} />
            </span>
            <div className="grid gap-0.5 pt-1.5 min-w-0">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && (
                <ToastDescription>{description}</ToastDescription>
              )}
            </div>
            {action}
            <ToastClose />
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}

