import express from "express";
import cors from "cors";
import fs from "fs";
import dotenv from "dotenv";
import { CloudClient } from "chromadb";

dotenv.config();

const app = express();
app.use(
  cors({
    origin: "*",
  })
);
app.use(express.json());

const PORT = 5000;

// 🧠 Initialize Chroma Cloud client
const client = new CloudClient({
  apiKey: process.env.CHROMA_API_KEY,
  tenant: process.env.CHROMA_TENANT,
  database: process.env.CHROMA_DATABASE,
});

// 🔹 Helper function to get collection
async function getCollection() {
  return await client.getOrCreateCollection({ name: "intelligrid_docs" });
}

// 🔹 Load your local file into Chroma Cloud
app.post("/api/load-doc", async (req, res) => {
  try {
    const content = fs.readFileSync("./docs/intelligrid.txt", "utf8");
    const collection = await getCollection();

    // Delete the existing document if it exists
    await collection.delete({
      ids: ["doc1"],
    });

    // Add the updated document
    await collection.add({
      ids: ["doc1"],
      documents: [content],
      metadatas: [{ source: "local" }],
    });

    res.json({
      message: "✅ Document updated successfully in Chroma Cloud",
    });
  } catch (error) {
    console.error("Error loading document:", error);
    res.status(500).json({
      error: "Failed to load document",
      details: error.message,
    });
  }
});

// Upload content in chroma cloud
app.post("/api/upload-doc", async (req, res) => {
  try {
    const { id, content, source } = req.body;

    if (!id || !content) {
      return res.status(400).json({
        error: "Missing required fields: 'id' and 'content'",
      });
    }

    const collection = await collectionPromise;

    // Delete the existing document if it exists
    await collection.delete({
      ids: ["doc1"],
    });

    // Add or overwrite document in Chroma
    await collection.add({
      ids: [id],
      documents: [content],
      metadatas: [{ source: source || "admin" }],
    });

    res.json({
      message: "Document uploaded successfully to Chroma Cloud",
      id,
    });
  } catch (error) {
    console.error("Error uploading document:", error);
    res.status(500).json({
      error: "Failed to upload document",
      details: error.message,
    });
  }
});

// 🔹 Query Chroma Cloud
app.post("/api/query", async (req, res) => {
  try {
    const { question } = req.body;
    const collection = await getCollection();

    const results = await collection.query({
      queryTexts: [question],
      nResults: 3,
    });

    res.json({
      message: "✅ Query executed successfully",
      question,
      matches: results.documents.flat(),
      distances: results.distances.flat(),
    });
  } catch (error) {
    console.error("Error querying Chroma:", error);
    res.status(500).json({
      error: "Failed to query Chroma",
      details: error.message,
    });
  }
});

// 🔹 Connect to LM Studio (Qwen)
// Preload collection at startup// Preload collection at startup
const collectionPromise = getCollection();
// Simple in-memory cache: { questionText: answerText }
const questionCache = {};

app.post("/api/chat", async (req, res) => {
  try {
    const { question } = req.body;

    // Check if the question is already in cache
    if (questionCache[question]) {
      return res.json({
        question,
        answer: questionCache[question],
        context: "✅ Answer retrieved from cache",
        repeated: true,
      });
    }

    const collection = await collectionPromise;

    // Query top 1 document (faster if dataset is small)
    const results = await collection.query({
      queryTexts: [question],
      nResults: 1,
    });

    const context = results.documents.flat().join("\n\n");

    // LM Studio / local LLM prompt
    const lmRes = await fetch("http://localhost:1234/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gemma-3-1b-it-GGUF",
        messages: [
          {
            role: "system",
            content:
              "You are Intelligrid's AI assistant. Answer using the provided context when possible. If the context does not contain the answer, you may answer using your general knowledge. Do NOT mention 'context' or add extra information.",
          },
          {
            role: "user",
            content: `Here is the information:\n${context}\n\nQuestion: ${question}\nProvide a concise answer based only on the information above.`,
          },
        ],
      }),
    });

    const data = await lmRes.json();

    const answer =
      data?.choices?.[0]?.message?.content?.trim() ||
      "I do not have access to this information.";

    // Store in cache
    questionCache[question] = answer;

    res.json({ question, answer, context, repeated: false });
  } catch (error) {
    console.error("Error in /chat:", error);
    res.status(500).json({
      error: "Failed to get AI response",
      details: error.message,
    });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
