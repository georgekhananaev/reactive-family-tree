'use client';

/*
 * The side panel. It holds one panel at a time (sign in, inbox, manage, connect
 * your AI, a person's history) and slides in from the right.
 *
 * A panel is a title, optionally some tabs, and a body. The body fetches what
 * it shows and is drawn again whenever the family changes.
 */

import { useEffect, useLayoutEffect, useRef } from 'react';
import type { ComponentType } from 'react';

import type { AppController, PanelArgs, PanelName } from '@/lib/app-context';
import { useApp } from '@/lib/app-context';
import { usePresence } from '@/lib/hooks';
import { useT } from '@/lib/i18n';

import { arrowThrough } from './ui';

export interface PanelProps {
  args: PanelArgs;
  /* Change what the panel was opened with, for example to scroll to another edit. */
  setArgs(patch: Partial<PanelArgs>): void;
}

/* The page's own `t`: a panel says its title and the names of its tabs with it, in the reader's language. */
type Say = ReturnType<typeof useT>['t'];

export interface PanelDef {
  title(args: PanelArgs, app: AppController, t: Say): string;
  tabs?(app: AppController, args: PanelArgs, t: Say): readonly (readonly [string, string])[];
  Body: ComponentType<PanelProps>;
}

export interface OpenPanel {
  name: PanelName;
  args: PanelArgs;
  /* False for a panel that opened by itself: it does not take the keyboard from whatever had it. */
  focus: boolean;
}

const SLIDE_MS = 380;

export function Drawer({ current, panels, onArgs, onClose }: {
  current: OpenPanel | null;
  panels: Record<PanelName, PanelDef>;
  onArgs(args: PanelArgs): void;
  onClose(): void;
}) {
  const app = useApp();
  const { t } = useT();
  const { present, shown } = usePresence(current !== null, SLIDE_MS);
  // While it slides out there is no current panel any more, so the last one stays drawn
  const last = useRef(current);
  if (current) last.current = current;
  const drawn = present ? last.current : null;

  const closeButton = useRef<HTMLButtonElement>(null);
  const tabStrip = useRef<HTMLDivElement>(null);
  const returnTo = useRef<Element | null>(null);
  const isOpen = current !== null;

  // Opening takes the keyboard, closing gives it back to where it was
  useLayoutEffect(() => {
    if (isOpen) {
      returnTo.current = document.activeElement;
      if (last.current?.focus) closeButton.current?.focus({ preventScroll: true });
      return;
    }
    const back = returnTo.current;
    if (back instanceof HTMLElement && back.isConnected) back.focus({ preventScroll: true });
  }, [isOpen]);

  const panel = drawn ? panels[drawn.name] : null;
  const tabs = (drawn && panel?.tabs?.(app, drawn.args, t)) || [];
  const tab = tabs.some(([key]) => key === drawn?.args.tab) ? drawn?.args.tab : tabs[0]?.[0];
  const args = drawn ? { ...drawn.args, tab } : {};

  useEffect(() => {
    tabStrip.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [drawn?.name, tab]);

  const choose = (key: string) => {
    onArgs({ ...args, tab: key, editId: null });
    requestAnimationFrame(() => tabStrip.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus());
  };

  return (
    <aside id="drawer" className={shown ? 'drawer open' : 'drawer'} hidden={!present} aria-label={t('Panel')}>
      <header>
        <h2 id="drawerTitle">{drawn && panel ? panel.title(args, app, t) : ''}</h2>
        <button ref={closeButton} id="drawerClose" type="button" className="close" aria-label={t('Close')} onClick={onClose}>
          ×
        </button>
      </header>
      <div
        ref={tabStrip}
        id="drawerTabs"
        className="tabs"
        role="tablist"
        onKeyDown={(event) => {
          const buttons = [...event.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]')];
          if (arrowThrough(event, buttons)) (document.activeElement as HTMLElement | null)?.click();
        }}
      >
        {tabs.map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={key === tab} tabIndex={key === tab ? 0 : -1} onClick={() => choose(key)}>
            {label}
          </button>
        ))}
      </div>
      <div id="drawerBody" className="drawer-body">
        {drawn && panel && (
          <div key={`${drawn.name}:${tab ?? ''}`} className="drawer-page fresh">
            <panel.Body args={args} setArgs={(patch) => onArgs({ ...args, ...patch })} />
          </div>
        )}
      </div>
    </aside>
  );
}
