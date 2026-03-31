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

// Helper generate JWT token
function generateToken(
  userId: string,
  userName: string,
  roomName: string,
  isModerator: boolean
): string {
  const now = Math.floor(Date.now() / 1000);

  const payload = {
    context: {
      user: {
        id: userId,
        name: userName,
        affiliation: isModerator ? "owner" : "member",
        moderator: isModerator,
      },
    },
    aud: "jitsi",
    iss: JWT_APP_ID,
    sub: JITSI_DOMAIN,
    room: roomName,
    iat: now,
    exp: now + 3600, // 1 jam
  };

  return jwt.sign(payload, JWT_APP_SECRET);
}

// =============================================
// POST /create-room
// Buat room baru (hanya moderator/counselor)
// Body: { userId, userName }
// =============================================
app.post("/create-room", (req: Request, res: Response) => {
  const { userId, userName } = req.body;

  if (!userId || !userName) {
    res.status(400).json({ error: "userId dan userName wajib diisi" });
    return;
  }

  const roomName = `counseling-${uuidv4()}`;
  const token = generateToken(userId, userName, roomName, true); // true = moderator

  res.json({
    roomName,
    token,
    url: `https://${JITSI_DOMAIN}/${roomName}?jwt=${token}`,
    expiresIn: 3600,
  });
});

// =============================================
// POST /join-room
// Join room yang sudah ada (sebagai member/client)
// Body: { userId, userName, roomName }
// =============================================
app.post("/join-room", (req: Request, res: Response) => {
  const { userId, userName, roomName } = req.body;

  if (!userId || !userName || !roomName) {
    res.status(400).json({ error: "userId, userName, dan roomName wajib diisi" });
    return;
  }

  const token = generateToken(userId, userName, roomName, false); // false = member

  res.json({
    roomName,
    token,
    url: `https://${JITSI_DOMAIN}/${roomName}?jwt=${token}`,
    expiresIn: 3600,
  });
});

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok" });
});

app.listen(3000, () => {
  console.log("🚀 Server running on http://localhost:3000");
});