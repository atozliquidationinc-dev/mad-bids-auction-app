import { NextResponse } from "next/server";
import { google } from "googleapis";

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function normalizeAuctionName(input: string) {
  const t = (input || "").trim();
  if (!t) return "";
  // If they type "22", convert to "Auction 22"
  if (/^\d+$/.test(t)) return `Auction ${t}`;
  // If they type "auction 22" or "Auction 22", standardize capitalization
  if (/^auction\s+\d+$/i.test(t)) {
    const num = t.match(/\d+/)?.[0] || "";
    return `Auction ${num}`;
  }
  // Otherwise keep as-is (in case you ever name auctions differently)
  return t;
}

async function findSheetIdByNameInFolder(
  drive: any,
  folderId: string,
  sheetName: string
) {
  const safeName = sheetName.replace(/'/g, "\\'");
  const q = [
    `'${folderId}' in parents`,
    `mimeType='application/vnd.google-apps.spreadsheet'`,
    `name='${safeName}'`,
    `trashed=false`,
  ].join(" and ");

  const res = await drive.files.list({
    q,
    fields: "files(id,name)",
    pageSize: 5,
  });

  return res.data.files?.[0]?.id || null;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);

    // Accept ANY of these param names (so UI/backend mismatch won't break it)
    const auctionRaw = url.searchParams.get("auction") || "";
    const bidderRaw =
      url.searchParams.get("bidder") ||
      url.searchParams.get("bidderNumber") ||
      url.searchParams.get("bidcard") ||
      "";

    const auctionName = normalizeAuctionName(auctionRaw);
    const bidderNumber = (bidderRaw || "").trim();

    if (!auctionName || !bidderNumber) {
      return NextResponse.json(
        { success: false, error: "Missing auction or bidder number" },
        { status: 400 }
      );
    }

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

    // 1) Find the spreadsheet for this auction in your Sheets folder
    const spreadsheetId = await findSheetIdByNameInFolder(
      drive,
      sheetsFolderId,
      auctionName
    );

    if (!spreadsheetId) {
      return NextResponse.json(
        {
          success: false,
          error: `Auction sheet not found in Sheets folder: ${auctionName}`,
        },
        { status: 404 }
      );
    }

    // 2) Get first tab name (so we don't assume Sheet1)
    const meta = await sheets.spreadsheets.get({
      spreadsheetId,
      fields: "sheets(properties(title))",
    });

    const tab = meta.data.sheets?.[0]?.properties?.title;
    if (!tab) throw new Error("No tabs found in auction sheet");

    // 3) Read data
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${tab}!A:Z`,
    });

    const rows = (res.data.values ?? []) as any[][];
    if (rows.length === 0) {
      return NextResponse.json(
        { success: false, error: "Sheet is empty" },
        { status: 400 }
      );
    }

    // 4) Find the header row that contains "Bidder Number"
    let headerRowIndex = -1;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i] || [];
      const normalized = r.map((x) => String(x || "").trim().toLowerCase());
      if (normalized.includes("bidder number")) {
        headerRowIndex = i;
        break;
      }
    }

    if (headerRowIndex === -1) {
      return NextResponse.json(
        { success: false, error: 'Could not find header row ("Bidder Number")' },
        { status: 400 }
      );
    }

    const header = rows[headerRowIndex].map((h) => String(h || "").trim());
    const bidderIdx = header.findIndex(
      (h) => h.trim().toLowerCase() === "bidder number"
    );

    if (bidderIdx === -1) {
      return NextResponse.json(
        { success: false, error: 'Missing column: "Bidder Number"' },
        { status: 400 }
      );
    }

    // 5) Find matching row after header
    let foundRowIndex = -1;
    for (let i = headerRowIndex + 1; i < rows.length; i++) {
      if (String(rows[i]?.[bidderIdx] ?? "").trim() === bidderNumber) {
        foundRowIndex = i;
        break;
      }
    }

    if (foundRowIndex === -1) {
      return NextResponse.json(
        { success: false, error: `Bidder not found: ${bidderNumber}` },
        { status: 404 }
      );
    }

    const row = rows[foundRowIndex];
    const record: Record<string, string> = {};
    header.forEach((h, i) => {
      if (!h) return;
      record[h] = String(row?.[i] ?? "");
    });

    return NextResponse.json({
      success: true,
      auctionName,
      bidderNumber,
      record,
      rowNumber: foundRowIndex + 1,
    });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || "Unknown error" },
      { status: 500 }
    );
  }
}