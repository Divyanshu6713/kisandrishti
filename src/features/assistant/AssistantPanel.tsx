import { AnimatePresence, motion } from 'framer-motion';
import { ArrowUp, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useFarmContext } from '@/hooks/useFarmContext';
import { assistantService, SUGGESTED_QUESTIONS, type AssistantAnswer } from '@/services';
import { useUiStore } from '@/state/uiStore';
import { Drawer } from '@/components/ui/overlay';
import { EASE } from '@/components/ui/motion';
import { BasisList } from '@/components/ui/provenance';
import { Disclosure } from '@/components/ui/primitives';

type Msg = { id: number; role: 'user'; text: string } | { id: number; role: 'assistant'; answer: AssistantAnswer } | { id: number; role: 'error'; text: string };

let nextId = 1;

/**
 * Farm assistant: every answer is built from the selected farm's context
 * (question → intent → farm context → services → answer), never a generic chat.
 */
export default function AssistantPanel() {
  const { assistantOpen, assistantSeed, closeAssistant } = useUiStore();
  const { ctx } = useFarmContext();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [thinking, setThinking] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const farmId = ctx?.farm.id;

  // A new farm means a new conversation.
  useEffect(() => setMsgs([]), [farmId]);

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' });
  }, [msgs, thinking]);

  const ask = async (q: string) => {
    const question = q.trim();
    if (!question || !ctx || thinking) return;
    setText('');
    setMsgs((m) => [...m, { id: nextId++, role: 'user', text: question }]);
    setThinking(true);
    try {
      const [answer] = await Promise.all([assistantService.ask(question, ctx), new Promise((r) => setTimeout(r, 450))]);
      setMsgs((m) => [...m, { id: nextId++, role: 'assistant', answer }]);
    } catch {
      setMsgs((m) => [...m, { id: nextId++, role: 'error', text: 'The assistant could not answer right now. Please try again.' }]);
    } finally {
      setThinking(false);
    }
  };

  useEffect(() => {
    if (assistantOpen && assistantSeed && ctx) ask(assistantSeed);
  }, [assistantOpen, assistantSeed]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = (e: FormEvent) => {
    e.preventDefault();
    ask(text);
  };

  return (
    <Drawer
      open={assistantOpen}
      onClose={closeAssistant}
      title={
        <span className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-accent" aria-hidden />
          <span>
            Farm assistant
            <span className="block text-label font-normal text-ink-3">{ctx ? `Answers from ${ctx.farm.name} data only` : 'Loading farm…'}</span>
          </span>
        </span>
      }
    >
      <div className="flex h-full flex-col">
        <div ref={list} className="flex-1 space-y-4 overflow-y-auto px-5 py-5" aria-live="polite">
          {msgs.length === 0 && (
            <div className="pt-4">
              <p className="text-lead font-medium">Ask about this farm.</p>
              <p className="mt-1 text-sm text-ink-2">I use its soil test, observations, weather and the analysis engines. If the data isn’t there, I’ll say so.</p>
              <div className="mt-6 flex flex-col gap-2">
                {SUGGESTED_QUESTIONS.map((q) => (
                  <button key={q} type="button" onClick={() => ask(q)} className="rounded-ctl border border-line px-4 py-3 text-left text-sm transition-colors hover:border-accent/40 hover:bg-accent-soft/40">
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}
          <AnimatePresence initial={false}>
            {msgs.map((m) => (
              <motion.div key={m.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: EASE }}>
                {m.role === 'user' ? (
                  <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-accent px-4 py-2.5 text-sm text-accent-ink">{m.text}</p>
                ) : m.role === 'error' ? (
                  <p className="w-fit max-w-[90%] rounded-2xl bg-danger-soft px-4 py-2.5 text-sm text-danger">{m.text}</p>
                ) : (
                  <div className="max-w-[92%] rounded-2xl rounded-bl-md bg-sunken/70 px-4 py-3 text-sm">
                    {m.answer.paragraphs.map((p, i) => (
                      <p key={i} className={i ? 'mt-2' : ''}>
                        {p}
                      </p>
                    ))}
                    {m.answer.bullets.length > 0 && (
                      <ul className="mt-2 space-y-1.5">
                        {m.answer.bullets.map((b) => (
                          <li key={b} className="flex gap-2 text-ink-2">
                            <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-ink-3" aria-hidden />
                            {b}
                          </li>
                        ))}
                      </ul>
                    )}
                    <Disclosure summary="Based on" className="mt-3 border-t border-line/70 pt-2" buttonClassName="text-label">
                      <BasisList basis={m.answer.basis} />
                    </Disclosure>
                    {m.answer.followUps.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {m.answer.followUps.slice(0, 2).map((f) => (
                          <button key={f} type="button" onClick={() => ask(f)} className="rounded-full border border-line bg-surface px-2.5 py-1 text-label font-medium text-ink-2 hover:border-accent/40">
                            {f}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
          {thinking && (
            <div className="flex w-fit gap-1 rounded-2xl bg-sunken/70 px-4 py-3" aria-label="Thinking">
              {[0, 1, 2].map((i) => (
                <motion.span key={i} className="h-1.5 w-1.5 rounded-full bg-ink-3" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1, repeat: Infinity, delay: i * 0.15 }} />
              ))}
            </div>
          )}
        </div>
        <form onSubmit={submit} className="border-t border-line p-4">
          <div className="flex items-center gap-2 rounded-ctl border border-line bg-surface p-1.5 pl-3.5 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20">
            <label htmlFor="ask" className="sr-only">
              Ask a question about this farm
            </label>
            <input id="ask" data-autofocus className="min-w-0 flex-1 bg-transparent py-1.5 text-sm outline-none placeholder:text-ink-3" placeholder="Ask about soil, crop, disease, water…" value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" />
            <button type="submit" className="btn-primary h-9 w-9 p-0" disabled={!text.trim() || thinking} aria-label="Send">
              <ArrowUp className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-2 text-label text-ink-3">Rule-based assistant ({assistantService.providerId}) · ready for our trained model</p>
        </form>
      </div>
    </Drawer>
  );
}
