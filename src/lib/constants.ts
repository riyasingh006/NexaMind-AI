export const APP_NAME = "DocuMind AI";
export const APP_TAGLINE = "Intelligent Document Understanding. Grounded AI Answers.";
export const DEMO_NOTICE =
  "Answers are generated from indexed documents through the backend LangGraph agent.";
export const MAX_FILE_SIZE = 25 * 1024 * 1024;
export const ACCEPTED_FILE_TYPES = ".pdf,.txt,.md,.markdown";

export const LANDING_NAV = [
  { label: "Home", href: "/" },
  { label: "Features", href: "/#features" },
  { label: "Architecture", href: "/#architecture" },
  { label: "Technology", href: "/#technology" },
  { label: "Documentation", href: "/#documentation" },
];

export const DASHBOARD_NAV = [
  { label: "Dashboard", href: "/dashboard", icon: "layoutDashboard" },
  { label: "Documents", href: "/dashboard/documents", icon: "files" },
  { label: "AI Workspace", href: "/dashboard/chat", icon: "sparkles" },
  { label: "Conversations", href: "/dashboard/conversations", icon: "messages" },
  { label: "Retrieval", href: "/dashboard/retrieval", icon: "search" },
  { label: "Retrieval Analytics", href: "/dashboard/analytics", icon: "chart" },
  { label: "System Health", href: "/dashboard/health", icon: "activity" },
  { label: "Settings", href: "/dashboard/settings", icon: "settings" },
] as const;

export const QUERY_EXAMPLES = [
  "Summarize the uploaded document.",
  "Explain the main findings.",
  "Compare important concepts.",
  "Find specific information.",
  "What are the key conclusions?",
];

export const WORKFLOW_STEPS = [
  {
    title: "Documents",
    description: "PDF, TXT and Markdown sources enter a secure workspace.",
    icon: "files",
  },
  {
    title: "Chunking",
    description: "Content is segmented with semantic overlap and metadata.",
    icon: "scissors",
  },
  {
    title: "Embeddings",
    description: "Gemini embeddings map every chunk into vector space.",
    icon: "braces",
  },
  {
    title: "Vector Search",
    description: "FAISS retrieves the most relevant evidence for each query.",
    icon: "search",
  },
  {
    title: "Gemini AI",
    description: "LangGraph orchestrates grounded synthesis and verification.",
    icon: "sparkles",
  },
  {
    title: "Grounded Answers",
    description: "Cited responses with traceable sources and evidence.",
    icon: "shieldCheck",
  },
] as const;

export const FEATURES = [
  {
    title: "Multi-Format Document Intelligence",
    description:
      "Bring PDF reports, plain text and Markdown knowledge into one normalized, searchable workspace.",
    icon: "fileStack",
    accent: "violet",
  },
  {
    title: "Semantic Vector Search",
    description:
      "Find meaning rather than exact keywords with dense vector retrieval across every indexed chunk.",
    icon: "radar",
    accent: "cyan",
  },
  {
    title: "Agentic RAG Pipeline",
    description:
      "A LangGraph workflow plans, retrieves, evaluates and refines before composing a final answer.",
    icon: "workflow",
    accent: "violet",
  },
  {
    title: "Context-Aware Retrieval",
    description:
      "Respect document scope, conversation history and metadata to surface the right evidence.",
    icon: "scanSearch",
    accent: "cyan",
  },
  {
    title: "Grounded Answer Generation",
    description:
      "Responses are constrained to retrieved evidence, reducing unsupported claims and hallucinations.",
    icon: "shieldCheck",
    accent: "violet",
  },
  {
    title: "Source Citations",
    description:
      "Every claim stays traceable with document, page, chunk and similarity references.",
    icon: "quote",
    accent: "cyan",
  },
  {
    title: "Intelligent Query Rewriting",
    description:
      "Ambiguous questions are expanded and reformulated for stronger semantic recall automatically.",
    icon: "wandSparkles",
    accent: "violet",
  },
  {
    title: "Retrieval Reranking",
    description:
      "Cross-encoder reranking elevates the most useful passages before generation begins.",
    icon: "listFilter",
    accent: "cyan",
  },
] as const;

export const HOW_IT_WORKS = [
  {
    step: "01",
    title: "Upload your knowledge",
    description:
      "Drop in research papers, reports, technical docs or notes. DocuMind accepts PDF, TXT and Markdown.",
    detail: "Drag, drop, done",
  },
  {
    step: "02",
    title: "Structure and index",
    description:
      "Documents are parsed, split into semantic chunks and enriched with page-level metadata.",
    detail: "Clean extraction",
  },
  {
    step: "03",
    title: "Embed and retrieve",
    description:
      "Gemini embeddings and FAISS vector search make every passage semantically discoverable.",
    detail: "Meaning-aware search",
  },
  {
    step: "04",
    title: "Ask with confidence",
    description:
      "The agentic pipeline retrieves, reranks and generates an answer backed by visible evidence.",
    detail: "Cited answers",
  },
] as const;

export const ARCHITECTURE_STAGES = [
  {
    id: "frontend",
    label: "Frontend",
    sublabel: "Next.js + React",
    description:
      "A responsive App Router interface for document ingestion, chat, analytics and configuration. Typed API clients will connect to the backend in Phase 2.",
    accent: "#a89bff",
    tags: ["Next.js 16", "TypeScript", "Tailwind CSS"],
  },
  {
    id: "api",
    label: "FastAPI Backend",
    sublabel: "Typed REST layer",
    description:
      "The future gateway for uploads, indexing jobs, retrieval and generation. Pydantic schemas will keep the contract explicit end to end.",
    accent: "#7dd3fc",
    tags: ["FastAPI", "Pydantic", "REST"],
  },
  {
    id: "processing",
    label: "Document Processing",
    sublabel: "Parse + chunk",
    description:
      "PDF, TXT and Markdown parsers extract clean text, preserve source metadata and build overlapping semantic chunks.",
    accent: "#8dd9c6",
    tags: ["Parsing", "Chunking", "Metadata"],
  },
  {
    id: "embeddings",
    label: "Gemini Embeddings",
    sublabel: "gemini-embedding-001",
    description:
      "Each chunk is embedded into a high-dimensional semantic vector that captures meaning, context and relationships.",
    accent: "#b4a9ff",
    tags: ["Embeddings", "768 dims", "Semantic"],
  },
  {
    id: "vector",
    label: "FAISS Vector Database",
    sublabel: "Similarity index",
    description:
      "FAISS stores and searches vectors with low-latency nearest-neighbor retrieval, filtered by document scope.",
    accent: "#f0bf6a",
    tags: ["FAISS", "ANN Search", "Top-K"],
  },
  {
    id: "graph",
    label: "LangGraph Orchestration",
    sublabel: "Agentic control loop",
    description:
      "A stateful graph rewrites queries, retrieves evidence, grades relevance and decides when the context is sufficient.",
    accent: "#fb9eb3",
    tags: ["LangGraph", "Agents", "Evaluation"],
  },
  {
    id: "generation",
    label: "Gemini Answer Generation",
    sublabel: "Grounded synthesis",
    description:
      "The selected Gemini Flash model composes a cited answer constrained to retrieved evidence and returns source references.",
    accent: "#89d9ff",
    tags: ["Gemini Flash", "Grounded", "Citations"],
  },
] as const;

export const TECHNOLOGY_STACK = [
  {
    name: "Next.js",
    category: "Framework",
    description: "App Router, server rendering and production routing.",
    color: "#ffffff",
    mark: "N",
  },
  {
    name: "TypeScript",
    category: "Language",
    description: "Strict contracts across every interface and API boundary.",
    color: "#74b9ff",
    mark: "TS",
  },
  {
    name: "FastAPI",
    category: "Backend",
    description: "High-performance Python API planned for Phase 2.",
    color: "#6ee7b7",
    mark: "F",
  },
  {
    name: "Python",
    category: "Runtime",
    description: "Document processing, retrieval and orchestration.",
    color: "#f7d774",
    mark: "Py",
  },
  {
    name: "Google Gemini",
    category: "AI Model",
    description: "Grounded generation and high-quality embeddings.",
    color: "#a6b9ff",
    mark: "G",
  },
  {
    name: "LangGraph",
    category: "Orchestration",
    description: "Stateful agent workflows with explicit control flow.",
    color: "#e5a8ff",
    mark: "L",
  },
  {
    name: "FAISS",
    category: "Vector DB",
    description: "Fast, local vector similarity search at scale.",
    color: "#f5b785",
    mark: "FA",
  },
  {
    name: "Pydantic",
    category: "Validation",
    description: "Runtime-safe request and response schemas.",
    color: "#ff9aaa",
    mark: "P",
  },
  {
    name: "Docker",
    category: "Infrastructure",
    description: "Reproducible deployment for every service.",
    color: "#8fc7ff",
    mark: "D",
  },
] as const;

export const USE_CASES = [
  {
    title: "Research Document Analysis",
    description:
      "Interrogate long-form research, surface methodologies and trace every insight back to its source.",
    icon: "microscope",
    meta: "Research teams",
  },
  {
    title: "Academic PDF Understanding",
    description:
      "Navigate papers, literature reviews and citations with page-aware semantic retrieval.",
    icon: "graduationCap",
    meta: "Academia",
  },
  {
    title: "Technical Documentation Search",
    description:
      "Ask implementation questions across API references, runbooks and architecture docs.",
    icon: "terminal",
    meta: "Engineering",
  },
  {
    title: "Knowledge Base Assistant",
    description:
      "Turn internal wikis and policy libraries into a dependable, cited answer layer.",
    icon: "library",
    meta: "Operations",
  },
  {
    title: "Business Document Intelligence",
    description:
      "Extract decisions, risks and financial signals from reports, contracts and briefs.",
    icon: "briefcaseBusiness",
    meta: "Enterprise",
  },
] as const;

export const DOCUMENT_STATUS_META = {
  indexed: { label: "Indexed", tone: "success" },
  processing: { label: "Processing", tone: "accent" },
  queued: { label: "Queued", tone: "neutral" },
  failed: { label: "Failed", tone: "danger" },
} as const;

export const DOCUMENT_PROCESSING_STATE_META = {
  UPLOADED: { label: "Uploaded", tone: "neutral" },
  VALIDATING: { label: "Validating", tone: "accent" },
  EXTRACTING: { label: "Extracting", tone: "accent" },
  PREPROCESSING: { label: "Preprocessing", tone: "accent" },
  CHUNKING: { label: "Chunking", tone: "accent" },
  EMBEDDING: { label: "Embedding", tone: "accent" },
  VECTOR_INDEXING: { label: "Vector indexing", tone: "accent" },
  COMPLETED: { label: "Completed", tone: "success" },
  FAILED: { label: "Failed", tone: "danger" },
  REQUIRES_OCR: { label: "OCR required", tone: "danger" },
} as const;

export const DOCUMENT_INDEX_STATE_META = {
  NOT_CONFIGURED: { label: "Embeddings unavailable", tone: "warning" },
  NOT_INDEXED: { label: "Not indexed", tone: "neutral" },
  EMBEDDING: { label: "Embedding", tone: "accent" },
  VECTOR_INDEXING: { label: "Indexing vectors", tone: "accent" },
  INDEXED: { label: "Vector indexed", tone: "success" },
  FAILED: { label: "Indexing failed", tone: "danger" },
  STALE: { label: "Index stale", tone: "warning" },
} as const;

export const SYSTEM_SERVICES = [
  {
    name: "Frontend",
    description: "Next.js application shell and interface layer.",
    status: "operational",
    statusLabel: "Operational",
    icon: "monitor",
    note: "Next.js interface is running with live document operations.",
  },
  {
    name: "Backend API",
    description: "FastAPI service for documents, health and chat contracts.",
    status: "operational",
    statusLabel: "Operational",
    icon: "server",
    note: "The document ingestion API and health endpoints are connected.",
  },
  {
    name: "Gemini API",
    description: "Generation and embedding inference.",
    status: "unconfigured",
    statusLabel: "Awaiting API Key",
    icon: "sparkles",
    note: "Embedding calls use the Gemini API when DOCUMIND_GEMINI_API_KEY is configured.",
  },
  {
    name: "Embedding Service",
    description: "gemini-embedding-001 vector generation.",
    status: "unconfigured",
    statusLabel: "Awaiting API Key",
    icon: "braces",
    note: "Document and query embeddings are implemented; live indexing requires a Gemini API key.",
  },
  {
    name: "FAISS Index",
    description: "Persistent cosine-similarity vector index.",
    status: "pending",
    statusLabel: "Index Not Built",
    icon: "database",
    note: "FAISS persistence and scoped search are implemented. Build the index from indexed documents.",
  },
  {
    name: "Database",
    description: "Document metadata and chunk persistence.",
    status: "operational",
    statusLabel: "Operational",
    icon: "cylinder",
    note: "Documents, processing state and chunks are persisted by the backend.",
  },
  {
    name: "LangGraph Workflow",
    description: "Agentic retrieve, grade and generate pipeline.",
    status: "pending",
    statusLabel: "Awaiting Integration",
    icon: "workflow",
    note: "Workflow visualization is illustrative until the orchestration layer exists.",
  },
] as const;
