import { NextResponse } from "next/server";
import { google } from "googleapis";

/**
 * Shipments List API
 * Returns all shipments that should be done:
 * - Shipping Required = Y
 * - Payment Status = Y (or starts with "y")
 * - Shipped Status is blank
 *
 * We scan ALL tabs in the Google Sheet whose name looks like "Auction 22"
 * and treat that number as the auction number.
 *
 * ENV REQUIRED:
 * - GOOGLE_SERVICE_ACCOUNT_JSON  (the JSON string of the service account)
 * - GOOGLE_SHEET_ID              (the master spreadsheet id)
 */

function norm(s: string) {
  return (s || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[_-]+/g, " ");
}

function isYes(v: string | undefined) {
  const t = (v || "").toString().trim().toLowerCase();
  return t === "y" || t.startsWith("y ");
}

function isBlank(v: string | undefined) {
  return !v || (typeof v === "string" && v.trim() === "");
}

function getAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_JSON");

  const credentials = JSON.parse(raw);

  return new google.auth.GoogleAuth({
    credentials,
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets.readonly",
      "https://www.googleapis.com/auth/drive.readonly",
    ],
  });
}

type ShipmentRow = {
  auction: number;
  auctionName: string;
  bidcard: string;
  firstName: string;
  lastName: string;
  lotsBought: string;
  balance: string;
  paymentStatus: string;
  shippingRequired: string;
  shippedStatus: string;
  refund: string;
  notes: string;
};

function findHeaderIndex(headers: string[], candidates: string[]) {
  const normalized = headers.map((h) => norm(h));
  for (const c of candidates) {
    const idx = normalized.indexOf(norm(c));
    if (idx !== -1) return idx;
  }
  return -1;
}

export async function GET() {
  try {
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    if (!spreadsheetId) {
      return NextResponse.json(
        { success: false, error: "Missing GOOGLE_SHEET_ID" },
        { status: 500 }
      );
    }

    const auth = getAuth();
    const sheetsApi = google.sheets({ version: "v4", auth });

    // 1) Get all sheet tabs
    const meta = await sheetsApi.spreadsheets.get({
      spreadsheetId,
    });

    const sheetTitles =
      meta.data.sheets
        ?.map((s) => s.properties?.title)
        .filter((t): t is string => !!t) || [];

    // Only tabs that look like "Auction 22" (case-insensitive)
    const auctionTabs = sheetTitles
      .map((title) => {
        const m = title.match(/auction\s*(\d+)/i);
        if (!m) return null;
        return {
          title,
          auction: Number(m[1]),
        };
      })
      .filter((x): x is { title: string; auction: number } => !!x)
      .sort((a, b) => a.auction - b.auction);

    const allShipments: ShipmentRow[] = [];

    // 2) Pull rows from each auction tab and filter shipments
    for (const tab of auctionTabs) {
      const range = `'${tab.title.replace(/'/g, "''")}'!A:Z`;

      const res = await sheetsApi.spreadsheets.values.get({
        spreadsheetId,
        range,
      });

      const values = res.data.values || [];
      if (values.length < 2) continue;

      const headers = (values[0] || []).map((x) => String(x));

      // Flexible header matching (handles small typos / variations)
      const idxFirst = findHeaderIndex(headers, ["Buyer First Name", "First Name"]);
      const idxLast = findHeaderIndex(headers, ["Buyer Last Name", "Last Name"]);
      const idxBid = findHeaderIndex(headers, [
        "Bidder Number",
        "Bidder #",
        "Bid Card",
        "Bidcard",
        "Bidcard #",
        "Bid Card #",
      ]);
      const idxLots = findHeaderIndex(headers, ["Lots Bought", "Lots", "Lot Count"]);
      const idxBalance = findHeaderIndex(headers, ["Balance"]);
      const idxPay = findHeaderIndex(headers, ["Payment Status", "Paid"]);
      const idxShipReq = findHeaderIndex(headers, ["Shipping Required", "Ship Required"]);
      const idxShipped = findHeaderIndex(headers, ["Shipped status", "Shipped Status", "Shipped"]);
      const idxRefund = findHeaderIndex(headers, ["Refund"]);
      const idxNotes = findHeaderIndex(headers, ["Notes"]);

      // If we can’t find bidder number, we can’t build shipment records reliably
      if (idxBid === -1) continue;

      const dataRows = values.slice(1);

      for (const row of dataRows) {
        const get = (i: number) => (i >= 0 ? String(row?.[i] ?? "") : "");

        const bidcard = get(idxBid).trim();
        if (!bidcard) continue;

        const firstName = get(idxFirst).trim();
        const lastName = get(idxLast).trim();
        const lotsBought = get(idxLots).trim();
        const balance = get(idxBalance).trim();
        const paymentStatus = get(idxPay).trim();
        const shippingRequired = get(idxShipReq).trim();
        const shippedStatus = get(idxShipped).trim();
        const refund = get(idxRefund).trim();
        const notes = get(idxNotes).trim();

        // Shipment criteria:
        // shipping required = Y
        // payment status = Y (or starts with y)
        // shipped is blank
        if (!isYes(shippingRequired)) continue;
        if (!isYes(paymentStatus)) continue;
        if (!isBlank(shippedStatus)) continue;

        allShipments.push({
          auction: tab.auction,
          auctionName: tab.title,
          bidcard,
          firstName,
          lastName,
          lotsBought,
          balance,
          paymentStatus,
          shippingRequired,
          shippedStatus,
          refund,
          notes,
        });
      }
    }

    return NextResponse.json({
      success: true,
      count: allShipments.length,
      shipments: allShipments,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Unknown error" },
      { status: 500 }
    );
  }
}import { NextResponse } from "next/server";
import { google } from "googleapis";

/**
 * Shipments List API
 * Returns all shipments that should be done:
 * - Shipping Required = Y
 * - Payment Status = Y (or starts with "y")
 * - Shipped Status is blank
 *
 * We scan ALL tabs in the Google Sheet whose name looks like "Auction 22"
 * and treat that number as the auction number.
 *
 * ENV REQUIRED:
 * - GOOGLE_SERVICE_ACCOUNT_JSON  (the JSON string of the service account)
 * - GOOGLE_SHEET_ID              (the master spreadsheet id)
 */

function norm(s: string) {
  return (s || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[_-]+/g, " ");
}

function isYes(v: string | undefined) {
  const t = (v || "").toString().trim().toLowerCase();
  return t === "y" || t.startsWith("y ");
}

function isBlank(v: string | undefined) {
  return !v || (typeof v === "string" && v.trim() === "");
}

function getAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_JSON");

  const credentials = JSON.parse(raw);

  return new google.auth.GoogleAuth({
    credentials,
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets.readonly",
      "https://www.googleapis.com/auth/drive.readonly",
    ],
  });
}

type ShipmentRow = {
  auction: number;
  auctionName: string;
  bidcard: string;
  firstName: string;
  lastName: string;
  lotsBought: string;
  balance: string;
  paymentStatus: string;
  shippingRequired: string;
  shippedStatus: string;
  refund: string;
  notes: string;
};

function findHeaderIndex(headers: string[], candidates: string[]) {
  const normalized = headers.map((h) => norm(h));
  for (const c of candidates) {
    const idx = normalized.indexOf(norm(c));
    if (idx !== -1) return idx;
  }
  return -1;
}

export async function GET() {
  try {
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    if (!spreadsheetId) {
      return NextResponse.json(
        { success: false, error: "Missing GOOGLE_SHEET_ID" },
        { status: 500 }
      );
    }

    const auth = getAuth();
    const sheetsApi = google.sheets({ version: "v4", auth });

    // 1) Get all sheet tabs
    const meta = await sheetsApi.spreadsheets.get({
      spreadsheetId,
    });

    const sheetTitles =
      meta.data.sheets
        ?.map((s) => s.properties?.title)
        .filter((t): t is string => !!t) || [];

    // Only tabs that look like "Auction 22" (case-insensitive)
    const auctionTabs = sheetTitles
      .map((title) => {
        const m = title.match(/auction\s*(\d+)/i);
        if (!m) return null;
        return {
          title,
          auction: Number(m[1]),
        };
      })
      .filter((x): x is { title: string; auction: number } => !!x)
      .sort((a, b) => a.auction - b.auction);

    const allShipments: ShipmentRow[] = [];

    // 2) Pull rows from each auction tab and filter shipments
    for (const tab of auctionTabs) {
      const range = `'${tab.title.replace(/'/g, "''")}'!A:Z`;

      const res = await sheetsApi.spreadsheets.values.get({
        spreadsheetId,
        range,
      });

      const values = res.data.values || [];
      if (values.length < 2) continue;

      const headers = (values[0] || []).map((x) => String(x));

      // Flexible header matching (handles small typos / variations)
      const idxFirst = findHeaderIndex(headers, ["Buyer First Name", "First Name"]);
      const idxLast = findHeaderIndex(headers, ["Buyer Last Name", "Last Name"]);
      const idxBid = findHeaderIndex(headers, [
        "Bidder Number",
        "Bidder #",
        "Bid Card",
        "Bidcard",
        "Bidcard #",
        "Bid Card #",
      ]);
      const idxLots = findHeaderIndex(headers, ["Lots Bought", "Lots", "Lot Count"]);
      const idxBalance = findHeaderIndex(headers, ["Balance"]);
      const idxPay = findHeaderIndex(headers, ["Payment Status", "Paid"]);
      const idxShipReq = findHeaderIndex(headers, ["Shipping Required", "Ship Required"]);
      const idxShipped = findHeaderIndex(headers, ["Shipped status", "Shipped Status", "Shipped"]);
      const idxRefund = findHeaderIndex(headers, ["Refund"]);
      const idxNotes = findHeaderIndex(headers, ["Notes"]);

      // If we can’t find bidder number, we can’t build shipment records reliably
      if (idxBid === -1) continue;

      const dataRows = values.slice(1);

      for (const row of dataRows) {
        const get = (i: number) => (i >= 0 ? String(row?.[i] ?? "") : "");

        const bidcard = get(idxBid).trim();
        if (!bidcard) continue;

        const firstName = get(idxFirst).trim();
        const lastName = get(idxLast).trim();
        const lotsBought = get(idxLots).trim();
        const balance = get(idxBalance).trim();
        const paymentStatus = get(idxPay).trim();
        const shippingRequired = get(idxShipReq).trim();
        const shippedStatus = get(idxShipped).trim();
        const refund = get(idxRefund).trim();
        const notes = get(idxNotes).trim();

        // Shipment criteria:
        // shipping required = Y
        // payment status = Y (or starts with y)
        // shipped is blank
        if (!isYes(shippingRequired)) continue;
        if (!isYes(paymentStatus)) continue;
        if (!isBlank(shippedStatus)) continue;

        allShipments.push({
          auction: tab.auction,
          auctionName: tab.title,
          bidcard,
          firstName,
          lastName,
          lotsBought,
          balance,
          paymentStatus,
          shippingRequired,
          shippedStatus,
          refund,
          notes,
        });
      }
    }

    return NextResponse.json({
      success: true,
      count: allShipments.length,
      shipments: allShipments,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Unknown error" },
      { status: 500 }
    );
  }
}