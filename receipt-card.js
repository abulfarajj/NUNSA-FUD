/* On-page vote receipt: small logo on top, status, then label/value rows, with a download-as-image button. */
import { buildReceiptImage } from "./share-images.js";

export function formatReceiptTime(value) {
    const date = value ? new Date(value) : new Date();
    const safe = Number.isNaN(date.getTime()) ? new Date() : date;
    return safe.toLocaleString([], { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
}

function row(label, value, valueClass) {
    const item = node("div", "rcpt-row");
    item.append(node("dt", "", label), node("dd", valueClass || "", value || "-"));
    return item;
}

/* receipt: { election, matric, votedAt, code, rows: [{ position, name }] }. rows may be empty. */
export function buildReceiptCard(receipt, note) {
    const card = node("article", "rcpt");

    const logo = node("img", "rcpt-logo");
    logo.src = "assets/nunsa-logo.png";
    logo.alt = "NUNSA-FUD";
    card.append(logo);

    const status = node("div", "rcpt-status");
    status.append(node("span", "rcpt-check", "\u2713"), node("strong", "", "Vote recorded"));
    card.append(status, node("p", "rcpt-time", formatReceiptTime(receipt.votedAt)));

    const details = node("dl", "rcpt-rows");
    details.append(row("Election", receipt.election), row("Voter", receipt.matric));
    if (receipt.code) details.append(row("Reference", receipt.code, "rcpt-code"));
    card.append(details);

    if (receipt.rows && receipt.rows.length) {
        card.append(node("h3", "rcpt-heading", "Your selections"));
        const list = node("dl", "rcpt-rows");
        receipt.rows.forEach((item) => list.append(row(item.position, item.name)));
        card.append(list);
    }

    if (note) card.append(node("p", "rcpt-note", note));

    card.append(downloadButton("Download receipt", receipt, (r) => buildReceiptImage(r, formatReceiptTime)));

    return card;
}

function downloadButton(label, receipt, build) {
    const button = node("button", "rcpt-download", label);
    button.type = "button";
    button.addEventListener("click", async () => {
        button.disabled = true;
        try {
            const canvas = await build({ ...receipt, rows: receipt.rows || [] });
            const link = document.createElement("a");
            link.href = canvas.toDataURL("image/png");
            link.download = "vote-receipt" + (receipt.code ? "-" + receipt.code : "") + ".png";
            link.click();
        } catch (error) {
            console.error("Receipt download failed:", error);
            button.textContent = "Failed, try again";
            setTimeout(() => { button.textContent = label; }, 3000);
        } finally {
            button.disabled = false;
        }
    });
    return button;
}
