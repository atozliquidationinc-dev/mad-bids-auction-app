import { NextResponse } from "next/server";
import { google } from "googleapis";

function norm(s: string) {
  return (s || "").toLowerCase().trim().replace(/\s+/g, " ");
}

function isYes(v: unknown) {
  if (v === null || v === undefined) return false;
  const s = String(v).trim().toLowerCase();
  // Accept: "y", "y - hibid", "y-ET", "Y", etc
  return s.startsWith("y");
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

export async function GET() {
  try {
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    if (!spreadsheetId) {
      return NextResponse.json(
        { success: false, error: "Missing GOOGLE_SHEET_ID" },
        { status: 500 }
      );
    }

    // IMPORTANT:
    // This assumes each auction is a TAB in the SAME spreadsheet, named like:
    // "Auction 22", "Auction 23", etc
    // If your tabs are named differently, change the tab name logic below.
    const auth = getAuth();
    const sheets = google.sheets({ version: "v4", auth });

    // Get tab names
    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const tabs =
      meta.data.sheets
        ?.map((s) => s.properties?.title || "")
        .filter(Boolean) || [];

    // Extract auction numbers from tab titles
    // Accepts: "Auction 22", "22", "AUCTION 22", etc
    const auctions = tabs
      .map((t) => {
        const m = t.match(/(\d+)/);
        return m ? { title: t, auction: Number(m[1]) } : null;
      })
      .filter((x): x is { title: string; auction: number } => !!x)
      .sort((a, b) => a.auction - b.auction);

    const shipments: ShipmentRow[] = [];

    for (const a of auctions) {
      const range = `'${a.title}'!A:Z`;
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range,
      });

      const values = (res.data.values || []) as string[][];
      if (values.length < 2) continue;

      const headerRow = values[0].map((h) => norm(h));
      const dataRows = values.slice(1);

      const idx = (name: string) => headerRow.findIndex((h) => h === norm(name));

      // Fuzzy header matching:
      const findIdx = (needle: string) =>
        headerRow.findIndex((h) => h.includes(norm(needle)));

      const bidderIdx =
        idx("Bidder Number") !== -1 ? idx("Bidder Number") : findIdx("bidder number");
      const firstIdx =
        idx("Buyer First Name") !== -1 ? idx("Buyer First Name") : findIdx("buyer first name");
      const lastIdx =
        idx("Buyer Last Name") !== -1 ? idx("Buyer Last Name") : findIdx("buyer last name");
      const lotsIdx =
        idx("Lots Bought") !== -1 ? idx("Lots Bought") : findIdx("lots bought");
      const payIdx =
        idx("Payment Status") !== -1 ? idx("Payment Status") : findIdx("payment status");
      const shipReqIdx =
        idx("Shipping Required") !== -1 ? idx("Shipping Required") : findIdx("shipping required");
      const shippedIdx =
        // Your file shows "Shipped status" (lowercase s).  [oai_citation:1‡Auction%2022.pdf.pdf](sediment://file_00000000caf4722fb45af9fe7d31e172)
        idx("Shipped status") !== -1
          ? idx("Shipped status")
          : idx("Shipped Status") !== -1
          ? idx("Shipped Status")
          : findIdx("shipped");

      // If we can't find critical columns, skip this tab (but don’t crash)
      if (bidderIdx === -1 || shipReqIdx === -1 || payIdx === -1) continue;

      for (const r of dataRows) {
        const bidcard = (r[bidderIdx] || "").trim();
        if (!bidcard) continue;

        const payment = r[payIdx] ?? "";
        const shipReq = r[shipReqIdx] ?? "";
        const shipped = shippedIdx !== -1 ? r[shippedIdx] ?? "" : "";

        // Outstanding shipments rule:
        // - Shipping Required: YES
        // - Payment Status: YES
        // - Shipped status: blank or NOT yes
        if (isYes(shipReq) && isYes(payment) && (isBlank(shipped) || !isYes(shipped))) {
          shipments.push({
            auction: a.auction,
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