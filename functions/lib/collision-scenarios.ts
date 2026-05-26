export interface CollisionScenario {
  id: string;
  label: string;
  description: string;
  productHint: string;
  defaultSize: number;
  criteria: string[];
}

export const COLLISION_SCENARIOS: CollisionScenario[] = [
  {
    id: "qbo-active-engaged",
    label: "Active QBO subscribers, email engaged 30d",
    description: "Core QBO subscribers with recent email engagement — typical lifecycle nurture audience.",
    productHint: "QBO",
    defaultSize: 45000,
    criteria: [
      "Active QBO subscribers",
      "Engaged with email in last 30 days",
      "Not on payroll SKU",
    ],
  },
  {
    id: "payroll-upsell",
    label: "Payroll customers not on Advanced SKU",
    description: "Existing payroll users eligible for Advanced tier upsell campaigns.",
    productHint: "Payroll",
    defaultSize: 28000,
    criteria: [
      "Active payroll customers",
      "Not subscribed to Advanced payroll SKU",
      "Account ARPU above median",
    ],
  },
  {
    id: "trial-expiring",
    label: "QBO trial expiring within 7 days",
    description: "Trial accounts nearing conversion window — high-intent conversion audience.",
    productHint: "QBO",
    defaultSize: 12000,
    criteria: [
      "QBO trial account",
      "Trial expires within 7 days",
      "Logged in within last 14 days",
    ],
  },
  {
    id: "support-high-value",
    label: "High ARPU accounts with open support cases",
    description: "Premium accounts with active support tickets — retention-sensitive cohort.",
    productHint: "QBO",
    defaultSize: 8500,
    criteria: [
      "Account ARPU in top quartile",
      "Open support case in last 30 days",
      "Active QBO subscription",
    ],
  },
  {
    id: "smb-bundle",
    label: "SMB multi-product bundle eligible accounts",
    description: "Small business accounts eligible for bundled product offers across QBO and Payments.",
    productHint: "Payments",
    defaultSize: 32000,
    criteria: [
      "SMB segment account",
      "Uses QBO and Payments",
      "Not enrolled in bundle offer",
      "Active in last 60 days",
    ],
  },
];

export function getScenarioById(id: string): CollisionScenario | undefined {
  return COLLISION_SCENARIOS.find((s) => s.id === id);
}

export function defaultDateRange(): { startDate: string; endDate: string } {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const end = new Date(tomorrow);
  end.setDate(end.getDate() + 14);

  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { startDate: fmt(tomorrow), endDate: fmt(end) };
}
