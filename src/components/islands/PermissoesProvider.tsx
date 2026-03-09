import { useEffect } from "react";
import { installFetchMetrics } from "../../lib/netMetrics";

export default function PermissoesProvider() {
  useEffect(() => {
    const enableMetrics = import.meta.env.DEV || import.meta.env.PUBLIC_NET_METRICS === "1";
    if (enableMetrics) {
      installFetchMetrics();
    }
  }, []);

  return null;
}
