import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "var(--ink)",
        muted: "var(--muted)",
        line: "var(--border)",
        mint: "var(--mint)",
        sage: "var(--sage)",
        sageink: "var(--sage-ink)",
        pink: "var(--pink)",
        pinksoft: "var(--pink-soft)",
        mintsoft: "var(--mint-soft)",
        deep: "var(--deep-pink)",
      },
      fontFamily: {
        display: "var(--font-display)",
        body: "var(--font-body)",
      },
      borderRadius: { card: "20px" },
    },
  },
  plugins: [],
} satisfies Config;
