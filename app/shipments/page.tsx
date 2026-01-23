"use client";

import { useEffect, useMemo, useState } from "react";

type ShipmentItem = {
  auctionNumber: number;
  auctionName: string;
  bidderNumber: string;
  firstName: string;
  lastName: string;
  lotsBought: number;
  paymentStatus: string;
  shippingRequired: string;
  shippedStatus: string;
};

function isY(v: string | undefined | null) {
  const t = (v ?? "").trim().toLowerCase();
  return t === "y" || t.startsWith("y ");
}

function Pill({ variant, text }: { variant: "green" | "red"; text: string }) {
  const style: React.CSSProperties =
    variant === "green"
      ? {
          display: "inline-block",
          padding: "6px 10px",
          borderRadius: 999,
          background: "rgba(16, 185, 129, 0.18)",
          border: "1px solid rgba(16, 185, 129, 0.35)",
          color: "rgba(167, 243, 208, 1)",
          fontSize: 12,
          fontWeight: 900,
          letterSpacing: 0.7,
          textTransform: "uppercase",
        }
      : {
          display: "inline-block",
          padding: "6px 10px",
          borderRadius: 999,
          background: "rgba(244, 63, 94, 0.16)",
          border: "1px solid rgba(244, 63, 94, 0.35)",
          color: "rgba(254, 205, 211, 1)",
          fontSize: 12,
          fontWeight: 900,
          letterSpacing: 0.7,
          textTransform: "uppercase",
        };
  return <span style={style}>{text}</span>;
}

type SortMode = "AUCTION_ASC" | "AUCTION_DESC" | "LOTS_ASC" | "LOTS_DESC";

export default function ShipmentsPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [items, setItems] = useState<ShipmentItem[]>([]);
  const [outstandingCount, setOutstandingCount] = useState<number>(0);

  const [sortMode, setSortMode] = useState<SortMode>("AUCTION_ASC");
  const [q, setQ] = useState("");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/shipments/list", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || json?.success === false) throw new Error(json?.error || "Failed to load");
      setItems(json.shipments || []);
      setOutstandingCount(json.outstandingCount || 0);
    } catch (e: any) {
      setError(e?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    let arr = items;

    if (query) {
      arr = arr.filter((x) => {
        const name = `${x.firstName} ${x.lastName}`.toLowerCase();
        return (
          name.includes(query) ||
          String(x.bidderNumber).includes(query) ||
          String(x.auctionNumber).includes(query)
        );
      });
    }

    const sorted = [...arr];
    sorted.sort((a, b) => {
      if (sortMode === "AUCTION_ASC") return a.auctionNumber - b.auctionNumber;
      if (sortMode === "AUCTION_DESC") return b.auctionNumber - a.auctionNumber;
      if (sortMode === "LOTS_ASC") return (a.lotsBought || 0) - (b.lotsBought || 0);
      return (b.lotsBought || 0) - (a.lotsBought || 0);
    });

    return sorted;
  }, [items, q, sortMode]);

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="sticky top-0 z-10 border-b border-red-900/50 bg-neutral-950/90 backdrop-blur">
        <div className="mx-auto w-full max-w-md px-4 py-4 text-center">
          <div className="text-2xl font-extrabold tracking-wide text-red-500">
            MAD BIDS AUCTION
          </div>
          <div className="mt-1 text-sm font-medium tracking-wide text-neutral-300">
            SHIPMENTS SHIFT
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-md px-4 py-5">
        <div className="mb-3 flex items-center justify-between">
          <a href="/" className="text-sm text-red-300 underline">
            ← Back to menu
          </a>
          <button
            onClick={load}
            className="rounded-xl border border-neutral-800 bg-neutral-900/60 px-3 py-2 text-xs font-bold text-neutral-200"
          >
            Refresh
          </button>
        </div>

        <div className="rounded-2xl border border-red-900/40 bg-neutral-900/60 p-4 shadow">
          <div className="text-sm font-bold text-neutral-100">
            Outstanding shipments:{" "}
            <span className="text-red-300">{outstandingCount}</span>
          </div>

          <div className="mt-3">
            <div className="text-xs text-neutral-400">Search (name or bidcard)</div>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Type name or bidcard..."
              className="mt-1 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-3 text-sm outline-none focus:border-red-600"
            />
          </div>

          <div className="mt-3">
            <div className="text-xs text-neutral-400">Sort</div>
            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as SortMode)}
              className="mt-1 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-3 text-sm outline-none focus:border-red-600"
            >
              <option value="AUCTION_ASC">Ascending Auction (oldest → newest)</option>
              <option value="AUCTION_DESC">Descending Auction (newest → oldest)</option>
              <option value="LOTS_ASC">Lot count (ascending)</option>
              <option value="LOTS_DESC">Lot count (descending)</option>
            </select>
          </div>

          {loading && <div className="mt-3 text-sm text-neutral-300">Loading…</div>}
          {error && (
            <div className="mt-3 rounded-xl border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-200">
              {error}
            </div>
          )}
        </div>

        <div className="mt-4 space-y-3">
          {filtered.map((x) => {
            const paymentIsY = isY(x.paymentStatus);
            const shipReqIsY = isY(x.shippingRequired);
            const shippedIsY = isY(x.shippedStatus);

            return (
              <a
                key={`${x.auctionNumber}-${x.bidderNumber}`}
                href={`/shipments/${encodeURIComponent(String(x.auctionNumber))}/${encodeURIComponent(
                  x.bidderNumber
                )}`}
                className="block rounded-2xl border border-neutral-800 bg-neutral-900/60 p-4"
              >
                <div className="text-base font-extrabold text-neutral-100">
                  {x.firstName} {x.lastName}
                </div>
                <div className="mt-1 text-sm text-neutral-300">
                  Bidcard: <span className="font-bold text-red-300">{x.bidderNumber}</span> ·
                  Auction: <span className="font-bold text-neutral-100"> {x.auctionNumber}</span> ·
                  Lots: <span className="font-bold text-neutral-100"> {x.lotsBought}</span>
                </div>

                <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
                  <div>
                    <div className="text-xs text-neutral-400">Payment</div>
                    <Pill variant={paymentIsY ? "green" : "red"} text={paymentIsY ? "PAID" : "NOT PAID"} />
                  </div>
                  <div>
                    <div className="text-xs text-neutral-400">Shipping required</div>
                    <Pill variant={shipReqIsY ? "green" : "red"} text={shipReqIsY ? "YES" : "NO"} />
                  </div>
                  <div>
                    <div className="text-xs text-neutral-400">Shipped</div>
                    <Pill variant={shippedIsY ? "green" : "red"} text={shippedIsY ? "SHIPPED" : "NO"} />
                  </div>
                </div>
              </a>
            );
          })}

          {!loading && filtered.length === 0 && (
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-4 text-sm text-neutral-300">
              No shipments found.
            </div>
          )}
        </div>

        <div className="h-10" />
      </div>
    </div>
  );
}