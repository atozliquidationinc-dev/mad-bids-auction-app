import { NextResponse } from "next/server";
import { google } from "googleapis";

function norm(s: unknown) {
  return String(s ?? "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function isYes(v: unknown) {
  const x = norm(v);
  return x === "y" || x === "yes" || x === "true" || x === "1";
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

function parseAuctionNumber(name: string) {
  // accepts: "Auction 22", "auction22", "22"
  const m = String(name).match(/(\d+)/);
  return m ? Number(m[1]) : null;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const debug = url.searchParams.get("debug") === "1";

    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    if (!spreadsheetId) {
      return NextResponse.json(
        { success: false, error: "Missing GOOGLE_SHEET_ID" },
        { status: 500 }
      );
    }

    const auth = getAuth();
    const sheets = google.sheets({ version: "v4", auth });

    // Reads the whole sheet (same as your bidder lookup)
    const range = "Sheet1!A:Z";
    const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
    const rows = res.data.values || [];
    if (rows.length < 2) {
      return NextResponse.json({ success: true, count: 0, shipments: [] });
    }

    const headers = rows[1].map((h) => norm(h));
    const dataRows = rows.slice(2);

    const idx = (name: string) => headers.indexOf(norm(name));

    const iFirst = idx("buyer first name");
    const iLast = idx("buyer last name");
    const iBid = idx("bidder number");
    const iLots = idx("lots bought");
    const iPay = idx("payment status");
    const iShipReq = idx("shipping required");
    const iShipped = idx("shipped status");

    const missing = [];
    if (iBid === -1) missing.push("Bidder Number");
    if (iPay === -1) missing.push("Payment Status");
    if (iShipReq === -1) missing.push("Shipping Required");
    if (iShipped === -1) missing.push("Shipped status");

    if (missing.length) {
      return NextResponse.json(
        {
          success: false,
          error: `Missing column(s): ${missing.join(", ")}`,
          headers: debug ? rows[1] : undefined,
        },
        { status: 500 }
      );
    }

    // A shipment we want:
    // shipping required = Y
    // payment status = Y
    // shipped status is blank
    const shipments = dataRows
      .map((row) => {
        const bidcard = String(row[iBid] ?? "").trim();
        const first = String(row[iFirst] ?? "").trim();
        const last = String(row[iLast] ?? "").trim();
        const lots = String(row[iLots] ?? "").trim();

        const payYes = isYes(row[iPay]);
        const shipReqYes = isYes(row[iShipReq]);
        const shippedYes = isYes(row[iShipped]);
        const shippedBlank = norm(row[iShipped]) === "";

        // auction number: try to infer from any "Auction" text in row, otherwise null
        // (you can improve later; list sorting will still work with nulls)
        const auctionNum = null;

        return {
          bidcard,
          first,
          last,
          lots,
          payYes,
          shipReqYes,
          shippedYes,
          shippedBlank,
          auctionNum,
        };
      })
      .filter(
        (x) =>
          x.bidcard &&
          x.shipReqYes &&
          x.payYes &&
          x.shippedBlank // shipped is empty
      );

    return NextResponse.json({
      success: true,
      count: shipments.length,
      shipments,
      debug: debug
        ? {
            headerRow: rows[1],
            normalizedHeaders: headers,
          }
        : undefined,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || String(err) },
      { status: 500 }
    );
  }
}
