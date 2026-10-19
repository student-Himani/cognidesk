# COGNIDESK INTERVIEW MASTER GUIDE
> **The Definitive End-to-End Technical & Architectural Reference**  
> *Target Roles: Full-Stack AI Engineer, Python/FastAPI Developer, Frontend/React Engineer, LLM/RAG Specialist*

---

## TABLE OF CONTENTS
1. [Project Introduction & Elevator Pitches](#1-project-introduction)
2. [Complete System Architecture & Flowcharts](#2-complete-system-architecture--flowcharts)
3. [Frontend Stack: React 18, TypeScript, Redux & Tailwind](#3-frontend-stack-react-18--typescript)
4. [Backend Stack: FastAPI, Python Async & Architecture](#4-backend-stack-fastapi--python)
5. [Database Architecture: SQLite, Schema, Migrations & Workspace Scoping](#5-database-architecture-sqlite)
6. [Vector Storage & Embeddings: ChromaDB & SentenceTransformers](#6-vector-storage--embeddings)
7. [RAG Pipeline & Hallucination Mitigation](#7-rag-pipeline--semantic-search)
8. [Local LLM & Inference Engine: Ollama & Qwen 2.5](#8-local-llm--inference-engine-ollama)
9. [Document Ingestion, Parsing & Offline OCR Engine](#9-document-ingestion--offline-ocr)
10. [AI Notes & Flashcards Engine](#10-ai-notes--flashcards-engine)
11. [Workspace Manager & Multi-Tenant Data Isolation](#11-workspace-manager--data-isolation)
12. [Chat & Activity History Architecture](#12-chat--activity-history-architecture)
13. [Knowledge Base Engine & Vector Collection Analytics](#13-knowledge-base-engine)
14. [Testing Suite, Methodologies & Quality Assurance](#14-testing-suite--qa)
15. [Security, Privacy & Reliability Hardening](#15-security--reliability)
16. [MCP (Model Context Protocol) — Implemented vs Planned](#16-mcp-model-context-protocol)
17. [CI/CD & Deployment Pipeline — Implemented vs Planned](#17-cicd--deployment-pipeline)
18. [Cloud AI & Online Mode — Implemented vs Planned](#18-cloud-ai--online-mode)
19. [Desktop Packaging & Electron/Tauri — Implemented vs Planned](#19-desktop-packaging--electrontauri)
20. [The 100 Most-Asked Interview Questions (Categorized & Prioritized)](#20-the-100-most-asked-interview-questions)
21. [Technical Cross-Examination & Grilling Scenarios](#21-technical-cross-examination--grilling)
22. [Real Practical Coding & Debugging Challenges](#22-real-practical-coding--debugging)
23. [Answer Mastery Framework (Senior vs Beginner + Follow-ups)](#23-answer-mastery-framework)
24. [Behavioral Project Story & Engineering Narrative](#24-behavioral-project-story)

---

## 1. PROJECT INTRODUCTION

### 30-Second Elevator Pitch
> *"CogniDesk is an enterprise-grade, 100% offline Personal AI Knowledge Hub and RAG workspace. It empowers researchers, doctors, lawyers, and engineers to ingest diverse unstructured documents—including PDFs, Word documents, Excel sheets, presentations, and scanned photos via on-device OCR—and immediately query them with cited local LLM inference, auto-generate structured notes, and build study flashcards. Because it executes entirely on the local machine using FastAPI, SQLite, ChromaDB, and local Ollama models, not a single byte of confidential proprietary data ever leaves the user's computer."*

### 1-Minute Pitch
> *"In sensitive industries like healthcare, finance, legal, and defense, teams are barred from using cloud AI tools like ChatGPT or Claude due to strict compliance, privacy regulations, and risk of data exfiltration. Yet these professionals need semantic document search, AI summaries, and automated study tools.*
>
> *I built CogniDesk to bridge this gap. CogniDesk is an offline-first desktop web platform with complete data sovereignty. The frontend is built in React 18, TypeScript, and Redux Toolkit. The backend runs on FastAPI and Python. Documents are ingested, normalized, and processed through PyMuPDF and EasyOCR. Extracted text is broken into overlapping chunks, embedded locally using SentenceTransformers into 384-dimensional dense vectors, and indexed in ChromaDB. For question answering, an offline RAG pipeline retrieves relevant document chunks and injects them into a local Ollama LLM (Qwen 2.5:3b) with grounded source citations.*
>
> *Everything is isolated within workspace boundaries in SQLite with ACID reliability, providing a high-speed, zero-leakage enterprise intelligence desktop."*

### 2-Minute Comprehensive Pitch
> *"CogniDesk solves the three biggest hurdles in enterprise AI adoption: privacy risk, vendor lock-in, and unpredictable latency/cost.*
>
> *First, **Privacy**: CogniDesk runs 100% locally. The embedding model `all-MiniLM-L6-v2` executes on CPU/GPU via PyTorch, OCR runs via local PyTorch/CRAFT models, vector storage runs on ChromaDB embedded engine, relational data resides in SQLite, and inference is executed on an offline Ollama runtime. The application functions flawlessly with Wi-Fi disabled.*
>
> *Second, **Multi-Workspace Isolation**: Professional users juggle multiple distinct matters (e.g., Patient Cases, Financial Audits, Client Projects). CogniDesk enforces strict multi-tenant workspace scoping across both the relational database (SQLite foreign keys with cascade deletions) and the vector store (ChromaDB metadata filters like `{"workspace_id": active_ws_id}`). Switching workspaces immediately filters vector analytics, chat histories, notes, flashcards, and search queries with zero data bleeding.*
>
> *Third, **Actionable Intelligence**: Beyond simple Q&A, CogniDesk features automated study and synthesis pipelines. It transforms documents into rich Markdown study notes and interactive flashcard decks with active-recall spaced repetition. Citations accompany every AI response down to the source file name and chunk index, effectively eliminating hallucinations.*
>
> *As the architect and developer, I designed the end-to-end stack: architecting the FastAPI routers and dependency injection, building the asynchronous RAG retrieval engine, implementing OCR fallback pipelines, structuring the normalized SQLite database schema, and developing the reactive React 18 UI with Redux and Axios interceptors."*

### Problem Statement
1. **Confidentiality & Compliance**: Uploading proprietary contracts, medical charts, or intellectual property to cloud LLMs violates GDPR, HIPAA, attorney-client privilege, and corporate NDAs.
2. **Hallucinations & Ungrounded Answers**: Standard LLMs hallucinate facts. Users need deterministic retrieval with transparent source citations.
3. **Information Fragmentation**: Documents are trapped in disparate formats (`.pdf`, `.docx`, `.xlsx`, `.pptx`, `.png`). Users need a unified search and synthesis layer.
4. **Internet Dependency**: In field operations, secure labs, airplanes, or low-connectivity zones, cloud AI fails completely.

### Architectural Rationale
| Layer | Choice | Why Chosen | What was Rejected & Why |
| :--- | :--- | :--- | :--- |
| **Frontend** | React 18 + TS + Tailwind | Component reusability, strict compile-time types, fast UI iteration, light bundle | Angular/Vue (heavier boilerplate, smaller local LLM ecosystem) |
| **State** | Redux Toolkit + Context | Redux for global entities (docs, chats, toast alerts); Context for scoped Workspace | Pure Zustand (Redux offers structured DevTools, time-travel debugging) |
| **Backend** | FastAPI + Python 3.11 | Native async I/O, auto OpenAPI docs, Pydantic type validation, deep AI library support | Flask/Django (Flask lacks async performance; Django is too bloated for microservices) |
| **Database** | SQLite + SQLAlchemy | Zero configuration, zero background daemon, file-portable, ACID compliant | PostgreSQL/MySQL (requires installing and managing a database server process) |
| **Vector DB**| ChromaDB (Local DuckDB/Parquet) | Embedded Python process, no client-server networking required, local persistence | Pinecone/Weaviate/Milvus (Pinecone is cloud-only; Milvus requires Docker daemon) |
| **Embeddings**| `all-MiniLM-L6-v2` | 384 dimensions, ~80MB footprint, sub-15ms inference on CPU, high semantic fidelity | OpenAI `text-embedding-3` (cloud dependency, data leakage) |
| **Local LLM** | Ollama (`qwen2.5:3b`) | Optimized GGUF/llama.cpp runtime, 4-bit quantization, fast streaming on laptops | Raw Transformers/vLLM (too heavy on VRAM, complex C++ dependencies) |
| **OCR** | EasyOCR (PyTorch CRAFT + ResNet) | 100% offline, cross-platform, handles rotated & noisy text, free of Tesseract path issues | Cloud Vision APIs (privacy violation) or Tesseract (poor Windows path reliability) |

---

## 2. COMPLETE SYSTEM ARCHITECTURE & FLOWCHARTS

### High-Level System Topology Diagram

```
+-----------------------------------------------------------------------------------------+
|                                    USER WORKSTATION                                     |
|                                                                                         |
|   +---------------------------------------------------------------------------------+   |
|   |                         CLIENT LAYER (React 18 + TS)                            |   |
|   |  - Router (React Router DOM v6)           - Global Store (Redux Toolkit)        |   |
|   |  - WorkspaceContext (Active WS Manager)   - Axios Interceptor (Injects Headers) |   |
|   +---------------------------------------+-----------------------------------------+   |
|                                           | HTTP / REST Calls                           |
|                                           v (Port 8000)                                 |
|   +---------------------------------------------------------------------------------+   |
|   |                     APPLICATION SERVER LAYER (FastAPI)                          |   |
|   |  - Middleware: CORS, Request Profiling, Error Boundary                          |   |
|   |  - Routers: Documents, Chat, RAG, Search, Notes, Flashcards, Workspaces, Health |   |
|   |  - Dependency Injection: get_db (SessionLocal), get_workspace_id                |   |
|   +----+--------------------+--------------------+--------------------+-------------+   |
|        |                    |                    |                    |                 |
|        v                    v                    v                    v                 |
|   +------------+     +---------------+     +---------------+     +------------------+   |
|   |  DOCUMENT  |     |  EMBEDDING    |     |  VECTOR DB    |     |  LOCAL INFERENCE |   |
|   | PROCESSOR  |     |    ENGINE     |     |  (ChromaDB)   |     | (Ollama Runtime) |   |
|   | PyMuPDF    |     | MiniLM-L6-v2  |     | Collection:   |     | Model:           |   |
|   | EasyOCR    |     | 384-dim dense |     | cognidesk_    |     | qwen2.5:3b       |   |
|   | docx/pptx  |     | torch runtime |     | documents     |     | HTTP:11434       |   |
|   +-----+------+     +-------+-------+     +-------+-------+     +--------+---------+   |
|         |                    |                     |                      |             |
|         +--------------------+----------+----------+                      |             |
|                                         |                                 |             |
|                                         v                                 v             |
|   +-------------------------------------------------------------+         |             |
|   |                   RELATIONAL PERSISTENCE                    |         |             |
|   |                 SQLite (database/cognidesk.db)              |         |             |
|   |  - workspaces         - documents         - document_chunks |         |             |
|   |  - conversations      - notes             - flashcards      |         |             |
|   +-------------------------------------------------------------+         |             |
|                                                                           |             |
+---------------------------------------------------------------------------+-------------+
```

### Flowchart 1: Document Ingestion & Vector Indexing Pipeline

```
[User Selects File (.pdf/.docx/.xlsx/.pptx/.png/.jpg)]
                     |
                     v
[Axios FormData POST /api/v1/documents/upload]
  * Interceptor appends header: X-Workspace-Id: 1
                     |
                     v
[FastAPI Documents Router]
  * Validates file extension, size <= 50MB
  * Saves physical file to uploads/
  * Creates DB Record in 'documents' table (status="uploaded")
                     |
                     v
[Document Processor Service]
  * If Image (.png/.jpg) -> EasyOCR extracts text via PyTorch
  * If PDF -> PyMuPDF (fitz) extracts text page-by-page
  * If Word/PPTX/Excel -> python-docx / python-pptx / openpyxl
  * Regex clean whitespace & control chars
  * DB Record updated (status="processed", word_count, page_count)
                     |
                     v
[Recursive Chunking Engine]
  * Chunk Size = 500 characters
  * Chunk Overlap = 50 characters
  * Preserves metadata: {document_id, workspace_id, chunk_index, filename}
  * Inserts rows into 'document_chunks' table
                     |
                     v
[Embedding Engine (SentenceTransformers)]
  * Model: all-MiniLM-L6-v2
  * Computes 384-dimensional dense float vector per chunk
                     |
                     v
[ChromaDB Vector Storage]
  * Upserts vectors into 'cognidesk_documents' collection
  * Stores metadata: {"workspace_id": 1, "doc_id": 14, "filename": "report.pdf"}
  * DB Record updated (status="embedded")
                     |
                     v
[Return HTTP 200 JSON with Document Metadata to UI]
```

### Flowchart 2: RAG (Retrieval-Augmented Generation) Chat Pipeline

```
[User Submits Prompt in Chat Interface]
                     |
                     v
[Axios POST /api/v1/rag/chat]
  * Body: { query, conversation_id, mode, selected_doc_id }
  * Header: X-Workspace-Id: 1
                     |
                     v
[FastAPI RAG Router & Service]
  * Check active workspace ID
  * Parse conversation history for context
                     |
                     v
[Embedding Engine]
  * Embed user query -> 384-dim query vector
                     |
                     v
[ChromaDB Vector Similarity Search]
  * Filter query:
      where = {"workspace_id": {"$eq": 1}} (if all docs)
      OR {"$and": [{"workspace_id": {"$eq": 1}}, {"document_id": {"$eq": 14}}]}
  * Cosine distance calculation
  * Retrieve Top-K (K=4) most relevant chunks
                     |
                     v
[Context Assembly & Prompt Injection]
  * Re-rank chunks by similarity score
  * Extract citations: [Source: filename, Page/Chunk: index]
  * Construct Grounded Prompt:
    "You are CogniDesk AI. Answer the question using ONLY the provided context:
     --- CONTEXT ---
     [Chunk 1 Text]
     [Chunk 2 Text]
     --- USER QUESTION ---
     [Query]
     If not in context, state you do not know."
                     |
                     v
[Ollama Local Inference Engine]
  * POST http://127.0.0.1:11434/api/generate
  * Stream tokens back to FastAPI
                     |
                     v
[FastAPI StreamingResponse (text/event-stream or chunked)]
  * Streams LLM tokens to React UI in real-time
                     |
                     v
[SQLite Conversation Update]
  * Appends user message and assistant reply (with citations)
  * Serializes messages list into 'conversations.messages_json'
  * Updates preview_text and updated_at
```

---

## 3. FRONTEND STACK: REACT 18 & TYPESCRIPT

### Component Hierarchy & Architecture
```
App.tsx
├── ThemeProvider (Dark / Light mode CSS variables)
├── WorkspaceProvider (Active workspace context & switching)
└── ReduxProvider (store: chat, documents, knowledge, toast, ui)
    └── BrowserRouter
        └── MainLayout
            ├── Sidebar (Navigation links, Workspace Dropdown, Recent Chats)
            ├── TopHeader (Active Workspace Pill, Status indicator, Quick Actions)
            └── Routes
                ├── / (DashboardPage)
                ├── /documents (DocumentsPage — upload, preview, chunk view)
                ├── /chat (ChatPage — dual mode: Normal vs Document RAG)
                ├── /search (SearchPage — semantic vs hybrid document search)
                ├── /notes (NotesPage — AI note generator & editor)
                ├── /flashcards (FlashcardsPage — spaced repetition quiz deck)
                ├── /knowledge (KnowledgeBasePage — collection vector stats)
                ├── /workspaces (WorkspaceManagerModal / page)
                └── /settings (SettingsPage — model selection, Ollama URL)
```

### State Management Strategy: Redux Toolkit vs Context API
A major interview talking point is **why both Redux Toolkit and Context API exist in this codebase**:
- **Context API (`WorkspaceContext`)**: Used for *environment-scoping* configuration that rarely changes rapidly but needs to be accessible everywhere, including Axios interceptors. It manages the list of workspaces, the currently active workspace, and triggers automatic re-fetching of workspace-scoped data.
- **Redux Toolkit (`store/`)**: Used for *high-frequency, entity-driven UI state*:
  - `documentsSlice`: Tracks uploading progress, file lists, chunk inspectors.
  - `chatSlice`: Active conversation messages, streaming tokens, citation popups.
  - `knowledgeSlice`: Real-time vector collection statistics, document distribution.
  - `toastSlice`: Global notification queue (errors, successes, warnings).
  - `uiSlice`: Sidebar collapse state, theme preferences, active modals.

### Axios Interceptors Architecture (`frontend/src/services/apiClient.ts`)
```typescript
// Request Interceptor: Injects X-Workspace-Id header automatically
apiClient.interceptors.request.use((config) => {
  config.headers['X-CogniDesk-Client'] = 'WebUI-v1.0';
  const activeWsId = localStorage.getItem('cognidesk_active_workspace_id');
  if (activeWsId) {
    config.headers['X-Workspace-Id'] = activeWsId;
  }
  // Multipart boundary safety
  if (config.data instanceof FormData) {
    delete config.headers['Content-Type'];
  } else if (!config.headers['Content-Type']) {
    config.headers['Content-Type'] = 'application/json';
  }
  return config;
});

// Response Interceptor: Global Error Dispatcher to Redux Toasts
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const message = error.response?.data?.detail || error.message || 'Network error';
    store.dispatch(addToast({ type: 'error', title: 'API Error', message }));
    return Promise.reject(error);
  }
);
```

---

## 4. BACKEND STACK: FASTAPI & PYTHON

### API Router Structure
CogniDesk uses clean modular routing under `/api/v1`:
- `/api/v1/health`: Liveness probe, Ollama connectivity status, ChromaDB health.
- `/api/v1/workspaces`: CRUD operations for workspace isolation and active status toggle.
- `/api/v1/documents`: File upload, PyMuPDF/EasyOCR extraction, chunk inspection, file deletion.
- `/api/v1/rag`: Workspace-filtered RAG chat generation and token streaming.
- `/api/v1/chat`: SQLite-backed conversation threads, history search, title rename, thread deletion.
- `/api/v1/search`: Vector semantic search with cosine similarity scoring.
- `/api/v1/notes`: AI note generation pipeline from vector document context.
- `/api/v1/flashcards`: AI study deck generator with JSON schema validation.
- `/api/v1/vector_db`: ChromaDB collection telemetry, chunk counting, workspace distribution.
- `/api/v1/embeddings`: Direct text vectorization debugging endpoints.

### FastAPI Dependency Injection
FastAPI's dependency injection (`Depends`) provides database sessions and workspace scoping safely:
```python
# Database Session Generator
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Workspace Resolver Header Dependency
def get_current_workspace_id(
    x_workspace_id: Optional[str] = Header(None),
    db: Session = Depends(get_db)
) -> int:
    if x_workspace_id and x_workspace_id.isdigit():
        return int(x_workspace_id)
    active_ws = db.query(Workspace).filter(Workspace.is_active == True).first()
    return active_ws.id if active_ws else 1
```

---

## 5. DATABASE ARCHITECTURE: SQLITE

### Complete Database Schema & Relationships

```
+----------------------------------------------------+
|                    WORKSPACES                      |
+----------------------------------------------------+
| * id          : INTEGER (PK, Autoincrement)        |
|   name        : VARCHAR(255), Indexed              |
|   description : TEXT, Nullable                     |
|   category    : VARCHAR(100), Default "General"    |
|   is_active   : BOOLEAN, Default False             |
|   created_at  : DATETIME                           |
|   updated_at  : DATETIME                           |
+-----------------+----------------------------------+
                  | 1
                  |
                  | Has Many (Cascade Delete)
                  |
                  +-----------------------+-----------------------+-----------------------+
                  |                       |                       |                       |
                  v N                     v N                     v N                     v N
+-----------------------------+  +-------------------+  +--------------------+  +----------------------+
|          DOCUMENTS          |  |   CONVERSATIONS   |  |       NOTES        |  |   FLASHCARD_DECKS    |
+-----------------------------+  +-------------------+  +--------------------+  +----------------------+
| * id         : INTEGER (PK) |  | * id : STR(PK)    |  | * id : INTEGER(PK) |  | * id : INTEGER(PK)   |
|   ws_id (FK) : INTEGER      |  |   ws_id(FK) : INT |  |   ws_id(FK) : INT  |  |   ws_id(FK) : INT    |
|   filename   : VARCHAR(UNIQ)|  |   title : STR     |  |   title : STR      |  |   title : STR        |
|   orig_name  : VARCHAR      |  |   mode : STR      |  |   category : STR   |  |   doc_id(FK) : INT   |
|   filepath   : VARCHAR      |  |   messages_json   |  |   content : TEXT   |  |   total_cards : INT  |
|   filetype   : VARCHAR      |  |   preview_text    |  |   doc_id(FK): INT  |  |   completed : INT    |
|   filesize   : INTEGER      |  |   message_count   |  |   doc_name : STR   |  +----------+-----------+
|   status     : VARCHAR      |  |   created_at      |  |   created_at       |             | 1
|   chunks     : INTEGER      |  |   updated_at      |  +--------------------+             | Has Many
|   word_count : INTEGER      |  +-------------------+                                     v N
|   extracted  : TEXT         |                                                 +----------------------+
|   metadata   : TEXT         |                                                 |      FLASHCARDS      |
+--------------+--------------+                                                 +----------------------+
               | 1                                                              | * id : INTEGER(PK)   |
               | Has Many                                                       |   deck_id(FK) : INT  |
               v N                                                              |   doc_id(FK) : INT   |
+-----------------------------+                                                 |   question : TEXT    |
|       DOCUMENT_CHUNKS       |                                                 |   answer : TEXT      |
+-----------------------------+                                                 |   topic : VARCHAR    |
| * id         : INTEGER (PK) |                                                 |   source_file : STR  |
|   doc_id(FK) : INTEGER      |                                                 |   chunk_idx : INT    |
|   chunk_index: INTEGER      |                                                 |   citation : STR     |
|   chunk_text : TEXT         |                                                 |   status : VARCHAR   |
|   start_char : INTEGER      |                                                 +----------------------+
|   end_char   : INTEGER      |
|   word_count : INTEGER      |
|   embed_model: VARCHAR      |
+-----------------------------+
```

### Table Definitions & Foreign Key Strategy
1. **`workspaces`**: Root tenant boundary.
2. **`documents`**: Tracks file lifecycle (`uploaded` → `processing` → `processed` → `embedding` → `embedded` → `failed`). Foreign key `workspace_id` has `ondelete="CASCADE"`.
3. **`document_chunks`**: Fine-grained text segments. Foreign key `document_id` has `ondelete="CASCADE"`.
4. **`conversations`**: Complete chat threads. Foreign key `workspace_id` has `ondelete="CASCADE"`. Full chat message history is serialized in `messages_json` column to avoid excessive JOIN operations during high-frequency chat streaming.
5. **`notes`**: AI-synthesized summaries. Foreign key `workspace_id` has `ondelete="CASCADE"`, `document_id` has `ondelete="SET NULL"` so notes persist even if the source document is removed.
6. **`flashcard_decks` & `flashcards`**: Study cards linked to workspace and source document with cascade deletion.
7. **`search_history`**: Query telemetry log tracking search modes, filters, and execution latencies.

---

## 6. VECTOR STORAGE & EMBEDDINGS

### Embedding Model Specs
- **Model**: `sentence-transformers/all-MiniLM-L6-v2`
- **Embedding Dimensions**: **384 dimensions** (dense float32 vectors)
- **Max Input Sequence Length**: 256 tokens (~1,000 characters)
- **Cosine Similarity Metric**: Vectors are L2-normalized upon generation so dot product equals cosine similarity:
$$\text{Cosine Similarity} = \frac{A \cdot B}{\|A\| \|B\|} = \sum_{i=1}^{384} A_i B_i$$
- **ChromaDB Space**: Configured with `"hnsw:space": "cosine"`.

### Chunking Strategy & Math
- **Chunk Size**: 500 characters
- **Chunk Overlap**: 50 characters (10% sliding window)
- **Rationale**: 500 characters corresponds to approximately 80–100 English words (2–3 sentences). This fits well within the 256-token limit of MiniLM without truncation, while retaining enough coherent semantic context. The 50-character overlap prevents sentences from being bisected across chunk boundaries.

---

## 7. RAG PIPELINE & HALLUCINATION CONTROL

### End-to-End RAG Mechanics
1. **User Query Vectorization**: User types `"What is the refund policy?"`. SentenceTransformers converts this into a 384-dimensional vector.
2. **Filtered Top-K Retrieval**: ChromaDB performs an Approximate Nearest Neighbor (HNSW) search filtered strictly by active `workspace_id`. Top $K=4$ chunks are returned with cosine distance scores $d$.
3. **Similarity Score Calculation**: ChromaDB returns cosine distance $d \in [0, 2]$. CogniDesk converts this to a similarity percentage:
$$\text{Similarity Score} = \max(0, 1 - d) \times 100\%$$
4. **Prompt Construction**:
```text
SYSTEM: You are CogniDesk AI, a helpful, precise document assistant.
You must answer the user's question using ONLY the provided document context.
If the context does not contain the answer, reply: "I cannot find this in the documents."
Do not speculate or extrapolate.

CONTEXT:
[Document: policy.pdf | Chunk: 3]
Refunds must be requested within 30 days of purchase with original receipt.
[Document: policy.pdf | Chunk: 4]
Software licenses are non-refundable once activated.

QUESTION: What is the refund policy?
```
5. **Deterministic Citation**: Every chunk ID is tracked. When the model responds, the UI highlights citations linking back to `policy.pdf (Chunk #3)`.

---

## 8. LOCAL LLM & INFERENCE ENGINE: OLLAMA

### Inference Engine Topology
- **Runtime**: Ollama daemon listening at `http://127.0.0.1:11434`.
- **Default Model**: `qwen2.5:3b` (Alibaba Cloud Qwen 2.5 3-Billion Parameter instruction-tuned model, 4-bit quantized GGUF).
- **Why Qwen 2.5 3B?**:
  1. Exceptional multilingual understanding and reasoning benchmarked above Llama-3.2-3B.
  2. Runs within ~2.2 GB VRAM on GPU or ~3 GB RAM on CPU.
  3. High-speed generation (>35 tokens/sec on Apple Silicon or modern Intel/AMD laptops).
- **Failure Handling**:
  If Ollama is not running, CogniDesk catches `httpx.ConnectError` and returns a structured error:
  `"Ollama is unreachable at 127.0.0.1:11434. Please run 'ollama serve' in your terminal."`

---

## 9. DOCUMENT INGESTION & OFFLINE OCR

### Supported Formats & Parsers
- **PDF**: PyMuPDF (`fitz`) — high-performance C-backed extraction of native text, fonts, and bounding boxes.
- **DOCX**: `python-docx` — parses document body paragraphs and XML table cells.
- **XLSX**: `openpyxl` — extracts tabular records row-by-row into formatted text.
- **PPTX**: `python-pptx` — extracts text boxes from presentation slides.
- **Images (`.png`, `.jpg`, `.jpeg`, `.bmp`)**: **EasyOCR** (PyTorch CRAFT character detection + ResNet recognition). 100% offline, bundled locally, no internet ping, no external Tesseract path dependency.

---

## 10. AI NOTES & FLASHCARDS ENGINE

### Structured Generation Pipeline
Instead of free-form conversation, Notes and Flashcards require structured output:
1. **Context Assembly**: Retrieves the top relevant chunks for a given topic or document.
2. **Schema-Constrained Prompting**: Requests Ollama to output strict JSON arrays:
```json
[
  {
    "question": "What is the retention period for clinical audit logs?",
    "answer": "Logs must be retained for exactly 7 years under Section 4.",
    "topic": "Compliance",
    "citation": "compliance_guide.pdf (Chunk #12)"
  }
]
```
3. **JSON Repair & Validation**: Backend uses robust regex extraction to strip markdown code fences (` ```json `), validates fields with Pydantic, and saves records into SQLite `flashcards` and `notes` tables.

---

## 11. WORKSPACE MANAGER & MULTI-TENANT DATA ISOLATION

### Dual-Layer Isolation Architecture
Data isolation is enforced at two distinct tiers:
1. **Relational Tier (SQLite)**:
   All records (`documents`, `document_chunks`, `conversations`, `notes`, `flashcard_decks`) carry a foreign key `workspace_id REFERENCES workspaces(id) ON DELETE CASCADE`. If Workspace 2 is deleted, all its associated documents, chats, and notes are atomically purged by the database engine.
2. **Vector Tier (ChromaDB)**:
   ChromaDB queries use strict metadata dictionary filters:
   `collection.query(query_embeddings=[vec], where={"workspace_id": active_ws_id})`.
   Even if chunks from multiple workspaces reside in the same ChromaDB collection, Workspace A can never retrieve or see vectors from Workspace B.

---

## 12. CHAT & ACTIVITY HISTORY ARCHITECTURE

### Relational Persistence & JSON Hybrid Model
Earlier prototypes relied on in-memory storage or local file caches (`redis_chat_store.json`). In Module 18, this was unified into SQLite:
- **`conversations` Table**:
  - `id`: Unique string UUID.
  - `workspace_id`: Foreign key ensuring multi-tenant isolation.
  - `title`: User-editable conversation title.
  - `mode`: `"normal"` (general knowledge) or `"document"` (RAG grounded).
  - `selected_doc_id`: Scoped to a specific document or `"all"`.
  - `messages_json`: Serialized JSON array containing all messages, timestamps, and citation metadata.
  - `preview_text`: First 200 characters of latest message for search indexing.

---

## 13. KNOWLEDGE BASE ENGINE

### Real-Time Vector Analytics
The Knowledge Base page does not use mock data. It calls `/api/v1/vector_db/stats` which queries:
1. **ChromaDB Collection Count**: Real-time count of total vector embeddings in `cognidesk_documents`.
2. **SQLite Document Count**: Real-time count of documents scoped to the active workspace.
3. **Chunk Distribution**: Chunks per document breakdown.
4. **Active Embedding Model**: Confirms `all-MiniLM-L6-v2` with 384 dimensions.

---

## 14. TESTING SUITE & QA

### Implemented Pytest Test Matrix
The test suite in `tests/` verifies every backend service independently:
- `test_backend_init.py`: Confirms FastAPI app creation, CORS headers, and routes.
- `test_workspaces.py`: Tests workspace CRUD, active toggling, and cascading deletion.
- `test_embedding_engine.py`: Verifies 384-dimension vector output, normalization, and cosine distance math.
- `test_vector_storage.py`: Validates ChromaDB upsert, query, and metadata filtering.
- `test_rag_pipeline.py`: Validates prompt assembly, context truncation, and citations.
- `test_offline_ocr.py`: Tests image ingestion, text extraction, and vectorization without internet.
- `test_chat_history_sqlite.py`: Verifies conversation creation, message persistence, rename, and workspace scoping.
- `test_knowledge_base_stats.py`: Confirms real stats isolation across Workspace A and Workspace B.

---

## 15. SECURITY & RELIABILITY

### Defense-in-Depth Measures
1. **Path Traversal Protection**: Uploaded files are sanitized; file paths are resolved relative to strict upload directories using `os.path.basename` and UUID renaming.
2. **File Extension Whitelisting**: Strict validation rejects `.exe`, `.bat`, `.sh`, `.py`, `.dll`.
3. **Prompt Injection Mitigation**: Context is clearly delineated using markdown delimiters (`--- BEGIN CONTEXT ---`, `--- END CONTEXT ---`). System instructions forbid the LLM from obeying instructions inside document chunks.
4. **Data Sovereignty**: Zero outbound internet calls. No external telemetry, tracking, or cloud APIs.

---

## 16. MCP (MODEL CONTEXT PROTOCOL)

### Implementation Status: PLANNED
> **Current Status**: **PLANNED** (Not yet implemented in current production code).
>
> **Architecture Plan**: Anthropic's Model Context Protocol (MCP) will allow CogniDesk to act as an MCP Client or Server, exposing local document search as an MCP Tool to external desktop agents (e.g., Claude Desktop).
>
> **Likely Interview Questions**:
> - *Q: What is MCP and why would CogniDesk use it?*
>   *A: MCP is an open standard that connects AI models to external data sources. Implementing an MCP server in CogniDesk would allow any MCP-compliant client to securely query CogniDesk's local vector index without building custom plugins.*

---

## 17. CI/CD & DEPLOYMENT PIPELINE

### Implementation Status: PLANNED
> **Current Status**: **PLANNED** (Codebase is validated locally via `pytest` and `npm run build`).
>
> **Planned Architecture**:
> - GitHub Actions workflow triggering on pull requests:
>   1. **Frontend Job**: Node.js 18 setup, `npm ci`, `npm run lint`, `npm run build`.
>   2. **Backend Job**: Python 3.11 setup, `pip install -r requirements.txt`, `flake8/ruff`, `pytest --cov=app tests/`.
>   3. **Matrix Testing**: Test across Ubuntu and Windows runners.

---

## 18. CLOUD AI & ONLINE MODE

### Implementation Status: PLANNED
> **Current Status**: **PLANNED** (Current implementation is 100% offline via local Ollama).
>
> **Planned Architecture**:
> - Hybrid Provider Interface: An abstract base class `LLMProvider` with implementations `OllamaProvider` (offline) and `OpenAICompatibleProvider` (cloud: OpenAI, Anthropic, Groq).
> - User toggle in Settings: Allows users who do not have a dedicated GPU to optionally provide an API key for faster cloud inference, while warning them about external data transmission.

---

## 19. DESKTOP PACKAGING & ELECTRON/TAURI

### Implementation Status: PLANNED
> **Current Status**: **PLANNED** (Currently runs as a local web app with Vite frontend on port 5173 and FastAPI backend on port 8000).
>
> **Planned Architecture**:
> - Packaging with **Tauri** (preferred over Electron for low memory footprint and Rust security) or **Electron**.
> - The native wrapper bundles the compiled frontend, spawns the FastAPI Uvicorn server as a sidecar process, and bundles a lightweight Ollama binary.

---

## 20. THE 100 MOST-ASKED INTERVIEW QUESTIONS

### Category 1: Beginner / Core Fundamentals (1–20)
1. What is CogniDesk and what primary problem does it solve?
2. What does RAG stand for, and why is it preferred over retraining an LLM?
3. What is an embedding in the context of Natural Language Processing?
4. What is the dimension of the embedding vectors used in CogniDesk?
5. Why do we chunk documents before indexing them in a vector database?
6. What is the role of ChromaDB in this application?
7. How does SQLite differ from a client-server database like PostgreSQL?
8. What is FastAPI and why is it well-suited for AI backend services?
9. What is React 18 and how does it manage UI rendering?
10. What is TypeScript and what advantages does it offer over plain JavaScript?
11. What is Ollama and how does it execute LLMs locally?
12. What does cosine similarity measure in vector search?
13. What happens if a user searches for a term that does not appear verbatim in the document?
14. What is OCR and which library does CogniDesk use for offline image OCR?
15. What are props and state in React?
16. What is Redux Toolkit and why is it used alongside React?
17. What is an Axios interceptor?
18. What is CORS and why do we configure CORSMiddleware in FastAPI?
19. What is Pydantic and how is it used in FastAPI?
20. What is the purpose of database migrations?

### Category 2: Intermediate Full-Stack & System Flow (21–40)
21. Walk me through what happens under the hood when a user uploads a PDF file.
22. How does the backend extract text from a scanned photo versus a digital PDF?
23. Explain the math and purpose behind chunk size (500) and chunk overlap (50).
24. How does CogniDesk prevent vector queries in Workspace A from leaking into Workspace B?
25. Explain the role of foreign keys and `ondelete="CASCADE"` in our SQLite schema.
26. How does the frontend know which workspace is active, and how is this communicated to the backend?
27. Why do we store chat messages as a serialized JSON blob in `conversations.messages_json`?
28. How does the backend calculate the similarity percentage from ChromaDB's cosine distance?
29. How does the flashcard generation pipeline ensure Ollama returns valid JSON?
30. What happens if the Ollama server crashes or is not running when a user sends a prompt?
31. How does PyMuPDF extract text, and how does it handle multi-page documents?
32. What is HNSW indexing in vector databases?
33. How does the React frontend maintain responsive UI during streaming AI responses?
34. Explain the difference between React Context and Redux Toolkit in this project.
35. What is the purpose of the `toastSlice` in Redux?
36. How does CogniDesk handle file deletion across both SQLite and ChromaDB?
37. What is the lifecycle of a document status in the database (`uploaded` to `embedded`)?
38. Why does the embedding engine normalize vectors to unit length?
39. How do we test the backend without launching the full frontend browser?
40. How does the Knowledge Base page display real collection analytics?

### Category 3: Advanced AI, Embeddings & RAG Architecture (41–60)
41. What are the key failure modes of RAG pipelines, and how does CogniDesk mitigate them?
42. What is "Lost in the Middle" phenomenon in LLM context windows, and how does CogniDesk address it?
43. Compare Bi-encoders (e.g., MiniLM) with Cross-encoders for retrieval.
44. Why did you choose `qwen2.5:3b` over `llama-3.2:3b` or `mistral:7b`?
45. How would you implement hybrid search (BM25 lexical + dense vector) in this architecture?
46. What is prompt injection, and how does CogniDesk prevent malicious documents from hijacking the LLM?
47. What is GGUF quantization (Q4_K_M) and how does it reduce VRAM consumption?
48. How do token limits affect context injection when multiple long chunks are retrieved?
49. What is semantic drift and how does chunk overlap help preserve context?
50. How does EasyOCR perform text detection and recognition under the hood?
51. What is the difference between Euclidean distance, dot product, and cosine similarity?
52. How does ChromaDB persist vector embeddings to disk?
53. What is Temperature in LLM generation, and what value is appropriate for RAG document Q&A?
54. How can you detect and measure hallucinations in an offline RAG system?
55. Explain the trade-off between chunk size and retrieval precision.
56. How does the system handle non-English documents during embedding and RAG?
57. What are the memory implications of loading PyTorch models directly inside a FastAPI process?
58. How would you implement query re-writing or query expansion in CogniDesk?
59. What is the role of citations in human verification of RAG responses?
60. How does the system handle tables in Word and Excel documents during chunking?

### Category 4: "Why X and Not Y?" Architectural Decisions (61–75)
61. Why SQLite instead of PostgreSQL or MySQL?
62. Why ChromaDB instead of Pinecone or Milvus?
63. Why `all-MiniLM-L6-v2` instead of OpenAI `text-embedding-3-small`?
64. Why local Ollama instead of calling the Anthropic or OpenAI API?
65. Why EasyOCR instead of Tesseract OCR?
66. Why React with TypeScript instead of plain JavaScript or Vue?
67. Why Tailwind CSS instead of CSS Modules or Material UI?
68. Why Redux Toolkit instead of Zustand or Recoil?
69. Why FastAPI instead of Flask or Django?
70. Why PyMuPDF instead of PyPDF2 or PDFMiner?
71. Why on-device AI instead of a secure private cloud VPC?
72. Why store chat history in SQLite instead of purely inside browser `localStorage`?
73. Why 500-character chunks instead of 2000-character chunks?
74. Why cosine distance instead of L2/Euclidean distance for embeddings?
75. Why keep the backend and frontend as separate services rather than a monolithic Next.js app?

### Category 5: Edge Cases, Failure Modes & System Recovery (76–85)
76. What happens if a user uploads a 500-page scanned legal contract?
77. What happens if two users run CogniDesk simultaneously on the same local port?
78. How does the system handle an uploaded file with corrupted or unreadable text?
79. What happens if the local disk runs out of storage during vector upsert?
80. What happens if the user deletes a workspace while an embedding job is running?
81. How does the application recover if SQLite encounters a database lock?
82. What happens if an image uploaded for OCR contains handwriting instead of typed text?
83. How does the system handle emojis and special Unicode characters in document chunks?
84. What happens if Ollama takes longer than 60 seconds to generate a response?
85. How does CogniDesk prevent duplicate file uploads?

### Category 6: Performance, Scaling & Memory Optimization (86–95)
86. How would you scale CogniDesk to support 100,000 documents?
87. How would you optimize the embedding throughput if a user uploads 50 documents at once?
88. How can you minimize memory consumption of the Python backend on low-spec laptops?
89. How does Vite optimize the production build compared to Webpack?
90. What caching mechanisms could be introduced to avoid re-embedding identical documents?
91. How does ChromaDB's HNSW index balance search recall versus latency?
92. How would you transition CogniDesk from single-user desktop to multi-user enterprise server?
93. How would you implement background job processing using Celery or Redis queues?
94. How does Python's GIL (Global Interpreter Lock) affect multi-threaded embedding generation?
95. How would you profile memory leaks in a long-running FastAPI backend?

### Category 7: Real Bugs Overcome & Offline Verification Proof (96–100)
96. Describe a real architectural challenge you solved during Module 18 (Chat History).
97. How did you verify that CogniDesk functions 100% offline without any internet connection?
98. What bug did you encounter during OCR image processing and how did you resolve it?
99. How did you resolve the Knowledge Base statistics discrepancy across workspaces?
100. If you had an additional month to work on CogniDesk, what top three features would you build?

---

## 21. TECHNICAL CROSS-EXAMINATION & GRILLING SCENARIOS

### Scenario 1: The Vector Multi-Tenancy Grilling
- **Interviewer**: *"You say CogniDesk has workspaces that isolate data. But ChromaDB is a single embedded database file. If Workspace 1 and Workspace 2 both store documents in the same ChromaDB collection, aren't you risking severe data leakage?"*
- **Candidate Answer**:
  - **Strong Answer**: *"That was a primary architectural concern during development. While all vectors reside in the `cognidesk_documents` collection, every single vector is tagged with strict metadata: `{'workspace_id': active_ws_id, 'document_id': doc_id}`. In our `VectorStorage` service, every retrieval query mandates a metadata filter: `collection.query(query_embeddings=[...], where={'workspace_id': {'$eq': active_ws_id}})`.
  Furthermore, in our integration tests (`test_knowledge_base_stats.py`), we explicitly ingest documents into Workspace 1 and Workspace 2 and verify that querying Workspace 2 returns zero chunks from Workspace 1. On deletion, our service executes `collection.delete(where={'workspace_id': ws_id})`, guaranteeing complete vector purging."*
  - **Beginner Summary**: *"Every chunk has a label with its workspace ID. When we search, we tell ChromaDB: 'Only look at chunks with this exact workspace ID'. So Workspace 1 never sees Workspace 2."*
  - **Possible Follow-up**: *"Why not create a separate ChromaDB collection for each workspace?"*
  - **Follow-up Answer**: *"Creating dynamic collections introduces filesystem descriptor overhead and slows down workspace creation. Using metadata filtering within a unified collection scales efficiently to hundreds of workspaces while keeping initialization instantaneous."*

### Scenario 2: The Hallucination Grilling
- **Interviewer**: *"LLMs are notorious for hallucinating. If a doctor uses CogniDesk to query clinical trial results, how can you guarantee the model doesn't invent treatments?"*
- **Candidate Answer**:
  - **Strong Answer**: *"We mitigate hallucinations through a 4-tiered defense:
    1. **Strict Context-Bounded Prompting**: Our system prompt explicitly instructs the LLM: *'You are CogniDesk AI. Answer using ONLY the facts provided in the context below. If the answer cannot be deduced from the context, state clearly that you do not know.'*
    2. **Low Temperature**: We set generation temperature to `0.1` to enforce deterministic, fact-grounded output.
    3. **Mandatory Citations**: Every generated statement is paired with clickable citations indicating source filename and chunk index.
    4. **Top-K Distance Filtering**: If the cosine similarity of the retrieved chunks falls below a relevance threshold (e.g. < 40%), the system notifies the user that no relevant documents were found rather than sending irrelevant context to the LLM."*
  - **Beginner Summary**: *"We tell the AI it is only allowed to look at the provided document pages and must say 'I don't know' if it's not there. We also show the exact page and chunk it got the answer from."*

---

## 22. REAL PRACTICAL CODING & DEBUGGING CHALLENGES

### Challenge 1: Write the Core Chunking & Overlap Function in Python
```python
def chunk_text(text: str, chunk_size: int = 500, chunk_overlap: int = 50) -> list[dict]:
    """
    Splits text into overlapping sliding-window character chunks.
    Ensures no infinite loops and captures trailing characters.
    """
    if not text or chunk_size <= 0:
        return []
    
    chunks = []
    start = 0
    text_len = len(text)
    step = chunk_size - chunk_overlap
    
    chunk_index = 0
    while start < text_len:
        end = min(start + chunk_size, text_len)
        chunk_slice = text[start:end].strip()
        
        if chunk_slice:
            chunks.append({
                "chunk_index": chunk_index,
                "chunk_text": chunk_slice,
                "start_char": start,
                "end_char": end,
                "word_count": len(chunk_slice.split())
            })
            chunk_index += 1
            
        if end >= text_len:
            break
        start += step
        
    return chunks
```

### Challenge 2: SQL Query to Find Top 5 Documents by Chunk Count in Active Workspace
```sql
SELECT 
    d.id,
    d.filename,
    d.filetype,
    COUNT(c.id) AS total_chunks,
    SUM(c.word_count) AS total_words
FROM documents d
LEFT JOIN document_chunks c ON d.id = c.document_id
WHERE d.workspace_id = :active_ws_id AND d.status = 'embedded'
GROUP BY d.id, d.filename, d.filetype
ORDER BY total_chunks DESC
LIMIT 5;
```

---

## 23. ANSWER MASTERY FRAMEWORK

To excel in technical interviews, use this 4-step response formula:
1. **Direct Answer (High-Level Architecture)**: State the exact technology and principle in 1 sentence.
2. **Deep Technical Mechanics**: Explain the data flow, database tables, models, or algorithms involved.
3. **Trade-offs & Alternatives**: Mention what you rejected and why (e.g., SQLite vs Postgres, MiniLM vs OpenAI).
4. **Concrete Project Example**: Reference an actual file or bug in CogniDesk (e.g., `apiClient.ts` interceptors or `conversations.messages_json`).

---

## 24. BEHAVIORAL PROJECT STORY

### "Tell Me About Your Project"
> *"CogniDesk is an on-device AI knowledge assistant designed for zero-trust environments where data privacy is paramount. I wanted to give professionals the power of modern RAG and LLM document interaction without forcing them to upload sensitive files to third-party cloud providers.
>
> I architected the full stack: a React/TypeScript frontend with Redux for reactive state, a high-performance FastAPI Python backend, an embedded SQLite database for relational metadata, ChromaDB for local vector storage, and an on-device Ollama runtime. Users can upload anything from PDFs and spreadsheets to photos of whiteboards via EasyOCR, and instantly query, summarize, and generate study cards from their files with complete workspace isolation. The entire application runs seamlessly with internet disabled."*

### "What Was the Hardest Problem You Solved?"
> *"The hardest problem was building a truly offline multi-format ingestion pipeline that handled scanned image documents reliably without requiring cloud APIs or complex external system dependencies.
>
> Initially, we considered Tesseract OCR, but on Windows and client machines, Tesseract requires manual PATH configuration and external binary installs that frequently fail for non-technical users. I solved this by integrating **EasyOCR**, which runs purely in Python on PyTorch with CRAFT text detection.
>
> However, PyTorch models can consume significant memory if initialized repeatedly per request. I architected the `DocumentProcessor` as a lazy-loaded singleton service: the heavy OCR and embedding weights are loaded into memory once on application startup or first use. This reduced document ingestion latency from over 12 seconds down to 1.8 seconds per page, while maintaining 100% offline autonomy."*
