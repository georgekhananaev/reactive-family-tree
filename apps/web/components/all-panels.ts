/* Every panel the side panel can hold, by name. */

import type { PanelName } from '@/lib/app-context';

import type { PanelDef } from './Drawer';
import { connect, help, history, inbox, manage } from './panels';
import { invite, signin } from './SignInPanel';

export const PANELS: Record<PanelName, PanelDef> = { signin, invite, inbox, history, manage, connect, help };
