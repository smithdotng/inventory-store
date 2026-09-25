'use client';

import { useRef, useState } from 'react';
import { cn } from '@/lib/format';
import { Img } from './Img';

/** Swipeable on phones (scroll-snap), thumbnails on larger screens. */
export function ProductGallery({ images, alt }: { images: string[]; alt: string }) {
  const [idx, setIdx] = useState(0);
  const track = useRef<HTMLDivElement>(null);
  const list = images.length ? images : [''];

  const goTo = (i: number) => {
    setIdx(i);
    const el = track.current;
    if (el) el.scrollTo({ left: el.clientWidth * i, behavior: 'smooth' });
  };

  return (
    <div className="flex flex-col-reverse gap-3 self-start lg:flex-row lg:items-start">
      {list.length > 1 && (
        <div className="no-scrollbar hidden gap-2 overflow-auto sm:flex lg:max-h-[560px] lg:flex-col">
          {list.map((src, i) => (
            <button key={i} onClick={() => goTo(i)} aria-label={`View image ${i + 1}`} className={cn('h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2 lg:h-20 lg:w-20', i === idx ? 'border-ink' : 'border-transparent opacity-70 hover:opacity-100')}>
              <Img src={src} alt="" />
            </button>
          ))}
        </div>
      )}
      <div className="relative flex-1 overflow-hidden rounded-card border border-line bg-surface">
        <div
          ref={track}
          onScroll={(e) => {
            const el = e.currentTarget;
            setIdx(Math.round(el.scrollLeft / el.clientWidth));
          }}
          className="no-scrollbar flex aspect-square snap-x snap-mandatory overflow-x-auto"
        >
          {list.map((src, i) => (
            <div key={i} className="h-full w-full shrink-0 snap-center">
              <Img src={src || undefined} alt={i === 0 ? alt : `${alt} — image ${i + 1}`} loading={i === 0 ? 'eager' : 'lazy'} className="object-contain" />
            </div>
          ))}
        </div>
        {list.length > 1 && (
          <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5 sm:hidden">
            {list.map((_, i) => (
              <span key={i} className={cn('h-1.5 rounded-full transition-all', i === idx ? 'w-5 bg-ink' : 'w-1.5 bg-ink/30')} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
