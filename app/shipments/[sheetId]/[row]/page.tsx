"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type ShipmentItem = {
  sheetId: string;
  row: number;

  buyerFirstName?: string;
  buyerLastName?: string;
  auction?: string;
  lotsWon?: string;
  invoiceUrl?: string;

  paymentStatus?: string;      // "Y" or ""
  shippingRequired?: string;   // "Y" or ""
  shippedStatus?: string;      // "Y" or ""
};

export default function ShipmentDetailPage() {
  const params = useParams<{ sheetId: string; row: string }>();
  const router = useRouter();

  const sheetId = params?.sheetId || "";
  const row = Number(params?.row || "0");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>("");
  const [item, setItem] = useState<ShipmentItem | null>(null);

  const fetchItem = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `/api/auctions/shipments/item?sheetId=${encodeURIComponent(sheetId)}&row=${encodeURIComponent(
          String(row)
        )}`,
        { cache: "no-store" }
      );

      const text = await res.text();
      let data: any;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`API did not return JSON. Got: ${text.slice(0, 80)}...`);
      }

      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `Failed to load item (status ${res.status})`);
      }

      setItem(data.item);
    } catch (e: any) {
      setError(e?.message || "Unknown error");
      setItem(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!sheetId || !row) {
      setLoading(false);
      setError("Missing sheetId or row in the URL.");
      return;
    }
    fetchItem();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetId, row]);

  const yn = (v?: string) => (String(v || "").trim().toLowerCase().startsWith("y") ? "Y" : "");

  const toggle = async (field: "paymentStatus" | "shippingRequired" | "shippedStatus") => {
    if (!item) return;

    const nextVal = yn(item[field]) === "Y" ? "" : "Y";
    const nextItem = { ...item, [field]: nextVal };
    setItem(nextItem);

    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/auctions/shipments/item/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sheetId,
          row,
          updates: { [field]: nextVal },
        }),
      });

      const text = await res.text();
      let data: any;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`Update API did not return JSON. Got: ${text.slice(0, 80)}...`);
      }

      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `Update failed (status ${res.status})`);
      }
    } catch (e: any) {
      setError(e?.message || "Update failed");
      // refresh from server to get back into sync
      fetchItem();
    } finally {
      setSaving(false);
    }
  };

  const pill = (on: boolean) =>
    `px-3 py-2 rounded font-bold ${on ? "bg-green-600 text-white" : "bg-red-600 text-white"}`;

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: 16 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12 }}>
        <button onClick={() => router.push("/shipments")} className="underline">
          ← Back
        </button>
        <div style={{ opacity: 0.8 }}>
          {saving ? "Saving..." : loading ? "Loading..." : ""}
        </div>
      </div>

      <h1 style={{ fontSize: 26, fontWeight: 800, marginBottom: 8 }}>Shipment Details</h1>

      {error && (
        <div style={{ border: "1px solid #ff5a5a", padding: 12, borderRadius: 8, marginBottom: 12 }}>
          {error}
        </div>
      )}

      {loading && <div>Loading…</div>}

      {!loading && item && (
        <div style={{ border: "1px solid #333", padding: 14, borderRadius: 10 }}>
          <div style={{ display: "grid", gap: 6 }}>
            <div>
              <b>Buyer:</b> {item.buyerFirstName || ""} {item.buyerLastName || ""}
            </div>
            <div>
              <b>Auction:</b> {item.auction || "(unknown)"}
            </div>
            <div>
              <b>Lots Won:</b> {item.lotsWon || ""}
            </div>

            {item.invoiceUrl ? (
              <div>
                <b>Invoice:</b>{" "}
                <a href={item.invoiceUrl} target="_blank" rel="noreferrer" className="underline">
                  Open invoice
                </a>
              </div>
            ) : null}
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
            <button
              className={pill(yn(item.paymentStatus) === "Y")}
              onClick={() => toggle("paymentStatus")}
            >
              Payment Status: {yn(item.paymentStatus) === "Y" ? "Y" : "Blank"}
            </button>

            <button
              className={pill(yn(item.shippingRequired) === "Y")}
              onClick={() => toggle("shippingRequired")}
            >
              Shipping Required: {yn(item.shippingRequired) === "Y" ? "Y" : "Blank"}
            </button>

            <button
              className={pill(yn(item.shippedStatus) === "Y")}
              onClick={() => toggle("shippedStatus")}
            >
              Shipped Status: {yn(item.shippedStatus) === "Y" ? "Y" : "Blank"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}