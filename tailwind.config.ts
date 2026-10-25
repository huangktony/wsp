import type { Config } from "tailwindcss";

// Every color is a CSS variable (see app/globals.css) so light/dark themes swap at runtime.
const c = (name: string) => `color-mix(in srgb, var(--${name}) calc(<alpha-value> * 100%), transparent)`;

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      keyframes: {
        bob: { "0%, 100%": { transform: "translateY(0)" }, "50%": { transform: "translateY(-14px)" } },
        "bob-wave": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-16px)" },
        },
      },
      animation: { bob: "bob 1.4s ease-in-out infinite", "bob-wave": "bob-wave var(--wave-loop) cubic-bezier(0.37, 0, 0.63, 1) infinite" },
      colors: {
        matcha: c("matcha"),
        pistachio: c("pistachio"),
        peach: c("peach"),
        azure: c("azure"),
        indigo: c("indigo"),
        orchid: c("orchid"),
        secondary: c("secondary"),
        maroon: c("maroon"),
        orchidink: c("orchid-ink"),
        matchaink: c("matcha-ink"),
        inactive: c("inactive"),
        outline: c("outline"),
        ink: c("ink"),
        muted: c("muted"),
        line: c("border"),
        mint: c("mint"),
        sage: c("sage"),
        sageink: c("sage-ink"),
        pink: c("pink"),
        pinksoft: c("pink-soft"),
        mintsoft: c("mint-soft"),
        deep: c("deep-pink"),
        wine: c("wine"),
        field: c("field"),
        surface: c("surface"),
        nav: c("nav"),
        circle: c("circle"),
        page: c("page"),
        panel: c("panel"),
        panelsoft: c("panel-soft"),
      },
      fontFamily: {
        display: "var(--font-display)",
        body: "var(--font-body)",
        brand: "var(--font-brand)",
      },
      borderRadius: { card: "20px" },
    },
  },
  plugins: [],
} satisfies Config;
