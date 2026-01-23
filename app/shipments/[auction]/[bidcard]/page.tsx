"use client";

import { useEffect, useMemo, useState } from "react";

type BidderRecord = Record<string, string>;

function isY(v: string | undefined | null) {
  const t = (v ?? "").trim().toLowerCase();
  return t === "y" || t.startsWith("y ");
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

export default function ShipmentDetailPage({
  params,
}: {
  params: { auction: string; bidcard: string };
}) {
  const auctionNumber = params.auction;
  const bidcard = params.bidcard;

  const auctionName = useMemo(() => `Auction ${auctionNumber}`, [auctionNumber]);

  const [loading, setLoading] = useState(false);
  const [savingPay, setSavingPay] = useState(false);
  const [savingReq, setSavingReq] = useState(false);
  const [savingShipped, setSavingShipped] = useState(false);

  const [record, setRecord] = useState<BidderRecord | null>(null);
  const [invoiceLink, setInvoiceLink] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const bidderRes = await fetch(
        `/api/auctions/bidder?auction=${encodeURIComponent(auctionName)}&bidder=${encodeURIComponent(
          bidcard
        )}`,
        { cache: "no-store" }
      );
      const bidderJson = await bidderRes.json();
      if (!bidderRes.ok || bidderJson?.success === false) {
        throw new Error(bidderJson?.error || "Failed to load bidder");
      }
      setRecord(bidderJson.record || {});

      const invRes = await fetch(
        `/api/auctions/invoice?auction=${encodeURIComponent(auctionName)}&bidcard=${encodeURIComponent(
          bidcard
        )}`,
        { cache: "no-store" }
      );
      const invJson = await invRes.json();
      if (invRes.ok && invJson?.success && invJson?.link) setInvoiceLink(invJson.link);
      else setInvoiceLink(null);
    } catch (e: any) {
      setError(e?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [auctionName, bidcard]);

  async function saveUpdates(updates: Record<string, string>) {
    const res = await fetch(`/api/auctions/update`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        auction: auctionName,
        bidder: bidcard,
        updates,
      }),
    });

    const json = await res.json();
    if (!res.ok || json?.success === false) throw new Error(json?.error || "Update failed");
  }

  const paymentIsY = isY(record?.["Payment Status"] ?? "");
  const shipReqIsY = isY(record?.["Shipping Required"] ?? "");
  const shippedIsY = isY(record?.["Shipped status"] ?? "");

  async function togglePayment(next: boolean) {
    setSavingPay(true);
    try {
      await saveUpdates({ ["Payment Status"]: next ? "Y" : "" });
      await load();
    } catch (e: any) {
      setError(e?.message || "Failed to update");
    } finally {
      setSavingPay(false);
    }
  }

  async function toggleShipReq(next: boolean) {
    setSavingReq(true);
    try {
      await saveUpdates({ ["Shipping Required"]: next ? "Y" : "" });
      await load();
      // if they turn OFF shipping required, it should disappear from list
      if (!next) window.location.href = "/shipments";
    } catch (e: any) {
      setError(e?.message || "Failed to update");
    } finally {
      setSavingReq(false);
    }
  }

  async function toggleShipped(next: boolean) {
    setSavingShipped(true);
    try {
      await saveUpdates({ ["Shipped status"]: next ? "Y" : "" });
      await load();
      // once shipped, auto back to list
      if (next) window.location.href = "/shipments";
    } catch (e: any) {
      setError(e?.message || "Failed to update");
    } finally {
      setSavingShipped(false);
    }
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="sticky top-0 z-10 border-b border-red-900/50 bg-neutral-950/90 backdrop-blur">
        <div className="mx-auto w-full max-w-md px-4 py-4 text-center">
          <div className="text-2xl font-extrabold tracking-wide text-red-500">
            SHIPMENT DETAILS
          </div>
          <div className="mt-1 text-sm font-medium tracking-wide text-neutral-300">
            Auction {auctionNumber} · Bidcard {bidcard}
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-md px-4 py-5">
        <div className="mb-3">
          <a href="/shipments" className="text-sm text-red-300 underline">
            ← Back to shipments
          </a>
        </div>

        {loading && <div className="text-sm text-neutral-300">Loading…</div>}
        {error && (
          <div className="mt-3 rounded-xl border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-200">
            {error}
          </div>
        )}

        <div className="mt-4 space-y-4">
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
              <div className="mt-2 text-sm text-neutral-400">No invoice found.</div>
            )}
          </div>

          <div className="rounded-2xl border border-red-900/40 bg-neutral-900/60 p-4">
            <div className="text-sm font-bold text-neutral-100">Update</div>

            <div className="mt-3 rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-3">
              <div className="text-xs text-neutral-400">Payment status</div>
              <div className="mt-2 flex items-center justify-between gap-3">
                <div className="text-sm">{paymentIsY ? "Y (Paid)" : "Blank (Not paid)"}</div>
                <Toggle checked={paymentIsY} onChange={togglePayment} disabled={savingPay} />
              </div>
            </div>

            <div className="mt-3 rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-3">
              <div className="text-xs text-neutral-400">Shipping required</div>
              <div className="mt-2 flex items-center justify-between gap-3">
                <div className="text-sm">{shipReqIsY ? "Y (Required)" : "Blank (Not required)"}</div>
                <Toggle checked={shipReqIsY} onChange={toggleShipReq} disabled={savingReq} />
              </div>
            </div>

            <div className="mt-3 rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-3">
              <div className="text-xs text-neutral-400">Shipped status</div>
              <div className="mt-2 flex items-center justify-between gap-3">
                <div className="text-sm">{shippedIsY ? "Y (Shipped)" : "Blank (Not shipped)"}</div>
                <Toggle checked={shippedIsY} onChange={toggleShipped} disabled={savingShipped} />
              </div>
            </div>
          </div>

          {record && (
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-4">
              <div className="text-sm font-bold text-neutral-100">Customer</div>
              <div className="mt-2 text-sm text-neutral-300">
                {record["Buyer First Name"]} {record["Buyer Last Name"]}
              </div>
              <div className="mt-1 text-xs text-neutral-500">
                Lots: {record["Lots Bought"]} · Phone: {record["Buyer Phone"]}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}