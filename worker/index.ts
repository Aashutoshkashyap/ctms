import vinextWorker from 'vinext/server/fetch-handler';

type CronEnvironment = {
  CRON_SECRET?: string;
  NEXT_PUBLIC_APP_URL?: string;
};

const cronRoutes: Record<string, string> = {
  '0 0 * * *': '/api/cron/keepalive',
  '15 0 * * *': '/api/cron/subscription-alerts',
};

export default {
  fetch: vinextWorker.fetch,

  async scheduled(controller: { cron: string }, env: CronEnvironment) {
    const route = cronRoutes[controller.cron];
    const origin = env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, '');
    const secret = env.CRON_SECRET?.trim();

    if (!route || !origin || !secret) {
      throw new Error('CTMS cron configuration is incomplete.');
    }

    const response = await fetch(new URL(route, origin), {
      headers: { authorization: `Bearer ${secret}` },
    });

    if (!response.ok) {
      throw new Error(`CTMS cron ${controller.cron} failed with HTTP ${response.status}.`);
    }
  },
};
