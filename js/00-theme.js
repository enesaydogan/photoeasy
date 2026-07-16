// Theme state. Follows the system until the user picks a side, then remembers.
// Canvas overlays are painted with JS, not CSS, so a change has to re-broadcast.
const THEME_MEDIA = window.matchMedia('(prefers-color-scheme: dark)');

function resolvedTheme(){
  return document.documentElement.dataset.theme || (THEME_MEDIA.matches ? 'dark' : 'light');
}

function isDarkTheme(){
  return resolvedTheme() === 'dark';
}

// Canvas chrome that sits on the themed backdrop is read from CSS so the two
// systems never drift apart. Marks drawn on the artwork itself are not theme
// dependent — see OVERLAY_FILL in the compositor. The lookup is cached because
// composite() runs on every pointer move.
let themeInkCache = null;

function themeInk(name){
  if(!themeInkCache){
    const styles = getComputedStyle(document.documentElement);
    themeInkCache = {
      canvasEdge: styles.getPropertyValue('--canvas-edge').trim() || 'rgba(255,255,255,.18)',
      canvasHalo: styles.getPropertyValue('--canvas-halo').trim() || 'rgba(0,0,0,.4)'
    };
  }
  return themeInkCache[name];
}

function announceThemeChange(){
  themeInkCache = null;
  document.dispatchEvent(new CustomEvent('themechange', { detail: { theme: resolvedTheme() } }));
}

function initTheme(){
  const button = document.getElementById('theme');
  if(!button) return;

  button.addEventListener('click', ()=>{
    const next = isDarkTheme() ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    // Storage is unavailable on file:// and in private mode. The theme still
    // applies for this session; only remembering it is lost.
    try { localStorage.setItem('theme', next); } catch(e) {}
    announceThemeChange();
  });

  // Only matters while no explicit choice is stored.
  THEME_MEDIA.addEventListener('change', ()=>{
    if(!document.documentElement.dataset.theme) announceThemeChange();
  });
}

document.addEventListener('DOMContentLoaded', initTheme);
