import { NextResponse } from "next/server";
import { google } from "googleapis";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const bidderNumber = searchParams.get("bidder");

    if (!bidderNumber) {
      return NextResponse.json(
        { success: false, error: "Missing bidder number" },
        { status: 400 }
      );
    }

    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(
        process.env.GOOGLE_SERVICE_ACCOUNT_JSON as string
      ),
      scopes: [
        "https://www.googleapis.com/auth/spreadsheets.readonly",
        "https://www.googleapis.com/auth/drive.readonly",
      ],
    });

    const sheets = google.sheets({ version: "v4", auth });

    const spreadsheetId = process.env.GOOGLE_SHEET_ID!;
    const range = "Sheet1!A:Z";

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });

    const rows = res.data.values || [];
    const headers = rows[1];
    const dataRows = rows.slice(2);

    const bidderIndex = headers.indexOf("Bidder Number");

    if (bidderIndex === -1) {
      return NextResponse.json(
        { success: false, error: "Missing column: Bidder Number" },
        { status: 500 }
      );
    }

    const record = dataRows.find(
      (row) => row[bidderIndex] === bidderNumber
    );

    if (!record) {
      return NextResponse.json(
        { success: false, error: "Bidder not found" },
        { status: 404 }
      );
    }

    const result: Record<string, string> = {};
    headers.forEach((h: string, i: number) => {
      result[h] = record[i] ?? "";
    });

    return NextResponse.json({
      success: true,
      record: result,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}