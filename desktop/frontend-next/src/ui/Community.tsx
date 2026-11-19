import { useMemo, useState } from "react";
import { t } from "../i18n";
import type { AgentPort } from "../port/port";
import contributors from "../data/contributors.json";
import { COMMUNITY, profileUrl } from "./communityLinks";

const COLLAPSED = 24;

export function Community({ port, logins = contributors }: { port: Pick<AgentPort, "openExternal">; logins?: string[] }) {
  const [all, setAll] = useState(false);
  const [failed, setFailed] = useState("");

  const open = (url: string) =>
    void port.openExternal(url).then(() => setFailed(""), () => setFailed(t("common.could_not_open_a_browser", { at: url })));

  const people = useMemo(
    () => logins.flatMap((login) => { const url = profileUrl(login); return url ? [{ login, url }] : []; }),
    [logins],
  );
  const shown = all ? people : people.slice(0, COLLAPSED);

  return (
    <div className="comm">
      <div className="comm-acts">
        <button type="button" className="btn" data-action="community.issues" onClick={() => open(COMMUNITY.issues)}>{t("feedback.go_to_github")}</button>
      </div>

      {failed && <p className="comm-fail" role="alert">{failed}</p>}

      <div className="comm-who">
        <div className="comm-who-hd">
          <h4>{t("feedback.contributors")}</h4>
          <span className="comm-k">{t("feedback.sorted_by_commits_the_list")}</span>
          <button type="button" className="btn sm" data-action="community.contributors" onClick={() => open(COMMUNITY.contributors)}>{t("feedback.view_all_contributors")}</button>
        </div>
        <ul className="comm-list" aria-label={t("feedback.contributors")}>
          {shown.map(({ login, url }) => (
            <li key={login}>
              <a href={url} data-action="community.profile" data-target={login} onClick={(e) => { e.preventDefault(); open(url); }}>{login}</a>
            </li>
          ))}
        </ul>
        {people.length > COLLAPSED && (
          <button type="button" className="btn sm comm-more" data-action="community.more" aria-expanded={all} onClick={() => setAll((v) => !v)}>
            {all ? t("common.collapse") : t("feedback.show_all_n", { n: people.length })}
          </button>
        )}
      </div>
    </div>
  );
}
