/** @type {import('tailwindcss').Config} */
const c = (v) => `hsl(var(--${v}) / <alpha-value>)`;
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: c("background"), foreground: c("foreground"),
        card: c("card"), popover: c("popover"),
        primary: { DEFAULT: c("primary"), foreground: c("primary-foreground") },
        secondary: c("secondary"), muted: { DEFAULT: c("muted"), foreground: c("muted-foreground") },
        accent: c("accent"), destructive: c("destructive"),
        border: c("border"), input: c("input"), ring: c("ring"),
      },
      borderRadius: { lg: "var(--radius)", md: "calc(var(--radius) - 2px)", sm: "calc(var(--radius) - 4px)" },
      fontFamily: {
        sans: ["Poppins", "Segoe UI", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "Cascadia Code", "Consolas", "monospace"],
      },
      transitionTimingFunction: { frame: "cubic-bezier(0.2, 0.8, 0.2, 1)" },
      keyframes: {
        glow: { "0%,100%": { boxShadow: "0 0 6px hsl(var(--primary) / .5)" }, "50%": { boxShadow: "0 0 18px hsl(var(--primary) / .6)" } },
        drift: { from: { transform: "translateX(-50%)" }, to: { transform: "translateX(0)" } },
        "drift-rev": { from: { transform: "translateX(0)" }, to: { transform: "translateX(-50%)" } },
        "fade-up": { from: { opacity: 0, transform: "translateY(8px)" }, to: { opacity: 1, transform: "none" } },
        "page-in": { from: { opacity: 0, transform: "translateY(10px)", filter: "blur(4px)" }, to: { opacity: 1, transform: "none", filter: "none" } },
        "pop-in": { from: { opacity: 0, transform: "scale(.96)" }, to: { opacity: 1, transform: "none" } },
        shimmer: { from: { backgroundPosition: "200% 0" }, to: { backgroundPosition: "-200% 0" } },
        "pulse-dot": { "0%,100%": { transform: "scale(1)", opacity: 1 }, "50%": { transform: "scale(1.6)", opacity: 0 } },
      },
      animation: {
        glow: "glow 2.2s ease-in-out infinite",
        drift: "drift 38s linear infinite",
        "drift-rev": "drift-rev 52s linear infinite",
        "fade-up": "fade-up .3s cubic-bezier(0.2,0.8,0.2,1)",
        "page-in": "page-in .45s cubic-bezier(0.2,0.8,0.2,1) both",
        "pop-in": "pop-in .25s cubic-bezier(0.2,0.8,0.2,1) both",
        shimmer: "shimmer 2.4s linear infinite",
        "pulse-dot": "pulse-dot 1.8s ease-out infinite",
      },
    },
  },
  plugins: [],
};
