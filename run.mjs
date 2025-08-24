import OpenAI from "openai";
import fetch from "node-fetch";
import FormData from "form-data";
import fs from "fs/promises";
import path from "path";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const PROMPT = `Create a vertical 9:16 inspirational wallpaper.First, generate a short, completely original sentence (under 12 words) that feels fresh, uplifting, and thought-provoking while avoiding familiar clichés.The sentence must be written in correct, natural English with no spelling mistakes, no missing letters, and no invented words. Render this sentence exactly as written, without altering it, on the wallpaper. Then, design a background in any creative visual style—this could be photorealistic nature, painterly realism, minimalist design, abstract surrealism, whimsical illustration, or bold typography-led art. The imagery should symbolically or imaginatively resonate with the meaning of the sentence, without defaulting to overused motifs (like roads, horizons, or sunsets).Stylize the text so it integrates naturally with the background, placed in the lower half of the image, centered, with generous margins and always fully inside the frame. Keep the top-center third uncluttered for a digital clock overlay.The final design should feel modern, evocative, surprising, and visually striking.`;

const IMG_SIZE = "1024x1536"; // near 9:16
const IMG_QUALITY = process.env.IMG_QUALITY || "low"; // 'low', 'medium', 'high', and 'auto'
const CATBOX_ALBUM_SHORT = "ou6aoj" // CATBOX_ALBUM_SHORT code

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

  // 1) upload the file
  const uploadResp = await fetch("https://catbox.moe/user/api.php", {
    method: "POST",
    body: form,
    headers: form.getHeaders(),
  });
  const uploadText = (await uploadResp.text()).trim();
  const isUrl = /^https?:\/\//i.test(uploadText);

  if (!(uploadResp.ok && isUrl)) {
    if (/Anon Uploads are temporarily paused/i.test(uploadText)) {
      throw new Error("Catbox upload failed: anonymous uploads are paused and no valid userhash was used.");
    }
    throw new Error(`Catbox upload failed (status ${uploadResp.status}): ${uploadText}`);
  }

  const fileUrl = uploadText;

  // 2) if authenticated AND album short is set, add the uploaded file to the album
  if (userhash && CATBOX_ALBUM_SHORT) {
    try {
      const shortname = path.basename(new URL(fileUrl).pathname); // e.g. "abcdef.png"
      const albumForm = new FormData();
      albumForm.append("reqtype", "addtoalbum");
      albumForm.append("userhash", userhash);
      albumForm.append("short", CATBOX_ALBUM_SHORT);     // fixed album
      albumForm.append("files", shortname);              // space-separated list; single file here

      const albumResp = await fetch("https://catbox.moe/user/api.php", {
        method: "POST",
        body: albumForm,
        headers: albumForm.getHeaders(),
      });
      const albumText = (await albumResp.text()).trim();

      if (!albumResp.ok || /ERROR/i.test(albumText)) {
        throw new Error(`addtoalbum failed (${albumResp.status}): ${albumText}`);
      }
      console.log(`[catbox] Added ${shortname} to album ${CATBOX_ALBUM_SHORT}`);
    } catch (err) {
      // If album add fails, surface the error (you can downgrade to console.warn if you prefer non-fatal)
      throw err;
    }
  } else if (!userhash) {
    console.log("[catbox] No CATBOX_USERHASH; skipping album add.");
  } else if (!CATBOX_ALBUM_SHORT) {
    console.log("[catbox] No CATBOX_ALBUM_SHORT configured; skipping album add.");
  }

  return fileUrl;
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
