import { NextResponse } from "next/server";
import { google } from "googleapis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function norm(v: any) {
  return String(v ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function isYes(v: any) {
  const n = norm(v);
  return n === "y" || n === "yes" || n === "true" || n === "1";
}

function isBlank(v: any) {
  return String(v ?? "").trim() === "";
}

function pickHeaderIndex(headers: string[], candidates: string[]) {
  const H = headers.map((h) => norm(h));
  for (const c of candidates) {
    const i = H.indexOf(norm(c));
    if (i >= 0) return i;
  }
  for (let i = 0; i < H.length; i++) {
    const h = H[i];
    if (candidates.some((c) => h.includes(norm(c)))) return i;
  }
  return -1;
}

function findHeaderRowIndex(rows: any[][]) {
  const scanMax = Math.min(rows.length, 40);
  for (let i = 0; i < scanMax; i++) {
    const r = rows[i] || [];
    const n = r.map((x) => norm(x));
    if (
      n.includes("bidder number") ||
      n.includes("bidder #") ||
      n.includes("bidcard") ||
      n.includes("bid card")
    ) {
      return i;
    }
  }
  return 0;
}

async function listAllSpreadsheetsInFolder(
  drive: ReturnType<typeof google.drive>,
  folderId: string
) {
  const out: { id: string; name: string }[] = [];
  let pageToken: string | undefined = undefined;

  const q = [
    `'${folderId}' in parents`,
    `mimeType='application/vnd.google-apps.spreadsheet'`,
    `trashed=false`,
  ].join(" and ");

  do {
    const res: any = await drive.files.list({
      q,
      fields: "nextPageToken,files(id,name)",
      pageSize: 100,
      pageToken,
    });

    for (const f of res.data.files ?? []) {
      if (f.id && f.name) out.push({ id: f.id, name: f.name });
    }
    pageToken = res.data.nextPageToken || undefined;
  } while (pageToken);

  return out;
}

async function findFolderIdByName(
  drive: ReturnType<typeof google.drive>,
  parentFolderId: string,
  folderName: string
) {
  const safeName = folderName.replace(/'/g, "\\'");
  const q = [
    `'${parentFolderId}' in parents`,
    `mimeType='application/vnd.google-apps.folder'`,
    `name='${safeName}'`,
    `trashed=false`,
  ].join(" and ");

  const res: any = await drive.files.list({
    q,
    fields: "files(id,name)",
    pageSize: 10,
  });

  return res.data.files?.[0]?.id || null;
}

async function findPdfByBidcard(
  drive: ReturnType<typeof google.drive>,
  folderId: string,
  bidcard: string
) {
  const safe = bidcard.replace(/'/g, "\\'");
  const q = [
    `'${folderId}' in parents`,
    `mimeType='application/pdf'`,
    `(name='${safe}.pdf' or name='${safe}')`,
    `trashed=false`,
  ].join(" and ");

  const res: any = await drive.files.list({
    q,
    fields: "files(id,name,webViewLink,webContentLink)",
    pageSize: 10,
  });

  return res.data.files?.[0] || null;
}

async function getInvoiceUrl(
  drive: ReturnType<typeof google.drive>,
  invoicesRootId: string,
  auctionName: string,
  bidcard: string
) {
  const auctionFolderId = await findFolderIdByName(
    drive,
    invoicesRootId,
    auctionName
  );
  if (!auctionFolderId) return null;

  const file = await findPdfByBidcard(drive, auctionFolderId, bidcard);
  if (!file) return null;

  return (
    file.webViewLink ||
    file.webContentLink ||
    `https://drive.google.com/file/d/${file.id}/view`
  ) as string;
}

export async function GET() {
  try {
    const creds = JSON.parse(mustEnv("GOOGLE_SERVICE_ACCOUNT_JSON"));
    const sheetsFolderId = mustEnv("AUCTION_SHEETS_FOLDER_ID");
    const invoicesRootId = mustEnv("AUCTION_INVOICES_FOLDER_ID");

    const auth = new google.auth.GoogleAuth({
      credentials: creds,
      scopes: [
        "https://www.googleapis.com/auth/drive.readonly",
        "https://www.googleapis.com/auth/spreadsheets.readonly",
      ],
    });

    const drive = google.drive({ version: "v3", auth });
    const sheets = google.sheets({ version: "v4", auth });

    const spreadsheets = await listAllSpreadsheetsInFolder(
      drive,
      sheetsFolderId
    );

    const shipments: any[] = [];

    for (const file of spreadsheets) {
      const spreadsheetId = file.id;
      const auctionName = file.name; // "Auction 22"

      const meta = await sheets.spreadsheets.get({
        spreadsheetId,
        fields: "sheets(properties(title))",
      });
      const tab = meta.data.sheets?.[0]?.properties?.title;
      if (!tab) continue;

      const valuesRes = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${tab}!A:Z`,
      });

      const rows = (valuesRes.data.values ?? []) as any[][];
      if (rows.length < 2) continue;

      const headerRowIndex = findHeaderRowIndex(rows);
      const headers = (rows[headerRowIndex] ?? []).map((x) => String(x ?? ""));

      const idxBidcard = pickHeaderIndex(headers, [
        "Bidder Number",
        "Bidder #",
        "Bidcard",
        "Bid Card",
      ]);
      const idxFirst = pickHeaderIndex(headers, [
        "Buyer First Name",
        "First Name",
        "Firstname",
      ]);
      const idxLast = pickHeaderIndex(headers, [
        "Buyer Last Name",
        "Last Name",
        "Lastname",
      ]);
      const idxLots = pickHeaderIndex(headers, [
        "Lots Bought",
        "Lots Won",
        "Lots",
        "Lot Count",
      ]);
      const idxShipReq = pickHeaderIndex(headers, [
        "Shipping Required",
        "Ship Required",
        "Shipping Request",
      ]);
      const idxShipped = pickHeaderIndex(headers, [
        "Shipped status",
        "Shipping status",
        "Shipped",
        "Ship status",
        "Shipment status",
      ]);

      if (idxBidcard < 0 || idxShipReq < 0 || idxShipped < 0) continue;

      for (let r = headerRowIndex + 1; r < rows.length; r++) {
        const row = rows[r] || [];
        const bidcard = String(row[idxBidcard] ?? "").trim();
        if (!bidcard) continue;

        const shippingReq = row[idxShipReq];
        const shipped = row[idxShipped];

        if (!(isYes(shippingReq) && isBlank(shipped))) continue;

        const invoiceUrl = await getInvoiceUrl(
          drive,
          invoicesRootId,
          auctionName,
          bidcard
        );

        shipments.push({
          sheetId: spreadsheetId,
          sheetName: auctionName,
          auction: auctionName,
          row: r + 1,
          bidcard,
          firstName: idxFirst >= 0 ? String(row[idxFirst] ?? "").trim() : "",
          lastName: idxLast >= 0 ? String(row[idxLast] ?? "").trim() : "",
          lotsWon: idxLots >= 0 ? String(row[idxLots] ?? "").trim() : "",
          shippingRequired: String(row[idxShipReq] ?? "").trim(),
          shippedStatus: String(row[idxShipped] ?? "").trim(),
          invoiceUrl: invoiceUrl || null,
        });
      }
    }

    return NextResponse.json({ success: true, count: shipments.length, shipments });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, count: 0, shipments: [], error: e?.message || String(e) },
      { status: 500 }
    );
  }
}
