import { NextResponse } from "next/server";
import { google } from "googleapis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function norm(v: any) {
  return String(v ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function jsonOk(payload: any, status = 200) {
  return NextResponse.json(payload, { status });
}

function getCredentials() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) return { ok: false as const, error: "Missing GOOGLE_SERVICE_ACCOUNT_JSON env var" };
  try {
    const creds = JSON.parse(raw);
    return { ok: true as const, creds };
  } catch {
    return { ok: false as const, error: "GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON" };
  }
}

function pickHeaderIndex(headers: string[], candidates: string[]) {
  const H = headers.map((h) => norm(h));
  for (const c of candidates) {
    const i = H.indexOf(norm(c));
    if (i >= 0) return i;
  }
  for (let i = 0; i < H.length; i++) {
    const h = H[i];
    if (candidates.some((c) => h.includes(norm(c)))) return i;
  }
  return -1;
}

function colLetter(index0: number) {
  // 0 -> A, 25 -> Z, 26 -> AA
  let n = index0 + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) return jsonOk({ success: false, error: "Invalid JSON body" }, 200);

    const { sheetId, row, field, value } = body as {
      sheetId: string;
      row: number;
      field: "paymentStatus" | "shippingRequired" | "shippedStatus";
      value: string; // "Y" or ""
    };

    if (!sheetId || !row || !field) {
      return jsonOk({ success: false, error: "Missing sheetId, row, or field" }, 200);
    }

    const c = getCredentials();
    if (!c.ok) return jsonOk({ success: false, error: c.error }, 200);

    const auth = new google.auth.GoogleAuth({
      credentials: c.creds,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });

    const sheets = google.sheets({ version: "v4", auth });

    // Get first sheet name + headers so we know what column to update
    const meta = await sheets.spreadsheets.get({
      spreadsheetId: sheetId,
      fields: "sheets(properties(title))",
    });

    const sheetName = meta.data.sheets?.[0]?.properties?.title || "Sheet1";

    const valuesRes = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${sheetName}!A:Z`,
    });

    const rows = valuesRes.data.values ?? [];
    if (rows.length < 1) return jsonOk({ success: false, error: "Sheet has no header row" }, 200);

    const headers = (rows[0] as any[]).map((x) => String(x ?? ""));

    let idx = -1;
    if (field === "paymentStatus") idx = pickHeaderIndex(headers, ["payment status", "paid", "payment"]);
    if (field === "shippingRequired") idx = pickHeaderIndex(headers, ["shipping required", "ship required", "shipping"]);
    if (field === "shippedStatus") idx = pickHeaderIndex(headers, ["shipped status", "shipping status", "shipped"]);

    if (idx < 0) {
      return jsonOk({ success: false, error: `Could not find column for ${field}` }, 200);
    }

    const cell = `${sheetName}!${colLetter(idx)}${row}`;

    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: cell,
      valueInputOption: "RAW",
      requestBody: {
        values: [[value ?? ""]],
      },
    });

    return jsonOk({ success: true, updated: { sheetId, cell, value: value ?? "" } }, 200);
  } catch (e: any) {
    return jsonOk({ success: false, error: e?.message || "Update failed" }, 200);
  }
}