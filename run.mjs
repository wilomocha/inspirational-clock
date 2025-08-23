import OpenAI from "openai";
import fetch from "node-fetch";
import FormData from "form-data";
import fs from "fs/promises";
import path from "path";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const PROMPT = `Create a vertical 9:16 inspirational wallpaper. First, generate a short and uplifting inspirational sentence. Then, design an artistic background that expresses the feeling or meaning of that sentence in a creative and symbolic way. Place the sentence somewhere visually balanced, keeping the top-center area clear for a digital clock overlay. Style, imagery, and symbolism are open to interpretation, aiming for something imaginative and motivational.`;

const IMG_SIZE = "1024x1536"; // near 9:16

async function generateImage() {
  const res = await client.images.generate({
    model: "gpt-image-1",
    prompt: PROMPT,
    size: IMG_SIZE
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
})();
