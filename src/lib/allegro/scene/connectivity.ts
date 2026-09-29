import { parserError } from "../../parser-error";
import type { BrdDatabase } from "../database";
import type { AllegroBuildProgress } from "../build-progress";
export async function readNetAssignments(
  db: BrdDatabase,
  buildProgress: AllegroBuildProgress,
) {
  let earlyWork = 0;
  const assignments = new Map<number, number>();
  buildProgress.begin("解析网络连接");
  for (const assignment of db.records(4)) {
    let key = assignment.ConnItem;
    const visited = new Set<number>();
    while (key && key !== assignment.Key) {
      if (visited.has(key))
        throw parserError("brdNetChainLoop", { detail: key });
      visited.add(key);
      const item = db.get(key);
      if (!item) throw parserError("brdNetConnectionMissing", { detail: key });
      assignments.set(key, assignment.Net);
      key = item.Next ?? 0;
      // A single MCM network can contain hundreds of thousands of objects.
      // Check inside its chain, not only between whole networks.
      if ((++earlyWork & 255) === 0) {
        const pause = buildProgress.checkpoint();
        if (pause) await pause;
      }
    }
    if ((++earlyWork & 255) === 0) {
      const pause = buildProgress.checkpoint();
      if (pause) await pause;
    }
  }
  return assignments;
}
