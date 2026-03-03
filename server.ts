import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import { createCanvas, registerFont } from "canvas";
import { ArabicReshaper } from "arabic-persian-reshaper";
import rtlDetect from "rtl-detect";

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Register a font for Arabic support if possible
// Note: In this environment, we might need to rely on system fonts or bundle one.
// For now, we'll try to use a generic serif/sans-serif.

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Route for rendering using FFmpeg
  app.post("/api/render", async (req, res) => {
    const { segments, id } = req.body;
    if (!segments || !id) {
      return res.status(400).json({ error: "Missing segments or id" });
    }

    try {
      const outputDir = path.resolve(__dirname, "public/renders");
      const tempDir = path.resolve(__dirname, `temp/${id}`);
      const outputLocation = path.join(outputDir, `${id}.mp4`);

      if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
      if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

      const width = 1080;
      const height = 1920;
      const fps = 30;
      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext("2d");

      let frameCount = 0;
      const framePaths: string[] = [];

      for (const segment of segments) {
        const durationFrames = Math.floor(segment.durationInSeconds * fps);
        
        for (let f = 0; f < durationFrames; f++) {
          // Draw background
          ctx.fillStyle = "#000000";
          ctx.fillRect(0, 0, width, height);

          // Calculate animation values (simple fade in/out)
          let opacity = 1;
          if (f < 10) opacity = f / 10;
          if (f > durationFrames - 10) opacity = (durationFrames - f) / 10;

          // Draw text
          ctx.globalAlpha = opacity;
          ctx.fillStyle = "white";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          
          // Simple responsive font size
          const fontSize = 55;
          ctx.font = `bold ${fontSize}px serif`; 
          
          // Reshape Arabic text
          const isRtl = rtlDetect.isRtlLang("ar");
          let processedText = segment.text;
          try {
            if (ArabicReshaper && typeof ArabicReshaper.reshape === 'function') {
              processedText = ArabicReshaper.reshape(segment.text);
            }
          } catch (e) {
            console.warn("Arabic reshaping failed, using raw text", e);
          }
          
          // Wrap text if needed
          const words = processedText.split(" ");
          let line = "";
          const maxWidth = width - 120;
          const lines = [];

          for (const word of words) {
            const testLine = line + word + " ";
            const metrics = ctx.measureText(testLine);
            if (metrics.width > maxWidth && line !== "") {
              lines.push(line);
              line = word + " ";
            } else {
              line = testLine;
            }
          }
          lines.push(line);

          const totalHeight = lines.length * fontSize * 1.4;
          let startY = (height - totalHeight) / 2 + fontSize / 2;

          for (const l of lines) {
            // For RTL, we might need to reverse the line or handle it specifically
            // but the reshaper + textAlign center usually handles it.
            ctx.fillText(l.trim(), width / 2, startY);
            startY += fontSize * 1.4;
          }

          const framePath = path.join(tempDir, `frame_${String(frameCount).padStart(5, "0")}.png`);
          const buffer = canvas.toBuffer("image/png");
          fs.writeFileSync(framePath, buffer);
          framePaths.push(framePath);
          frameCount++;
        }
      }

      // Use FFmpeg to combine frames
      await new Promise((resolve, reject) => {
        ffmpeg()
          .input(path.join(tempDir, "frame_%05d.png"))
          .inputFPS(fps)
          .outputOptions([
            "-c:v libx264",
            "-pix_fmt yuv420p",
            "-crf 23"
          ])
          .output(outputLocation)
          .on("end", resolve)
          .on("error", reject)
          .run();
      });

      // Cleanup temp frames
      fs.rmSync(tempDir, { recursive: true, force: true });

      res.json({ success: true, downloadUrl: `/api/download/${id}` });
    } catch (error: any) {
      console.error("Render error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/download/:id", (req, res) => {
    const { id } = req.params;
    const filePath = path.resolve(__dirname, `public/renders/${id}.mp4`);
    if (fs.existsSync(filePath)) {
      res.download(filePath);
    } else {
      res.status(404).json({ error: "File not found" });
    }
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
    app.get("*", (req, res) => {
      res.sendFile(path.resolve(__dirname, "dist/index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
