import { GoogleGenAI, Type } from "@google/genai";

export interface VideoScript {
  segments: {
    text: string;
    visualPrompt: string;
    durationInSeconds: number;
  }[];
}

export async function generateVideoScript(prompt: string): Promise<VideoScript> {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Create a professional, emotional Islamic short video script (9:16) in Arabic based on: "${prompt}".
    
    The script MUST follow this exact structure:
    1. Hook: An emotional approach that makes the audience want to complete the video.
    2. Transition: "تخيل.. ثانية واحدة من الذكر قد تغير حياتك" (Imagine.. 1 second of prayer might change your life).
    3. Core: A short, powerful prayer (Dua) that brings the audience's mindset closer to Allah.
    4. CTA: A reminder that sharing this video brings immense rewards (Sadaqah Jariyah) in heaven.

    Requirements:
    - Language: Arabic only.
    - Style: Emotional, calm, and spiritual.
    - Text: Short phrases (max 6 words per segment) for readability.
    - Total duration: 15-20 seconds.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          segments: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                text: { type: Type.STRING, description: "Arabic text to display on screen" },
                durationInSeconds: { type: Type.NUMBER, description: "Duration of this segment" },
              },
              required: ["text", "durationInSeconds"],
            },
          },
        },
        required: ["segments"],
      },
    },
  });

  return JSON.parse(response.text);
}
