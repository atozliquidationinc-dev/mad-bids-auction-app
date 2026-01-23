import { NextResponse } from "next/server";
import { google } from "googleapis";

export async function GET() {
  try {
    const serviceJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;

    if (!serviceJson) {
      throw new Error("Missing env var: GOOGLE_SERVICE_ACCOUNT_JSON");
    }

    if (!spreadsheetId) {
      throw new Error("Missing env var: GOOGLE_SHEET_ID");
    }

    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(serviceJson),
      scopes: [
        "https://www.googleapis.com/auth/spreadsheets.readonly",
        "https://www.googleapis.com/auth/drive.readonly",
      ],
    });

    const sheets = google.sheets({ version: "v4", auth });

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "Sheet1!A:Z",
    });

    return NextResponse.json({
      success: true,
      rows: response.data.values ?? [],
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unknown error",
      },
      { status: 500 }
    );
  }
}