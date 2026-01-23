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

export default function Page() {
  // ✅ Fix dropdown issue: use a manual Auction input (because your API doesn’t provide an auction list)
  const [auction, setAuction] = useState(""); // e.g. "Auction 22"
  const [bidcard, setBidcard] = useState(""); // e.g. "20000"

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [record, setRecord] = useState<BidderRecord | null>(null);
  const [invoiceLink, setInvoiceLink] = useState<string | null>(null);

  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const canSearch = useMemo(() => {
    return auction.trim().length > 0 && bidcard.trim().length > 0 && !loading;
  }, [auction, bidcard, loading]);

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

    const cleanAuction = auction.trim();
    const cleanBidcard = bidcard.trim();

    try {
      // 1) Load bidder row from the Google Sheet
      const bidderRes = await fetch(
        `/api/auctions/bidder?auction=${encodeURIComponent(cleanAuction)}&bidder=${encodeURIComponent(cleanBidcard)}`,
        { cache: "no-store" }
      );
      const bidderJson = await bidderRes.json();

      if (!bidderRes.ok || bidderJson?.success === false) {
        throw new Error(bidderJson?.error || "Bidder lookup failed");
      }

      const rec: BidderRecord = bidderJson.record || {};
      setRecord(rec);

      // preload editable fields
      const initialEdits: Record<string, string> = {};
      for (const f of EDITABLE_FIELDS) initialEdits[f] = rec[f] ?? "";
      setEditValues(initialEdits);

      // 2) Load invoice PDF link from Drive (by bidcard number file name)
      const invRes = await fetch(
        `/api/auctions/invoice?auction=${encodeURIComponent(cleanAuction)}&bidcard=${encodeURIComponent(cleanBidcard)}`,
        { cache: "no-store" }
      );
      const invJson = await invRes.json();

      if (invRes.ok && invJson?.success && invJson?.link) {
        setInvoiceLink(invJson.link);
      } else {
        // Don’t hard-fail search if invoice missing
        setInvoiceLink(null);
      }
    } catch (e: any) {
      setError(e?.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveEdits() {
    if (!record) return;

    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      const cleanAuction = auction.trim();
      const cleanBidcard = bidcard.trim();

      const res = await fetch(`/api/auctions/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          auction: cleanAuction,
          bidder: cleanBidcard,
          updates: editValues,
        }),
      });

      const json = await res.json();
      if (!res.ok || json?.success === false) {
        throw new Error(json?.error || "Update failed");
      }

      setNotice("Saved ✅");

      // Refresh bidder record after save
      await handleSearch();
    } catch (e: any) {
      setError(e?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-red-900/50 bg-neutral-950/90 backdrop-blur">
        <div className="mx-auto w-full max-w-md px-4 py-4">
          <div className="text-center">
            <div className="text-2xl font-extrabold tracking-wide text-red-500">
              MAD BIDS AUCTION
            </div>
            <div className="mt-1 text-sm font-medium tracking-wide text-neutral-300">
              MOBILE LOOK UP TOOL
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="mx-auto w-full max-w-md px-4 py-5">
        {/* Input card */}
        <div className="rounded-2xl border border-red-900/40 bg-neutral-900/60 p-4 shadow">
          <div className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
            Search
          </div>

          <label className="mt-3 block text-sm text-neutral-200">Auction</label>
          <input
            value={auction}
            onChange={(e) => setAuction(e.target.value)}
            placeholder='Type like: "Auction 22"'
            className="mt-1 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-3 text-base outline-none focus:border-red-600"
          />

          <label className="mt-3 block text-sm text-neutral-200">Bidcard #</label>
          <input
            value={bidcard}
            onChange={(e) => setBidcard(e.target.value)}
            placeholder='Type like: "20000"'
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

        {/* Results */}
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

            {/* View-only fields */}
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-4">
              <div className="text-sm font-bold text-neutral-100">Buyer Info</div>
              <div className="mt-3 space-y-2">
                {VIEW_FIELDS.map((k) => (
                  <div
                    key={k}
                    className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2"
                  >
                    <div className="text-xs text-neutral-400">{k}</div>
                    <div className="text-sm text-neutral-100">
                      {record[k] ?? ""}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Editable fields */}
            <div className="rounded-2xl border border-red-900/40 bg-neutral-900/60 p-4">
              <div className="text-sm font-bold text-neutral-100">
                Update Status
              </div>
              <div className="mt-3 space-y-3">
                {EDITABLE_FIELDS.map((k) => (
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

              <div className="mt-2 text-xs text-neutral-400">
                Editable: Pickup status, Shipped status, Refund, Notes, Payment Status
              </div>
            </div>
          </div>
        )}

        {/* Footer space */}
        <div className="h-10" />
      </div>
    </div>
  );
}