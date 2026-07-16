// Inline icon set for the layer panel. Kept as raw SVG strings so buttons can be
// built in one expression; every path inherits currentColor and the stroke
// weight matches the tool rail.
// Each glyph is drawn so its ink box centres on (12,12); an off-centre path
// reads as a misaligned button no matter how the button centres its child.
const ICONS = {
  undo: '<path d="M9 13.5L4 8.5l5-5"/><path d="M4 8.5h10a6 6 0 0 1 0 12h-3"/>',
  redo: '<path d="M15 13.5l5-5-5-5"/><path d="M20 8.5H10a6 6 0 0 0 0 12h3"/>',
  save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8"/><path d="M7 3v5h7"/>',
  open: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  import: '<rect x="2" y="6.5" width="13" height="13" rx="2"/><circle cx="6.5" cy="11" r="1.2"/><path d="M2 16.5l3.5-2.5L10.5 18"/><path d="M18.5 4v7M15 7.5h7"/>',
  export: '<path d="M12 3.5v12M7 10.5l5 5 5-5"/><path d="M4 20.5h16"/>',
  resizeCanvas: '<path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/>',
  chevronDown: '<path d="M6 9l6 6 6-6"/>',
  add: '<path d="M12 5v14M5 12h14"/>',
  duplicate: '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M4.5 14.5V5.5a1 1 0 0 1 1-1h9"/>',
  remove: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12M9 7V4h6v3"/>',
  eye: '<path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6z"/><circle cx="12" cy="12" r="2.6"/>',
  eyeOff: '<path d="M10.6 6.2A9.7 9.7 0 0 1 12 6c6.4 0 10 6 10 6a17 17 0 0 1-3 3.5M6.5 7.6C3.7 9.2 2 12 2 12s3.6 6 10 6a9.9 9.9 0 0 0 4-.8"/><path d="M4 4l16 16"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  unlock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.5-2"/>',
  mask: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16" /><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" stroke="none"/>',
  up: '<path d="M6 15l6-6 6 6"/>',
  down: '<path d="M6 9l6 6 6-6"/>',
  grip: '<circle cx="9" cy="6" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="6" r="1.3" fill="currentColor" stroke="none"/><circle cx="9" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="9" cy="18" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="18" r="1.3" fill="currentColor" stroke="none"/>'
};

function iconSvg(name){
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || '') + '</svg>';
}

// Static markup declares `data-icon="name"` rather than inlining SVG, so every
// glyph has exactly one definition above.
function hydrateIcons(root = document){
  root.querySelectorAll('[data-icon]').forEach((element)=>{
    element.insertAdjacentHTML('afterbegin', iconSvg(element.dataset.icon));
  });
}

// Icon-only buttons carry no text, so the label has to reach assistive tech and
// hover through title/aria-label instead.
function iconButton(name, { className = '', title = '', ariaLabel = '' } = {}){
  const button = document.createElement('button');
  button.type = 'button';
  button.className = ('icon-btn ' + className).trim();
  button.innerHTML = iconSvg(name);
  if(title) button.title = title;
  button.setAttribute('aria-label', ariaLabel || title);
  return button;
}

// This file is deferred, so the document is already parsed: hydrating here
// rather than on DOMContentLoaded avoids a paint with empty buttons.
hydrateIcons();
