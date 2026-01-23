import { NextResponse } from "next/server";
import { google } from "googleapis";

function getAuth() {
  const credentials = JSON.parse(
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON as string
  );

  return new google.auth.GoogleAuth({
    credentials,
    scopes: [
      "https://www.googleapis.com/auth/drive.readonly",
      "https://www.googleapis.com/auth/spreadsheets.readonly",
    ],
  });
}

async function findFolderIdByName(
  drive: any,
  parentFolderId: string,
  folderName: string
) {
  const q = [
    `'${parentFolderId}' in parents`,
    `mimeType='application/vnd.google-apps.folder'`,
    `name='${folderName.replace(/'/g, "\\'")}'`,
    `trashed=false`,
  ].join(" and ");

  const res = await drive.files.list({
    q,
    fields: "files(id,name)",
    pageSize: 10,
  });

  return res.data.files?.[0]?.id || null;
}

async function findPdfByBidcard(
  drive: any,
  folderId: string,
  bidcard: string
) {
  // try exact file name first: 20000.pdf
  const q = [
    `'${folderId}' in parents`,
    `mimeType='application/pdf'`,
    `(name='${bidcard}.pdf' or name='${bidcard}')`,
    `trashed=false`,
  ].join(" and ");

  const res = await drive.files.list({
    q,
    fields: "files(id,name,webViewLink)",
    pageSize: 10,
  });

  return res.data.files?.[0] || null;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const auctionName = url.searchParams.get("auction"); // ex: "Auction 22"
    const bidcard = url.searchParams.get("bidcard"); // ex: "20000"

    if (!auctionName || !bidcard) {
      return NextResponse.json(
        { success: false, error: "Missing auction or bidcard" },
        { status: 400 }
      );
    }

    const invoicesRoot = process.env.AUCTION_INVOICES_FOLDER_ID;
    if (!invoicesRoot) {
      return NextResponse.json(
        { success: false, error: "Missing AUCTION_INVOICES_FOLDER_ID" },
        { status: 500 }
      );
    }

    const auth = getAuth();
    const drive = google.drive({ version: "v3", auth });

    // 1) find the auction subfolder inside the invoices root folder
    const auctionFolderId = await findFolderIdByName(
      drive,
      invoicesRoot,
      auctionName
    );

    if (!auctionFolderId) {
      return NextResponse.json(
        {
          success: false,
          error: `Auction folder not found: ${auctionName}`,
        },
        { status: 404 }
      );
    }

    // 2) find the PDF inside that subfolder
    const file = await findPdfByBidcard(drive, auctionFolderId, bidcard);

    if (!file) {
      return NextResponse.json(
        {
          success: false,
          error: `Invoice not found for bidcard ${bidcard} in ${auctionName}`,
        },
        { status: 404 }
      );
    }

    // If webViewLink isn't returned (sometimes), request it
    // but usually this works if the Drive API has permission.
    return NextResponse.json({
      success: true,
      fileId: file.id,
      name: file.name,
      link:
        file.webViewLink ||
        `https://drive.google.com/file/d/${file.id}/view`,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || "Unknown error" },
      { status: 500 }
    );
  }
}