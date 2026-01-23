import { NextResponse } from "next/server";
import { google } from "googleapis";

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function toLowerKey(s: string) {
  return (s || "").trim().toLowerCase();
}
function isY(v: any) {
  const t = String(v ?? "").trim().toLowerCase();
  return t === "y" || t.startsWith("y ");
}
function isBlank(v: any) {
  return String(v ?? "").trim().length === 0;
}
function parseAuctionNumber(name: string) {
  const m = String(name || "").match(/auction\s*(\d+)/i);
  return m ? Number(m[1]) : null;
}

export async function GET() {
  try {
    const creds = JSON.parse(mustEnv("GOOGLE_SERVICE_ACCOUNT_JSON"));
    const sheetsFolderId = mustEnv("AUCTION_SHEETS_FOLDER_ID");

    const auth = new google.auth.GoogleAuth({
      credentials: creds,
      scopes: [
        "https://www.googleapis.com/auth/drive.readonly",
        "https://www.googleapis.com/auth/spreadsheets.readonly",
      ],
    });

    const drive = google.drive({ version: "v3", auth });
    const sheets = google.sheets({ version: "v4", auth });

    const q = [
      `'${sheetsFolderId}' in parents`,
      `mimeType='application/vnd.google-apps.spreadsheet'`,
      `trashed=false`,
    ].join(" and ");

    const filesRes = await drive.files.list({
      q,
      fields: "files(id,name)",
      pageSize: 200,
    });

    const files = (filesRes.data.files ?? [])
      .map((f) => ({
        id: f.id!,
        name: f.name || "",
        auctionNumber: parseAuctionNumber(f.name || ""),
      }))
      .filter((f) => f.auctionNumber !== null) as {
      id: string;
      name: string;
      auctionNumber: number;
    }[];

    // oldest → newest default
    files.sort((a, b) => a.auctionNumber - b.auctionNumber);

    const shipments: any[] = [];

    for (const file of files) {
      const meta = await sheets.spreadsheets.get({
        spreadsheetId: file.id,
        fields: "sheets(properties(title))",
      });
      const tab = meta.data.sheets?.[0]?.properties?.title;
      if (!tab) continue;

      const read = await sheets.spreadsheets.values.get({
        spreadsheetId: file.id,
        range: `${tab}!A:Z`,
      });

      const rows = (read.data.values ?? []) as any[][];
      if (!rows.length) continue;

      // find header row containing "Bidder Number"
      let headerRowIndex = -1;
      for (let i = 0; i < rows.length; i++) {
        const normalized = (rows[i] || []).map((x) => toLowerKey(String(x ?? "")));
        if (normalized.includes("bidder number")) {
          headerRowIndex = i;
          break;
        }
      }
      if (headerRowIndex === -1) continue;

      const header = (rows[headerRowIndex] || []).map((h) => String(h ?? "").trim());
      const hl = header.map((h) => toLowerKey(h));
      const idx = (name: string) => hl.indexOf(toLowerKey(name));

      const iFirst = idx("Buyer First Name");
      const iLast = idx("Buyer Last Name");
      const iBidder = idx("Bidder Number");
      const iLots = idx("Lots Bought");
      const iPay = idx("Payment Status");
      const iShipReq = idx("Shipping Required");
      const iShipped = idx("Shipped status");

      if (iBidder === -1 || iPay === -1 || iShipReq === -1 || iShipped === -1) continue;

      for (let r = headerRowIndex + 1; r < rows.length; r++) {
        const row = rows[r] || [];
        const bidder = String(row[iBidder] ?? "").trim();
        if (!bidder) continue;

        const pay = String(row[iPay] ?? "");
        const shipReq = String(row[iShipReq] ?? "");
        const shipped = String(row[iShipped] ?? "");

        // RULES YOU ASKED:
        // Shipping Required = Y
        // Payment Status = Y
        // Shipped status blank
        if (!isY(shipReq)) continue;
        if (!isY(pay)) continue;
        if (!isBlank(shipped)) continue;

        shipments.push({
          auctionNumber: file.auctionNumber,
          auctionName: file.name, // "Auction 22"
          bidderNumber: bidder,
          firstName: iFirst >= 0 ? String(row[iFirst] ?? "") : "",
          lastName: iLast >= 0 ? String(row[iLast] ?? "") : "",
          lotsBought: iLots >= 0 ? Number(String(row[iLots] ?? "0")) || 0 : 0,
          paymentStatus: pay,
          shippingRequired: shipReq,
          shippedStatus: shipped,
        });
      }
    }

    return NextResponse.json({
      success: true,
      outstandingCount: shipments.length,
      shipments,
    });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || "Unknown error" },
      { status: 500 }
    );
  }
}