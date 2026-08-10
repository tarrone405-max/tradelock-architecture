"use client";

import { useEffect, useRef, useState } from "react";

export default function SignaturePad({
  changeOrderId,
  token,
  action,
  termsVersionId,
}: {
  changeOrderId: string;
  token: string;
  action: (formData: FormData) => void;
  termsVersionId?: string | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const signatureInputRef = useRef<HTMLInputElement>(null);
  const drawing = useRef(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [signatureName, setSignatureName] = useState("");
  // No active ToS to agree to => nothing gating submission on this front.
  const [agreedToTerms, setAgreedToTerms] = useState(!termsVersionId);
  const canSubmit = hasDrawn && signatureName.trim().length > 0 && agreedToTerms;

  // Size the drawing buffer to the canvas's actual rendered size, scaled
  // for device pixel ratio so signatures stay crisp on phone screens —
  // this is normally signed on a homeowner's phone, not a desktop.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    canvas.getContext("2d")?.scale(ratio, ratio);
  }, []);

  function getPos(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    canvas.setPointerCapture(e.pointerId);
    const ctx = canvas.getContext("2d")!;
    const { x, y } = getPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    drawing.current = true;
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = canvasRef.current!.getContext("2d")!;
    const { x, y } = getPos(e);
    ctx.lineTo(x, y);
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
    setHasDrawn(true);
  }

  function handlePointerUp() {
    drawing.current = false;
  }

  function handleClear() {
    const canvas = canvasRef.current!;
    canvas.getContext("2d")!.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    if (!canSubmit) {
      e.preventDefault();
      return;
    }
    signatureInputRef.current!.value = canvasRef.current!.toDataURL("image/png");
  }

  return (
    <form action={action} onSubmit={handleSubmit} className="space-y-3">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="changeOrderId" value={changeOrderId} />
      <input type="hidden" name="signatureData" ref={signatureInputRef} />
      {termsVersionId && <input type="hidden" name="termsVersionId" value={termsVersionId} />}

      <div>
        <label className="block text-xs font-medium text-gray-900">Full legal name</label>
        <input
          type="text"
          name="signatureName"
          required
          value={signatureName}
          onChange={(e) => setSignatureName(e.target.value)}
          placeholder="Jane Homeowner"
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm placeholder:text-gray-500 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
        />
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-300 bg-white">
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          className="h-36 w-full touch-none"
        />
      </div>

      {termsVersionId && (
        <label className="flex items-start gap-2 text-xs text-gray-900">
          <input
            type="checkbox"
            name="termsAccepted"
            checked={agreedToTerms}
            onChange={(e) => setAgreedToTerms(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900"
          />
          <span>I agree to the Terms of Service</span>
        </label>
      )}

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={handleClear}
          className="text-sm font-medium text-gray-900 hover:text-gray-900"
        >
          Clear
        </button>
        <button
          type="submit"
          disabled={!canSubmit}
          className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Approve &amp; sign
        </button>
      </div>
    </form>
  );
}
