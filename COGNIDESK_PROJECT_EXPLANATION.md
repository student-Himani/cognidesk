# CogniDesk: Project Story & Technical Explanation

This document is your **go-to pitch manual** for software engineering, full-stack, and AI engineering interviews. It explains CogniDesk at every level of depth—from a 30-second elevator pitch to a granular 2-minute architectural walk-through—based strictly on what is implemented in the codebase.

---

## 1. Project Pitches (By Time Limit)

### 30-Second Elevator Pitch
> "CogniDesk is a **100% offline-first AI Document Intelligence & Knowledge Workspace**. It allows privacy-conscious individuals and regulated organizations to upload complex documents—including PDFs, Office files, and scanned images—extract text using local OCR, index semantic embeddings into ChromaDB, and interact with a local Large Language Model via Ollama. It features workspace isolation, document-grounded RAG with exact source citations, AI note generation, spaced-repetition flashcards, and persistent chat history—all operating without a single byte of data leaving the local machine."

---

### 1-Minute Recruiter / Technical Screen Pitch
> "CogniDesk solves the data privacy dilemma of modern AI: how can enterprise or healthcare professionals use document intelligence without leaking proprietary IP or confidential records to third-party cloud LLMs? 
>
> I architected CogniDesk as a decoupled, local-first system. The frontend is built in React 18, TypeScript, Tailwind CSS, and Redux Toolkit. The backend is an asynchronous FastAPI service in Python. 
> 
> When a user uploads a document or scanned receipt, our multi-format document pipeline extracts raw content using PyMuPDF, python-docx, and offline EasyOCR. The text is normalized, recursively chunked with overlap, and converted into 384-dimensional dense vectors using a local SentenceTransformer (`all-MiniLM-L6-v2`). Embeddings are indexed in ChromaDB with metadata filters, and all relational data—including workspace scoping, notes, flashcards, and conversation logs—is stored in SQLite. 
>
> When asking questions, our local RAG pipeline queries ChromaDB via cosine similarity, constructs a constrained prompt with retrieved context, and streams responses from an on-premise Ollama model (`qwen2.5:3b`) with interactive chunk citations."

---

### 2-Minute Deep Technical Walkthrough (Hiring Manager / System Design Round)
> "CogniDesk is an air-gapped, offline AI workspace designed to eliminate cloud dependency, API costs, and data exfiltration risks.
>
> **System Architecture & Data Tier**:
> - **Client**: React 18 SPA with TypeScript, Vite, Tailwind CSS, and Redux Toolkit. State management is organized into modular slices (documents, chat, knowledge base, UI, toast). An Axios interceptor automatically attaches the active `X-Workspace-Id` header from local storage to every API request.
> - **API Tier**: FastAPI utilizing Python type hints, Pydantic schemas, and SQLAlchemy ORM. Asynchronous background tasks handle heavy processing without blocking user requests.
> - **Storage Tier**: Dual-layer storage. Relational metadata, workspace boundaries, conversations, notes, and flashcard sets live in SQLite (`database/cognidesk.db`) with cascading foreign keys. High-dimensional vector embeddings reside in a persistent ChromaDB instance (`vector_db/`).
> - **Inference Engine**: Local Ollama server executing quantized models (such as `qwen2.5:3b`) on local CPU or GPU, with zero telemetry.
>
> **The Ingestion & Embedding Pipeline**:
> 1. When a user uploads a file (`.pdf`, `.docx`, `.pptx`, `.xlsx`, `.txt`, `.png`, `.jpg`), the file is saved to local disk storage with collision-proof naming.
> 2. An async background task triggers `DocumentProcessor.extract_and_process()`. If it's an image, local EasyOCR detects bounding boxes and text lines, calculating average confidence and pixel dimensions.
> 3. Cleaned text is passed to `EmbeddingEngine`, which performs recursive character chunking (1,000 characters with 150-character overlap).
> 4. Vectors are computed locally in batches using `all-MiniLM-L6-v2` and cached by SHA-256 hash.
> 5. Vectors, chunk text, and workspace metadata are upserted into ChromaDB, and the document status transitions to `Indexed`.
>
> **The Retrieval-Augmented Generation (RAG) Flow**:
> 1. In Document Chat mode, the user query is embedded into a 384-dimensional query vector.
> 2. ChromaDB queries top-K relevant chunks filtered strictly by `workspace_id`.
> 3. Cosine distances are converted into normalized percentage similarity scores.
> 4. A prompt template binds the retrieved chunks as authoritative context, explicitly instructing the model to cite sources and refuse speculative answers.
> 5. Ollama streams the response token-by-token back through a Server-Sent Event (SSE) / streaming endpoint, and both user prompt and assistant response are persisted to SQLite for activity history."

---

## 2. Problem Statement & Motivation

### Why Was CogniDesk Built?
1. **Privacy & Compliance**: Modern cloud AI services (OpenAI, Anthropic, Google Gemini) process documents on external servers. Enterprises, healthcare providers, lawyers, and financial auditors are prohibited from uploading confidential patient records, NDAs, or proprietary code to public clouds.
2. **Cost & Rate Limits**: Cloud embedding and LLM APIs charge per token. Heavy document analysis across thousands of pages creates continuous, unpredictable operational costs.
3. **Network Independence**: In defense, maritime, aviation, remote field sites, or secure air-gapped server rooms, internet access is unavailable or heavily restricted. CogniDesk runs 100% locally with zero internet connection required.

---

## 3. High-Level Architecture & End-to-End Flowcharts

### System Topology Diagram
```
+---------------------------------------------------------------------------------+
|                                CLIENT LAYER                                     |
|  React 18 + TypeScript + Vite + Tailwind CSS + Lucide Icons + Redux Toolkit     |
|                                                                                 |
|  [ Workspaces ]  [ Documents ]  [ Semantic Search ]  [ RAG Chat ]  [ Notes/Cards]
+---------------------------------------------------------------------------------+
                                      |
                      HTTP / JSON / SSE Streams
                      (Header: X-Workspace-Id)
                                      v
+---------------------------------------------------------------------------------+
|                                FASTAPI BACKEND                                  |
|  - CORS Middleware                - Dependency Injection (SessionLocal)         |
|  - Modular Routers (/api/v1)      - BackgroundTasks Worker Pool                 |
+---------------------------------------------------------------------------------+
          |                           |                             |
          v                           v                             v
+-------------------+      +----------------------+      +----------------------+
|  RELATIONAL STORE |      |     VECTOR STORE     |      |   LOCAL INFERENCE    |
|  SQLite (Local DB)|      | ChromaDB Collection  |      |   Ollama Runtime     |
|                   |      | (cognidesk_documents)|      |                      |
| - Workspaces      |      |                      |      | Model: qwen2.5:3b    |
| - Documents       |      | - 384-dim dense emb. |      | Protocol: HTTP / API |
| - Document Chunks |      | - Cosine similarity  |      | Streaming token gen  |
| - Notes           |      | - Metadata filtering |      | Fully offline        |
| - Flashcard Sets  |      |   (by workspace_id)  |      +----------------------+
| - Chat History    |      +----------------------+                 ^
+-------------------+                 ^                             |
          ^                           |                             |
          |                           +-----------------------------+
          v                                          RAG Context Injection
+---------------------------------------------------------------------------------+
|                            LOCAL PROCESSING SERVICES                            |
| - DocumentProcessor (PyMuPDF, python-docx, openpyxl, python-pptx, EasyOCR)      |
| - EmbeddingEngine (SentenceTransformers: all-MiniLM-L6-v2, 384 Dimensions)     |
| - SearchService (Semantic Vector Search + Keyword Full-Text Search)             |
| - RagService (Prompt Assembly, Citation Extraction, Stream Handler)             |
| - NotesService & FlashcardsService (Heuristic & AI Educational Generation)      |
+---------------------------------------------------------------------------------+
```

---

### Complete End-to-End Request Lifecycle Flowchart: Document Ingestion
```
[User selects Image / PDF]
            |
            v
[POST /api/v1/documents/upload]
            |
            +---> 1. Save binary file to disk (uploads/unique_filename.ext)
            +---> 2. Insert record into SQLite 'documents' table (status="uploaded")
            +---> 3. Dispatch BackgroundTask: process_document_background(doc_id)
            +---> 4. Return HTTP 201 Created to Client immediately
                            |
           (Background Task Executes Asynchronously)
                            v
[DocumentProcessor.extract_and_process(db, doc_id)]
            |
            +---> Check file extension (.png, .jpg, .pdf, .docx, etc.)
            +---> If Image: EasyOCR reads text bounding boxes + confidence
            +---> If PDF/Doc: PyMuPDF / docx extracts sequential text
            +---> Text Cleaning: NFKC normalization, strip null bytes, standardize CRLF
            +---> Update SQLite: status="processing" -> "processed", word_count, pages
                            |
                            v
[EmbeddingEngine.process_document_embedding(db, doc_id)]
            |
            +---> Recursive Character Chunking: 1000 char chunks, 150 char overlap
            +---> Generate 384-dim embeddings via local 'all-MiniLM-L6-v2' (CPU/GPU)
            +---> Bulk insert chunk records & vector arrays into SQLite 'document_chunks'
            +---> Update SQLite: status="embedded"
                            |
                            v
[VectorStorage.store_document_vectors(db, doc_id)]
            |
            +---> Prepare ChromaDB payload: chunk IDs, embeddings, text snippets
            +---> Attach metadata: workspace_id, document_id, filename, chunk_index
            +---> ChromaDB collection.upsert() into persistent vector store
            +---> Update SQLite: status="indexed"
                            |
                            v
[Frontend polls or receives auto-refresh]
Document row updates in real time -> Badges: 'Indexed', 'PNG', 'OCR', word count.
```

---

### Complete End-to-End Request Lifecycle Flowchart: RAG Document Chat
```
[User types question in Document Chat: "What does the invoice say?"]
            |
            v
[POST /api/v1/chat/message or /api/v1/rag/query]
            |
            +---> 1. Extract active workspace_id from X-Workspace-Id header
            +---> 2. SearchService.generate_query_embedding(query_text)
            |        (Encodes question into 384-dim vector using all-MiniLM-L6-v2)
            |
            +---> 3. ChromaDB Query:
            |        collection.query(
            |            query_embeddings=[query_vec],
            |            n_results=5,
            |            where={"workspace_id": active_workspace_id}
            |        )
            |
            +---> 4. Filter & Format Results:
            |        - Convert cosine distance to Similarity %
            |        - Format chunk text with Source badges [Source 1: invoice.png]
            |
            +---> 5. Prompt Construction (RagService):
            |        """
            |        You are CogniDesk Assistant. Answer using ONLY the context below:
            |        [Context: Chunk 1 from invoice.png...]
            |        Question: What does the invoice say?
            |        """
            |
            +---> 6. Forward to Local Ollama Runtime (http://127.0.0.1:11434/api/generate)
            |        Model: qwen2.5:3b
            |
            +---> 7. Stream tokens back to Client via HTTP chunked response
            |
            +---> 8. On stream completion:
                     - Save user message and AI response into SQLite 'chat_messages' table
                     - Store citation metadata (filename, chunk_index, similarity)
                     - Client renders interactive citations under the chat bubble.
```

---

## 4. Key Real-World Challenges Faced & Solutions Implemented

In your interview, **stories about solving difficult technical problems** carry the highest weight. Here are three genuine engineering challenges solved in CogniDesk:

### Challenge 1: The Missing Background Pipeline Method
- **Problem**: When triggering background processing, the endpoint called `document_processor.extract_and_process(db, doc_id)`. However, `DocumentProcessor` had only defined `process_file()`. This caused file uploads to quietly fail in the background without updating document text or chunks.
- **Root Cause**: An architectural mismatch between the background task dispatcher and the core extraction service.
- **Solution**: Implemented `extract_and_process()` in `DocumentProcessor`. It loads the `Document` model by ID from SQLite, marks the status as `"processing"`, invokes format-specific extraction, normalizes text using Unicode NFKC format, updates word and page counts, stores metadata JSON, transitions the status to `"processed"`, and commits the transaction before handing off to `EmbeddingEngine`.

### Challenge 2: Local OCR Without Internet or Heavy GPU Requirements
- **Problem**: Most OCR libraries attempt to download models from remote hubs on initialization, which crashes in an offline or air-gapped environment. Additionally, heavy OCR models cause out-of-memory errors on standard laptops without dedicated GPUs.
- **Solution**: Integrated **EasyOCR** with a lazy singleton loader. Specifically configured `download_enabled=False` to force loading pre-cached weights (`craft_mlt_25k.pth` and `english_g2.pth`) stored in the local user directory (`~/.EasyOCR/model/`). Configured PyTorch dynamic quantization on CPU to run detection and character recognition with low RAM footprint and high accuracy. Added detail level 1 to capture bounding boxes, average confidence, and image dimensions via Pillow.

### Challenge 3: Strict Workspace Isolation Across Relational and Vector Stores
- **Problem**: Users can create multiple workspaces (e.g., "Work" vs. "Personal"). In early builds, relational tables had `workspace_id`, but ChromaDB semantic searches retrieved chunks from *all* workspaces, causing cross-workspace data leakage in search results and RAG responses.
- **Solution**: 
  1. Updated `VectorStorage.store_document_vectors()` to ensure `workspace_id` is always embedded in every vector's metadata dictionary.
  2. Updated `SearchService._build_chroma_filter()` to automatically inject `{"workspace_id": int(active_workspace_id)}` into ChromaDB's `$and` boolean query filter.
  3. Added an Axios request interceptor in the frontend that attaches `X-Workspace-Id` to every HTTP request from `localStorage`, ensuring zero manual plumbing across individual UI pages.
  4. Verified with automated regression tests that Workspace B returns 0 hits when querying Workspace A's documents.

---

## 5. What Was Learned & Future Engineering Roadmap

### Key Learnings
1. **Local-first RAG requires careful token budgeting**: With smaller local models like `qwen2.5:3b`, prompt bloat degrades response quality. Chunking at 1,000 characters with 150 overlap and fetching top 3–5 chunks keeps context under 3,000 tokens, maximizing inference speed on CPU.
2. **Decoupled relational and vector stores need transactional synchronization**: Because ChromaDB does not support ACID transactions with SQLite, background pipelines must cleanly handle failure states: if vector storage fails, SQLite document status is set to `failed` with an explicit `error_message`.
3. **Lazy loading is essential for desktop resource management**: SentenceTransformers and EasyOCR readers consume significant memory. Loading them as class-level singletons on the first incoming request—rather than on application startup—keeps idle memory usage negligible.

### Roadmap (Clearly Marked Planned Features)
- **MCP (Model Context Protocol)**: Expose CogniDesk's search and document retrieval tools to external AI agents via Anthropic's MCP specification. *(Planned)*
- **Native Packaging**: Package the frontend and FastAPI backend into a single executable installer using **Tauri** or **Electron**. *(Planned)*
- **Hybrid Cloud Mode**: Optional toggle in Settings to route complex queries to remote models (OpenAI/Anthropic) while maintaining local storage. *(Planned)*
- **Automated CI/CD**: GitHub Actions workflow executing the pytest suite and headless Vite build on every pull request. *(Planned)*
