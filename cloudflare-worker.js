import openNextWorker from "./.open-next/worker.js";

const cronRoutes = {
  '0 0 * * *': '/api/cron/keepalive',
  '15 0 * * *': '/api/cron/subscription-alerts',
};

export default {
  ...openNextWorker,
  async fetch(request, env, ctx) {
    return openNextWorker.fetch(request, env, ctx);
  },
  async scheduled(controller, env, ctx) {
    const route = cronRoutes[controller.cron];
    const origin = env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, '') || 'https://ctms-one.newsly-aashutosh.workers.dev';
    const secret = env.CRON_SECRET?.trim();

    if (!route || !secret) {
      console.warn('CTMS cron configuration is incomplete or route not found for cron:', controller.cron);
      return;
    }

    try {
      const response = await fetch(new URL(route, origin), {
        headers: { authorization: `Bearer ${secret}` },
      });

      if (!response.ok) {
        console.error(`CTMS cron ${controller.cron} failed with HTTP ${response.status}.`);
      } else {
        console.log(`CTMS cron ${controller.cron} executed successfully.`);
      }
    } catch (err) {
      console.error(`CTMS cron error for ${controller.cron}:`, err);
    }
  },
};
