"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

type Item = {
  sheetId: string;
  rowNumber: number;
  bidcard: string;
  firstName: string;
  lastName: string;
  lotsWon: string;
  paymentStatus: string;
  shippingRequired: string;
  shippedStatus: string;
  invoiceUrl: string | null;
};

function Toggle({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", border: "1px solid #444", borderRadius: 12, padding: 12 }}>
      <div style={{ fontWeight: 800 }}>{label}</div>
      <button
        onClick={onClick}
        style={{
          width: 70,
          padding: "8px 10px",
          borderRadius: 999,
          border: "1px solid #444",
          background: on ? "#16a34a" : "#dc2626",
          color: "white",
          fontWeight: 900
        }}
      >
        {on ? "Y" : "—"}
      </button>
    </div>
  );
}

export default function ShipmentDetailPage() {
  const params = useParams<{ sheetId: string; row: string }>();
  const router = useRouter();

  const sheetId = decodeURIComponent(params.sheetId);
  const rowNumber = Number(params.row);

  const [item, setItem] = useState<Item | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `/api/shipments/item?sheetId=${encodeURIComponent(sheetId)}&rowNumber=${encodeURIComponent(String(rowNumber))}`,
        { cache: "no-store" }
      );
      const text = await res.text();
      const data = JSON.parse(text);

      if (!res.ok || !data?.success) throw new Error(data?.error || "Failed to load item");
      setItem(data.item);
    } catch (e: any) {
      setError(e?.message || String(e));
      setItem(null);
    } finally {
      setLoading(false);
    }
  }

  async function save(next: Item) {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/shipments/item/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sheetId,
          rowNumber,
          paymentStatus: next.paymentStatus,
          shippingRequired: next.shippingRequired,
          shippedStatus: next.shippedStatus,
        }),
      });
      const text = await res.text();
      const data = JSON.parse(text);

      if (!res.ok || !data?.success) throw new Error(data?.error || "Update failed");

      // If shipped is now Y, go back to list
      if (next.shippedStatus === "Y") {
        router.push("/shipments");
        return;
      }
    } catch (e: any) {
      setError(e?.message || String(e));
      await load();
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <div style={{ padding: 16 }}>Loading…</div>;

  if (!item) {
    return (
      <div style={{ padding: 16 }}>
        <Link href="/shipments" className="underline">← Back</Link>
        <div style={{ marginTop: 12, border: "1px solid #ff5a5a", padding: 12, borderRadius: 10 }}>{error || "No item"}</div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: 16 }}>
      <Link href="/shipments" className="underline">← Back</Link>

      <h1 style={{ fontSize: 24, fontWeight: 900, marginTop: 12 }}>
        {item.firstName} {item.lastName} • Bidcard {item.bidcard}
      </h1>

      {error && (
        <div style={{ marginTop: 12, border: "1px solid #ff5a5a", padding: 12, borderRadius: 10 }}>
          {error}
        </div>
      )}

      <div style={{ marginTop: 12, border: "1px solid #333", borderRadius: 12, padding: 14 }}>
        <div><b>Lots Won:</b> {item.lotsWon || "0"}</div>
        <div style={{ marginTop: 10 }}>
          <b>Invoice:</b>{" "}
          {item.invoiceUrl ? (
            <a href={item.invoiceUrl} target="_blank" rel="noreferrer" className="underline">Open invoice</a>
          ) : (
            <span style={{ opacity: 0.8 }}>No invoice found</span>
          )}
        </div>
      </div>

      <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
        <Toggle
          label="Payment Status"
          on={item.paymentStatus === "Y"}
          onClick={() => {
            const next = { ...item, paymentStatus: item.paymentStatus === "Y" ? "" : "Y" };
            setItem(next);
            save(next);
          }}
        />
        <Toggle
          label="Shipping Required"
          on={item.shippingRequired === "Y"}
          onClick={() => {
            const next = { ...item, shippingRequired: item.shippingRequired === "Y" ? "" : "Y" };
            setItem(next);
            save(next);
          }}
        />
        <Toggle
          label="Shipped Status"
          on={item.shippedStatus === "Y"}
          onClick={() => {
            const next = { ...item, shippedStatus: item.shippedStatus === "Y" ? "" : "Y" };
            setItem(next);
            save(next);
          }}
        />
      </div>

      {saving && <div style={{ marginTop: 10, opacity: 0.8 }}>Saving…</div>}
    </div>
  );
}