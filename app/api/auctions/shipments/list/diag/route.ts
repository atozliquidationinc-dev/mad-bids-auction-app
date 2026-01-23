import { NextResponse } from "next/server";
import { google } from "googleapis";

function getAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_JSON");
  const credentials = JSON.parse(raw);

  return new google.auth.GoogleAuth({
    credentials,
    scopes: [
      "https://www.googleapis.com/auth/drive.readonly",
      "https://www.googleapis.com/auth/spreadsheets.readonly",
    ],
  });
}

function norm(v: any) {
  return String(v ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}
function isYes(v: any) {
  return norm(v).startsWith("y"); // y, Y, y - hibid, etc
}
function isBlank(v: any) {
  return norm(v) === "";
}

export async function GET() {
  try {
    const auth = getAuth();
    const drive = google.drive({ version: "v3", auth });
    const sheets = google.sheets({ version: "v4", auth });

    const folderId = process.env.AUCTION_SHEETS_FOLDER_ID;
    if (!folderId) {
      return NextResponse.json(
        { success: false, error: "Missing AUCTION_SHEETS_FOLDER_ID" },
        { status: 500 }
      );
    }

    // list spreadsheets in the auction sheets folder
    const listRes = await drive.files.list({
      q: `'${folderId}' in parents and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`,
      fields: "files(id,name)",
      pageSize: 50,
    });

    const files = listRes.data.files || [];
    const first = files[0];

    const output: any = {
      success: true,
      folderId,
      sheetsFound: files.length,
      firstSheet: first ? { id: first.id, name: first.name } : null,
    };

    if (!first?.id) return NextResponse.json(output);

    // pull first sheet rows
    const valuesRes = await sheets.spreadsheets.values.get({
      spreadsheetId: first.id,
      range: "Sheet1!A:Z",
    });

    const rows = valuesRes.data.values || [];
    output.firstSheetRowCount = rows.length;

    if (rows.length < 2) {
      output.note = "First sheet has no data rows (or headers missing).";
      return NextResponse.json(output);
    }

    const headersRaw = rows[0] || [];
    const headers = headersRaw.map((h) => norm(h));

    // show exact header names
    output.detectedHeaders = headersRaw;

    const findIdx = (needle: string) =>
      headers.findIndex((h) => h.includes(norm(needle)));

    const idxBidder = findIdx("bidder number");
    const idxPay = findIdx("payment status");
    const idxShipReq = findIdx("shipping required");
    const idxShipped = findIdx("shipped");

    output.indexes = { idxBidder, idxPay, idxShipReq, idxShipped };

    // sample first 5 data rows (raw)
    output.sampleRows = rows.slice(1, 6);

    // count matches by condition
    let hasBidder = 0;
    let shipReqYes = 0;
    let paidYes = 0;
    let shippedBlank = 0;
    let finalMatch = 0;

    for (const r of rows.slice(1)) {
      const bid = idxBidder !== -1 ? String(r[idxBidder] ?? "").trim() : "";
      if (bid) hasBidder++;

      const sr = idxShipReq !== -1 ? r[idxShipReq] : "";
      const pay = idxPay !== -1 ? r[idxPay] : "";
      const shipped = idxShipped !== -1 ? r[idxShipped] : "";

      const srYes = isYes(sr);
      const payYes = isYes(pay);
      const shippedIsBlank = isBlank(shipped);

      if (srYes) shipReqYes++;
      if (payYes) paidYes++;
      if (shippedIsBlank) shippedBlank++;

      if (bid && srYes && payYes && shippedIsBlank) finalMatch++;
    }

    output.counts = { hasBidder, shipReqYes, paidYes, shippedBlank, finalMatch };

    return NextResponse.json(output);
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || "Unknown error" },
      { status: 500 }
    );
  }
}