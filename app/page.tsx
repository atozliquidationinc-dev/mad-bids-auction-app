"use client";

import { useMemo, useState } from "react";

type BidderRecord = Record<string, string>;

const VIEW_FIELDS = [
  "Buyer First Name",
  "Buyer Last Name",
  "Bidder Number",
  "Buyer Phone",
  "Lots Bought",
  "Balance",
  "Payment Status",
  "Shipping Required",
  "Pickup status",
  "Shipped status",
  "Refund",
  "Notes",
] as const;

const EDITABLE_FIELDS = [
  "Pickup status",
  "Shipped status",
  "Refund",
  "Notes",
  "Payment Status",
] as const;

function auctionNameFromNumber(auctionNumber: string) {
  const t = (auctionNumber || "").trim();
  if (!t) return "";
  if (/^\d+$/.test(t)) return `Auction ${t}`;
  if (/^auction\s+\d+$/i.test(t)) {
    const num = t.match(/\d+/)?.[0] || "";
    return `Auction ${num}`;
  }
  return t;
}

function isY(v: string | undefined | null) {
  return (v ?? "").trim().toLowerCase() === "y";
}

function isEmpty(v: string | undefined | null) {
  return (v ?? "").trim().length === 0;
}

function StatusPill({
  value,
  emptyLabel = "NO",
  yLabel = "YES",
}: {
  value: string;
  emptyLabel?: string;
  yLabel?: string;
}) {
  const on = isY(value);
  const text = on ? yLabel : emptyLabel;

  // Aesthetic hues: emerald + rose on dark background
  const style: React.CSSProperties = on
    ? {
        display: "inline-block",
        padding: "6px 10px",
        borderRadius: 999,
        background: "rgba(16, 185, 129, 0.18)", // emerald
        border: "1px solid rgba(16, 185, 129, 0.35)",
        color: "rgba(167, 243, 208, 1)",
        fontSize: 12,
        fontWeight: 800,
        letterSpacing: 0.6,
      }
    : {
        display: "inline-block",
        padding: "6px 10px",
        borderRadius: 999,
        background: "rgba(244, 63, 94, 0.16)", // rose
        border: "1px solid rgba(244, 63, 94, 0.35)",
        color: "rgba(254, 205, 211, 1)",
        fontSize: 12,
        fontWeight: 800,
        letterSpacing: 0.6,
      };

  return <span style={style}>{text}</span>;
}

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  // Mobile-friendly toggle with red/green glow
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!checked)}
      aria-pressed={checked}
      style={{
        width: 72,
        height: 38,
        borderRadius: 999,
        border: "1px solid rgba(255,255,255,0.12)",
        background: checked
          ? "rgba(16, 185, 129, 0.25)"
          : "rgba(244, 63, 94, 0.22)",
        boxShadow: checked
          ? "0 0 0 4px rgba(16,185,129,0.10)"
          : "0 0 0 4px rgba(244,63,94,0.10)",
        position: "relative",
        padding: 0,
        opacity: disabled ? 0.55 : 1,
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 3,
          left: checked ? 36 : 3,
          width: 32,
          height: 32,
          borderRadius: 999,
          background: "#0b0d12",
          border: "1px solid rgba(255,255,255,0.14)",
          transition: "left 120ms ease",
        }}
      />
    </button>
  );
}

export default function Page() {
  const [auctionNumber, setAuctionNumber] = useState("");
  const [bidcard, setBidcard] = useState("");

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingPickup, setSavingPickup] = useState(false);

  const [record, setRecord] = useState<BidderRecord | null>(null);
  const [invoiceLink, setInvoiceLink] = useState<string | null>(null);

  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const auctionName = useMemo(
    () => auctionNameFromNumber(auctionNumber),
    [auctionNumber]
  );

  const canSearch = useMemo(() => {
    return auctionName.trim().length > 0 && bidcard.trim().length > 0 && !loading;
  }, [auctionName, bidcard, loading]);

  function setEditField(key: string, value: string) {
    setEditValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSearch() {
    setLoading(true);
    setError(null);
    setNotice(null);
    setRecord(null);
    setInvoiceLink(null);
    setEditValues({});

    const cleanAuctionName = auctionName.trim();
    const cleanBidcard = bidcard.trim();

    try {
      // Bidder lookup (send multiple param names to match your backend variants)
      const bidderUrl =
        `/api/auctions/bidder?` +
        `auction=${encodeURIComponent(cleanAuctionName)}` +
        `&bidder=${encodeURIComponent(cleanBidcard)}` +
        `&bidderNumber=${encodeURIComponent(cleanBidcard)}` +
        `&bidcard=${encodeURIComponent(cleanBidcard)}`;

      const bidderRes = await fetch(bidderUrl, { cache: "no-store" });
      const bidderJson = await bidderRes.json();

      if (!bidderRes.ok || bidderJson?.success === false) {
        throw new Error(bidderJson?.error || "Bidder lookup failed");
      }

      const rec: BidderRecord = bidderJson.record || {};
      setRecord(rec);

      const initialEdits: Record<string, string> = {};
      for (const f of EDITABLE_FIELDS) initialEdits[f] = rec[f] ?? "";
      setEditValues(initialEdits);

      // Invoice lookup (your invoice route expects auction + bidcard)
      const invoiceUrl =
        `/api/auctions/invoice?` +
        `auction=${encodeURIComponent(cleanAuctionName)}` +
        `&bidcard=${encodeURIComponent(cleanBidcard)}`;

      const invRes = await fetch(invoiceUrl, { cache: "no-store" });
      const invJson = await invRes.json();

      if (invRes.ok && invJson?.success && invJson?.link) setInvoiceLink(invJson.link);
      else setInvoiceLink(null);
    } catch (e: any) {
      setError(e?.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function saveUpdates(updates: Record<string, string>) {
    const cleanAuctionName = auctionName.trim();
    const cleanBidcard = bidcard.trim();

    const res = await fetch(`/api/auctions/update`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        auction: cleanAuctionName,
        bidder: cleanBidcard,
        bidcard: cleanBidcard,
        bidderNumber: cleanBidcard,
        updates,
      }),
    });

    const json = await res.json();
    if (!res.ok || json?.success === false) {
      throw new Error(json?.error || "Update failed");
    }
  }

  async function handleSaveEdits() {
    if (!record) return;

    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      await saveUpdates(editValues);
      setNotice("Saved ✅");
      await handleSearch();
    } catch (e: any) {
      setError(e?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  // ✅ Instant-save pickup toggle
  async function handlePickupToggle(nextOn: boolean) {
    if (!record) return;

    setSavingPickup(true);
    setError(null);
    setNotice(null);

    const nextValue = nextOn ? "Y" : "";

    // Update UI immediately (optimistic)
    setEditValues((prev) => ({ ...prev, ["Pickup status"]: nextValue }));

    try {
      await saveUpdates({ ["Pickup status"]: nextValue });
      setNotice(nextOn ? "Pickup marked ✅" : "Pickup cleared ⚠️");
      await handleSearch();
    } catch (e: any) {
      // revert on failure
      setEditValues((prev) => ({ ...prev, ["Pickup status"]: record["Pickup status"] ?? "" }));
      setError(e?.message || "Failed to update pickup");
    } finally {
      setSavingPickup(false);
    }
  }

  const pickupY = isY(editValues["Pickup status"] ?? record?.["Pickup status"]);
  const paymentY = isY(record?.["Payment Status"] ?? "");

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="sticky top-0 z-10 border-b border-red-900/50 bg-neutral-950/90 backdrop-blur">
        <div className="mx-auto w-full max-w-md px-4 py-4 text-center">
          <div className="text-2xl font-extrabold tracking-wide text-red-500">
            MAD BIDS AUCTION
          </div>
          <div className="mt-1 text-sm font-medium tracking-wide text-neutral-300">
            MOBILE LOOK UP TOOL
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-md px-4 py-5">
        {/* Search */}
        <div className="rounded-2xl border border-red-900/40 bg-neutral-900/60 p-4 shadow">
          <div className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
            Search
          </div>

          <label className="mt-3 block text-sm text-neutral-200">Auction #</label>
          <input
            value={auctionNumber}
            onChange={(e) => setAuctionNumber(e.target.value)}
            placeholder='Type: "22"'
            inputMode="numeric"
            className="mt-1 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-3 text-base outline-none focus:border-red-600"
          />
          <div className="mt-1 text-xs text-neutral-400">
            Will search: <span className="text-neutral-200">{auctionName || "—"}</span>
          </div>

          <label className="mt-3 block text-sm text-neutral-200">Bidcard #</label>
          <input
            value={bidcard}
            onChange={(e) => setBidcard(e.target.value)}
            placeholder='Type: "20000"'
            inputMode="numeric"
            className="mt-1 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-3 text-base outline-none focus:border-red-600"
          />

          <button
            onClick={handleSearch}
            disabled={!canSearch}
            className="mt-4 w-full rounded-xl bg-red-600 px-4 py-3 text-base font-bold text-white disabled:opacity-40"
          >
            {loading ? "Searching..." : "Search"}
          </button>

          {error && (
            <div className="mt-3 rounded-xl border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-200">
              {error}
            </div>
          )}
          {notice && (
            <div className="mt-3 rounded-xl border border-emerald-900 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-200">
              {notice}
            </div>
          )}
        </div>

        {record && (
          <div className="mt-4 space-y-4">
            {/* Invoice */}
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-4">
              <div className="text-sm font-bold text-neutral-100">Invoice</div>
              {invoiceLink ? (
                <a
                  href={invoiceLink}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-block rounded-xl bg-neutral-950 px-3 py-2 text-sm font-semibold text-red-400 underline decoration-red-700/60"
                >
                  Open invoice PDF
                </a>
              ) : (
                <div className="mt-2 text-sm text-neutral-400">
                  No invoice found for this bidcard.
                </div>
              )}
            </div>

            {/* Buyer Info */}
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-4">
              <div className="text-sm font-bold text-neutral-100">Buyer Info</div>

              {/* Highlight pills */}
              <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
                <div>
                  <div className="text-xs text-neutral-400">Payment</div>
                  <StatusPill value={record["Payment Status"] ?? ""} emptyLabel="NOT PAID" yLabel="PAID" />
                </div>
                <div>
                  <div className="text-xs text-neutral-400">Picked Up</div>
                  <StatusPill value={record["Pickup status"] ?? ""} emptyLabel="NOT PICKED" yLabel="PICKED" />
                </div>
              </div>

              <div className="mt-3 space-y-2">
                {VIEW_FIELDS.map((k) => {
                  // For these two we already show pills, but still show raw value below for transparency
                  const val = record[k] ?? "";
                  const isSpecial = k === "Payment Status" || k === "Pickup status";
                  return (
                    <div
                      key={k}
                      className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2"
                    >
                      <div className="text-xs text-neutral-400">{k}</div>
                      <div className="text-sm text-neutral-100">
                        {isSpecial ? (isEmpty(val) ? "—" : val) : val}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Update Status */}
            <div className="rounded-2xl border border-red-900/40 bg-neutral-900/60 p-4">
              <div className="text-sm font-bold text-neutral-100">Update Status</div>

              {/* Pickup toggle (instant save) */}
              <div className="mt-3 rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-3">
                <div className="text-xs text-neutral-400">Pickup status</div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
                  <div className="text-sm text-neutral-100">
                    {pickupY ? "Y (Picked up)" : "Blank (Not picked up)"}
                  </div>
                  <Toggle checked={pickupY} onChange={handlePickupToggle} disabled={savingPickup} />
                </div>
                <div className="mt-2 text-xs text-neutral-400">
                  Toggling updates the sheet immediately.
                </div>
              </div>

              {/* Other editable fields stay as inputs */}
              <div className="mt-3 space-y-3">
                {EDITABLE_FIELDS.filter((f) => f !== "Pickup status").map((k) => (
                  <div key={k}>
                    <div className="text-xs text-neutral-400">{k}</div>
                    <input
                      value={editValues[k] ?? ""}
                      onChange={(e) => setEditField(k, e.target.value)}
                      className="mt-1 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-3 text-sm outline-none focus:border-red-600"
                    />
                  </div>
                ))}
              </div>

              <button
                onClick={handleSaveEdits}
                disabled={saving}
                className="mt-4 w-full rounded-xl bg-red-700 px-4 py-3 text-base font-bold text-white disabled:opacity-40"
              >
                {saving ? "Saving..." : "Save changes"}
              </button>
            </div>
          </div>
        )}

        <div className="h-10" />
      </div>
    </div>
  );
}