"use client";

import { useEffect, useRef } from "react";
import { X, Mic, Video } from "lucide-react";

interface Props {
  room: string;
  displayName: string;
  email?: string;
  onHangup: () => void;
}

type JitsiAPI = { dispose: () => void; addEventListeners: (l: Record<string, () => void>) => void };
type JitsiConstructor = new (domain: string, options: Record<string, unknown>) => JitsiAPI;

declare global {
  interface Window {
    JitsiMeetExternalAPI: JitsiConstructor;
  }
}

export default function JitsiCall({ room, displayName, email, onHangup }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<JitsiAPI | null>(null);

  useEffect(() => {
    function init() {
      if (!containerRef.current || !window.JitsiMeetExternalAPI) return;
      apiRef.current = new window.JitsiMeetExternalAPI("meet.jit.si", {
        roomName: room,
        parentNode: containerRef.current,
        width: "100%",
        height: "100%",
        userInfo: { displayName, email: email ?? "" },
        configOverwrite: {
          prejoinPageEnabled: false,
          startWithAudioMuted: false,
          startWithVideoMuted: false,
          disableDeepLinking: true,
        },
        interfaceConfigOverwrite: {
          TOOLBAR_BUTTONS: ["microphone", "camera", "hangup", "chat", "tileview", "raisehand"],
          SHOW_JITSI_WATERMARK: false,
          SHOW_WATERMARK_FOR_GUESTS: false,
          MOBILE_APP_PROMO: false,
        },
      });
      apiRef.current.addEventListeners({
        readyToClose: onHangup,
        videoConferenceLeft: onHangup,
      });
    }

    if (window.JitsiMeetExternalAPI) {
      init();
    } else {
      const script = document.createElement("script");
      script.src = "https://meet.jit.si/external_api.js";
      script.async = true;
      script.onload = init;
      document.head.appendChild(script);
    }

    return () => { apiRef.current?.dispose(); };
  }, [room, displayName, email, onHangup]);

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col">
      {/* Bouton raccrocher en overlay */}
      <button
        onClick={onHangup}
        className="absolute top-4 right-4 z-[101] flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-bold text-white shadow-lg"
        style={{ background: "#ef4444" }}
      >
        <X size={15} /> Raccrocher
      </button>
      <div ref={containerRef} style={{ flex: 1, width: "100%", height: "100%" }} />
    </div>
  );
}
