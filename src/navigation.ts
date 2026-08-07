export const headerData = {
  links: [
    { text: 'About', href: '/#about' },
    { text: 'Research', href: '/#research' },
    { text: 'Projects', href: '/#projects' },
    { text: 'Background', href: '/#experience' },
    { text: 'Contact', href: '/#contact' },
  ],
  actions: [
    {
      text: 'CV',
      href: '/files/Chunran-Zhang-CV.pdf',
      target: '_blank',
      icon: 'tabler:file-text',
    },
  ],
};

export const footerData = {
  links: [
    {
      title: 'Explore',
      links: [
        { text: 'Research', href: '/#research' },
        { text: 'Projects', href: '/#projects' },
        { text: 'Background', href: '/#experience' },
      ],
    },
    {
      title: 'Contact',
      links: [
        { text: 'Email', href: 'mailto:chronis@my.swjtu.edu.cn' },
        { text: 'GitHub', href: 'https://github.com/ln-one' },
        { text: 'CV', href: '/files/Chunran-Zhang-CV.pdf' },
      ],
    },
  ],
  secondaryLinks: [],
  socialLinks: [
    { ariaLabel: 'Email', icon: 'tabler:mail', href: 'mailto:chronis@my.swjtu.edu.cn' },
    { ariaLabel: 'GitHub', icon: 'tabler:brand-github', href: 'https://github.com/ln-one' },
  ],
  footNote: `© ${new Date().getFullYear()} Chunran Zhang. Built with AstroWind.`,
};
