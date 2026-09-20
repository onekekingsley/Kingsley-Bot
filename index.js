import express from "express";
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason
} from "@whiskeysockets/baileys";
import pino from "pino";

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("🤖 Kingsley is running.");
});

app.get("/health", (req, res) => {
  res.json({
    bot: "Kingsley",
    status: "online"
  });
});

app.listen(PORT, () => {
  console.log(`🌐 Kingsley server running on port ${PORT}`);
});

async function startKingsley() {
  const { state, saveCreds } =
    await useMultiFileAuthState("./auth");

  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: "silent" })
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", ({
    connection,
    lastDisconnect,
    qr
  }) => {

    if (qr) {
      console.log("📱 WhatsApp pairing code/QR is available.");
    }

    if (connection === "connecting") {
      console.log("🔌 Connecting Kingsley to WhatsApp...");
    }

    if (connection === "open") {
      console.log("✅ KINGSLEY CONNECTED TO WHATSAPP!");
    }

    if (connection === "close") {
      const statusCode =
        lastDisconnect?.error?.output?.statusCode;

      if (statusCode !== DisconnectReason.loggedOut) {
        console.log("🔄 Connection closed. Restarting...");
        setTimeout(startKingsley, 5000);
      } else {
        console.log("❌ WhatsApp session was logged out.");
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
