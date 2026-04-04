import { defineConfig } from 'vitepress'

const zhSidebar = [
  {
    text: '开始使用',
    items: [
      { text: '文档首页', link: '/zh/' },
      { text: '快速开始', link: '/zh/quick-start' },
      { text: '安装', link: '/zh/installation' },
      { text: 'CLI 用法', link: '/zh/cli' },
    ],
  },
  {
    text: '使用说明',
    items: [
      { text: '界面总览', link: '/zh/interface' },
      { text: '常见任务', link: '/zh/tasks' },
      { text: '功能参考', link: '/zh/features' },
      { text: '配置', link: '/zh/configuration' },
      { text: '快捷键', link: '/zh/shortcuts' },
      { text: 'FAQ / 排障', link: '/zh/faq' },
    ],
  },
]

const enSidebar = [
  {
    text: 'Get Started',
    items: [
      { text: 'Docs Home', link: '/en/' },
      { text: 'Quick Start', link: '/en/quick-start' },
      { text: 'Installation', link: '/en/installation' },
      { text: 'CLI Usage', link: '/en/cli' },
    ],
  },
  {
    text: 'Guides',
    items: [
      { text: 'Interface Overview', link: '/en/interface' },
      { text: 'Common Tasks', link: '/en/tasks' },
      { text: 'Feature Reference', link: '/en/features' },
      { text: 'Configuration', link: '/en/configuration' },
      { text: 'Keyboard Shortcuts', link: '/en/shortcuts' },
      { text: 'FAQ / Troubleshooting', link: '/en/faq' },
    ],
  },
]

export default defineConfig({
  title: 'Nexus',
  description: 'Bilingual user documentation for Nexus',
  cleanUrls: true,
  lastUpdated: false,
  themeConfig: {
    search: {
      provider: 'local',
    },
    nav: [
      { text: '中文', link: '/zh/' },
      { text: 'English', link: '/en/' },
      { text: 'GitHub', link: 'https://github.com' },
    ],
    sidebar: {
      '/zh/': zhSidebar,
      '/en/': enSidebar,
    },
    outline: {
      level: [2, 3],
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com' },
    ],
  },
})
