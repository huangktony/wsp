import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        matcha: "#8FB78F",
        pistachio: "#CBE6C7",
        azure: "#B4CCCF",
        indigo: "#28536B",
        orchid: "#F3A5BC",
        peach: "#FFC49B",
        secondary: "#35607A",
        maroon: "#8A1F47",
        orchidink: "#7A1A3F",
        matchaink: "#1B3A1E",
        inactive: "#5F8793",
        outline: "#6F98A2",
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
