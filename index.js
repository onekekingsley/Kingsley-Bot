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
let pairingInProgress = false;

app.get("/", (req, res) => {
  res.send("🤖 Kingsley is running.");
});

app.get("/health", (req, res) => {
  res.json({
    bot: "Kingsley",
    whatsapp: sock ? "socket-created" : "starting"
  });
});

app.get("/pair", async (req, res) => {
  const secret = req.query.secret;

  if (secret !== process.env.PAIRING_SECRET) {
    return res.status(401).send("Unauthorized.");
  }

  const phone = process.env.PAIRING_PHONE;

  if (!phone) {
    return res.status(500).send("PAIRING_PHONE is not configured.");
  }

  if (!sock) {
    return res.status(503).send(
      "Kingsley is still starting. Try again shortly."
    );
  }

  if (pairingInProgress) {
    return res.status(429).send(
      "A pairing request is already running."
    );
  }

  try {
    pairingInProgress = true;

    console.log("📲 Requesting WhatsApp pairing code...");

    const code = await sock.requestPairingCode(phone);

    console.log(`📲 Pairing code generated: ${code}`);

    res.json({
      success: true,
      pairingCode: code
    });

  } catch (error) {
    console.error("❌ Pairing error:", error);

    res.status(500).json({
      success: false,
      error: error?.message || String(error)
    });

  } finally {
    pairingInProgress = false;
  }
});

app.listen(PORT, () => {
  console.log(`🌐 Kingsley server running on port ${PORT}`);
});

async function startKingsley() {
  try {
    const { state, saveCreds } =
      await useMultiFileAuthState("./auth");

    const { version, isLatest } =
      await fetchLatestWaWebVersion();

    console.log(
      `📱 WhatsApp Web version: ${version.join(".")}`
    );

    console.log(
      `📱 Latest version: ${isLatest ? "yes" : "no"}`
    );

    sock = makeWASocket({
      auth: state,
      version,
      logger: pino({ level: "info" }),
      browser: ["Kingsley", "Chrome", "1.0.0"],
      markOnlineOnConnect: false
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", (update) => {
      const {
        connection,
        lastDisconnect,
        qr
      } = update;

      if (connection === "connecting") {
        console.log("🔌 Connecting Kingsley...");
      }

      if (qr) {
        console.log("📱 QR code received.");
      }

      if (connection === "open") {
        console.log("✅ KINGSLEY CONNECTED TO WHATSAPP!");
      }

      if (connection === "close") {
        const statusCode =
          lastDisconnect?.error?.output?.statusCode;

        console.log(
          `⚠️ WhatsApp connection closed. Code: ${
            statusCode ?? "unknown"
          }`
        );

        sock = null;

        if (statusCode !== DisconnectReason.loggedOut) {
          console.log(
            "🔄 Restarting connection in 5 seconds..."
          );

          setTimeout(() => {
            startKingsley().catch((error) => {
              console.error(
                "❌ Restart failed:",
                error
              );
            });
          }, 5000);
        } else {
          console.log(
            "❌ WhatsApp session was logged out."
          );
        }
      }
    });

    sock.ev.on("messages.upsert", async ({ messages }) => {
      const message = messages[0];

      if (!message?.message || message.key.fromMe) {
        return;
      }

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

  } catch (error) {
    console.error(
      "❌ Kingsley failed to start:",
      error
    );

    sock = null;

    setTimeout(() => {
      startKingsley().catch(console.error);
    }, 5000);
  }
}

startKingsley();
