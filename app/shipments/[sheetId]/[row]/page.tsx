"use client";

import { useEffect } from "react";

export default function ShipmentsRedirect() {
  useEffect(() => {
    window.location.href =
      "https://script.google.com/macros/s/AKfycbxJJH0lq6_redB7fm_dD0Xic-_BeucjmtveRiQOoYz616SU-2NaPH9WNySfEOymuacU/exec";
  }, []);

  return (
    <div style={{ padding: 40 }}>
      <h1>Redirecting to Shipment Shift…</h1>
    </div>
  );
}
