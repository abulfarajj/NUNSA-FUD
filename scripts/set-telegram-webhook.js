/*
 * ONE-TIME SETUP: tell Telegram where your bot lives and add the command menu.
 *
 * Run it after the site with telegram-bot.js is deployed (works in Termux too):
 *
 *   TELEGRAM_BOT_TOKEN="123456:ABC..." \
 *   TELEGRAM_WEBHOOK_SECRET="the same long random string you put in Netlify" \
 *   SITE_URL="https://nunsafud.name.ng" \
 *   node scripts/set-telegram-webhook.js
 *
 * (Needs Node 18+. Nothing is stored; the token is only used for these calls.)
 */
const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
const site = String(process.env.SITE_URL || "").replace(/\/+$/, "");

if (!token || !secret || !site.startsWith("https://")) {
    console.error("Set TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET and SITE_URL (https://...) first.");
    process.exit(1);
}
if (!/^[A-Za-z0-9_-]{16,256}$/.test(secret)) {
    console.error("TELEGRAM_WEBHOOK_SECRET must be 16-256 characters: letters, digits, _ or - only.");
    process.exit(1);
}

async function call(method, payload) {
    const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });
    const json = await response.json();
    console.log(method + ":", json.ok ? "OK" : "FAILED - " + json.description);
    return json.ok;
}

(async () => {
    const hook = await call("setWebhook", {
        url: site + "/.netlify/functions/telegram-bot",
        secret_token: secret,
        allowed_updates: ["message", "callback_query"],
        drop_pending_updates: true
    });
    const menu = await call("setMyCommands", {
        commands: [
            { command: "login", description: "Log in with your registration number and PIN" },
            { command: "signup", description: "Create your account" },
            { command: "forgotpin", description: "Reset your PIN" },
            { command: "elections", description: "See current elections" },
            { command: "candidates", description: "See the candidates" },
            { command: "apply", description: "Apply to run for a position" },
            { command: "mystatus", description: "Check your application" },
            { command: "vote", description: "Cast your vote" },
            { command: "myvote", description: "Check whether you have voted" },
            { command: "results", description: "See results of finished elections" },
            { command: "logout", description: "Log out of this chat" },
            { command: "help", description: "Show the commands" }
        ]
    });
    process.exit(hook && menu ? 0 : 1);
})().catch(error => { console.error("Failed:", error.message); process.exit(1); });
