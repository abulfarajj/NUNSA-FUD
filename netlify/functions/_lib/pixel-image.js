/* Blocky pixel receipt and results images for the Telegram bot, drawn without any image library.
 * The layout and the 5x7 letters match share-images.js, which makes the same pictures in the browser. */
"use strict";

const zlib = require("zlib");

const GLYPHS = {};
function glyph(chars, rows) { GLYPHS[chars] = rows.split(" "); }
glyph("A", "01110 10001 10001 11111 10001 10001 10001"); glyph("B", "11110 10001 10001 11110 10001 10001 11110");
glyph("C", "01110 10001 10000 10000 10000 10001 01110"); glyph("D", "11110 10001 10001 10001 10001 10001 11110");
glyph("E", "11111 10000 10000 11110 10000 10000 11111"); glyph("F", "11111 10000 10000 11110 10000 10000 10000");
glyph("G", "01110 10001 10000 10111 10001 10001 01111"); glyph("H", "10001 10001 10001 11111 10001 10001 10001");
glyph("I", "01110 00100 00100 00100 00100 00100 01110"); glyph("J", "00111 00010 00010 00010 00010 10010 01100");
glyph("K", "10001 10010 10100 11000 10100 10010 10001"); glyph("L", "10000 10000 10000 10000 10000 10000 11111");
glyph("M", "10001 11011 10101 10101 10001 10001 10001"); glyph("N", "10001 11001 10101 10011 10001 10001 10001");
glyph("O", "01110 10001 10001 10001 10001 10001 01110"); glyph("P", "11110 10001 10001 11110 10000 10000 10000");
glyph("Q", "01110 10001 10001 10001 10101 10010 01101"); glyph("R", "11110 10001 10001 11110 10100 10010 10001");
glyph("S", "01111 10000 10000 01110 00001 00001 11110"); glyph("T", "11111 00100 00100 00100 00100 00100 00100");
glyph("U", "10001 10001 10001 10001 10001 10001 01110"); glyph("V", "10001 10001 10001 10001 10001 01010 00100");
glyph("W", "10001 10001 10001 10101 10101 11011 10001"); glyph("X", "10001 10001 01010 00100 01010 10001 10001");
glyph("Y", "10001 10001 01010 00100 00100 00100 00100"); glyph("Z", "11111 00001 00010 00100 01000 10000 11111");
glyph("0", "01110 10001 10011 10101 11001 10001 01110"); glyph("1", "00100 01100 00100 00100 00100 00100 01110");
glyph("2", "01110 10001 00001 00010 00100 01000 11111"); glyph("3", "11110 00001 00001 01110 00001 00001 11110");
glyph("4", "00010 00110 01010 10010 11111 00010 00010"); glyph("5", "11111 10000 11110 00001 00001 10001 01110");
glyph("6", "00110 01000 10000 11110 10001 10001 01110"); glyph("7", "11111 00001 00010 00100 01000 01000 01000");
glyph("8", "01110 10001 10001 01110 10001 10001 01110"); glyph("9", "01110 10001 10001 01111 00001 00010 01100");
glyph("-", "00000 00000 00000 11111 00000 00000 00000"); glyph("#", "01010 01010 11111 01010 11111 01010 01010");
glyph(":", "00000 00100 00100 00000 00100 00100 00000"); glyph("/", "00001 00001 00010 00100 01000 10000 10000");
glyph(".", "00000 00000 00000 00000 00000 01100 01100"); glyph("'", "00100 00100 01000 00000 00000 00000 00000");
glyph("%", "11001 11010 00010 00100 01000 01011 10011"); glyph("*", "00000 00100 10101 01110 10101 00100 00000");
glyph("!", "00100 00100 00100 00100 00100 00000 00100"); glyph(",", "00000 00000 00000 00000 01100 00100 01000");
glyph("?", "01110 10001 00001 00010 00100 00000 00100"); glyph("(", "00010 00100 01000 01000 01000 00100 00010");
glyph(")", "01000 00100 00010 00010 00010 00100 01000"); glyph("&", "01100 10010 10100 01000 10101 10010 01101");
glyph("+", "00000 00100 00100 11111 00100 00100 00000"); glyph("=", "00000 00000 11111 00000 11111 00000 00000");
glyph('"', "01010 01010 00000 00000 00000 00000 00000"); glyph(";", "00000 01100 01100 00000 01100 00100 01000");
glyph("_", "00000 00000 00000 00000 00000 00000 11111"); glyph(" ", "00000 00000 00000 00000 00000 00000 00000");

const PX = 4;
const CELL = 6 * PX;
const COLS = 22;
const LINE = 11 * PX;

const PAPER = {
    light: { backdrop: [222, 219, 210], paper: [255, 253, 246], ink: [26, 26, 26], faint: [120, 118, 110] },
    dark: { backdrop: [10, 14, 15], paper: [24, 29, 31], ink: [234, 240, 240], faint: [139, 154, 157] }
};

function cleanText(text) {
    return String(text == null ? "" : text)
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"')
        .toUpperCase();
}

function wrapText(text, cols) {
    const words = cleanText(text).split(/\s+/).filter(Boolean);
    const lines = [];
    let line = "";
    for (let word of words) {
        while (word.length > cols) {
            if (line) { lines.push(line); line = ""; }
            lines.push(word.slice(0, cols));
            word = word.slice(cols);
        }
        if (!line) line = word;
        else if ((line + " " + word).length <= cols) line += " " + word;
        else { lines.push(line); line = word; }
    }
    if (line) lines.push(line);
    return lines.length ? lines : [""];
}

function tableRow(qty, item, amount) {
    const left = qty.padEnd(3);
    const width = COLS - left.length - amount.length - 1;
    return wrapText(item, width).map((part, i) => i === 0
        ? left + part.padEnd(width) + " " + amount
        : " ".repeat(left.length) + part);
}

function pairRow(label, value) {
    const l = cleanText(label);
    const v = cleanText(value);
    if (l.length + v.length + 1 <= COLS) return [l + " ".repeat(COLS - l.length - v.length) + v];
    return [l, ...wrapText(v, COLS - 2).map((p) => "  " + p)];
}

function hashCode(text) {
    let h = 2166136261;
    for (const ch of String(text)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
    return h >>> 0;
}

function seededRandom(seedText) {
    let a = hashCode(seedText) || 1;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/* ---------- a tiny RGB canvas and PNG encoder ---------- */

function createCanvas(width, height, background) {
    const data = Buffer.alloc(width * height * 3);
    for (let i = 0; i < data.length; i += 3) {
        data[i] = background[0]; data[i + 1] = background[1]; data[i + 2] = background[2];
    }
    return { width, height, data };
}

function fillRect(canvas, x, y, w, h, color) {
    const x0 = Math.max(0, Math.round(x));
    const y0 = Math.max(0, Math.round(y));
    const x1 = Math.min(canvas.width, Math.round(x + w));
    const y1 = Math.min(canvas.height, Math.round(y + h));
    for (let row = y0; row < y1; row++) {
        let index = (row * canvas.width + x0) * 3;
        for (let col = x0; col < x1; col++) {
            canvas.data[index++] = color[0];
            canvas.data[index++] = color[1];
            canvas.data[index++] = color[2];
        }
    }
}

const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
        table[n] = c >>> 0;
    }
    return table;
})();

function crc32(buffer) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < buffer.length; i++) c = CRC_TABLE[(c ^ buffer[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
}

function pngChunk(type, data) {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
}

function encodePng(canvas) {
    const header = Buffer.alloc(13);
    header.writeUInt32BE(canvas.width, 0);
    header.writeUInt32BE(canvas.height, 4);
    header[8] = 8;   /* bit depth */
    header[9] = 2;   /* RGB */
    const stride = canvas.width * 3;
    const raw = Buffer.alloc((stride + 1) * canvas.height);
    for (let row = 0; row < canvas.height; row++) {
        raw[row * (stride + 1)] = 0;
        canvas.data.copy(raw, row * (stride + 1) + 1, row * stride, (row + 1) * stride);
    }
    return Buffer.concat([
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        pngChunk("IHDR", header),
        pngChunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
        pngChunk("IEND", Buffer.alloc(0))
    ]);
}

/* ---------- drawing ---------- */

function drawBlocky(canvas, x, y, text, color, scale) {
    for (const ch of cleanText(text)) {
        const rows = GLYPHS[ch] || GLYPHS["?"];
        for (let ry = 0; ry < rows.length; ry++) {
            for (let rx = 0; rx < rows[ry].length; rx++) {
                if (rows[ry][rx] === "1") fillRect(canvas, x + rx * scale, y + ry * scale, scale, scale, color);
            }
        }
        x += 6 * scale;
    }
}

function drawBarcode(canvas, x, y, width, label, colors, seedText) {
    const random = seededRandom(seedText);
    const widths = [4, 8, 12];
    const gaps = [4, 8];
    let cursor = x;
    while (cursor < x + width) {
        const bar = widths[Math.floor(random() * widths.length)];
        const gap = gaps[Math.floor(random() * gaps.length)];
        fillRect(canvas, cursor, y, Math.min(bar, x + width - cursor), 76, colors.ink);
        cursor += bar + gap;
    }
    const text = cleanText(label);
    drawBlocky(canvas, x + width / 2 - (text.length * 12) / 2, y + 92, text, colors.faint, 2);
}

/* items: { text, align, size, faint } | { rule } | { gap } | { barcode } */
function render(items, theme, barcodeSeed) {
    const colors = PAPER[theme] || PAPER.light;
    const pad = 40;
    const margin = 44;
    const paperWidth = COLS * CELL + pad * 2;
    const width = paperWidth + margin * 2;
    const heightOf = (item) => item.rule ? LINE : item.gap ? item.gap : item.barcode ? 120 : (item.size >= 1.5 ? LINE * 2 : LINE);
    const height = items.reduce((sum, item) => sum + heightOf(item), 0) + 2 * margin + 120;

    const canvas = createCanvas(width, height, colors.backdrop);
    fillRect(canvas, margin, margin + 16, paperWidth, height - 2 * margin - 32, colors.paper);
    const step = 16;
    for (let x = margin; x < margin + paperWidth; x += step * 2) {
        fillRect(canvas, x, margin, step, 16, colors.paper);
        fillRect(canvas, x + step, height - margin - 16, step, 16, colors.paper);
    }

    const left = margin + pad;
    const centerX = margin + paperWidth / 2;
    let y = margin + 16 + 44;

    items.forEach((item) => {
        if (item.rule) {
            drawBlocky(canvas, left, y, "-".repeat(COLS), colors.ink, PX);
        } else if (item.barcode) {
            drawBarcode(canvas, left, y, COLS * CELL, item.barcode, colors, barcodeSeed);
        } else if (item.text !== undefined) {
            const scale = item.size >= 1.5 ? PX + 2 : PX;
            const text = cleanText(item.text);
            const color = item.faint ? colors.faint : colors.ink;
            const x = item.align === "center" ? centerX - (text.length * 6 * scale) / 2 : left;
            drawBlocky(canvas, x, scale > PX ? y - 6 : y, text, color, scale);
        }
        y += heightOf(item);
    });
    return encodePng(canvas);
}

function pushWrapped(items, text, options) {
    wrapText(text, COLS).forEach((line) => items.push({ text: line, ...options }));
}

const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/* Shown in Nigerian time (WAT, UTC+1, no daylight saving) whatever the server's clock says. */
function shortDate(value) {
    const parsed = value ? new Date(value) : new Date();
    const date = new Date((Number.isNaN(parsed.getTime()) ? Date.now() : parsed.getTime()) + 60 * 60 * 1000);
    const hour = date.getUTCHours();
    const clock = `${hour % 12 === 0 ? 12 : hour % 12}:${String(date.getUTCMinutes()).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"}`;
    return [`${WEEKDAYS[date.getUTCDay()]} ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`, clock];
}

/* receipt: { election, matric, votedAt, code, rows: [{ position, name }] } -> PNG Buffer */
function receiptPng(receipt, theme) {
    const items = [];
    const [day, time] = shortDate(receipt.votedAt);
    const rows = receipt.rows || [];

    items.push({ text: "NUNSA-FUD", align: "center", size: 1.5 });
    items.push({ text: "ELECTRONIC VOTING", align: "center" });
    items.push({ gap: 14 });
    pushWrapped(items, `ORDER #${receipt.code || "-"}`, { align: "center" });
    pushWrapped(items, `FOR ${receipt.matric || "-"}`, { align: "center" });
    items.push({ text: day, align: "center" });
    items.push({ text: time, align: "center" });
    items.push({ rule: true });
    items.push({ text: "QTY ITEM".padEnd(COLS - 3) + "AMT" });
    items.push({ rule: true });
    if (rows.length) {
        rows.forEach((row, i) => {
            tableRow(String(i + 1).padStart(2, "0"), `${row.position}: ${row.name}`, "OK").forEach((line) => items.push({ text: line }));
        });
    } else {
        pushWrapped(items, "YOUR CHOICES ARE NEVER STORED WITH YOUR NAME", {});
    }
    items.push({ rule: true });
    pairRow("ITEM COUNT:", rows.length || 1).forEach((line) => items.push({ text: line }));
    pairRow("ELECTION:", receipt.election || "-").forEach((line) => items.push({ text: line }));
    items.push({ rule: true });
    pairRow("STATUS:", "VOTE RECORDED").forEach((line) => items.push({ text: line }));
    pairRow("REF:", receipt.code || "-").forEach((line) => items.push({ text: line }));
    items.push({ rule: true });
    items.push({ gap: 8 });
    items.push({ text: "THANK YOU FOR VOTING!", align: "center" });
    items.push({ gap: 14 });
    items.push({ barcode: receipt.code || receipt.matric || "NUNSA-FUD" });

    return render(items, theme, receipt.code || receipt.matric || "NUNSA-FUD");
}

/* results: the get-election-results payload ({ election: { title }, totalVotes, positions }) -> PNG Buffer */
function resultsPng(results, theme) {
    const items = [];
    const positions = Array.isArray(results.positions) ? results.positions : [];
    const title = (results.election && results.election.title) || "Election results";

    items.push({ text: "NUNSA-FUD", align: "center", size: 1.5 });
    items.push({ text: "FINAL RESULTS", align: "center" });
    items.push({ gap: 10 });
    pushWrapped(items, title, { align: "center" });
    items.push({ gap: 6 });
    items.push({ text: `TOTAL VOTES: ${Number(results.totalVotes || 0)}`, align: "center" });
    items.push({ rule: true });

    positions.forEach((position) => {
        const candidates = Array.isArray(position.candidates) ? position.candidates : [];
        const top = candidates[0];
        const tied = candidates.length > 1 && candidates[1].votes === top.votes;
        const winnerId = top && top.votes > 0 && !tied ? top.id : null;

        pushWrapped(items, position.position || "Position", {});
        items.push({ text: "NO CANDIDATE".padEnd(COLS - 5) + "VOTES", faint: true });
        candidates.forEach((candidate, i) => {
            tableRow(String(i + 1).padStart(2, "0"), candidate.name || "Unnamed", String(Number(candidate.votes || 0))).forEach((line) => items.push({ text: line }));
            const percent = `${Number(candidate.percentage || 0).toFixed(2)}%`;
            items.push({ text: "   " + percent + (candidate.id === winnerId ? " WINNER" : ""), faint: candidate.id !== winnerId });
        });
        items.push({ gap: 6 });
        pairRow("TOTAL:", Number(position.totalVotes || 0)).forEach((line) => items.push({ text: line }));
        items.push({ rule: true });
    });

    items.push({ gap: 8 });
    items.push({ text: "THANK YOU FOR VOTING!", align: "center" });
    items.push({ gap: 14 });
    items.push({ barcode: "NUNSA-FUD" });

    return render(items, theme, title);
}

module.exports = { receiptPng, resultsPng };
