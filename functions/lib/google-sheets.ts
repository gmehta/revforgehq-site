interface ServiceAccount {
  client_email: string;
  private_key: string;
  token_uri: string;
}

let cachedToken: { value: string; expiresAt: number } | null = null;

function base64UrlEncode(data: Uint8Array | string): string {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const pemContents = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s/g, "");
  const binary = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey(
    "pkcs8",
    binary.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

export async function getGoogleAccessToken(serviceAccountJson: string): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value;
  }

  const sa = JSON.parse(serviceAccountJson) as ServiceAccount;
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64UrlEncode(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/spreadsheets",
      aud: sa.token_uri,
      exp: now + 3600,
      iat: now,
    }),
  );
  const key = await importPrivateKey(sa.private_key);
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(`${header}.${payload}`),
  );
  const jwt = `${header}.${payload}.${base64UrlEncode(new Uint8Array(signature))}`;

  const resp = await fetch(sa.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Google token exchange failed (${resp.status}): ${text}`);
  }
  const body = (await resp.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    value: body.access_token,
    expiresAt: Date.now() + body.expires_in * 1000,
  };
  return body.access_token;
}

async function sheetsFetch(
  token: string,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${path}`;
  const resp = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (resp.status === 429 || resp.status >= 500) {
    const text = await resp.text();
    throw new Error(`Sheets API transient error (${resp.status}): ${text}`);
  }
  return resp;
}

export async function readSheetValues(
  token: string,
  spreadsheetId: string,
  range: string,
): Promise<string[][]> {
  const encodedRange = encodeURIComponent(range);
  const resp = await sheetsFetch(
    token,
    `${spreadsheetId}/values/${encodedRange}?valueRenderOption=FORMATTED_VALUE`,
  );
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Sheets read failed (${resp.status}): ${text}`);
  }
  const body = (await resp.json()) as { values?: string[][] };
  return body.values ?? [];
}

export async function updateSheetValues(
  token: string,
  spreadsheetId: string,
  range: string,
  values: string[][],
): Promise<void> {
  const encodedRange = encodeURIComponent(range);
  const resp = await sheetsFetch(token, `${spreadsheetId}/values/${encodedRange}?valueInputOption=USER_ENTERED`, {
    method: "PUT",
    body: JSON.stringify({ values }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Sheets update failed (${resp.status}): ${text}`);
  }
}

export async function batchUpdateSheet(
  token: string,
  spreadsheetId: string,
  data: Array<{ range: string; values: string[][] }>,
): Promise<void> {
  const resp = await sheetsFetch(token, `${spreadsheetId}/values:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({ valueInputOption: "USER_ENTERED", data }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Sheets batchUpdate failed (${resp.status}): ${text}`);
  }
}

export async function appendSheetRows(
  token: string,
  spreadsheetId: string,
  sheetTitle: string,
  values: string[][],
): Promise<void> {
  const range = encodeURIComponent(`'${sheetTitle}'!A:A`);
  const resp = await sheetsFetch(
    token,
    `${spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    {
      method: "POST",
      body: JSON.stringify({ values }),
    },
  );
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Sheets append failed (${resp.status}): ${text}`);
  }
}

export async function resolveSheetTitle(
  token: string,
  spreadsheetId: string,
  preferred: string,
  gid?: number,
): Promise<string> {
  const resp = await sheetsFetch(token, spreadsheetId);
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Spreadsheet metadata failed (${resp.status}): ${text}`);
  }
  const body = (await resp.json()) as {
    sheets?: Array<{ properties?: { title?: string; sheetId?: number } }>;
  };
  const sheets = body.sheets ?? [];
  const titles = sheets.map((s) => s.properties?.title).filter(Boolean) as string[];
  if (titles.includes(preferred)) return preferred;
  if (gid != null) {
    for (const sheet of sheets) {
      if (sheet.properties?.sheetId === gid) {
        return sheet.properties.title ?? preferred;
      }
    }
  }
  if (titles.length) return titles[0];
  throw new Error("Spreadsheet has no sheets");
}

export async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 5): Promise<T> {
  let delay = 1000;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const retryable = /429|500|503|transient/i.test(message);
      if (!retryable || attempt === maxAttempts - 1) throw err;
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay *= 2;
    }
  }
  throw new Error("Retry exhausted");
}
