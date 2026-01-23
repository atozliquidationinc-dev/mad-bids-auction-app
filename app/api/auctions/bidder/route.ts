import { NextResponse } from "next/server";
import { google } from "googleapis";

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

async function findSheetIdByAuctionName(drive: any, sheetsFolderId: string, auctionName: string) {
  const safeName = auctionName.replace(/'/g, "\\'");
  const q = [
    `'${sheetsFolderId}' in parents`,
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
    const auction = url.searchParams.get("auction");
    const bidcard = url.searchParams.get("bidcard");

    if (!auction || !bidcard) {
      return NextResponse.json(
        { success: false, error: "Missing auction or bidcard" },
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

    const spreadsheetId = await findSheetIdByAuctionName(drive, sheetsFolderId, auction);
    if (!spreadsheetId) {
      return NextResponse.json(
        { success: false, error: `Sheet not found in Sheets folder: ${auction}` },
        { status: 404 }
      );
    }

    // Read the first tab name so you don’t depend on “Sheet1”
    const meta = await sheets.spreadsheets.get({
      spreadsheetId,
      fields: "sheets(properties(title))",
    });
    const tab = meta.data.sheets?.[0]?.properties?.title;
    if (!tab) throw new Error("No tabs found in the sheet");

    const readRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${tab}!A:Z`,
    });

    const rows = (readRes.data.values ?? []) as string[][];
    if (rows.length < 2) {
      return NextResponse.json(
        { success: false, error: "Sheet has no data rows" },
        { status: 400 }
      );
    }

    const header = rows[0].map((h) => (h || "").trim());
    const bidderIdx = header.findIndex((h) => h.toLowerCase() === "bidder number");
    if (bidderIdx === -1) {
      return NextResponse.json(
        { success: false, error: "Missing column: Bidder Number" },
        { status: 400 }
      );
    }

    const target = bidcard.trim();
    let foundRowIndex = -1; // 0-based in rows array
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i]?.[bidderIdx] ?? "").trim() === target) {
        foundRowIndex = i;
        break;
      }
    }

    if (foundRowIndex === -1) {
      return NextResponse.json(
        { success: false, error: `Bidder not found: ${target}` },
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
      auction,
      bidcard: target,
      spreadsheetId,
      tab,
      rowNumber: foundRowIndex + 1, // 1-based row number inside tab (header is row 1)
      record,
    });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}