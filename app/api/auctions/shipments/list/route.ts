import { NextResponse } from "next/server";
import { google } from "googleapis";

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

/**
 * Extracts an auction number from ANY name:
 * "Auction 22" -> 22
 * "22" -> 22
 * "mad bids auction-23" -> 23
 */
function extractAuctionNumber(name: string): number | null {
  if (!name) return null;

  // Find the first 1-4 digit number in the string
  const match = name.match(/(\d{1,4})/);
  if (!match) return null;

  const n = Number(match[1]);
  return Number.isFinite(n) ? n : null;
}

function norm(v: any): string {
  return String(v ?? "").trim();
}

function isYes(v: any): boolean {
  // Treat: "y", "Y", "y - hibid", "y ", etc. as YES
  const s = norm(v).toLowerCase();
  return s.startsWith("y");
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const sort = url.searchParams.get("sort") || "auction_asc";
    const q = (url.searchParams.get("q") || "").trim().toLowerCase();

    const sheetsFolderId = process.env.AUCTION_SHEETS_FOLDER_ID;
    if (!sheetsFolderId) {
      return NextResponse.json(
        { success: false, error: "Missing AUCTION_SHEETS_FOLDER_ID" },
        { status: 500 }
      );
    }

    const auth = getAuth();
    const drive = google.drive({ version: "v3", auth });
    const sheetsApi = google.sheets({ version: "v4", auth });

    // 1) List all Google Sheets inside AUCTION_SHEETS_FOLDER_ID
    const listRes = await drive.files.list({
      q: `'${sheetsFolderId}' in parents and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`,
      fields: "files(id,name)",
      pageSize: 200,
    });

    const files = listRes.data.files || [];

    // 2) For each auction sheet, read rows and extract shipments
    const shipments: Array<{
      auction: number;
      auctionName: string;
      bidcard: string;
      firstName: string;
      lastName: string;
      phone: string;
      lots: number;
      invoiceBidcard: string;
      paymentYes: boolean;
      shippingRequiredYes: boolean;
      shippedYes: boolean;
    }> = [];

    for (const f of files) {
      const sheetId = f.id!;
      const sheetName = f.name || "";

      const auctionNumber = extractAuctionNumber(sheetName);
      if (!auctionNumber) {
        // Skip sheets we can't identify
        continue;
      }

      // Read a wide range (same style we used before)
      const valuesRes = await sheetsApi.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range: "Sheet1!A:Z",
      });

      const rows = valuesRes.data.values || [];
      if (rows.length < 2) continue;

      const headers = (rows[1] || []).map((h) => norm(h));

      const idx = (colName: string) =>
        headers.findIndex(
          (h) => h.toLowerCase() === colName.toLowerCase()
        );

      const iFirst = idx("Buyer First Name");
      const iLast = idx("Buyer Last Name");
      const iBidder = idx("Bidder Number");
      const iPhone = idx("Buyer Phone");
      const iLots = idx("Lots Bought");
      const iPay = idx("Payment Status");
      const iShipReq = idx("Shipping Required");
      const iShipped = idx("Shipped status"); // your sheet uses this case
      if (iShipped === -1) {
        // sometimes it might be "Shipped Status"
        // so we try again via contains
      }
      const iShipped2 =
        iShipped !== -1
          ? iShipped
          : headers.findIndex((h) => h.toLowerCase().includes("shipped"));

      // If we can't even find bidder number, we can't build shipments list
      if (iBidder === -1) continue;

      for (let r = 2; r < rows.length; r++) {
        const row = rows[r] || [];

        const bidcard = norm(row[iBidder]);
        if (!bidcard) continue;

        const firstName = iFirst !== -1 ? norm(row[iFirst]) : "";
        const lastName = iLast !== -1 ? norm(row[iLast]) : "";
        const phone = iPhone !== -1 ? norm(row[iPhone]) : "";

        const lotsRaw = iLots !== -1 ? norm(row[iLots]) : "0";
        const lots = Number(lotsRaw) || 0;

        const paymentYes = iPay !== -1 ? isYes(row[iPay]) : false;
        const shippingRequiredYes =
          iShipReq !== -1 ? isYes(row[iShipReq]) : false;

        const shippedVal = iShipped2 !== -1 ? row[iShipped2] : "";
        const shippedYes = isYes(shippedVal);

        // SHIPMENTS SHIFT RULE:
        // shipping required = YES
        // payment status = YES
        // shipped status = BLANK (not YES)
        if (shippingRequiredYes && paymentYes && !shippedYes) {
          // invoice uses bidcard as filename (20000.pdf)
          shipments.push({
            auction: auctionNumber,
            auctionName: sheetName,
            bidcard,
            firstName,
            lastName,
            phone,
            lots,
            invoiceBidcard: bidcard,
            paymentYes,
            shippingRequiredYes,
            shippedYes,
          });
        }
      }
    }

    // 3) Apply search filter
    const filtered = q
      ? shipments.filter((s) => {
          const blob = `${s.firstName} ${s.lastName} ${s.bidcard}`.toLowerCase();
          return blob.includes(q);
        })
      : shipments;

    // 4) Sorting
    const sorted = [...filtered].sort((a, b) => {
      if (sort === "auction_desc") return b.auction - a.auction;
      if (sort === "lots_asc") return a.lots - b.lots;
      if (sort === "lots_desc") return b.lots - a.lots;
      // default: auction_asc
      return a.auction - b.auction;
    });

    return NextResponse.json({
      success: true,
      count: sorted.length,
      shipments: sorted,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || "Unknown error" },
      { status: 500 }
    );
  }
}