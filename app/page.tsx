"use client";

import { useEffect, useMemo, useState } from "react";

type AuctionItem = { name: string };

type BidderRecord = Record<string, string>;

const EDITABLE_FIELDS = [
  "Pickup status",
  "Shipped status",
  "Refund",
  "Notes",
  "Payment Status",
] as const;

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

function normalizeKeys(record: BidderRecord): BidderRecord {
  // Sometimes sheet headers vary in spacing/case. Keep as-is, but also add normalized access.
  const out: BidderRecord = { ...record };
  return out;
}

export default function Page() {
  const [auctions, setAuctions] = useState<AuctionItem[]>([]);
  const [auction, setAuction] = useState<string>("");
  const [bidcard, setBidcard] = useState<string>("");

  const [loadingAuctions, setLoadingAuctions] = useState(false);
  const [loadingSearch, setLoadingSearch] = useState(false);

  const [record, setRecord] = useState<BidderRecord | null>(null);
  const [invoiceLink, setInvoiceLink] = useState<string | null>(null);

  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Load auction list
  useEffect(() => {
    (async () => {
      setLoadingAuctions(true);
      setError(null);
      try {
        const res = await fetch("/api/auctions", { cache: "no-store" });
        const data = await res.json();

        // Expecting: { success:true, auctions:[{name:"Auction 22"}, ...] }
        // If your API returns a different shape, tell me and I’ll adjust.
        const list: AuctionItem[] = data?.auctions ?? [];

        setAuctions(list);

        // Auto-select first auction if none chosen
        if (!auction && list.length > 0) setAuction(list[0].name);
      } catch (e: any) {
        setError(e?.message ?? "Failed to load auctions.");
      } finally {
        setLoadingAuctions(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canSearch = useMemo(() => {
    return auction.trim().length > 0 && bidcard.trim().length > 0 && !loadingSearch;
  }, [auction, bidcard, loadingSearch]);

  async function handleSearch() {
    setLoadingSearch(true);
    setError(null);
    setNotice(null);
    setRecord(null);
    setInvoiceLink(null);

    const cleanBidcard = bidcard.trim();

    try {
      // 1) Get bidder record
      const bidderRes = await fetch(
        `/api/auctions/bidder?auction=${encodeURIComponent(auction)}&bidder=${encodeURIComponent(cleanBidcard)}`,
        { cache: "no-store" }
      );
      const bidderData = await bidderRes.json();

      if (!bidderRes.ok || bidderData?.success === false) {
        throw new Error(bidderData?.error || "Bidder lookup failed.");
      }

      const rec: BidderRecord = normalizeKeys(bidderData?.record || {});
      setRecord(rec);

      // Seed editable fields
      const seed: Record<string, string> = {};
      for (const key of EDITABLE_FIELDS) seed[key] = rec?.[key] ?? "";
      setEditValues(seed);

      // 2) Get invoice link (optional but usually available)
      const invRes = await fetch(
        `/api/auctions/invoice?auction=${encodeURIComponent(auction)}&bidcard=${encodeURIComponent(cleanBidcard)}`,
        { cache: "no-store" }
      );
      const invData = await invRes.json();

      if (invRes.ok && invData?.success && invData?.link) {
        setInvoiceLink(invData.link);
      } else {
        setInvoiceLink(null);
      }
    } catch (e: any) {
      setError(e?.message ?? "Search failed.");
    } finally {
      setLoadingSearch(false);
    }
  }

  async function handleSave() {
    if (!record) return;
    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      // IMPORTANT:
      // This assumes you have POST /api/auctions/update that updates the sheet row
      // using auction + bidder number.
      // If your update route expects different keys, tell me and I’ll match it exactly.
      const res = await fetch("/api/auctions/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          auction,
          bidder: bidcard.trim(),
          updates: editValues,
        }),
      });

      const data = await res.json();
      if (!res.ok || data?.success === false) {
        throw new Error(data?.error || "Save failed.");
      }

      setNotice("Saved ✅");

      // Re-run search to refresh view (optional but keeps UI consistent)
      await handleSearch();
    } catch (e: any) {
      setError(e?.message ?? "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  function FieldRow({ label, value }: { label: string; value: string }) {
    return (
      <div style={styles.row}>
        <div style={styles.label}>{label}</div>
        <div style={styles.value}>{value || "—"}</div>
      </div>
    );
  }

  function EditableRow({
    label,
    value,
    onChange,
  }: {
    label: string;
    value: string;
    onChange: (v: string) => void;
  }) {
    const isNotes = label === "Notes";
    return (
      <div style={styles.row}>
        <div style={styles.label}>{label}</div>
        {isNotes ? (
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            rows={4}
            style={styles.textarea}
            placeholder="Enter notes…"
          />
        ) : (
          <input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            style={styles.input}
            placeholder={`Enter ${label}…`}
          />
        )}
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div style={styles.title}>Auction Lookup</div>
        <div style={styles.subtitle}>Mobile pickup tool</div>
      </div>

      <div style={styles.card}>
        <div style={styles.sectionTitle}>Search</div>

        <label style={styles.smallLabel}>Auction</label>
        <div style={{ display: "flex", gap: 8 }}>
          <select
            value={auction}
            onChange={(e) => setAuction(e.target.value)}
            style={styles.select}
            disabled={loadingAuctions}
          >
            {auctions.length === 0 ? (
              <option value="">{loadingAuctions ? "Loading…" : "No auctions found"}</option>
            ) : (
              auctions.map((a) => (
                <option key={a.name} value={a.name}>
                  {a.name}
                </option>
              ))
            )}
          </select>
        </div>

        <label style={styles.smallLabel}>Bidcard #</label>
        <input
          value={bidcard}
          onChange={(e) => setBidcard(e.target.value)}
          inputMode="numeric"
          style={styles.bigInput}
          placeholder="e.g. 20000"
        />

        <button
          onClick={handleSearch}
          disabled={!canSearch}
          style={{
            ...styles.primaryBtn,
            opacity: canSearch ? 1 : 0.5,
          }}
        >
          {loadingSearch ? "Searching…" : "Search"}
        </button>

        {error && <div style={styles.error}>{error}</div>}
        {notice && <div style={styles.notice}>{notice}</div>}
      </div>

      {record && (
        <>
          <div style={styles.card}>
            <div style={styles.sectionTitle}>Invoice</div>

            {invoiceLink ? (
              <a href={invoiceLink} target="_blank" rel="noreferrer" style={styles.invoiceBtn}>
                Open Invoice PDF →
              </a>
            ) : (
              <div style={styles.muted}>
                Invoice not found for this bidcard in this auction folder.
              </div>
            )}
          </div>

          <div style={styles.card}>
            <div style={styles.sectionTitle}>Details (View Only)</div>
            {VIEW_FIELDS.map((k) => (
              <FieldRow key={k} label={k} value={record?.[k] ?? ""} />
            ))}
          </div>

          <div style={styles.card}>
            <div style={styles.sectionTitle}>Update (Editable)</div>
            {EDITABLE_FIELDS.map((k) => (
              <EditableRow
                key={k}
                label={k}
                value={editValues[k] ?? ""}
                onChange={(v) => setEditValues((prev) => ({ ...prev, [k]: v }))}
              />
            ))}

            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                ...styles.primaryBtn,
                marginTop: 12,
                opacity: saving ? 0.6 : 1,
              }}
            >
              {saving ? "Saving…" : "Save Changes"}
            </button>

            <div style={styles.muted}>
              Tip: Only the “Update (Editable)” section changes the sheet.
            </div>
          </div>
        </>
      )}

      <div style={{ height: 30 }} />
    </div>
  );
}

const styles: Record<string, any> = {
  page: {
    minHeight: "100vh",
    background: "#0b0d12",
    color: "#fff",
    padding: 14,
    fontFamily:
      'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji","Segoe UI Emoji"',
  },
  header: {
    marginBottom: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: 800,
    letterSpacing: 0.2,
  },
  subtitle: {
    fontSize: 13,
    opacity: 0.75,
    marginTop: 4,
  },
  card: {
    background: "#121622",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 14,
    padding: 14,
    marginTop: 12,
    boxShadow: "0 8px 20px rgba(0,0,0,0.25)",
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: 800,
    marginBottom: 10,
  },
  smallLabel: {
    display: "block",
    fontSize: 12,
    opacity: 0.75,
    marginTop: 10,
    marginBottom: 6,
  },
  select: {
    width: "100%",
    padding: "12px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "#0f1320",
    color: "#fff",
    fontSize: 16,
    outline: "none",
  },
  bigInput: {
    width: "100%",
    padding: "14px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "#0f1320",
    color: "#fff",
    fontSize: 18,
    outline: "none",
  },
  input: {
    width: "100%",
    padding: "12px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "#0f1320",
    color: "#fff",
    fontSize: 15,
    outline: "none",
  },
  textarea: {
    width: "100%",
    padding: "12px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "#0f1320",
    color: "#fff",
    fontSize: 15,
    outline: "none",
    resize: "vertical",
  },
  primaryBtn: {
    width: "100%",
    marginTop: 12,
    padding: "14px 12px",
    borderRadius: 12,
    border: "none",
    background: "#3b82f6",
    color: "#fff",
    fontSize: 16,
    fontWeight: 800,
  },
  invoiceBtn: {
    display: "block",
    textAlign: "center" as const,
    padding: "14px 12px",
    borderRadius: 12,
    background: "#22c55e",
    color: "#0b0d12",
    fontWeight: 900,
    textDecoration: "none",
  },
  row: {
    padding: "10px 0",
    borderBottom: "1px solid rgba(255,255,255,0.07)",
  },
  label: {
    fontSize: 12,
    opacity: 0.7,
    marginBottom: 6,
  },
  value: {
    fontSize: 15,
    fontWeight: 650,
    wordBreak: "break-word" as const,
  },
  error: {
    marginTop: 12,
    padding: 10,
    borderRadius: 12,
    background: "rgba(239,68,68,0.15)",
    border: "1px solid rgba(239,68,68,0.25)",
    color: "#fecaca",
    fontSize: 13,
  },
  notice: {
    marginTop: 12,
    padding: 10,
    borderRadius: 12,
    background: "rgba(34,197,94,0.12)",
    border: "1px solid rgba(34,197,94,0.25)",
    color: "#bbf7d0",
    fontSize: 13,
  },
  muted: {
    marginTop: 10,
    opacity: 0.75,
    fontSize: 13,
    lineHeight: 1.35,
  },
};