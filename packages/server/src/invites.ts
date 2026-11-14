/*
 * Handing over an invitation. The link always goes back to whoever made it, to
 * pass on by hand. It is emailed as well when this server sends email and the
 * invitation names an address.
 */

import type { InviteMade, Lang } from '@reactive-family-tree/core';

import type { App } from './app';
import { INVITE_DAYS } from './members';
import type { NewInvite } from './members';
import { familyText } from './settings';
import { tell } from './words';

/* The invitation is written in the language of whoever invites: the person invited is likely to read it too. */
export async function deliverInvite({ config, mailer, store }: Pick<App, 'config' | 'mailer' | 'store'>, { id, token, email }: NewInvite, by: string, lang: Lang = store.settings.language): Promise<InviteMade> {
  const link = `${config.baseUrl}/?invite=${token}`;
  let emailedTo: string | null = null;
  if (email && mailer.delivers) {
    const family = familyText(store.settings, 'familyName', lang);
    try {
      await mailer.send({
        to: email,
        subject: tell(lang, '{by} invited you to the {family} tree', { by, family }),
        text: tell(lang, '{by} invited you to the {family} family tree.\n\nOpen this link to join. It works once and for {days} days.\n\n{link}\n\nIf you do not know {by}, ignore this message.', { by, family, days: INVITE_DAYS, link }),
      });
      emailedTo = email;
    } catch (error) {
      // The invitation stands. Its maker is told to pass the link on by hand.
      console.error(`The invitation to ${email} could not be emailed.`, error);
    }
  }
  return { id, link, emailedTo };
}
