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
      const res = await fetch("/api/shipments/list", { cache: "no-store" });
      const text = await res.text();
      const data = JSON.parse(text);

      if (!res.ok || !data?.success) throw new Error(data?.error || "Failed to load shipments");
      setShipments(Array.isArray(data.shipments) ? data.shipments : []);
    } catch (e: any) {
      setError(e?.message || String(e));
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
    return shipments.filter((x) => {
      const hay = `${x.firstName} ${x.lastName} ${x.bidcard} ${x.sheetName}`.toLowerCase();
      return hay.includes(s);
    });
  }, [q, shipments]);

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: 16 }}>
      <h1 style={{ fontSize: 28, fontWeight: 900, marginBottom: 4 }}>MAD BIDS AUCTION</h1>
      <div style={{ opacity: 0.85, marginBottom: 12 }}>SHIPMENTS SHIFT</div>

      <div style={{ marginBottom: 12 }}>
        <Link href="/" className="underline">← Back</Link>
      </div>

      <div style={{ border: "1px solid #333", borderRadius: 12, padding: 14 }}>
        <div style={{ fontWeight: 800, marginBottom: 10 }}>
          Outstanding shipments: {loading ? "…" : filtered.length}
        </div>

        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name or bidcard…"
          style={{ width: "100%", padding: 12, borderRadius: 10, border: "1px solid #444" }}
        />

        <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
          <button
            onClick={load}
            style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #444" }}
          >
            Refresh
          </button>
        </div>

        {error && (
          <div style={{ marginTop: 12, border: "1px solid #ff5a5a", padding: 12, borderRadius: 10 }}>
            {error}
          </div>
        )}

        <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
          {!loading && filtered.map((s) => (
            <Link
              key={`${s.sheetId}:${s.rowNumber}`}
              href={`/shipments/${encodeURIComponent(s.sheetId)}/${encodeURIComponent(String(s.rowNumber))}`}
              style={{ display: "block", border: "1px solid #444", borderRadius: 12, padding: 12, textDecoration: "none" }}
            >
              <div style={{ fontWeight: 900 }}>{s.firstName} {s.lastName}</div>
              <div style={{ opacity: 0.85, fontSize: 13 }}>
                Auction: {s.auctionNumber ?? "?"} • Bidcard: {s.bidcard || "?"} • Lots: {s.lotsWon || "0"}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}"use client";

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
      const res = await fetch("/api/shipments/list", { cache: "no-store" });
      const text = await res.text();
      const data = JSON.parse(text);

      if (!res.ok || !data?.success) throw new Error(data?.error || "Failed to load shipments");
      setShipments(Array.isArray(data.shipments) ? data.shipments : []);
    } catch (e: any) {
      setError(e?.message || String(e));
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
    return shipments.filter((x) => {
      const hay = `${x.firstName} ${x.lastName} ${x.bidcard} ${x.sheetName}`.toLowerCase();
      return hay.includes(s);
    });
  }, [q, shipments]);

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: 16 }}>
      <h1 style={{ fontSize: 28, fontWeight: 900, marginBottom: 4 }}>MAD BIDS AUCTION</h1>
      <div style={{ opacity: 0.85, marginBottom: 12 }}>SHIPMENTS SHIFT</div>

      <div style={{ marginBottom: 12 }}>
        <Link href="/" className="underline">← Back</Link>
      </div>

      <div style={{ border: "1px solid #333", borderRadius: 12, padding: 14 }}>
        <div style={{ fontWeight: 800, marginBottom: 10 }}>
          Outstanding shipments: {loading ? "…" : filtered.length}
        </div>

        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name or bidcard…"
          style={{ width: "100%", padding: 12, borderRadius: 10, border: "1px solid #444" }}
        />

        <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
          <button
            onClick={load}
            style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #444" }}
          >
            Refresh
          </button>
        </div>

        {error && (
          <div style={{ marginTop: 12, border: "1px solid #ff5a5a", padding: 12, borderRadius: 10 }}>
            {error}
          </div>
        )}

        <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
          {!loading && filtered.map((s) => (
            <Link
              key={`${s.sheetId}:${s.rowNumber}`}
              href={`/shipments/${encodeURIComponent(s.sheetId)}/${encodeURIComponent(String(s.rowNumber))}`}
              style={{ display: "block", border: "1px solid #444", borderRadius: 12, padding: 12, textDecoration: "none" }}
            >
              <div style={{ fontWeight: 900 }}>{s.firstName} {s.lastName}</div>
              <div style={{ opacity: 0.85, fontSize: 13 }}>
                Auction: {s.auctionNumber ?? "?"} • Bidcard: {s.bidcard || "?"} • Lots: {s.lotsWon || "0"}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}