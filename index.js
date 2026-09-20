import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason
} from "@whiskeysockets/baileys";

import pino from "pino";

async function startKingsley() {
  const { state, saveCreds } =
    await useMultiFileAuthState("./auth");

  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: "silent" })
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", ({ connection, lastDisconnect }) => {
    if (connection === "open") {
      console.log("✅ Kingsley is connected to WhatsApp!");
    }

    if (connection === "close") {
      const statusCode =
        lastDisconnect?.error?.output?.statusCode;

      if (statusCode !== DisconnectReason.loggedOut) {
        console.log("🔄 Connection closed. Restarting...");
        startKingsley();
      } else {
        console.log("❌ Kingsley was logged out.");
      }
    }

    if (connection === "connecting") {
      console.log("🔌 Connecting Kingsley to WhatsApp...");
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

    if (command === "hi" || command === "hello") {
      await sock.sendMessage(message.key.remoteJid, {
        text: "👋 Hello! I'm Kingsley."
      });
    }

    if (command === "menu") {
      await sock.sendMessage(message.key.remoteJid, {
        text:
          "🤖 *KINGSLEY MENU*\n\n" +
          "• hi — Say hello\n" +
          "• menu — Show this menu\n\n" +
          "More features coming soon..."
      });
    }
  });
}

startKingsley();
