import { IDAO } from "@stabilitydao/stability";
import { LifecyclePhase } from "@stabilitydao/stability/out/os";

export function isLive(dao: IDAO): boolean {
  return [
    LifecyclePhase.LIVE_VESTING,
    LifecyclePhase.LIVE,
    LifecyclePhase.LIVE_CLIFF,
  ].includes(dao.phase);
}
