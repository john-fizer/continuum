import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowUp,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Mic,
  Plus,
  Search,
  Volume2,
  Waves,
  Upload,
  X,
} from 'lucide-react';
import { KnowledgeGraph } from '../knowledge-graph';
import { workingAttention } from './model.mjs';
import type { AttentionSignal } from './events';
import './attention.css';

type BrowserSpeechRecognition = EventTarget & {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};

type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

type Source = {
  id: string;
  title: string;
  body: string;
  origin: string;
  metadata?: Record<string, unknown>;
};
type Link = { source_a: string; source_b: string; status: string };
type StoredConcept = {
  id: string;
  label: string;
  normalized_label?: string;
  activation_strength?: number;
};
type StoredRelationship = {
  concept_a: string;
  concept_b: string;
  relationship_type?: string;
};
type Answer = {
  answer: string;
  citations: { source_id: string; title: string; excerpt: string }[];
  mode?: 'synthesis' | 'extractive';
};
type ConversationTurn = { role: 'user' | 'assistant'; content: string };
export function AttentionWorkspace({
  data,
  onAsk,
  onCapture,
  onImport,
  onCreate,
  onSpeak,
}: {
  data: {
    sources: Source[];
    links: Link[];
    concepts?: StoredConcept[];
    relationships?: StoredRelationship[];
    state: string;
  } | null;
  onAsk: (query: string, history?: ConversationTurn[]) => Promise<Answer>;
  onCapture: (title: string, body: string) => Promise<string>;
  onImport: () => void;
  onCreate: () => void;
  onSpeak: (text: string) => Promise<{ audio: string; format: string }>;
}) {
  const [query, setQuery] = useState(''),
    [seed, setSeed] = useState('');
  const [result, setResult] = useState<Answer | null>(null);
  const [path, setPath] = useState<string[]>([]);
  const [signal, setSignal] = useState<AttentionSignal | undefined>();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [listening, setListening] = useState(false);
  const [conversationMode, setConversationMode] = useState(false);
  const [conversation, setConversation] = useState<ConversationTurn[]>([]);
  const [speaking, setSpeaking] = useState(false);
  const [voiceEnergy, setVoiceEnergy] = useState(0);
  const [voiceSpectrum, setVoiceSpectrum] = useState<number[]>([]);
  const [capturing, setCapturing] = useState(false),
    [draft, setDraft] = useState('');
  const requestId = useRef(0);
  const recognition = useRef<BrowserSpeechRecognition | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const analysisFrame = useRef<number | null>(null);
  const analysisTick = useRef(0);
  const queryInput = useRef<HTMLInputElement | null>(null);
  useEffect(() => () => {
    if (analysisFrame.current) cancelAnimationFrame(analysisFrame.current);
    audioContext.current?.close().catch(() => undefined);
  }, []);
  const sources = data?.sources || [];
  const attention = workingAttention(
    seed,
    result?.citations || [],
    sources,
    data?.concepts || [],
    data?.relationships || [],
  );
  const selectedId = path.at(-1);
  const concept = attention.concepts.find((c) => c.id === selectedId);
  const source = sources.find((s) => s.id === selectedId);
  const evidence = concept
    ? sources.filter((s) => concept.sourceIds.includes(s.id))
    : sources.filter((s) => attention.sourceIds.includes(s.id));
  const activeConcepts = source
    ? attention.concepts.filter((c) => c.sourceIds.includes(source.id))
    : concept
      ? [concept]
      : attention.concepts;
  const activeSources = source ? [source] : concept ? evidence : [];
  const graphNodes = result
    ? source
      ? [source]
      : concept
        ? [{ id: concept.id, title: concept.label.toUpperCase() }, ...activeSources]
        : activeConcepts.map((c) => ({ id: c.id, title: c.label.toUpperCase() }))
    : [];
  const ids = new Set(graphNodes.map((n) => n.id));
  const graphLinks = result
    ? (concept ? attention.evidenceEdges : attention.edges).filter(
        (e) => ids.has(e.source_a) && ids.has(e.source_b),
      )
    : [];
  function collapse() {
    requestId.current++;
    setBusy(false);
    setResult(null);
    setPath([]);
    setSeed('');
    setSignal(undefined);
    setError('');
  }
  function select(id: string) {
    setPath((old) => [...old, id]);
    if (sources.some((s) => s.id === id))
      setSignal({
        id: crypto.randomUUID(),
        type: 'memory.retrieve',
        sourceIds: [id],
      });
  }
  async function primeVoicePlayback() {
    // iOS only permits delayed audio after an explicit user gesture when its
    // audio context has been resumed inside that gesture.
    const context = audioContext.current || new AudioContext();
    audioContext.current = context;
    if (context.state !== 'running') await context.resume();
  }
  async function ask(readAloud = false) {
    const text = query.trim();
    if (!text || busy) return;
    if (readAloud) await primeVoicePlayback();
    const version = ++requestId.current;
    setBusy(true);
    setError('');
    setPath([]);
    try {
      const answer = await onAsk(text, conversation);
      if (requestId.current !== version) return;
      setSeed(text);
      setResult(answer);
      setConversation((turns) => [...turns, { role: 'user' as const, content: text }, { role: 'assistant' as const, content: answer.answer }].slice(-10));
      setSignal({
        id: crypto.randomUUID(),
        type: 'memory.retrieve',
        sourceIds: answer.citations.map((c) => c.source_id),
      });
      if (readAloud) await playAnswer(answer.answer);
    } catch (e) {
      if (requestId.current === version)
        setError(e instanceof Error ? e.message : 'Retrieval failed.');
    } finally {
      if (requestId.current === version) setBusy(false);
    }
  }
  function beginListening(conversation = false) {
    if (busy || speaking) return;
    if (listening) {
      recognition.current?.stop();
      return;
    }
    const SpeechRecognition = (window as typeof window & {
      SpeechRecognition?: BrowserSpeechRecognitionConstructor;
      webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
    }).SpeechRecognition || (window as typeof window & {
      webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
    }).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError('Voice input is not available in this browser. Use Chrome or Edge, or type your question.');
      return;
    }
    const voice = new SpeechRecognition();
    recognition.current = voice;
    voice.continuous = conversation;
    voice.interimResults = false;
    voice.lang = navigator.language || 'en-US';
    voice.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0]?.transcript || '')
        .join(' ')
        .trim();
      if (transcript) setQuery(transcript);
      if (transcript && conversation) {
        voice.stop();
        void askTranscript(transcript);
      }
    };
    voice.onerror = (event) => {
      if (event.error !== 'aborted') setError(`Voice input: ${event.error}.`);
    };
    voice.onend = () => setListening(false);
    setError('');
    setListening(true);
    voice.start();
  }
  function toggleVoiceInput() {
    beginListening(false);
  }
  async function askTranscript(transcript: string) {
    const text = transcript.trim();
    if (!text || busy) return;
    setQuery(text);
    await askWithText(text, true);
  }
  async function askWithText(text: string, readAloud = false) {
    if (!text || busy) return;
    const version = ++requestId.current;
    setBusy(true);
    setError('');
    setPath([]);
    try {
      const answer = await onAsk(text, conversation);
      if (requestId.current !== version) return;
      setSeed(text);
      setResult(answer);
      setConversation((turns) => [...turns, { role: 'user' as const, content: text }, { role: 'assistant' as const, content: answer.answer }].slice(-10));
      setSignal({ id: crypto.randomUUID(), type: 'memory.retrieve', sourceIds: answer.citations.map((c) => c.source_id) });
      if (readAloud) await playAnswer(answer.answer);
    } catch (e) {
      if (requestId.current === version) setError(e instanceof Error ? e.message : 'Retrieval failed.');
    } finally {
      if (requestId.current === version) setBusy(false);
    }
  }
  function toggleConversationMode() {
    if (conversationMode) {
      setConversationMode(false);
      recognition.current?.stop();
      audio.current?.pause();
      stopVoiceAnalysis();
      setSpeaking(false);
      return;
    }
    const speech = (window as typeof window & {
      SpeechRecognition?: BrowserSpeechRecognitionConstructor;
      webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
    }).SpeechRecognition || (window as typeof window & {
      webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
    }).webkitSpeechRecognition;
    if (!speech) {
      setError('Live voice input is not supported by this browser. Type your question and Continuum can still speak its answer.');
      queryInput.current?.focus();
      return;
    }
    setConversationMode(true);
    setError('');
    beginListening(true);
  }
  async function playAnswer(text: string) {
    if (!text) return;
    setSpeaking(true);
    try {
      audio.current?.pause();
      const voice = await onSpeak(text);
      const bytes = Uint8Array.from(atob(voice.audio), (char) => char.charCodeAt(0));
      const src = URL.createObjectURL(new Blob([bytes], { type: voice.format }));
      const player = new Audio(src);
      audio.current = player;
      player.onended = () => {
        URL.revokeObjectURL(src);
        stopVoiceAnalysis();
        setSpeaking(false);
        if (conversationMode) beginListening(true);
      };
      await player.play();
      beginVoiceAnalysis(player);
    } catch (e) {
      setSpeaking(false);
      throw e;
    }
  }
  function stopVoiceAnalysis() {
    if (analysisFrame.current) cancelAnimationFrame(analysisFrame.current);
    analysisFrame.current = null;
    setVoiceEnergy(0);
    setVoiceSpectrum([]);
  }
  function beginVoiceAnalysis(player: HTMLAudioElement) {
    stopVoiceAnalysis();
    try {
      const context = audioContext.current || new AudioContext();
      audioContext.current = context;
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.72;
      const source = context.createMediaElementSource(player);
      source.connect(analyser);
      analyser.connect(context.destination);
      void context.resume();
      const bins = new Uint8Array(analyser.frequencyBinCount);
      const read = (now: number) => {
        analyser.getByteFrequencyData(bins);
        const spectrum = Array.from({ length: 28 }, (_, index) => {
          const start = Math.floor((index / 28) * bins.length);
          const end = Math.max(start + 1, Math.floor(((index + 1) / 28) * bins.length));
          let sum = 0;
          for (let bin = start; bin < end; bin++) sum += bins[bin];
          return sum / Math.max(1, end - start) / 255;
        });
        const energy = spectrum.reduce((sum, value) => sum + value, 0) / spectrum.length;
        if (now - analysisTick.current > 66) {
          analysisTick.current = now;
          setVoiceEnergy(energy);
          setVoiceSpectrum(spectrum);
        }
        if (!player.paused && !player.ended)
          analysisFrame.current = requestAnimationFrame(read);
      };
      analysisFrame.current = requestAnimationFrame(read);
    } catch {
      // The voice itself remains available if a browser disallows audio analysis.
    }
  }
  async function speakAnswer() {
    if (!result?.answer) return;
    setError('');
    try {
      await playAnswer(result.answer);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Neural voice could not respond.');
    }
  }
  async function capture() {
    setBusy(true);
    setError('');
    try {
      const body = draft.trim();
      const id = await onCapture(body.split('\n')[0].slice(0, 80), body);
      setCapturing(false);
      setDraft('');
      setResult(null);
      setPath([]);
      setSignal({
        id: crypto.randomUUID(),
        type: 'knowledge.commit',
        sourceIds: [id],
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed.');
    } finally {
      setBusy(false);
    }
  }
  const drawer = !!result || !!source || capturing;
  return (
    <div
      className={`attention-workspace ${drawer ? 'attention-inspecting' : ''}`}
    >
      <div className="attention-field">
        <div className="attention-state">
          <span className="small-dot" />
          {busy
            ? 'Retrieving…'
            : selectedId
              ? 'Evidence in focus'
              : result
                ? `${attention.sourceIds.length} memories retrieved`
                : 'At rest'}
          {(result || selectedId) && (
            <button onClick={collapse} aria-label="Collapse to singularity">
              <X size={14} />
              Collapse
            </button>
          )}
        </div>
        <div className="attention-mobile-actions" aria-label="Quick actions">
          <p>What would you like to do?</p>
          <div>
            <button type="button" onClick={toggleConversationMode}>
              <Waves size={16} />
              Talk
            </button>
            <button type="button" onClick={() => queryInput.current?.focus()}>
              <Search size={16} />
              Ask
            </button>
            <button type="button" onClick={onImport}>
              <Upload size={16} />
              Add knowledge
            </button>
          </div>
        </div>
        <KnowledgeGraph
          embedded
          nodes={graphNodes}
          links={graphLinks}
          select={select}
          attentionMode
          activatedIds={[]}
          focusId={selectedId}
          signal={signal}
          voiceEnergy={voiceEnergy}
          voiceSpectrum={voiceSpectrum}
        />
        <div className="attention-input">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              // A submitted question is an explicit request for a reply. Start
              // the natural voice automatically instead of making mobile users
              // find a second, delayed Listen control after every answer.
              void ask(true);
            }}
          >
            <label className="sr-only" htmlFor="attention-query">
              Search your memories
            </label>
            <input
              id="attention-query"
              ref={queryInput}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={conversationMode ? 'Talk through a connection or direct the research…' : 'Bring an idea into focus…'}
              maxLength={2000}
            />
            <button
              type="button"
              className={`attention-mic ${listening ? 'listening' : ''}`}
              onClick={toggleVoiceInput}
              aria-label={listening ? 'Stop listening' : 'Ask with your voice'}
              title={listening ? 'Stop listening' : 'Ask with your voice'}
            >
              <Mic size={18} />
            </button>
            <button
              type="button"
              className={`attention-conversation ${conversationMode ? 'active' : ''}`}
              onClick={toggleConversationMode}
              aria-label={conversationMode ? 'End conversation mode' : 'Start conversation mode'}
              title={conversationMode ? 'End conversation mode' : 'Conversation mode'}
            >
              <Waves size={17} />
            </button>
            <button
              type="submit"
              aria-label="Retrieve memories"
              disabled={busy || !query.trim()}
            >
              <ArrowUp size={20} />
            </button>
          </form>
          <div className="attention-input-meta">
            <span>
              {data
                ? conversationMode
                  ? `Conversation active · ${conversation.length / 2} ${conversation.length === 2 ? 'turn' : 'turns'} held in attention`
                  : 'Ask your private brain · evidence-backed answers'
                : 'Your ideas begin here'}
            </span>
            <div>
              {!data && <button onClick={onCreate}>Create a brain</button>}
              <button
                onClick={() => {
                  setCapturing(true);
                  setError('');
                }}
                aria-label="Capture a thought"
              >
                <Plus size={16} />
                Capture
              </button>
              <button onClick={onImport}>
                <Upload size={15} />
                Import
              </button>
            </div>
          </div>
        </div>
        {error && (
          <p className="attention-error" role="alert">
            {error}
          </p>
        )}
      </div>
      {drawer && (
        <aside className="attention-evidence" aria-label="Focused evidence">
          <div className="attention-evidence-nav">
            {path.length > 0 ? (
              <button
                aria-label="Back one level"
                onClick={() => setPath((old) => old.slice(0, -1))}
              >
                <ArrowLeft size={16} />
                Back
              </button>
            ) : (
              <span>{capturing ? 'CAPTURE' : 'CURRENT ATTENTION'}</span>
            )}
            <button
              aria-label="Close evidence"
              onClick={() => {
                collapse();
                setCapturing(false);
              }}
            >
              <X size={18} />
            </button>
          </div>
          {capturing ? (
            <form
              className="attention-capture"
              onSubmit={(e) => {
                e.preventDefault();
                void capture();
              }}
            >
              <h2>What are you noticing?</h2>
              <label className="sr-only" htmlFor="attention-draft">
                Observation text
              </label>
              <textarea
                id="attention-draft"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="A thought, a question, a possibility…"
                maxLength={200000}
              />
              <button type="submit" disabled={!data || busy || !draft.trim()}>
                Save to this brain
              </button>
              {!data && (
                <p>Create a brain before saving your first observation.</p>
              )}
            </form>
          ) : source ? (
            <>
              <p className="attention-eyebrow">ORIGINAL MEMORY</p>
              <h2>{source.title}</h2>
              <p className="attention-origin">{source.origin}</p>
              <pre className="attention-source-body">{source.body}</pre>
              {source.metadata && Object.keys(source.metadata).length > 0 && (
                <details>
                  <summary>Source provenance</summary>
                  <pre>{JSON.stringify(source.metadata, null, 2)}</pre>
                </details>
              )}
            </>
          ) : concept ? (
            <>
              <p className="attention-eyebrow">MATCHED TERM</p>
              <h2>{concept.label.toUpperCase()}</h2>
              <p>
                This word appears in {evidence.length} retrieved{' '}
                {evidence.length === 1 ? 'source' : 'sources'}. Follow a path to
                inspect its original context.
              </p>
              <EvidenceCards sources={evidence} select={select} />
            </>
          ) : (
            <>
              <p className="attention-eyebrow">WORKING ATTENTION</p>
              <h2>{seed}</h2>
              <div className="attention-answer">
                <div>
                  {result?.mode === 'extractive' && (
                    <p className="attention-mode">EVIDENCE MODE · NO GENERATED CLAIMS</p>
                  )}
                  <p>{result?.answer}</p>
                </div>
                <button onClick={() => void speakAnswer()} disabled={busy || speaking} aria-label={speaking ? 'Speaking answer' : 'Replay answer aloud'} title={speaking ? 'Speaking' : 'Replay answer aloud'}>
                  <Volume2 size={17} />
                  {speaking ? 'Speaking' : 'Replay'}
                </button>
              </div>
              {!!attention.concepts.length && (
                <>
                  <h3>Concepts named in your question</h3>
                  <div className="attention-terms">
                    {attention.concepts.map((c) => (
                      <button key={c.id} onClick={() => select(c.id)}>
                        {c.label}
                        <span>{c.sourceIds.length}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
              <EvidenceCards sources={evidence} select={select} />
              <p className="attention-note">
                The surface shows only the concepts you asked about. Open one to
                reveal its source evidence. These paths show co-occurrence, not
                causation or a new discovery.
              </p>
            </>
          )}
        </aside>
      )}
    </div>
  );
}

function EvidenceCards({
  sources,
  select,
}: {
  sources: Source[];
  select: (id: string) => void;
}) {
  const [index, setIndex] = useState(0);
  const current = sources[Math.min(index, sources.length - 1)];
  if (!current)
    return (
      <p className="attention-note">
        No matching memories yet. Try a specific word from a source you’ve
        saved.
      </p>
    );
  return (
    <div className="attention-rolodex">
      <button
        className="attention-memory-card"
        onClick={() => select(current.id)}
      >
        <BookOpen size={25} />
        <h3>{current.title}</h3>
        <p>
          {current.body.slice(0, 160)}
          {current.body.length > 160 ? '…' : ''}
        </p>
        <span>Open original source →</span>
      </button>
      <div className="attention-card-nav">
        <button
          aria-label="Previous memory"
          disabled={index <= 0}
          onClick={() => setIndex((v) => Math.max(0, v - 1))}
        >
          <ChevronLeft size={18} />
        </button>
        <span>
          {Math.min(index + 1, sources.length)} / {sources.length}
        </span>
        <button
          aria-label="Next memory"
          disabled={index >= sources.length - 1}
          onClick={() => setIndex((v) => Math.min(sources.length - 1, v + 1))}
        >
          <ChevronRight size={18} />
        </button>
      </div>
    </div>
  );
}
