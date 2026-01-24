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

function isYes(v: any) {
  const n = norm(v);
  return n === "y" || n === "yes" || n === "true" || n === "1";
}

function isBlank(v: any) {
  return String(v ?? "").trim() === "";
}

function pickHeaderIndex(headers: string[], candidates: string[]) {
  const H = headers.map((h) => norm(h));
  for (const c of candidates) {
    const i = H.indexOf(norm(c));
    if (i >= 0) return i;
  }
  // fallback: partial match
  for (let i = 0; i < H.length; i++) {
    const h = H[i];
    if (candidates.some((c) => h.includes(norm(c)))) return i;
  }
  return -1;
}

function extractAuctionNumber(name: string) {
  const m = String(name || "").match(/(\d+)/);
  return m?.[1] ?? "";
}

async function listAllSpreadsheetsInFolder(drive: any, folderId: string) {
  const out: { id: string; name: string }[] = [];
  let pageToken: string | undefined = undefined;

  const q = [
    `'${folderId}' in parents`,
    `mimeType='application/vnd.google-apps.spreadsheet'`,
    `trashed=false`,
  ].join(" and ");

  do {
    const res = await drive.files.list({
      q,
      fields: "nextPageToken,files(id,name)",
      pageSize: 100,
      pageToken,
    });
    for (const f of res.data.files ?? []) {
      if (f.id && f.name) out.push({ id: f.id, name: f.name });
    }
    pageToken = res.data.nextPageToken || undefined;
  } while (pageToken);

  return out;
}

async function buildInvoiceUrlMap(drive: any, folderId: string) {
  const map = new Map<string, string>();
  let pageToken: string | undefined = undefined;

  const q = [`'${folderId}' in parents`, `mimeType='application/pdf'`, `trashed=false`].join(" and ");

  do {
    const res = await drive.files.list({
      q,
      fields: "nextPageToken,files(id,name,webViewLink,webContentLink)",
      pageSize: 1000,
      pageToken,
    });
    for (const f of res.data.files ?? []) {
      const name = String(f.name ?? "");
      const key = name.toLowerCase();
      const url = (f.webViewLink || f.webContentLink || "") as string;
      if (key && url) map.set(key, url);
    }
    pageToken = res.data.nextPageToken || undefined;
  } while (pageToken);

  return map;
}

function findHeaderRowIndex(rows: any[][]) {
  // scan first 30 rows for a header row (some sheets have notes above the real header)
  const scanMax = Math.min(rows.length, 30);
  for (let i = 0; i < scanMax; i++) {
    const r = rows[i] || [];
    const n = r.map((x) => norm(x));
    if (n.includes("bidder number") || n.includes("bidder #") || n.includes("bidcard") || n.includes("bid card")) {
      return i;
    }
  }
  return 0; // fallback: assume row 1 is header
}

export async function GET() {
  try {
    const creds = JSON.parse(mustEnv("GOOGLE_SERVICE_ACCOUNT_JSON"));
    const sheetsFolderId = mustEnv("AUCTION_SHEETS_FOLDER_ID");

    const invoiceFolderId = process.env.INVOICE_PDF_FOLDER_ID || "";
    const tabNameEnv = process.env.SHEET_TAB_NAME || ""; // optional override

    const auth = new google.auth.GoogleAuth({
      credentials: creds,
      scopes: [
        "https://www.googleapis.com/auth/drive.readonly",
        "https://www.googleapis.com/auth/spreadsheets.readonly",
      ],
    });

    const drive = google.drive({ version: "v3", auth });
    const sheets = google.sheets({ version: "v4", auth });

    const spreadsheets = await listAllSpreadsheetsInFolder(drive, sheetsFolderId);

    // build invoice lookup once (fast)
    const invoiceMap = invoiceFolderId ? await buildInvoiceUrlMap(drive, invoiceFolderId) : new Map<string, string>();

    const shipments: any[] = [];

    for (const file of spreadsheets) {
      const spreadsheetId = file.id;

      // determine tab
      let tabName = tabNameEnv;
      if (!tabName) {
        const meta = await sheets.spreadsheets.get({
          spreadsheetId,
          fields: "sheets(properties(title))",
        });
        tabName = meta.data.sheets?.[0]?.properties?.title || "Sheet1";
      }

      const valuesRes = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${tabName}!A:Z`,
      });

      const rows = (valuesRes.data.values ?? []) as any[][];
      if (rows.length < 2) continue;

      const headerRowIndex = findHeaderRowIndex(rows);
      const headers = (rows[headerRowIndex] ?? []).map((x) => String(x ?? ""));

      const idxBidcard = pickHeaderIndex(headers, ["bidder number", "bidder #", "bidcard", "bid card"]);
      const idxFirst = pickHeaderIndex(headers, ["buyer first name", "first name", "firstname"]);
      const idxLast = pickHeaderIndex(headers, ["buyer last name", "last name", "lastname"]);
      const idxLots = pickHeaderIndex(headers, ["lots bought", "lots won", "lots", "lot count"]);
      const idxPayment = pickHeaderIndex(headers, ["payment status", "paid", "payment"]);
      const idxShipReq = pickHeaderIndex(headers, ["shipping required", "ship required", "shipping"]);
      const idxShipped = pickHeaderIndex(headers, ["shipped status", "shipping status", "shipped", "ship status", "shipment status"]);

      if (idxBidcard < 0 || idxShipReq < 0 || idxShipped < 0) continue;

      for (let r = headerRowIndex + 1; r < rows.length; r++) {
        const row = rows[r] || [];
        const bidcard = String(row[idxBidcard] ?? "").trim();
        if (!bidcard) continue;

        const shippingReq = row[idxShipReq];
        const shipped = row[idxShipped];
        const payment = idxPayment >= 0 ? row[idxPayment] : "";

        // Outstanding shipment rule:
        // - Shipping required = Y
        // - Shipped status is blank
        // - If a payment column exists, require paid = Y
        const paidOk = true;
        const outstanding = isYes(shippingReq) && isBlank(shipped) && paidOk;
        if (!outstanding) continue;

        const invoiceKey = `${bidcard}.pdf`.toLowerCase();
        const invoiceUrl = invoiceMap.get(invoiceKey) || "";

        shipments.push({
          sheetId: spreadsheetId,
          sheetName: file.name,
          row: r + 1, // 1-based
          auction: extractAuctionNumber(file.name),
          bidcard,
          firstName: idxFirst >= 0 ? String(row[idxFirst] ?? "").trim() : "",
          lastName: idxLast >= 0 ? String(row[idxLast] ?? "").trim() : "",
          lotsWon: idxLots >= 0 ? String(row[idxLots] ?? "").trim() : "",
          paymentStatus: idxPayment >= 0 ? String(row[idxPayment] ?? "").trim() : "",
          shippingRequired: String(row[idxShipReq] ?? "").trim(),
          shippedStatus: String(row[idxShipped] ?? "").trim(),
          invoiceUrl: invoiceUrl || null,
        });
      }
    }

    return NextResponse.json({ success: true, count: shipments.length, shipments });
  } catch (e: any) {
    return NextResponse.json({ success: false, count: 0, shipments: [], error: e?.message || String(e) });
  }
}
