import type { AnalyticsDataset, RetrievalInspection } from "@/types/analytics";
import type { Conversation, Source } from "@/types/chat";
import type { Document } from "@/types/document";

export const demoDocuments: Document[] = [
  {
    id: "doc-rag-survey",
    name: "Agentic RAG Systems Survey.pdf",
    format: "PDF",
    sizeBytes: 2_516_582,
    uploadedAt: "2026-10-28T09:42:00.000Z",
    status: "indexed",
    chunks: 184,
    pages: 42,
    indexedAt: "2026-10-28T09:44:12.000Z",
    isDemo: true,
    preview:
      "Agentic Retrieval-Augmented Generation systems extend conventional RAG by introducing planning, retrieval evaluation, query refinement, and iterative synthesis. This survey examines 38 recent systems and identifies four recurring architectural patterns. The strongest pipelines separate evidence acquisition from answer composition, allowing each stage to be independently evaluated. Section 3.2 describes the retrieval grading loop used to detect insufficient context before generation. The authors find that reranking reduces unsupported claims by 31% on long-form question answering benchmarks.",
  },
  {
    id: "doc-q3-financial",
    name: "Q3 Financial Intelligence Report.pdf",
    format: "PDF",
    sizeBytes: 1_887_437,
    uploadedAt: "2026-10-27T14:18:00.000Z",
    status: "indexed",
    chunks: 132,
    pages: 28,
    indexedAt: "2026-10-27T14:20:31.000Z",
    isDemo: true,
    preview:
      "Third quarter revenue reached $48.2 million, representing 22% year-over-year growth. Enterprise segment expansion contributed 61% of net new annual recurring revenue. Gross margin improved 240 basis points to 78.4%, driven by infrastructure optimization and higher attach rates. Operating expenses grew 14%, below the planned 18% trajectory. Management raised full-year guidance to $186–190 million while noting elevated sales-cycle duration in the mid-market segment.",
  },
  {
    id: "doc-gemini-notes",
    name: "Gemini API Integration Notes.md",
    format: "MD",
    sizeBytes: 48_640,
    uploadedAt: "2026-10-26T11:05:00.000Z",
    status: "indexed",
    chunks: 18,
    pages: 12,
    indexedAt: "2026-10-26T11:05:44.000Z",
    isDemo: true,
    preview:
      "# Gemini integration notes\n\nUse gemini-embedding-001 for document and query embeddings. Keep generation and embedding model configuration server-side. The generation prompt should include a strict evidence context block and require inline citation identifiers. Set temperature to 0.2 for factual retrieval tasks. All model calls must include retry with exponential backoff, request timeouts, and structured output validation.",
  },
  {
    id: "doc-clinical-summary",
    name: "Clinical Trial Summary.pdf",
    format: "PDF",
    sizeBytes: 3_264_512,
    uploadedAt: "2026-10-30T07:34:00.000Z",
    status: "processing",
    chunks: 61,
    pages: 36,
    isDemo: true,
    preview:
      "A randomized, double-blind phase II study evaluating treatment response across 248 participants. Primary endpoints included change from baseline at week 12 and adverse event frequency. Preliminary extraction has completed for the methodology and cohort description sections. Remaining tables and appendices are still being processed.",
  },
  {
    id: "doc-prd-v2",
    name: "Product Requirements v2.txt",
    format: "TXT",
    sizeBytes: 94_208,
    uploadedAt: "2026-10-30T07:12:00.000Z",
    status: "queued",
    chunks: 0,
    isDemo: true,
    preview:
      "DocuMind AI Phase 2 implementation requirements. The system must provide a typed document ingestion API, asynchronous indexing pipeline, scoped retrieval, conversation persistence and streamed generation. The frontend contract is defined in the Phase 1 integration notes. Chunking defaults to 800 tokens with 120 tokens of overlap.",
  },
  {
    id: "doc-langgraph",
    name: "LangGraph Orchestration Guide.md",
    format: "MD",
    sizeBytes: 36_864,
    uploadedAt: "2026-10-23T16:48:00.000Z",
    status: "indexed",
    chunks: 21,
    pages: 9,
    indexedAt: "2026-10-23T16:48:38.000Z",
    isDemo: true,
    preview:
      "# Orchestration guide\n\nThe retrieval graph uses explicit nodes for query rewriting, document retrieval, relevance grading, and answer generation. State is passed as a typed dictionary containing the original query, rewritten query, retrieved chunks, relevance scores, and a retry counter. A conditional edge routes back to query rewriting when relevance falls below the configured threshold, with a maximum of two retries.",
  },
  {
    id: "doc-research-digest",
    name: "Annual Research Digest.pdf",
    format: "PDF",
    sizeBytes: 6_507_724,
    uploadedAt: "2026-10-21T10:22:00.000Z",
    status: "failed",
    chunks: 0,
    pages: 112,
    error: "Text extraction timed out during processing. Try re-indexing or upload a smaller file.",
    isDemo: true,
    preview:
      "The file is available in the library but text extraction did not complete. Metadata and page count were recovered before the processing timeout. Re-indexing will retry the extraction pipeline.",
  },
  {
    id: "doc-api-spec",
    name: "DocuMind API Specification.pdf",
    format: "PDF",
    sizeBytes: 798_720,
    uploadedAt: "2026-10-20T13:15:00.000Z",
    status: "indexed",
    chunks: 47,
    pages: 19,
    indexedAt: "2026-10-20T13:16:03.000Z",
    isDemo: true,
    preview:
      "API specification for the DocuMind integration layer. POST /documents accepts multipart uploads and returns a job identifier. GET /documents lists metadata and processing state. POST /retrieval accepts a query and document scope, returning ranked chunks with similarity scores. POST /chat streams server-sent events containing answer deltas, citations, and completion metadata.",
  },
  {
    id: "doc-eval-notes",
    name: "Retrieval Evaluation Notes.txt",
    format: "TXT",
    sizeBytes: 18_432,
    uploadedAt: "2026-10-18T08:40:00.000Z",
    status: "indexed",
    chunks: 9,
    pages: 5,
    indexedAt: "2026-10-18T08:40:21.000Z",
    isDemo: true,
    preview:
      "Evaluation set contains 120 question-answer pairs across four document collections. Baseline dense retrieval achieved recall@5 of 0.81. Adding semantic query rewriting improved recall to 0.87. Cross-encoder reranking raised nDCG@5 from 0.72 to 0.84. Latency increased by 38 milliseconds per query, which remained within the product target of 250 milliseconds.",
  },
];

const surveySources: Source[] = [
  {
    id: "src-survey-1",
    documentId: "doc-rag-survey",
    documentName: "Agentic RAG Systems Survey.pdf",
    page: 14,
    chunkId: "rag-3-2-07",
    similarity: 0.94,
    excerpt:
      "The strongest pipelines separate evidence acquisition from answer composition, allowing each stage to be independently evaluated. Retrieval grading detects insufficient context before generation.",
  },
  {
    id: "src-survey-2",
    documentId: "doc-rag-survey",
    documentName: "Agentic RAG Systems Survey.pdf",
    page: 22,
    chunkId: "rag-5-1-12",
    similarity: 0.89,
    excerpt:
      "Across long-form QA benchmarks, cross-encoder reranking reduced unsupported claims by 31% while adding only 38 ms to median retrieval latency.",
  },
  {
    id: "src-survey-3",
    documentId: "doc-eval-notes",
    documentName: "Retrieval Evaluation Notes.txt",
    page: 2,
    chunkId: "eval-02-03",
    similarity: 0.83,
    excerpt:
      "Adding semantic query rewriting improved recall@5 from 0.81 to 0.87. Reranking raised nDCG@5 from 0.72 to 0.84.",
  },
];

const financialSources: Source[] = [
  {
    id: "src-fin-1",
    documentId: "doc-q3-financial",
    documentName: "Q3 Financial Intelligence Report.pdf",
    page: 4,
    chunkId: "q3-revenue-08",
    similarity: 0.96,
    excerpt:
      "Third quarter revenue reached $48.2 million, representing 22% year-over-year growth and 9% sequential expansion.",
  },
  {
    id: "src-fin-2",
    documentId: "doc-q3-financial",
    documentName: "Q3 Financial Intelligence Report.pdf",
    page: 9,
    chunkId: "q3-margin-04",
    similarity: 0.91,
    excerpt:
      "Gross margin improved 240 basis points to 78.4%, driven by infrastructure optimization and higher enterprise attach rates.",
  },
  {
    id: "src-fin-3",
    documentId: "doc-q3-financial",
    documentName: "Q3 Financial Intelligence Report.pdf",
    page: 17,
    chunkId: "q3-outlook-02",
    similarity: 0.87,
    excerpt:
      "Management raised full-year guidance to $186–190 million while noting elevated sales-cycle duration in the mid-market segment.",
  },
];

const langgraphSources: Source[] = [
  {
    id: "src-lg-1",
    documentId: "doc-langgraph",
    documentName: "LangGraph Orchestration Guide.md",
    page: 3,
    chunkId: "lg-state-04",
    similarity: 0.93,
    excerpt:
      "Graph state is a typed dictionary containing the original query, rewritten query, retrieved chunks, relevance scores, and a retry counter.",
  },
  {
    id: "src-lg-2",
    documentId: "doc-langgraph",
    documentName: "LangGraph Orchestration Guide.md",
    page: 5,
    chunkId: "lg-routing-02",
    similarity: 0.9,
    excerpt:
      "A conditional edge routes back to query rewriting when relevance falls below threshold, with a maximum of two retries.",
  },
];

export const demoConversations: Conversation[] = [
  {
    id: "conv-rag-findings",
    title: "Key findings in the RAG survey",
    lastActivity: "2026-10-30T09:42:00.000Z",
    documentIds: ["doc-rag-survey", "doc-eval-notes"],
    isDemo: true,
    messages: [
      {
        id: "msg-1",
        role: "user",
        content: "What are the most important findings in the agentic RAG survey?",
        createdAt: "2026-10-30T09:38:00.000Z",
      },
      {
        id: "msg-2",
        role: "assistant",
        content:
          "The survey converges on four findings that materially improve agentic RAG quality.\n\n### 1. Separate retrieval from generation\n\nSystems that evaluate retrieved evidence before generation produce more reliable answers. A dedicated grading step can request another retrieval pass when context is weak instead of forcing the model to answer from insufficient evidence [1].\n\n### 2. Reranking has an outsized impact\n\nCross-encoder reranking reduced unsupported claims by **31%** on long-form QA benchmarks. The measured cost was roughly **38 ms** per query, which is a strong quality-to-latency tradeoff [2].\n\n### 3. Query rewriting improves recall\n\nAdding semantic query rewriting lifted recall@5 from **0.81 to 0.87** in the companion evaluation set. It helps most with short or ambiguous questions [3].\n\n### 4. Evaluation must be staged\n\nThe strongest architectures measure parsing, retrieval, reranking and generation independently. End-to-end scores alone make failures difficult to localize.\n\n> The evidence suggests the biggest gains come from retrieval discipline, not from a larger generation model.",
        createdAt: "2026-10-30T09:42:00.000Z",
        status: "complete",
        isDemo: true,
        processingMs: 2480,
        sources: surveySources,
        retrieval: {
          rewrittenQuery:
            "agentic RAG survey principal findings retrieval evaluation query rewriting reranking",
          durationMs: 142,
          strategy: "Dense retrieval · Top-K 8 · Cross-encoder rerank",
          chunks: [
            {
              id: "rag-3-2-07",
              documentName: "Agentic RAG Systems Survey.pdf",
              page: 14,
              similarity: 0.94,
              rerankPosition: 1,
              content:
                "The strongest pipelines separate evidence acquisition from answer composition, allowing each stage to be independently evaluated. Retrieval grading detects insufficient context before generation.",
            },
            {
              id: "rag-5-1-12",
              documentName: "Agentic RAG Systems Survey.pdf",
              page: 22,
              similarity: 0.89,
              rerankPosition: 2,
              content:
                "Across long-form QA benchmarks, cross-encoder reranking reduced unsupported claims by 31% while adding only 38 ms to median retrieval latency.",
            },
            {
              id: "eval-02-03",
              documentName: "Retrieval Evaluation Notes.txt",
              page: 2,
              similarity: 0.83,
              rerankPosition: 3,
              content:
                "Adding semantic query rewriting improved recall@5 from 0.81 to 0.87. Reranking raised nDCG@5 from 0.72 to 0.84.",
            },
          ],
        },
      },
    ],
  },
  {
    id: "conv-financial",
    title: "Q3 financial report summary",
    lastActivity: "2026-10-29T16:04:00.000Z",
    documentIds: ["doc-q3-financial"],
    isDemo: true,
    messages: [
      {
        id: "msg-fin-1",
        role: "user",
        content: "Summarize the key financial results and management outlook.",
        createdAt: "2026-10-29T16:01:00.000Z",
      },
      {
        id: "msg-fin-2",
        role: "assistant",
        content:
          "The third quarter shows a business accelerating on both growth and margin.\n\n- **Revenue:** $48.2M, up **22% year over year** and 9% sequentially [1].\n- **Growth driver:** Enterprise expansion contributed **61%** of net new ARR.\n- **Gross margin:** Improved 240 bps to **78.4%**, supported by infrastructure optimization and stronger attach rates [2].\n- **Cost discipline:** Operating expenses grew 14%, below the planned 18% trajectory.\n- **Outlook:** Full-year guidance was raised to **$186–190M**, with a caution around longer mid-market sales cycles [3].\n\n**Interpretation:** The margin expansion alongside above-plan revenue growth suggests operating leverage is improving. The main watch item is sales-cycle duration, which could pressure near-term bookings conversion.\n\nThis is a demo synthesis of the selected mock document.",
        createdAt: "2026-10-29T16:04:00.000Z",
        status: "complete",
        isDemo: true,
        processingMs: 2190,
        sources: financialSources,
        retrieval: {
          rewrittenQuery:
            "Q3 financial results revenue growth gross margin full year guidance management outlook",
          durationMs: 118,
          strategy: "Dense retrieval · Top-K 6 · Cross-encoder rerank",
          chunks: financialSources.map((source, index) => ({
            id: source.chunkId,
            documentName: source.documentName,
            page: source.page,
            similarity: source.similarity,
            rerankPosition: index + 1,
            content: source.excerpt,
          })),
        },
      },
    ],
  },
  {
    id: "conv-langgraph",
    title: "LangGraph implementation risks",
    lastActivity: "2026-10-28T11:26:00.000Z",
    documentIds: ["doc-langgraph"],
    isDemo: true,
    messages: [
      {
        id: "msg-lg-1",
        role: "user",
        content: "What should we watch out for when implementing the LangGraph workflow?",
        createdAt: "2026-10-28T11:22:00.000Z",
      },
      {
        id: "msg-lg-2",
        role: "assistant",
        content:
          "The guide highlights several implementation risks worth designing around early.\n\n1. **Unbounded loops.** The graph must cap rewrite retries. The reference flow limits retries to two before falling back to an insufficient-evidence response [2].\n2. **Opaque state.** Keep state typed and explicit: original query, rewritten query, chunks, relevance scores and retry count [1].\n3. **Weak grading.** A relevance grader that is too permissive defeats the purpose of the control loop. Calibrate it against a labeled evaluation set.\n4. **Silent retrieval failures.** Distinguish an empty result from a low-relevance result so the UI can explain what happened.\n\nA useful rule: the workflow should know when **not** to answer.",
        createdAt: "2026-10-28T11:26:00.000Z",
        status: "complete",
        isDemo: true,
        processingMs: 1980,
        sources: langgraphSources,
        retrieval: {
          rewrittenQuery:
            "LangGraph implementation risks retry limits typed state relevance grading failure handling",
          durationMs: 96,
          strategy: "Dense retrieval · Top-K 5 · Cross-encoder rerank",
          chunks: langgraphSources.map((source, index) => ({
            id: source.chunkId,
            documentName: source.documentName,
            page: source.page,
            similarity: source.similarity,
            rerankPosition: index + 1,
            content: source.excerpt,
          })),
        },
      },
    ],
  },
  {
    id: "conv-compare",
    title: "Compare retrieval strategies",
    lastActivity: "2026-10-26T14:08:00.000Z",
    documentIds: ["doc-rag-survey", "doc-eval-notes"],
    isDemo: true,
    messages: [],
  },
  {
    id: "conv-research",
    title: "Research methodology overview",
    lastActivity: "2026-10-24T10:17:00.000Z",
    documentIds: ["doc-rag-survey"],
    isDemo: true,
    messages: [],
  },
];

const sevenDayActivity = [18, 26, 22, 34, 29, 41, 37];
const thirtyDayActivity = [72, 84, 78, 96, 104, 91, 118, 126, 112, 138];
const ninetyDayActivity = [242, 268, 284, 312, 298, 334, 362, 348, 386, 414, 392, 438];

const sevenDayLatency = [128, 142, 135, 151, 146, 138, 132];
const thirtyDayLatency = [156, 149, 142, 139, 144, 151, 147, 139, 143, 136];
const ninetyDayLatency = [172, 168, 159, 154, 149, 145, 141, 139, 144, 148, 143, 137];

function labelsForRange(range: "7d" | "30d" | "90d") {
  if (range === "7d") {
    return ["Oct 24", "Oct 25", "Oct 26", "Oct 27", "Oct 28", "Oct 29", "Oct 30"];
  }
  if (range === "30d") {
    return ["Oct 1", "Oct 4", "Oct 7", "Oct 10", "Oct 13", "Oct 16", "Oct 19", "Oct 22", "Oct 25", "Oct 28"];
  }
  return ["Aug 1", "Aug 9", "Aug 17", "Aug 25", "Sep 2", "Sep 10", "Sep 18", "Sep 26", "Oct 4", "Oct 12", "Oct 20", "Oct 30"];
}

const inspections: RetrievalInspection[] = [
  {
    id: "insp-1",
    query: "What evidence supports separate retrieval and generation stages?",
    chunk:
      "Systems that grade retrieved evidence before generation produce more reliable answers. A dedicated grading step can request another retrieval pass when context is weak.",
    document: "Agentic RAG Systems Survey.pdf",
    page: 14,
    similarity: 0.94,
    rerankPosition: 1,
    timestamp: "2026-10-30T09:42:18.000Z",
    latencyMs: 142,
  },
  {
    id: "insp-2",
    query: "What evidence supports separate retrieval and generation stages?",
    chunk:
      "Cross-encoder reranking reduced unsupported claims by 31% while adding 38 ms to median retrieval latency.",
    document: "Agentic RAG Systems Survey.pdf",
    page: 22,
    similarity: 0.89,
    rerankPosition: 2,
    timestamp: "2026-10-30T09:42:18.000Z",
    latencyMs: 142,
  },
  {
    id: "insp-3",
    query: "How much did query rewriting improve recall?",
    chunk:
      "Adding semantic query rewriting improved recall@5 from 0.81 to 0.87. Reranking raised nDCG@5 from 0.72 to 0.84.",
    document: "Retrieval Evaluation Notes.txt",
    page: 2,
    similarity: 0.92,
    rerankPosition: 1,
    timestamp: "2026-10-29T16:04:03.000Z",
    latencyMs: 118,
  },
  {
    id: "insp-4",
    query: "What drove gross margin expansion?",
    chunk:
      "Gross margin improved 240 basis points to 78.4%, driven by infrastructure optimization and higher enterprise attach rates.",
    document: "Q3 Financial Intelligence Report.pdf",
    page: 9,
    similarity: 0.96,
    rerankPosition: 1,
    timestamp: "2026-10-29T16:01:47.000Z",
    latencyMs: 121,
  },
  {
    id: "insp-5",
    query: "What is the full year revenue guidance?",
    chunk:
      "Management raised full-year guidance to $186–190 million while noting elevated sales-cycle duration in the mid-market segment.",
    document: "Q3 Financial Intelligence Report.pdf",
    page: 17,
    similarity: 0.93,
    rerankPosition: 1,
    timestamp: "2026-10-29T16:01:48.000Z",
    latencyMs: 121,
  },
  {
    id: "insp-6",
    query: "How are rewrite loops bounded in the workflow?",
    chunk:
      "A conditional edge routes back to query rewriting when relevance falls below threshold, with a maximum of two retries.",
    document: "LangGraph Orchestration Guide.md",
    page: 5,
    similarity: 0.9,
    rerankPosition: 1,
    timestamp: "2026-10-28T11:26:11.000Z",
    latencyMs: 96,
  },
  {
    id: "insp-7",
    query: "What state does the graph maintain?",
    chunk:
      "Graph state is a typed dictionary containing the original query, rewritten query, retrieved chunks, relevance scores, and a retry counter.",
    document: "LangGraph Orchestration Guide.md",
    page: 3,
    similarity: 0.88,
    rerankPosition: 2,
    timestamp: "2026-10-28T11:26:11.000Z",
    latencyMs: 96,
  },
  {
    id: "insp-8",
    query: "Which endpoint streams chat responses?",
    chunk:
      "POST /chat streams server-sent events containing answer deltas, citations, and completion metadata.",
    document: "DocuMind API Specification.pdf",
    page: 11,
    similarity: 0.86,
    rerankPosition: 1,
    timestamp: "2026-10-27T12:33:09.000Z",
    latencyMs: 109,
  },
];

export function getAnalytics(range: "7d" | "30d" | "90d"): AnalyticsDataset {
  const activity = range === "7d" ? sevenDayActivity : range === "30d" ? thirtyDayActivity : ninetyDayActivity;
  const retrievalLatency = range === "7d" ? sevenDayLatency : range === "30d" ? thirtyDayLatency : ninetyDayLatency;
  const labels = labelsForRange(range);
  const queryActivity = labels.map((label, index) => ({
    label,
    queries: activity[index],
    successful: Math.round(activity[index] * (0.94 + (index % 3) * 0.012)),
  }));
  const latency = labels.map((label, index) => ({
    label,
    retrieval: retrievalLatency[index],
    response: Math.round(retrievalLatency[index] * 2.34 + (index % 4) * 18 + 480),
  }));
  const totalQueries = activity.reduce((sum, value) => sum + value, 0);

  return {
    queryActivity,
    latency,
    ingestion: [
      { name: "PDF", value: 642, color: "#8b7dfb" },
      { name: "Markdown", value: 238, color: "#7dd3fc" },
      { name: "TXT", value: 162, color: "#5bd6a5" },
    ],
    inspections,
    metrics: {
      totalQueries,
      successRate: range === "7d" ? 97.8 : range === "30d" ? 96.4 : 95.9,
      avgRetrievalLatency: range === "7d" ? 139 : range === "30d" ? 144 : 151,
      avgResponseLatency: range === "7d" ? 1_840 : range === "30d" ? 1_960 : 2_140,
      indexedChunks: 1_042,
      documentsIngested: range === "7d" ? 14 : range === "30d" ? 52 : range === "90d" ? 148 : 14,
    },
  };
}

export const platformStats = [
  { value: "1.2M+", label: "Chunks indexed", detail: "Illustrative workspace volume" },
  { value: "98.4%", label: "Citation coverage", detail: "Demo benchmark target" },
  { value: "142ms", label: "Median retrieval", detail: "Simulated Top-K latency" },
  { value: "37.4k", label: "Grounded answers", detail: "Illustrative demo usage" },
];
