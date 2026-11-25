// Line icons for the navigation and cards. Drawn for this platform;
// 24 × 24 grid, stroke follows currentColor.
const svg = (body, extra = '', cls = 'ico') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${body}</svg>`;

export const icons = {
  learn: svg('<path d="M4 19.5c2-1.6 4.2-2.4 6.5-2.4M4 4.5v15M4 4.5C6 3 8.2 2.3 10.5 2.3c2.3 0 3.8.7 5 1.7"/><circle cx="17" cy="15" r="4.5"/><path d="m15.4 15 1.1 1.1 2.1-2.2"/>'),
  vocab: svg('<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"/><path d="M9 8h6M9 11.5h4"/>'),
  listen: svg('<path d="M3 14v-2a9 9 0 0 1 18 0v2"/><rect x="3" y="12" width="5" height="8" rx="2"/><rect x="16" y="12" width="5" height="8" rx="2"/>'),
  writing: svg('<path d="M4 20h4L19.5 8.5a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/><path d="M14 20h6"/>'),
  practice: svg('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/>'),
  exam: svg('<rect x="5" y="3.5" width="14" height="18" rx="2.5"/><path d="M9 3.5V2.8h6v.7"/><path d="m9 12 2 2 4-4.5M9 17.5h6"/>'),
  profile: svg('<circle cx="12" cy="8" r="4"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/>'),
  settings: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  search: svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
  close: svg('<path d="m6 6 12 12M18 6 6 18"/>'),
  check: svg('<path d="m5 12.5 4.5 4.5L19 7.5"/>', 'stroke-width="3"'),
  lock: svg('<rect x="5" y="11" width="14" height="10" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
  trophy: svg('<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 21h7M10 17h4v4h-4z"/>'),
  cards: svg('<rect x="3" y="6" width="13" height="15" rx="2.5"/><path d="M8 3h10.5A2.5 2.5 0 0 1 21 5.5V17"/>'),
  read: svg('<path d="M3 5h6a3 3 0 0 1 3 3v12a2.5 2.5 0 0 0-2.5-2.5H3zM21 5h-6a3 3 0 0 0-3 3v12a2.5 2.5 0 0 1 2.5-2.5H21z"/>'),
  chevron: svg('<path d="m9 6 6 6-6 6"/>', '', 'ico flip-rtl'),
  play: svg('<path d="M8 5.5v13l10.5-6.5z" fill="currentColor" stroke-linejoin="round"/>'),
  slow: svg('<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M9.5 2.5h5"/>'),
  ear: svg('<path d="M7 9a5 5 0 0 1 10 0c0 3-3 4-3 7a3 3 0 0 1-5.5 1.6"/><path d="M10 10a2 2 0 0 1 4 0c0 1.2-1 1.6-1.5 2.5"/>'),
  hash: svg('<path d="M5 9h15M4 15h15M10 3 8 21M16 3l-2 18"/>'),
  arrow: svg('<path d="M4 12h14M13 6l6 6-6 6"/>', '', 'ico flip-rtl'),
  chat: svg('<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-5 4v-4.2A2.5 2.5 0 0 1 4 13.5z"/><path d="M8.5 8.5h7M8.5 12h4"/>'),
  sparkle: svg('<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>')
};

// Filled flame for the streak and a filled bolt for XP.
export const flame = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12.6 2.2c.4 3-1.1 4.6-2.7 6.3C8.3 10.2 6.5 12 6.5 15a5.5 5.5 0 0 0 11 0c0-2.3-1-4-2.1-5.3-.2 1.3-.9 2.3-2 2.8.6-3.6-.2-7.4-.8-10.3z"/></svg>';
export const bolt = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M13.5 2 4.8 13.2c-.4.5 0 1.3.6 1.3H11l-1.2 7.4c-.1.6.7.9 1 .4l8.6-11.1c.4-.5 0-1.3-.6-1.3H13l1.4-7.3c.1-.6-.6-.9-.9-.6z"/></svg>';

// The platform mark: a winding path that ends in a dot.
export const logo = '<svg viewBox="0 0 40 40" width="36" height="36" aria-hidden="true"><rect width="40" height="40" rx="11" fill="var(--brand)"/><path d="M11 30c0-5 6-5 9-8s-1-7 4-9.5" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-dasharray="0.1 6.4"/><circle cx="27.5" cy="11.5" r="3.6" fill="#ffd54a"/><circle cx="11" cy="30" r="2.6" fill="#fff"/></svg>';
