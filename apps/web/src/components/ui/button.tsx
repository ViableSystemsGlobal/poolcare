import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { useTheme } from "@/contexts/theme-context"

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-lg text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "text-white shadow-sm hover:shadow-md bg-orange-600 hover:bg-orange-700",
        destructive:
          "bg-red-600 text-white hover:bg-red-700 shadow-sm hover:shadow-md",
        outline:
          "border border-gray-200 bg-white hover:bg-gray-50 hover:border-gray-300 text-gray-700 shadow-sm hover:shadow-md",
        secondary:
          "bg-gray-100 text-gray-900 hover:bg-gray-200 shadow-sm hover:shadow-md",
        ghost: "hover:bg-gray-100 hover:text-gray-900 text-gray-600",
        link: "underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-lg px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size, asChild = false, style, ...props }, ref) => {
    const { getThemeColor } = useTheme()
    const Comp = asChild ? Slot : "button"
    const themeHex = getThemeColor()

    // For default variant, use the exact theme color via inline styles
    const themeStyle = variant === "default" && !(className && /bg-\w+-\d+/.test(className))
      ? { backgroundColor: style?.backgroundColor || themeHex, ...style }
      : style

    return (
      <Comp
        className={cn(buttonVariants({ variant, size }), className)}
        style={themeStyle}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }

