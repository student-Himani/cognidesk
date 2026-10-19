import logging
from typing import Dict, Any, Optional
from fastapi import APIRouter, Depends, Header, HTTPException, status, Request
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.services.mcp_service import mcp_service

logger = logging.getLogger("app")
router = APIRouter()


@router.post("", response_model=Dict[str, Any])
async def handle_mcp_jsonrpc(
    request: Request,
    db: Session = Depends(get_db),
    x_workspace_id: Optional[str] = Header(None)
):
    """
    Standard MCP (Model Context Protocol) JSON-RPC 2.0 endpoint.
    Handles 'initialize', 'ping', 'tools/list', and 'tools/call'.
    """
    try:
        payload = await request.json()
    except Exception:
        return {
            "jsonrpc": "2.0",
            "id": None,
            "error": {
                "code": -32700,
                "message": "Parse error: Invalid JSON."
            }
        }

    parsed_ws_id = int(x_workspace_id) if x_workspace_id and x_workspace_id.isdigit() else None
    return mcp_service.handle_jsonrpc(db, payload, header_ws_id=parsed_ws_id)


@router.get("/status", response_model=Dict[str, Any])
def get_mcp_status():
    """
    Returns runtime configuration, protocol version, and status for the local MCP server.
    """
    return mcp_service.get_server_status()


@router.get("/tools", response_model=Dict[str, Any])
def list_mcp_tools():
    """
    REST discovery endpoint returning tool schemas and specifications.
    """
    return {
        "tools": mcp_service.get_tool_definitions(),
        "protocol_version": mcp_service.protocol_version
    }


@router.post("/tools/{tool_name}", response_model=Dict[str, Any])
async def execute_mcp_tool_direct(
    tool_name: str,
    request: Request,
    db: Session = Depends(get_db),
    x_workspace_id: Optional[str] = Header(None)
):
    """
    Direct REST invocation endpoint for testing and UI interaction.
    """
    try:
        body = await request.json()
    except Exception:
        body = {}

    arguments = body.get("arguments", body) if isinstance(body, dict) else {}
    parsed_ws_id = int(x_workspace_id) if x_workspace_id and x_workspace_id.isdigit() else None

    try:
        result = mcp_service.execute_tool(
            db=db,
            tool_name=tool_name,
            arguments=arguments,
            header_ws_id=parsed_ws_id
        )
        return {
            "success": not result.get("isError", False),
            "tool": tool_name,
            "result": result
        }
    except ValueError as ve:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(ve)
        )
    except Exception as e:
        logger.error(f"Error executing MCP tool '{tool_name}': {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"MCP tool execution failed: {str(e)}"
        )
