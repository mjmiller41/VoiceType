import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API routes
  app.post("/api/punctuate", async (req, res) => {
    try {
      const { text, previousText } = req.body;
      if (!text) {
        return res.status(400).json({ error: "Text is required" });
      }

      const systemInstruction = `You are an AI that adds proper punctuation and capitalization to transcribed speech. 
Do not change the words, only add missing punctuation (periods, commas, question marks, etc.) and fix capitalization. 
Output ONLY the punctuated text, nothing else.`;

      let prompt = "";
      if (previousText) {
        prompt += `For context, the preceding text was: "${previousText}"\nContinue punctuating this new text appropriately, keeping in mind it might be a continuation of the previous sentence. DO NOT include the preceding text in your output.\n\nNew Text: ${text}`;
      } else {
        prompt += `Text: ${text}`;
      }

      let response;
      let retries = 3;
      while (retries > 0) {
        try {
          response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
              systemInstruction: systemInstruction,
              temperature: 0.1,
            }
          });
          break; // success
        } catch (err: any) {
          retries--;
          if (retries === 0) throw err;
          // Wait a bit before retrying
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      const punctuatedText = response.text?.trim() || text;
      res.json({ text: punctuatedText });
    } catch (error: any) {
      console.error("Error punctuating text:", error);
      res.status(500).json({ error: "Failed to punctuate text", details: error.message });
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
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
