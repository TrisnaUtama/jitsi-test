import { useState } from "react";
import { JitsiMeeting } from "@jitsi/react-sdk";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";
const JITSI_DOMAIN = "jitsi.trisnautama.com";

// Dummy users sama seperti di BE
const DUMMY_USERS = {
  counselor_001: { name: "Dr. Budi Santoso", role: "counselor" },
  counselor_002: { name: "Dr. Sari Dewi", role: "counselor" },
  client_001: { name: "Andi Pratama", role: "client" },
  client_002: { name: "Rina Kusuma", role: "client" },
  client_003: { name: "Bowo Susanto", role: "client" },
};

interface RoomData {
  roomName: string;
  token: string;
  sessionId: string;
  isModerator: boolean;
}

type View = "home" | "create" | "join" | "meeting";

export default function App() {
  const [view, setView] = useState<View>("home");

  // Create session (counselor)
  const [counselorId, setCounselorId] = useState("");
  const [clientId, setClientId] = useState("");
  const [sessionId, setSessionId] = useState("");

  // Join session (client)
  const [joinUserId, setJoinUserId] = useState("");
  const [joinSessionId, setJoinSessionId] = useState("");

  const [roomData, setRoomData] = useState<RoomData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // =============================================
  // Counselor: Buat session → langsung join
  // =============================================
  async function handleCreateSession() {
    if (!counselorId || !clientId) {
      setError("Pilih counselor dan client");
      return;
    }

    setLoading(true);
    setError("");

    try {
      // 1. Buat session
      const createRes = await fetch(`${API_URL}/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ counselorId, clientId }),
      });
      const createData = await createRes.json();
      if (!createRes.ok) {
        setError(createData.error || "Gagal membuat session");
        return;
      }

      const newSessionId = createData.session.sessionId;
      setSessionId(newSessionId);

      // 2. Langsung join sebagai moderator
      const joinRes = await fetch(`${API_URL}/sessions/${newSessionId}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: counselorId }),
      });
      const joinData = await joinRes.json();
      if (!joinRes.ok) {
        setError(joinData.error || "Gagal join session");
        return;
      }

      setRoomData({
        roomName: joinData.roomName,
        token: joinData.token,
        sessionId: newSessionId,
        isModerator: joinData.isModerator,
      });
      setView("meeting");
    } catch {
      setError("Gagal connect ke server");
    } finally {
      setLoading(false);
    }
  }

  // =============================================
  // Client: Join session yang sudah ada
  // =============================================
  async function handleJoinSession() {
    if (!joinUserId || !joinSessionId) {
      setError("User ID dan Session ID wajib diisi");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${API_URL}/sessions/${joinSessionId}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: joinUserId }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Gagal join session");
        return;
      }

      setRoomData({
        roomName: data.roomName,
        token: data.token,
        sessionId: joinSessionId,
        isModerator: data.isModerator,
      });
      setView("meeting");
    } catch {
      setError("Gagal connect ke server");
    } finally {
      setLoading(false);
    }
  }

  // =============================================
  // Leave session
  // =============================================
  async function handleLeave() {
    if (!roomData) return;

    const userId =
      view === "meeting"
        ? roomData.isModerator
          ? counselorId
          : joinUserId
        : "";

    try {
      await fetch(`${API_URL}/sessions/${roomData.sessionId}/leave`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
    } catch {
      console.error("Gagal update leave");
    }

    setRoomData(null);
    setView("home");
  }

  // =============================================
  // VIEWS
  // =============================================

  // Meeting view
  if (view === "meeting" && roomData) {
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
          <div>
            <span>
              Room: <b>{roomData.roomName}</b>
            </span>
            <span style={{ marginLeft: 16, fontSize: 12, color: "#aaa" }}>
              {roomData.isModerator ? "👑 Counselor (Moderator)" : "👤 Client"}
            </span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {/* Counselor bisa end session */}
            {roomData.isModerator && (
              <button
                onClick={async () => {
                  await fetch(`${API_URL}/sessions/${roomData.sessionId}/end`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ userId: counselorId }),
                  });
                  handleLeave();
                }}
                style={{
                  padding: "4px 12px",
                  background: "#dc3545",
                  color: "white",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                End Session
              </button>
            )}
            <button
              onClick={handleLeave}
              style={{ padding: "4px 12px", cursor: "pointer" }}
            >
              Keluar
            </button>
          </div>
        </div>

        <JitsiMeeting
          domain={JITSI_DOMAIN}
          roomName={roomData.roomName}
          jwt={roomData.token}
          configOverwrite={{
            prejoinPageEnabled: false,
            startWithAudioMuted: false,
            startWithVideoMuted: false,
            p2p: { enabled: false },
          }}
          interfaceConfigOverwrite={{
            TOOLBAR_BUTTONS: [
              "microphone",
              "camera",
              "hangup",
              "chat",
              "raisehand",
              "tileview",
            ],
          }}
          getIFrameRef={(el) => {
            if (el) el.style.height = "calc(100vh - 40px)";
          }}
          onReadyToClose={handleLeave}
        />
      </div>
    );
  }

  // Home view
  if (view === "home") {
    return (
      <div
        style={{
          maxWidth: 400,
          margin: "100px auto",
          fontFamily: "sans-serif",
        }}
      >
        <h2>Counseling Session</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <button
            onClick={() => {
              setView("create");
              setError("");
            }}
            style={{
              padding: 12,
              background: "#0070f3",
              color: "white",
              border: "none",
              cursor: "pointer",
              borderRadius: 4,
            }}
          >
            👑 Saya Counselor — Buat Session
          </button>
          <button
            onClick={() => {
              setView("join");
              setError("");
            }}
            style={{
              padding: 12,
              background: "#28a745",
              color: "white",
              border: "none",
              cursor: "pointer",
              borderRadius: 4,
            }}
          >
            👤 Saya Client — Join Session
          </button>
        </div>
      </div>
    );
  }

  // Create session view (counselor)
  if (view === "create") {
    return (
      <div
        style={{
          maxWidth: 400,
          margin: "100px auto",
          fontFamily: "sans-serif",
        }}
      >
        <h2>Buat Session Baru</h2>
        {error && <div style={{ color: "red", marginBottom: 12 }}>{error}</div>}

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <label>Pilih Counselor:</label>
          <select
            value={counselorId}
            onChange={(e) => setCounselorId(e.target.value)}
            style={{ padding: 8 }}
          >
            <option value="">-- Pilih --</option>
            {Object.entries(DUMMY_USERS)
              .filter(([, u]) => u.role === "counselor")
              .map(([id, u]) => (
                <option key={id} value={id}>
                  {u.name}
                </option>
              ))}
          </select>

          <label>Pilih Client:</label>
          <select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            style={{ padding: 8 }}
          >
            <option value="">-- Pilih --</option>
            {Object.entries(DUMMY_USERS)
              .filter(([, u]) => u.role === "client")
              .map(([id, u]) => (
                <option key={id} value={id}>
                  {u.name}
                </option>
              ))}
          </select>

          <button
            onClick={handleCreateSession}
            disabled={loading}
            style={{
              padding: 10,
              background: "#0070f3",
              color: "white",
              border: "none",
              cursor: "pointer",
              borderRadius: 4,
            }}
          >
            {loading ? "Loading..." : "Buat & Masuk Session"}
          </button>

          {/* Tampilkan Session ID untuk dishare ke client */}
          {sessionId && (
            <div
              style={{ background: "#f0f0f0", padding: 12, borderRadius: 4 }}
            >
              <p style={{ margin: 0, fontSize: 12 }}>
                Share Session ID ini ke client:
              </p>
              <b style={{ wordBreak: "break-all" }}>{sessionId}</b>
            </div>
          )}

          <button
            onClick={() => setView("home")}
            style={{ padding: 8, cursor: "pointer" }}
          >
            ← Kembali
          </button>
        </div>
      </div>
    );
  }

  // Join session view (client)
  return (
    <div
      style={{ maxWidth: 400, margin: "100px auto", fontFamily: "sans-serif" }}
    >
      <h2>Join Session</h2>
      {error && <div style={{ color: "red", marginBottom: 12 }}>{error}</div>}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <label>Pilih User Kamu:</label>
        <select
          value={joinUserId}
          onChange={(e) => setJoinUserId(e.target.value)}
          style={{ padding: 8 }}
        >
          <option value="">-- Pilih --</option>
          {Object.entries(DUMMY_USERS)
            .filter(([, u]) => u.role === "client")
            .map(([id, u]) => (
              <option key={id} value={id}>
                {u.name}
              </option>
            ))}
        </select>

        <input
          placeholder="Session ID (dari counselor)"
          value={joinSessionId}
          onChange={(e) => setJoinSessionId(e.target.value)}
          style={{ padding: 8 }}
        />

        <button
          onClick={handleJoinSession}
          disabled={loading}
          style={{
            padding: 10,
            background: "#28a745",
            color: "white",
            border: "none",
            cursor: "pointer",
            borderRadius: 4,
          }}
        >
          {loading ? "Loading..." : "Join Session"}
        </button>

        <button
          onClick={() => setView("home")}
          style={{ padding: 8, cursor: "pointer" }}
        >
          ← Kembali
        </button>
      </div>
    </div>
  );
}
