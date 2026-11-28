"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { auth, onAuthStateChanged } from "@/lib/auth";
export function InstitutionalLink({
  collapsed = false,
  onNavigate,
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let currentUser = "";
    const off = onAuthStateChanged(auth, (user) => {
      currentUser = user?.uid || "";
      setVisible(false);
      if (user)
        void user
          .getIdToken()
          .then((token) =>
            fetch("/api/institutional/licensing", {
              cache: "no-store",
              signal: controller.signal,
              headers: { Authorization: `Bearer ${token}` },
            }),
          )
          .then(async (r) => {
            if (r.ok) {
              const data = await r.json();
              if (!controller.signal.aborted && currentUser === user?.uid)
                setVisible(data.institutions?.length > 0);
            }
          })
          .catch(() => {});
    });
    return () => {
      controller.abort();
      off();
    };
  }, []);
  if (!visible) return null;
  return (
    <Link
      href="/app/institutional"
      onClick={onNavigate}
      className="mt-4 block rounded-lg px-3 py-3 text-sm font-semibold hover:bg-surface-hover"
      aria-label="School licensing"
    >
      {collapsed ? "School" : "School licensing"}
    </Link>
  );
}
