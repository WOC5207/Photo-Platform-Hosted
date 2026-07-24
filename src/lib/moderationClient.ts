import "server-only";
import OpenAI from "openai";
import { config } from "./config";
import { MODERATION_MODEL, parseModerationResponse } from "./moderationPolicy";

let client: OpenAI | null = null;

function getClient(): OpenAI {
  const apiKey = config.openAiApiKey();
  if (!apiKey) throw new Error("OpenAI moderation is not configured");
  client ??= new OpenAI({ apiKey });
  return client;
}

export async function moderateImage(image: Buffer) {
  const response = await getClient().moderations.create(
    {
      model: MODERATION_MODEL,
      input: [
        {
          type: "image_url",
          image_url: {
            url: `data:image/webp;base64,${image.toString("base64")}`
          }
        }
      ]
    },
    { timeout: 30_000, maxRetries: 0 }
  );
  return parseModerationResponse(response);
}
