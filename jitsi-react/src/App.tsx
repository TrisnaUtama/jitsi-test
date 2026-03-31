import { useState } from "react";
import { JitsiMeeting } from "@jitsi/react-sdk";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";
const JITSI_DOMAIN = "jitsi.trisnautama.com";

interface RoomData {
  roomName: string;
  token: string;
}

export default function App() {
  const [userId, setUserId] = useState("");
  const [userName, setUserName] = useState("");
  const [roomNameInput, setRoomNameInput] = useState("");
  const [roomData, setRoomData] = useState<RoomData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function createRoom() {
    if (!userId || !userName) {
      setError("userId dan userName wajib diisi");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${API_URL}/create-room`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, userName }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Gagal membuat room");
        return;
      }

      setRoomData({ roomName: data.roomName, token: data.token });
    } catch (err) {
      setError("Gagal connect ke server");
    } finally {
      setLoading(false);
    }
  }

  async function joinRoom() {
    if (!userId || !userName || !roomNameInput) {
      setError("Semua field wajib diisi");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${API_URL}/join-room`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, userName, roomName: roomNameInput }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Gagal join room");
        return;
      }

      setRoomData({ roomName: data.roomName, token: data.token });
    } catch (err) {
      setError("Gagal connect ke server");
    } finally {
      setLoading(false);
    }
  }

  // Kalau sudah dapat roomData → tampilkan Jitsi
  if (roomData) {
    return (
      <div style={{ height: "100vh" }}>
        <div
          style={{
            padding: "8px 16px",
            background: "#1a1a1a",
            color: "white",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>
            Room: <b>{roomData.roomName}</b>
          </span>
          <button
            onClick={() => setRoomData(null)}
            style={{ padding: "4px 12px", cursor: "pointer" }}
          >
            Keluar
          </button>
        </div>

        <JitsiMeeting
          domain={JITSI_DOMAIN}
          roomName={roomData.roomName}
          jwt={roomData.token}
          configOverwrite={{
            prejoinPageEnabled: false,
            startWithAudioMuted: false,
            startWithVideoMuted: false,
          }}
          interfaceConfigOverwrite={{
            TOOLBAR_BUTTONS: [
              "microphone",
              "camera",
              "hangup",
              "chat",
              "raisehand",
              "tileview"
            ],
          }}
          getIFrameRef={(el) => {
            if (el) el.style.height = "calc(100vh - 40px)";
          }}
          onReadyToClose={() => setRoomData(null)}
        />
      </div>
    );
  }

  // Form sebelum join
  return (
    <div
      style={{ maxWidth: 400, margin: "100px auto", fontFamily: "sans-serif" }}
    >
      <h2>Counseling Session</h2>

      {error && <div style={{ color: "red", marginBottom: 12 }}>{error}</div>}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <input
          placeholder="User ID (contoh: counselor_001)"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          style={{ padding: 8 }}
        />
        <input
          placeholder="Nama (contoh: Dr. Budi)"
          value={userName}
          onChange={(e) => setUserName(e.target.value)}
          style={{ padding: 8 }}
        />

        <button
          onClick={createRoom}
          disabled={loading}
          style={{
            padding: 10,
            background: "#0070f3",
            color: "white",
            border: "none",
            cursor: "pointer",
          }}
        >
          {loading ? "Loading..." : "Buat Room (Counselor)"}
        </button>

        <hr />

        <input
          placeholder="Room Name (untuk join room yang ada)"
          value={roomNameInput}
          onChange={(e) => setRoomNameInput(e.target.value)}
          style={{ padding: 8 }}
        />

        <button
          onClick={joinRoom}
          disabled={loading}
          style={{
            padding: 10,
            background: "#28a745",
            color: "white",
            border: "none",
            cursor: "pointer",
          }}
        >
          {loading ? "Loading..." : "Join Room (Client)"}
        </button>
      </div>
    </div>
  );
}
