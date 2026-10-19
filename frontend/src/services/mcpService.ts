import apiClient from './apiClient';

export interface McpStatus {
  status: string;
  is_implemented: boolean;
  offline_mode: boolean;
  protocol_version: string;
  server_info: {
    name: string;
    version: string;
  };
  endpoint: string;
  active_tools: string[];
  cloud_mcp: {
    status: string;
    description: string;
  };
}

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface McpToolResult {
  success: boolean;
  tool: string;
  result: {
    content: Array<{
      type: string;
      text: string;
    }>;
    isError: boolean;
  };
}

export const fetchMcpStatus = async (): Promise<McpStatus> => {
  const response = await apiClient.get<McpStatus>('/mcp/status');
  return response.data;
};

export const fetchMcpTools = async (): Promise<{ tools: McpToolDefinition[]; protocol_version: string }> => {
  const response = await apiClient.get<{ tools: McpToolDefinition[]; protocol_version: string }>('/mcp/tools');
  return response.data;
};

export const executeMcpTool = async (
  toolName: string,
  args: Record<string, any>
): Promise<McpToolResult> => {
  const response = await apiClient.post<McpToolResult>(`/mcp/tools/${toolName}`, {
    arguments: args,
  });
  return response.data;
};
