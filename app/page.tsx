"use client";

import { useState } from "react";

type RecordMap = Record<string, string>;

export default function Home() {
  const [auction, setAuction] = useState("Auction 22");
  const [bidcard, setBidcard] = useState("");
  const [record, setRecord] = useState<RecordMap | null>(null);
  const [invoiceLink, setInvoiceLink] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  // editable fields
  const [paymentStatus, setPaymentStatus] = useState("");
  const [pickupStatus, setPickupStatus] = useState("");
  const [shippedStatus, setShippedStatus] = useState("");
  const [refund, setRefund] = useState("");
  const [notes, setNotes] = useState("");

  async function search() {
    setMsg("");
    setLoading(true);
    setRecord(null);
    setInvoiceLink("");

    try {
      const r = await fetch(
        `/api/auctions/bidder?auction=${encodeURIComponent(auction)}&bidcard=${encodeURIComponent(bidcard)}`
      );
      const data = await r.json();
      if (!data.success) {
        setMsg(data.error || "Not found");
        setLoading(false);
        return;
      }

      const rec: RecordMap = data.record;
      setRecord(rec);

      // preload editable fields from the sheet
      setPaymentStatus(rec["Payment Status"] || "");
      setPickupStatus(rec["Pickup Status"] || "");
      setShippedStatus(rec["Shipped Status"] || "");
      setRefund(rec["Refund"] || "");
      setNotes(rec["Notes"] || "");

      // invoice
      const inv = await fetch(
        `/api/auctions/invoice?auction=${encodeURIComponent(auction)}&bidcard=${encodeURIComponent(bidcard)}`
      );
      const invData = await inv.json();
      if (invData.success && invData.link) setInvoiceLink(invData.link);
      else setInvoiceLink("");

      setLoading(false);
    } catch (e: any) {
      setMsg(e?.message || "Error");
      setLoading(false);
    }
  }

  async function save() {
    setMsg("");
    setLoading(true);
    try {
      const r = await fetch(`/api/auctions/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          auction,
          bidcard,
          updates: {
            paymentStatus,
            pickupStatus,
            shippedStatus,
            refund,
            notes,
          },
        }),
      });
      const data = await r.json();
      if (!data.success) {
        setMsg(data.error || "Save failed");
        setLoading(false);
        return;
      }
      setMsg("Saved ✅");
      setLoading(false);
    } catch (e: any) {
      setMsg(e?.message || "Save error");
      setLoading(false);
    }
  }

  const viewField = (label: string) => (
    <div style={{ padding: 8, borderBottom: "1px solid #eee" }}>
      <div style={{ fontSize: 12, opacity: 0.7 }}>{label}</div>
      <div style={{ fontSize: 16 }}>{record?.[label] || ""}</div>
    </div>
  );

  return (
    <main style={{ padding: 16, fontFamily: "Arial, sans-serif", maxWidth: 700, margin: "0 auto" }}>
      <h2>Mad Bids Employee App</h2>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input
          style={{ padding: 10, fontSize: 16, width: 220 }}
          value={auction}
          onChange={(e) => setAuction(e.target.value)}
          placeholder="Auction name (ex: Auction 22)"
        />
        <input
          style={{ padding: 10, fontSize: 16, width: 180 }}
          value={bidcard}
          onChange={(e) => setBidcard(e.target.value)}
          placeholder="Bidcard #"
          inputMode="numeric"
        />
        <button
          style={{ padding: "10px 14px", fontSize: 16 }}
          onClick={search}
          disabled={!auction || !bidcard || loading}
        >
          {loading ? "Working..." : "Search"}
        </button>
      </div>

      {msg ? <p style={{ marginTop: 10 }}>{msg}</p> : null}

      {record ? (
        <div style={{ marginTop: 16, border: "1px solid #ddd", borderRadius: 8, overflow: "hidden" }}>
          <div style={{ padding: 12, background: "#f6f6f6", display: "flex", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontWeight: 700 }}>
                {record["Buyer First Name"]} {record["Buyer Last Name"]} — #{record["Bidder Number"]}
              </div>
              <div style={{ fontSize: 12, opacity: 0.75 }}>{auction}</div>
            </div>

            {invoiceLink ? (
              <a
                href={invoiceLink}
                target="_blank"
                style={{ alignSelf: "center", padding: "8px 10px", border: "1px solid #ccc", borderRadius: 6 }}
              >
                Open Invoice
              </a>
            ) : (
              <div style={{ alignSelf: "center", fontSize: 12, opacity: 0.7 }}>No invoice found</div>
            )}
          </div>

          {/* view-only fields */}
          {viewField("Buyer First Name")}
          {viewField("Buyer Last Name")}
          {viewField("Bidder Number")}
          {viewField("Buyer Phone")}
          {viewField("Lots Bought")}
          {viewField("Balance")}
          {viewField("Shipping Required")}

          {/* editable fields */}
          <div style={{ padding: 12, background: "#fafafa" }}>
            <h3 style={{ margin: "6px 0 10px" }}>Editable</h3>

            <label style={{ display: "block", marginBottom: 10 }}>
              <div style={{ fontSize: 12, opacity: 0.7 }}>Payment Status</div>
              <input style={{ padding: 10, fontSize: 16, width: "100%" }} value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value)} />
            </label>

            <label style={{ display: "block", marginBottom: 10 }}>
              <div style={{ fontSize: 12, opacity: 0.7 }}>Pickup Status</div>
              <input style={{ padding: 10, fontSize: 16, width: "100%" }} value={pickupStatus} onChange={(e) => setPickupStatus(e.target.value)} />
            </label>

            <label style={{ display: "block", marginBottom: 10 }}>
              <div style={{ fontSize: 12, opacity: 0.7 }}>Shipped Status</div>
              <input style={{ padding: 10, fontSize: 16, width: "100%" }} value={shippedStatus} onChange={(e) => setShippedStatus(e.target.value)} />
            </label>

            <label style={{ display: "block", marginBottom: 10 }}>
              <div style={{ fontSize: 12, opacity: 0.7 }}>Refund</div>
              <input style={{ padding: 10, fontSize: 16, width: "100%" }} value={refund} onChange={(e) => setRefund(e.target.value)} />
            </label>

            <label style={{ display: "block", marginBottom: 10 }}>
              <div style={{ fontSize: 12, opacity: 0.7 }}>Notes</div>
              <textarea style={{ padding: 10, fontSize: 16, width: "100%", minHeight: 80 }} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </label>

            <button style={{ padding: "10px 14px", fontSize: 16 }} onClick={save} disabled={loading}>
              {loading ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>
      ) : null}
    </main>
  );
}