/** @type {import('next-sitemap').IConfig} */

module.exports = {
  // Driven by the same APP_URL used by the cron/uptime workflows (see
  // CLAUDE.md's "Monitoring" section) so the sitemap/robots output tracks
  // this project's actual current deployment instead of a hardcoded,
  // stale domain from the old HackTrack EU project.
  siteUrl: process.env.APP_URL || "https://findhackeu.vercel.app",
  generateRobotsTxt: true,
  priority: 1,
  transform: async (config, path) => {
    if (path === "/docs" || path === "/privacy" || path === "/terms") {
      return {
        loc: path,
        changefreq: "yearly",
        priority: 0.8,
        lastmod: config.autoLastmod ? new Date().toISOString() : undefined,
      };
    }

    return {
      loc: path,
      changefreq: config.changefreq,
      priority: config.priority,
      lastmod: config.autoLastmod ? new Date().toISOString() : undefined,
    };
  },
};
