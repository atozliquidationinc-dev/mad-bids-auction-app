"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Shipment = {
  sheetId: string;
  row: number;

  buyerFirstName?: string;
  buyerLastName?: string;
  auction?: string;
  lotsWon?: string;
};

export default function ShipmentsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [query, setQuery] = useState("");

  const fetchShipments = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auctions/shipments/list", { cache: "no-store" });

      const text = await res.text();
      let data: any;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`API did not return JSON. Got: ${text.slice(0, 80)}...`);
      }

      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `Failed to load shipments (status ${res.status})`);
      }

      setShipments(Array.isArray(data.shipments) ? data.shipments : []);
    } catch (e: any) {
      setError(e?.message || "Unknown error");
      setShipments([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchShipments();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return shipments;
    return shipments.filter((s) => {
      const name = `${s.buyerFirstName || ""} ${s.buyerLastName || ""}`.toLowerCase();
      const auction = String(s.auction || "").toLowerCase();
      const lots = String(s.lotsWon || "").toLowerCase();
      return name.includes(q) || auction.includes(q) || lots.includes(q);
    });
  }, [query, shipments]);

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ fontSize: 30, fontWeight: 900, margin: 0 }}>MAD BIDS AUCTION</h1>
          <div style={{ fontSize: 14, opacity: 0.85 }}>SHIPMENTS SHIFT</div>
        </div>

        <button
          onClick={fetchShipments}
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid #444",
          }}
        >
          Refresh
        </button>
      </div>

      <div style={{ marginTop: 12, marginBottom: 10 }}>
        <Link href="/" className="underline">
          ← Back to menu
        </Link>
      </div>

      <div style={{ border: "1px solid #333", padding: 14, borderRadius: 10 }}>
        <div style={{ fontWeight: 800, marginBottom: 10 }}>
          Outstanding shipments: {loading ? "…" : filtered.length}
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          <div>
            <div style={{ fontSize: 12, opacity: 0.9 }}>Search (name)</div>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Type name…"
              style={{
                width: "100%",
                padding: 12,
                borderRadius: 10,
                border: "1px solid #444",
              }}
            />
          </div>

          {error && (
            <div style={{ border: "1px solid #ff5a5a", padding: 12, borderRadius: 8 }}>
              {error}
            </div>
          )}

          {loading ? (
            <div>Loading…</div>
          ) : filtered.length === 0 ? (
            <div style={{ opacity: 0.85 }}>No shipments found.</div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {filtered.map((s) => (
                <Link
                  key={`${s.sheetId}:${s.row}`}
                  href={`/shipments/${encodeURIComponent(s.sheetId)}/${encodeURIComponent(String(s.row))}`}
                  style={{
                    display: "block",
                    padding: 12,
                    borderRadius: 12,
                    border: "1px solid #444",
                    textDecoration: "none",
                  }}
                >
                  <div style={{ fontWeight: 800 }}>
                    {(s.buyerFirstName || "").toString()} {(s.buyerLastName || "").toString()}
                  </div>
                  <div style={{ fontSize: 13, opacity: 0.9 }}>
                    Auction: {s.auction || "?"} • Lots: {s.lotsWon || ""}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}