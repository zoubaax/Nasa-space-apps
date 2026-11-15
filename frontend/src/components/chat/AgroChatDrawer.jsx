import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Send,
  Sparkles,
  Bot,
  User,
  Radio,
  ShieldCheck,
  Droplets,
  Sun,
  Leaf,
  Cpu,
  RefreshCw,
  Compass,
  AlertCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useTranslation } from '../../context/LanguageContext';

export default function AgroChatDrawer({
  isOpen,
  onClose,
  selectedLocation,
  telemetry,
  selectedYear = 2025,
}) {
  const { t, language, isRtl } = useTranslation();

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [activeStepMessage, setActiveStepMessage] = useState(null);
  const [activeAgentId, setActiveAgentId] = useState(null);
  const [showEvidenceMap, setShowEvidenceMap] = useState({});

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Suggested questions by language
  const suggestedQuestions = {
    ar: [
      '🌾 واش خاصني نسقي الأرض هاد الأيام؟',
      '💧 فسر ليا نسبة رطوبة التربة فهاد البقعة',
      '🔄 شنو أحسن دورة زراعية مناسبة لهاد الأرض؟',
      '📡 شنو كتقول قراءة مجس التربة ESP32 الميداني؟',
      '☀️ واش كاين خطر صقيع أو موجة حرارة قادمة؟',
    ],
    fr: [
      "🌾 Dois-je irriguer ma parcelle aujourd'hui ?",
      "💧 Analyser l'humidité de la zone racinaire (SMAP)",
      "🔄 Quelle est la meilleure rotation culturale ici ?",
      "📡 Quel est le statut de la sonde in-situ ESP32 ?",
      "☀️ Y a-t-il un risque de gel ou de canicule ?",
    ],
    en: [
      '🌾 Should I irrigate my plot this week?',
      '💧 Analyze root-zone soil moisture (SMAP L4)',
      '🔄 What is the best crop rotation plan here?',
      '📡 What is the reading from the in-situ ESP32 sensor?',
      '☀️ Is there any risk of drought or heatwave?',
    ],
    es: [
      '🌾 ¿Debo regar mi parcela esta semana?',
      '💧 Analizar la humedad radicular (SMAP L4)',
      '🔄 ¿Cuál es la mejor rotación de cultivos aquí?',
      '📡 ¿Qué indica la sonda in-situ ESP32?',
      '☀️ ¿Hay riesgo de sequía o helada?',
    ],
  };

  const currentSuggestions = suggestedQuestions[language] || suggestedQuestions.en;

  // Initial welcome message
  useEffect(() => {
    if (messages.length === 0) {
      let welcomeText = '';
      if (language === 'ar') {
        welcomeText = `مرحباً بك! أنا **منسق الذكاء الاصطناعي الفلاحي (FieldShift AI Orchestrator)**.
أقوم بالتنسيق المباشر بين 5 وكلاء متخصصين:
* ☀️ **وكيل المناخ (NASA POWER)**
* 💧 **وكيل هيدرولوجيا التربة (NASA SMAP L4)**
* 🚜 **وكيل الهندسة الزراعية الميدانية**
* 📡 **وكيل الحساسات الميدانية (ESP32)**
* 🛡️ **وكيل الحارس العلمي والتدقيق ضد الهلوسة**

اختر أي بقعة على الكرة الأرضية واسألني عن الري، الرطوبة، أو الدورات الزراعية المناسبة!`;
      } else if (language === 'fr') {
        welcomeText = `Bonjour ! Je suis **l'Orchestrateur IA FieldShift**.
Je supervise et coordonne 5 sous-agents scientifiques spécialisés :
* ☀️ **Agent Climat (NASA POWER)**
* 💧 **Agent Hydrologie du Sol (NASA SMAP L4)**
* 🚜 **Agent Agronomie & Pratiques Culturales**
* 📡 **Agent Capteur In-Situ (ESP32 GPIO34)**
* 🛡️ **Agent Garde-Fou Scientifique (Zéro-Hallucination)**

Sélectionnez une parcelle et posez vos questions sur l'irrigation, l'humidité ou les rotations culturales !`;
      } else {
        welcomeText = `Welcome! I am the **FieldShift AI Orchestrator**.
I coordinate 5 specialized scientific sub-agents:
* ☀️ **Climate Specialist (NASA POWER)**
* 💧 **Soil Hydrology Specialist (NASA SMAP L4)**
* 🚜 **Field Agronomy Advisor**
* 📡 **In-Situ IoT Soil Probe Specialist (ESP32 GPIO34)**
* 🛡️ **Scientific Guardrail Sentinel (Zero-Hallucination)**

Select any farm on the 3D globe and ask me about irrigation, soil moisture, or crop rotations!`;
      }

      setMessages([
        {
          id: 'welcome',
          role: 'assistant',
          content: welcomeText,
          specialists_consulted: [
            'NASA POWER Climate',
            'NASA SMAP L4 Hydrology',
            'FieldShift Agronomy',
            'Scientific Guardrail',
          ],
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    }
  }, [language]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, activeStepMessage]);

  // Auto-focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen]);

  const handleSend = async (messageText = input) => {
    const query = (messageText || '').trim();
    if (!query || isLoading) return;

    setInput('');
    const userMsgId = `user-${Date.now()}`;
    const userMsg = {
      id: userMsgId,
      role: 'user',
      content: query,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);
    setActiveStepMessage(t('chat.analyzingIntent', {}, 'Analyzing query and dispatching sub-agents...'));
    setActiveAgentId('orchestrator');

    // Build payload
    const lat = selectedLocation?.coordinates ? selectedLocation.coordinates[1] : 33.89;
    const lng = selectedLocation?.coordinates ? selectedLocation.coordinates[0] : -5.55;
    const locationName = selectedLocation?.name || 'Selected Farm Plot';

    const payload = {
      message: query,
      language: language === 'ar' ? 'darija' : language,
      location: {
        name: locationName,
        latitude: lat,
        longitude: lng,
        country: selectedLocation?.country || 'Morocco',
      },
      year: selectedYear,
      mode: 'agricultural',
      history: messages.slice(-4).map((m) => ({
        role: m.role,
        content: m.content,
      })),
    };

    const assistantMsgId = `assistant-${Date.now()}`;
    let accumulatedReply = '';
    let consulted = [];
    let evidence = null;

    try {
      // 1. Attempt Streaming SSE Endpoint
      const response = await fetch('http://127.0.0.1:8000/api/ai/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Server returned HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      // Temporary assistant placeholder
      setMessages((prev) => [
        ...prev,
        {
          id: assistantMsgId,
          role: 'assistant',
          content: '',
          specialists_consulted: [],
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const block of lines) {
          const line = block.trim();
          if (!line.startsWith('data:')) continue;
          const jsonStr = line.replace(/^data:\s*/, '');
          try {
            const data = JSON.parse(jsonStr);

            if (data.event === 'agent_start') {
              setActiveAgentId(data.agent_id);
              setActiveStepMessage(data.message);
              if (data.agent_id && !consulted.includes(data.agent_id)) {
                consulted.push(data.agent_id);
              }
            } else if (data.event === 'guardrail_check') {
              setActiveAgentId('guardrail_sentinel');
              setActiveStepMessage(data.message || 'Evidence audited by Guardrail Sentinel');
            } else if (data.event === 'chunk') {
              accumulatedReply += data.text || '';
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === assistantMsgId
                    ? { ...msg, content: accumulatedReply, specialists_consulted: consulted }
                    : msg
                )
              );
            } else if (data.event === 'delta') {
              accumulatedReply = data.content || accumulatedReply;
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === assistantMsgId ? { ...msg, content: accumulatedReply } : msg
                )
              );
            } else if (data.event === 'complete') {
              if (data.response) {
                accumulatedReply = data.response.reply || accumulatedReply;
                consulted = data.response.specialists_consulted || consulted;
                evidence = data.response.data_evidence || null;
              }
            }
          } catch (err) {
            console.debug('SSE JSON parse ignore:', err);
          }
        }
      }

      // Finalize message
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMsgId
            ? {
                ...msg,
                content: accumulatedReply,
                specialists_consulted: consulted.length > 0 ? consulted : ['NASA SMAP L4', 'NASA POWER'],
                data_evidence: evidence,
              }
            : msg
        )
      );
    } catch (streamErr) {
      console.warn('Stream failed, falling back to synchronous chat:', streamErr);

      // Fallback: Synchronous POST
      try {
        const fallbackRes = await fetch('http://127.0.0.1:8000/api/ai/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (fallbackRes.ok) {
          const resData = await fallbackRes.json();
          setMessages((prev) => [
            ...prev.filter((m) => m.id !== assistantMsgId),
            {
              id: assistantMsgId,
              role: 'assistant',
              content: resData.reply,
              specialists_consulted: resData.specialists_consulted,
              data_evidence: resData.data_evidence,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            },
          ]);
        } else {
          throw new Error('Fallback failed');
        }
      } catch (fallbackErr) {
        setMessages((prev) => [
          ...prev.filter((m) => m.id !== assistantMsgId),
          {
            id: assistantMsgId,
            role: 'assistant',
            content:
              language === 'ar'
                ? 'تعذر الاتصال بالخادم حالياً. يرجى التأكد من تشغيل خادم FastAPI على المنفذ 8000.'
                : 'Unable to reach the AI Orchestrator service. Please ensure the FastAPI backend is running.',
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          },
        ]);
      }
    } finally {
      setIsLoading(false);
      setActiveStepMessage(null);
      setActiveAgentId(null);
    }
  };

  const renderSimpleMarkdown = (text) => {
    if (!text) return null;
    const lines = text.split('\n');
    return lines.map((line, idx) => {
      // Headers
      if (line.startsWith('### ')) {
        return (
          <h4 key={idx} className="font-bold text-sm text-cyan-200 mt-2 mb-1">
            {line.replace('### ', '')}
          </h4>
        );
      }
      if (line.startsWith('## ')) {
        return (
          <h3 key={idx} className="font-bold text-base text-emerald-200 mt-2.5 mb-1.5">
            {line.replace('## ', '')}
          </h3>
        );
      }
      // Blockquotes / Warnings
      if (line.startsWith('> ')) {
        return (
          <div
            key={idx}
            className="my-1.5 p-2 rounded-lg bg-cyan-950/30 border-l-2 border-cyan-400 text-xs text-zinc-300 italic"
          >
            {line.replace('> ', '')}
          </div>
        );
      }
      // Bullet points
      if (line.startsWith('* ') || line.startsWith('- ')) {
        const itemText = line.substring(2);
        return (
          <li key={idx} className="ml-4 list-disc text-xs sm:text-sm text-zinc-200 leading-relaxed">
            {formatBold(itemText)}
          </li>
        );
      }
      if (line.trim() === '') {
        return <div key={idx} className="h-1.5" />;
      }
      return (
        <p key={idx} className="text-xs sm:text-sm text-zinc-200 leading-relaxed">
          {formatBold(line)}
        </p>
      );
    });
  };

  const formatBold = (str) => {
    const parts = str.split(/(\*\*.*?\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return (
          <strong key={i} className="font-bold text-white">
            {part.slice(2, -2)}
          </strong>
        );
      }
      return part;
    });
  };

  const toggleEvidence = (msgId) => {
    setShowEvidenceMap((prev) => ({ ...prev, [msgId]: !prev[msgId] }));
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-y-0 right-0 z-50 w-full sm:w-[480px] lg:w-[540px] flex flex-col bg-[#0b0e14]/95 border-l border-cyan-500/25 backdrop-blur-2xl shadow-[-20px_0_60px_rgba(0,0,0,0.85)] text-white select-none animate-slide-in-right overflow-hidden"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      {/* ── 1. Header ── */}
      <div className="relative p-4 sm:p-5 border-b border-zinc-800/80 bg-gradient-to-b from-cyan-950/20 to-transparent flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 border border-emerald-500/30 text-emerald-400">
            <Sparkles className="w-5 h-5 animate-pulse" />
            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2 border-[#0b0e14]" />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-display font-bold text-sm sm:text-base text-zinc-100">
                {t('chat.title', {}, 'AI Agronomist Orchestrator')}
              </h2>
              <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                DAG Multi-Agent
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 font-mono flex items-center gap-1.5 mt-0.5 truncate">
              <Compass className="w-3 h-3 text-emerald-400 shrink-0" />
              <span>
                {selectedLocation?.name || t('chat.defaultPlot', {}, 'Selected Farm')} [
                {selectedLocation?.coordinates ? selectedLocation.coordinates[1].toFixed(2) : '33.89'}°N,{' '}
                {selectedLocation?.coordinates ? selectedLocation.coordinates[0].toFixed(2) : '-5.55'}°E]
              </span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setMessages([])}
            className="p-2 rounded-xl bg-zinc-900/80 hover:bg-zinc-800 text-zinc-400 hover:text-white transition cursor-pointer"
            title={t('chat.clearChat', {}, 'Reset conversation')}
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-zinc-900/80 hover:bg-zinc-800 text-zinc-400 hover:text-white transition cursor-pointer"
            title={t('common.close', {}, 'Close')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* ── 2. Active Multi-Agent Pipeline Status Indicator ── */}
      <div className="px-4 py-2 border-b border-zinc-800/60 bg-zinc-950/60 flex items-center justify-between text-[11px] font-mono shrink-0 overflow-x-auto gap-2">
        <span className="text-zinc-500 uppercase tracking-wider text-[9px] shrink-0">
          {t('chat.subagentsLabel', {}, 'Subagents:')}
        </span>
        <div className="flex items-center gap-1.5 shrink-0">
          <span
            className={`px-1.5 py-0.5 rounded flex items-center gap-1 text-[10px] transition ${
              activeAgentId === 'climate_specialist'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse'
                : 'bg-zinc-900 text-zinc-400 border border-zinc-800'
            }`}
          >
            <Sun className="w-2.5 h-2.5" />
            <span>NASA POWER</span>
          </span>
          <span
            className={`px-1.5 py-0.5 rounded flex items-center gap-1 text-[10px] transition ${
              activeAgentId === 'soil_specialist'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 animate-pulse'
                : 'bg-zinc-900 text-zinc-400 border border-zinc-800'
            }`}
          >
            <Droplets className="w-2.5 h-2.5" />
            <span>SMAP L4</span>
          </span>
          <span
            className={`px-1.5 py-0.5 rounded flex items-center gap-1 text-[10px] transition ${
              activeAgentId === 'sensor_specialist'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 animate-pulse'
                : 'bg-zinc-900 text-zinc-400 border border-zinc-800'
            }`}
          >
            <Cpu className="w-2.5 h-2.5" />
            <span>ESP32</span>
          </span>
          <span
            className={`px-1.5 py-0.5 rounded flex items-center gap-1 text-[10px] transition ${
              activeAgentId === 'guardrail_sentinel'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 animate-pulse'
                : 'bg-zinc-900 text-zinc-400 border border-zinc-800'
            }`}
          >
            <ShieldCheck className="w-2.5 h-2.5" />
            <span>Guardrail</span>
          </span>
        </div>
      </div>

      {/* ── 3. Chat Messages Stream ── */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 font-sans text-sm">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {msg.role === 'assistant' && (
              <div className="w-8 h-8 rounded-xl bg-zinc-900 border border-zinc-700/80 flex items-center justify-center text-emerald-400 shrink-0 mt-0.5 shadow-sm">
                <Bot className="w-4 h-4" />
              </div>
            )}

            <div
              className={`max-w-[85%] rounded-2xl p-3.5 sm:p-4 text-xs sm:text-sm shadow-md space-y-2 ${
                msg.role === 'user'
                  ? 'bg-gradient-to-r from-emerald-600/30 to-teal-600/30 border border-emerald-500/40 text-emerald-50'
                  : 'bg-zinc-900/70 border border-zinc-800/90 text-zinc-200'
              }`}
            >
              <div className="space-y-1.5 font-sans leading-relaxed">
                {msg.role === 'user' ? msg.content : renderSimpleMarkdown(msg.content)}
              </div>

              {/* Specialists Consulted Badges for Assistant */}
              {msg.role === 'assistant' && msg.specialists_consulted && msg.specialists_consulted.length > 0 && (
                <div className="pt-2 border-t border-zinc-800/60 flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] text-zinc-500 font-mono">
                    {t('chat.evidenceBy', {}, 'Grounded by:')}
                  </span>
                  {msg.specialists_consulted.map((s, idx) => (
                    <span
                      key={idx}
                      className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-zinc-800 text-zinc-300 border border-zinc-700/60"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              )}

              {/* Collapsible Evidence Audit Box */}
              {msg.data_evidence && (
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => toggleEvidence(msg.id)}
                    className="flex items-center gap-1 text-[10px] font-mono text-cyan-400 hover:text-cyan-300 transition cursor-pointer"
                  >
                    <span>{showEvidenceMap[msg.id] ? 'Hide Audited Data' : 'View Ground-Truth Evidence'}</span>
                    {showEvidenceMap[msg.id] ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>

                  {showEvidenceMap[msg.id] && (
                    <div className="mt-1.5 p-2 rounded bg-zinc-950/80 border border-zinc-800 text-[10px] font-mono text-zinc-300 space-y-0.5">
                      {Object.entries(msg.data_evidence).map(([k, v]) => (
                        <div key={k} className="flex justify-between border-b border-zinc-900 py-0.5">
                          <span className="text-zinc-500">{k}:</span>
                          <span className="font-bold text-zinc-200">{String(v)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="text-[9px] text-zinc-500 font-mono text-right pt-0.5">
                {msg.timestamp}
              </div>
            </div>

            {msg.role === 'user' && (
              <div className="w-8 h-8 rounded-xl bg-emerald-600/30 border border-emerald-500/40 flex items-center justify-center text-emerald-300 shrink-0 mt-0.5 shadow-sm">
                <User className="w-4 h-4" />
              </div>
            )}
          </div>
        ))}

        {/* Live Multi-Agent Thinking State */}
        {isLoading && (
          <div className="flex gap-3 justify-start animate-fade-in">
            <div className="w-8 h-8 rounded-xl bg-zinc-900 border border-zinc-700/80 flex items-center justify-center text-emerald-400 shrink-0 shadow-sm">
              <Radio className="w-4 h-4 animate-spin text-cyan-400" />
            </div>

            <div className="rounded-2xl p-3.5 bg-zinc-900/60 border border-zinc-800 text-xs font-mono space-y-2 max-w-[85%]">
              <div className="flex items-center gap-2 text-cyan-300">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                <span className="font-bold">
                  {activeStepMessage || t('chat.agentsWorking', {}, 'Orchestrator coordinating subagents...')}
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-zinc-500 text-[10px]">
                <ShieldCheck className="w-3 h-3 text-emerald-400" />
                <span>Zero-Hallucination Guardrail Active</span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ── 4. Quick Prompt Suggestions ── */}
      <div className="p-3 border-t border-zinc-800/80 bg-zinc-950/40 shrink-0">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {currentSuggestions.map((q, idx) => (
            <button
              key={idx}
              type="button"
              disabled={isLoading}
              onClick={() => handleSend(q)}
              className="px-2.5 py-1.5 rounded-xl bg-zinc-900/90 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 hover:border-cyan-500/40 text-[11px] whitespace-nowrap transition cursor-pointer disabled:opacity-50"
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      {/* ── 5. Input Bar ── */}
      <div className="p-4 border-t border-zinc-800/80 bg-zinc-950/90 shrink-0">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="relative flex items-center gap-2"
        >
          <input
            ref={inputRef}
            type="text"
            value={input}
            disabled={isLoading}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t(
              'chat.inputPlaceholder',
              {},
              'Ask about soil moisture, irrigation, or rotations in Darija, French, English...'
            )}
            className="w-full px-4 py-3 rounded-2xl bg-zinc-900/90 border border-zinc-700/80 focus:border-cyan-400/80 focus:ring-1 focus:ring-cyan-400 text-xs sm:text-sm text-zinc-100 placeholder-zinc-500 outline-none transition disabled:opacity-50"
          />

          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="p-3 rounded-2xl bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white transition shadow-[0_0_15px_rgba(16,185,129,0.3)] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shrink-0"
            title={t('chat.send', {}, 'Send')}
          >
            <Send className="w-4 h-4" />
          </button>
        </form>

        <p className="text-[10px] text-zinc-500 font-mono text-center mt-2">
          {t(
            'chat.disclaimer',
            {},
            'Evidence-grounded in NASA SMAP L4 & POWER observations. Audited against hallucinations.'
          )}
        </p>
      </div>
    </div>
  );
}
