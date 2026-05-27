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
    id: "core-active-engaged",
    label: "Active LedgerCore subscribers, email engaged 30d",
    description: "Core LedgerCore subscribers with recent email engagement — typical lifecycle nurture audience.",
    productHint: "LedgerCore",
    defaultSize: 45000,
    criteria: [
      "Active LedgerCore subscribers",
      "Engaged with email in last 30 days",
      "Not on WorkforceHub SKU",
    ],
  },
  {
    id: "payroll-upsell",
    label: "WorkforceHub customers not on Advanced SKU",
    description: "Existing WorkforceHub users eligible for Advanced tier upsell campaigns.",
    productHint: "WorkforceHub",
    defaultSize: 28000,
    criteria: [
      "Active WorkforceHub customers",
      "Not subscribed to Advanced payroll SKU",
      "Account ARPU above median",
    ],
  },
  {
    id: "trial-expiring",
    label: "LedgerCore trial expiring within 7 days",
    description: "Trial accounts nearing conversion window — high-intent conversion audience.",
    productHint: "LedgerCore",
    defaultSize: 12000,
    criteria: [
      "LedgerCore trial account",
      "Trial expires within 7 days",
      "Logged in within last 14 days",
    ],
  },
  {
    id: "support-high-value",
    label: "High ARPU accounts with open support cases",
    description: "Premium accounts with active support tickets — retention-sensitive cohort.",
    productHint: "LedgerCore",
    defaultSize: 8500,
    criteria: [
      "Account ARPU in top quartile",
      "Open support case in last 30 days",
      "Active LedgerCore subscription",
    ],
  },
  {
    id: "smb-bundle",
    label: "SMB multi-product bundle eligible accounts",
    description: "Small business accounts eligible for bundled product offers across LedgerCore and PayFlow.",
    productHint: "LedgerCore",
    defaultSize: 32000,
    criteria: [
      "SMB segment account",
      "Uses LedgerCore and PayFlow",
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
