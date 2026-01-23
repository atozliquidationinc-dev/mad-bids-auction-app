import { NextResponse } from "next/server";
import { google } from "googleapis";

// -------- helpers --------
function normHeader(h: string) {
  return h.trim().toLowerCase().replace(/\s+/g, " ");
}

function yes(v: any) {
  const s = String(v ?? "").trim().toLowerCase();
  // treat: "y", "y ", "y - hibid", "yes" as YES
  return s === "y" || s.startsWith("y ") || s.startsWith("y-") || s === "yes";
}

function numFromName(name: string) {
  const m = name.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 999999;
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

// -------- route --------
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);

    // search + sort
    const q = (url.searchParams.get("q") || "").trim().toLowerCase();
    const sort = (url.searchParams.get("sort") || "auctionAsc").trim();

    const sheetsFolderId = process.env.AUCTION_SHEETS_FOLDER_ID;
    if (!sheetsFolderId) {
      return NextResponse.json(
        { success: false, error: "Missing AUCTION_SHEETS_FOLDER_ID" },
        { status: 500 }
      );
    }

    const range = process.env.AUCTION_SHEET_RANGE || "Sheet1!A:Z";

    const auth = getAuth();
    const drive = google.drive({ version: "v3", auth });
    const sheets = google.sheets({ version: "v4", auth });

    // list auction sheet files in the folder
    const listRes = await drive.files.list({
      q: [
        `'${sheetsFolderId}' in parents`,
        `mimeType='application/vnd.google-apps.spreadsheet'`,
        `trashed=false`,
      ].join(" and "),
      fields: "files(id,name)",
      pageSize: 200,
    });

    const files = listRes.data.files || [];

    const shipments: any[] = [];

    for (const f of files) {
      const fileId = f.id!;
      const fileName = f.name || "Auction";

      const valuesRes = await sheets.spreadsheets.values.get({
        spreadsheetId: fileId,
        range,
      });

      const rows = valuesRes.data.values || [];
      if (!rows.length) continue;

      // find the header row (first row that contains "bidder number")
      let headerRowIndex = -1;
      for (let i = 0; i < Math.min(rows.length, 10); i++) {
        const r = rows[i] || [];
        const joined = r.map((x) => normHeader(String(x ?? ""))).join("|");
        if (joined.includes("bidder number")) {
          headerRowIndex = i;
          break;
        }
      }
      if (headerRowIndex === -1) continue;

      const headerRow = rows[headerRowIndex].map((h) => normHeader(String(h ?? "")));
      const dataRows = rows.slice(headerRowIndex + 1);

      const idx = (name: string) => headerRow.indexOf(normHeader(name));

      const iFirst = idx("buyer first name");
      const iLast = idx("buyer last name");
      const iBidder = idx("bidder number");
      const iLots = idx("lots bought");
      const iBalance = idx("balance");
      const iPay = idx("payment status");
      const iShipReq = idx("shipping required");
      const iShipped = idx("shipped status"); // handle both spellings below
      const iShipped2 = idx("shipped status "); // just in case trailing space
      const iShipped3 = idx("shipped status"); // redundant but harmless
      const iShippedAlt = idx("shipped status"); // keep

      // also accept "shipped status" / "shipped status" / "shipped status"
      const shippedIndex =
        iShipped !== -1
          ? iShipped
          : headerRow.findIndex((h) => h === "shipped status" || h === "shipped status");

      // If you used "Shipped status" exactly in your sheet, it normalizes to "shipped status" and will match.

      // REQUIRE these to exist
      if (iBidder === -1 || iPay === -1 || iShipReq === -1) continue;

      for (const r of dataRows) {
        if (!r || r.length === 0) continue;

        const first = iFirst !== -1 ? String(r[iFirst] ?? "").trim() : "";
        const last = iLast !== -1 ? String(r[iLast] ?? "").trim() : "";
        const bidder = String(r[iBidder] ?? "").trim();

        if (!bidder) continue;

        const lots = iLots !== -1 ? Number(String(r[iLots] ?? "0").trim() || "0") : 0;
        const balance = iBalance !== -1 ? String(r[iBalance] ?? "").trim() : "";

        const paymentOk = yes(r[iPay]);
        const shippingRequired = yes(r[iShipReq]);

        // shipped column might be missing or blank; treat missing as NOT shipped
        const shippedVal =
          shippedIndex !== -1 ? r[shippedIndex] : (headerRow.includes("shipped status") ? "" : "");
        const shippedOk = yes(shippedVal);

        // our rule: show shipments only if shippingRequired + paymentOk + NOT shipped
        if (shippingRequired && paymentOk && !shippedOk) {
          shipments.push({
            auctionName: fileName,
            auctionNumber: numFromName(fileName),
            bidderNumber: bidder,
            buyerFirstName: first,
            buyerLastName: last,
            lotsBought: lots,
            balance,
            paymentStatus: r[iPay],
            shippingRequired: r[iShipReq],
            shippedStatus: shippedVal ?? "",
          });
        }
      }
    }

    // filter by search (name or bidder)
    let filtered = shipments;
    if (q) {
      filtered = filtered.filter((s) => {
        const full = `${s.buyerFirstName} ${s.buyerLastName}`.toLowerCase();
        return (
          full.includes(q) ||
          String(s.bidderNumber || "").toLowerCase().includes(q)
        );
      });
    }

    // sort
    filtered.sort((a, b) => {
      if (sort === "auctionDesc") return b.auctionNumber - a.auctionNumber;
      if (sort === "lotsAsc") return (a.lotsBought || 0) - (b.lotsBought || 0);
      if (sort === "lotsDesc") return (b.lotsBought || 0) - (a.lotsBought || 0);
      // default: auctionAsc
      return a.auctionNumber - b.auctionNumber;
    });

    return NextResponse.json({
      success: true,
      count: filtered.length,
      shipments: filtered,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || "Unknown error" },
      { status: 500 }
    );
  }
}