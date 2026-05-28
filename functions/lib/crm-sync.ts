import type { Sql } from "./db.js";
import {
  ACCOUNT_SHEET_COLUMNS,
  buildAccountRowIndexes,
  buildIdRowIndex,
  columnLetter,
  DEFAULT_ACCOUNTS_SHEET,
  DEFAULT_LEADS_SHEET,
  DEFAULT_OUTREACH_SHEET,
  DEFAULT_SPREADSHEET_ID,
  LEAD_SHEET_COLUMNS,
  OUTREACH_SHEET_COLUMNS,
  recordToRow,
  resolveAccountRowNum,
  sheetHeaders,
} from "./crm-sheet-mapping.js";
import type { Env } from "./env.js";
import {
  appendSheetRows,
  batchUpdateSheet,
  getGoogleAccessToken,
  readSheetValues,
  resolveSheetTitle,
  updateSheetValues,
  withRetry,
} from "./google-sheets.js";
import {
  getSyncState,
  listAccounts,
  listLeadsForSync,
  recordSyncRun,
  type LeadSyncRow,
} from "./accounts.js";
import { listOutreachForSync } from "./outreach.js";

const BATCH_SIZE = 200;
const ACCOUNTS_GID = 466934255;

export interface CrmSyncOptions {
  full?: boolean;
  leadsOnly?: boolean;
  accountsOnly?: boolean;
  outreachOnly?: boolean;
}

export interface CrmSyncResult {
  ok: boolean;
  runType: string;
  leadsUpserted: number;
  accountsUpserted: number;
  outreachUpserted: number;
  errors: string[];
}

function requireCrmConfig(env: Env): {
  spreadsheetId: string;
  serviceAccountJson: string;
  leadsSheet: string;
  accountsSheet: string;
  outreachSheet: string;
} {
  const spreadsheetId = env.CRM_SPREADSHEET_ID?.trim() || DEFAULT_SPREADSHEET_ID;
  const serviceAccountJson = env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (!serviceAccountJson) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not configured");
  return {
    spreadsheetId,
    serviceAccountJson,
    leadsSheet: env.CRM_SHEET_LEADS?.trim() || DEFAULT_LEADS_SHEET,
    accountsSheet: env.CRM_SHEET_ACCOUNTS?.trim() || DEFAULT_ACCOUNTS_SHEET,
    outreachSheet: env.CRM_SHEET_OUTREACH?.trim() || DEFAULT_OUTREACH_SHEET,
  };
}

async function upsertRecordsToSheet(
  token: string,
  spreadsheetId: string,
  sheetTitle: string,
  idHeader: string,
  headers: string[],
  records: Record<string, unknown>[],
  columns: ReadonlyArray<{ field: string; header: string }>,
  options: { accountCompanyFallback?: boolean } = {},
): Promise<number> {
  if (!records.length) return 0;

  const existing = await readSheetValues(token, spreadsheetId, `'${sheetTitle}'!A:ZZ`);
  if (!existing.length) {
    await updateSheetValues(token, spreadsheetId, `'${sheetTitle}'!A1`, [headers]);
    existing.push(headers);
  }

  const headerRow = existing[0].map((h) => h.trim().toLowerCase());
  if (!headerRow.includes(idHeader.trim().toLowerCase())) {
    await updateSheetValues(token, spreadsheetId, `'${sheetTitle}'!A1`, [headers]);
    existing[0] = headers;
  }

  const accountIndexes = options.accountCompanyFallback
    ? buildAccountRowIndexes(existing, idHeader, "Company Name")
    : null;
  const idIndex = accountIndexes ? null : buildIdRowIndex(existing, idHeader);
  const endCol = columnLetter(headers.length);
  const updates: Array<{ range: string; values: string[][] }> = [];
  const appends: string[][] = [];

  for (const record of records) {
    const rowId = String(record[columns[0].field] ?? "").trim();
    if (!rowId) continue;
    const values = recordToRow(record, columns);
    const rowNum = accountIndexes
      ? resolveAccountRowNum(accountIndexes, record)
      : idIndex!.get(rowId);
    if (rowNum) {
      updates.push({ range: `'${sheetTitle}'!A${rowNum}:${endCol}${rowNum}`, values: [values] });
    } else {
      appends.push(values);
    }
  }

  let count = 0;
  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const chunk = updates.slice(i, i + BATCH_SIZE);
    await withRetry(() => batchUpdateSheet(token, spreadsheetId, chunk));
    count += chunk.length;
  }
  for (let i = 0; i < appends.length; i += BATCH_SIZE) {
    const chunk = appends.slice(i, i + BATCH_SIZE);
    await withRetry(() => appendSheetRows(token, spreadsheetId, sheetTitle, chunk));
    count += chunk.length;
  }
  return count;
}

function maxUpdatedAt(leads: LeadSyncRow[]): string | null {
  let max: string | null = null;
  for (const lead of leads) {
    if (!lead.updated_at) continue;
    if (!max || lead.updated_at > max) max = lead.updated_at;
  }
  return max;
}

export async function runCrmSync(sql: Sql, env: Env, options: CrmSyncOptions = {}): Promise<CrmSyncResult> {
  const config = requireCrmConfig(env);
  const token = await getGoogleAccessToken(config.serviceAccountJson);
  const errors: string[] = [];
  let leadsUpserted = 0;
  let accountsUpserted = 0;
  let outreachUpserted = 0;
  let leadWatermark: string | null = null;

  const outreachOnly = options.outreachOnly === true;
  const syncLeads = !options.accountsOnly && !outreachOnly;
  const syncAccounts = !options.leadsOnly && !outreachOnly;
  const syncOutreach = outreachOnly || (!options.leadsOnly && !options.accountsOnly);
  const state = await getSyncState(sql, "leads_to_sheet");
  const full = options.full ?? !state?.last_lead_updated_at;
  const runType = options.outreachOnly ? "outreach" : full ? "full" : "incremental";

  if (syncLeads) {
    try {
      const leadsSheet = await resolveSheetTitle(token, config.spreadsheetId, config.leadsSheet);
      const watermark = full ? null : state?.last_lead_updated_at ?? null;
      const leads = await listLeadsForSync(sql, watermark, full);
      leadsUpserted = await upsertRecordsToSheet(
        token,
        config.spreadsheetId,
        leadsSheet,
        "Lead ID",
        sheetHeaders(LEAD_SHEET_COLUMNS),
        leads as unknown as Record<string, unknown>[],
        LEAD_SHEET_COLUMNS,
      );
      leadWatermark = maxUpdatedAt(leads);
    } catch (err) {
      errors.push(`leads: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (syncAccounts) {
    try {
      const accountsSheet = await resolveSheetTitle(
        token,
        config.spreadsheetId,
        config.accountsSheet,
        ACCOUNTS_GID,
      );
      const accounts = await listAccounts(sql);
      accountsUpserted = await upsertRecordsToSheet(
        token,
        config.spreadsheetId,
        accountsSheet,
        "Account ID",
        sheetHeaders(ACCOUNT_SHEET_COLUMNS),
        accounts as unknown as Record<string, unknown>[],
        ACCOUNT_SHEET_COLUMNS,
        { accountCompanyFallback: true },
      );
    } catch (err) {
      errors.push(`accounts: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (syncOutreach) {
    try {
      const outreachSheet = await resolveSheetTitle(
        token,
        config.spreadsheetId,
        config.outreachSheet,
      );
      const outreach = await listOutreachForSync(sql);
      outreachUpserted = await upsertRecordsToSheet(
        token,
        config.spreadsheetId,
        outreachSheet,
        "Lead ID",
        sheetHeaders(OUTREACH_SHEET_COLUMNS),
        outreach as unknown as Record<string, unknown>[],
        OUTREACH_SHEET_COLUMNS,
      );
    } catch (err) {
      errors.push(`outreach: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (!errors.length) {
    await recordSyncRun(sql, {
      runType,
      leadsUpserted,
      accountsUpserted,
      outreachUpserted,
      errors: null,
      leadWatermark: syncLeads ? leadWatermark : null,
    });
  } else {
    await recordSyncRun(sql, {
      runType: "partial",
      leadsUpserted,
      accountsUpserted,
      outreachUpserted,
      errors,
      leadWatermark: null,
    });
  }

  return {
    ok: errors.length === 0,
    runType: errors.length ? "partial" : runType,
    leadsUpserted,
    accountsUpserted,
    outreachUpserted,
    errors,
  };
}
