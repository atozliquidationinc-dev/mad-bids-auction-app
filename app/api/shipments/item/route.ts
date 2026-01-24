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

async function findInvoicePdfUrl(drive: any, bidcard: string) {
  const folderId = process.env.INVOICE_PDF_FOLDER_ID;
  if (!folderId) return null;
  if (!bidcard) return null;

  const filename = `${bidcard}.pdf`;

  const res = await drive.files.list({
    q: `'${folderId}' in parents and name='${filename}' and trashed=false`,
    fields: "files(id,name,webViewLink,webContentLink)",
    pageSize: 5,
  });

  const file = (res.data.files || [])[0];
  if (!file) return null;
  return file.webViewLink || file.webContentLink || null;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const sheetId = url.searchParams.get("sheetId") || "";
    const rowNumber = Number(url.searchParams.get("rowNumber") || "0");
    if (!sheetId || !Number.isFinite(rowNumber) || rowNumber < 2) {
      return NextResponse.json(
        { success: false, error: "Missing/invalid sheetId or rowNumber" },
        { status: 400 }
      );
    }

    const tabName = process.env.SHEET_TAB_NAME || "Sheet1";

    const auth = getAuth();
    const drive = google.drive({ version: "v3", auth });
    const sheets = google.sheets({ version: "v4", auth });

    const headersRes = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${tabName}!1:1`,
    });

    const headersRow = (headersRes.data.values || [])[0] || [];
    const headers = headersRow.map((x: any) => String(x ?? ""));

    const idxBidcard = pickHeaderIndex(headers, ["bidder number", "bidder #", "bidcard", "bid card"]);
    const idxFirst = pickHeaderIndex(headers, ["buyer first name", "first name", "firstname"]);
    const idxLast = pickHeaderIndex(headers, ["buyer last name", "last name", "lastname"]);
    const idxLots = pickHeaderIndex(headers, ["lots bought", "lots won", "lots", "lot count"]);
    const idxPayment = pickHeaderIndex(headers, ["payment status", "paid", "payment"]);
    const idxShipReq = pickHeaderIndex(headers, ["shipping required", "ship required", "shipping"]);
    const idxShipped = pickHeaderIndex(headers, ["shipped status", "shipping status", "shipped", "ship status"]);

    const rowRes = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${tabName}!${rowNumber}:${rowNumber}`,
    });

    const row = ((rowRes.data.values || [])[0] || []) as any[];

    const bidcard = idxBidcard >= 0 ? String(row[idxBidcard] ?? "").trim() : "";
    const item = {
      sheetId,
      rowNumber,
      bidcard,
      firstName: idxFirst >= 0 ? String(row[idxFirst] ?? "").trim() : "",
      lastName: idxLast >= 0 ? String(row[idxLast] ?? "").trim() : "",
      lotsWon: idxLots >= 0 ? String(row[idxLots] ?? "").trim() : "",
      paymentStatus: idxPayment >= 0 && isYes(row[idxPayment]) ? "Y" : "",
      shippingRequired: idxShipReq >= 0 && isYes(row[idxShipReq]) ? "Y" : "",
      shippedStatus: idxShipped >= 0 && isYes(row[idxShipped]) ? "Y" : "",
      invoiceUrl: await findInvoicePdfUrl(drive, bidcard),
    };

    return NextResponse.json({ success: true, item });
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

async function findInvoicePdfUrl(drive: any, bidcard: string) {
  const folderId = process.env.INVOICE_PDF_FOLDER_ID;
  if (!folderId) return null;
  if (!bidcard) return null;

  const filename = `${bidcard}.pdf`;

  const res = await drive.files.list({
    q: `'${folderId}' in parents and name='${filename}' and trashed=false`,
    fields: "files(id,name,webViewLink,webContentLink)",
    pageSize: 5,
  });

  const file = (res.data.files || [])[0];
  if (!file) return null;
  return file.webViewLink || file.webContentLink || null;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const sheetId = url.searchParams.get("sheetId") || "";
    const rowNumber = Number(url.searchParams.get("rowNumber") || "0");
    if (!sheetId || !Number.isFinite(rowNumber) || rowNumber < 2) {
      return NextResponse.json(
        { success: false, error: "Missing/invalid sheetId or rowNumber" },
        { status: 400 }
      );
    }

    const tabName = process.env.SHEET_TAB_NAME || "Sheet1";

    const auth = getAuth();
    const drive = google.drive({ version: "v3", auth });
    const sheets = google.sheets({ version: "v4", auth });

    const headersRes = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${tabName}!1:1`,
    });

    const headersRow = (headersRes.data.values || [])[0] || [];
    const headers = headersRow.map((x: any) => String(x ?? ""));

    const idxBidcard = pickHeaderIndex(headers, ["bidder number", "bidder #", "bidcard", "bid card"]);
    const idxFirst = pickHeaderIndex(headers, ["buyer first name", "first name", "firstname"]);
    const idxLast = pickHeaderIndex(headers, ["buyer last name", "last name", "lastname"]);
    const idxLots = pickHeaderIndex(headers, ["lots bought", "lots won", "lots", "lot count"]);
    const idxPayment = pickHeaderIndex(headers, ["payment status", "paid", "payment"]);
    const idxShipReq = pickHeaderIndex(headers, ["shipping required", "ship required", "shipping"]);
    const idxShipped = pickHeaderIndex(headers, ["shipped status", "shipping status", "shipped", "ship status"]);

    const rowRes = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${tabName}!${rowNumber}:${rowNumber}`,
    });

    const row = ((rowRes.data.values || [])[0] || []) as any[];

    const bidcard = idxBidcard >= 0 ? String(row[idxBidcard] ?? "").trim() : "";
    const item = {
      sheetId,
      rowNumber,
      bidcard,
      firstName: idxFirst >= 0 ? String(row[idxFirst] ?? "").trim() : "",
      lastName: idxLast >= 0 ? String(row[idxLast] ?? "").trim() : "",
      lotsWon: idxLots >= 0 ? String(row[idxLots] ?? "").trim() : "",
      paymentStatus: idxPayment >= 0 && isYes(row[idxPayment]) ? "Y" : "",
      shippingRequired: idxShipReq >= 0 && isYes(row[idxShipReq]) ? "Y" : "",
      shippedStatus: idxShipped >= 0 && isYes(row[idxShipped]) ? "Y" : "",
      invoiceUrl: await findInvoicePdfUrl(drive, bidcard),
    };

    return NextResponse.json({ success: true, item });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || String(e) },
      { status: 500 }
    );
  }
}