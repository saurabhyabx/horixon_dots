import { useMediaSrc } from "../hooks/use-media-src";
import { mediaKind, type MediaFile } from "../lib/media-store";

export function MediaPlayer({ file }: { file: MediaFile }) {
  const kind = mediaKind(file);
  const { src, missing } = useMediaSrc(file.data);
  if (kind === "other") return <span className="card-file-chip">{file.name}</span>;
  if (missing)
    return (
      <span className="card-file-chip">{file.name} · recording not found in this browser</span>
    );
  if (!src) return <span className="media-loading" aria-hidden />;
  return kind === "audio" ? (
    <audio controls preload="metadata" src={src} aria-label={file.name} />
  ) : (
    <video
      className="card-video"
      controls
      playsInline
      preload="metadata"
      src={src}
      aria-label={file.name}
    />
  );
}

/** A download link that works for stored recordings and plain data URLs. */
export function MediaDownload({ file }: { file: MediaFile }) {
  const { src } = useMediaSrc(file.data);
  return src ? (
    <a href={src} download={file.name}>
      {file.name}
    </a>
  ) : (
    <span>{file.name}</span>
  );
}
