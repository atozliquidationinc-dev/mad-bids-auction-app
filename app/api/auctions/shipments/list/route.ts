export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { google } from "googleapis";

function norm(v: any) {
  return String(v ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}
function startsYes(v: any) {
  return norm(v).startsWith("y");
}
function isBlank(v: any) {
  return norm(v) === "";
}

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

function extractAuctionNumber(name: string) {
  const m = String(name || "").match(/(\d+)/);
  return m ? Number(m[1]) : null;
}

function findHeaderRow(rows: any[][]) {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const joined = (rows[i] || []).map(norm).join("|");
    // must include the 3 required columns + bidder number
    if (
      joined.includes("bidder") &&
      joined.includes("payment status") &&
      joined.includes("shipping required") &&
      joined.includes("shipped status")
    ) {
      return i;
    }
  }
  return -1;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const debug = url.searchParams.get("debug") === "1";

    const folderId = process.env.AUCTION_SHEETS_FOLDER_ID;
    if (!folderId) {
      return NextResponse.json(
        { success: false, error: "Missing AUCTION_SHEETS_FOLDER_ID" },
        { status: 500 }
      );
    }

    const auth = getAuth();
    const drive = google.drive({ version: "v3", auth });
    const sheetsApi = google.sheets({ version: "v4", auth });

    // 1) get all spreadsheet files in the folder
    const listRes = await drive.files.list({
      q: `'${folderId}' in parents and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`,
      fields: "files(id,name)",
      pageSize: 500,
    });

    const files = (listRes.data.files || [])
      .map((f) => ({
        id: f.id || "",
        name: f.name || "",
        auctionNum: extractAuctionNumber(f.name || ""),
      }))
      .filter((f) => f.id);

    const shipments: any[] = [];
    const debugInfo: any[] = [];

    for (const f of files) {
      // 2) get tab names for this spreadsheet
      const meta = await sheetsApi.spreadsheets.get({
        spreadsheetId: f.id,
        fields: "sheets(properties(title))",
      });

      const tabNames =
        meta.data.sheets?.map((s) => s.properties?.title).filter(Boolean) as string[];

      let matchedTab: string | null = null;
      let matchedHeaderRow = -1;
      let headersRaw: any[] | null = null;

      // 3) try each tab until we find the header row
      for (const tab of tabNames) {
        const valuesRes = await sheetsApi.spreadsheets.values.get({
          spreadsheetId: f.id,
          range: `${tab}!A:Z`,
        });

        const rows = (valuesRes.data.values || []) as any[][];
        if (rows.length < 2) continue;

        const headerRowIndex = findHeaderRow(rows);
        if (headerRowIndex === -1) continue;

        // found the right tab
        matchedTab = tab;
        matchedHeaderRow = headerRowIndex;
        headersRaw = rows[headerRowIndex] || [];

        const headers = headersRaw.map(norm);
        const idx = (name: string) => headers.indexOf(norm(name));

        // required
        const iBidder =
          idx("bidder number") !== -1 ? idx("bidder number") : idx("bidcard");
        const iPay = idx("payment status");
        const iShipReq = idx("shipping required");
        const iShipped = idx("shipped status");

        // optional
        const iFirst = idx("buyer first name");
        const iLast = idx("buyer last name");
        const iLots = idx("lots bought");
        const iBalance = idx("balance");

        if (iBidder === -1 || iPay === -1 || iShipReq === -1 || iShipped === -1) {
          continue;
        }

        const dataRows = rows.slice(headerRowIndex + 1);

        for (const r of dataRows) {
          const bidderNumber = String(r[iBidder] ?? "").trim();
          if (!bidderNumber) continue;

          const paymentStatus = r[iPay];
          const shippingRequired = r[iShipReq];
          const shippedStatus = r[iShipped];

          // ✅ YOUR EXACT RULES:
          if (!startsYes(paymentStatus)) continue;     // Payment Status: Y
          if (!startsYes(shippingRequired)) continue;  // Shipping Required: Y
          if (!isBlank(shippedStatus)) continue;       // Shipment Status: BLANK only

          shipments.push({
            auctionNumber: f.auctionNum ?? null,
            auctionName: f.name,
            sheetId: f.id,
            tabName: tab,

            bidderNumber,
            firstName: iFirst !== -1 ? String(r[iFirst] ?? "").trim() : "",
            lastName: iLast !== -1 ? String(r[iLast] ?? "").trim() : "",
            lotsBought: iLots !== -1 ? String(r[iLots] ?? "").trim() : "",
            balance: iBalance !== -1 ? String(r[iBalance] ?? "").trim() : "",

            paymentStatus: String(paymentStatus ?? "").trim(),
            shippingRequired: String(shippingRequired ?? "").trim(),
            shippedStatus: String(shippedStatus ?? "").trim(),
          });
        }

        // stop after the first matching tab (prevents duplicates)
        break;
      }

      if (debug) {
        debugInfo.push({
          fileName: f.name,
          spreadsheetId: f.id,
          tabsScanned: tabNames,
          matchedTab,
          matchedHeaderRow,
          headers: headersRaw,
        });
      }
    }

    // nice ordering
    shipments.sort((a, b) => {
      const an = (a.auctionNumber ?? 0) - (b.auctionNumber ?? 0);
      if (an !== 0) return an;
      return String(a.bidderNumber).localeCompare(String(b.bidderNumber));
    });

    return NextResponse.json({
      success: true,
      count: shipments.length,
      shipments,
      ...(debug ? { sheetsFound: files.length, debugInfo } : {}),
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || String(err) },
      { status: 500 }
    );
  }
}
