import type { Metadata } from "next";
import { AiGrowthFieldManual } from "./ai-growth-field-manual";

export const metadata: Metadata = {
  title: "AI Growth Field Manual · Leatherback",
  description: "A practical operating plan for compounding marketing output without compounding headcount.",
};

export default function AiGrowthPage() {
  return <AiGrowthFieldManual />;
}
