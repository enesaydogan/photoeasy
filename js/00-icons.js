// Inline icon set for the layer panel. Kept as raw SVG strings so buttons can be
// built in one expression; every path inherits currentColor and the stroke
// weight matches the tool rail.
const ICONS = {
  add: '<path d="M12 5v14M5 12h14"/>',
  duplicate: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a1 1 0 0 1 1-1h9"/>',
  remove: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12M9 7V4h6v3"/>',
  eye: '<path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6z"/><circle cx="12" cy="12" r="2.6"/>',
  eyeOff: '<path d="M10.6 6.2A9.7 9.7 0 0 1 12 6c6.4 0 10 6 10 6a17 17 0 0 1-3 3.5M6.5 7.6C3.7 9.2 2 12 2 12s3.6 6 10 6a9.9 9.9 0 0 0 4-.8"/><path d="M4 4l16 16"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  unlock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.5-2"/>',
  mask: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16" /><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" stroke="none"/>',
  up: '<path d="M6 14l6-6 6 6"/>',
  down: '<path d="M6 10l6 6 6-6"/>',
  grip: '<circle cx="9" cy="6" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="6" r="1.3" fill="currentColor" stroke="none"/><circle cx="9" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="9" cy="18" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="18" r="1.3" fill="currentColor" stroke="none"/>'
};

function iconSvg(name){
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || '') + '</svg>';
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
