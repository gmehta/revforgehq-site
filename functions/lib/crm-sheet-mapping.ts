export const DEFAULT_SPREADSHEET_ID = "16lpxRX-flWP_blM_Rvq-_rc6ktZFUvBpjqp7eCmLtWs";
export const DEFAULT_ACCOUNTS_SHEET = "Accounts";
export const DEFAULT_LEADS_SHEET = "Leads";

export const LEAD_SHEET_COLUMNS: ReadonlyArray<{ field: string; header: string }> = [
  { field: "id", header: "Lead ID" },
  { field: "first_name", header: "First Name" },
  { field: "last_name", header: "Last Name" },
  { field: "full_name", header: "Full Name" },
  { field: "company", header: "Company" },
  { field: "title", header: "Job Title" },
  { field: "linkedin_url", header: "LinkedIn URL" },
  { field: "domain", header: "Company Domain" },
  { field: "email", header: "Email" },
  { field: "gtm_tier", header: "GTM Tier" },
  { field: "gtm_tier_reason", header: "GTM Tier Reason" },
  { field: "lead_source", header: "Lead Source" },
  { field: "outreach_status", header: "Outreach Status" },
  { field: "tier", header: "Adobe Tier" },
  { field: "score", header: "Score" },
  { field: "updated_at", header: "Last Synced At" },
];

export const ACCOUNT_SHEET_COLUMNS: ReadonlyArray<{ field: string; header: string }> = [
  { field: "id", header: "Account ID" },
  { field: "company_name", header: "Company Name" },
  { field: "domain", header: "Domain" },
  { field: "segment", header: "Segment" },
  { field: "tier", header: "Tier" },
  { field: "status", header: "Status" },
  { field: "notes", header: "Notes" },
  { field: "updated_at", header: "Last Synced At" },
];

export function sheetHeaders(columns: ReadonlyArray<{ field: string; header: string }>): string[] {
  return columns.map((col) => col.header);
}

export function recordToRow(
  record: Record<string, unknown>,
  columns: ReadonlyArray<{ field: string; header: string }>,
): string[] {
  return columns.map(({ field }) => formatCell(record[field]));
}

export function formatCell(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

export function buildIdRowIndex(rows: string[][], idHeader: string): Map<string, number> {
  const index = new Map<string, number>();
  if (!rows.length) return index;
  const headers = rows[0].map((h) => h.trim().toLowerCase());
  const idCol = headers.indexOf(idHeader.trim().toLowerCase());
  if (idCol < 0) {
    throw new Error(`ID column '${idHeader}' not found in headers: ${rows[0].join(", ")}`);
  }
  for (let i = 1; i < rows.length; i++) {
    const rowId = (rows[i][idCol] ?? "").trim();
    if (rowId) index.set(rowId, i + 1);
  }
  return index;
}

export function columnLetter(count: number): string {
  let n = count;
  let label = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    label = String.fromCharCode(65 + rem) + label;
    n = Math.floor((n - 1) / 26);
  }
  return label;
}
