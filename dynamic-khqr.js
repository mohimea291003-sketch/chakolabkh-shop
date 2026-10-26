/* CHAKO LAB dynamic KHQR display.
 * Based on the shop's own verified ABA-issued source QR.
 * This creates a client-side exact-amount KHQR, NOT proof of payment.
 * Never approve an order based on this QR or a screenshot alone.
 */
(function (root) {
  "use strict";
  let sourcePromise = null;
  function parseTLV(data) {
    if (!data || data.length > 3000 || !/^[\x20-\x7E]+$/.test(data)) {
      throw Error("Invalid KHQR payload");
    }
    const tags = [];
    let offset = 0;
    while (offset < data.length) {
      if (offset + 4 > data.length) throw Error("Incomplete KHQR field");
      const id = data.slice(offset, offset + 2), length = data.slice(offset + 2, offset + 4);
      if (!/^\d{2}$/.test(id) || !/^\d{2}$/.test(length)) throw Error("Invalid KHQR field");
      offset += 4;
      const count = Number(length);
      if (offset + count > data.length) throw Error("Incomplete KHQR value");
      tags.push({id, value: data.slice(offset, offset + count)});
      offset += count;
    }
    return tags;
  }
  function field(id, value) {
    if (typeof value !== "string" || value.length > 99 || !/^[\x20-\x7E]*$/.test(value)) {
      throw Error("Invalid KHQR field value");
    }
    return id + String(value.length).padStart(2, "0") + value;
  }
  function crc16(input) {
    let crc = 0xffff;
    for (let i = 0; i < input.length; i++) {
      crc ^= input.charCodeAt(i) << 8;
      for (let n = 0; n < 8; n++) {
        crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
      }
    }
    return crc.toString(16).toUpperCase().padStart(4, "0");
  }
  function validate(raw) {
    const text = String(raw || "").trim();
    const tags = parseTLV(text);
    const get = id => tags.find(t => t.id === id)?.value;
    if (tags[0]?.id !== "00" || get("00") !== "01" ||
        !["11","12"].includes(get("01")) ||
        tags[tags.length - 1]?.id !== "63" ||
        !/^[\da-fA-F]{4}$/.test(get("63") || "") ||
        crc16(text.slice(0, -4)) !== get("63").toUpperCase() ||
        new Set(tags.map(t => t.id)).size !== tags.length ||
        !get("59") || get("58") !== "KH" ||
        get("53") !== "840" || !(get("30") || get("29"))) {
      throw Error("The shop's original ABA QR failed validation or is not USD");
    }
    return {tags, recipient:get("59"), merchant:get("30") || get("29"), currency:get("53")};
  }
  async function loadSource() {
    if (sourcePromise) return sourcePromise;
    sourcePromise = (async () => {
      if (typeof root.jsQR !== "function") throw Error("KHQR decoder unavailable");
      const image = new Image();
      image.src = "aba-khqr.jpg";
      await image.decode();
      if (!image.naturalWidth || !image.naturalHeight ||
          image.naturalWidth > 5000 || image.naturalHeight > 5000) {
        throw Error("Invalid original QR image");
      }
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const ctx = canvas.getContext("2d", {willReadFrequently:true});
      if (!ctx) throw Error("QR image reading unavailable");
      ctx.drawImage(image, 0, 0);
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const decoded = root.jsQR(pixels.data, canvas.width, canvas.height,
        {inversionAttempts:"attemptBoth"});
      if (!decoded?.data) throw Error("Original ABA QR could not be decoded");
      return validate(decoded.data);
    })();
    try { return await sourcePromise; }
    catch (e) { sourcePromise = null; throw e; }
  }
  function makePayload(source, amount) {
    const value = Number(amount);
    const cents = Math.round(value * 100);
    if (!Number.isFinite(value) || !Number.isSafeInteger(cents) || cents <= 0 ||
        cents > 99999900 || Math.abs(value * 100 - cents) > 0.000001) {
      throw Error("Invalid USD order total");
    }
    const tags = source.tags.filter(t => !["01","54","63"].includes(t.id));
    tags.push({id:"01", value:"12"}, {id:"54", value:(cents / 100).toFixed(2)});
    tags.sort((a,b) => Number(a.id) - Number(b.id));
    const base = tags.map(t => field(t.id, t.value)).join("") + "6304";
    const result = base + crc16(base);
    const check = validate(result);
    if (check.recipient !== source.recipient ||
        check.merchant !== source.merchant || check.currency !== source.currency) {
      throw Error("The receiving account changed unexpectedly");
    }
    return {payload:result, recipient:source.recipient, amount:(cents / 100).toFixed(2)};
  }
  async function createForUSD(amount) {
    return makePayload(await loadSource(), amount);
  }
  function draw(payload, target) {
    if (typeof root.QRCode !== "function") throw Error("QR display library unavailable");
    target.replaceChildren();
    new root.QRCode(target, {
      text:payload,
      width:240,
      height:240,
      colorDark:"#000000",
      colorLight:"#ffffff",
      correctLevel:root.QRCode.CorrectLevel.M
    });
  }
  root.CHAKO_KHQR = Object.freeze({createForUSD, draw});
})(window);
