"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Shipment = {
  sheetId: string;
  sheetName: string;
  auctionNumber: number | null;
  rowNumber: number;
  bidcard: string;
  firstName: string;
  lastName: string;
  lotsWon: string;
};

export default function ShipmentsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [q, setQ] = useState("");

  async function load() {
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/shipments/list", {
        cache: "no-store",
      });

      let data;
      try {
        data = await res.json();
      } catch {
        throw new Error("API did not return JSON");
      }

      if (!res.ok || !data?.success) {
        throw new Error(data?.error || "Failed to load shipments");
      }

      setShipments(Array.isArray(data.shipments) ? data.shipments : []);
    } catch (e: any) {
      setError(e.message || "Unknown error");
      setShipments([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return shipments;
    return shipments.filter((x) =>
      `${x.firstName} ${x.lastName} ${x.bidcard} ${x.sheetName}`
        .toLowerCase()
        .includes(s)
    );
  }, [q, shipments]);

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: 16 }}>
      <h1 style={{ fontSize: 28, fontWeight: 900 }}>SHIPMENTS</h1>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search name or bidcard…"
        style={{ width: "100%", padding: 12, marginBottom: 12 }}
      />

      {error && (
        <div style={{ color: "red", marginBottom: 12 }}>{error}</div>
      )}

      <div>
        {loading
          ? "Loading…"
          : filtered.map((s) => (
              <Link
                key={`${s.sheetId}-${s.rowNumber}`}
                href={`/shipments/${encodeURIComponent(
                  s.sheetId
                )}/${s.rowNumber}`}
                style={{
                  display: "block",
                  padding: 12,
                  border: "1px solid #444",
                  marginBottom: 8,
                  borderRadius: 8,
                }}
              >
                <b>
                  {s.firstName} {s.lastName}
                </b>
                <div style={{ fontSize: 12 }}>
                  Bidcard {s.bidcard} • Lots {s.lotsWon}
                </div>
              </Link>
            ))}
      </div>
    </div>
  );
}