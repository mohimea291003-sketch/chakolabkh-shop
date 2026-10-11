(function(root) {
  "use strict";

  // Reading happens on the customer's device. Only the chosen receipt and
  // its detected references are submitted to the shop's payment service.
  const OCR_ROOT = "https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/";
  let libraryPromise;

  function parseReceiptText(rawText) {
    const text = String(rawText || "").replace(/[០-៩]/g,
      digit => String(digit.charCodeAt(0) - 0x17e0));
    const refs = [...text.matchAll(/\b(?:trx\.?\s*(?:id|no\.?)|transaction\s*(?:id|no\.?|number)|reference\s*(?:id|no\.?|number))\s*[:#.-]?\s*(\d(?:[ \t]*\d){5,39})(?!\d)/gi)]
      .map(match => match[1].replace(/[ \t]/g, ""));
    const uniqueRefs = [...new Set(refs)];
    const purchases = [...text.matchAll(/\bpurchase\s*(?:#|id|no\.?|number)\s*[:#.-]?\s*(\d(?:[ \t]*\d){5,39})(?!\d)/gi)]
      .map(match => match[1].replace(/[ \t]/g, ""));
    const uniquePurchases = [...new Set(purchases)];
    const apv = text.match(/\bAPV\s*[:#.-]?\s*(\d{4,12})\b/i)?.[1] || "";
    const currency = /(?:\$|\bUSD\b)/i.test(text);
    const amountsOnLine = line => [...line.matchAll(/(?:\$|\bUSD\s*)\s*([\d,]+(?:\.\d{1,2})?)\b|\b([\d,]+(?:\.\d{1,2})?)\s*USD\b/gi)]
      .map(match => Number((match[1] || match[2]).replace(/,/g, "")))
      .filter(value => Number.isFinite(value) && value > 0 && value <= 1000000);
    const lines = text.split(/\r?\n/);
    const labelled = lines.flatMap((line, index) =>
      /\b(?:amount|total paid|transferred|payment amount)\b/i.test(line) &&
      !/\b(?:fee|balance|account)\b/i.test(line)
        ? amountsOnLine(line + " " + (lines[index + 1] || "")) : []);
    const all = lines.filter(line => !/\b(?:fee|balance|account)\b/i.test(line))
      .flatMap(amountsOnLine);
    const values = [...new Set(labelled.length ? labelled : all)];
    const amount = currency && values.length === 1 ? values[0] : null;
    const unsuccessful = /\b(?:failed|declined|cancelled|canceled|unsuccessful|pending|scheduled)\b/i.test(text);
    const ambiguous = uniqueRefs.length > 1 || uniquePurchases.length > 1;
    const noReference = !uniqueRefs.length && !uniquePurchases.length;
    return {
      trxId: uniqueRefs.length === 1 ? uniqueRefs[0] : "",
      purchaseId: uniquePurchases.length === 1 ? uniquePurchases[0] : "",
      apv, amount,
      needsReview: unsuccessful || ambiguous || noReference,
      reason: unsuccessful ? "Receipt is not marked as a completed payment" :
        ambiguous ? "More than one reference was read for the same receipt field" :
        noReference ? "A transaction or purchase reference could not be read" : ""
    };
  }

  function randomId() {
    const bytes = new Uint8Array(24);
    root.crypto.getRandomValues(bytes);
    return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
  }

  function loadOcr() {
    if (root.Tesseract) return Promise.resolve(root.Tesseract);
    if (!libraryPromise) {
      libraryPromise = new Promise((resolve, reject) => {
        const script = root.document.createElement("script");
        script.src = OCR_ROOT + "tesseract.min.js";
        script.crossOrigin = "anonymous";
        script.onload = () => root.Tesseract ? resolve(root.Tesseract) : reject(new Error("Receipt reader unavailable"));
        script.onerror = () => reject(new Error("Receipt reader unavailable"));
        root.document.head.appendChild(script);
      }).catch(error => { libraryPromise = null; throw error; });
    }
    return libraryPromise;
  }

  function withTimeout(promise, milliseconds) {
    let timer;
    return Promise.race([promise, new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error("Receipt reading timed out")), milliseconds);
    })]).finally(() => clearTimeout(timer));
  }

  async function prepareImage(file) {
    if (!file || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      throw new Error("Please choose a JPG, PNG, or WebP receipt screenshot.");
    }
    if (file.size > 10 * 1024 * 1024) throw new Error("Please choose a receipt smaller than 10 MB.");
    const url = root.URL.createObjectURL(file);
    try {
      const image = new root.Image();
      image.src = url;
      await image.decode();
      if (!image.naturalWidth || !image.naturalHeight ||
          image.naturalWidth * image.naturalHeight > 60000000) {
        throw new Error("Please choose a clear receipt screenshot.");
      }
      const scale = Math.min(1, 1920 / image.naturalWidth, 2800 / image.naturalHeight);
      const canvas = root.document.createElement("canvas");
      canvas.width = Math.round(image.naturalWidth * scale);
      canvas.height = Math.round(image.naturalHeight * scale);
      const context = canvas.getContext("2d");
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
      if (dataUrl.length > 2100000) throw new Error("This image is too large. Please upload a screenshot of just the receipt.");
      const digest = await root.crypto.subtle.digest("SHA-256", new TextEncoder().encode(dataUrl));
      return {dataUrl, digest: Array.from(new Uint8Array(digest),
        byte => byte.toString(16).padStart(2, "0")).join("")};
    } finally {
      root.URL.revokeObjectURL(url);
    }
  }

  async function readReceipt(dataUrl, progress) {
    let worker;
    let workerPromise;
    try {
      const library = await withTimeout(loadOcr(), 15000);
      workerPromise = library.createWorker("eng", 1, {
        workerPath: OCR_ROOT + "worker.min.js",
        corePath: "https://cdn.jsdelivr.net/npm/tesseract.js-core@6.0.0",
        langPath: "https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng@1.0.0/4.0.0_best_int",
        logger: message => {
          if (message.status === "recognizing text") progress?.(Math.round(message.progress * 100));
        }
      });
      worker = await withTimeout(workerPromise, 35000);
      await worker.setParameters({tessedit_pageseg_mode: "11"});
      const result = await withTimeout(worker.recognize(dataUrl), 30000);
      return parseReceiptText(result.data.text);
    } catch (error) {
      // A slow/offline reader must not prevent the shop from receiving proof.
      return {trxId: "", purchaseId: "", apv: "", amount: null, needsReview: true,
        reason: "Automatic receipt reading unavailable; staff review requested"};
    } finally {
      if (worker) await worker.terminate().catch(() => {});
      else if (workerPromise) workerPromise.then(lateWorker => lateWorker.terminate()).catch(() => {});
    }
  }

  const api = {parseReceiptText, randomId, prepareImage, readReceipt};
  root.PaymentProofReader = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
