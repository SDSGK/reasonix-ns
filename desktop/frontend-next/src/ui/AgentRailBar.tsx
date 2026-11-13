import { t } from "../i18n";
import { elapsed } from "../i18n/format";
import { AgentAvatar, nameOf } from "./cards/SubagentGroup";
import type { Task } from "./panels/Agents";

// The session's delegates as a persistent rail at the top of the conversation:
// running delegates first, then the most recent finished ones — a replayed
// session's delegates are all finished, and this rail is how a reopened
// session shows who worked on it and how each ended. Background jobs keep
// their own chips on the meter rail; this bar carries delegates only.
const maxShown = 8;

export function AgentRailBar({ tasks, onOpen }: { tasks: Task[]; onOpen: (taskId: string) => void }) {
  const running = tasks.filter((x) => x.running);
  const settled = [...tasks.filter((x) => !x.running)].reverse();
  const shown = [...running, ...settled].slice(0, maxShown);
  if (shown.length === 0) return null;
  return (
    <div className="agentrail" role="list" aria-label={t("子智能体")}>
      {shown.map((x) => {
        const name = nameOf(x);
        const status = x.running ? "running" : "settled";
        const took = x.tool.durationMs ? elapsed(x.tool.durationMs) : "";
        return (
          <button
            key={x.id}
            type="button"
            role="listitem"
            className="agentrail-chip"
            data-action="agentrail.open"
            data-status={status}
            data-target={x.id}
            title={`${name}${took ? ` · ${took}` : ""}`}
            onClick={() => onOpen(x.id)}
          >
            <AgentAvatar name={name} />
            <span className="agentrail-name">{name}</span>
            {took && <span className="agentrail-took">{took}</span>}
          </button>
        );
      })}
    </div>
  );
}
