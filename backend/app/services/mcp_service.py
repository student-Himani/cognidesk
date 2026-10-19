import json
import logging
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session

from app.models.workspace import Workspace
from app.models.document import Document
from app.models.document_chunk import DocumentChunk
from app.services.search_service import search_service

logger = logging.getLogger("app")

PROTOCOL_VERSION = "2024-11-05"
SERVER_NAME = "cognidesk-mcp-server"
SERVER_VERSION = "1.0.0"


class MCPService:
    """
    Module 21: Model Context Protocol (MCP) Service.
    Implements a local, 100% offline MCP server exposing document intelligence
    tools ('search_documents', 'get_document_summary') with strict workspace scoping.
    """

    def __init__(self):
        self.protocol_version = PROTOCOL_VERSION
        self.server_info = {
            "name": SERVER_NAME,
            "version": SERVER_VERSION,
        }

    def get_tool_definitions(self) -> List[Dict[str, Any]]:
        """Returns standard MCP tool definitions matching the specification."""
        return [
            {
                "name": "search_documents",
                "description": "Perform semantic vector search across local documents in the active workspace. Returns relevant chunks with similarity scores and citations.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "The search query or question to match semantically against local document chunks."
                        },
                        "top_k": {
                            "type": "integer",
                            "description": "Maximum number of chunks to return (default: 5, max: 20).",
                            "default": 5
                        },
                        "workspace_id": {
                            "type": "integer",
                            "description": "Optional workspace ID to search within. If omitted, uses active workspace."
                        }
                    },
                    "required": ["query"]
                }
            },
            {
                "name": "get_document_summary",
                "description": "Retrieve comprehensive structural metadata, chunk counts, word counts, and text overview for a document in the active workspace.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "document_id": {
                            "type": "integer",
                            "description": "The ID of the document to inspect."
                        },
                        "workspace_id": {
                            "type": "integer",
                            "description": "Optional workspace ID where the document belongs. If omitted, uses active workspace."
                        }
                    },
                    "required": ["document_id"]
                }
            }
        ]

    def _resolve_workspace_id(
        self,
        db: Session,
        arg_workspace_id: Optional[Any] = None,
        header_workspace_id: Optional[int] = None
    ) -> int:
        """
        Resolves the effective workspace ID in order of precedence:
        1. Explicit argument in tool call
        2. HTTP Header (X-Workspace-Id)
        3. Active workspace in database (fallback to ID: 1)
        """
        target_ws_id: Optional[int] = None

        if arg_workspace_id is not None:
            try:
                target_ws_id = int(arg_workspace_id)
            except (ValueError, TypeError):
                raise ValueError(f"Invalid workspace_id: '{arg_workspace_id}'. Must be an integer.")
        elif header_workspace_id is not None:
            target_ws_id = int(header_workspace_id)

        if target_ws_id is not None:
            ws = db.query(Workspace).filter(Workspace.id == target_ws_id).first()
            if not ws:
                raise ValueError(f"Workspace with ID {target_ws_id} does not exist.")
            return target_ws_id

        # Fallback to active workspace
        active = db.query(Workspace).filter(Workspace.is_active == True).first()
        if active:
            return active.id
        default_ws = db.query(Workspace).filter(Workspace.id == 1).first()
        return default_ws.id if default_ws else 1

    def tool_search_documents(
        self,
        db: Session,
        arguments: Dict[str, Any],
        header_ws_id: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Tool implementation: search_documents.
        Executes semantic search scoped strictly to the resolved workspace.
        """
        query = arguments.get("query")
        if not query or not str(query).strip():
            raise ValueError("Parameter 'query' is required and cannot be empty.")

        top_k = arguments.get("top_k", 5)
        try:
            top_k = max(1, min(20, int(top_k)))
        except (ValueError, TypeError):
            top_k = 5

        effective_ws_id = self._resolve_workspace_id(
            db,
            arg_workspace_id=arguments.get("workspace_id"),
            header_workspace_id=header_ws_id
        )

        results = search_service.search_semantic(
            db=db,
            query_text=str(query).strip(),
            top_k=top_k,
            workspace_id=effective_ws_id
        )

        formatted_matches = []
        for r in results:
            citation = r.get("citation", {})
            formatted_matches.append({
                "chunk_id": r.get("chunk_id"),
                "similarity_score": r.get("similarity_score"),
                "similarity_percentage": r.get("similarity_label"),
                "filename": citation.get("filename"),
                "document_id": citation.get("document_id"),
                "chunk_index": r.get("chunk_index"),
                "content": r.get("chunk_text")
            })

        output_data = {
            "query": str(query).strip(),
            "workspace_id": effective_ws_id,
            "total_matches": len(formatted_matches),
            "results": formatted_matches
        }

        return {
            "content": [
                {
                    "type": "text",
                    "text": json.dumps(output_data, indent=2)
                }
            ],
            "isError": False
        }

    def tool_get_document_summary(
        self,
        db: Session,
        arguments: Dict[str, Any],
        header_ws_id: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Tool implementation: get_document_summary.
        Returns document metadata, chunk statistics, and structural outline
        scoped strictly to the resolved workspace.
        """
        doc_id_arg = arguments.get("document_id")
        if doc_id_arg is None:
            raise ValueError("Parameter 'document_id' is required.")

        try:
            doc_id = int(doc_id_arg)
        except (ValueError, TypeError):
            raise ValueError(f"Invalid document_id: '{doc_id_arg}'. Must be an integer.")

        effective_ws_id = self._resolve_workspace_id(
            db,
            arg_workspace_id=arguments.get("workspace_id"),
            header_workspace_id=header_ws_id
        )

        doc = db.query(Document).filter(
            Document.id == doc_id,
            Document.workspace_id == effective_ws_id
        ).first()

        if not doc:
            raise ValueError(
                f"Document with ID {doc_id} was not found in workspace {effective_ws_id}."
            )

        # Retrieve outline chunks
        sample_chunks = db.query(DocumentChunk).filter(
            DocumentChunk.document_id == doc.id
        ).order_by(DocumentChunk.chunk_index).limit(5).all()

        chunk_previews = [
            {
                "chunk_index": c.chunk_index,
                "word_count": c.word_count,
                "preview": c.chunk_text[:180] + ("..." if len(c.chunk_text) > 180 else "")
            }
            for c in sample_chunks
        ]

        summary_data = {
            "document_id": doc.id,
            "workspace_id": doc.workspace_id,
            "filename": doc.original_filename or doc.filename,
            "filetype": (doc.filetype or "").upper(),
            "filesize_bytes": doc.filesize,
            "status": doc.status,
            "page_count": doc.page_count,
            "word_count": doc.word_count,
            "total_indexed_chunks": doc.chunks or len(sample_chunks),
            "created_at": doc.created_at.isoformat() if doc.created_at else None,
            "updated_at": doc.updated_at.isoformat() if doc.updated_at else None,
            "sample_chunk_previews": chunk_previews
        }

        return {
            "content": [
                {
                    "type": "text",
                    "text": json.dumps(summary_data, indent=2)
                }
            ],
            "isError": False
        }

    def execute_tool(
        self,
        db: Session,
        tool_name: str,
        arguments: Dict[str, Any],
        header_ws_id: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Dispatches and executes a tool by name with arguments and error handling.
        """
        if tool_name == "search_documents":
            return self.tool_search_documents(db, arguments, header_ws_id)
        elif tool_name == "get_document_summary":
            return self.tool_get_document_summary(db, arguments, header_ws_id)
        else:
            raise ValueError(f"Unknown MCP tool: '{tool_name}'. Available tools: ['search_documents', 'get_document_summary']")

    def handle_jsonrpc(
        self,
        db: Session,
        request_payload: Dict[str, Any],
        header_ws_id: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Processes a standard MCP JSON-RPC 2.0 request payload.
        Supported methods: 'initialize', 'ping', 'tools/list', 'tools/call'.
        """
        if not isinstance(request_payload, dict):
            return {
                "jsonrpc": "2.0",
                "id": None,
                "error": {
                    "code": -32600,
                    "message": "Invalid Request: Payload must be a JSON object."
                }
            }

        req_id = request_payload.get("id")
        method = request_payload.get("method")
        params = request_payload.get("params", {}) or {}

        # 1. Initialize Handshake
        if method == "initialize":
            return {
                "jsonrpc": "2.0",
                "id": req_id,
                "result": {
                    "protocolVersion": self.protocol_version,
                    "capabilities": {
                        "tools": {
                            "listChanged": False
                        }
                    },
                    "serverInfo": self.server_info,
                    "instructions": "CogniDesk Local Offline MCP Server. Provides semantic document search and document summary tools with active workspace scoping."
                }
            }

        # 2. Ping Check
        elif method == "ping":
            return {
                "jsonrpc": "2.0",
                "id": req_id,
                "result": {}
            }

        # 3. List Tools
        elif method == "tools/list":
            return {
                "jsonrpc": "2.0",
                "id": req_id,
                "result": {
                    "tools": self.get_tool_definitions()
                }
            }

        # 4. Call Tool
        elif method == "tools/call":
            tool_name = params.get("name")
            arguments = params.get("arguments", {}) or {}

            if not tool_name:
                return {
                    "jsonrpc": "2.0",
                    "id": req_id,
                    "error": {
                        "code": -32602,
                        "message": "Invalid params: 'name' is required for tools/call."
                    }
                }

            try:
                result = self.execute_tool(
                    db=db,
                    tool_name=tool_name,
                    arguments=arguments,
                    header_ws_id=header_ws_id
                )
                return {
                    "jsonrpc": "2.0",
                    "id": req_id,
                    "result": result
                }
            except ValueError as ve:
                return {
                    "jsonrpc": "2.0",
                    "id": req_id,
                    "result": {
                        "content": [
                            {
                                "type": "text",
                                "text": f"Error: {str(ve)}"
                            }
                        ],
                        "isError": True
                    }
                }
            except Exception as ex:
                logger.error(f"MCP tool execution failure ({tool_name}): {ex}")
                return {
                    "jsonrpc": "2.0",
                    "id": req_id,
                    "result": {
                        "content": [
                            {
                                "type": "text",
                                "text": f"Internal execution error: {str(ex)}"
                            }
                        ],
                        "isError": True
                    }
                }

        # Method Not Found
        else:
            return {
                "jsonrpc": "2.0",
                "id": req_id,
                "error": {
                    "code": -32601,
                    "message": f"Method '{method}' not found. Supported methods: ['initialize', 'ping', 'tools/list', 'tools/call']."
                }
            }

    def get_server_status(self) -> Dict[str, Any]:
        """Returns descriptive metadata about the MCP server runtime."""
        return {
            "status": "active",
            "is_implemented": True,
            "offline_mode": True,
            "protocol_version": self.protocol_version,
            "server_info": self.server_info,
            "endpoint": "/api/v1/mcp",
            "active_tools": ["search_documents", "get_document_summary"],
            "cloud_mcp": {
                "status": "planned",
                "description": "Remote cloud MCP proxy integration planned for future release."
            }
        }


mcp_service = MCPService()
