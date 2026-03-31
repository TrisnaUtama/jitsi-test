import express, { type Request, type Response } from "express";
import { v4 as uuidv4 } from "uuid";
import jwt from "jsonwebtoken";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const JITSI_DOMAIN = process.env.JITSI_DOMAIN || "jitsi.trisnautama.com";
const JWT_APP_ID = process.env.JWT_APP_ID || "counseling-app";
const JWT_APP_SECRET = process.env.JWT_APP_SECRET || "";

// =============================================
// DUMMY DATA
// =============================================
const DUMMY_USERS: Record<
  string,
  { name: string; email: string; role: "counselor" | "client" }
> = {
  counselor_001: {
    name: "Dr. Budi Santoso",
    email: "budi@clinic.com",
    role: "counselor",
  },
  counselor_002: {
    name: "Dr. Sari Dewi",
    email: "sari@clinic.com",
    role: "counselor",
  },
  client_001: { name: "Andi Pratama", email: "andi@gmail.com", role: "client" },
  client_002: { name: "Rina Kusuma", email: "rina@gmail.com", role: "client" },
  client_003: { name: "Bowo Susanto", email: "bowo@gmail.com", role: "client" },
};

// In-memory storage (nanti ganti DB)
interface Session {
  sessionId: string;
  roomName: string;
  counselorId: string;
  clientId: string;
  status: "waiting" | "active" | "ended";
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
  durationSeconds: number | null;
  participants: Participant[];
}

interface Participant {
  userId: string;
  userName: string;
  joinedAt: string;
  leftAt: string | null;
}

const sessions = new Map<string, Session>();

// =============================================
// HELPER
// =============================================
function generateToken(
  userId: string,
  userName: string,
  userEmail: string,
  roomName: string,
  isModerator: boolean,
): string {
  const now = Math.floor(Date.now() / 1000);

  const payload = {
    context: {
      user: {
        id: userId,
        name: userName,
        email: userEmail,
        affiliation: isModerator ? "owner" : "member",
        moderator: isModerator,
      },
      features: {
        livestreaming: false,
        recording: false,
        "screen-sharing": true,
        "outbound-call": false,
      },
    },
    aud: "jitsi",
    iss: JWT_APP_ID,
    sub: JITSI_DOMAIN,
    room: roomName,
    iat: now,
    exp: now + 3600,
  };

  return jwt.sign(payload, JWT_APP_SECRET);
}

// =============================================
// 1. GET /users
// Lihat semua dummy users
// =============================================
app.get("/users", (_req: Request, res: Response) => {
  res.json(DUMMY_USERS);
});

// =============================================
// 2. POST /sessions
// Counselor buat session untuk client tertentu
// Body: { counselorId, clientId }
// =============================================
app.post("/sessions", (req: Request, res: Response) => {
  const { counselorId, clientId } = req.body;

  // Validasi counselor
  const counselor = DUMMY_USERS[counselorId];
  if (!counselor || counselor.role !== "counselor") {
    res
      .status(403)
      .json({ error: "Hanya counselor yang bisa membuat session" });
    return;
  }

  // Validasi client
  const client = DUMMY_USERS[clientId];
  if (!client || client.role !== "client") {
    res.status(403).json({ error: "Client tidak ditemukan" });
    return;
  }

  // Cek client tidak sedang dalam session aktif
  const activeSession = Array.from(sessions.values()).find(
    (s) => s.clientId === clientId && s.status !== "ended",
  );
  if (activeSession) {
    res.status(409).json({
      error: "Client sedang dalam session lain",
      sessionId: activeSession.sessionId,
    });
    return;
  }

  const sessionId = uuidv4();
  const roomName = `counseling-${sessionId.split("-")[0]}`;

  const session: Session = {
    sessionId,
    roomName,
    counselorId,
    clientId,
    status: "waiting",
    createdAt: new Date().toISOString(),
    startedAt: null,
    endedAt: null,
    durationSeconds: null,
    participants: [],
  };

  sessions.set(sessionId, session);

  res.json({
    session,
    counselor: { id: counselorId, ...counselor },
    client: { id: clientId, ...client },
  });
});

// =============================================
// 3. POST /sessions/:sessionId/join
// User join session dan dapat JWT token
// Body: { userId }
// =============================================
app.post("/sessions/:sessionId/join", (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const { userId } = req.body;

  if (!sessionId || typeof sessionId !== "string") {
    res.status(400).json({ error: "Session ID tidak valid" });
    return;
  }

  // Cek session ada
  const session = sessions.get(sessionId);
  if (!session) {
    res.status(404).json({ error: "Session tidak ditemukan" });
    return;
  }

  // Cek session belum ended
  if (session.status === "ended") {
    res.status(400).json({ error: "Session sudah berakhir" });
    return;
  }

  // Cek user adalah bagian dari session ini
  if (session.counselorId !== userId && session.clientId !== userId) {
    res.status(403).json({ error: "Kamu tidak terdaftar dalam session ini" });
    return;
  }

  const user = DUMMY_USERS[userId];
  if (!user) {
    res.status(404).json({ error: "User tidak ditemukan" });
    return;
  }

  const isModerator = user.role === "counselor";
  const token = generateToken(
    userId,
    user.name,
    user.email,
    session.roomName,
    isModerator,
  );

  // Update status session → active saat pertama join
  if (session.status === "waiting") {
    session.status = "active";
    session.startedAt = new Date().toISOString();
  }

  // Catat participant join
  const existingParticipant = session.participants.find(
    (p) => p.userId === userId,
  );
  if (!existingParticipant) {
    session.participants.push({
      userId,
      userName: user.name,
      joinedAt: new Date().toISOString(),
      leftAt: null,
    });
  }

  sessions.set(sessionId, session);

  res.json({
    token,
    roomName: session.roomName,
    jitsiUrl: `https://${JITSI_DOMAIN}/${session.roomName}?jwt=${token}`,
    isModerator,
    expiresIn: 3600,
  });
});

// =============================================
// 4. PATCH /sessions/:sessionId/leave
// Catat saat user meninggalkan session
// Body: { userId }
// =============================================
app.patch("/sessions/:sessionId/leave", (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const { userId } = req.body;

  if (!sessionId || typeof sessionId !== "string") {
    res.status(400).json({ error: "Session ID tidak valid" });
    return;
  }

  const session = sessions.get(sessionId);
  if (!session) {
    res.status(404).json({ error: "Session tidak ditemukan" });
    return;
  }

  // Update leftAt participant
  const participant = session.participants.find((p) => p.userId === userId);
  if (participant) {
    participant.leftAt = new Date().toISOString();
  }

  // Kalau semua participant sudah leave → end session
  const allLeft = session.participants.every((p) => p.leftAt !== null);
  if (allLeft && session.participants.length >= 2) {
    session.status = "ended";
    session.endedAt = new Date().toISOString();
    if (session.startedAt) {
      session.durationSeconds = Math.floor(
        (new Date(session.endedAt).getTime() -
          new Date(session.startedAt).getTime()) /
          1000,
      );
    }
  }

  sessions.set(sessionId, session);
  res.json({ ok: true, session });
});

// =============================================
// 5. PATCH /sessions/:sessionId/end
// Counselor paksa akhiri session
// Body: { userId }
// =============================================
app.patch("/sessions/:sessionId/end", (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const { userId } = req.body;

  if (!sessionId || typeof sessionId !== "string") {
    res.status(400).json({ error: "Session ID tidak valid" });
    return;
  }

  const session = sessions.get(sessionId);
  if (!session) {
    res.status(404).json({ error: "Session tidak ditemukan" });
    return;
  }

  // Hanya counselor yang bisa end session
  if (session.counselorId !== userId) {
    res
      .status(403)
      .json({ error: "Hanya counselor yang bisa mengakhiri session" });
    return;
  }

  session.status = "ended";
  session.endedAt = new Date().toISOString();
  if (session.startedAt) {
    session.durationSeconds = Math.floor(
      (new Date(session.endedAt).getTime() -
        new Date(session.startedAt).getTime()) /
        1000,
    );
  }

  sessions.set(sessionId, session);
  res.json({ ok: true, session });
});

// =============================================
// 6. GET /sessions
// Lihat semua session
// Query: ?status=active|waiting|ended
// =============================================
app.get("/sessions", (req: Request, res: Response) => {
  const { status } = req.query;

  let result = Array.from(sessions.values());

  if (status) {
    result = result.filter((s) => s.status === status);
  }

  // Enrich dengan nama user
  const enriched = result.map((s) => ({
    ...s,
    counselor: DUMMY_USERS[s.counselorId],
    client: DUMMY_USERS[s.clientId],
  }));

  res.json({ total: enriched.length, sessions: enriched });
});

// =============================================
// 7. GET /sessions/:sessionId
// Detail session
// =============================================
app.get("/sessions/:sessionId", (req: Request, res: Response) => {
  const { sessionId } = req.params;

  if (!sessionId || typeof sessionId !== "string") {
    res.status(400).json({ error: "Session ID tidak valid" });
    return;
  }

  const session = sessions.get(sessionId);
  if (!session) {
    res.status(404).json({ error: "Session tidak ditemukan" });
    return;
  }

  res.json({
    ...session,
    counselor: DUMMY_USERS[session.counselorId],
    client: DUMMY_USERS[session.clientId],
  });
});

// =============================================
// 8. GET /counselors/:counselorId/sessions
// Riwayat session per counselor
// =============================================
app.get("/counselors/:counselorId/sessions", (req: Request, res: Response) => {
  const { counselorId } = req.params;

  if (!counselorId || typeof counselorId !== "string") {
    res.status(400).json({ error: "Counselor ID tidak valid" });
    return;
  }

  const counselor = DUMMY_USERS[counselorId];
  if (!counselor || counselor.role !== "counselor") {
    res.status(404).json({ error: "Counselor tidak ditemukan" });
    return;
  }

  const result = Array.from(sessions.values())
    .filter((s) => s.counselorId === counselorId)
    .map((s) => ({
      ...s,
      client: DUMMY_USERS[s.clientId],
    }));

  res.json({ counselor, total: result.length, sessions: result });
});

// =============================================
// 9. POST /jitsi-webhook
// Terima event dari Jitsi (participant join/leave)
// =============================================
app.post("/jitsi-webhook", (req: Request, res: Response) => {
  const { event, roomName, participant } = req.body;

  console.log(`[WEBHOOK] Event: ${event}, Room: ${roomName}`);

  // Cari session berdasarkan roomName
  const session = Array.from(sessions.values()).find(
    (s) => s.roomName === roomName,
  );
  if (!session) {
    res.json({ ok: true, note: "Session tidak ditemukan untuk room ini" });
    return;
  }

  switch (event) {
    case "CONFERENCE_CREATED":
      console.log(`[WEBHOOK] Room ${roomName} dibuat`);
      break;

    case "PARTICIPANT_JOINED":
      console.log(`[WEBHOOK] ${participant?.name} joined ${roomName}`);
      break;

    case "PARTICIPANT_LEFT":
      console.log(`[WEBHOOK] ${participant?.name} left ${roomName}`);
      break;

    case "CONFERENCE_DESTROYED":
      console.log(`[WEBHOOK] Room ${roomName} destroyed`);
      session.status = "ended";
      session.endedAt = new Date().toISOString();
      sessions.set(session.sessionId, session);
      break;
  }

  res.json({ ok: true });
});

// =============================================
// HEALTH CHECK
// =============================================
app.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    activeSessions: Array.from(sessions.values()).filter(
      (s) => s.status === "active",
    ).length,
    totalSessions: sessions.size,
  });
});

app.listen(3000, () => {
  console.log("🚀 Server running on http://localhost:3000");
});
