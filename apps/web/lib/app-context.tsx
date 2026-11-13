'use client';

/*
 * What every part of the interface can ask of the app: who is signed in, the
 * tree as they may see it, and the few things that can be done from anywhere
 * (say something in a toast, open a panel, send an edit).
 */

import type { Contact, EditResult, MemberView, Op, PersonLeaf, Relation, SessionInfo, TreePerson, TreeSnapshot } from '@reactive-family-tree/core';
import { createContext, useContext } from 'react';
import type { FamilyTreeHandle } from 'reactive-family-tree';

export type PanelName = 'signin' | 'invite' | 'inbox' | 'history' | 'manage' | 'connect' | 'help';

/* What a panel was opened with. Which fields matter depends on the panel. */
export interface PanelArgs {
  tab?: string;
  /* An edit to scroll to. */
  editId?: string | null;
  /* For a person's history. */
  personId?: string;
  name?: string;
  /* For an invitation. */
  token?: string;
}

export interface ToastOptions {
  action?: string;
  onAction?(): void;
  bad?: boolean;
  ms?: number;
}

export interface SubmitOptions {
  note?: string;
  /* A visitor leaves a name and an email with a suggestion. */
  contact?: Contact | null;
  /* What to say instead of "Saved". */
  quiet?: string | null;
}

export type CardMode = 'view' | 'edit' | 'add';

/* While branches are being assigned on the tree itself. */
export interface Painting {
  member: MemberView;
  members: MemberView[];
}

export interface AppController {
  session: SessionInfo;
  tree: TreeSnapshot;
  people: ReadonlyMap<string, TreePerson>;
  isAdmin: boolean;
  painting: Painting | null;
  /* The tree itself, for flying to a leaf or asking where one is. Null until it has been drawn. */
  view: FamilyTreeHandle | null;

  toast(message: string, options?: ToastOptions): void;
  /* Say what went wrong, in the words the server used. */
  fail(error: unknown): void;
  /* Everything again: after this browser changed something, or the server said someone else did. */
  refresh(): Promise<void>;
  /* After signing in or out. */
  signedIn(): Promise<void>;

  /* Choose a person and open their card, or pass null to close it. */
  select(id: string | null, options?: { fly?: boolean; force?: boolean }): void;
  /* Open a person's card straight into editing them or adding a relative. */
  openCard(person: PersonLeaf, mode?: CardMode, extra?: { relation?: Relation }): void;
  /*
   * Send an edit. Says what happened in a toast: saved (with Undo), or sent for
   * review. A refusal is thrown, so a form can show it beside what caused it.
   */
  submit(ops: Op[], message: string, options?: SubmitOptions): Promise<EditResult>;
  /* Show the family this person belongs to. */
  focusOn(personId: string): Promise<void>;
  /* Light the branches between the viewer and someone, and say what they are to each other. */
  showRelationship(person: PersonLeaf): Promise<void>;

  openPanel(name: PanelName, args?: PanelArgs): void;
  closePanel(): void;

  /* Ring everyone in the colour of the steward who looks after them. Null clears it. */
  showBranches(members: MemberView[] | null): void;
  startPainting(member: MemberView, members: MemberView[]): void;
}

const AppContext = createContext<AppController | null>(null);

export const AppProvider = AppContext.Provider;

export function useApp(): AppController {
  const app = useContext(AppContext);
  if (!app) throw new Error('useApp() was called outside the app.');
  return app;
}
