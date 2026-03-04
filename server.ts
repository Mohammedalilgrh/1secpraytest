import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper: wrap Arabic text into lines (max chars per line)
function wrapText(text: string, maxCharsPerLine = 20): string[] {
  const words = text.trim().split(" ");
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    if ((currentLine + " " + word).trim().length > maxCharsPerLine) {
      if (currentLine) lines.push(currentLine.trim());
      currentLine = word;
    } else {
      currentLine = (currentLine + " " + word).trim();
    }
  }
  if (currentLine) lines.push(currentLine.trim());
  return lines;
}

// Helper: escape special characters for ffmpeg drawtext
function escapeFFmpeg(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/:/g, "\\:")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]");
}

// Build ffmpeg drawtext filter for one segment
function buildDrawtextFilter(
  text: string,
  startTime: number,
  endTime: number,
  videoHeight: number,
  videoWidth: number,
  fontSize: number
): string[] {
  const lines = wrapText(text, 18);
  const lineHeight = fontSize * 1.5;
  const totalTextHeight = lines.length * lineHeight;
  const startY = (videoHeight - totalTextHeight) / 2;

  const filters: string[] = [];

  lines.forEach((line, i) => {
    const y = startY + i * lineHeight;
    const escaped = escapeFFmpeg(line);

    // Fade in over 0.3s, fade out over 0.3s
    const fadeIn = `if(between(t,${startTime},${startTime + 0.3}),((t-${startTime})/0.3),1)`;
    const fadeOut = `if(between(t,${endTime - 0.3},${endTime}),((${endTime}-t)/0.3),1)`;
    const alpha = `if(between(t,${startTime},${endTime}),min(${fadeIn},${fadeOut}),0)`;

    filters.push(
      `drawtext=text='${escaped}':` +
      `fontsize=${fontSize}:` +
      `fontcolor=white:` +
      `x=(w-text_w)/2:` +
      `y=${Math.round(y)}:` +
      `alpha='${alpha}'`
    );
  });

  return filters;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // POST /api/render - render one video directly with ffmpeg drawtext
  app.post("/api/render", async (req, res) => {
    const { segments, id } = req.body;

    if (!segments || !id) {
      return res.status(400).json({ error: "Missing segments or id" });
    }

    try {
      const outputDir = path.resolve(__dirname, "public/renders");
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const outputPath = path.join(outputDir, `${id}.mp4`);

      const width = 1080;
      const height = 1920;
      const fps = 30;
      const fontSize = 80;

      // Calculate total duration
      const totalDuration = segments.reduce(
        (acc: number, s: { durationInSeconds: number }) => acc + s.durationInSeconds,
        0
      );

      // Build drawtext filters for all segments
      const drawtextFilters: string[] = [];
      let currentTime = 0;

      for (const segment of segments) {
        const startTime = currentTime;
        const endTime = currentTime + segment.durationInSeconds;

        const filters = buildDrawtextFilter(
          segment.text,
          startTime,
          endTime,
          height,
          width,
          fontSize
        );

        drawtextFilters.push(...filters);
        currentTime = endTime;
      }

      // Chain all filters
      const filterComplex = drawtextFilters.join(",");

      await new Promise<void>((resolve, reject) => {
        ffmpeg()
          // Generate black background video using lavfi
          .input(`color=c=black:size=${width}x${height}:rate=${fps}:duration=${totalDuration}`)
          .inputFormat("lavfi")
          .videoFilters(filterComplex)
          .outputOptions([
            "-c:v libx264",
            "-pix_fmt yuv420p",
            "-crf 23",
            "-preset fast",
          ])
          .output(outputPath)
          .on("start", (cmd) => console.log(`[ffmpeg] started: ${cmd}`))
          .on("progress", (p) => console.log(`[ffmpeg] progress: ${p.percent?.toFixed(1)}%`))
          .on("end", () => {
            console.log(`[ffmpeg] done: ${id}`);
            resolve();
          })
          .on("error", (err) => {
            console.error(`[ffmpeg] error: ${err.message}`);
            reject(err);
          })
          .run();
      });

      res.json({ success: true, downloadUrl: `/api/download/${id}` });

    } catch (error: any) {
      console.error("Render error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/render-bulk - render multiple videos sequentially
  app.post("/api/render-bulk", async (req, res) => {
    const { videos } = req.body;

    if (!videos || !Array.isArray(videos)) {
      return res.status(400).json({ error: "Missing videos array" });
    }

    // Start rendering in background, respond immediately
    res.json({ success: true, message: `Starting render of ${videos.length} videos` });

    for (const video of videos) {
      try {
        await fetch(`http://localhost:3000/api/render`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ segments: video.segments, id: video.id }),
        });
        console.log(`✅ Done: ${video.id}`);
      } catch (err) {
        console.error(`❌ Failed: ${video.id}`, err);
      }
    }

    console.log("🎉 All videos rendered!");
  });

  // GET /api/download/:id
  app.get("/api/download/:id", (req, res) => {
    const { id } = req.params;
    const filePath = path.resolve(__dirname, `public/renders/${id}.mp4`);

    if (fs.existsSync(filePath)) {
      res.download(filePath);
    } else {
      res.status(404).json({ error: "File not found" });
    }
  });

  // GET /api/renders - list all rendered videos
  app.get("/api/renders", (req, res) => {
    const outputDir = path.resolve(__dirname, "public/renders");
    if (!fs.existsSync(outputDir)) return res.json({ files: [] });

    const files = fs.readdirSync(outputDir)
      .filter(f => f.endsWith(".mp4"))
      .map(f => ({
        id: f.replace(".mp4", ""),
        downloadUrl: `/api/download/${f.replace(".mp4", "")}`,
        size: fs.statSync(path.join(outputDir, f)).size,
      }));

    res.json({ files });
  });

  // DELETE /api/renders - clean up all rendered videos
  app.delete("/api/renders", (req, res) => {
    const outputDir = path.resolve(__dirname, "public/renders");
    if (fs.existsSync(outputDir)) {
      fs.rmSync(outputDir, { recursive: true, force: true });
      fs.mkdirSync(outputDir, { recursive: true });
    }
    res.json({ success: true, message: "All renders deleted" });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, "dist")));
    app.get("*", (_req, res) => {
      res.sendFile(path.resolve(__dirname, "dist/index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`✅ Server running on http://localhost:${PORT}`);
  });
}

startServer();
