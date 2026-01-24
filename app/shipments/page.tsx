"use client";

import { useEffect, useMemo, useState } from "react";

type ShipmentItem = {
  auctionNumber?: number | null;
  auctionName?: string;
  bidderNumber: string;
  firstName?: string;
  lastName?: string;
  lotsBought?: number | string;
  paymentStatus?: string;
  shippingRequired?: string;
  shippedStatus?: string;
};

function norm(v: any) {
  return String(v ?? "").trim();
}

function isYes(v: any) {
  return norm(v).toLowerCase().startsWith("y");
}

function isBlank(v: any) {
  return norm(v) === "";
}

function toNumber(v: any) {
  const n = Number(String(v ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function Pill({
  variant,
  text,
}: {
  variant: "green" | "red" | "yellow";
  text: string;
}) {
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
      : variant === "yellow"
      ? {
          display: "inline-block",
          padding: "6px 10px",
          borderRadius: 999,
          background: "rgba(234, 179, 8, 0.14)",
          border: "1px solid rgba(234, 179, 8, 0.35)",
          color: "rgba(253, 230, 138, 1)",
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
      // ✅ CORRECT ENDPOINT
      const res = await fetch("/api/auctions/shipments/list", { cache: "no-store" });
      const json = await res.json();

      if (!res.ok || json?.success === false) {
        throw new Error(json?.error || "Failed to load shipments");
      }

      const raw: ShipmentItem[] = Array.isArray(json?.shipments) ? json.shipments : [];

      // ✅ YOUR EXACT RULES:
      // Payment Status: Y
      // Shipping Required: Y
      // Shipped Status: BLANK
      const pending = raw.filter((x) => {
        return isYes(x.paymentStatus) && isYes(x.shippingRequired) && isBlank(x.shippedStatus);
      });

      setItems(pending);
      setOutstandingCount(pending.length);
    } catch (e: any) {
      setError(e?.message || "Failed to load shipments");
      setItems([]);
      setOutstandingCount(0);
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
        const name = `${norm(x.firstName)} ${norm(x.lastName)}`.toLowerCase();
        return (
          name.includes(query) ||
          String(x.bidderNumber || "").toLowerCase().includes(query) ||
          String(x.auctionNumber ?? "").includes(query) ||
          String(x.auctionName || "").toLowerCase().includes(query)
        );
      });
    }

    const sorted = [...arr];
    sorted.sort((a, b) => {
      const aAuction = Number(a.auctionNumber ?? 0);
      const bAuction = Number(b.auctionNumber ?? 0);
      const aLots = toNumber(a.lotsBought);
      const bLots = toNumber(b.lotsBought);

      if (sortMode === "AUCTION_ASC") return aAuction - bAuction;
      if (sortMode === "AUCTION_DESC") return bAuction - aAuction;
      if (sortMode === "LOTS_ASC") return aLots - bLots;
      return bLots - aLots;
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
            <div className="text-xs text-neutral-400">Search (name, bidcard, auction)</div>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Type name, bidcard, auction..."
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
            const auctionNum = x.auctionNumber ?? 0;
            const lots = toNumber(x.lotsBought);

            return (
              <a
                key={`${auctionNum}-${x.bidderNumber}`}
                href={`/shipments/${encodeURIComponent(String(auctionNum))}/${encodeURIComponent(
                  x.bidderNumber
                )}`}
                className="block rounded-2xl border border-neutral-800 bg-neutral-900/60 p-4"
              >
                <div className="text-base font-extrabold text-neutral-100">
                  {norm(x.firstName) || "Unknown"} {norm(x.lastName)}
                </div>

                <div className="mt-1 text-sm text-neutral-300">
                  Bidcard:{" "}
                  <span className="font-bold text-red-300">{x.bidderNumber}</span> · Auction:{" "}
                  <span className="font-bold text-neutral-100">
                    {auctionNum || "?"}
                  </span>
                  {x.auctionName ? (
                    <span className="text-neutral-400"> ({x.auctionName})</span>
                  ) : null}
                  · Lots: <span className="font-bold text-neutral-100">{lots}</span>
                </div>

                <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
                  <div>
                    <div className="text-xs text-neutral-400">Payment</div>
                    <Pill variant="green" text="PAID" />
                  </div>
                  <div>
                    <div className="text-xs text-neutral-400">Shipping required</div>
                    <Pill variant="green" text="YES" />
                  </div>
                  <div>
                    <div className="text-xs text-neutral-400">Shipped status</div>
                    <Pill variant="yellow" text="BLANK (PENDING)" />
                  </div>
                </div>
              </a>
            );
          })}

          {!loading && filtered.length === 0 && (
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-4 text-sm text-neutral-300">
              No outstanding shipments found (Paid=Y, Shipping Required=Y, Shipped Status blank).
            </div>
          )}
        </div>

        <div className="h-10" />
      </div>
    </div>
  );
}
