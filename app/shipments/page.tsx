"use client";

import { useEffect, useMemo, useState } from "react";

type ShipmentRow = {
  sheetId: string;
  sheetName?: string;
  auction?: string;
  row: number;
  bidcard?: string;
  firstName?: string;
  lastName?: string;
  lotsWon?: string;
  invoiceUrl?: string | null;
  shippingRequired?: string;
  shippedStatus?: string;
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

export default function ShipmentsPage() {
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string>("");
  const [search, setSearch] = useState("");
  const [updatingKey, setUpdatingKey] = useState<string>("");

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const res = await fetch("/api/shipments/list", { cache: "no-store" });
      const text = await res.text();
      if (!text.trim().startsWith("{") && !text.trim().startsWith("[")) {
        throw new Error("API did not return JSON. Got: " + text.slice(0, 120));
      }
      const json = JSON.parse(text) as ListResponse;
      if (!res.ok || json.success === false) throw new Error(json.error || "Failed to load shipments");
      setData(json);
    } catch (e: any) {
      setErr(e?.message || "Failed to load shipments");
      setData(null);
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
    if (!q) return shipments;

    return shipments.filter((s) => {
      const hay = [s.auction, s.sheetName, s.bidcard, s.firstName, s.lastName, String(s.row)]
        .map(safeLower)
        .join(" ");
      return hay.includes(q);
    });
  }, [data, search]);

  async function toggleShipped(s: ShipmentRow) {
    const nextOn = !isYes(s.shippedStatus);
    const key = `${s.sheetId}:${s.row}`;
    setUpdatingKey(key);
    setErr("");

    try {
      const payload = { sheetId: s.sheetId, row: s.row, field: "shippedStatus", value: nextOn ? "Y" : "" };

      const res = await fetch("/api/shipments/item/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const text = await res.text();
      if (!text.trim().startsWith("{") && !text.trim().startsWith("[")) {
        throw new Error("Update API did not return JSON. Got: " + text.slice(0, 120));
      }
      const json = JSON.parse(text) as { success: boolean; error?: string };
      if (!res.ok || json.success === false) throw new Error(json.error || "Failed to update shipped status");

      // remove from list when marked shipped (since it's no longer outstanding)
      if (nextOn) {
        setData((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            shipments: prev.shipments.filter((x) => !(x.sheetId === s.sheetId && x.row === s.row)),
            count: Math.max(0, (prev.count || 0) - 1),
          };
        });
      }
    } catch (e: any) {
      setErr(e?.message || "Failed to update shipped status");
    } finally {
      setUpdatingKey("");
    }
  }

  return (
    <div style={{ padding: 22, maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
        <h1 style={{ fontSize: 26, fontWeight: 900, margin: 0 }}>Shipments Shift</h1>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(255,255,255,0.06)",
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      <p style={{ opacity: 0.8, marginTop: 8 }}>
        Outstanding shipment = <b>Shipping Required</b> is <b>Y</b> and <b>Shipped status</b> is blank.
      </p>

      <div style={{ marginTop: 16, display: "flex", gap: 10, alignItems: "center" }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search auction / bidcard / name…"
          style={{
            flex: 1,
            padding: "12px 12px",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(0,0,0,0.25)",
            color: "white",
          }}
        />
        <div style={{ opacity: 0.85 }}>
          Count: <b>{filtered.length}</b>
        </div>
      </div>

      {err ? (
        <div
          style={{
            marginTop: 14,
            padding: 12,
            borderRadius: 10,
            border: "1px solid rgba(244,63,94,0.35)",
            background: "rgba(244,63,94,0.12)",
          }}
        >
          {err}
        </div>
      ) : null}

      <div style={{ marginTop: 18 }}>
        {loading && !data ? (
          <div style={{ opacity: 0.85 }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ opacity: 0.85 }}>No outstanding shipments found.</div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {filtered.map((s) => {
              const key = `${s.sheetId}:${s.row}`;
              const busy = updatingKey === key;

              return (
                <div
                  key={key}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1.2fr 1fr 0.7fr 0.9fr",
                    gap: 10,
                    alignItems: "center",
                    padding: 14,
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,0.10)",
                    background: "rgba(255,255,255,0.04)",
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 900, fontSize: 14 }}>
                      {s.auction || s.sheetName || "Auction"} — Bidcard {s.bidcard || ""}
                    </div>
                    <div style={{ opacity: 0.85, marginTop: 4, fontSize: 13 }}>
                      {`${s.firstName || ""} ${s.lastName || ""}`.trim() || "(name not found)"}
                      {s.lotsWon ? ` • Lots: ${s.lotsWon}` : ""} • Row {s.row}
                    </div>
                  </div>

                  <div>
                    {s.invoiceUrl ? (
                      <a href={s.invoiceUrl} target="_blank" rel="noreferrer" style={{ textDecoration: "underline" }}>
                        Open invoice
                      </a>
                    ) : (
                      <span style={{ opacity: 0.7 }}>No invoice link</span>
                    )}
                  </div>

                  <div style={{ opacity: 0.85 }}>
                    Ship Req: <b>{isYes(s.shippingRequired) ? "Y" : String(s.shippingRequired || "")}</b>
                  </div>

                  <div style={{ textAlign: "right" }}>
                    <button
                      type="button"
                      onClick={() => toggleShipped(s)}
                      disabled={busy}
                      style={{
                        padding: "10px 12px",
                        borderRadius: 10,
                        border: "1px solid rgba(255,255,255,0.12)",
                        background: "rgba(255,255,255,0.06)",
                        cursor: busy ? "not-allowed" : "pointer",
                        fontWeight: 800,
                      }}
                    >
                      {busy ? "Saving…" : "Mark shipped"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
