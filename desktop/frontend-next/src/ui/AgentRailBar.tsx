import { t } from "../i18n";
import { elapsed } from "../i18n/format";
import { AgentAvatar, nameOf } from "./cards/SubagentGroup";
import type { Task } from "./panels/Agents";

/** The session's running delegates as a persistent rail at the top of the
 *  conversation: one chip per live sub-agent, click to open its full run.
 *  Background jobs keep their own chips on the meter rail — this bar carries
 *  delegates only, and an idle session draws nothing at all. */
export function AgentRailBar({ tasks, onOpen }: { tasks: Task[]; onOpen: (taskId: string) => void }) {
  const live = tasks.filter((x) => x.running);
  if (live.length === 0) return null;
  return (
    <div className="agentrail" role="list" aria-label={t("活跃子智能体")}>
      {live.map((x) => {
        const name = nameOf(x);
        const took = x.tool.durationMs ? elapsed(x.tool.durationMs) : "";
        return (
          <button
            key={x.id}
            type="button"
            role="listitem"
            className="agentrail-chip"
            data-action="agentrail.open"
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
