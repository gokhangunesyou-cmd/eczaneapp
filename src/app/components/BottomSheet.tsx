import { useState, type ReactNode } from 'react';

/**
 * Üç kademeli bottom sheet — tasarım ekranı 03.
 *
 *   peek 300px → half 460px → full 724px → peek
 *
 * Tutamağa tıklama döngüyü ilerletir (tasarımdaki etkileşim), sürükleme de
 * aynı kademelere oturur. Yükseklikler viewport'a göre sınırlandırılır ki
 * küçük ekranlarda sheet ekranı taşırmasın.
 */
export type SheetStage = 'peek' | 'half' | 'full';

const HEIGHTS: Record<SheetStage, number> = { peek: 300, half: 460, full: 724 };

export function BottomSheet({
  stage,
  onStageChange,
  children,
}: {
  stage: SheetStage;
  onStageChange: (s: SheetStage) => void;
  children: ReactNode;
}) {
  const [dragStartY, setDragStartY] = useState<number | null>(null);

  const cycle = () => onStageChange(stage === 'peek' ? 'half' : stage === 'half' ? 'full' : 'peek');

  const onPointerUp = (e: React.PointerEvent) => {
    if (dragStartY === null) return;
    const dy = e.clientY - dragStartY;
    setDragStartY(null);

    // 40 px'den kısa hareket tıklama sayılır.
    if (Math.abs(dy) < 40) {
      cycle();
      return;
    }
    const order: SheetStage[] = ['peek', 'half', 'full'];
    const i = order.indexOf(stage);
    const next = dy < 0 ? Math.min(i + 1, 2) : Math.max(i - 1, 0);
    onStageChange(order[next]!);
  };

  return (
    <div
      style={{
        position: 'absolute',
        left: '50%',
        transform: 'translateX(-50%)',
        width: '100%',
        // Tasarım 390px genişlik için; masaüstünde sınırsız yayılmasın.
        maxWidth: 520,
        bottom: 0,
        background: 'var(--surface)',
        borderTop: '1px solid var(--border-2)',
        borderRadius: 'var(--r-sheet)',
        boxShadow: 'var(--sh-sheet)',
        height: `min(${HEIGHTS[stage]}px, 88dvh)`,
        transition: `height var(--dur-sheet) var(--ease-sheet)`,
        display: 'flex',
        flexDirection: 'column',
        touchAction: 'none',
      }}
    >
      <button
        aria-label={`Listeyi genişlet — şu an ${stage}`}
        aria-expanded={stage !== 'peek'}
        onPointerDown={(e) => setDragStartY(e.clientY)}
        onPointerUp={onPointerUp}
        style={{ height: 26, display: 'grid', placeItems: 'center', flex: 'none' }}
      >
        <span
          aria-hidden
          style={{
            width: 44,
            height: 5,
            borderRadius: 'var(--r-handle)',
            background: 'var(--border-strong)',
          }}
        />
      </button>

      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          overscrollBehavior: 'contain',
          padding: '0 var(--s-18) var(--s-22)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--s-14)',
        }}
      >
        {children}
      </div>
    </div>
  );
}
