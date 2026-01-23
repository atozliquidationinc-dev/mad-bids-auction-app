import { NextResponse } from "next/server";
import { google } from "googleapis";

type Body = {
  auction: string;
  bidcard: string;
  updates: {
    paymentStatus?: string;
    pickupStatus?: string;
    shippedStatus?: string;
    refund?: string;
    notes?: string;
  };
};

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

function colToA1(colIdx: number) {
  let n = colIdx + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    if (!body?.auction || !body?.bidcard) {
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
        "https://www.googleapis.com/auth/spreadsheets",
      ],
    });

    const drive = google.drive({ version: "v3", auth });
    const sheets = google.sheets({ version: "v4", auth });

    const spreadsheetId = await findSheetIdByAuctionName(drive, sheetsFolderId, body.auction);
    if (!spreadsheetId) {
      return NextResponse.json(
        { success: false, error: `Sheet not found in Sheets folder: ${body.auction}` },
        { status: 404 }
      );
    }

    const meta = await sheets.spreadsheets.get({
      spreadsheetId,
      fields: "sheets(properties(title))",
    });
    const tab = meta.data.sheets?.[0]?.properties?.title;
    if (!tab) throw new Error("No tabs found in the sheet");

    // Read all rows to find the bidder row + header columns
    const readRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${tab}!A:Z`,
    });

    const rows = (readRes.data.values ?? []) as string[][];
    if (rows.length < 2) throw new Error("Sheet has no data rows");

    const header = rows[0].map((h) => (h || "").trim());
    const idx = (name: string) => header.findIndex((h) => h.toLowerCase() === name.toLowerCase());

    const bidderCol = idx("Bidder Number");
    const paymentCol = idx("Payment Status");
    const pickupCol = idx("Pickup Status");
    const shippedCol = idx("Shipped Status");
    const refundCol = idx("Refund");
    const notesCol = idx("Notes");

    if (bidderCol === -1) throw new Error("Missing column: Bidder Number");
    if (paymentCol === -1) throw new Error("Missing column: Payment Status");
    if (pickupCol === -1) throw new Error("Missing column: Pickup Status");
    if (shippedCol === -1) throw new Error("Missing column: Shipped Status");
    if (refundCol === -1) throw new Error("Missing column: Refund");
    if (notesCol === -1) throw new Error("Missing column: Notes");

    const target = body.bidcard.trim();
    let rowIndex = -1; // 0-based in rows array
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i]?.[bidderCol] ?? "").trim() === target) {
        rowIndex = i;
        break;
      }
    }
    if (rowIndex === -1) {
      return NextResponse.json(
        { success: false, error: `Bidder not found: ${target}` },
        { status: 404 }
      );
    }

    const rowNumber = rowIndex + 1; // 1-based row in sheet tab

    // ONLY allow these fields to be written:
    const u = body.updates ?? {};
    const writes: { range: string; values: string[][] }[] = [];

    if (u.paymentStatus !== undefined) {
      writes.push({ range: `${tab}!${colToA1(paymentCol)}${rowNumber}`, values: [[u.paymentStatus]] });
    }
    if (u.pickupStatus !== undefined) {
      writes.push({ range: `${tab}!${colToA1(pickupCol)}${rowNumber}`, values: [[u.pickupStatus]] });
    }
    if (u.shippedStatus !== undefined) {
      writes.push({ range: `${tab}!${colToA1(shippedCol)}${rowNumber}`, values: [[u.shippedStatus]] });
    }
    if (u.refund !== undefined) {
      writes.push({ range: `${tab}!${colToA1(refundCol)}${rowNumber}`, values: [[u.refund]] });
    }
    if (u.notes !== undefined) {
      writes.push({ range: `${tab}!${colToA1(notesCol)}${rowNumber}`, values: [[u.notes]] });
    }

    if (writes.length === 0) {
      return NextResponse.json(
        { success: false, error: "No editable fields provided" },
        { status: 400 }
      );
    }

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: { valueInputOption: "USER_ENTERED", data: writes },
    });

    return NextResponse.json({ success: true, updated: writes.length });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}