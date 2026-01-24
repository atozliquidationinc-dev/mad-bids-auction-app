import { NextResponse } from "next/server";
import { google } from "googleapis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function norm(v: any) {
  return String(v ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function getAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_JSON");
  const credentials = JSON.parse(raw);

  // WRITE scopes:
  return new google.auth.GoogleAuth({
    credentials,
    scopes: [
      "https://www.googleapis.com/auth/drive",
      "https://www.googleapis.com/auth/spreadsheets",
    ],
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const sheetId = body?.sheetId;
    const row = Number(body?.row);

    // expects booleans:
    // { paymentStatus: true/false, shippingRequired: true/false, shippedStatus: true/false }
    const updates = body?.updates ?? {};

    if (!sheetId || !Number.isFinite(row) || row < 2) {
      return NextResponse.json(
        { success: false, error: "Missing/invalid sheetId or row" },
        { status: 400 }
      );
    }

    const auth = getAuth();
    const sheets = google.sheets({ version: "v4", auth });

    const meta = await sheets.spreadsheets.get({
      spreadsheetId: sheetId,
      fields: "sheets.properties.title",
    });

    const firstSheetTitle = meta.data.sheets?.[0]?.properties?.title;
    if (!firstSheetTitle) throw new Error("Could not detect sheet tab name");

    // Pull headers to find the right columns
    const valuesRes = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${firstSheetTitle}!A1:Z1`,
    });

    const headers = (valuesRes.data.values?.[0] ?? []).map((h) => String(h ?? "").trim());
    const hNorm = headers.map((h) => norm(h));

    const findCol = (options: string[]) => {
      for (const o of options) {
        const i = hNorm.indexOf(norm(o));
        if (i !== -1) return i;
      }
      return -1;
    };

    const idxPay = findCol(["Payment Status", "Paid", "Payment"]);
    const idxShipReq = findCol(["Shipping Required", "Shipping", "Ship Required"]);
    const idxShipped = findCol(["Shipped status", "Shipping status", "Shipped", "Shipment status"]);

    if (idxPay === -1 || idxShipReq === -1 || idxShipped === -1) {
      return NextResponse.json(
        { success: false, error: "Missing required shipment columns in sheet header" },
        { status: 500 }
      );
    }

    // Helper: column number -> A1 letter
    const colToA1 = (colIndexZero: number) => {
      let n = colIndexZero + 1;
      let s = "";
      while (n > 0) {
        const m = (n - 1) % 26;
        s = String.fromCharCode(65 + m) + s;
        n = Math.floor((n - 1) / 26);
      }
      return s;
    };

    const writeOps: { range: string; value: string }[] = [];

    if (typeof updates.paymentStatus === "boolean") {
      writeOps.push({
        range: `${firstSheetTitle}!${colToA1(idxPay)}${row}`,
        value: updates.paymentStatus ? "Y" : "",
      });
    }
    if (typeof updates.shippingRequired === "boolean") {
      writeOps.push({
        range: `${firstSheetTitle}!${colToA1(idxShipReq)}${row}`,
        value: updates.shippingRequired ? "Y" : "",
      });
    }
    if (typeof updates.shippedStatus === "boolean") {
      writeOps.push({
        range: `${firstSheetTitle}!${colToA1(idxShipped)}${row}`,
        value: updates.shippedStatus ? "Y" : "",
      });
    }

    if (writeOps.length === 0) {
      return NextResponse.json(
        { success: false, error: "No updates provided" },
        { status: 400 }
      );
    }

    // Batch update
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: sheetId,
      requestBody: {
        valueInputOption: "RAW",
        data: writeOps.map((op) => ({
          range: op.range,
          values: [[op.value]],
        })),
      },
    });

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}