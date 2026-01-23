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
  if (/^\d+$/.test(t)) return `Auction ${t}`;
  if (/^auction\s+\d+$/i.test(t)) {
    const num = t.match(/\d+/)?.[0] || "";
    return `Auction ${num}`;
  }
  return t;
}

function toLowerKey(s: string) {
  return (s || "").trim().toLowerCase();
}

function colToLetter(colIndex1: number) {
  // 1 -> A, 2 -> B ... 27 -> AA
  let n = colIndex1;
  let out = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    out = String.fromCharCode(65 + r) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
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

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const auctionRaw = body?.auction ?? "";
    const bidderRaw =
      body?.bidder ?? body?.bidderNumber ?? body?.bidcard ?? "";

    const updatesRaw = body?.updates ?? {};

    const auctionName = normalizeAuctionName(String(auctionRaw));
    const bidderNumber = String(bidderRaw || "").trim();

    if (!auctionName || !bidderNumber) {
      return NextResponse.json(
        { success: false, error: "Missing auction or bidder number" },
        { status: 400 }
      );
    }

    if (!updatesRaw || typeof updatesRaw !== "object") {
      return NextResponse.json(
        { success: false, error: "Missing updates object" },
        { status: 400 }
      );
    }

    const creds = JSON.parse(mustEnv("GOOGLE_SERVICE_ACCOUNT_JSON"));
    const sheetsFolderId = mustEnv("AUCTION_SHEETS_FOLDER_ID");

    const auth = new google.auth.GoogleAuth({
      credentials: creds,
      scopes: [
        "https://www.googleapis.com/auth/drive.readonly",
        "https://www.googleapis.com/auth/spreadsheets",
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
        { success: false, error: `Auction sheet not found: ${auctionName}` },
        { status: 404 }
      );
    }

    // 2) Get first tab name (don't assume "Sheet1")
    const meta = await sheets.spreadsheets.get({
      spreadsheetId,
      fields: "sheets(properties(title))",
    });
    const tab = meta.data.sheets?.[0]?.properties?.title;
    if (!tab) throw new Error("No tabs found in auction sheet");

    // 3) Read all rows to locate header row + bidder row
    const read = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${tab}!A:Z`,
    });

    const rows = (read.data.values ?? []) as any[][];
    if (!rows.length) {
      return NextResponse.json(
        { success: false, error: "Sheet is empty" },
        { status: 400 }
      );
    }

    // 4) Find header row containing "Bidder Number"
    let headerRowIndex = -1;
    for (let i = 0; i < rows.length; i++) {
      const normalized = (rows[i] || []).map((x) => toLowerKey(String(x ?? "")));
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

    const header = (rows[headerRowIndex] || []).map((h) => String(h ?? "").trim());
    const headerLower = header.map((h) => toLowerKey(h));

    const bidderColIndex0 = headerLower.indexOf("bidder number");
    if (bidderColIndex0 === -1) {
      return NextResponse.json(
        { success: false, error: 'Missing column: "Bidder Number"' },
        { status: 400 }
      );
    }

    // 5) Find bidder row
    let bidderRowIndex = -1;
    for (let i = headerRowIndex + 1; i < rows.length; i++) {
      const cell = String(rows[i]?.[bidderColIndex0] ?? "").trim();
      if (cell === bidderNumber) {
        bidderRowIndex = i;
        break;
      }
    }

    if (bidderRowIndex === -1) {
      return NextResponse.json(
        { success: false, error: `Bidder not found: ${bidderNumber}` },
        { status: 404 }
      );
    }

    const sheetRowNumber = bidderRowIndex + 1; // 1-based row number in Sheets

    // 6) Map updates keys to real header names (case-insensitive match)
    const updates: Record<string, string> = {};
    for (const [k, v] of Object.entries(updatesRaw)) {
      updates[String(k)] = String(v ?? "");
    }

    const missingCols: string[] = [];
    const batchData: { range: string; values: any[][] }[] = [];

    for (const [key, value] of Object.entries(updates)) {
      const keyLower = toLowerKey(key);

      // find matching header by lowercase
      const colIndex0 = headerLower.indexOf(keyLower);

      if (colIndex0 === -1) {
        missingCols.push(key);
        continue;
      }

      const colLetter = colToLetter(colIndex0 + 1);
      batchData.push({
        range: `${tab}!${colLetter}${sheetRowNumber}`,
        values: [[value]],
      });
    }

    if (batchData.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error:
            "No valid columns found to update. Check your column names.",
          missingColumns: missingCols,
        },
        { status: 400 }
      );
    }

    // 7) Write updates
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: "RAW",
        data: batchData,
      },
    });

    return NextResponse.json({
      success: true,
      auctionName,
      bidderNumber,
      updated: Object.keys(updates),
      missingColumns: missingCols,
    });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || "Unknown error" },
      { status: 500 }
    );
  }
}