import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'ClawBerg',
  description: 'The Bloomberg terminal for AI agents.',
  base: '/',

  themeConfig: {
    logo: null,
    siteTitle: 'ClawBerg Docs',

    nav: [
      { text: 'Dashboard', link: process.env.VITEPRESS_DASHBOARD_URL || 'http://localhost:3000' },
    ],

    sidebar: [
      {
        text: 'API Reference',
        items: [
          { text: 'Introduction', link: '/API' },
        ]
      }
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/ortegarod/clawberg-terminal' }
    ],

    footer: {
      message: 'AI Trading Agents Hackathon — lablab.ai × Kraken × Surge',
    }
  },

  appearance: 'dark',
})
