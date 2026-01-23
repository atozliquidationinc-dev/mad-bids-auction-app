import { NextResponse } from "next/server";
import { google } from "googleapis";

function getAuth() {
  const credentials = JSON.parse(
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON as string
  );

  return new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  });
}

async function findSubfolderId(
  drive: any,
  parentFolderId: string,
  subfolderName: string
) {
  const res = await drive.files.list({
    q: `'${parentFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and name='${subfolderName}' and trashed=false`,
    fields: "files(id, name)",
  });

  return res.data.files?.[0]?.id || null;
}

async function findInvoicePdf(
  drive: any,
  folderId: string,
  bidderNumber: string
) {
  const res = await drive.files.list({
    q: `'${folderId}' in parents and name='${bidderNumber}.pdf' and trashed=false`,
    fields: "files(id, name, webViewLink)",
  });

  return res.data.files?.[0] || null;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const auction = searchParams.get("auction");
    const bidderNumber = searchParams.get("bidderNumber");

    if (!auction || !bidderNumber) {
      return NextResponse.json(
        { success: false, error: "Missing auction or bidderNumber" },
        { status: 400 }
      );
    }

    const rootFolderId = process.env.AUCTION_INVOICES_FOLDER_ID;
    if (!rootFolderId) {
      return NextResponse.json(
        { success: false, error: "Missing invoice folder env var" },
        { status: 500 }
      );
    }

    const auth = getAuth();
    const drive = google.drive({ version: "v3", auth });

    // 1) Find auction subfolder
    const auctionFolderId = await findSubfolderId(
      drive,
      rootFolderId,
      auction
    );

    if (!auctionFolderId) {
      return NextResponse.json(
        { success: false, error: "Auction folder not found" },
        { status: 404 }
      );
    }

    // 2) Find invoice PDF
    const file = await findInvoicePdf(
      drive,
      auctionFolderId,
      bidderNumber
    );

    if (!file) {
      return NextResponse.json(
        { success: false, error: "Invoice not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      previewUrl: `https://drive.google.com/file/d/${file.id}/preview`,
      openUrl: file.webViewLink,
      fileName: file.name,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}import { NextResponse } from "next/server";
import { google } from "googleapis";

function getAuth() {
  const credentials = JSON.parse(
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON as string
  );

  return new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  });
}

async function findSubfolderId(
  drive: any,
  parentFolderId: string,
  subfolderName: string
) {
  const res = await drive.files.list({
    q: `'${parentFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and name='${subfolderName}' and trashed=false`,
    fields: "files(id, name)",
  });

  return res.data.files?.[0]?.id || null;
}

async function findInvoicePdf(
  drive: any,
  folderId: string,
  bidderNumber: string
) {
  const res = await drive.files.list({
    q: `'${folderId}' in parents and name='${bidderNumber}.pdf' and trashed=false`,
    fields: "files(id, name, webViewLink)",
  });

  return res.data.files?.[0] || null;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const auction = searchParams.get("auction");
    const bidderNumber = searchParams.get("bidderNumber");

    if (!auction || !bidderNumber) {
      return NextResponse.json(
        { success: false, error: "Missing auction or bidderNumber" },
        { status: 400 }
      );
    }

    const rootFolderId = process.env.AUCTION_INVOICES_FOLDER_ID;
    if (!rootFolderId) {
      return NextResponse.json(
        { success: false, error: "Missing invoice folder env var" },
        { status: 500 }
      );
    }

    const auth = getAuth();
    const drive = google.drive({ version: "v3", auth });

    // 1) Find auction subfolder
    const auctionFolderId = await findSubfolderId(
      drive,
      rootFolderId,
      auction
    );

    if (!auctionFolderId) {
      return NextResponse.json(
        { success: false, error: "Auction folder not found" },
        { status: 404 }
      );
    }

    // 2) Find invoice PDF
    const file = await findInvoicePdf(
      drive,
      auctionFolderId,
      bidderNumber
    );

    if (!file) {
      return NextResponse.json(
        { success: false, error: "Invoice not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      previewUrl: `https://drive.google.com/file/d/${file.id}/preview`,
      openUrl: file.webViewLink,
      fileName: file.name,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}