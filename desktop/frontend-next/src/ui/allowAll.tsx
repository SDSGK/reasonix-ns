import { t } from "../i18n";
import type { AgentPort, ApprovalMode } from "../port/port";

// 「全部放行」是两件事合起来：不再逐次询问，并且命令不再关在沙箱里。审批那半
// 由内核的 yolo 模式负责，沙箱那半是配置里的 bash 档位。少任何一半，它承诺的
// 「什么都读得到、什么都不拦」就不成立，所以两者在这里一起动。
export const ALLOW_ALL: ApprovalMode = "yolo";

// 沙箱档位被覆盖前的原值。离开这一档时原样放回去：是我们把它关掉的，就该由
// 我们把它打开，而不是替用户另做一次决定。
const ORIGIN_KEY = "rx-sandbox-before-allow-all";

const remember = (bash: string) => {
  try {
    localStorage.setItem(ORIGIN_KEY, bash);
  } catch {
    // 没有存储的窗口照样拿到这个模式，只是离开时无法还原。
  }
};

const peek = (): string => {
  try {
    return localStorage.getItem(ORIGIN_KEY) ?? "";
  } catch {
    return "";
  }
};

const forget = () => {
  try {
    localStorage.removeItem(ORIGIN_KEY);
  } catch {
    // 没有存储就没有原值可清。
  }
};

/** applyAllowAll 把两半一起打开。
 *
 * 顺序是有讲究的：先免掉询问，再撤掉沙箱。这样失败时留下的永远是安全的那一半
 * ——询问已免但命令仍关着——而不是命令已放开却还要逐次询问。反过来先撤沙箱，
 * 一个被拒绝的询问就会落在一台已经敞开的机器上。 */
export async function applyAllowAll(port: AgentPort): Promise<void> {
  await port.setApprovalMode(ALLOW_ALL);
  const box = await port.sandbox();
  if (box.bash === "off") return;
  remember(box.bash);
  await port.saveSandbox({ ...box, bash: "off" });
}

/** leaveAllowAll 把两半一起关掉。
 *
 * 两半各自尽力：一边失败不拦着另一边。沙箱关不回去时仍要恢复询问——命令
 * 不受限时每个动作都有人过问，比没人问安全。反过来询问被拒绝时（正在跑
 * 任务时内核会拒绝），留下的是「命令受限但不再询问」，也是安全的那一半。 */
export async function leaveAllowAll(port: AgentPort, next: ApprovalMode): Promise<void> {
  const origin = peek();
  let failure: unknown = null;
  if (origin) {
    const box = await port.sandbox().catch(() => null);
    if (box && box.bash === "off") {
      try {
        await port.saveSandbox({ ...box, bash: origin });
        forget();
      } catch (e) {
        failure = e;
      }
    } else if (box) {
      // 沙箱已经不在「关着」那一档：原值说的不是它现在的样子，留着只会让
      // 下一次离开把一个陌生的档位写回去。
      forget();
    }
    // 读不到现在的档位，就不知道沙箱是不是我们关的那一个：原值留着，
    // 下一次离开还能再试。
  }
  try {
    await port.setApprovalMode(next);
  } catch (e) {
    failure = failure ?? e;
  }
  if (failure) throw failure;
}

/** applyMode 是两处入口（对话框的权限菜单、设置页）共用的那一次切换。 */
export function applyMode(port: AgentPort, mode: ApprovalMode): Promise<void> {
  return mode === ALLOW_ALL ? applyAllowAll(port) : leaveAllowAll(port, mode);
}

/** AllowAllConfirm 是选这一档时被问的那句话。它说出这一档对文件和对命令做了
 *  什么，因为那两样事在选完之后就看不出来了。 */
export function AllowAllConfirm({ onGo, onCancel }: { onGo: () => void; onCancel: () => void }) {
  return (
    <div className="wsconfirm" role="alertdialog" aria-label={t("safety.allow_all_confirm_what")}>
      <div className="wsconfirm-t">
        <span className="q">{t("safety.allow_all_confirm_what")}</span>
        <span className="h">{t("safety.allow_all_confirm_hint")}</span>
      </div>
      <div className="wsconfirm-a">
        <button type="button" data-action="layer.dismiss" onClick={onCancel}>
          {t("common.cancel")}
        </button>
        <button type="button" data-action="safety.allow-all-confirm" data-danger="" onClick={onGo}>
          {t("safety.allow_all_confirm_go")}
        </button>
      </div>
    </div>
  );
}
