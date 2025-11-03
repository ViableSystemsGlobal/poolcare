import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { useTheme } from "@/contexts/theme-context"

const getThemeButtonClasses = (theme: any) => {
  if (!theme || !theme.primary) {
    return 'bg-orange-600 hover:bg-orange-700 focus-visible:ring-orange-200';
  }
  
  const colorMap: { [key: string]: string } = {
    'purple-600': 'bg-purple-600 hover:bg-purple-700 focus-visible:ring-purple-200',
    'blue-600': 'bg-blue-600 hover:bg-blue-700 focus-visible:ring-blue-200',
    'green-600': 'bg-green-600 hover:bg-green-700 focus-visible:ring-green-200',
    'orange-600': 'bg-orange-600 hover:bg-orange-700 focus-visible:ring-orange-200',
    'red-600': 'bg-red-600 hover:bg-red-700 focus-visible:ring-red-200',
    'indigo-600': 'bg-indigo-600 hover:bg-indigo-700 focus-visible:ring-indigo-200',
    'pink-600': 'bg-pink-600 hover:bg-pink-700 focus-visible:ring-pink-200',
    'teal-600': 'bg-teal-600 hover:bg-teal-700 focus-visible:ring-teal-200',
  };
  
  const primary = theme.primary || 'orange-600';
  return colorMap[primary] || 'bg-orange-600 hover:bg-orange-700 focus-visible:ring-orange-200';
};

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
    const { getThemeClasses } = useTheme()
    const Comp = asChild ? Slot : "button"
    
    const themeClasses = getThemeClasses()
    const buttonThemeClasses = variant === "default" ? getThemeButtonClasses(themeClasses) : ""
    
    // Ensure we always have a fallback background color for default variant
    // This prevents invisible buttons if theme classes fail
    const getDefaultBgColor = () => {
      if (variant !== "default") return undefined
      
      // If className already has a background color, don't override
      if (className && /bg-\w+-\d+/.test(className)) return undefined
      
      // Use theme color if available, otherwise fallback to orange
      const primary = themeClasses?.primary || 'orange-600'
      const colorMap: { [key: string]: string } = {
        'orange-600': '#ea580c',
        'blue-600': '#2563eb',
        'green-600': '#16a34a',
        'purple-600': '#9333ea',
        'red-600': '#dc2626',
        'indigo-600': '#4f46e5',
        'pink-600': '#db2777',
        'teal-600': '#0d9488',
      }
      
      return colorMap[primary] || '#ea580c' // Always fallback to orange
    }
    
    const defaultBgColor = getDefaultBgColor()
    
    // For default variant, ensure theme color classes are always applied
    // The base variant already has orange, but theme classes override it
    const finalClassName = cn(
      buttonVariants({ variant, size }),
      variant === "default" && buttonThemeClasses,
      className
    )
    
    return (
      <Comp
        className={finalClassName}
        style={{
          // Apply inline style as fallback for default variant if no background is set
          ...(defaultBgColor && variant === "default" && {
            backgroundColor: style?.backgroundColor || defaultBgColor,
          }),
          ...style,
        }}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }

