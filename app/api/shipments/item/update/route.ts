import { NextResponse } from "next/server";
import { google } from "googleapis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function norm(v: any) {
  return String(v ?? "").trim().toLowerCase().replace(/\s+/g, " ");
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
  let n = index0 + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function findHeaderRowIndex(rows: any[][]) {
  const scanMax = Math.min(rows.length, 40);
  for (let i = 0; i < scanMax; i++) {
    const r = rows[i] || [];
    const n = r.map((x) => norm(x));
    if (
      n.includes("bidder number") ||
      n.includes("bidder #") ||
      n.includes("bidcard") ||
      n.includes("bid card")
    ) {
      return i;
    }
  }
  return 0;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
    }

    const sheetId = String(body.sheetId || "");
    const row = Number(body.row);
    const field = String(body.field || ""); // expects "shippedStatus"
    const value = String(body.value ?? ""); // "Y" or ""

    if (!sheetId || !Number.isFinite(row) || row < 2) {
      return NextResponse.json({ success: false, error: "Missing/invalid sheetId or row" }, { status: 400 });
    }

    if (field !== "shippedStatus") {
      return NextResponse.json({ success: false, error: "Only shippedStatus can be updated here" }, { status: 400 });
    }

    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(mustEnv("GOOGLE_SERVICE_ACCOUNT_JSON")),
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });

    const sheets = google.sheets({ version: "v4", auth });

    const meta = await sheets.spreadsheets.get({
      spreadsheetId: sheetId,
      fields: "sheets(properties(title))",
    });
    const tab = meta.data.sheets?.[0]?.properties?.title;
    if (!tab) throw new Error("No tabs found in spreadsheet");

    const valuesRes = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${tab}!A:Z`,
    });

    const rows = (valuesRes.data.values ?? []) as any[][];
    if (rows.length < 1) throw new Error("Sheet is empty");

    const headerRowIndex = findHeaderRowIndex(rows);
    const headers = (rows[headerRowIndex] ?? []).map((x) => String(x ?? ""));

    const idxShipped = pickHeaderIndex(headers, [
      "Shipped status",
      "Shipping status",
      "Shipped",
      "Ship status",
      "Shipment status",
    ]);

    if (idxShipped < 0) {
      return NextResponse.json({ success: false, error: 'Missing column: "Shipped status"' }, { status: 400 });
    }

    const targetA1 = `${tab}!${colLetter(idxShipped)}${row}`;
    const next = value === "Y" ? "Y" : "";

    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: targetA1,
      valueInputOption: "RAW",
      requestBody: { values: [[next]] },
    });

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || String(e) }, { status: 500 });
  }
}
