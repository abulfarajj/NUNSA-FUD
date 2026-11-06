/* Vote receipt and final result images. Both follow the viewer's light or dark theme. */

const SERIF = '"Playfair Display", "Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, "Noto Serif", serif';
const SANS = '"Inter", "SF Pro Text", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

const PALETTES = {
    light: { bg: "#f7f5ef", surface: "#ffffff", text: "#16282d", muted: "#5d7176", line: "#e2dfd5", primary: "#205e68", track: "#e8ece9", accent: "#b88420", accentText: "#ffffff", ring: "#ffffff" },
    dark: { bg: "#0d1517", surface: "#142024", text: "#e8eff0", muted: "#92a5a9", line: "#26373b", primary: "#6fb0ba", track: "#1f3035", accent: "#d9a73f", accentText: "#1b1405", ring: "#26373b" }
};

function currentTheme() {
    const chosen = document.documentElement.getAttribute("data-theme");
    if (chosen === "light" || chosen === "dark") return chosen;
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function loadImage(src) {
    return new Promise((resolve) => {
        const image = new Image();
        image.crossOrigin = "anonymous";
        image.onload = () => resolve(image);
        image.onerror = () => resolve(null);
        image.src = src;
    });
}

function roundRectPath(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

function fit(ctx, text, maxWidth) {
    let out = String(text == null ? "" : text);
    if (ctx.measureText(out).width <= maxWidth) return out;
    while (out.length > 1 && ctx.measureText(out + "…").width > maxWidth) out = out.slice(0, -1);
    return out + "…";
}

/* Letter-spaced capitals, drawn one character at a time so it works in every browser. */
function spaced(ctx, text, x, y, spacing, align) {
    const chars = [...text];
    const widths = chars.map((c) => ctx.measureText(c).width);
    const total = widths.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1);
    let cursor = align === "center" ? x - total / 2 : align === "right" ? x - total : x;
    ctx.textAlign = "left";
    chars.forEach((c, i) => {
        ctx.fillText(c, cursor, y);
        cursor += widths[i] + spacing;
    });
}

/* Largest font size, down to a floor, at which the text fits on one line. */
function shrinkToFit(ctx, text, family, weight, start, floor, maxWidth) {
    let size = start;
    ctx.font = `${weight} ${size}px ${family}`;
    while (size > floor && ctx.measureText(text).width > maxWidth) {
        size -= 2;
        ctx.font = `${weight} ${size}px ${family}`;
    }
    return size;
}

function drawLogo(ctx, logo, cx, cy, radius, palette) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius + 4, 0, Math.PI * 2);
    ctx.fillStyle = palette.ring;
    ctx.fill();
    ctx.restore();
    if (!logo) return;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(logo, cx - radius, cy - radius, radius * 2, radius * 2);
    ctx.restore();
}

function drawAvatar(ctx, image, cx, cy, radius, palette, label) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.clip();
    if (image) {
        const side = Math.min(image.width, image.height);
        ctx.drawImage(image, (image.width - side) / 2, (image.height - side) / 2, side, side, cx - radius, cy - radius, radius * 2, radius * 2);
    } else {
        ctx.fillStyle = palette.track;
        ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
        ctx.fillStyle = palette.muted;
        ctx.font = `bold ${Math.round(radius)}px ${SANS}`;
        ctx.textAlign = "center";
        ctx.fillText((label || "?").trim().charAt(0).toUpperCase(), cx, cy + radius * 0.35);
    }
    ctx.restore();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = palette.line;
    ctx.lineWidth = 2;
    ctx.stroke();
}

/* Logo on the left, wordmark beside it, then a centred kicker, heading and subtitle. Returns the header height. */
function drawHeader(ctx, width, palette, logo, kicker, heading, subtitle) {
    drawLogo(ctx, logo, 84, 70, 34, palette);
    ctx.fillStyle = palette.text;
    ctx.font = `700 22px ${SANS}`;
    spaced(ctx, "NUNSA-FUD", 136, 77, 3, "left");

    ctx.fillStyle = palette.accent;
    ctx.font = `700 15px ${SANS}`;
    spaced(ctx, kicker, width / 2, 150, 5, "center");

    ctx.fillStyle = palette.text;
    ctx.textAlign = "center";
    shrinkToFit(ctx, heading, SERIF, "700", 46, 26, width - 140);
    ctx.fillText(fit(ctx, heading, width - 140), width / 2, 205);

    let bottom = 205;
    if (subtitle) {
        ctx.fillStyle = palette.muted;
        ctx.font = `400 19px ${SANS}`;
        ctx.fillText(subtitle, width / 2, 245);
        bottom = 245;
    }

    ctx.fillStyle = palette.accent;
    ctx.fillRect(width / 2 - 28, bottom + 26, 56, 3);
    return bottom + 70;
}

function drawFooter(ctx, width, y, palette, text) {
    ctx.fillStyle = palette.line;
    ctx.fillRect(60, y, width - 120, 1);
    ctx.fillStyle = palette.muted;
    ctx.font = `400 17px ${SANS}`;
    ctx.textAlign = "center";
    ctx.fillText(text, width / 2, y + 42);
}

export async function buildReceiptImage(receipt, formatTime) {
    const palette = PALETTES[currentTheme()];
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    const logo = await loadImage("assets/nunsa-logo.png");

    const width = 800;
    const meta = [
        ["Election", receipt.election],
        ["Voter", receipt.matric],
        ["Date and time", formatTime(receipt.votedAt)]
    ];
    if (receipt.code) meta.push(["Reference", receipt.code]);

    const metaTop = 300;
    const metaRow = 58;
    const metaHeight = meta.length * metaRow + 16;
    const selectionsTop = metaTop + metaHeight + 56;
    const rowHeight = 92;
    const hasRows = receipt.rows.length > 0;
    const height = hasRows ? selectionsTop + 40 + receipt.rows.length * rowHeight + 110 : metaTop + metaHeight + 130;

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = palette.bg;
    ctx.fillRect(0, 0, width, height);

    drawHeader(ctx, width, palette, logo, "ELECTRONIC VOTING", "Vote receipt", "");

    roundRectPath(ctx, 50, metaTop, width - 100, metaHeight, 18);
    ctx.fillStyle = palette.surface;
    ctx.fill();
    ctx.strokeStyle = palette.line;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    meta.forEach(([label, value], i) => {
        const y = metaTop + 8 + i * metaRow + 38;
        if (i > 0) {
            ctx.fillStyle = palette.line;
            ctx.fillRect(78, metaTop + 8 + i * metaRow, width - 156, 1);
        }
        ctx.textAlign = "left";
        ctx.fillStyle = palette.muted;
        ctx.font = `400 20px ${SANS}`;
        ctx.fillText(label, 78, y);
        ctx.textAlign = "right";
        ctx.fillStyle = palette.text;
        ctx.font = `700 22px ${SANS}`;
        ctx.fillText(fit(ctx, value || "-", 440), width - 78, y);
    });

    if (hasRows) {
        ctx.fillStyle = palette.accent;
        ctx.font = `700 15px ${SANS}`;
        spaced(ctx, "YOUR SELECTIONS", 50, selectionsTop, 4, "left");
    }

    let y = selectionsTop + 22;
    receipt.rows.forEach((item) => {
        ctx.fillStyle = palette.line;
        ctx.fillRect(50, y, width - 100, 1);
        ctx.textAlign = "left";
        ctx.fillStyle = palette.muted;
        ctx.font = `400 19px ${SANS}`;
        ctx.fillText(fit(ctx, item.position, 700), 50, y + 32);
        ctx.fillStyle = palette.text;
        ctx.font = `700 28px ${SERIF}`;
        ctx.fillText(fit(ctx, item.name, 700), 50, y + 68);
        y += rowHeight;
    });

    drawFooter(ctx, width, height - 80, palette, "NUNSA-FUD Electronic Voting System");
    return canvas;
}

export async function buildResultsImage(results) {
    const palette = PALETTES[currentTheme()];
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    const logo = await loadImage("assets/nunsa-logo.png");

    const positions = Array.isArray(results.positions) ? results.positions : [];
    const width = 1000;
    const headerHeight = 340;
    const positionHeight = 96;
    const rowHeight = 118;
    const footerHeight = 110;
    const rows = positions.reduce((n, p) => n + (Array.isArray(p.candidates) ? p.candidates.length : 0), 0);
    const height = headerHeight + positions.length * positionHeight + rows * rowHeight + footerHeight;

    const flat = [];
    positions.forEach((p) => (p.candidates || []).forEach((c) => flat.push(c)));
    const avatars = await Promise.all(flat.map((c) => loadImage(c.profilePicture || "assets/default-profile.jpg")));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = palette.bg;
    ctx.fillRect(0, 0, width, height);

    const votes = Number(results.totalVotes || 0).toLocaleString();
    drawHeader(ctx, width, palette, logo, "FINAL RESULTS", results.election?.title || "Election results", `${votes} ${Number(results.totalVotes || 0) === 1 ? "vote" : "votes"} cast`);

    let y = headerHeight;
    let index = 0;
    positions.forEach((position) => {
        const candidates = Array.isArray(position.candidates) ? position.candidates : [];
        const top = candidates[0];
        const tied = candidates.length > 1 && candidates[1].votes === top.votes;
        const winnerId = top && top.votes > 0 && !tied ? top.id : null;

        ctx.textAlign = "left";
        ctx.fillStyle = palette.text;
        ctx.font = `700 32px ${SERIF}`;
        ctx.fillText(fit(ctx, position.position || "Position", 600), 60, y + 50);
        ctx.fillStyle = palette.muted;
        ctx.font = `400 18px ${SANS}`;
        ctx.textAlign = "right";
        const total = Number(position.totalVotes || 0);
        ctx.fillText(`${total.toLocaleString()} ${total === 1 ? "vote" : "votes"}`, width - 60, y + 48);
        ctx.fillStyle = palette.line;
        ctx.fillRect(60, y + 68, width - 120, 1);
        y += positionHeight;

        candidates.forEach((candidate) => {
            const image = avatars[index++];
            const isWinner = candidate.id === winnerId;
            const percent = Number(candidate.percentage || 0);

            drawAvatar(ctx, image, 108, y + 50, 38, palette, candidate.name);

            ctx.textAlign = "left";
            ctx.fillStyle = palette.text;
            ctx.font = `700 25px ${SANS}`;
            const name = fit(ctx, candidate.name || "Unnamed candidate", isWinner ? 400 : 520);
            ctx.fillText(name, 170, y + 42);
            const nameWidth = ctx.measureText(name).width;

            if (isWinner) {
                const pillX = 170 + nameWidth + 14;
                roundRectPath(ctx, pillX, y + 21, 86, 28, 14);
                ctx.fillStyle = palette.accent;
                ctx.fill();
                ctx.fillStyle = palette.accentText;
                ctx.font = `700 12px ${SANS}`;
                spaced(ctx, "WINNER", pillX + 43, y + 40, 2, "center");
            }

            ctx.textAlign = "left";
            ctx.fillStyle = palette.muted;
            ctx.font = `400 19px ${SANS}`;
            const count = Number(candidate.votes || 0);
            ctx.fillText(`${count.toLocaleString()} ${count === 1 ? "vote" : "votes"}`, 170, y + 72);

            roundRectPath(ctx, 170, y + 84, 560, 8, 4);
            ctx.fillStyle = palette.track;
            ctx.fill();
            if (percent > 0) {
                roundRectPath(ctx, 170, y + 84, Math.max(8, 560 * Math.min(percent, 100) / 100), 8, 4);
                ctx.fillStyle = isWinner ? palette.accent : palette.primary;
                ctx.fill();
            }

            ctx.textAlign = "right";
            ctx.fillStyle = palette.text;
            ctx.font = `700 30px ${SERIF}`;
            ctx.fillText(`${percent.toFixed(2)}%`, width - 60, y + 62);
            y += rowHeight;
        });
    });

    drawFooter(ctx, width, height - footerHeight + 20, palette, "NUNSA-FUD Official Election Result");
    return canvas;
}
