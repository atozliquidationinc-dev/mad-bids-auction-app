import { NextResponse } from "next/server";
import { google } from "googleapis";

function norm(s: string) {
  return (s || "").toLowerCase().trim().replace(/\s+/g, " ");
}

function isYes(v: unknown) {
  if (v === null || v === undefined) return false;
  return String(v).trim().toLowerCase().startsWith("y"); // y, Y, y - hibid, etc
}

function isBlank(v: unknown) {
  return v === null || v === undefined || String(v).trim() === "";
}

function getAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_JSON");

  const creds = JSON.parse(raw);

  return new google.auth.GoogleAuth({
    credentials: creds,
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets.readonly",
      "https://www.googleapis.com/auth/drive.readonly",
    ],
  });
}

function extractAuctionNumber(name: string): number | null {
  const m = (name || "").match(/(\d+)/);
  return m ? Number(m[1]) : null;
}

type ShipmentRow = {
  auction: number;
  bidcard: string;
  firstName: string;
  lastName: string;
  lotsBought: string;
  paymentStatus: string;
  shippingRequired: string;
  shippedStatus: string;
};

export async function GET(req: Request) {
  try {
    const folderId = process.env.AUCTION_SHEETS_FOLDER_ID;
    if (!folderId) {
      return NextResponse.json(
        { success: false, error: "Missing AUCTION_SHEETS_FOLDER_ID" },
        { status: 500 }
      );
    }

    const auth = getAuth();
    const drive = google.drive({ version: "v3", auth });
    const sheets = google.sheets({ version: "v4", auth });

    // 1) List all auction spreadsheets in the folder
    const q = [
      `'${folderId}' in parents`,
      `mimeType='application/vnd.google-apps.spreadsheet'`,
      `trashed=false`,
    ].join(" and ");

    const listRes = await drive.files.list({
      q,
      fields: "files(id,name)",
      pageSize: 200,
    });

    const files = (listRes.data.files || [])
      .map((f) => ({
        id: f.id || "",
        name: f.name || "",
        auction: extractAuctionNumber(f.name || ""),
      }))
      .filter((f) => f.id && f.auction !== null)
      .sort((a, b) => (a.auction! - b.auction!));

    // If this is 0, that means your folder contains no Google Sheets files
    // with a number in the name.
    const shipments: ShipmentRow[] = [];

    // 2) For each auction sheet file, read rows and filter "outstanding shipments"
    for (const f of files) {
      const spreadsheetId = f.id;

      // Most of your sheets are Sheet1; keep it simple
      const range = "Sheet1!A:Z";

      const valuesRes = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range,
      });

      const values = (valuesRes.data.values || []) as string[][];
      if (values.length < 2) continue;

      const headerRow = values[0].map((h) => norm(h));
      const dataRows = values.slice(1);

      const findIdx = (needle: string) =>
        headerRow.findIndex((h) => h.includes(norm(needle)));

      const bidderIdx = findIdx("bidder number");
      const firstIdx = findIdx("buyer first name");
      const lastIdx = findIdx("buyer last name");
      const lotsIdx = findIdx("lots bought");
      const payIdx = findIdx("payment status");
      const shipReqIdx = findIdx("shipping required");
      const shippedIdx = findIdx("shipped");

      // Need these columns at minimum
      if (bidderIdx === -1 || payIdx === -1 || shipReqIdx === -1) continue;

      for (const r of dataRows) {
        const bidcard = (r[bidderIdx] || "").trim();
        if (!bidcard) continue;

        const payment = r[payIdx] ?? "";
        const shipReq = r[shipReqIdx] ?? "";
        const shipped = shippedIdx !== -1 ? r[shippedIdx] ?? "" : "";

        // Outstanding shipment rule:
        // shipping required = yes
        // payment status = yes
        // shipped status = blank (or not yes)
        if (isYes(shipReq) && isYes(payment) && (isBlank(shipped) || !isYes(shipped))) {
          shipments.push({
            auction: f.auction!,
            bidcard,
            firstName: firstIdx !== -1 ? (r[firstIdx] || "").trim() : "",
            lastName: lastIdx !== -1 ? (r[lastIdx] || "").trim() : "",
            lotsBought: lotsIdx !== -1 ? (r[lotsIdx] || "").trim() : "",
            paymentStatus: String(payment || "").trim(),
            shippingRequired: String(shipReq || "").trim(),
            shippedStatus: String(shipped || "").trim(),
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      auctionsFound: files.length,
      count: shipments.length,
      shipments,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || "Unknown error" },
      { status: 500 }
    );
  }
}import { NextResponse } from "next/server";
import { google } from "googleapis";

function norm(s: string) {
  return (s || "").toLowerCase().trim().replace(/\s+/g, " ");
}

function isYes(v: unknown) {
  if (v === null || v === undefined) return false;
  return String(v).trim().toLowerCase().startsWith("y"); // y, Y, y - hibid, etc
}

function isBlank(v: unknown) {
  return v === null || v === undefined || String(v).trim() === "";
}

function getAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_JSON");

  const creds = JSON.parse(raw);

  return new google.auth.GoogleAuth({
    credentials: creds,
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets.readonly",
      "https://www.googleapis.com/auth/drive.readonly",
    ],
  });
}

function extractAuctionNumber(name: string): number | null {
  const m = (name || "").match(/(\d+)/);
  return m ? Number(m[1]) : null;
}

type ShipmentRow = {
  auction: number;
  bidcard: string;
  firstName: string;
  lastName: string;
  lotsBought: string;
  paymentStatus: string;
  shippingRequired: string;
  shippedStatus: string;
};

export async function GET(req: Request) {
  try {
    const folderId = process.env.AUCTION_SHEETS_FOLDER_ID;
    if (!folderId) {
      return NextResponse.json(
        { success: false, error: "Missing AUCTION_SHEETS_FOLDER_ID" },
        { status: 500 }
      );
    }

    const auth = getAuth();
    const drive = google.drive({ version: "v3", auth });
    const sheets = google.sheets({ version: "v4", auth });

    // 1) List all auction spreadsheets in the folder
    const q = [
      `'${folderId}' in parents`,
      `mimeType='application/vnd.google-apps.spreadsheet'`,
      `trashed=false`,
    ].join(" and ");

    const listRes = await drive.files.list({
      q,
      fields: "files(id,name)",
      pageSize: 200,
    });

    const files = (listRes.data.files || [])
      .map((f) => ({
        id: f.id || "",
        name: f.name || "",
        auction: extractAuctionNumber(f.name || ""),
      }))
      .filter((f) => f.id && f.auction !== null)
      .sort((a, b) => (a.auction! - b.auction!));

    // If this is 0, that means your folder contains no Google Sheets files
    // with a number in the name.
    const shipments: ShipmentRow[] = [];

    // 2) For each auction sheet file, read rows and filter "outstanding shipments"
    for (const f of files) {
      const spreadsheetId = f.id;

      // Most of your sheets are Sheet1; keep it simple
      const range = "Sheet1!A:Z";

      const valuesRes = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range,
      });

      const values = (valuesRes.data.values || []) as string[][];
      if (values.length < 2) continue;

      const headerRow = values[0].map((h) => norm(h));
      const dataRows = values.slice(1);

      const findIdx = (needle: string) =>
        headerRow.findIndex((h) => h.includes(norm(needle)));

      const bidderIdx = findIdx("bidder number");
      const firstIdx = findIdx("buyer first name");
      const lastIdx = findIdx("buyer last name");
      const lotsIdx = findIdx("lots bought");
      const payIdx = findIdx("payment status");
      const shipReqIdx = findIdx("shipping required");
      const shippedIdx = findIdx("shipped");

      // Need these columns at minimum
      if (bidderIdx === -1 || payIdx === -1 || shipReqIdx === -1) continue;

      for (const r of dataRows) {
        const bidcard = (r[bidderIdx] || "").trim();
        if (!bidcard) continue;

        const payment = r[payIdx] ?? "";
        const shipReq = r[shipReqIdx] ?? "";
        const shipped = shippedIdx !== -1 ? r[shippedIdx] ?? "" : "";

        // Outstanding shipment rule:
        // shipping required = yes
        // payment status = yes
        // shipped status = blank (or not yes)
        if (isYes(shipReq) && isYes(payment) && (isBlank(shipped) || !isYes(shipped))) {
          shipments.push({
            auction: f.auction!,
            bidcard,
            firstName: firstIdx !== -1 ? (r[firstIdx] || "").trim() : "",
            lastName: lastIdx !== -1 ? (r[lastIdx] || "").trim() : "",
            lotsBought: lotsIdx !== -1 ? (r[lotsIdx] || "").trim() : "",
            paymentStatus: String(payment || "").trim(),
            shippingRequired: String(shipReq || "").trim(),
            shippedStatus: String(shipped || "").trim(),
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      auctionsFound: files.length,
      count: shipments.length,
      shipments,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || "Unknown error" },
      { status: 500 }
    );
  }
}