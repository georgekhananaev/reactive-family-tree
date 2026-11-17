/*
 * Where a running demo of the whole app is, when the site was built with one
 * (PUBLIC_DEMO_APP_URL). Without it the site links to nothing outside itself.
 * Author: George Khananaev
 */

const url: unknown = import.meta.env.PUBLIC_DEMO_APP_URL;

export const DEMO_APP_URL: string | undefined = typeof url === 'string' && url ? url : undefined;
