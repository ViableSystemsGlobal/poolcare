/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "../../packages/ui/src/**/*.{js,ts,jsx,tsx}",
  ],
  safelist: [
    // Theme hover backgrounds
    "hover:bg-purple-600",
    "hover:bg-blue-600",
    "hover:bg-green-600",
    "hover:bg-orange-600",
    "hover:bg-red-600",
    "hover:bg-indigo-600",
    "hover:bg-pink-600",
    "hover:bg-teal-600",
    // Theme button backgrounds
    "bg-purple-600",
    "bg-blue-600",
    "bg-green-600",
    "bg-orange-600",
    "bg-red-600",
    "bg-indigo-600",
    "bg-pink-600",
    "bg-teal-600",
    // Theme text colors
    "text-purple-600",
    "text-blue-600",
    "text-green-600",
    "text-orange-600",
    "text-red-600",
    "text-indigo-600",
    "text-pink-600",
    "text-teal-600",
    // Theme hover text colors
    "hover:text-purple-600",
    "hover:text-blue-600",
    "hover:text-green-600",
    "hover:text-orange-600",
    "hover:text-red-600",
    "hover:text-indigo-600",
    "hover:text-pink-600",
    "hover:text-teal-600",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        primary: {
          DEFAULT: "#ea580c", // Orange-600
          foreground: "#ffffff",
        },
        secondary: {
          DEFAULT: "#f3f4f6",
          foreground: "#111827",
        },
        border: "#e5e7eb",
        input: "#e5e7eb",
        ring: "#ea580c",
      },
      borderRadius: {
        lg: "0.5rem",
        md: "calc(0.5rem - 2px)",
        sm: "calc(0.5rem - 4px)",
      },
    },
  },
  plugins: [],
};
