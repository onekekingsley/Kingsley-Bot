import express from "express";
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestWaWebVersion
} from "@whiskeysockets/baileys";
import pino from "pino";

const app = express();
const PORT = process.env.PORT || 3000;

let sock = null;
let latestPairingCode = null;

app.get("/", (req, res) => {
  res.send("🤖 Kingsley is running.");
});

app.get("/health", (req, res) => {
  res.json({
    bot: "Kingsley",
    status: sock ? "connected to WhatsApp server" : "starting"
  });
});

app.get("/pair", (req, res) => {
  if (req.query.secret !== process.env.PAIRING_SECRET) {
    return res.status(401).send("Unauthorized.");
  }

  if (!latestPairingCode) {
    return res.status(503).send(
      "Pairing code is not ready yet. Wait a few seconds and try again."
    );
  }

  res.json({
    success: true,
    pairingCode: latestPairingCode
  });
});

app.listen(PORT, () => {
  console.log(`🌐 Kingsley server running on port ${PORT}`);
});

async function startKingsley() {
  const { state, saveCreds } =
    await useMultiFileAuthState("./auth");

  const { version } = await fetchLatestWaWebVersion();

  console.log(
    `📱 WhatsApp Web version: ${version.join(".")}`
  );

  sock = makeWASocket({
    auth: state,
    version,
    logger: pino({ level: "info" }),
    browser: ["Kingsley", "Chrome", "1.0.0"],
    markOnlineOnConnect: false
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const {
      connection,
      qr,
      lastDisconnect
    } = update;

    if (connection === "connecting") {
      console.log("🔌 Connecting Kingsley...");
    }

    /*
     * WhatsApp gives us the QR/registration event here.
     * Request the pairing code at this point.
     */
    if (qr && !state.creds.registered && !latestPairingCode) {
      try {
        console.log("📱 WhatsApp registration ready.");

        latestPairingCode =
          await sock.requestPairingCode(
            process.env.PAIRING_PHONE
          );

        console.log("✅ Pairing code is ready.");
      } catch (error) {
        console.error(
          "❌ Pairing-code error:",
          error?.message || error
        );
      }
    }

    if (connection === "open") {
      console.log("✅ KINGSLEY CONNECTED TO WHATSAPP!");
      latestPairingCode = null;
    }

    if (connection === "close") {
      const statusCode =
        lastDisconnect?.error?.output?.statusCode;

      console.log(
        `⚠️ WhatsApp connection closed: ${
          statusCode ?? "unknown"
        }`
      );

      sock = null;
      latestPairingCode = null;

      if (statusCode !== DisconnectReason.loggedOut) {
        console.log("🔄 Reconnecting in 5 seconds...");

        setTimeout(() => {
          startKingsley().catch(console.error);
        }, 5000);
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
      await sock.sendMessage(
        message.key.remoteJid,
        {
          text: "👋 Hello! I'm Kingsley."
        }
      );
    }

    if (command === "menu") {
      await sock.sendMessage(
        message.key.remoteJid,
        {
          text:
            "🤖 *KINGSLEY MENU*\n\n" +
            "• hi — Say hello\n" +
            "• menu — Show commands\n\n" +
            "🚀 More features coming soon."
        }
      );
    }
  });
}

startKingsley().catch(console.error);
