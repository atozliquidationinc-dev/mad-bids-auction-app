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
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError("");

        const res = await fetch("/api/shipments/list", {
          cache: "no-store",
        });

        let data: any;
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

    load();
  }, []);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return shipments.filter((s) =>
      `${s.firstName} ${s.lastName} ${s.bidcard} ${s.sheetName}`
        .toLowerCase()
        .includes(q)
    );
  }, [query, shipments]);

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: 16 }}>
      <h1>Shipments</h1>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search name or bidcard"
        style={{ width: "100%", padding: 10, marginBottom: 12 }}
      />

      {error && <div style={{ color: "red" }}>{error}</div>}
      {loading && <div>Loading…</div>}

      {!loading &&
        filtered.map((s) => (
          <Link
            key={`${s.sheetId}-${s.rowNumber}`}
            href={`/shipments/${encodeURIComponent(
              s.sheetId
            )}/${s.rowNumber}`}
            style={{
              display: "block",
              border: "1px solid #444",
              padding: 12,
              marginBottom: 8,
              borderRadius: 8,
            }}
          >
            <b>
              {s.firstName} {s.lastName}
            </b>
            <div>
              Bidcard {s.bidcard} • Lots {s.lotsWon}
            </div>
          </Link>
        ))}
    </div>
  );
}
