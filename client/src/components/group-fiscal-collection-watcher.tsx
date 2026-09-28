import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { recoverGroupFiscalCollection, type PendingFiscalCollection } from "@/lib/group-fiscal-collection-recovery";

interface GlobalPendingFiscalCollection extends PendingFiscalCollection {
  groupId: string;
}

/**
 * Mounted once for the whole app (see App.tsx). A group's fiscal invoice can
 * be confirmed by ARCA while its Caja/CC movement never gets recorded — the
 * browser that emitted it closed, lost network, etc. before the follow-up
 * call completed. group-detail.tsx already retries this automatically, but
 * only while that specific group's page happens to be open. This watcher
 * polls across every group so the retry runs whenever anyone is logged in,
 * without reception having to remember which group was mid-cobro.
 */
export default function GroupFiscalCollectionWatcher() {
  const { data: pending = [] } = useQuery<GlobalPendingFiscalCollection[]>({
    queryKey: ["/api/groups/pending-fiscal-collections"],
    refetchInterval: 3 * 60 * 1000,
  });
  const recovering = useRef(new Set<number>());

  useEffect(() => {
    for (const item of pending) {
      const invoiceId = Number(item?.id);
      if (!invoiceId || !item.groupId || recovering.current.has(invoiceId)) continue;
      recovering.current.add(invoiceId);
      recoverGroupFiscalCollection(item.groupId, item)
        .then((result) => {
          if (result !== "recovered") recovering.current.delete(invoiceId);
        })
        .catch(() => {
          recovering.current.delete(invoiceId);
        });
    }
  }, [pending]);

  return null;
}
