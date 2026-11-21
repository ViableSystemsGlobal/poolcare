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
        default: "text-white shadow-sm hover:shadow-md bg-[#397d54] hover:bg-[#2d6443]",
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
  ({ className, variant = "default", size, asChild = false, style, onClick, disabled, ...props }, ref) => {
    const { getThemeColor } = useTheme()
    const Comp = asChild ? Slot : "button"
    const themeHex = getThemeColor()

    // When onClick starts async work (returns a promise), the button disables
    // itself until that work finishes, so it can't be fired twice: one click,
    // one "Create" / "Send" / "Save". Works for every button in the admin.
    const [pending, setPending] = React.useState(false)
    const mounted = React.useRef(true)
    React.useEffect(() => () => { mounted.current = false }, [])
    const handleClick = onClick
      ? (e: React.MouseEvent<HTMLButtonElement>) => {
          if (pending) {
            e.preventDefault()
            return
          }
          const result = (onClick as (e: React.MouseEvent<HTMLButtonElement>) => unknown)(e)
          if (result && typeof (result as Promise<unknown>).then === "function") {
            setPending(true)
            ;(result as Promise<unknown>).then(
              () => mounted.current && setPending(false),
              () => mounted.current && setPending(false)
            )
          }
        }
      : undefined

    // For default variant, use the exact theme color via inline styles
    const themeStyle = variant === "default" && !(className && /bg-\w+-\d+/.test(className))
      ? { backgroundColor: style?.backgroundColor || themeHex, ...style }
      : style

    return (
      <Comp
        className={cn(buttonVariants({ variant, size }), className)}
        style={themeStyle}
        ref={ref}
        onClick={handleClick}
        disabled={disabled || pending}
        aria-busy={pending || undefined}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }

