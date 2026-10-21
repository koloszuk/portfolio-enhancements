// Match verified Cargo project links, never gallery order or slot number.
// Preserve source names for easy updates. Preload order is explicit below.
export const projects = [
  {
    pageId: 'L0516127503',
    href: '#nothing-―-playgrounds',
    animation: 'hover/Nothing_ThumbHover_v02.gif',
  },
  {
    pageId: 'I3145015899',
    href: '#what-is-github',
    animation: 'hover/WhatIsGithub_ThumbHover_v01.gif',
  },
  {
    pageId: 'X2017454871',
    href: '#mcnificents',
    animation: 'hover/McNificents_ThumbHover_v01.gif',
  },
  {
    pageId: 'Q2622835587',
    href: '#riot-―-msi',
    animation: 'hover/MSI_ThumbHover_v01.gif',
  },
  {
    pageId: 'J1241925927',
    href: '#netflix-―-we-the-people',
    animation: 'hover/WeThePeople_ThumbHover_v01.gif',
  },
  {
    pageId: 'K3075759110',
    href: '#hello-amsterdam',
    animation: 'hover/HelloAmsterdam_ThumbHover_v01.gif',
  },
  {
    pageId: 'I1472632429',
    href: '#keti-koti',
    animation: 'hover/KetiKoti_ThumbHover_v01.gif',
  },
  {
    pageId: 'X2637089677',
    href: '#logitech-―-g309',
    animation: 'hover/Logitech_ThumbHover_v01.gif',
  },
  {
    pageId: 'J0533318333',
    href: '#dropfake-―-smashhq',
    animation: 'hover/Dropfake_ThumbHover_v01.gif',
  },
  {
    pageId: 'T3330709296',
    href: "#github-universe-24'",
    animation: 'hover/GithubUniverse_ThumbHover_v01.gif',
  },
  {
    pageId: 'R0690090438',
    href: '#google-pixel-3',
    animation: 'hover/GooglePixel_ThumbHover_v01.gif',
  },
  {
    pageId: 'Z1899253112',
    href: '#the-art-department',
    animation: 'hover/TheArtDepartment_ThumbHover_v01.gif',
  },
];

// Last verified desktop gallery order (2026-10-21), independent of project
// numbering and mapping-array order. Refresh this list after Cargo rearrangements.
export const hoverPreloadOrder = [
  'L0516127503', // Nothing
  'I3145015899', // What is Github
  'X2017454871', // McNificents
  'Q2622835587', // MSI
  'J1241925927', // We The People
  'K3075759110', // Hello Amsterdam
  'I1472632429', // Keti Koti
  'X2637089677', // Logitech
  'J0533318333', // Dropfake
  'T3330709296', // Github Universe
  'Z1899253112', // The Art Department
  'R0690090438', // Google Pixel 3
];
