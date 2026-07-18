"use client";

import { useEffect, useRef, useState } from "react";

interface Options {
  title: string;
  width?: number;
  height?: number;
  onClose: () => void;
}

/** Abre uma janela de verdade do navegador (window.open) e devolve o <div>
 * dela pra montar conteudo React dentro via createPortal - diferente do
 * Modal in-page (preso e clampado ao viewport da aba atual), essa janela e
 * gerenciada pelo SO e da pra arrastar pra outro monitor. Copia
 * <link rel=stylesheet>/<style> e o className/data-theme do <html> da aba
 * principal pra popup renderizar com os mesmos tokens Sumula. Se o
 * navegador bloquear o popup, `blocked` fica true e quem chama decide o
 * fallback (ex.: cair pro Modal in-page).
 *
 * A janela abre so uma vez (por `attempt`) - `title` tem seu proprio efeito
 * que so atualiza `document.title`, sem fechar/reabrir a janela. Ela mudar a
 * cada tecnico adicionado/removido da comparacao (ver RankingComparison) e
 * nao pode derrubar a janela do usuario a cada clique.
 *
 * `window.open` roda dentro de um setTimeout(0), nunca direto no corpo do
 * efeito: chamar sincrono dispara blur/focus no opener, que em alguns
 * navegadores (visto no Firefox) reentra no scheduler do React enquanto ele
 * ainda esta commitando os efeitos do StrictMode double-invoke (dev) -
 * "Should not already be working", erro sem error boundary que derruba a
 * arvore inteira (pagina fica em branco). Adiar pro proximo tick garante que
 * o commit do React ja terminou antes do open acontecer. */
export function usePopoutWindow({ title, width = 1000, height = 860, onClose }: Options) {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const popupRef = useRef<Window | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    let cancelled = false;
    let popup: Window | null = null;
    let closedByCleanup = false;

    const timer = setTimeout(() => {
      if (cancelled) return;

      const left = window.screenX + Math.max(0, (window.outerWidth - width) / 2);
      const top = window.screenY + Math.max(0, (window.outerHeight - height) / 2);
      // "popup=yes" pede pro Chrome/Edge renderizar como janela de app
      // minimalista (so uma tira fina de titulo, sem barra de endereco) -
      // Firefox nao tem equivalente e sempre mostra a barra completa por
      // politica propria, sem flag que mude isso.
      popup = window.open(
        "",
        "",
        `popup=yes,toolbar=no,location=no,menubar=no,status=no,directories=no,width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`,
      );
      if (!popup) {
        setBlocked(true);
        return;
      }

      const html = popup.document.documentElement;
      html.className = document.documentElement.className;
      const theme = document.documentElement.getAttribute("data-theme");
      if (theme) html.setAttribute("data-theme", theme);

      document.querySelectorAll('link[rel="stylesheet"], style').forEach((node) => {
        popup!.document.head.appendChild(node.cloneNode(true));
      });

      popup.document.body.style.margin = "0";
      popup.document.body.style.background = "var(--papel)";
      popup.document.body.style.color = "var(--tinta)";

      const mount = popup.document.createElement("div");
      mount.style.minHeight = "100vh";
      mount.style.padding = "1.25rem";
      popup.document.body.appendChild(mount);

      popupRef.current = popup;
      setContainer(mount);

      popup.addEventListener("pagehide", () => {
        if (!closedByCleanup) onCloseRef.current();
      });
    }, 0);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      closedByCleanup = true;
      popupRef.current = null;
      popup?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height, attempt]);

  useEffect(() => {
    if (popupRef.current) popupRef.current.document.title = title;
  }, [title]);

  function retry() {
    setBlocked(false);
    setAttempt((n) => n + 1);
  }

  return { container, blocked, retry };
}
