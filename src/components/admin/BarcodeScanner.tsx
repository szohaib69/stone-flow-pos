import { useEffect, useRef, useState } from "react";
import { Camera, X } from "lucide-react";

import { Button } from "@/components/ui/button";

export function CameraScanner({
  onDetected,
  onClose,
}: {
  onDetected: (code: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stop: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      try {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const reader = new BrowserMultiFormatReader();
        const controls = await reader.decodeFromVideoDevice(
          undefined,
          videoRef.current ?? undefined,
          (result) => {
            if (result) onDetected(result.getText());
          },
        );
        if (cancelled) controls.stop();
        else stop = () => controls.stop();
      } catch {
        setError("Could not open the camera. Check browser permissions.");
      }
    })();

    return () => {
      cancelled = true;
      stop?.();
    };
  }, [onDetected]);

  return (
    <div className="mt-3 overflow-hidden rounded-md border border-border">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          <Camera className="size-3.5" /> Point the camera at the barcode
        </span>
        <Button size="sm" variant="ghost" onClick={onClose} aria-label="Close camera scanner">
          <X className="size-4" />
        </Button>
      </div>
      {error ? (
        <p className="p-4 text-sm text-destructive">{error}</p>
      ) : (
        <video ref={videoRef} className="h-56 w-full bg-black object-cover" muted playsInline />
      )}
    </div>
  );
}