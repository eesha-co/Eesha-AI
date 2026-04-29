'use client';

import { useCallback, useRef, useState } from 'react';
import { useChatStore, type AgentName } from '@/stores/chat-store';
import { useWorkspaceStore } from '@/stores/workspace-store';

export function useChat() {
  const {
    addConversation,
    addMessage,
    updateLastAssistantMessage,
    setIsStreaming,
    activeConversationId,
    updateConversationTitle,
    appendAgentContent,
    appendAgentThinking,
    setActiveAgent,
    setPipelineStatus,
    setAgentStatus,
  } = useChatStore();

  const refreshFiles = useWorkspaceStore((s) => s.refreshFiles);

  const abortControllerRef = useRef<AbortController | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sendMessage = useCallback(
    async (content: string) => {
      setError(null);
      if (!content.trim()) return;

      let conversationId = activeConversationId;

      if (!conversationId) {
        try {
          const res = await fetch('/api/conversations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: 'New Chat' }),
          });
          const conv = await res.json();
          conversationId = conv.id;
          addConversation({ ...conv, messages: [] });
        } catch {
          setError('Failed to create conversation');
          return;
        }
      }

      const userMessage = {
        id: `user-${Date.now()}`,
        role: 'user' as const,
        content,
        createdAt: new Date().toISOString(),
      };
      addMessage(conversationId, userMessage);

      const assistantMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant' as const,
        content: '',
        agentSections: [],
        activeAgent: null as AgentName | null,
        pipelineStatus: null as string | null,
        createdAt: new Date().toISOString(),
      };
      addMessage(conversationId, assistantMessage);

      const conversation = useChatStore.getState().conversations.find(
        (c) => c.id === conversationId
      );
      const apiMessages = (conversation?.messages ?? [])
        .filter((m) => m.id !== assistantMessage.id)
        .map((m) => ({ role: m.role, content: m.content }));

      setIsStreaming(true);

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: apiMessages, conversationId }),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error || `HTTP ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error('No reader available');

        const decoder = new TextDecoder();
        let fullContent = '';
        let toolExecuted = false;
        let sseBuffer = '';

        // Track agent contents for building the final fullContent
        const agentContents: Record<string, string> = { specialist: '', critic: '', judge: '' };
        let currentAgent: AgentName | null = null;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          sseBuffer += decoder.decode(value, { stream: true });
          const lines = sseBuffer.split('\n');
          sseBuffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data: ')) continue;

            const data = trimmed.slice(6);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              const eventType = parsed.type;

              // ── Multi-agent events ────────────────────────────────────

              if (eventType === 'pipeline_status') {
                setPipelineStatus(conversationId, parsed.status);
                if (parsed.message) {
                  // Optionally display the pipeline message
                }
              }

              if (eventType === 'agent_status') {
                const agent = parsed.agent as AgentName;
                const status = parsed.status as string;
                setAgentStatus(conversationId, agent, status as any);
                setActiveAgent(conversationId, agent);

                if (status === 'thinking' || status === 'generating') {
                  currentAgent = agent;
                }
              }

              if (eventType === 'agent_content') {
                const agent = parsed.agent as AgentName;
                const agentContent = parsed.content || '';
                currentAgent = agent;

                // Append to the specific agent section
                appendAgentContent(conversationId, agent, agentContent);
                agentContents[agent] += agentContent;

                // Update the main content with the latest agent content (judge takes priority)
                // Build fullContent from all agents for backward compatibility
                if (agent === 'judge') {
                  // The judge's content becomes the primary response
                  fullContent = agentContents.judge;
                  updateLastAssistantMessage(conversationId, fullContent);
                } else if (!agentContents.judge) {
                  // While no judge content yet, show combined
                  fullContent = buildCombinedContent(agentContents);
                  updateLastAssistantMessage(conversationId, fullContent);
                }
              }

              if (eventType === 'agent_thinking') {
                const agent = parsed.agent as AgentName;
                const thinkingContent = parsed.content || '';
                appendAgentThinking(conversationId, agent, thinkingContent);
              }

              // ── Legacy events (tool handling) ─────────────────────────

              if (eventType === 'content' && parsed.content) {
                fullContent += parsed.content;
                updateLastAssistantMessage(conversationId, fullContent);
              }

              if (eventType === 'tool_start') {
                toolExecuted = true;
                const toolLabel = getToolLabel(parsed.tool, parsed.path, parsed.command);
                fullContent += `\n\n${toolLabel}\n`;
                updateLastAssistantMessage(conversationId, fullContent);
              }

              if (eventType === 'tool_result' && parsed.result) {
                const resultText = formatToolResult(parsed.tool, parsed.result);
                fullContent += `${resultText}\n`;
                updateLastAssistantMessage(conversationId, fullContent);
              }

              if (eventType === 'error') {
                console.error('Stream error:', parsed.content);
                if (fullContent) {
                  fullContent += `\n\n*Note: There was an issue with the response. Some content may be incomplete.*`;
                  updateLastAssistantMessage(conversationId, fullContent);
                } else {
                  fullContent = 'I encountered an issue processing your request. Please try again.';
                  updateLastAssistantMessage(conversationId, fullContent);
                }
                setError(parsed.content);
              }
            } catch { /* skip malformed JSON */ }
          }
        }

        // Refresh workspace if tools were executed
        if (toolExecuted) {
          refreshFiles();
        }

        // Update title on first message
        const currentConv = useChatStore.getState().conversations.find(
          (c) => c.id === conversationId
        );
        if (currentConv && currentConv.messages.filter((m) => m.role === 'user').length === 1) {
          const newTitle = content.slice(0, 60) + (content.length > 60 ? '...' : '');
          updateConversationTitle(conversationId, newTitle);
          fetch('/api/conversations', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: conversationId, title: newTitle }),
          }).catch(() => {});
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }

        const msg = err instanceof Error ? err.message : 'Failed to get response';
        console.error('Chat error:', msg);
        setError(msg);

        const currentConv = useChatStore.getState().conversations.find(
          (c) => c.id === conversationId
        );
        const lastMsg = currentConv?.messages[currentConv.messages.length - 1];
        if (!lastMsg?.content || lastMsg.content.trim() === '') {
          updateLastAssistantMessage(
            conversationId,
            'I encountered an issue processing your request. Please try again.'
          );
        }
      } finally {
        setIsStreaming(false);
        setActiveAgent(conversationId, null);
        abortControllerRef.current = null;
      }
    },
    [activeConversationId, addConversation, addMessage, updateLastAssistantMessage, setIsStreaming, updateConversationTitle, refreshFiles, appendAgentContent, appendAgentThinking, setActiveAgent, setPipelineStatus, setAgentStatus]
  );

  const stopStreaming = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  return { sendMessage, stopStreaming, error, setError };
}

// ─── Helper functions ─────────────────────────────────────────────────────────

function buildCombinedContent(agentContents: Record<string, string>): string {
  const parts: string[] = [];
  if (agentContents.specialist) {
    parts.push(`---\n🟦 **Specialist Draft**\n---\n${agentContents.specialist}`);
  }
  if (agentContents.critic) {
    parts.push(`---\n🟧 **Critic Review**\n---\n${agentContents.critic}`);
  }
  return parts.join('\n\n');
}

function getToolLabel(tool: string, filePath: string, command: string): string {
  switch (tool) {
    case 'create_file':
      return `**Creating file:** \`${filePath}\``;
    case 'edit_file':
      return `**Editing file:** \`${filePath}\``;
    case 'read_file':
      return `**Reading file:** \`${filePath}\``;
    case 'delete_file':
      return `**Deleting:** \`${filePath}\``;
    case 'list_dir':
      return `**Listing directory:** \`${filePath || '/'}\``;
    case 'run_command':
      return `**Running command:** \`${command}\``;
    default:
      return `**Executing:** ${tool}`;
  }
}

function formatToolResult(tool: string, result: string): string {
  const maxLength = 2000;
  const truncated = result.length > maxLength
    ? result.slice(0, maxLength) + '\n... (output truncated)'
    : result;

  switch (tool) {
    case 'create_file':
      return `<details><summary>File created</summary>\n\n\`\`\`\n${truncated}\n\`\`\`\n</details>`;
    case 'edit_file':
      return `<details><summary>File edited</summary>\n\n\`\`\`\n${truncated}\n\`\`\`\n</details>`;
    case 'run_command':
      return `<details><summary>Command output</summary>\n\n\`\`\`\n${truncated}\n\`\`\`\n</details>`;
    case 'read_file':
      return `<details><summary>File contents</summary>\n\n\`\`\`\n${truncated}\n\`\`\`\n</details>`;
    case 'delete_file':
      return truncated;
    case 'list_dir':
      return `<details><summary>Directory listing</summary>\n\n\`\`\`\n${truncated}\n\`\`\`\n</details>`;
    default:
      return truncated;
  }
}
