"use client";

import { useEffect, useState } from "react";

export default function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem("cookie_consent");
    if (!consent) setVisible(true);
  }, []);

  function accept() {
    localStorage.setItem("cookie_consent", "accepted");
    setVisible(false);
  }

  function refuse() {
    localStorage.setItem("cookie_consent", "refused");
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="fixed bottom-20 left-0 right-0 z-50 px-4 pb-2">
      <div className="max-w-lg mx-auto bg-[#1A2138] text-white rounded-2xl p-4 flex flex-col gap-3">
        <div>
          <p className="text-sm font-semibold mb-1">🍪 Cookies & confidentialité</p>
          <p className="text-xs text-white/70 leading-relaxed">
            Linkea utilise des cookies essentiels au fonctionnement de la plateforme. Aucun cookie publicitaire n'est utilisé.{" "}
            <a href="/confidentialite" className="underline text-white/85 hover:text-white">En savoir plus</a>
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={refuse}
            className="flex-1 py-2 rounded-xl border border-white/25 text-xs font-semibold text-white/80 hover:bg-white/10 transition-colors"
          >
            Refuser
          </button>
          <button
            onClick={accept}
            className="flex-1 py-2 rounded-xl bg-white text-[#1A2138] text-xs font-semibold hover:bg-[#E5E5EA] transition-colors"
          >
            Accepter
          </button>
        </div>
      </div>
    </div>
  );
}
