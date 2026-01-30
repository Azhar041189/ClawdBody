'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, Loader2, Bot, User, AlertCircle, RefreshCw, Sparkles, Zap, Brain, Trash2 } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

interface Message {
  id: string
  role: 'user' | 'assistant' | 'error'
  content: string
  timestamp: Date
}

interface ClawdbotChatProps {
  vmId?: string
  className?: string
}

export function ClawdbotChat({ vmId, className = '' }: ClawdbotChatProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingHistory, setIsLoadingHistory] = useState(true)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [isClearing, setIsClearing] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const hasLoadedRef = useRef(false)

  // Generate a stable session ID based on vmId
  const getSessionId = useCallback(() => {
    if (sessionId) return sessionId
    // Use vmId as session ID if available, otherwise generate one
    const newSessionId = vmId ? `vm-${vmId}` : `chat-${Date.now()}`
    setSessionId(newSessionId)
    return newSessionId
  }, [vmId, sessionId])

  // Load chat history on mount
  useEffect(() => {
    if (hasLoadedRef.current) return
    hasLoadedRef.current = true

    const loadMessages = async () => {
      try {
        const params = new URLSearchParams()
        if (vmId) {
          params.set('vmId', vmId)
        }
        // Also try to load by session if we have one
        const currentSessionId = vmId ? `vm-${vmId}` : null
        if (currentSessionId) {
          params.set('sessionId', currentSessionId)
        }

        const response = await fetch(`/api/chat/clawdbot/messages?${params}`)
        if (response.ok) {
          const data = await response.json()
          if (data.messages && data.messages.length > 0) {
            // Convert database messages to UI format
            const loadedMessages: Message[] = data.messages.map((msg: any) => ({
              id: msg.id,
              role: msg.role as 'user' | 'assistant' | 'error',
              content: msg.content,
              timestamp: new Date(msg.createdAt),
            }))
            setMessages(loadedMessages)
            // Set session ID from first message if available
            if (data.messages[0]?.sessionId) {
              setSessionId(data.messages[0].sessionId)
            }
            
            // Check if the last message is from the user and was sent recently
            // This indicates a response might still be pending (user refreshed during loading)
            const lastMessage = loadedMessages[loadedMessages.length - 1]
            if (lastMessage && lastMessage.role === 'user') {
              const timeSinceLastMessage = Date.now() - lastMessage.timestamp.getTime()
              const TWO_MINUTES = 2 * 60 * 1000
              if (timeSinceLastMessage < TWO_MINUTES) {
                // Show loading indicator - response might still be coming
                setIsLoading(true)
                // Auto-clear loading after a timeout in case the response was lost
                setTimeout(() => setIsLoading(false), 60000) // Clear after 1 minute
              }
            }
          }
        }
      } catch (error) {
        console.error('Failed to load chat history:', error)
      } finally {
        setIsLoadingHistory(false)
      }
    }

    loadMessages()
  }, [vmId])

  // Save a message to the database
  const saveMessage = async (role: string, content: string, currentSessionId: string) => {
    try {
      await fetch('/api/chat/clawdbot/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vmId,
          sessionId: currentSessionId,
          role,
          content,
        }),
      })
    } catch (error) {
      console.error('Failed to save message:', error)
    }
  }

  // Auto-scroll to bottom when new messages arrive (within container only, not the page)
  const scrollToBottom = useCallback(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight
    }
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  // Focus input on mount (after loading completes)
  useEffect(() => {
    if (!isLoadingHistory) {
      inputRef.current?.focus()
    }
  }, [isLoadingHistory])

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return

    const currentSessionId = getSessionId()

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    }

    setMessages(prev => [...prev, userMessage])
    setInput('')
    setIsLoading(true)

    // Save user message to database
    saveMessage('user', userMessage.content, currentSessionId)

    try {
      const response = await fetch('/api/chat/clawdbot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage.content,
          vmId,
          sessionId: currentSessionId,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send message')
      }

      // Store session ID for continued conversation
      if (data.sessionId) {
        setSessionId(data.sessionId)
      }

      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: data.response || 'No response received',
        timestamp: new Date(),
      }

      setMessages(prev => [...prev, assistantMessage])
      
      // Save assistant message to database
      saveMessage('assistant', assistantMessage.content, data.sessionId || currentSessionId)

    } catch (error) {
      const errorMessage: Message = {
        id: `error-${Date.now()}`,
        role: 'error',
        content: error instanceof Error ? error.message : 'An error occurred',
        timestamp: new Date(),
      }
      setMessages(prev => [...prev, errorMessage])
      
      // Save error message to database too
      saveMessage('error', errorMessage.content, currentSessionId)
    } finally {
      setIsLoading(false)
      inputRef.current?.focus()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const clearChat = async () => {
    if (isClearing) return
    
    setIsClearing(true)
    try {
      // Delete from database
      const params = new URLSearchParams()
      if (vmId) {
        params.set('vmId', vmId)
      } else if (sessionId) {
        params.set('sessionId', sessionId)
      }
      
      if (params.toString()) {
        await fetch(`/api/chat/clawdbot/messages?${params}`, {
          method: 'DELETE',
        })
      }
      
      // Clear local state
      setMessages([])
      setSessionId(null)
    } catch (error) {
      console.error('Failed to clear chat:', error)
    } finally {
      setIsClearing(false)
    }
  }

  const suggestions = [
    { text: 'What tasks are in my vault?', icon: Brain },
    { text: 'Check my calendar', icon: Zap },
    { text: 'Summarize my projects', icon: Sparkles },
  ]

  // Show loading state while fetching history
  if (isLoadingHistory) {
    return (
      <div className={`flex flex-col h-full items-center justify-center ${className}`}>
        <Loader2 className="w-8 h-8 animate-spin text-sam-accent mb-3" />
        <p className="text-sm text-sam-text-dim">Loading chat history...</p>
      </div>
    )
  }

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Messages area */}
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto min-h-0">
        {messages.length === 0 ? (
          /* Empty state - clean and centered */
          <div className="flex flex-col items-center justify-center h-full px-6 py-8">
            {/* Animated bot icon */}
            <motion.div 
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.4 }}
              className="relative mb-6"
            >
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-sam-accent/20 to-purple-500/20 flex items-center justify-center border border-sam-accent/20">
                <Bot className="w-10 h-10 text-sam-accent" />
              </div>
              <motion.div
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-green-500 border-2 border-sam-bg"
              />
            </motion.div>

            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.1, duration: 0.4 }}
              className="text-center max-w-md"
            >
              <h3 className="text-xl font-display font-bold text-sam-text mb-2">
                Chat with Clawdbot
              </h3>
              <p className="text-sam-text-dim text-sm leading-relaxed">
                Your AI assistant is ready. Ask questions, manage tasks, or let Clawdbot help with anything on your VM.
              </p>
            </motion.div>

            {/* Suggestion chips */}
            <motion.div 
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.4 }}
              className="flex flex-wrap gap-2 justify-center mt-6"
            >
              {suggestions.map((suggestion, index) => (
                <motion.button
                  key={suggestion.text}
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.3 + index * 0.1 }}
                  onClick={() => setInput(suggestion.text)}
                  className="flex items-center gap-2 px-4 py-2 rounded-full bg-sam-surface/60 border border-sam-border hover:border-sam-accent/50 hover:bg-sam-surface text-sam-text-dim hover:text-sam-text transition-all group"
                >
                  <suggestion.icon className="w-3.5 h-3.5 text-sam-accent group-hover:scale-110 transition-transform" />
                  <span className="text-sm">{suggestion.text}</span>
                </motion.button>
              ))}
            </motion.div>
          </div>
        ) : (
          /* Messages list */
          <div className="p-4 space-y-4">
            {/* Session indicator with clear button */}
            <div className="flex items-center justify-center gap-2 mb-4">
              <div className="h-px flex-1 bg-sam-border" />
              <span className="text-xs text-sam-text-dim px-3 py-1 rounded-full bg-sam-surface/50 border border-sam-border">
                {messages.length} message{messages.length !== 1 ? 's' : ''}
              </span>
              <button
                onClick={clearChat}
                disabled={isClearing}
                className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded-full hover:bg-red-500/10 transition-colors flex items-center gap-1 disabled:opacity-50"
                title="Delete all messages"
              >
                {isClearing ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Trash2 className="w-3 h-3" />
                )}
                Clear
              </button>
              <div className="h-px flex-1 bg-sam-border" />
            </div>

            <AnimatePresence initial={false}>
              {messages.map((message) => (
                <motion.div
                  key={message.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                  className={`flex gap-3 ${message.role === 'user' ? 'flex-row-reverse' : ''}`}
                >
                  {/* Avatar */}
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    message.role === 'user' 
                      ? 'bg-sam-accent' 
                      : message.role === 'error'
                      ? 'bg-red-500/20 border border-red-500/30'
                      : 'bg-gradient-to-br from-purple-500/30 to-sam-accent/20 border border-purple-500/30'
                  }`}>
                    {message.role === 'user' ? (
                      <User className="w-4 h-4 text-sam-bg" />
                    ) : message.role === 'error' ? (
                      <AlertCircle className="w-4 h-4 text-red-400" />
                    ) : (
                      <Bot className="w-4 h-4 text-purple-300" />
                    )}
                  </div>

                  {/* Message bubble */}
                  <div className={`max-w-[75%] rounded-2xl px-4 py-3 ${
                    message.role === 'user'
                      ? 'bg-sam-accent text-sam-bg rounded-tr-md'
                      : message.role === 'error'
                      ? 'bg-red-500/10 border border-red-500/20 text-red-300 rounded-tl-md'
                      : 'bg-sam-surface/80 border border-sam-border text-sam-text rounded-tl-md'
                  }`}>
                    <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">{message.content}</p>
                    <p className={`text-[10px] mt-2 ${
                      message.role === 'user' ? 'text-sam-bg/50' : 'text-sam-text-dim'
                    }`}>
                      {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {/* Loading indicator */}
            {isLoading && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex gap-3"
              >
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-500/30 to-sam-accent/20 border border-purple-500/30 flex items-center justify-center">
                  <Bot className="w-4 h-4 text-purple-300" />
                </div>
                <div className="bg-sam-surface/80 border border-sam-border rounded-2xl rounded-tl-md px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex gap-1">
                      {[0, 1, 2].map((i) => (
                        <motion.div
                          key={i}
                          animate={{ y: [0, -4, 0] }}
                          transition={{ repeat: Infinity, duration: 0.6, delay: i * 0.1 }}
                          className="w-2 h-2 rounded-full bg-sam-accent/60"
                        />
                      ))}
                    </div>
                    <span className="text-sm text-sam-text-dim">Thinking...</span>
                  </div>
                </div>
              </motion.div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input area - prominent and connected */}
      <div className="p-4 bg-gradient-to-t from-sam-bg via-sam-bg to-transparent">
        <div className="flex gap-3">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message Clawdbot..."
            rows={1}
            className="flex-1 px-4 py-3 h-12 rounded-xl bg-sam-surface/80 border-2 border-sam-border focus:border-sam-accent outline-none resize-none text-sm transition-all placeholder:text-sam-text-dim/50 box-border"
            disabled={isLoading}
          />
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={sendMessage}
            disabled={!input.trim() || isLoading}
            className="w-12 h-12 rounded-xl bg-sam-accent text-sam-bg hover:bg-sam-accent-dim disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center shadow-lg shadow-sam-accent/20 flex-shrink-0"
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </motion.button>
        </div>
        <p className="text-[11px] text-sam-text-dim/60 mt-2 text-center">
          Press <kbd className="px-1.5 py-0.5 rounded bg-sam-surface/50 border border-sam-border text-[10px] font-mono">Enter</kbd> to send · <kbd className="px-1.5 py-0.5 rounded bg-sam-surface/50 border border-sam-border text-[10px] font-mono">Shift+Enter</kbd> for new line
        </p>
      </div>
    </div>
  )
}
