'use client';

/*
 * The petal menu: a ring of actions that opens around a leaf.
 *
 * It opens on a long press, a right click, or the menu key. On touch it works
 * as a marking menu: keep the finger down, slide to a petal, let go. Once
 * learned that takes a quarter of a second and no looking. It also works as
 * tap to open, tap to choose, and with the arrow keys.
 */

import { useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import type { CSSProperties, Ref } from 'react';

import { usePresence } from '@/lib/hooks';
import { useT } from '@/lib/i18n';

import { Icon } from './Icon';
import type { IconName } from './Icon';
import { arrowThrough } from './ui';

const RADIUS = 92;        // from the leaf to the middle of each petal
const REACH = 40;         // how close a sliding finger must be to a petal to choose it
const ROOM = { side: 138, above: 162, below: 164 };   // what the ring and its captions need around the leaf
const CLOSE_MS = 180;

export interface PetalItem {
  label: string;
  icon: IconName;
  action(): void;
}

/* Where to open, around whom, and with what. `focus` moves the keyboard into the ring, for when the keyboard opened it. */
export interface PetalRequest {
  x: number;
  y: number;
  title: string;
  items: PetalItem[];
  focus: boolean;
}

export interface PetalMenuHandle {
  /* The finger that opened the menu is still down and has moved. */
  move(x: number, y: number): void;
  /* That finger lifted. On a petal, it chooses. Anywhere else the menu stays open for a tap. */
  release(x: number, y: number): void;
}

export function PetalMenu({ request, onClose, ref }: { request: PetalRequest | null; onClose(): void; ref: Ref<PetalMenuHandle> }) {
  const { t } = useT();
  const { present, shown } = usePresence(request !== null, CLOSE_MS);
  // While it closes there is no request any more, so the last one stays drawn
  const last = useRef(request);
  if (request) last.current = request;
  const drawn = present ? last.current : null;

  const [hot, setHot] = useState(-1);
  const el = useRef<HTMLDivElement>(null);
  const returnTo = useRef<Element | null>(null);

  // Keep the whole ring, and its captions, on the screen
  const ring = useMemo(() => {
    if (!drawn) return null;
    const side = Math.min(ROOM.side, innerWidth / 2);
    const cx = Math.max(side, Math.min(innerWidth - side, drawn.x));
    const cy = Math.max(ROOM.above, Math.min(innerHeight - ROOM.below, drawn.y));
    const petals = drawn.items.map((_, index) => {
      const angle = -Math.PI / 2 + (index * 2 * Math.PI) / drawn.items.length;
      const dx = Math.cos(angle) * RADIUS, dy = Math.sin(angle) * RADIUS;
      return { dx, dy, x: cx + dx, y: cy + dy };
    });
    return { cx, cy, petals };
  }, [drawn]);

  const choose = (index: number) => {
    const item = last.current?.items[index];
    onClose();
    item?.action();
  };
  const near = (x: number, y: number) => ring?.petals.findIndex((petal) => Math.hypot(x - petal.x, y - petal.y) < REACH) ?? -1;

  useImperativeHandle(ref, () => ({
    move(x, y) {
      const found = near(x, y);
      setHot((was) => {
        if (found !== was && found >= 0) navigator.vibrate?.(5);
        return found;
      });
    },
    release(x, y) {
      const found = near(x, y);
      if (found >= 0) choose(found);
    },
  }));

  // Opening from the keyboard takes the keyboard, and closing gives it back
  const isOpen = request !== null;
  useEffect(() => {
    if (!isOpen) {
      setHot(-1);
      const back = returnTo.current;
      returnTo.current = null;
      if (back instanceof HTMLElement || back instanceof SVGElement) if (back.isConnected) back.focus({ preventScroll: true });
      return;
    }
    if (!last.current?.focus) return;
    returnTo.current = document.activeElement;
    el.current?.querySelector<HTMLElement>('.petal-item')?.focus();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    addEventListener('resize', onClose);
    return () => removeEventListener('resize', onClose);
  }, [isOpen, onClose]);

  return (
    <div
      ref={el}
      className={shown ? 'petal-menu open' : 'petal-menu'}
      hidden={!present}
      role="menu"
      aria-label={drawn ? t('Actions for {name}', { name: drawn.title }) : undefined}
      style={ring ? ({ '--x': `${ring.cx}px`, '--y': `${ring.cy}px` } as CSSProperties) : undefined}
      onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
      onContextMenu={(event) => event.preventDefault()}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          onClose();
        } else {
          arrowThrough(event, [...event.currentTarget.querySelectorAll<HTMLElement>('.petal-item')]);
        }
      }}
    >
      {drawn && ring && drawn.items.map((item, index) => {
        const petal = ring.petals[index];
        if (!petal) return null;
        return (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            className={index === hot ? 'petal-item hot' : 'petal-item'}
            style={{ '--dx': `${petal.dx.toFixed(1)}px`, '--dy': `${petal.dy.toFixed(1)}px`, '--i': index } as CSSProperties}
            onClick={() => choose(index)}
          >
            <Icon name={item.icon} />
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
