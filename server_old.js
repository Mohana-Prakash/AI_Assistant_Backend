import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import fs from "fs";

const app = express();
app.use(
  cors({
    origin: "*", // or your React app origin
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"],
  })
);

app.use(express.json());
const PORT = 5000;

// LM Studio endpoint
const LMSTUDIO_URL = "http://localhost:1234/v1/chat/completions";

// ChromaDB v2 endpoint
// 1. Load documents into ChromaDB (on server start)
const CHROMA_URL = "https://api.trychroma.com/api/v2";
const CHROMA_API_KEY = "ck-73K3YqoXMQs52GF3gSrJ3hTMzWvwjZvjtUcPyEVUenXS";
const CHROMA_TENANT = "3fa03512-4b6b-4603-bfb4-1884b003deb0";
const CHROMA_DATABASE = "carbon_qwest";

// Flag to indicate docs are loaded
let docsLoaded = false;

export async function loadDocs() {
  try {
    const content = fs.readFileSync("./docs/intelligrid.txt", "utf8");
    console.log("📄 Read intelligrid.txt successfully.");

    // Build Chroma CRN (tenant:database:collection)
    const collectionName = "intelligrid_docs";
    const crn = `${CHROMA_TENANT}:${CHROMA_DATABASE}:${collectionName}`;

    // 1️⃣ Create the collection
    const createRes = await fetch(`${CHROMA_URL}/collections`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CHROMA_API_KEY}`,
      },
      body: JSON.stringify({
        name: collectionName,
        tenant: CHROMA_TENANT,
        database: CHROMA_DATABASE,
      }),
    });

    const createText = await createRes.text();
    console.log("🧱 Create collection response:", createText);

    if (!createRes.ok) {
      console.warn("⚠️ Collection may already exist or failed to create.");
    }

    // 2️⃣ Add document using CRN format
    const addRes = await fetch(`${CHROMA_URL}/collections/${crn}/documents`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CHROMA_API_KEY}`,
      },
      body: JSON.stringify({
        ids: ["doc1"],
        documents: [content],
      }),
    });

    const addText = await addRes.text();
    console.log("📦 Add document response:", addText);

    if (!addRes.ok) {
      throw new Error(`Failed to add document: ${addText}`);
    }

    docsLoaded = true;
    console.log("✅ Intelligrid docs successfully loaded into ChromaDB Cloud");
  } catch (err) {
    console.error("❌ Failed to load docs:", err);
  }
}

// 2. Endpoint for chatbot query
// app.post("/chat", async (req, res) => {
//   if (!docsLoaded) {
//     return res
//       .status(503)
//       .json({ error: "Documents not yet loaded. Try again in a moment." });
//   }

//   const { question } = req.body;
//   if (!question) return res.status(400).json({ error: "Question is required" });

//   try {
//     // 2a. Query ChromaDB
//     const chromaRes = await fetch(
//       `${CHROMA_URL}/collections/intelligrid_docs/query`,
//       {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({
//           query_texts: [question],
//           n_results: 2,
//         }),
//       }
//     );

//     const chromaText = await chromaRes.text();
//     console.log("Raw ChromaDB response:", chromaText);

//     let chromaData;
//     try {
//       chromaData = JSON.parse(chromaText);
//     } catch (err) {
//       console.error("Error parsing ChromaDB response:", err);
//       return res.status(500).json({ error: "Invalid ChromaDB response" });
//     }

//     const context = (chromaData.documents || []).flat().join("\n").trim();
//     if (!context) {
//       return res
//         .status(200)
//         .json({ answer: "No relevant context found for your question." });
//     }

//     // 2b. Send to LM Studio
//     const lmRes = await fetch(LMSTUDIO_URL, {
//       method: "POST",
//       headers: { "Content-Type": "application/json" },
//       body: JSON.stringify({
//         model: "qwen2.5-vl-7b-instruct",
//         messages: [
//           {
//             role: "system",
//             content:
//               "You are Intelligrid's AI assistant. Answer only using the provided context.",
//           },
//           {
//             role: "user",
//             content: `Context:\n${context}\n\nQuestion: ${question}`,
//           },
//         ],
//       }),
//     });

//     const lmText = await lmRes.text();
//     console.log("Raw LM Studio response:", lmText);

//     let lmData;
//     try {
//       lmData = JSON.parse(lmText);
//     } catch (err) {
//       console.error("Error parsing LM Studio response:", err);
//       return res.status(500).json({ error: "Invalid LM Studio response" });
//     }

//     const answer =
//       lmData?.choices?.[0]?.message?.content ||
//       "Sorry, I could not generate an answer.";

//     res.json({ answer });
//   } catch (err) {
//     console.error("Unexpected error in /chat:", err);
//     res.status(500).json({ error: "Internal server error" });
//   }
// });

// Start server and load docs
app.listen(PORT, async () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  await loadDocs();
});
