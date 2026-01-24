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
      "https://www.googleapis.com/auth/spreadsheets.readonly",
    ],
  });
}

function norm(v: any) {
  return String(v ?? "").toLowerCase().trim().replace(/\s+/g, " ");
}
function isYes(v: any) {
  const n = norm(v);
  return n === "y" || n === "yes" || n === "true" || n === "1";
}
function isBlank(v: any) {
  return norm(v) === "";
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

function parseAuctionNumberFromTitle(title: string) {
  const m = String(title || "").match(/(\d{1,4})/);
  return m ? Number(m[1]) : null;
}

export async function GET() {
  try {
    const AUCTIONS_FOLDER_ID = process.env.AUCTIONS_FOLDER_ID;
    if (!AUCTIONS_FOLDER_ID) {
      return NextResponse.json(
        { success: false, error: "Missing AUCTIONS_FOLDER_ID (Drive folder that contains your auction Google Sheets)" },
        { status: 500 }
      );
    }

    const tabName = process.env.SHEET_TAB_NAME || "Sheet1";

    const auth = getAuth();
    const drive = google.drive({ version: "v3", auth });
    const sheets = google.sheets({ version: "v4", auth });

    const filesRes = await drive.files.list({
      q: `'${AUCTIONS_FOLDER_ID}' in parents and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`,
      fields: "files(id,name)",
      pageSize: 200,
    });

    const files = filesRes.data.files || [];
    const shipments: any[] = [];

    for (const f of files) {
      if (!f.id) continue;

      const sheetId = f.id;
      const sheetName = f.name || "";
      const auctionNumber = parseAuctionNumberFromTitle(sheetName);

      const valuesRes = await sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range: `${tabName}!A:ZZ`,
      });

      const rows = valuesRes.data.values || [];
      if (rows.length < 2) continue;

      const headers = rows[0].map((x: any) => String(x ?? ""));

      const idxBidcard = pickHeaderIndex(headers, ["bidder number", "bidder #", "bidcard", "bid card"]);
      const idxFirst = pickHeaderIndex(headers, ["buyer first name", "first name", "firstname"]);
      const idxLast = pickHeaderIndex(headers, ["buyer last name", "last name", "lastname"]);
      const idxLots = pickHeaderIndex(headers, ["lots bought", "lots won", "lots", "lot count"]);

      const idxPayment = pickHeaderIndex(headers, ["payment status", "paid", "payment"]);
      const idxShipReq = pickHeaderIndex(headers, ["shipping required", "ship required", "shipping"]);
      const idxShipped = pickHeaderIndex(headers, ["shipped status", "shipping status", "shipped", "ship status"]);

      // Must have these to filter
      if (idxPayment < 0 || idxShipReq < 0 || idxShipped < 0) continue;

      for (let r = 1; r < rows.length; r++) {
        const row = rows[r] || [];

        const paymentVal = row[idxPayment];
        const shipReqVal = row[idxShipReq];
        const shippedVal = row[idxShipped];

        // outstanding shipments rule
        if (isYes(paymentVal) && isYes(shipReqVal) && isBlank(shippedVal)) {
          const rowNumber = r + 1;

          shipments.push({
            sheetId,
            sheetName,
            auctionNumber,
            rowNumber,
            bidcard: idxBidcard >= 0 ? String(row[idxBidcard] ?? "").trim() : "",
            firstName: idxFirst >= 0 ? String(row[idxFirst] ?? "").trim() : "",
            lastName: idxLast >= 0 ? String(row[idxLast] ?? "").trim() : "",
            lotsWon: idxLots >= 0 ? String(row[idxLots] ?? "").trim() : "",
            paymentStatus: "Y",
            shippingRequired: "Y",
            shippedStatus: "",
          });
        }
      }
    }

    return NextResponse.json({ success: true, count: shipments.length, shipments });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || String(e) },
      { status: 500 }
    );
  }
}import { NextResponse } from "next/server";
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
      "https://www.googleapis.com/auth/spreadsheets.readonly",
    ],
  });
}

function norm(v: any) {
  return String(v ?? "").toLowerCase().trim().replace(/\s+/g, " ");
}
function isYes(v: any) {
  const n = norm(v);
  return n === "y" || n === "yes" || n === "true" || n === "1";
}
function isBlank(v: any) {
  return norm(v) === "";
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

function parseAuctionNumberFromTitle(title: string) {
  const m = String(title || "").match(/(\d{1,4})/);
  return m ? Number(m[1]) : null;
}

export async function GET() {
  try {
    const AUCTIONS_FOLDER_ID = process.env.AUCTIONS_FOLDER_ID;
    if (!AUCTIONS_FOLDER_ID) {
      return NextResponse.json(
        { success: false, error: "Missing AUCTIONS_FOLDER_ID (Drive folder that contains your auction Google Sheets)" },
        { status: 500 }
      );
    }

    const tabName = process.env.SHEET_TAB_NAME || "Sheet1";

    const auth = getAuth();
    const drive = google.drive({ version: "v3", auth });
    const sheets = google.sheets({ version: "v4", auth });

    const filesRes = await drive.files.list({
      q: `'${AUCTIONS_FOLDER_ID}' in parents and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`,
      fields: "files(id,name)",
      pageSize: 200,
    });

    const files = filesRes.data.files || [];
    const shipments: any[] = [];

    for (const f of files) {
      if (!f.id) continue;

      const sheetId = f.id;
      const sheetName = f.name || "";
      const auctionNumber = parseAuctionNumberFromTitle(sheetName);

      const valuesRes = await sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range: `${tabName}!A:ZZ`,
      });

      const rows = valuesRes.data.values || [];
      if (rows.length < 2) continue;

      const headers = rows[0].map((x: any) => String(x ?? ""));

      const idxBidcard = pickHeaderIndex(headers, ["bidder number", "bidder #", "bidcard", "bid card"]);
      const idxFirst = pickHeaderIndex(headers, ["buyer first name", "first name", "firstname"]);
      const idxLast = pickHeaderIndex(headers, ["buyer last name", "last name", "lastname"]);
      const idxLots = pickHeaderIndex(headers, ["lots bought", "lots won", "lots", "lot count"]);

      const idxPayment = pickHeaderIndex(headers, ["payment status", "paid", "payment"]);
      const idxShipReq = pickHeaderIndex(headers, ["shipping required", "ship required", "shipping"]);
      const idxShipped = pickHeaderIndex(headers, ["shipped status", "shipping status", "shipped", "ship status"]);

      // Must have these to filter
      if (idxPayment < 0 || idxShipReq < 0 || idxShipped < 0) continue;

      for (let r = 1; r < rows.length; r++) {
        const row = rows[r] || [];

        const paymentVal = row[idxPayment];
        const shipReqVal = row[idxShipReq];
        const shippedVal = row[idxShipped];

        // outstanding shipments rule
        if (isYes(paymentVal) && isYes(shipReqVal) && isBlank(shippedVal)) {
          const rowNumber = r + 1;

          shipments.push({
            sheetId,
            sheetName,
            auctionNumber,
            rowNumber,
            bidcard: idxBidcard >= 0 ? String(row[idxBidcard] ?? "").trim() : "",
            firstName: idxFirst >= 0 ? String(row[idxFirst] ?? "").trim() : "",
            lastName: idxLast >= 0 ? String(row[idxLast] ?? "").trim() : "",
            lotsWon: idxLots >= 0 ? String(row[idxLots] ?? "").trim() : "",
            paymentStatus: "Y",
            shippingRequired: "Y",
            shippedStatus: "",
          });
        }
      }
    }

    return NextResponse.json({ success: true, count: shipments.length, shipments });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || String(e) },
      { status: 500 }
    );
  }
}