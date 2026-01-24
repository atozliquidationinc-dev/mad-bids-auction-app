export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { google } from "googleapis";

function norm(v: any) {
  return String(v ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}
function startsYes(v: any) {
  return norm(v).startsWith("y"); // y, Y, y - hibid, etc
}
function isBlank(v: any) {
  return norm(v) === "";
}

function getAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_JSON");
  const credentials = JSON.parse(raw);

  return new google.auth.GoogleAuth({
    credentials,
    scopes: [
      "https://www.googleapis.com/auth/drive.readonly",
      "https://www.googleapis.com/auth/spreadsheets.readonly",
    ],
  });
}

function extractAuctionNumber(name: string) {
  const m = String(name || "").match(/(\d+)/);
  return m ? Number(m[1]) : null;
}

function findHeaderRow(rows: any[][]) {
  // Your sheet sometimes has a blank first row, then headers on row 2
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const joined = (rows[i] || []).map(norm).join("|");
    if (joined.includes("bidder number") && joined.includes("payment status")) return i;
  }
  return 0; // fallback
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const debug = url.searchParams.get("debug") === "1";

    const sheetsFolderId = process.env.AUCTION_SHEETS_FOLDER_ID;
    if (!sheetsFolderId) {
      return NextResponse.json(
        { success: false, error: "Missing AUCTION_SHEETS_FOLDER_ID" },
        { status: 500 }
      );
    }

    const auth = getAuth();
    const drive = google.drive({ version: "v3", auth });
    const sheets = google.sheets({ version: "v4", auth });

    // 1) List all auction sheet FILES in your Auction Sheets folder
    const listRes = await drive.files.list({
      q: `'${sheetsFolderId}' in parents and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`,
      fields: "files(id,name)",
      pageSize: 200,
    });

    const files = (listRes.data.files || [])
      .map((f) => ({
        id: f.id || "",
        name: f.name || "",
        auctionNum: extractAuctionNumber(f.name || ""),
      }))
      .filter((f) => f.id);

    const shipments: any[] = [];
    const debugSheets: any[] = [];

    for (const f of files) {
      const valuesRes = await sheets.spreadsheets.values.get({
        spreadsheetId: f.id,
        range: "Sheet1!A:Z",
      });

      const rows = (valuesRes.data.values || []) as any[][];
      if (rows.length < 2) continue;

      const headerRowIndex = findHeaderRow(rows);
      const headersRaw = rows[headerRowIndex] || [];
      const headers = headersRaw.map(norm);

      const idx = (name: string) => headers.indexOf(norm(name));

      // Columns (case/space tolerant)
      const iFirst = idx("buyer first name");
      const iLast = idx("buyer last name");
      const iBidder = idx("bidder number");
      const iLots = idx("lots bought");
      const iBalance = idx("balance");
      const iPay = idx("payment status");
      const iShipReq = idx("shipping required");
      const iShipped = idx("shipped status"); // your sheet uses this

      const missing =
        iBidder === -1 || iPay === -1 || iShipReq === -1 || iShipped === -1;

      if (debug) {
        debugSheets.push({
          sheetName: f.name,
          sheetId: f.id,
          headerRowIndex,
          missing,
          headers: headersRaw,
        });
      }

      if (missing) continue;

      const dataRows = rows.slice(headerRowIndex + 1);

      for (const r of dataRows) {
        const bidcard = String(r[iBidder] ?? "").trim();
        if (!bidcard) continue;

        const balance = r[iBalance];
        const paymentStatus = r[iPay];
        const shippingRequired = r[iShipReq];
        const shippedStatus = r[iShipped];

        // ✅ YOUR EXACT RULES:
        // Payment status: Y
        // Shipping required: Y
        // Shipment status: BLANK
        const shipReqYes = startsYes(shippingRequired);
        const paidYes = startsYes(paymentStatus);
        const shippedBlank = isBlank(shippedStatus);

        if (!shipReqYes) continue;
        if (!paidYes) continue;
        if (!shippedBlank) continue;

        // Return fields that are easier for the UI to use
        shipments.push({
          auctionNumber: f.auctionNum ?? null,
          auctionName: f.name,
          bidderNumber: bidcard,

          firstName: iFirst !== -1 ? String(r[iFirst] ?? "").trim() : "",
          lastName: iLast !== -1 ? String(r[iLast] ?? "").trim() : "",
          lotsBought: iLots !== -1 ? String(r[iLots] ?? "").trim() : "",

          balance: String(balance ?? "").trim(),
          paymentStatus: String(paymentStatus ?? "").trim(),
          shippingRequired: String(shippingRequired ?? "").trim(),
          shippedStatus: String(shippedStatus ?? "").trim(),
        });
      }
    }

    return NextResponse.json({
      success: true,
      count: shipments.length,
      outstandingCount: shipments.length,
      shipments,
      ...(debug ? { sheetsFound: files.length, debugSheets } : {}),
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || String(err) },
      { status: 500 }
    );
  }
}
