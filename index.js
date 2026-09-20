import express from "express";
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason
} from "@whiskeysockets/baileys";
import pino from "pino";

const app = express();
const PORT = process.env.PORT || 3000;

let sock = null;
let pairingInProgress = false;

app.get("/", (req, res) => {
  res.send("🤖 Kingsley is running.");
});

app.get("/health", (req, res) => {
  res.json({
    bot: "Kingsley",
    status: sock ? "running" : "starting"
  });
});

app.get("/pair", async (req, res) => {
  const secret = req.query.secret;

  if (!process.env.PAIRING_SECRET) {
    return res.status(500).send("PAIRING_SECRET is not configured.");
  }

  if (secret !== process.env.PAIRING_SECRET) {
    return res.status(401).send("Unauthorized.");
  }

  if (!process.env.PAIRING_PHONE) {
    return res.status(500).send("PAIRING_PHONE is not configured.");
  }

  if (!sock) {
    return res.status(503).send("Kingsley is still starting. Try again shortly.");
  }

  if (pairingInProgress) {
    return res.status(429).send("A pairing request is already running.");
  }

  try {
    pairingInProgress = true;

    const code = await sock.requestPairingCode(
      process.env.PAIRING_PHONE
    );

    res.json({
      success: true,
      pairingCode: code
    });

  } catch (error) {
    console.error("Pairing error:", error);
    res.status(500).send("Could not create pairing code.");
  } finally {
    pairingInProgress = false;
  }
});

app.listen(PORT, () => {
  console.log(`🌐 Kingsley server running on port ${PORT}`);
});

async function startKingsley() {
  const { state, saveCreds } =
    await useMultiFileAuthState("./auth");

  sock = makeWASocket({
    auth: state,
    logger: pino({ level: "silent" })
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", ({
    connection,
    lastDisconnect
  }) => {

    if (connection === "connecting") {
      console.log("🔌 Connecting Kingsley...");
    }

    if (connection === "open") {
      console.log("✅ KINGSLEY CONNECTED TO WHATSAPP!");
    }

    if (connection === "close") {
      const statusCode =
        lastDisconnect?.error?.output?.statusCode;

      if (statusCode !== DisconnectReason.loggedOut) {
        console.log("🔄 Connection closed. Restarting...");

        sock = null;

        setTimeout(() => {
          startKingsley().catch(console.error);
        }, 5000);
      } else {
        console.log("❌ WhatsApp session was logged out.");
        sock = null;
      }
    }
  });

  sock.ev.on("messages.upsert", async ({ messages }) => {
    const message = messages[0];

    if (!message?.message || message.key.fromMe) return;

    const text =
      message.message.conversation ||
      message.message.extendedTextMessage?.text ||
      "";

    const command = text.trim().toLowerCase();

    if (command === "hi") {
      await sock.sendMessage(message.key.remoteJid, {
        text: "👋 Hello! I'm Kingsley."
      });
    }

    if (command === "menu") {
      await sock.sendMessage(message.key.remoteJid, {
        text:
          "🤖 *KINGSLEY MENU*\n\n" +
          "• hi — Say hello\n" +
          "• menu — Show commands\n\n" +
          "🚀 More features coming soon."
      });
    }
  });
}

startKingsley().catch((error) => {
  console.error("❌ Kingsley failed to start:", error);
});
