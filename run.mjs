import OpenAI from "openai";
import fetch from "node-fetch";
import FormData from "form-data";
import fs from "fs/promises";
import path from "path";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const PROMPT = `Create a vertical 9:16 inspirational wallpaper. Invent a short, original inspirational sentence that feels fresh and avoids familiar clichés. Design an artistic background that metaphorically or symbolically expresses the meaning of that sentence in a creative way, using imaginative colors, shapes, or scenes. Stylize the text so it harmonizes with the theme, and place it naturally in the lower half of the image (not touching the edge). Keep the top-center area uncluttered so a digital clock overlay fits smoothly. The overall style should feel modern, evocative, and visually striking.`;

const IMG_SIZE = "1024x1536"; // near 9:16
const IMG_QUALITY = process.env.IMG_QUALITY || "low"; // 'low', 'medium', 'high', and 'auto'

async function generateImage() {
  const res = await client.images.generate({
    model: "gpt-image-1",
    prompt: PROMPT,
    size: IMG_SIZE,
    quality: IMG_QUALITY,     // ✅ set quality here
  });
  const b64 = res.data[0].b64_json;
  const img = Buffer.from(b64, "base64");
  const outPath = path.join(process.cwd(), "wallpaper.png");
  await fs.writeFile(outPath, img);
  return outPath;
}

async function uploadToCatbox(filePath) {
  const form = new FormData();
  form.append("reqtype", "fileupload");

  // ✅ Use authenticated uploads when CATBOX_USERHASH is set
  const userhash = process.env.CATBOX_USERHASH && process.env.CATBOX_USERHASH.trim();
  if (userhash) {
    form.append("userhash", userhash);
    console.log("[catbox] Using authenticated upload (userhash present).");
  } else {
    console.log("[catbox] No userhash found; attempting anonymous upload.");
  }

  form.append("fileToUpload", await fs.readFile(filePath), {
    filename: path.basename(filePath),
    contentType: "image/png",
  });

  const resp = await fetch("https://catbox.moe/user/api.php", {
    method: "POST",
    body: form,
    headers: form.getHeaders(),
  });

  const text = (await resp.text()).trim();
  const isUrl = /^https?:\/\//i.test(text);

  if (resp.ok && isUrl) return text;

  // Helpful diagnostics
  if (/Anon Uploads are temporarily paused/i.test(text)) {
    throw new Error("Catbox upload failed: anonymous uploads are paused and no valid userhash was used.");
  }

  throw new Error(`Catbox upload failed (status ${resp.status}): ${text}`);
}

async function buildClockPage(imageUrl) { 
  const tpl = await fs.readFile(path.join(process.cwd(), "template.html"), "utf8");
  const html = tpl.replaceAll("%%IMAGE_URL%%", imageUrl);
  const out = path.join(process.cwd(), "index.html");
  await fs.writeFile(out, html);
  return out;
}

(async () => {
  try {
    const pngPath = await generateImage();
    const url = await uploadToCatbox(pngPath);
    await buildClockPage(url);
    console.log("CATBOX_URL=" + url);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})
async function appendLinkLog({ url, size, quality }) {
  const dir = path.join(process.cwd(), "data");
  const file = path.join(dir, "links.json");
  await fs.mkdir(dir, { recursive: true });

  let arr = [];
  try {
    const existing = await fs.readFile(file, "utf8");
    arr = JSON.parse(existing);
    if (!Array.isArray(arr)) arr = [];
  } catch (_) {
    // file not found or invalid -> start fresh
  }

  arr.push({
    ts: new Date().toISOString(),
    url,
    size,
    quality
  });

  await fs.writeFile(file, JSON.stringify(arr, null, 2));
}
(async () => {
  try {
    const pngPath = await generateImage();
    const url = await uploadToCatbox(pngPath);
    await appendLinkLog({ url, size: IMG_SIZE, quality: IMG_QUALITY }); // ✅ log it
    await buildClockPage(url);
    console.log("CATBOX_URL=" + url);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();
