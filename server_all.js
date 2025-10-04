import express from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import { CloudClient } from "chromadb";
import fs from "fs";
import { DefaultEmbeddingFunction } from "@chroma-core/default-embed";

dotenv.config();

const app = express();
app.use(bodyParser.json());

// Load credentials
const CHROMA_API_KEY = process.env.CHROMA_API_KEY;
const CHROMA_TENANT = process.env.CHROMA_TENANT;
const CHROMA_DATABASE = process.env.CHROMA_DATABASE;

// Initialize Chroma Cloud client
const client = new CloudClient({
  apiKey: CHROMA_API_KEY,
  tenant: CHROMA_TENANT,
  database: CHROMA_DATABASE,
});

// Initialize default embedding function
const embedder = new DefaultEmbeddingFunction();

// Create or get Chroma collection
async function getCollection() {
  return await client.getOrCreateCollection({
    name: "intelligrid_docs",
    embeddingFunction: embedder,
  });
}

// Endpoint to add documents
app.post("/api/documents", async (req, res) => {
  try {
    const { documents, ids, metadatas } = req.body;

    if (!documents || !ids) {
      return res.status(400).json({
        error: "Missing 'documents' or 'ids' in request body",
      });
    }

    const collection = await getCollection();

    await collection.add({
      ids,
      documents,
      metadatas: metadatas || [],
    });

    res.json({
      message: "✅ Documents added successfully to Chroma Cloud",
      count: documents.length,
    });
  } catch (error) {
    console.error("Error adding document:", error);
    res.status(500).json({
      error: "Failed to add documents",
      details: error.message || error,
    });
  }
});

// Endpoint to fetch documents
app.get("/api/documents", async (req, res) => {
  try {
    const collection = await getCollection();

    const results = await collection.get();

    res.json({
      message: "📚 Documents fetched successfully from Chroma Cloud",
      ids: results.ids,
      documents: results.documents,
      metadatas: results.metadatas,
    });
  } catch (error) {
    console.error("Error fetching documents:", error);
    res.status(500).json({
      error: "Failed to fetch documents",
      details: error.message || error,
    });
  }
});

// Endpoint to query Chroma collection
app.post("/api/query", async (req, res) => {
  try {
    const { question } = req.body;

    if (!question) {
      return res.status(400).json({ error: "Question is required" });
    }

    const collection = await getCollection();

    const results = await collection.query({
      queryTexts: [question],
      nResults: 3, // top 3 matches
    });

    res.json({
      message: "✅ Query executed successfully",
      question,
      matches: results.documents[0],
      distances: results.distances[0],
    });
  } catch (error) {
    console.error("Error querying Chroma Cloud:", error);
    res.status(500).json({
      error: "Failed to query Chroma Cloud",
      details: error.message || error,
    });
  }
});

app.post("/chat", async (req, res) => {
  try {
    const { question } = req.body;
    if (!question) {
      return res.status(400).json({ error: "Question is required" });
    }

    const collection = await getCollection();

    // 1️⃣ Get top matching docs from Chroma Cloud
    const results = await collection.query({
      queryTexts: [question],
      nResults: 3,
    });

    const context = results.documents.flat().join("\n\n");

    // 2️⃣ Send context + question to LM Studio
    const lmRes = await fetch("http://localhost:1234/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "qwen2.5-vl-7b-instruct",
        messages: [
          {
            role: "system",
            content:
              "You are Intelligrid’s AI assistant. Use the given context to answer precisely and clearly.",
          },
          {
            role: "user",
            content: `Context:\n${context}\n\nQuestion: ${question}`,
          },
        ],
      }),
    });

    const data = await lmRes.json();
    const answer = data?.choices?.[0]?.message?.content || "No answer found.";

    res.json({
      question,
      context,
      answer,
    });
  } catch (error) {
    console.error("Error in /chat:", error);
    res.status(500).json({
      error: "Failed to get AI response",
      details: error.message || error,
    });
  }
});

const PORT = 5000;
app.listen(PORT, () =>
  console.log(`🚀 Server running at http://localhost:${PORT}`)
);
