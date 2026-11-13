/*
 * Handing over an invitation. The link always goes back to whoever made it, to
 * pass on by hand. It is emailed as well when this server sends email and the
 * invitation names an address.
 */

import type { InviteMade } from '@reactive-family-tree/core';

import type { App } from './app';
import { INVITE_DAYS } from './members';
import type { NewInvite } from './members';

export async function deliverInvite({ config, mailer, store }: Pick<App, 'config' | 'mailer' | 'store'>, { id, token, email }: NewInvite, by: string): Promise<InviteMade> {
  const link = `${config.baseUrl}/?invite=${token}`;
  let emailedTo: string | null = null;
  if (email && mailer.delivers) {
    const family = store.settings.familyName;
    try {
      await mailer.send({
        to: email,
        subject: `${by} invited you to the ${family} tree`,
        text: `${by} invited you to the ${family} family tree.\n\nOpen this link to join. It works once and for ${INVITE_DAYS} days.\n\n${link}\n\nIf you do not know ${by}, ignore this message.`,
      });
      emailedTo = email;
    } catch (error) {
      // The invitation stands. Its maker is told to pass the link on by hand.
      console.error(`The invitation to ${email} could not be emailed.`, error);
    }
  }
  return { id, link, emailedTo };
}
