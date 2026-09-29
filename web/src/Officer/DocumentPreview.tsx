import { useEffect, useState } from "react";
import { InlineLoading, Link } from "@carbon/react";
import { API_BASE_URL } from "../utils/api";

const BASE_URL = API_BASE_URL;

interface Props {
  documentId: string;
  fileName: string;
  contentType: string;
}

/**
 * Shows a citizen-uploaded file inline. The content endpoint needs the officer's JWT, so it's fetched as a blob.
 * Render with key={documentId} so switching documents starts from a fresh state.
 */
export default function DocumentPreview({ documentId, fileName, contentType }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;

    const load = async () => {
      try {
        const token = localStorage.getItem("officerToken");
        const response = await fetch(`${BASE_URL}/api/Verification/documents/${documentId}/content`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        objectUrl = URL.createObjectURL(await response.blob());
        if (cancelled) URL.revokeObjectURL(objectUrl);
        else setUrl(objectUrl);
      } catch (e) {
        console.error("Failed to load document", e);
        if (!cancelled) setError("The document could not be loaded.");
      }
    };
    load();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [documentId]);

  if (error) return <p style={{ color: "#da1e28", fontSize: "0.875rem" }}>{error}</p>;
  if (!url) return <InlineLoading description="Loading document…" />;

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      {contentType.startsWith("image/") ? (
        <img src={url} alt={fileName} style={{ maxWidth: "100%", maxHeight: "520px", objectFit: "contain", margin: "0 auto" }} />
      ) : (
        <iframe src={url} title={fileName} style={{ width: "100%", height: "520px", border: 0, background: "#fff" }} />
      )}
      <Link href={url} download={fileName} style={{ alignSelf: "center", fontSize: "0.875rem" }}>
        Download {fileName}
      </Link>
    </div>
  );
}
