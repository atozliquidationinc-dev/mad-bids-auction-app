import { NextResponse } from "next/server";
import { google } from "googleapis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_JSON");
  const credentials = JSON.parse(raw);

  return new google.auth.GoogleAuth({
    credentials,
    scopes: [
      "https://www.googleapis.com/auth/drive.readonly",
      "https://www.googleapis.com/auth/spreadsheets",
    ],
  });
}

function norm(v: any) {
  return String(v ?? "").toLowerCase().trim().replace(/\s+/g, " ");
}

function pickHeaderIndex(headers: string[], candidates: string[]) {
  const h = headers.map((x) => norm(x));
  for (const c of candidates) {
    const idx = h.findIndex((x) => x === norm(c));
    if (idx >= 0) return idx;
  }
  for (const c of candidates) {
    const idx = h.findIndex((x) => x.includes(norm(c)));
    if (idx >= 0) return idx;
  }
  return -1;
}

function colLetter(colIndexZeroBased: number) {
  let n = colIndexZeroBased + 1;
  let s = "";
  while (n > 0) {
    const mod = (n - 1) % 26;
    s = String.fromCharCode(65 + mod) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const sheetId = String(body.sheetId || "");
    const rowNumber = Number(body.rowNumber);

    const paymentStatus = body.paymentStatus === "Y" ? "Y" : "";
    const shippingRequired = body.shippingRequired === "Y" ? "Y" : "";
    const shippedStatus = body.shippedStatus === "Y" ? "Y" : "";

    if (!sheetId || !Number.isFinite(rowNumber) || rowNumber < 2) {
      return NextResponse.json(
        { success: false, error: "Missing/invalid sheetId or rowNumber" },
        { status: 400 }
      );
    }

    const tabName = process.env.SHEET_TAB_NAME || "Sheet1";

    const auth = getAuth();
    const sheets = google.sheets({ version: "v4", auth });

    const headersRes = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${tabName}!1:1`,
    });

    const headersRow = (headersRes.data.values || [])[0] || [];
    const headers = headersRow.map((x: any) => String(x ?? ""));

    const idxPayment = pickHeaderIndex(headers, ["payment status", "paid", "payment"]);
    const idxShipReq = pickHeaderIndex(headers, ["shipping required", "ship required", "shipping"]);
    const idxShipped = pickHeaderIndex(headers, ["shipped", "shipping status", "ship status"]);

    if (idxPayment < 0 || idxShipReq < 0 || idxShipped < 0) {
      return NextResponse.json(
        { success: false, error: "Could not find payment/shipping/shipped columns in header row" },
        { status: 400 }
      );
    }

    const data = [
      { range: `${tabName}!${colLetter(idxPayment)}${rowNumber}`, values: [[paymentStatus]] },
      { range: `${tabName}!${colLetter(idxShipReq)}${rowNumber}`, values: [[shippingRequired]] },
      { range: `${tabName}!${colLetter(idxShipped)}${rowNumber}`, values: [[shippedStatus]] },
    ];

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: sheetId,
      requestBody: { valueInputOption: "RAW", data },
    });

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || String(e) },
      { status: 500 }
    );
  }
}