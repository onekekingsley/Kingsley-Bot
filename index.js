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
let pairingBusy = false;

// =========================
// WEB SERVER
// =========================

app.get("/", (req, res) => {
  res.send("🤖 Kingsley is running.");
});

app.get("/health", (req, res) => {
  res.json({
    bot: "Kingsley",
    status: sock ? "running" : "starting"
  });
});

// =========================
// PAIRING
// =========================

app.get("/pair", async (req, res) => {
  const secret = req.query.secret;

  if (secret !== process.env.PAIRING_SECRET) {
    return res.status(401).send("Unauthorized.");
  }

  if (!process.env.PAIRING_PHONE) {
    return res.status(500).send(
      "PAIRING_PHONE is not configured."
    );
  }

  if (!sock) {
    return res.status(503).send(
      "Kingsley is still starting. Try again shortly."
    );
  }

  if (pairingBusy) {
    return res.status(429).send(
      "A pairing request is already running."
    );
  }

  try {
    pairingBusy = true;

    if (sock.authState?.creds?.registered) {
      return res.status(400).send(
        "Kingsley is already paired."
      );
    }

    console.log("📲 Requesting pairing code...");

    const code = await sock.requestPairingCode(
      process.env.PAIRING_PHONE
    );

    console.log("✅ Pairing code generated.");

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
    pairingBusy = false;
  }
});

// =========================
// START WEB SERVER
// =========================

app.listen(PORT, () => {
  console.log(
    `🌐 Kingsley server running on port ${PORT}`
  );
});

// =========================
// START KINGSLEY
// =========================

async function startKingsley() {

  const { state, saveCreds } =
    await useMultiFileAuthState("./auth");

  const { version } =
    await fetchLatestWaWebVersion();

  console.log(
    `📱 WhatsApp Web version: ${version.join(".")}`
  );

  sock = makeWASocket({
    auth: state,
    version,

    logger: pino({
      level: "silent"
    }),

    browser: [
      "Ubuntu",
      "Chrome",
      "1.0.0"
    ],

    markOnlineOnConnect: false
  });

  // Save WhatsApp login information
  sock.ev.on(
    "creds.update",
    saveCreds
  );

  // =========================
  // CONNECTION
  // =========================

  sock.ev.on(
    "connection.update",
    ({
      connection,
      lastDisconnect
    }) => {

      if (connection === "connecting") {
        console.log(
          "🔌 Connecting Kingsley..."
        );
      }

      if (connection === "open") {
        console.log(
          "✅ KINGSLEY CONNECTED TO WHATSAPP!"
        );
      }

      if (connection === "close") {

        const statusCode =
          lastDisconnect
            ?.error
            ?.output
            ?.statusCode;

        console.log(
          `⚠️ WhatsApp connection closed. Code: ${
            statusCode ?? "unknown"
          }`
        );

        sock = null;

        if (
          statusCode !==
          DisconnectReason.loggedOut
        ) {

          console.log(
            "🔄 Restarting connection in 5 seconds..."
          );

          setTimeout(() => {
            startKingsley()
              .catch(console.error);
          }, 5000);

        } else {

          console.log(
            "❌ WhatsApp session was logged out."
          );
        }
      }
    }
  );

  // =========================
  // MESSAGE HANDLER
  // =========================

  sock.ev.on(
    "messages.upsert",
    async ({ messages }) => {

      const message = messages[0];

      if (
        !message?.message ||
        message.key.fromMe
      ) {
        return;
      }

      const text =
        message.message.conversation ||
        message.message
          .extendedTextMessage?.text ||
        "";

      const command =
        text.trim().toLowerCase();

      const chat =
        message.key.remoteJid;

      // =====================
      // HI
      // =====================

      if (command === "hi") {

        await sock.sendMessage(chat, {
          text:
            "👋 Hello! I'm Kingsley."
        });

        return;
      }

      // =====================
      // MENU
      // =====================

      if (command === "menu") {

        await sock.sendMessage(chat, {
          text:
            "🤖 *KINGSLEY MENU*\n\n" +
            "• hi — Say hello\n" +
            "• menu — Show commands\n\n" +
            "🚀 More features coming soon."
        });

        return;
      }

      // =====================
      // PING
      // =====================

      if (command === "ping") {

        await sock.sendMessage(chat, {
          text:
            "🏓 Pong! Kingsley is online."
        });

        return;
      }

      // =====================
      // ALIVE
      // =====================

      if (command === "alive") {

        await sock.sendMessage(chat, {
          text:
            "🤖 Kingsley is alive and running."
        });

        return;
      }

      // =====================
      // STATUS
      // =====================

      if (command === "status") {

        await sock.sendMessage(chat, {
          text:
            "🟢 Kingsley is online."
        });

        return;
      }
    }
  );
}

// =========================
// START
// =========================

startKingsley().catch((error) => {
  console.error(
    "❌ Kingsley failed to start:",
    error
  );
});
