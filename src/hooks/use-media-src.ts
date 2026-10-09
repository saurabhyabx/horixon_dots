import { useEffect, useState } from "react";
import { isMediaRef, loadBlob } from "../lib/media-store";

/** Resolves an attachment to something playable: stored blobs become object URLs, data URLs pass through. */
export function useMediaSrc(data: string) {
  const [src, setSrc] = useState<string | null>(isMediaRef(data) ? null : data);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    if (!isMediaRef(data)) {
      setSrc(data);
      return;
    }
    let url: string | undefined;
    let cancelled = false;
    setSrc(null);
    setMissing(false);
    loadBlob(data)
      .then((blob) => {
        if (cancelled) return;
        if (!blob) return setMissing(true);
        url = URL.createObjectURL(blob);
        setSrc(url);
      })
      .catch(() => !cancelled && setMissing(true));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [data]);
  return { src, missing };
}
