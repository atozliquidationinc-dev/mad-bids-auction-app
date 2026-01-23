import { NextResponse } from "next/server";
import { google } from "googleapis";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const bidcard = searchParams.get("bidcard");

    if (!bidcard) {
      return NextResponse.json(
        { success: false, error: "Missing bidcard" },
        { status: 400 }
      );
    }

    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(
        process.env.GOOGLE_SERVICE_ACCOUNT_JSON as string
      ),
      scopes: ["https://www.googleapis.com/auth/drive.readonly"],
    });

    const drive = google.drive({ version: "v3", auth });

    const res = await drive.files.list({
      q: `'${process.env.AUCTION_INVOICES_FOLDER_ID}' in parents and name contains '${bidcard}'`,
      fields: "files(id, name)",
    });

    if (!res.data.files || res.data.files.length === 0) {
      return NextResponse.json({
        success: false,
        error: "Invoice not found",
      });
    }

    const fileId = res.data.files[0].id;

    return NextResponse.json({
      success: true,
      invoiceUrl: `https://drive.google.com/file/d/${fileId}/view`,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}