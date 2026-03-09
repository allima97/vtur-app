import fs from 'node:fs/promises';
import path from 'node:path';

const outputDir = path.resolve('public/assets/cards/themes-master');

const themes = [
  {
    key: 'birthday-elegant',
    category: 'aniversario',
    titleColor: '#173E96',
    bodyColor: '#1D2744',
    signatureColor: '#275A69',
    titleFontFamily: 'Cormorant Garamond, Georgia, serif',
    bodyFontFamily: 'Trebuchet MS, Arial, sans-serif',
    palette: { base: '#F7FBFD', warm: '#E9F6EF', cool: '#DBEAFF', accent: '#4BB981', accent2: '#6EA9FF', outline: '#A8D4E6' },
    motifs: ['bunting', 'plane', 'balloons', 'suitcase', 'sparkles'],
  },
  {
    key: 'womens-day-soft',
    category: 'comemorativa',
    titleColor: '#B63D67',
    bodyColor: '#7B2A44',
    signatureColor: '#7A3555',
    titleFontFamily: 'Brush Script MT, Segoe Script, cursive',
    bodyFontFamily: 'Trebuchet MS, Arial, sans-serif',
    palette: { base: '#FFF7F8', warm: '#FFE7ED', cool: '#FFF0F3', accent: '#F48AA9', accent2: '#D96886', outline: '#F0C7D3' },
    motifs: ['flowers', 'hearts', 'bucket', 'sparkles'],
  },
  {
    key: 'mothers-day-floral',
    category: 'comemorativa',
    titleColor: '#B05569',
    bodyColor: '#7B3650',
    signatureColor: '#7A3552',
    titleFontFamily: 'Brush Script MT, Segoe Script, cursive',
    bodyFontFamily: 'Trebuchet MS, Arial, sans-serif',
    palette: { base: '#FFF8F9', warm: '#FFE8EE', cool: '#FFF2F5', accent: '#F39AB0', accent2: '#E57F9A', outline: '#F1CED8' },
    motifs: ['flowers', 'hearts', 'frame', 'sparkles'],
  },
  {
    key: 'christmas-gold',
    category: 'sazonal',
    titleColor: '#B12B2B',
    bodyColor: '#21472E',
    signatureColor: '#305233',
    titleFontFamily: 'Cormorant Garamond, Georgia, serif',
    bodyFontFamily: 'Trebuchet MS, Arial, sans-serif',
    palette: { base: '#F8FBFA', warm: '#ECF7EF', cool: '#EAF5FF', accent: '#E6B84E', accent2: '#4DBA7B', outline: '#CDE0D5' },
    motifs: ['tree', 'snowflakes', 'star', 'sparkles'],
  },
  {
    key: 'new-year-celebration',
    category: 'sazonal',
    titleColor: '#2440A1',
    bodyColor: '#28324A',
    signatureColor: '#394B61',
    titleFontFamily: 'Brush Script MT, Segoe Script, cursive',
    bodyFontFamily: 'Trebuchet MS, Arial, sans-serif',
    palette: { base: '#FFFDF7', warm: '#FFF3CC', cool: '#FFF9E7', accent: '#F0C24D', accent2: '#4E9ED3', outline: '#F2E3AA' },
    motifs: ['fireworks', 'sparkles', 'confetti'],
  },
  {
    key: 'easter-pastel',
    category: 'sazonal',
    titleColor: '#1A6C58',
    bodyColor: '#37514A',
    signatureColor: '#305A4F',
    titleFontFamily: 'Brush Script MT, Segoe Script, cursive',
    bodyFontFamily: 'Trebuchet MS, Arial, sans-serif',
    palette: { base: '#FBFCF8', warm: '#EEF7E7', cool: '#F8F3DD', accent: '#9BD089', accent2: '#F2C085', outline: '#D8E7C7' },
    motifs: ['eggs', 'bunny', 'leaves', 'sparkles'],
  },
  {
    key: 'fathers-day-classic',
    category: 'comemorativa',
    titleColor: '#163F96',
    bodyColor: '#253861',
    signatureColor: '#38507B',
    titleFontFamily: 'Brush Script MT, Segoe Script, cursive',
    bodyFontFamily: 'Trebuchet MS, Arial, sans-serif',
    palette: { base: '#F7FBFE', warm: '#EAF5FF', cool: '#DCEAFF', accent: '#5A8BEA', accent2: '#243A74', outline: '#BFD5F4' },
    motifs: ['tie', 'mustache', 'sparkles', 'arcs'],
  },
  {
    key: 'valentines-romantic',
    category: 'comemorativa',
    titleColor: '#C04A73',
    bodyColor: '#7A3250',
    signatureColor: '#8A4460',
    titleFontFamily: 'Brush Script MT, Segoe Script, cursive',
    bodyFontFamily: 'Trebuchet MS, Arial, sans-serif',
    palette: { base: '#FFF8FA', warm: '#FFE9F0', cool: '#FFF1F5', accent: '#F58FB1', accent2: '#F4A6C0', outline: '#F1CBD9' },
    motifs: ['hearts', 'flowers', 'sparkles'],
  },
  {
    key: 'client-day-premium',
    category: 'relacionamento',
    titleColor: '#21488B',
    bodyColor: '#293652',
    signatureColor: '#415575',
    titleFontFamily: 'Cormorant Garamond, Georgia, serif',
    bodyFontFamily: 'Trebuchet MS, Arial, sans-serif',
    palette: { base: '#FCFBF5', warm: '#F4EDD8', cool: '#F9F6EA', accent: '#D6B45C', accent2: '#9DB4D9', outline: '#E8DDC4' },
    motifs: ['sparkles', 'leaves', 'arcs'],
  },
  {
    key: 'vip-gold',
    category: 'fidelizacao',
    titleColor: '#8F6120',
    bodyColor: '#4F402A',
    signatureColor: '#6B5A3C',
    titleFontFamily: 'Cormorant Garamond, Georgia, serif',
    bodyFontFamily: 'Trebuchet MS, Arial, sans-serif',
    palette: { base: '#FFFDF7', warm: '#F8EFD0', cool: '#FCF6E1', accent: '#D1A441', accent2: '#F3D37C', outline: '#E8D7A8' },
    motifs: ['sparkles', 'confetti', 'arcs'],
  },
  {
    key: 'premium-elegant',
    category: 'fidelizacao',
    titleColor: '#245285',
    bodyColor: '#2B344D',
    signatureColor: '#436078',
    titleFontFamily: 'Cormorant Garamond, Georgia, serif',
    bodyFontFamily: 'Trebuchet MS, Arial, sans-serif',
    palette: { base: '#F8FBFD', warm: '#EDF6F5', cool: '#E4EFFB', accent: '#7FB7C9', accent2: '#93C8B1', outline: '#D1E4EC' },
    motifs: ['arcs', 'sparkles', 'leaves'],
  },
  {
    key: 'inactive-soft-recovery',
    category: 'reativacao',
    titleColor: '#5B6D7A',
    bodyColor: '#42505A',
    signatureColor: '#5C6C76',
    titleFontFamily: 'Cormorant Garamond, Georgia, serif',
    bodyFontFamily: 'Trebuchet MS, Arial, sans-serif',
    palette: { base: '#F8FAFB', warm: '#EEF3F5', cool: '#E8EEF1', accent: '#B1C4CF', accent2: '#D8E1E5', outline: '#D4E0E5' },
    motifs: ['arcs', 'sparkles'],
  },
  {
    key: 'welcome-clean',
    category: 'onboarding',
    titleColor: '#1C4AA0',
    bodyColor: '#283A57',
    signatureColor: '#345571',
    titleFontFamily: 'Cormorant Garamond, Georgia, serif',
    bodyFontFamily: 'Trebuchet MS, Arial, sans-serif',
    palette: { base: '#F8FBFE', warm: '#ECF6FF', cool: '#E8F1FF', accent: '#74A8E6', accent2: '#85D0B7', outline: '#C9DDF4' },
    motifs: ['plane', 'ticket', 'sparkles', 'arcs'],
  },
  {
    key: 'surprise-soft',
    category: 'relacionamento',
    titleColor: '#A5536E',
    bodyColor: '#6A4960',
    signatureColor: '#7D5A71',
    titleFontFamily: 'Cormorant Garamond, Georgia, serif',
    bodyFontFamily: 'Trebuchet MS, Arial, sans-serif',
    palette: { base: '#FBF9FD', warm: '#F4ECF7', cool: '#EEF3FB', accent: '#D6A6D3', accent2: '#A5C7F3', outline: '#DDD6EC' },
    motifs: ['sparkles', 'hearts', 'arcs'],
  },
  {
    key: 'post-trip-light',
    category: 'pos-venda',
    titleColor: '#266E69',
    bodyColor: '#2A4747',
    signatureColor: '#35615F',
    titleFontFamily: 'Cormorant Garamond, Georgia, serif',
    bodyFontFamily: 'Trebuchet MS, Arial, sans-serif',
    palette: { base: '#F7FCFB', warm: '#E7F5F2', cool: '#EFF9F8', accent: '#7EC7BB', accent2: '#A7E2D4', outline: '#CBE8E2' },
    motifs: ['ticket', 'sparkles', 'leaves'],
  },
  {
    key: 'travel-return-soft',
    category: 'pos-venda',
    titleColor: '#2D6985',
    bodyColor: '#314455',
    signatureColor: '#436173',
    titleFontFamily: 'Cormorant Garamond, Georgia, serif',
    bodyFontFamily: 'Trebuchet MS, Arial, sans-serif',
    palette: { base: '#F7FBFC', warm: '#EAF3F5', cool: '#EBF2FB', accent: '#8EB7C8', accent2: '#86C7C1', outline: '#D4E3EA' },
    motifs: ['plane', 'sparkles', 'arcs'],
  },
  {
    key: 'pre-embark-clean',
    category: 'jornada',
    titleColor: '#194C92',
    bodyColor: '#263A56',
    signatureColor: '#35506E',
    titleFontFamily: 'Cormorant Garamond, Georgia, serif',
    bodyFontFamily: 'Trebuchet MS, Arial, sans-serif',
    palette: { base: '#F8FBFE', warm: '#EAF4FF', cool: '#EFF7FF', accent: '#77A8E6', accent2: '#8DC7EE', outline: '#D2E3F7' },
    motifs: ['plane', 'ticket', 'sparkles'],
  },
  {
    key: 'countdown-travel',
    category: 'jornada',
    titleColor: '#256B8E',
    bodyColor: '#2E445A',
    signatureColor: '#3F6079',
    titleFontFamily: 'Cormorant Garamond, Georgia, serif',
    bodyFontFamily: 'Trebuchet MS, Arial, sans-serif',
    palette: { base: '#F8FBFD', warm: '#EAF5F8', cool: '#E5F0FB', accent: '#85BBDD', accent2: '#7ED4BF', outline: '#D1E5EE' },
    motifs: ['plane', 'sparkles', 'arcs', 'map-pin'],
  },
  {
    key: 'anniversary-purchase',
    category: 'relacionamento',
    titleColor: '#184994',
    bodyColor: '#283B57',
    signatureColor: '#36526F',
    titleFontFamily: 'Cormorant Garamond, Georgia, serif',
    bodyFontFamily: 'Trebuchet MS, Arial, sans-serif',
    palette: { base: '#F7FBFD', warm: '#ECF7F0', cool: '#E6EEFB', accent: '#78C19B', accent2: '#7FAEE7', outline: '#D0E4E9' },
    motifs: ['balloons', 'ticket', 'sparkles'],
  },
  {
    key: 'anniversary-trip',
    category: 'pos-venda',
    titleColor: '#235D8A',
    bodyColor: '#2C4057',
    signatureColor: '#3E6277',
    titleFontFamily: 'Cormorant Garamond, Georgia, serif',
    bodyFontFamily: 'Trebuchet MS, Arial, sans-serif',
    palette: { base: '#F7FBFC', warm: '#E8F5F2', cool: '#E7F0FA', accent: '#78C7BD', accent2: '#8DB2E8', outline: '#D1E5E7' },
    motifs: ['plane', 'ticket', 'sparkles'],
  },
  {
    key: 'travel-opportunity',
    category: 'oportunidade',
    titleColor: '#14528D',
    bodyColor: '#293A55',
    signatureColor: '#3C5771',
    titleFontFamily: 'Cormorant Garamond, Georgia, serif',
    bodyFontFamily: 'Trebuchet MS, Arial, sans-serif',
    palette: { base: '#F8FBFD', warm: '#EBF7F3', cool: '#E7F1FF', accent: '#79C9B3', accent2: '#79A9EA', outline: '#D0E3ED' },
    motifs: ['plane', 'suitcase', 'map-pin', 'sparkles'],
  },
  {
    key: 'exclusive-offer',
    category: 'campanha',
    titleColor: '#8E5B1A',
    bodyColor: '#4E4230',
    signatureColor: '#655842',
    titleFontFamily: 'Cormorant Garamond, Georgia, serif',
    bodyFontFamily: 'Trebuchet MS, Arial, sans-serif',
    palette: { base: '#FFFDF7', warm: '#F8EFD6', cool: '#FBF5E7', accent: '#E0B95B', accent2: '#F0D27A', outline: '#E8DAB3' },
    motifs: ['confetti', 'sparkles', 'ticket'],
  },
  {
    key: 'vip-upgrade',
    category: 'fidelizacao',
    titleColor: '#7D5416',
    bodyColor: '#4B3D2A',
    signatureColor: '#63513C',
    titleFontFamily: 'Cormorant Garamond, Georgia, serif',
    bodyFontFamily: 'Trebuchet MS, Arial, sans-serif',
    palette: { base: '#FFFDF8', warm: '#F8EFD4', cool: '#FBF7E8', accent: '#D4AE4F', accent2: '#EACB73', outline: '#E7D7A7' },
    motifs: ['sparkles', 'leaves', 'confetti'],
  },
  {
    key: 'referral-soft',
    category: 'relacionamento',
    titleColor: '#4A6C8A',
    bodyColor: '#445264',
    signatureColor: '#5A6A7C',
    titleFontFamily: 'Cormorant Garamond, Georgia, serif',
    bodyFontFamily: 'Trebuchet MS, Arial, sans-serif',
    palette: { base: '#F9FBFC', warm: '#EEF4F6', cool: '#EFF4FA', accent: '#B3C8D8', accent2: '#D8E5EE', outline: '#DCE6EC' },
    motifs: ['hearts', 'sparkles', 'arcs'],
  },
  {
    key: 'document-reminder-clean',
    category: 'utilidade',
    titleColor: '#225B89',
    bodyColor: '#324256',
    signatureColor: '#466175',
    titleFontFamily: 'Cormorant Garamond, Georgia, serif',
    bodyFontFamily: 'Trebuchet MS, Arial, sans-serif',
    palette: { base: '#F8FBFC', warm: '#EEF5F7', cool: '#EAF1F8', accent: '#9FBFD0', accent2: '#A9D2C9', outline: '#D7E5EA' },
    motifs: ['passport', 'ticket', 'sparkles'],
  },
  {
    key: 'seasonal-campaign',
    category: 'campanha',
    titleColor: '#25628A',
    bodyColor: '#31475A',
    signatureColor: '#446376',
    titleFontFamily: 'Cormorant Garamond, Georgia, serif',
    bodyFontFamily: 'Trebuchet MS, Arial, sans-serif',
    palette: { base: '#F8FBFC', warm: '#EAF6F1', cool: '#EBF2FB', accent: '#7FC3A7', accent2: '#90B5E8', outline: '#D3E6E0' },
    motifs: ['plane', 'sparkles', 'confetti'],
  },
  {
    key: 'long-holiday',
    category: 'oportunidade',
    titleColor: '#1C6590',
    bodyColor: '#2D455A',
    signatureColor: '#416174',
    titleFontFamily: 'Cormorant Garamond, Georgia, serif',
    bodyFontFamily: 'Trebuchet MS, Arial, sans-serif',
    palette: { base: '#F8FBFD', warm: '#EAF6F5', cool: '#E8F0FA', accent: '#7FC9C4', accent2: '#8FB5E9', outline: '#D2E5EA' },
    motifs: ['sun', 'plane', 'sparkles', 'suitcase'],
  },
  {
    key: 'repurchase-soft',
    category: 'recompra',
    titleColor: '#5B6A7B',
    bodyColor: '#46515E',
    signatureColor: '#5D6976',
    titleFontFamily: 'Cormorant Garamond, Georgia, serif',
    bodyFontFamily: 'Trebuchet MS, Arial, sans-serif',
    palette: { base: '#F8FAFB', warm: '#EDF2F4', cool: '#EAF0F2', accent: '#C1D0D7', accent2: '#DFE7EA', outline: '#D9E2E5' },
    motifs: ['ticket', 'arcs', 'sparkles'],
  },
  {
    key: 'special-date-soft',
    category: 'relacionamento',
    titleColor: '#A3526B',
    bodyColor: '#634A5D',
    signatureColor: '#7C6073',
    titleFontFamily: 'Cormorant Garamond, Georgia, serif',
    bodyFontFamily: 'Trebuchet MS, Arial, sans-serif',
    palette: { base: '#FBF9FC', warm: '#F5EDF6', cool: '#EEF2FA', accent: '#D3A5CE', accent2: '#B1C5F1', outline: '#DED8E9' },
    motifs: ['sparkles', 'hearts', 'flowers'],
  },
];

function circle(cx, cy, r, fill, opacity = 1) {
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" opacity="${opacity}" />`;
}

function ellipse(cx, cy, rx, ry, fill, opacity = 1, rotate = 0) {
  const transform = rotate ? ` transform="rotate(${rotate} ${cx} ${cy})"` : '';
  return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}" opacity="${opacity}"${transform} />`;
}

function rect(x, y, w, h, fill, opacity = 1, rx = 0, extra = '') {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" opacity="${opacity}" ${extra}/>`;
}

function pathSvg(d, fill, opacity = 1, extra = '') {
  return `<path d="${d}" fill="${fill}" opacity="${opacity}" ${extra}/>`;
}

function line(x1, y1, x2, y2, stroke, width = 4, opacity = 1) {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" opacity="${opacity}" />`;
}

function sparkle(x, y, color, scale = 1, opacity = 0.85) {
  const s = 10 * scale;
  return [
    pathSvg(`M ${x} ${y - s * 2.2} L ${x + s * 0.45} ${y - s * 0.45} L ${x + s * 2.2} ${y} L ${x + s * 0.45} ${y + s * 0.45} L ${x} ${y + s * 2.2} L ${x - s * 0.45} ${y + s * 0.45} L ${x - s * 2.2} ${y} L ${x - s * 0.45} ${y - s * 0.45} Z`, color, opacity),
    circle(x - s * 2.8, y + s * 2.4, s * 0.35, color, opacity * 0.7),
    circle(x + s * 2.6, y - s * 2.6, s * 0.28, color, opacity * 0.7),
  ].join('');
}

function bunting(x, y, colorA, colorB) {
  const points = [
    `${x},${y} ${x + 18},${y + 60} ${x + 36},${y}`,
    `${x + 52},${y} ${x + 70},${y + 56} ${x + 88},${y}`,
    `${x + 104},${y} ${x + 122},${y + 62} ${x + 140},${y}`,
    `${x + 156},${y} ${x + 174},${y + 58} ${x + 192},${y}`,
  ];
  const colors = [colorA, colorB, colorA, colorB];
  return [
    `<path d="M ${x - 12} ${y - 6} Q ${x + 96} ${y + 38} ${x + 212} ${y - 4}" fill="none" stroke="#B9D4DC" stroke-width="4" opacity="0.9"/>`,
    ...points.map((pts, index) => `<polygon points="${pts}" fill="${colors[index]}" opacity="0.85" />`),
  ].join('');
}

function balloons(x, y, colorA, colorB, colorC) {
  return [
    ellipse(x, y, 42, 54, colorA, 0.88, -8),
    ellipse(x + 72, y - 20, 38, 48, colorB, 0.82, 6),
    ellipse(x + 148, y + 12, 46, 58, colorC, 0.82, -4),
    line(x, y + 50, x - 14, y + 150, '#AAC8D1', 3, 0.8),
    line(x + 72, y + 28, x + 88, y + 150, '#AAC8D1', 3, 0.8),
    line(x + 148, y + 64, x + 122, y + 165, '#AAC8D1', 3, 0.8),
  ].join('');
}

function plane(x, y, stroke) {
  return `<g opacity="0.82" transform="translate(${x} ${y}) rotate(-16)">
    <path d="M0 22 L92 0 L104 9 L74 26 L104 36 L96 45 L58 36 L44 54 L34 51 L42 33 L10 29 Z" fill="none" stroke="${stroke}" stroke-width="4" stroke-linejoin="round"/>
    <path d="M-52 58 C-8 28 22 24 58 34" fill="none" stroke="${stroke}" stroke-width="3" stroke-linecap="round" opacity="0.65"/>
  </g>`;
}

function suitcase(x, y, stroke) {
  return `<g opacity="0.82" transform="translate(${x} ${y})">
    <rect x="0" y="18" width="94" height="108" rx="10" fill="none" stroke="${stroke}" stroke-width="4"/>
    <rect x="14" y="0" width="34" height="24" rx="8" fill="none" stroke="${stroke}" stroke-width="4"/>
    <line x1="26" y1="20" x2="26" y2="122" stroke="${stroke}" stroke-width="4" opacity="0.85"/>
    <line x1="68" y1="20" x2="68" y2="122" stroke="${stroke}" stroke-width="4" opacity="0.85"/>
    <line x1="10" y1="58" x2="84" y2="58" stroke="${stroke}" stroke-width="4" opacity="0.7"/>
  </g>`;
}

function flowerCluster(x, y, petal, center, leaf) {
  return `<g opacity="0.95" transform="translate(${x} ${y})">
    <g transform="translate(0 0)">
      ${ellipse(0, -24, 20, 34, petal, 0.9)}
      ${ellipse(24, -2, 20, 34, petal, 0.9, 65)}
      ${ellipse(14, 30, 20, 34, petal, 0.9, 140)}
      ${ellipse(-16, 28, 20, 34, petal, 0.9, -140)}
      ${ellipse(-28, -2, 20, 34, petal, 0.9, -65)}
      ${circle(0, 2, 16, center, 0.95)}
    </g>
    <g transform="translate(88 62) scale(0.85)">
      ${ellipse(0, -24, 20, 34, petal, 0.9)}
      ${ellipse(24, -2, 20, 34, petal, 0.9, 65)}
      ${ellipse(14, 30, 20, 34, petal, 0.9, 140)}
      ${ellipse(-16, 28, 20, 34, petal, 0.9, -140)}
      ${ellipse(-28, -2, 20, 34, petal, 0.9, -65)}
      ${circle(0, 2, 16, center, 0.95)}
    </g>
    <path d="M-18 42 C-16 86 10 122 34 152" fill="none" stroke="${leaf}" stroke-width="5" stroke-linecap="round"/>
    <path d="M82 92 C88 118 84 138 70 160" fill="none" stroke="${leaf}" stroke-width="5" stroke-linecap="round"/>
    ${ellipse(26, 110, 16, 32, leaf, 0.9, -38)}
    ${ellipse(56, 128, 16, 30, leaf, 0.9, 42)}
    ${ellipse(66, 164, 16, 30, leaf, 0.85, -26)}
  </g>`;
}

function heart(x, y, color, scale = 1, opacity = 0.9) {
  const s = 18 * scale;
  return `<path d="M ${x} ${y + s} C ${x - s * 1.2} ${y - s * 0.2}, ${x - s * 1.6} ${y - s * 1.2}, ${x - s * 0.7} ${y - s * 1.6} C ${x - s * 0.1} ${y - s * 1.9}, ${x + s * 0.1} ${y - s * 1.2}, ${x} ${y - s * 0.6} C ${x + s * 0.1} ${y - s * 1.2}, ${x + s * 0.9} ${y - s * 1.9}, ${x + s * 1.3} ${y - s * 1.1} C ${x + s * 1.9} ${y - s * 0.2}, ${x + s * 1.1} ${y + s * 0.6}, ${x} ${y + s} Z" fill="${color}" opacity="${opacity}" />`;
}

function hearts(x, y, colorA, colorB) {
  return [
    heart(x, y, colorA, 1.1, 0.82),
    heart(x + 72, y - 52, colorB, 0.72, 0.8),
    heart(x + 128, y + 18, colorA, 0.62, 0.76),
    heart(x + 196, y - 36, colorB, 0.46, 0.74),
  ].join('');
}

function bucket(x, y, main, accent) {
  return `<g opacity="0.9" transform="translate(${x} ${y})">
    <ellipse cx="86" cy="110" rx="86" ry="26" fill="#F7D8E2" opacity="0.55"/>
    <path d="M24 10 L102 10 L128 106 C132 126 118 144 96 148 L40 148 C18 144 4 126 8 106 Z" fill="${main}" opacity="0.75"/>
    <path d="M16 24 C18 6 34 -8 54 -8 L72 -8 C92 -8 108 6 110 24" fill="none" stroke="${accent}" stroke-width="6" stroke-linecap="round"/>
    <rect x="76" y="-68" width="24" height="84" rx="8" fill="#C58B58" opacity="0.9" transform="rotate(18 88 -26)"/>
    <rect x="78" y="-64" width="20" height="78" rx="7" fill="#F3E5A6" opacity="0.65" transform="rotate(18 88 -26)"/>
    <path d="M88 -70 C112 -92 148 -80 160 -42 C166 -20 160 4 144 20" fill="none" stroke="#F2C7D6" stroke-width="8" opacity="0.6"/>
    ${sparkle(140, -16, '#F5C56B', 1.2, 0.8)}
  </g>`;
}

function frame(x, y) {
  return `<g opacity="0.85" transform="translate(${x} ${y}) rotate(-4)">
    <rect x="0" y="0" width="300" height="228" rx="12" fill="#FFFFFF" opacity="0.92"/>
    <rect x="16" y="16" width="268" height="196" rx="8" fill="#F7D8E1" opacity="0.46"/>
    <path d="M30 182 C96 104 130 136 164 116 C196 98 222 130 270 78" fill="none" stroke="#EAB0BE" stroke-width="8" opacity="0.38"/>
  </g>`;
}

function fireworks(x, y, colorA, colorB) {
  const rays = [];
  for (let i = 0; i < 12; i += 1) {
    const angle = (Math.PI * 2 * i) / 12;
    const x2 = x + Math.cos(angle) * 54;
    const y2 = y + Math.sin(angle) * 54;
    const x1 = x + Math.cos(angle) * 18;
    const y1 = y + Math.sin(angle) * 18;
    rays.push(line(x1, y1, x2, y2, i % 2 === 0 ? colorA : colorB, 5, 0.8));
  }
  return `${rays.join('')}${circle(x, y, 10, colorA, 0.85)}`;
}

function snowflake(x, y, color, scale = 1) {
  const s = 22 * scale;
  return `<g opacity="0.82">
    ${line(x - s, y, x + s, y, color, 4)}
    ${line(x, y - s, x, y + s, color, 4)}
    ${line(x - s * 0.74, y - s * 0.74, x + s * 0.74, y + s * 0.74, color, 4)}
    ${line(x + s * 0.74, y - s * 0.74, x - s * 0.74, y + s * 0.74, color, 4)}
    ${circle(x, y, 4, color, 0.9)}
  </g>`;
}

function tree(x, y) {
  return `<g opacity="0.96" transform="translate(${x} ${y})">
    <polygon points="68,0 132,74 102,72 162,138 124,136 196,220 -4,220 68,136 30,138 92,72 62,74" fill="#58B86F"/>
    <rect x="80" y="220" width="30" height="48" rx="6" fill="#8B623E"/>
    ${circle(58, 90, 10, '#F24E65', 0.95)}
    ${circle(112, 110, 10, '#F2C94C', 0.95)}
    ${circle(88, 150, 10, '#F24E65', 0.95)}
    ${circle(132, 166, 10, '#7ED4FF', 0.95)}
    ${pathSvg('M 94 -8 L 105 14 L 130 18 L 112 34 L 116 58 L 94 46 L 72 58 L 76 34 L 58 18 L 83 14 Z', '#F0C14B', 0.96)}
  </g>`;
}

function star(x, y, color) {
  return pathSvg(`M ${x} ${y - 52} L ${x + 18} ${y - 14} L ${x + 58} ${y - 8} L ${x + 28} ${y + 20} L ${x + 36} ${y + 62} L ${x} ${y + 40} L ${x - 36} ${y + 62} L ${x - 28} ${y + 20} L ${x - 58} ${y - 8} L ${x - 18} ${y - 14} Z`, color, 0.94, '');
}

function eggs(x, y) {
  return `<g opacity="0.95" transform="translate(${x} ${y})">
    ${ellipse(32, 68, 32, 46, '#F2C694', 0.95)}
    ${ellipse(92, 42, 34, 48, '#83D0C4', 0.95)}
    ${line(8, 52, 56, 52, '#FFFFFF', 5, 0.8)}
    ${line(66, 24, 116, 24, '#FFE7C8', 5, 0.7)}
    ${line(72, 56, 118, 56, '#F7E36E', 5, 0.7)}
    ${line(16, 86, 50, 86, '#FFFFFF', 5, 0.8)}
  </g>`;
}

function bunny(x, y) {
  return `<g opacity="0.97" transform="translate(${x} ${y})">
    ${ellipse(46, 30, 16, 44, '#FFF2F6', 0.95, -10)}
    ${ellipse(86, 30, 16, 44, '#FFF2F6', 0.95, 10)}
    ${ellipse(46, 36, 7, 30, '#F4B5C8', 0.85, -10)}
    ${ellipse(86, 36, 7, 30, '#F4B5C8', 0.85, 10)}
    ${circle(66, 86, 48, '#FFF7F8', 0.98)}
    ${circle(48, 78, 6, '#2C2C2C', 0.9)}
    ${circle(84, 78, 6, '#2C2C2C', 0.9)}
    ${circle(66, 96, 6, '#E08EA4', 0.92)}
    <path d="M54 114 C60 124 72 124 78 114" fill="none" stroke="#A66A74" stroke-width="4" stroke-linecap="round"/>
    ${ellipse(24, 152, 20, 30, '#8BC57F', 0.92, -26)}
    ${ellipse(108, 150, 20, 30, '#8BC57F', 0.92, 24)}
  </g>`;
}

function tie(x, y) {
  return `<g opacity="0.92" transform="translate(${x} ${y})">
    <path d="M42 0 L96 0 L84 40 L54 40 Z" fill="#4F77D3"/>
    <path d="M52 40 L84 40 L110 168 L68 214 L26 168 Z" fill="#2F5AB7"/>
    <path d="M52 54 L84 54 L78 82 L58 82 Z" fill="#7DA2F0"/>
    <path d="M58 86 L78 86 L72 116 L62 116 Z" fill="#7DA2F0"/>
  </g>`;
}

function mustache(x, y, color) {
  return `<path d="M ${x} ${y} C ${x - 32} ${y - 24}, ${x - 78} ${y - 18}, ${x - 98} ${y + 10} C ${x - 70} ${y + 16}, ${x - 46} ${y + 14}, ${x - 16} ${y - 2} C ${x - 8} ${y + 12}, ${x + 8} ${y + 12}, ${x + 16} ${y - 2} C ${x + 46} ${y + 14}, ${x + 70} ${y + 16}, ${x + 98} ${y + 10} C ${x + 78} ${y - 18}, ${x + 32} ${y - 24}, ${x} ${y} Z" fill="${color}" opacity="0.88" />`;
}

function leaves(x, y, color) {
  return `<g opacity="0.9" transform="translate(${x} ${y})">
    ${ellipse(0, 40, 18, 42, color, 0.9, -26)}
    ${ellipse(36, 0, 18, 42, color, 0.9, 18)}
    ${ellipse(78, 46, 18, 42, color, 0.9, 34)}
    ${line(4, 82, 76, -4, color, 5, 0.8)}
  </g>`;
}

function ticket(x, y, color) {
  return `<g opacity="0.88" transform="translate(${x} ${y}) rotate(-10)">
    <path d="M0 20 C0 8 8 0 20 0 H138 C150 0 158 8 158 20 V34 C146 38 146 58 158 62 V92 C158 104 150 112 138 112 H20 C8 112 0 104 0 92 V62 C12 58 12 38 0 34 Z" fill="none" stroke="${color}" stroke-width="5"/>
    ${line(48, 18, 48, 94, color, 4, 0.7)}
    ${line(68, 26, 128, 26, color, 4, 0.55)}
    ${line(68, 48, 118, 48, color, 4, 0.55)}
    ${line(68, 70, 104, 70, color, 4, 0.55)}
  </g>`;
}

function mapPin(x, y, color) {
  return `<g opacity="0.86" transform="translate(${x} ${y})">
    <path d="M42 0 C18 0 0 18 0 42 C0 78 42 118 42 118 C42 118 84 78 84 42 C84 18 66 0 42 0 Z" fill="${color}" opacity="0.24"/>
    <circle cx="42" cy="42" r="18" fill="none" stroke="${color}" stroke-width="6"/>
  </g>`;
}

function passport(x, y, color) {
  return `<g opacity="0.88" transform="translate(${x} ${y}) rotate(-8)">
    <rect x="0" y="0" width="116" height="150" rx="12" fill="none" stroke="${color}" stroke-width="5"/>
    <circle cx="58" cy="66" r="22" fill="none" stroke="${color}" stroke-width="5" opacity="0.85"/>
    ${line(58, 44, 58, 88, color, 4, 0.7)}
    ${line(36, 66, 80, 66, color, 4, 0.7)}
    ${line(18, 112, 98, 112, color, 4, 0.55)}
  </g>`;
}

function sun(x, y, color) {
  const rays = [];
  for (let i = 0; i < 10; i += 1) {
    const angle = (Math.PI * 2 * i) / 10;
    const x1 = x + Math.cos(angle) * 46;
    const y1 = y + Math.sin(angle) * 46;
    const x2 = x + Math.cos(angle) * 76;
    const y2 = y + Math.sin(angle) * 76;
    rays.push(line(x1, y1, x2, y2, color, 5, 0.78));
  }
  return `${circle(x, y, 34, color, 0.22)}${rays.join('')}`;
}

function confetti(x, y, colorA, colorB) {
  return `<g opacity="0.8" transform="translate(${x} ${y})">
    ${rect(0, 0, 20, 8, colorA, 0.9, 2, 'transform="rotate(22 10 4)"')}
    ${rect(44, 22, 24, 8, colorB, 0.88, 2, 'transform="rotate(-18 56 26)"')}
    ${rect(90, -4, 22, 8, colorA, 0.88, 2, 'transform="rotate(40 101 0)"')}
    ${rect(134, 24, 18, 8, colorB, 0.85, 2, 'transform="rotate(18 143 28)"')}
    ${circle(62, 70, 8, colorA, 0.78)}
    ${circle(122, 78, 6, colorB, 0.78)}
  </g>`;
}

function arcs(color) {
  return `<g fill="none" stroke="${color}" stroke-width="3" opacity="0.45">
    <circle cx="910" cy="118" r="138"/>
    <circle cx="910" cy="118" r="176"/>
    <circle cx="128" cy="958" r="164"/>
    <circle cx="128" cy="958" r="210"/>
  </g>`;
}

function renderMotifs(theme) {
  const { palette } = theme;
  const parts = [];
  if (theme.motifs.includes('arcs')) parts.push(arcs(palette.outline));
  if (theme.motifs.includes('bunting')) parts.push(bunting(46, 92, palette.accent, palette.accent2));
  if (theme.motifs.includes('plane')) parts.push(plane(760, 54, palette.accent2));
  if (theme.motifs.includes('balloons')) parts.push(balloons(88, 702, palette.accent2, palette.accent, '#B2D06E'));
  if (theme.motifs.includes('suitcase')) parts.push(suitcase(120, 798, palette.accent));
  if (theme.motifs.includes('flowers')) {
    parts.push(flowerCluster(34, 710, palette.accent, '#FBD46D', '#82BF72'));
    parts.push(flowerCluster(878, 62, palette.accent2, '#FBD46D', '#85B772'));
  }
  if (theme.motifs.includes('hearts')) {
    parts.push(hearts(56, 232, palette.accent, palette.accent2));
    parts.push(hearts(858, 162, palette.accent2, palette.accent));
  }
  if (theme.motifs.includes('bucket')) parts.push(bucket(742, 640, '#F6B3C5', '#D9879E'));
  if (theme.motifs.includes('frame')) parts.push(frame(664, 342));
  if (theme.motifs.includes('fireworks')) {
    parts.push(fireworks(168, 138, palette.accent2, palette.accent));
    parts.push(fireworks(920, 122, '#F4C95D', palette.accent2));
  }
  if (theme.motifs.includes('snowflakes')) {
    parts.push(snowflake(834, 152, '#B8D8FF', 1.05));
    parts.push(snowflake(930, 238, '#B8D8FF', 0.82));
    parts.push(snowflake(920, 820, '#FFFFFF', 1.2));
  }
  if (theme.motifs.includes('tree')) parts.push(tree(68, 248));
  if (theme.motifs.includes('star')) parts.push(star(918, 790, '#F2BF4D'));
  if (theme.motifs.includes('eggs')) parts.push(eggs(76, 804));
  if (theme.motifs.includes('bunny')) parts.push(bunny(834, 744));
  if (theme.motifs.includes('tie')) parts.push(tie(98, 106));
  if (theme.motifs.includes('mustache')) parts.push(mustache(892, 172, '#2D3558'));
  if (theme.motifs.includes('leaves')) {
    parts.push(leaves(72, 822, '#89BE7B'));
    parts.push(leaves(870, 824, '#89BE7B'));
  }
  if (theme.motifs.includes('ticket')) parts.push(ticket(54, 246, palette.accent2));
  if (theme.motifs.includes('map-pin')) parts.push(mapPin(880, 740, palette.accent));
  if (theme.motifs.includes('passport')) parts.push(passport(108, 794, palette.accent2));
  if (theme.motifs.includes('sun')) parts.push(sun(910, 164, '#F2C75C'));
  if (theme.motifs.includes('confetti')) {
    parts.push(confetti(84, 162, palette.accent, palette.accent2));
    parts.push(confetti(830, 812, palette.accent2, palette.accent));
  }
  if (theme.motifs.includes('sparkles')) {
    parts.push(sparkle(176, 192, '#FFFFFF', 1.2, 0.9));
    parts.push(sparkle(862, 228, '#FFFFFF', 0.9, 0.88));
    parts.push(sparkle(178, 914, '#FFFFFF', 1.1, 0.88));
    parts.push(sparkle(902, 906, '#FFFFFF', 1.1, 0.88));
    parts.push(sparkle(760, 806, palette.accent, 0.8, 0.58));
  }
  return parts.join('\n');
}

function renderThemeSvg(theme) {
  const { palette } = theme;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080">
  <defs>
    <radialGradient id="washA" cx="16%" cy="86%" r="42%">
      <stop offset="0" stop-color="${palette.cool}" stop-opacity="0.95"/>
      <stop offset="1" stop-color="${palette.cool}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="washB" cx="92%" cy="8%" r="36%">
      <stop offset="0" stop-color="${palette.warm}" stop-opacity="0.95"/>
      <stop offset="1" stop-color="${palette.warm}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="washC" cx="68%" cy="62%" r="48%">
      <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.62"/>
      <stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>
    </radialGradient>
    <filter id="softBlur">
      <feGaussianBlur stdDeviation="18"/>
    </filter>
  </defs>
  <rect width="1080" height="1080" fill="${palette.base}" />
  <rect width="1080" height="1080" fill="url(#washA)" />
  <rect width="1080" height="1080" fill="url(#washB)" />
  <rect width="1080" height="1080" fill="url(#washC)" />
  <g opacity="0.18" filter="url(#softBlur)">
    ${circle(206, 886, 126, palette.accent2, 1)}
    ${circle(920, 128, 108, palette.accent, 1)}
    ${ellipse(834, 864, 164, 86, palette.warm, 0.7, -18)}
  </g>
  <g fill="none" stroke="${palette.outline}" stroke-width="3" opacity="0.56">
    <circle cx="906" cy="116" r="128"/>
    <circle cx="906" cy="116" r="168"/>
    <circle cx="116" cy="944" r="156"/>
    <circle cx="116" cy="944" r="204"/>
  </g>
  ${renderMotifs(theme)}
</svg>`;
}

await fs.mkdir(outputDir, { recursive: true });
for (const theme of themes) {
  const svg = renderThemeSvg(theme);
  await fs.writeFile(path.join(outputDir, `${theme.key}.svg`), svg, 'utf8');
}

console.log(`generated ${themes.length} official theme assets in ${outputDir}`);
