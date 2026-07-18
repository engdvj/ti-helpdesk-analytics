"use client";

import { X } from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

interface Props {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  draggable?: boolean;
  maxWidth?: CSSProperties["maxWidth"];
  modeless?: boolean;
  initialOffset?: { x: number; y: number };
  zIndex?: number;
  closeOnEscape?: boolean;
  onActivate?: () => void;
}

interface DragState {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  rect: DOMRect;
}

const subscribeToMount = () => () => {};

export function Modal({
  title,
  onClose,
  children,
  draggable = false,
  maxWidth = 640,
  modeless = false,
  initialOffset = { x: 0, y: 0 },
  zIndex = 200,
  closeOnEscape = true,
  onActivate,
}: Props) {
  const mounted = useSyncExternalStore(subscribeToMount, () => true, () => false);
  const [offset, setOffset] = useState(() => initialOffset);
  const [isDragging, setIsDragging] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const titleId = useId();
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (closeOnEscape && e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [closeOnEscape, onClose]);

  useEffect(() => {
    if (offset.x === 0 && offset.y === 0) return;
    window.dispatchEvent(new Event("sumula-modal-move"));
  }, [offset]);

  function startDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (!draggable || event.button !== 0 || !cardRef.current) return;
    if ((event.target as HTMLElement).closest("button")) return;

    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: offset.x,
      originY: offset.y,
      rect: cardRef.current.getBoundingClientRect(),
    };
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setIsDragging(true);
  }

  function moveDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    event.preventDefault();
    const viewportPadding = 8;
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    const minX = viewportPadding - drag.rect.left;
    const maxX = window.innerWidth - viewportPadding - drag.rect.right;
    const minY = viewportPadding - drag.rect.top;
    const maxY = window.innerHeight - viewportPadding - drag.rect.bottom;
    const boundedX = minX <= maxX ? Math.min(Math.max(deltaX, minX), maxX) : deltaX;
    const boundedY = minY <= maxY ? Math.min(Math.max(deltaY, minY), maxY) : deltaY;

    setOffset({ x: drag.originX + boundedX, y: drag.originY + boundedY });
  }

  function stopDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    dragRef.current = null;
    setIsDragging(false);
  }

  if (!mounted) return null;

  return createPortal(
    <div
      onClick={modeless ? undefined : onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: modeless ? "transparent" : "color-mix(in srgb, black 45%, transparent)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex,
        padding: "1rem",
        pointerEvents: modeless ? "none" : "auto",
      }}
    >
      <div
        ref={cardRef}
        role="dialog"
        aria-modal={modeless ? undefined : "true"}
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={onActivate}
        className="sumula-cartao"
        style={{
          width: "100%",
          maxWidth,
          maxHeight: "85vh",
          overflowY: "auto",
          padding: "1.25rem",
          transform: `translate3d(${offset.x}px, ${offset.y}px, 0)`,
          pointerEvents: "auto",
        }}
      >
        <div
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={stopDrag}
          onPointerCancel={stopDrag}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "1rem",
            cursor: draggable ? (isDragging ? "grabbing" : "grab") : "default",
            touchAction: draggable ? "none" : undefined,
            userSelect: draggable ? "none" : undefined,
          }}
        >
          <h2 id={titleId} style={{ fontFamily: "var(--font-display)", fontSize: "var(--fonte-h)", fontWeight: 600 }}>{title}</h2>
          <button onClick={onClose} aria-label="Fechar" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--apagado)" }}>
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
