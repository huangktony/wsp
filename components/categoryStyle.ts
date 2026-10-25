// One color and one plain-words label per category, used by the stacked bar, the legend and the Recent dots, so they always agree.
// Lives under components/ so Tailwind sees these class names. Colors are existing design tokens only.
import { CATEGORIES, PAID_BACK_CATEGORY } from "../lib/analyze";

export type CategoryKey = (typeof CATEGORIES)[number] | typeof PAID_BACK_CATEGORY;

// Chosen by looking at both themes: the pastel tokens turn dark in dark mode, so each pick here stays visible on white and on the dark surface.
export const CATEGORY_STYLE: Record<CategoryKey, { label: string; bg: string }> = {
  food: { label: "Food and drink", bg: "bg-deep" },
  groceries: { label: "Groceries", bg: "bg-matcha" },
  entertainment: { label: "Fun", bg: "bg-peach" },
  transport: { label: "Transport", bg: "bg-orchid" },
  shopping: { label: "Shopping", bg: "bg-inactive" },
  hangout: { label: "Hangouts", bg: "bg-indigo" },
  [PAID_BACK_CATEGORY]: { label: "Paid back", bg: "bg-maroon" },
  other: { label: "Other", bg: "bg-azure" },
};

export const categoryStyle = (key: string) => CATEGORY_STYLE[key as CategoryKey] ?? CATEGORY_STYLE.other;
