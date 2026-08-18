import { Badge } from "@/components/ui/Badge";
import { ScrollArea } from "@/components/ui/ScrollArea";
import type { InvestigationResult } from "@/lib/types";

export interface ChatEntry {
  id: string;
  question: string;
  result?: InvestigationResult;
  error?: string;
}

interface ChatTranscriptProps {
  entries: ChatEntry[];
}

export function ChatTranscript({ entries }: ChatTranscriptProps) {
  if (entries.length === 0) {
    return (
      <p className="px-1 py-6 text-center text-xs leading-relaxed text-nexus-muted">
        Nenhuma consulta ainda. Abra um dossiê ou use a paleta. Eu não tenho o gabarito.
      </p>
    );
  }

  return (
    <ScrollArea className="h-full">
      <ol className="flex flex-col gap-3 pr-2">
        {entries.map((entry) => (
          <li key={entry.id} className="space-y-2">
            <div className="rounded-sm border border-nexus-border bg-nexus-bg/50 px-3 py-2">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-nexus-muted">Você</p>
              <p className="mt-1 text-sm text-nexus-text">{entry.question}</p>
            </div>
            {entry.error ? (
              <div className="rounded-sm border border-nexus-danger/40 bg-nexus-danger/10 px-3 py-2 text-sm text-nexus-danger">
                {entry.error}
              </div>
            ) : null}
            {entry.result ? (
              <div className="rounded-sm border border-nexus-signal/25 bg-nexus-signal/5 px-3 py-2">
                <div className="mb-1 flex items-center gap-2">
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-nexus-signal">
                    Investigador
                  </p>
                  <Badge tone="amber">{entry.result.credits_charged} cr</Badge>
                </div>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-nexus-text">
                  {entry.result.answer.answer}
                </p>
                {entry.result.answer.caveats.length > 0 ? (
                  <ul className="mt-2 space-y-1 text-xs text-nexus-muted">
                    {entry.result.answer.caveats.map((caveat) => (
                      <li key={caveat}>⚠ {caveat}</li>
                    ))}
                  </ul>
                ) : null}
                {entry.result.answer.discovered_node_ids.length > 0 ? (
                  <p className="mt-2 font-mono text-[10px] text-nexus-signal">
                    +{entry.result.answer.discovered_node_ids.length} nós · +
                    {entry.result.answer.discovered_relationship_ids.length} relações
                  </p>
                ) : null}
              </div>
            ) : null}
          </li>
        ))}
      </ol>
    </ScrollArea>
  );
}
