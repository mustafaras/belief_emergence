import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { ChevronDown, Send, Eye, EyeOff, Trash2, User, Bot, Copy, RotateCcw, X, Download, Keyboard, Hash, Check, FileText } from 'lucide-react'
import jsPDF from 'jspdf'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import type { BeliefParameters } from '../../types'
import type { ModelCalculationResult } from '../../utils/calculateModel'
import { formatNumeric } from '../../utils/formatNumeric'
import { DEFAULT_SYSTEM_PROMPT, estimateAiTokens, INITIAL_INTERPRETATION_PROMPT } from './tokenEstimate'
import './AiInterpreterModal.css'
import 'katex/dist/katex.min.css'

type AiInterpreterSnapshot = {
  presetName?: string
  params: BeliefParameters
  structuralBase: number
  context?: {
    presetName?: string
    modifiersAreStandardized?: boolean
  }
  coefficients?: Record<string, number>
  model: {
    Z: number
    phi: number
    phiComponents: ModelCalculationResult['phiComponents']
    derivedMetrics?: ModelCalculationResult['derivedMetrics']
    mainEffectTerms?: Array<{ name: string; value?: number; contribution?: number }>
    interactionTerms?: Array<{ name: string; value?: number; contribution?: number }>
    quadraticTerms?: Array<{ name: string; value?: number; contribution?: number }>
  }
  formulaDisplayDerived?: Record<string, number>
}

type AiInterpreterModalProps = {
  isOpen: boolean
  onClose: () => void
  snapshot: AiInterpreterSnapshot
}

const API_KEY_STORAGE_KEY = 'aiInterpreter.openaiApiKey'
const SYSTEM_PROMPT_STORAGE_KEY = 'aiInterpreter.systemPrompt'
const CHAT_HISTORY_STORAGE_KEY = 'aiInterpreter.chatHistory'

type ChatMessage = { 
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  id: string
}

const QUICK_QUESTIONS = [
  'What contributes most to Z in this state?',
  'Top 3 contributors to Φ?',
  'How would Φ change if...?',
  'Explain the interaction terms',
  'Model-implied effect if X increases?',
  'Compare to baseline scenario'
]

const MODEL_OPTIONS = [
  { value: 'gpt-4o', label: 'GPT-4o (Latest, Fastest)' },
  { value: 'gpt-4-turbo', label: 'GPT-4 Turbo (High Performance)' },
  { value: 'gpt-5.2', label: 'GPT-5.2 Thinking (Advanced Reasoning)' },
  { value: 'o1', label: 'o1 (Reasoning Model)' },
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini (Efficient)' },
]

// Name → Coefficient key mapping for transparency
const TERM_COEFFICIENT_MAP: Record<string, { key: string; formula: string }> = {
  // Main effects: display name -> coefficient key
  'c1_Culture': { key: 'c1', formula: 'C_std' },
  'c2_Media': { key: 'c2', formula: 'M_std' },
  'c3_Trauma': { key: 'c3', formula: 'T_std' },
  'c4_Atomization': { key: 'c4', formula: 'D_std' },
  'c5_Redistribution': { key: 'c5', formula: 'G_std' },
  'c6_Education': { key: 'c6', formula: 'E_std' },
  'c7_SocialSupport': { key: 'c7', formula: 'S_std' },
  'c8_Welfare': { key: 'c8', formula: 'R_std' },
  // Interactions: display name -> coefficient key + formula
  'Y_x_R': { key: 'c_yr', formula: 'Y_safe × R_std' },
  'T_x_R': { key: 'c_tr', formula: 'T_std × R_std' },
  'X_x_Y': { key: 'c_xy', formula: 'X_safe × Y_safe' },
  'C_x_M': { key: 'c_cm', formula: 'C_std × M_std' },
  'E_x_S': { key: 'c_es', formula: 'E_std × S_std' },
  'D_x_T': { key: 'c_dt', formula: 'D_std × T_std' },
  'G_x_R': { key: 'c_gr', formula: 'G_std × R_std' },
  // Quadratics: display name -> coefficient key + formula
  'C_squared': { key: 'c_c2', formula: 'C_std²' },
  'M_squared': { key: 'c_m2', formula: 'M_std²' },
  'T_squared': { key: 'c_t2', formula: 'T_std²' },
  'E_squared': { key: 'c_e2', formula: 'E_std²' },
}

export default function AiInterpreterModal({ isOpen, onClose, snapshot }: AiInterpreterModalProps) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [error, setError] = useState<string>('')

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [expandSystemPrompt, setExpandSystemPrompt] = useState(false)
  const [expandApiKey, setExpandApiKey] = useState(false)
  const [expandFormulaDetails, setExpandFormulaDetails] = useState(false)
  const [expandAdvancedSettings, setExpandAdvancedSettings] = useState(false)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null)
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null)
  
  // Advanced settings
  const [temperature, setTemperature] = useState(0.2)
  const [maxTokens, setMaxTokens] = useState(2000)
  const [modelName, setModelName] = useState('gpt-4o')

  const [apiKey, setApiKey] = useState<string>(() => {
    if (typeof window === 'undefined') return ''
    try {
      return window.localStorage.getItem(API_KEY_STORAGE_KEY) ?? ''
    } catch {
      return ''
    }
  })
  const [showApiKey, setShowApiKey] = useState(false)

  const [systemPrompt, setSystemPrompt] = useState<string>(() => {
    if (typeof window === 'undefined') return DEFAULT_SYSTEM_PROMPT
    try {
      return window.localStorage.getItem(SYSTEM_PROMPT_STORAGE_KEY) ?? DEFAULT_SYSTEM_PROMPT
    } catch {
      return DEFAULT_SYSTEM_PROMPT
    }
  })

  const modalRef = useRef<HTMLDivElement | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)
  const chatEndRef = useRef<HTMLDivElement | null>(null)

  const composerRef = useRef<HTMLInputElement | null>(null)

  const systemPromptAria = {
    'aria-expanded': expandSystemPrompt ? 'true' : 'false',
    'aria-controls': 'system-prompt-content',
  } as const

  const apiKeyAria = {
    'aria-expanded': expandApiKey ? 'true' : 'false',
    'aria-controls': 'api-key-content',
  } as const

  const advancedSettingsAria = {
    'aria-expanded': expandAdvancedSettings ? 'true' : 'false',
    'aria-controls': 'advanced-settings-content',
  } as const

  const formulaDetailsAria = {
    'aria-expanded': expandFormulaDetails ? 'true' : 'false',
    'aria-controls': 'formula-details-content',
  } as const

  const copyToClipboard = useCallback(async (text: string, messageId: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedMessageId(messageId)
      setTimeout(() => setCopiedMessageId(null), 2000)
    } catch {
      // Ignore clipboard errors
    }
  }, [])

  const clearChat = useCallback(() => {
    if (confirm('Clear all messages?')) {
      setMessages([])
      setError('')
      setStatus('idle')
    }
  }, [])

  const exportChat = useCallback(() => {
    const data = JSON.stringify({ messages, snapshot, timestamp: Date.now() }, null, 2)
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ai-chat-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [messages, snapshot])

  const sendMessage = useCallback(async (userText: string) => {
    const trimmed = userText.trim()
    if (!trimmed) return

    const userMsg: ChatMessage = {
      role: 'user',
      content: trimmed,
      timestamp: Date.now(),
      id: `user-${Date.now()}`
    }

    const history = messages
    setMessages((prev) => [...prev, userMsg])
    setStatus('loading')
    setError('')

    try {
      const key = apiKey.trim()
      const res = await fetch('/api/ai/interpret', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(key ? { 'X-OpenAI-Api-Key': key } : {}),
        },
        body: JSON.stringify({
          snapshot,
          systemPrompt,
          userMessage: trimmed,
          history,
        }),
      })

      const data = (await res.json().catch(() => null)) as { text?: string; error?: string } | null
      if (!res.ok) {
        throw new Error(data?.error || `Request failed (${res.status})`)
      }
      const text = data?.text
      if (!text) {
        throw new Error('Empty AI response')
      }

      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: text,
        timestamp: Date.now(),
        id: `assistant-${Date.now()}`
      }

      setMessages((prev) => [...prev, assistantMsg])
      setStatus('done')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setStatus('error')
    }
  }, [messages, apiKey, snapshot, systemPrompt])

  const regenerateLastResponse = useCallback(() => {
    const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user')
    if (lastUserMessage) {
      setMessages((prev) => prev.filter((m) => m.timestamp <= lastUserMessage.timestamp))
      void sendMessage(lastUserMessage.content)
    }
  }, [messages, sendMessage])

  const totalTokens = useMemo(
    () => estimateAiTokens(systemPrompt, messages),
    [messages, systemPrompt],
  )

  const brief = useMemo(() => {
    const { params, model } = snapshot
    return {
      Z: formatNumeric(model.Z, 4),
      Phi: formatNumeric(model.phi, 4),
      X: formatNumeric(params.X, 2),
      Y: formatNumeric(params.Y, 2),
      C: formatNumeric(params.C, 2),
      M: formatNumeric(params.M, 2),
      T: formatNumeric(params.T, 2),
      D: formatNumeric(params.D, 2),
      G: formatNumeric(params.G, 2),
      E: formatNumeric(params.E, 2),
      S: formatNumeric(params.S, 2),
      R: formatNumeric(params.R, 2),
    }
  }, [snapshot])

  const exportPdf = useCallback(() => {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    })

    const pageWidth = doc.internal.pageSize.getWidth()
    const pageHeight = doc.internal.pageSize.getHeight()
    const margin = 12
    const lineHeight = 5
    let yPos = margin

    // Title
    doc.setFontSize(20)
    doc.setFont('helvetica', 'bold')
    doc.text('AI Interpreter Scientific Report', pageWidth / 2, yPos, { align: 'center' })
    yPos += 10

    // Timestamp
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.text(`Generated: ${new Date().toISOString()}`, pageWidth / 2, yPos, { align: 'center' })
    yPos += 8

    // Model & Settings Section
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.text('Model Configuration', margin, yPos)
    yPos += 6

    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    const settingsText = [
      `Model: ${modelName}`,
      `Temperature: ${temperature}`,
      `Max Tokens: ${maxTokens}`,
      `Total Message Tokens: ${totalTokens}`
    ]
    settingsText.forEach((text) => {
      doc.text(text, margin + 5, yPos)
      yPos += lineHeight
    })
    yPos += 3

    // State Summary Section
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.text('Model State Summary', margin, yPos)
    yPos += 6

    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    const stateText = [
      `Z (Belief Outcome): ${brief.Z}`,
      `Φ (Latent Field Strength): ${brief.Phi}`,
      `C (Culture): ${brief.C}`,
      `M (Media): ${brief.M}`,
      `T (Trauma): ${brief.T}`,
      `D (Atomization): ${brief.D}`,
      `G (Redistribution): ${brief.G}`,
      `E (Education): ${brief.E}`,
      `S (Social Support): ${brief.S}`,
      `R (Welfare): ${brief.R}`
    ]
    stateText.forEach((text) => {
      if (yPos > pageHeight - margin - 20) {
        doc.addPage()
        yPos = margin
      }
      doc.text(text, margin + 5, yPos)
      yPos += lineHeight
    })
    yPos += 5

    // System Prompt Section
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.text('System Instructions', margin, yPos)
    yPos += 6

    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    const promptLines = doc.splitTextToSize(systemPrompt, pageWidth - 2 * margin - 5) as string[]
    promptLines.slice(0, 15).forEach((line: string) => {
      if (yPos > pageHeight - margin - 20) {
        doc.addPage()
        yPos = margin
      }
      doc.text(line, margin + 5, yPos)
      yPos += lineHeight * 0.8
    })
    if (promptLines.length > 15) {
      doc.text('[... see modal for complete prompt]', margin + 5, yPos)
      yPos += lineHeight
    }
    yPos += 5

    // Conversation Section
    if (messages.length > 0) {
      doc.setFontSize(12)
      doc.setFont('helvetica', 'bold')
      doc.text('Conversation Transcript', margin, yPos)
      yPos += 6

      messages.forEach((msg) => {
        if (yPos > pageHeight - margin - 15) {
          doc.addPage()
          yPos = margin
        }

        const speaker = msg.role === 'user' ? 'Q' : 'A'
        const timestamp = new Date(msg.timestamp).toLocaleTimeString()

        doc.setFontSize(10)
        doc.setFont('helvetica', 'bold')
        doc.text(`${speaker} [${timestamp}]`, margin + 3, yPos)
        yPos += lineHeight

        doc.setFontSize(9)
        doc.setFont('helvetica', 'normal')
        const contentLines = doc.splitTextToSize(msg.content, pageWidth - 2 * margin - 8) as string[]
        contentLines.slice(0, 10).forEach((line: string) => {
          if (yPos > pageHeight - margin - 10) {
            doc.addPage()
            yPos = margin
          }
          doc.text(line, margin + 5, yPos)
          yPos += lineHeight * 0.85
        })
        if (contentLines.length > 10) {
          doc.text('[... message truncated in PDF]', margin + 5, yPos)
          yPos += lineHeight * 0.85
        }
        yPos += 2
      })
    }

    // Footer
    const pageCount = doc.getNumberOfPages()
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i)
      doc.setFontSize(8)
      doc.setFont('helvetica', 'normal')
      doc.text(`Page ${i} of ${pageCount}`, pageWidth / 2, pageHeight - 8, { align: 'center' })
    }

    doc.save(`ai-interpreter-${Date.now()}.pdf`)
  }, [messages, modelName, temperature, maxTokens, totalTokens, systemPrompt, brief])

  // Load chat history on mount
  useEffect(() => {
    if (!isOpen) return
    try {
      const saved = localStorage.getItem(CHAT_HISTORY_STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved) as ChatMessage[]
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(parsed)
          setStatus('done')
          return
        }
      }
    } catch {
      // Ignore
    }
    
    // If no history, send initial message
    setStatus('idle')
    setError('')
    setMessages([])
    closeButtonRef.current?.focus()
    void sendMessage(INITIAL_INTERPRETATION_PROMPT)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  // Save chat history on messages change
  useEffect(() => {
    if (messages.length > 0) {
      try {
        localStorage.setItem(CHAT_HISTORY_STORAGE_KEY, JSON.stringify(messages))
      } catch {
        // Ignore
      }
    }
  }, [messages])

  useEffect(() => {
    if (!isOpen) return
    chatEndRef.current?.scrollIntoView({ block: 'end' })
  }, [isOpen, messages, status])

  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape: Close modal
      if (e.key === 'Escape') {
        onClose()
        return
      }

      // Ctrl+K: Focus composer
      if (e.ctrlKey && e.key === 'k') {
        e.preventDefault()
        composerRef.current?.focus()
        return
      }

      // Ctrl+L: Clear chat
      if (e.ctrlKey && e.key === 'l') {
        e.preventDefault()
        clearChat()
        return
      }

      // Ctrl+/: Toggle shortcuts
      if (e.ctrlKey && e.key === '/') {
        e.preventDefault()
        setShowShortcuts((v) => !v)
        return
      }

      // Ctrl+S: Export chat
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault()
        exportChat()
        return
      }

      // Ctrl+P: Export PDF
      if (e.ctrlKey && e.key === 'p') {
        e.preventDefault()
        exportPdf()
        return
      }

      // Ctrl+Shift+R: Regenerate
      if (e.ctrlKey && e.shiftKey && e.key === 'r') {
        e.preventDefault()
        regenerateLastResponse()
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose, clearChat, exportChat, exportPdf, regenerateLastResponse])

  // Fallback contribution calculator: prefer provided contribution; else use provided value (already a contribution);
  // only as a last resort try coeff lookup (name→coeff mapping may differ and value may not be a raw factor).
  const getTermContribution = useCallback(
    (term: { name: string; value?: number; contribution?: number }) => {
      const c = term.contribution
      if (typeof c === 'number' && Number.isFinite(c) && !Number.isNaN(c)) return c

      // Many interaction/quadratic terms expose `value` as the final contribution.
      const vDirect = term.value
      if (typeof vDirect === 'number' && Number.isFinite(vDirect) && !Number.isNaN(vDirect)) return vDirect

      // Last-resort attempt: try to multiply a coefficient (if keyed identically) by value.
      // Note: In our model, coefficient keys (e.g., c_yr) do not match display names (e.g., Y_x_R),
      // so this path will usually not fire; kept as a defensive fallback only.
      const coeff = snapshot.coefficients?.[term.name]
      if (typeof coeff === 'number' && typeof vDirect === 'number') {
        const v = coeff * vDirect
        if (Number.isFinite(v) && !Number.isNaN(v)) return v
      }
      return Number.NaN
    },
    [snapshot.coefficients]
  )

  if (!isOpen) return null

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose()
  }

  const handleApiKeyChange = (value: string) => {
    setApiKey(value)
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(API_KEY_STORAGE_KEY, value)
    } catch {
      // ignore storage failures
    }
  }

  const handleSystemPromptChange = (value: string) => {
    setSystemPrompt(value)
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(SYSTEM_PROMPT_STORAGE_KEY, value)
    } catch {
      // ignore storage failures
    }
  }

  const clearApiKey = () => {
    handleApiKeyChange('')
    setShowApiKey(false)
  }

  const formatFormulaValue = (val: number | undefined) => {
    if (typeof val !== 'number') return { text: 'N/A', className: '' }
    const formatted = Math.abs(val) < 0.0001 ? val.toExponential(4) : val.toFixed(6)
    const className = val > 0 ? 'ai-contrib-positive' : val < 0 ? 'ai-contrib-negative' : ''
    return { text: formatted, className }
  }

  

  const getTopContributions = (terms?: Array<{ name: string; value?: number; contribution?: number }>) => {
    if (!Array.isArray(terms)) return []
    return [...terms]
      .map((t) => ({ ...t, _contrib: getTermContribution(t) }))
      .sort((a, b) => (Math.abs(b._contrib || 0) - Math.abs(a._contrib || 0)))
      .slice(0, 5)
  }

  return (
    <div className="ai-modal-overlay" onClick={handleOverlayClick}>
      <div
        ref={modalRef}
        className="ai-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-modal-title"
        tabIndex={-1}
      >
        <div className="ai-modal-header">
          <div className="ai-modal-title-row">
            <h2 id="ai-modal-title" className="ai-modal-title">AI Interpreter</h2>
            
            <div className="ai-header-actions">
              <button
                type="button"
                className="ai-header-btn"
                onClick={() => setShowShortcuts((v) => !v)}
                title="Keyboard Shortcuts (Ctrl+/)"
                aria-label="Toggle keyboard shortcuts"
              >
                <Keyboard size={16} />
              </button>
              
              <button
                type="button"
                className="ai-header-btn"
                onClick={exportPdf}
                title="Export PDF (Ctrl+P)"
                aria-label="Export PDF"
              >
                <FileText size={16} />
              </button>
              
              <button
                type="button"
                className="ai-header-btn"
                onClick={exportChat}
                title="Export Chat (Ctrl+S)"
                aria-label="Export chat"
                disabled={messages.length === 0}
              >
                <Download size={16} />
              </button>
              
              <button
                type="button"
                className="ai-header-btn ai-header-btn--danger"
                onClick={clearChat}
                title="Clear Chat (Ctrl+L)"
                aria-label="Clear chat"
                disabled={messages.length === 0}
              >
                <Trash2 size={16} />
              </button>
              
              <div className="ai-token-counter" title={`Estimated tokens: ${totalTokens}`}>
                <Hash size={14} />
                <span>{totalTokens}</span>
              </div>
              
              <button
                ref={closeButtonRef}
                type="button"
                className="ai-modal-close"
                onClick={onClose}
                aria-label="Close AI interpreter"
              >
                <X size={20} aria-hidden="true" focusable="false" />
              </button>
            </div>
          </div>

          <div className="ai-modal-subtitle">
            Current state: Z={brief.Z} · Φ={brief.Phi} · X={brief.X} · Y={brief.Y}
            {snapshot.presetName ? ` · Preset: ${snapshot.presetName}` : ' · Preset: None'}
          </div>
        </div>

        <div className="ai-modal-body">
          {/* Left Sidebar: Settings & Details */}
          <div className="ai-modal-sidebar">
            {/* System Prompt Collapsible */}
            <div className="ai-modal-collapsible-section">
              <button
                type="button"
                className="ai-modal-collapsible-header"
                onClick={() => setExpandSystemPrompt((v) => !v)}
                {...systemPromptAria}
              >
                <ChevronDown
                  size={16}
                  className={`ai-icon-chevron ${expandSystemPrompt ? 'ai-icon--rotated' : ''}`}
                />
                <span>SYSTEM PROMPT</span>
              </button>

              {expandSystemPrompt && (
                <div id="system-prompt-content" className="ai-modal-collapsible-content">
                  <textarea
                    className="ai-modal-textarea"
                    value={systemPrompt}
                    onChange={(e) => handleSystemPromptChange(e.target.value)}
                    spellCheck={false}
                    aria-label="System prompt"
                  />
                  <div className="ai-modal-note small">
                    This prompt is sent as the Chat "system" message.
                  </div>
                </div>
              )}
            </div>

            {/* API Key Collapsible */}
            <div className="ai-modal-collapsible-section">
            <button
              type="button"
              className="ai-modal-collapsible-header"
              onClick={() => setExpandApiKey((v) => !v)}
              {...apiKeyAria}
            >
              <ChevronDown
                size={16}
                className={`ai-icon-chevron ${expandApiKey ? 'ai-icon--rotated' : ''}`}
              />
              <span>OPENAI API KEY</span>
            </button>

            {expandApiKey && (
              <div id="api-key-content" className="ai-modal-collapsible-content">
                <div className="ai-modal-key-row">
                  <input
                    className="ai-modal-key-input"
                    type={showApiKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={(e) => handleApiKeyChange(e.target.value)}
                    placeholder="Paste your API key (sk-...) — optional"
                    autoComplete="off"
                    inputMode="text"
                  />
                  <button
                    type="button"
                    className="ai-modal-key-btn"
                    onClick={() => setShowApiKey((v) => !v)}
                    title={showApiKey ? 'Hide API key' : 'Show API key'}
                    aria-label={showApiKey ? 'Hide API key' : 'Show API key'}
                  >
                    {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                  <button
                    type="button"
                    className="ai-modal-key-btn subtle"
                    onClick={clearApiKey}
                    title="Clear saved key"
                    aria-label="Clear API key"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                <div className="ai-modal-note small">
                  Stored locally in your browser (localStorage). Avoid using it on shared machines.
                </div>
              </div>
            )}
          </div>

          {/* Advanced Settings Collapsible */}
          <div className="ai-modal-collapsible-section">
            <button
              type="button"
              className="ai-modal-collapsible-header"
              onClick={() => setExpandAdvancedSettings((v) => !v)}
              {...advancedSettingsAria}
            >
              <ChevronDown
                size={16}
                className={`ai-icon-chevron ${expandAdvancedSettings ? 'ai-icon--rotated' : ''}`}
              />
              <span>ADVANCED SETTINGS</span>
            </button>

            {expandAdvancedSettings && (
              <div id="advanced-settings-content" className="ai-modal-collapsible-content">
                <div className="ai-advanced-settings">
                  <div className="ai-setting-row">
                    <label htmlFor="model-name" className="ai-setting-label">Model</label>
                    <select
                      id="model-name"
                      className="ai-setting-select"
                      value={modelName}
                      onChange={(e) => setModelName(e.target.value)}
                    >
                      {MODEL_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="ai-setting-row">
                    <label htmlFor="temperature" className="ai-setting-label">Temperature</label>
                    <input
                      id="temperature"
                      className="ai-setting-input ai-setting-input--number"
                      type="number"
                      min="0"
                      max="2"
                      step="0.1"
                      value={temperature}
                      onChange={(e) => setTemperature(parseFloat(e.target.value) || 0.2)}
                    />
                  </div>
                  <div className="ai-setting-row">
                    <label htmlFor="max-tokens" className="ai-setting-label">Max Tokens</label>
                    <input
                      id="max-tokens"
                      className="ai-setting-input ai-setting-input--number"
                      type="number"
                      min="100"
                      max="4000"
                      step="100"
                      value={maxTokens}
                      onChange={(e) => setMaxTokens(parseInt(e.target.value, 10) || 500)}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Formula Details Collapsible */}
          <div className="ai-modal-collapsible-section">
            <button
              type="button"
              className="ai-modal-collapsible-header"
              onClick={() => setExpandFormulaDetails((v) => !v)}
              {...formulaDetailsAria}
            >
              <ChevronDown
                size={16}
                className={`ai-icon-chevron ${expandFormulaDetails ? 'ai-icon--rotated' : ''}`}
              />
              <span>FORMULA DETAILS</span>
            </button>

            {expandFormulaDetails && (
              <div id="formula-details-content" className="ai-modal-collapsible-content">
                <div className="ai-formula-section">
                                    {/* Basic Model Info */}
                                    <div className="ai-formula-subsection">
                                      <div className="ai-formula-subsection-title">Model Output</div>
                                      <div className="ai-formula-term-list">
                                        <div className="ai-formula-term">
                                          <span className="ai-formula-term-name">Z (Belief Strength)</span>
                                          <span className="ai-formula-term-value">{brief.Z}</span>
                                        </div>
                                        <div className="ai-formula-term">
                                          <span className="ai-formula-term-name">φ (Phi)</span>
                                          <span className="ai-formula-term-value">{brief.Phi}</span>
                                        </div>
                                      </div>
                                    </div>

                  {/* Main Effects */}
                  {snapshot.model.mainEffectTerms && snapshot.model.mainEffectTerms.length > 0 && (
                    <div className="ai-formula-subsection">
                      <div className="ai-formula-subsection-title">Main Effects (Top 5 by |Contribution|)</div>
                      <div className="ai-formula-term-list">
                        {getTopContributions(snapshot.model.mainEffectTerms).map((term, idx) => {
                          const contrib = getTermContribution(term)
                          const estimated = !(
                            (typeof term.contribution === 'number' && !Number.isNaN(term.contribution)) ||
                            (typeof term.value === 'number' && !Number.isNaN(term.value))
                          )
                          const { text, className } = formatFormulaValue(contrib)
                          const mapping = TERM_COEFFICIENT_MAP[term.name]
                          const coeff = mapping ? snapshot.coefficients?.[mapping.key] : undefined
                          const coeffText = typeof coeff === 'number' ? coeff.toFixed(6) : '—'
                          const tooltipText = mapping ? `${mapping.formula} | coeff=${coeffText}` : ''
                          return (
                            <div key={idx} className="ai-formula-term" title={tooltipText}>
                              <span className="ai-formula-term-name">{term.name}</span>
                              <span className="ai-formula-term-formula">{mapping?.formula}</span>
                              <span className="ai-formula-term-coeff">{coeffText}</span>
                              <span className={`ai-formula-term-value ${className}`}>
                                {estimated ? '≈' : ''}{text}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Interactions */}
                  {snapshot.model.interactionTerms && snapshot.model.interactionTerms.length > 0 && (
                    <div className="ai-formula-subsection">
                      <div className="ai-formula-subsection-title">Interactions (Top 5 by |Contribution|)</div>
                      <div className="ai-formula-term-list">
                        {getTopContributions(snapshot.model.interactionTerms).map((term, idx) => {
                          const contrib = getTermContribution(term)
                          const estimated = !(
                            (typeof term.contribution === 'number' && !Number.isNaN(term.contribution)) ||
                            (typeof term.value === 'number' && !Number.isNaN(term.value))
                          )
                          const { text, className } = formatFormulaValue(contrib)
                          const mapping = TERM_COEFFICIENT_MAP[term.name]
                          const coeff = mapping ? snapshot.coefficients?.[mapping.key] : undefined
                          const coeffText = typeof coeff === 'number' ? coeff.toFixed(6) : '—'
                          const tooltipText = mapping ? `${mapping.formula} | coeff=${coeffText}` : ''
                          return (
                            <div key={idx} className="ai-formula-term" title={tooltipText}>
                              <span className="ai-formula-term-name">{term.name}</span>
                              <span className="ai-formula-term-formula">{mapping?.formula}</span>
                              <span className="ai-formula-term-coeff">{coeffText}</span>
                              <span className={`ai-formula-term-value ${className}`}>
                                {estimated ? '≈' : ''}{text}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Quadratic Terms */}
                  {snapshot.model.quadraticTerms && snapshot.model.quadraticTerms.length > 0 && (
                    <div className="ai-formula-subsection">
                      <div className="ai-formula-subsection-title">Quadratic Terms (Top 5 by |Contribution|)</div>
                      <div className="ai-formula-term-list">
                        {getTopContributions(snapshot.model.quadraticTerms).map((term, idx) => {
                          const contrib = getTermContribution(term)
                          const estimated = !(
                            (typeof term.contribution === 'number' && !Number.isNaN(term.contribution)) ||
                            (typeof term.value === 'number' && !Number.isNaN(term.value))
                          )
                          const { text, className } = formatFormulaValue(contrib)
                          const mapping = TERM_COEFFICIENT_MAP[term.name]
                          const coeff = mapping ? snapshot.coefficients?.[mapping.key] : undefined
                          const coeffText = typeof coeff === 'number' ? coeff.toFixed(6) : '—'
                          const tooltipText = mapping ? `${mapping.formula} | coeff=${coeffText}` : ''
                          return (
                            <div key={idx} className="ai-formula-term" title={tooltipText}>
                              <span className="ai-formula-term-name">{term.name}</span>
                              <span className="ai-formula-term-formula">{mapping?.formula}</span>
                              <span className="ai-formula-term-coeff">{coeffText}</span>
                              <span className={`ai-formula-term-value ${className}`}>
                                {estimated ? '≈' : ''}{text}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          </div>

          {/* Right Column: Chat */}
          <div className="ai-modal-chat-column">
          <div className="ai-chat" role="log" aria-label="AI chat">
            {messages.map((m, idx) => (
              <div
                key={m.id}
                className={m.role === 'user' ? 'ai-chat-row ai-chat-row--user' : 'ai-chat-row ai-chat-row--assistant'}
                onMouseEnter={() => setHoveredMessageId(m.id)}
                onMouseLeave={() => setHoveredMessageId(null)}
              >
                <div className="ai-chat-icon">
                  {m.role === 'user' ? <User size={18} /> : <Bot size={18} />}
                </div>
                <div className={m.role === 'user' ? 'ai-bubble ai-bubble--user' : 'ai-bubble ai-bubble--assistant'}>
                  <div className="ai-bubble-content">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm, remarkMath]}
                      rehypePlugins={[rehypeKatex]}
                    >
                      {m.content}
                    </ReactMarkdown>
                  </div>
                  {hoveredMessageId === m.id && (
                    <div className="ai-message-actions">
                      <button
                        className="ai-message-action-btn"
                        onClick={() => void copyToClipboard(m.content, m.id)}
                        title="Copy message"
                      >
                        {copiedMessageId === m.id ? <Check size={14} /> : <Copy size={14} />}
                      </button>
                      {m.role === 'assistant' && idx === messages.length - 1 && (
                        <button
                          className="ai-message-action-btn"
                          onClick={() => void regenerateLastResponse()}
                          title="Regenerate response"
                        >
                          <RotateCcw size={14} />
                        </button>
                      )}
                      <span className="ai-message-timestamp">
                        {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {status === 'loading' && (
              <div className="ai-chat-row ai-chat-row--assistant">
                <div className="ai-chat-icon">
                  <Bot size={18} />
                </div>
                <div className="ai-bubble ai-bubble--assistant ai-bubble--typing">
                  <div className="ai-typing-indicator">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                </div>
              </div>
            )}

            {status === 'error' && (
              <div className="ai-chat-row ai-chat-row--assistant">
                <div className="ai-chat-icon">
                  <Bot size={18} />
                </div>
                <div className="ai-bubble ai-bubble--error" role="alert">
                  <div className="ai-modal-error-title">AI request failed</div>
                  <div className="ai-modal-error-msg">{error}</div>
                  <div className="ai-modal-actions">
                    <button
                      type="button"
                      className="ai-modal-action"
                      onClick={() => void sendMessage(draft || 'Interpret the current UI state scientifically.')}
                    >
                      Retry
                    </button>
                    <button type="button" className="ai-modal-action subtle" onClick={onClose}>
                      Close
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>

          {/* Smart Question Chips */}
          {messages.length === 0 && (
            <div className="ai-quick-questions">
              {QUICK_QUESTIONS.map((q, idx) => (
                <button
                  key={idx}
                  type="button"
                  className="ai-quick-chip"
                  onClick={() => {
                    setDraft(q)
                    void sendMessage(q)
                  }}
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          {/* Chat Composer */}
          <form
            className="ai-chat-composer"
            onSubmit={(e) => {
              e.preventDefault()
              const text = draft
              setDraft('')
              void sendMessage(text)
            }}
          >
              <input
                className="ai-chat-input"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Ask a follow-up question…"
                aria-label="Chat message"
              />
              <button type="submit" className="ai-chat-send" disabled={status === 'loading'} title="Send message" aria-label="Send message">
                <Send size={18} />
              </button>
            </form>
          </div>
        </div>

        {/* Footer: Parameter snapshot */}
        <div className="ai-modal-footer">
          <div className="ai-modal-kv" role="group" aria-label="Panel values snapshot">
            <span>C={brief.C}</span>
            <span>T={brief.T}</span>
            <span>G={brief.G}</span>
            <span>R={brief.R}</span>
            <span>M={brief.M}</span>
            <span>D={brief.D}</span>
            <span>S={brief.S}</span>
            <span>E={brief.E}</span>
          </div>
        </div>

        {/* Keyboard Shortcuts Overlay */}
        {showShortcuts && (
          <div className="ai-shortcuts-overlay" onClick={() => setShowShortcuts(false)}>
            <div className="ai-shortcuts-panel" onClick={(e) => e.stopPropagation()}>
              <div className="ai-shortcuts-header">
                <h3>KEYBOARD SHORTCUTS</h3>
                 <button className="ai-shortcuts-close" onClick={() => setShowShortcuts(false)} title="Close shortcuts" aria-label="Close shortcuts">
                  <X size={20} />
                </button>
              </div>
              <div className="ai-shortcuts-list">
                <div className="ai-shortcut-item">
                  <kbd>Esc</kbd>
                  <span>Close modal</span>
                </div>
                <div className="ai-shortcut-item">
                  <kbd>Ctrl</kbd> + <kbd>K</kbd>
                  <span>Focus message input</span>
                </div>
                <div className="ai-shortcut-item">
                  <kbd>Ctrl</kbd> + <kbd>L</kbd>
                  <span>Clear chat history</span>
                </div>
                <div className="ai-shortcut-item">
                  <kbd>Ctrl</kbd> + <kbd>P</kbd>
                  <span>Export scientific PDF</span>
                </div>
                <div className="ai-shortcut-item">
                  <kbd>Ctrl</kbd> + <kbd>S</kbd>
                  <span>Export chat (JSON)</span>
                </div>
                <div className="ai-shortcut-item">
                  <kbd>Ctrl</kbd> + <kbd>R</kbd>
                  <span>Regenerate last response</span>
                </div>
                <div className="ai-shortcut-item">
                  <kbd>Ctrl</kbd> + <kbd>/</kbd>
                  <span>Toggle shortcuts help</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
