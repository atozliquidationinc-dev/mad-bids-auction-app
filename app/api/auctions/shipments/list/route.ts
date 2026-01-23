import { NextResponse } from "next/server";
import { google } from "googleapis";

function getAuth() {
  const credentials = JSON.parse(
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON as string
  );
  return new google.auth.GoogleAuth({
    credentials,
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets.readonly",
      "https://www.googleapis.com/auth/drive.readonly",
    ],
  });
}

function norm(s: any) {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

// Treat ANY value starting with "y" as YES (handles: "y", "y - hibid", "y ", "Y", etc)
function isYes(v: any) {
  const t = norm(v);
  return t.startsWith("y");
}

function findHeaderRow(rows: any[][]) {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const row = rows[i] || [];
    const joined = row.map(norm).join("|");
    if (
      joined.includes("bidder number") ||
      joined.includes("bidcard") ||
      joined.includes("shipping required") ||
      joined.includes("payment status")
    ) {
      return i;
    }
  }
  return -1;
}

export async function GET(req: Request) {
  try {
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    if (!spreadsheetId) {
      return NextResponse.json(
        { success: false, error: "Missing GOOGLE_SHEET_ID" },
        { status: 500 }
      );
    }

    const url = new URL(req.url);
    const auctionParam = url.searchParams.get("auction"); // optional
    const auctionNumber = auctionParam ? Number(auctionParam) : null;

    const auth = getAuth();
    const sheets = google.sheets({ version: "v4", auth });

    // Read a wide range so we can detect the header row even if row 1 is blank
    const range = "Sheet1!A:Z";
    const resp = await sheets.spreadsheets.values.get({ spreadsheetId, range });

    const rows = (resp.data.values || []) as any[][];
    if (!rows.length) {
      return NextResponse.json({ success: true, count: 0, shipments: [] });
    }

    const headerRowIndex = findHeaderRow(rows);
    if (headerRowIndex === -1) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Could not find header row. Make sure the sheet has columns like Bidder Number, Payment Status, Shipping Required, Shipped status.",
        },
        { status: 500 }
      );
    }

    const headers = rows[headerRowIndex].map(norm);

    const idx = (name: string) => headers.indexOf(norm(name));

    // Required columns (we accept common variations)
    const bidderIdx =
      idx("Bidder Number") !== -1
        ? idx("Bidder Number")
        : idx("Bidcard") !== -1
        ? idx("Bidcard")
        : -1;

    const firstIdx = idx("Buyer First Name");
    const lastIdx = idx("Buyer Last Name");
    const lotsIdx = idx("Lots Bought");

    const paymentIdx = idx("Payment Status");
    const shipReqIdx = idx("Shipping Required");
    const shippedIdx =
      idx("Shipped status") !== -1 ? idx("Shipped status") : idx("Shipped");

    if (bidderIdx === -1) {
      return NextResponse.json(
        { success: false, error: "Missing column: Bidder Number" },
        { status: 500 }
      );
    }
    if (paymentIdx === -1) {
      return NextResponse.json(
        { success: false, error: "Missing column: Payment Status" },
        { status: 500 }
      );
    }
    if (shipReqIdx === -1) {
      return NextResponse.json(
        { success: false, error: "Missing column: Shipping Required" },
        { status: 500 }
      );
    }
    if (shippedIdx === -1) {
      return NextResponse.json(
        { success: false, error: "Missing column: Shipped status" },
        { status: 500 }
      );
    }

    const dataRows = rows.slice(headerRowIndex + 1);

    const shipments = dataRows
      .map((r) => {
        const bidderNumber = String(r[bidderIdx] ?? "").trim();
        if (!bidderNumber) return null;

        const payment = r[paymentIdx];
        const shipReq = r[shipReqIdx];
        const shipped = r[shippedIdx];

        const paymentYes = isYes(payment);
        const shipReqYes = isYes(shipReq);
        const shippedYes = isYes(shipped);

        // Outstanding shipments:
        // - shipping required YES
        // - payment YES
        // - shipped is blank / not yes
        if (!(shipReqYes && paymentYes && !shippedYes)) return null;

        return {
          auction: auctionNumber ?? 0, // if you don’t have auction in the sheet, we leave 0 (frontend can still sort)
          bidderNumber,
          firstName: firstIdx !== -1 ? String(r[firstIdx] ?? "").trim() : "",
          lastName: lastIdx !== -1 ? String(r[lastIdx] ?? "").trim() : "",
          lots: lotsIdx !== -1 ? String(r[lotsIdx] ?? "").trim() : "",
          paymentStatus: String(payment ?? "").trim(),
          shippingRequired: String(shipReq ?? "").trim(),
          shippedStatus: String(shipped ?? "").trim(),
        };
      })
      .filter(Boolean);

    return NextResponse.json({
      success: true,
      count: shipments.length,
      shipments,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || String(err) },
      { status: 500 }
    );
  }
}
