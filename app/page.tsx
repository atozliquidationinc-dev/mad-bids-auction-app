"use client";

import { useEffect, useMemo, useState } from "react";

const PASSWORD = "brokeboyz123";
const STORAGE_KEY = "madbids_shift_unlocked_v1";

export default function Home() {
  const [pw, setPw] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      if (v === "yes") setUnlocked(true);
    } catch {}
  }, []);

  const canSubmit = useMemo(() => pw.trim().length > 0, [pw]);

  function handleUnlock() {
    setError(null);
    if (pw === PASSWORD) {
      setUnlocked(true);
      try {
        localStorage.setItem(STORAGE_KEY, "yes");
      } catch {}
    } else {
      setError("Wrong password. Try again.");
    }
  }

  function handleLogout() {
    setUnlocked(false);
    setPw("");
    setError(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <div
        style={{
          position: "fixed",
          inset: 0,
          pointerEvents: "none",
          background:
            "radial-gradient(900px 500px at 50% 0%, rgba(220, 38, 38, 0.25), rgba(0,0,0,0) 60%)",
        }}
      />

      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-5">
        <div className="pt-10 text-center">
          <div className="text-3xl font-extrabold tracking-wide text-red-500">
            MAD BIDS AUCTION
          </div>
          <div className="mt-2 text-sm font-medium tracking-wide text-neutral-300">
            STAFF SHIFT PORTAL
          </div>
        </div>

        <div className="mt-8 rounded-3xl border border-red-900/40 bg-neutral-900/60 p-5 shadow">
          <div className="text-center">
            <div className="text-xl font-extrabold text-neutral-100">
              Welcome Mad Bids Team
            </div>
            <div className="mt-2 text-sm text-neutral-300">
              Enter your password to access your shift tools.
            </div>
          </div>

          {!unlocked ? (
            <>
              <div className="mt-5">
                <div className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                  Password
                </div>
                <input
                  type="password"
                  value={pw}
                  onChange={(e) => setPw(e.target.value)}
                  placeholder="Enter password…"
                  className="mt-2 w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-4 text-base outline-none focus:border-red-600"
                />
                {error && (
                  <div className="mt-3 rounded-2xl border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-200">
                    {error}
                  </div>
                )}
              </div>

              <button
                onClick={handleUnlock}
                disabled={!canSubmit}
                className="mt-4 w-full rounded-2xl bg-red-600 px-5 py-4 text-base font-extrabold text-white disabled:opacity-40"
              >
                Unlock
              </button>

              <div className="mt-4 text-center text-xs text-neutral-500">
                Tip: Add to Home Screen on iPad for an “app” icon.
              </div>
            </>
          ) : (
            <>
              <div className="mt-5 space-y-3">
                <a
                  href="/pickup"
                  className="block w-full rounded-2xl bg-red-600 px-5 py-5 text-center text-lg font-extrabold text-white"
                >
                  PICK UP SHIFT
                </a>

                <a
                  href="/shipments"
                  className="block w-full rounded-2xl border border-red-900/50 bg-neutral-950 px-5 py-5 text-center text-lg font-extrabold text-red-300"
                >
                  SHIPMENTS SHIFT
                </a>
              </div>

              <button
                onClick={handleLogout}
                className="mt-4 w-full rounded-2xl border border-neutral-800 bg-neutral-900/60 px-5 py-3 text-sm font-bold text-neutral-200"
              >
                Log out
              </button>
            </>
          )}
        </div>

        <div className="mt-auto pb-8 pt-6 text-center text-xs text-neutral-600">
          Mad Bids internal tools · Do not share password outside the team
        </div>
      </div>
    </div>
  );
}