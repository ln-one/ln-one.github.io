export const headerData = {
  links: [
    { text: 'Spectra', href: '/#spectra' },
    { text: 'EAHR', href: '/#eahr' },
    { text: 'StratuMind', href: '/#stratumind' },
    { text: '经历', href: '/#background' },
    { text: '联系', href: '/#contact' },
  ],
  actions: [
    {
      text: '简历',
      href: '/files/Chunran-Zhang-CV.pdf',
      target: '_blank',
      icon: 'tabler:file-text',
    },
  ],
};

export const footerData = {
  links: [
    {
      title: '导航',
      links: [
        { text: 'Spectra', href: '/#spectra' },
        { text: 'EAHR', href: '/#eahr' },
        { text: 'StratuMind', href: '/#stratumind' },
        { text: '经历', href: '/#background' },
      ],
    },
    {
      title: '联系',
      links: [
        { text: '邮箱', href: 'mailto:chronis@my.swjtu.edu.cn' },
        { text: 'GitHub', href: 'https://github.com/ln-one' },
        { text: '简历', href: '/files/Chunran-Zhang-CV.pdf' },
      ],
    },
  ],
  secondaryLinks: [],
  socialLinks: [
    { ariaLabel: '邮箱', icon: 'tabler:mail', href: 'mailto:chronis@my.swjtu.edu.cn' },
    { ariaLabel: 'GitHub', icon: 'tabler:brand-github', href: 'https://github.com/ln-one' },
  ],
  footNote: `© ${new Date().getFullYear()} 张春冉 · 基于 AstroWind 构建`,
};
