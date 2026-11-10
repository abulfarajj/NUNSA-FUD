/* PIN boxes show a dot the moment a digit is typed. The real digit is kept on the box (data-digit), never in the visible text,
 * so nothing relies on the browser's password field, which keeps the last digit on screen for a second or more. */

export const MASK = "\u2022";

export function typedDigit(input) {
    return input.value.replace(/\D/g, "").slice(-1);
}

export function setDigit(input, digit, masked = true) {
    input.dataset.digit = digit;
    input.value = digit ? (masked ? MASK : digit) : "";
}

export function readDigit(input) {
    return input.dataset.digit || "";
}
