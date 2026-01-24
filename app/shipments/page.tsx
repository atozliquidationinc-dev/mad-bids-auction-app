"use client";

import { useEffect, useMemo, useState } from "react";

type ShipmentRow = {
  sheetId: string; // google sheet id
  sheetName?: string; // optional
  row: number; // 1-based row index in sheet
  auction?: string; // optional display
  bidcard?: string;
  firstName?: string;
  lastName?: string;
  lotsWon?: string;
  invoiceUrl?: string;

  paymentStatus?: string; // raw value from sheet
  shippingRequired?: string; // raw
  shippedStatus?: string; // raw
};

type ListResponse = {
  success: boolean;
  count: number;
  shipments: ShipmentRow[];
  error?: string;
};

function safeLower(v: any) {
  return String(v ?? "").trim().toLowerCase();
}

function isYes(v: any) {
  const s = safeLower(v);
  return s === "y" || s === "yes" || s === "true" || s === "1";
}

function isBlank(v: any) {
  return String(v ?? "").trim() === "";
}

export default function ShipmentsPage() {
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string>("");

  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState<"none" | "auctionAsc" | "auctionDesc">("none");

  const [selected, setSelected] = useState<ShipmentRow | null>(null);

  async function load() {
    setLoading(true);
    setErr("");
    setData(null);
    try {
      const res = await fetch("/api/shipments/list", { cache: "no-store" });

      // If API returns HTML, this will catch it cleanly
      const text = await res.text();
      if (!text.trim().startsWith("{") && !text.trim().startsWith("[")) {
        throw new Error("API did not return JSON. Got: " + text.slice(0, 120));
      }

      const json = JSON.parse(text) as ListResponse;
      if (!json.success) throw new Error(json.error || "API returned success=false");
      setData(json);
    } catch (e: any) {
      setErr(e?.message || "Failed to load shipments");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const shipments = data?.shipments ?? [];
    const q = safeLower(search);

    let arr = shipments;

    if (q) {
      arr = arr.filter((s) => {
        const a = safeLower(s.auction);
        const b = safeLower(s.bidcard);
        const fn = safeLower(s.firstName);
        const ln = safeLower(s.lastName);
        return a.includes(q) || b.includes(q) || fn.includes(q) || ln.includes(q);
      });
    }

    // You told me: for now, don’t sort by default (oldest->newest).
    // So only sort if user explicitly chooses a sort option.
    if (sortMode !== "none") {
      const toAuctionNum = (x: ShipmentRow) => {
        const raw = String(x.auction ?? "");
        const n = Number(raw.replace(/[^\d]/g, ""));
        return Number.isFinite(n) ? n : 0;
      };

      arr = [...arr].sort((a, b) => {
        const A = toAuctionNum(a);
        const B = toAuctionNum(b);
        return sortMode === "auctionAsc" ? A - B : B - A;
      });
    }

    return arr;
  }, [data, search, sortMode]);

  const outstandingCount = filtered.length;

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: 20 }}>
      <h1 style={{ marginBottom: 8 }}>MAD BIDS AUCTION</h1>
      <h2 style={{ marginTop: 0, opacity: 0.9 }}>SHIPMENTS SHIFT</h2>

      <div style={{ margin: "12px 0" }}>
        <a href="/" style={{ textDecoration: "underline" }}>
          ← Back to menu
        </a>
      </div>

      <div
        style={{
          border: "1px solid rgba(255,255,255,0.18)",
          borderRadius: 10,
          padding: 14,
          marginBottom: 14,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ fontWeight: 700 }}>Outstanding shipments: {loading ? "…" : outstandingCount}</div>

          <button
            onClick={load}
            style={{
              padding: "8px 12px",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.25)",
              background: "transparent",
              cursor: "pointer",
            }}
          >
            Refresh
          </button>
        </div>

        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 13, opacity: 0.85, marginBottom: 6 }}>Search (name or bidcard)</div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Type name or bidcard..."
            style={{
              width: "100%",
              padding: 10,
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.25)",
              background: "rgba(0,0,0,0.15)",
              color: "inherit",
            }}
          />
        </div>

        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 13, opacity: 0.85, marginBottom: 6 }}>Sort</div>
          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as any)}
            style={{
              width: "100%",
              padding: 10,
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.25)",
              background: "rgba(0,0,0,0.15)",
              color: "inherit",
            }}
          >
            <option value="none">No sorting (default)</option>
            <option value="auctionAsc">Ascending Auction (oldest → newest)</option>
            <option value="auctionDesc">Descending Auction (newest → oldest)</option>
          </select>
        </div>

        {err ? (
          <div
            style={{
              marginTop: 12,
              padding: 12,
              borderRadius: 10,
              border: "1px solid rgba(255,0,0,0.35)",
              background: "rgba(255,0,0,0.08)",
              whiteSpace: "pre-wrap",
            }}
          >
            {err}
          </div>
        ) : null}
      </div>

      {/* LIST */}
      <div
        style={{
          border: "1px solid rgba(255,255,255,0.18)",
          borderRadius: 10,
          overflow: "hidden",
        }}
      >
        {loading ? (
          <div style={{ padding: 16, opacity: 0.85 }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 16, opacity: 0.85 }}>No shipments found.</div>
        ) : (
          filtered.map((s) => (
            <button
              key={`${s.sheetId}:${s.row}`}
              onClick={() => setSelected(s)}
              style={{
                width: "100%",
                textAlign: "left",
                padding: 14,
                border: "none",
                borderBottom: "1px solid rgba(255,255,255,0.10)",
                background: "transparent",
                color: "inherit",
                cursor: "pointer",
              }}
            >
              <div style={{ fontWeight: 700 }}>
                {s.firstName ?? ""} {s.lastName ?? ""}{" "}
                <span style={{ opacity: 0.8, fontWeight: 500 }}>
                  • Auction {s.auction ?? "?"} • Bidcard {s.bidcard ?? "?"}
                </span>
              </div>
              <div style={{ opacity: 0.85, marginTop: 4 }}>Lots won: {s.lotsWon ?? "-"}</div>
            </button>
          ))
        )}
      </div>

      {/* DETAILS MODAL */}
      {selected ? (
        <DetailsModal
          shipment={selected}
          onClose={() => setSelected(null)}
          onUpdated={() => {
            // refresh list after update
            load();
          }}
        />
      ) : null}
    </div>
  );
}

function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | undefined;
  onChange: (nextOn: boolean) => void;
}) {
  const on = isYes(value);
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
      <div style={{ fontWeight: 600 }}>{label}</div>
      <button
        onClick={() => onChange(!on)}
        style={{
          width: 70,
          padding: "8px 10px",
          borderRadius: 999,
          border: "1px solid rgba(255,255,255,0.25)",
          background: on ? "rgba(0,200,0,0.25)" : "rgba(200,0,0,0.25)",
          cursor: "pointer",
          fontWeight: 800,
        }}
      >
        {on ? "Y" : "—"}
      </button>
    </div>
  );
}

function DetailsModal({
  shipment,
  onClose,
  onUpdated,
}: {
  shipment: ShipmentRow;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  async function setField(field: "paymentStatus" | "shippingRequired" | "shippedStatus", nextOn: boolean) {
    setSaving(true);
    setMsg("");
    try {
      const payload = {
        sheetId: shipment.sheetId,
        row: shipment.row,
        field,
        value: nextOn ? "Y" : "",
      };

      const res = await fetch("/api/shipments/item/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const text = await res.text();
      if (!text.trim().startsWith("{") && !text.trim().startsWith("[")) {
        throw new Error("Update API did not return JSON. Got: " + text.slice(0, 120));
      }
      const json = JSON.parse(text);

      if (!json?.success) throw new Error(json?.error || "Update failed");

      setMsg("Saved ✅");
      onUpdated();
    } catch (e: any) {
      setMsg(e?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  const paymentOn = isYes(shipment.paymentStatus);
  const shipReqOn = isYes(shipment.shippingRequired);
  const shippedOn = !isBlank(shipment.shippedStatus) && isYes(shipment.shippedStatus);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        zIndex: 9999,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(720px, 100%)",
          borderRadius: 12,
          border: "1px solid rgba(255,255,255,0.20)",
          background: "rgba(20,20,20,0.98)",
          padding: 16,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 18 }}>
              {shipment.firstName ?? ""} {shipment.lastName ?? ""}
            </div>
            <div style={{ opacity: 0.85, marginTop: 4 }}>
              Auction {shipment.auction ?? "?"} • Bidcard {shipment.bidcard ?? "?"} • Lots won: {shipment.lotsWon ?? "-"}
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.25)",
              background: "transparent",
              cursor: "pointer",
              height: 40,
            }}
          >
            Close
          </button>
        </div>

        {shipment.invoiceUrl ? (
          <div style={{ marginTop: 12 }}>
            <a href={shipment.invoiceUrl} target="_blank" rel="noreferrer" style={{ textDecoration: "underline" }}>
              Open auction invoice
            </a>
          </div>
        ) : null}

        <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
          <Toggle
            label="Payment status"
            value={paymentOn ? "Y" : ""}
            onChange={(next) => setField("paymentStatus", next)}
          />
          <Toggle
            label="Shipping required"
            value={shipReqOn ? "Y" : ""}
            onChange={(next) => setField("shippingRequired", next)}
          />
          <Toggle label="Shipped status" value={shippedOn ? "Y" : ""} onChange={(next) => setField("shippedStatus", next)} />
        </div>

        <div style={{ marginTop: 12, minHeight: 22, opacity: 0.9 }}>
          {saving ? "Saving…" : msg}
        </div>
      </div>
    </div>
  );
}