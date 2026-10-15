/*
 * Decorative artwork and the end-of-study confetti. Nothing here appears on a task screen.
 *
 * The illustrations are inline SVG (no image files to load) in the theme colours from
 * src/experiment.css, and hidden from screen readers because they carry no information.
 * They deliberately avoid money, dice, cards, casinos, faces and emotions, so they cannot
 * prime anything about gambling or regret.
 */
(function () {
  const TEAL = "#1E6E76";
  const TEAL_LIGHT = "#cfe6e6";
  const TEAL_WASH = "#e7f2f2";
  const AMBER = "#f2b544";
  const AMBER_LIGHT = "#fde7b0";
  const SAGE = "#8fc1b5";
  const CORAL = "#e98a6b";

  const svg = (body) =>
    `<svg viewBox="0 0 320 200" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">${body}</svg>`;

  // Small four-pointed sparkle centred on (x, y).
  const sparkle = (x, y, r, color) =>
    `<path d="M${x} ${y - r} Q${x + r * 0.18} ${y - r * 0.18} ${x + r} ${y} Q${x + r * 0.18} ${y + r * 0.18} ${x} ${y + r} ` +
    `Q${x - r * 0.18} ${y + r * 0.18} ${x - r} ${y} Q${x - r * 0.18} ${y - r * 0.18} ${x} ${y - r} Z" fill="${color}"/>`;

  // Welcome: a clipboard with a checklist, a pencil, a lightbulb and a sprig of leaves.
  const welcome = svg(`
    <ellipse cx="160" cy="112" rx="132" ry="80" fill="${TEAL_WASH}"/>
    <g>
      <circle cx="70" cy="66" r="21" fill="${AMBER_LIGHT}" stroke="${AMBER}" stroke-width="4"/>
      <path d="M63 66 q7 -9 14 0" fill="none" stroke="${AMBER}" stroke-width="3" stroke-linecap="round"/>
      <rect x="62" y="86" width="16" height="11" rx="3" fill="${TEAL}"/>
      <path d="M70 32 v-8 M44 44 l-6 -6 M96 44 l6 -6 M38 68 h-8 M102 68 h8" stroke="${AMBER}" stroke-width="4" stroke-linecap="round"/>
    </g>
    <rect x="112" y="40" width="100" height="134" rx="14" fill="#ffffff" stroke="${TEAL}" stroke-width="4"/>
    <rect x="138" y="30" width="48" height="20" rx="7" fill="${TEAL}"/>
    <g stroke-linecap="round" stroke-linejoin="round">
      <rect x="128" y="70" width="14" height="14" rx="4" fill="none" stroke="${TEAL}" stroke-width="3"/>
      <path d="M131 77 l3 3 l6 -7" fill="none" stroke="${AMBER}" stroke-width="3.5"/>
      <rect x="150" y="74" width="46" height="6" rx="3" fill="${TEAL_LIGHT}"/>
      <rect x="128" y="98" width="14" height="14" rx="4" fill="none" stroke="${TEAL}" stroke-width="3"/>
      <path d="M131 105 l3 3 l6 -7" fill="none" stroke="${AMBER}" stroke-width="3.5"/>
      <rect x="150" y="102" width="38" height="6" rx="3" fill="${TEAL_LIGHT}"/>
      <rect x="128" y="126" width="14" height="14" rx="4" fill="none" stroke="${TEAL}" stroke-width="3"/>
      <rect x="150" y="130" width="42" height="6" rx="3" fill="${TEAL_LIGHT}"/>
    </g>
    <g transform="rotate(35 236 112)">
      <rect x="228" y="70" width="16" height="70" rx="3" fill="${AMBER}"/>
      <rect x="228" y="70" width="16" height="12" rx="3" fill="${CORAL}"/>
      <path d="M228 140 h16 l-8 16 z" fill="${AMBER_LIGHT}"/>
      <path d="M233.5 151 h5 l-2.5 5 z" fill="${TEAL}"/>
    </g>
    <g>
      <path d="M262 178 q4 -26 -6 -46" fill="none" stroke="${SAGE}" stroke-width="4" stroke-linecap="round"/>
      <ellipse cx="248" cy="150" rx="12" ry="6" transform="rotate(-35 248 150)" fill="${SAGE}"/>
      <ellipse cx="270" cy="156" rx="12" ry="6" transform="rotate(30 270 156)" fill="${SAGE}"/>
      <ellipse cx="254" cy="128" rx="10" ry="5" transform="rotate(-70 254 128)" fill="${SAGE}"/>
    </g>
    ${sparkle(250, 46, 9, AMBER)}${sparkle(98, 150, 6, TEAL_LIGHT)}`);

  // Debrief: a round badge with a check mark, with sparkles mirrored left and right of centre
  // (x = 160) so the picture is symmetric.
  const mirrored = (x, y, r, color) => sparkle(x, y, r, color) + sparkle(320 - x, y, r, color);
  const dots = (x, y, r, color) =>
    `<circle cx="${x}" cy="${y}" r="${r}" fill="${color}"/><circle cx="${320 - x}" cy="${y}" r="${r}" fill="${color}"/>`;
  const thanks = svg(`
    <ellipse cx="160" cy="100" rx="128" ry="80" fill="${TEAL_WASH}"/>
    <circle cx="160" cy="100" r="58" fill="${TEAL}"/>
    <circle cx="160" cy="100" r="46" fill="none" stroke="#ffffff" stroke-opacity="0.35" stroke-width="3" stroke-dasharray="4 8" stroke-linecap="round"/>
    <path d="M136 102 l16 16 l32 -34" fill="none" stroke="#ffffff" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/>
    ${mirrored(80, 54, 12, AMBER)}${mirrored(78, 148, 9, SAGE)}
    ${dots(110, 30, 4, CORAL)}${dots(46, 100, 3.5, TEAL)}${dots(112, 172, 3.5, AMBER)}`);

  // All done: a paper plane on its way, with a dotted trail ("responses sent").
  const sent = svg(`
    <ellipse cx="170" cy="110" rx="130" ry="76" fill="${TEAL_WASH}"/>
    <path d="M30 170 C 60 168, 70 140, 98 146 S 120 168, 132 140" fill="none" stroke="${AMBER}" stroke-width="4" stroke-linecap="round" stroke-dasharray="1 11"/>
    <g stroke="${TEAL}" stroke-width="4" stroke-linejoin="round">
      <path d="M78 110 L262 44 L146 128 Z" fill="#ffffff"/>
      <path d="M146 128 L262 44 L190 158 Z" fill="${TEAL_LIGHT}"/>
      <path d="M146 128 L156 166 L172 146 Z" fill="${TEAL}"/>
    </g>
    ${sparkle(282, 98, 9, AMBER)}${sparkle(226, 168, 7, SAGE)}${sparkle(60, 64, 8, AMBER_LIGHT)}`);

  window.ILLUSTRATIONS = { welcome, thanks, sent };

  // A short confetti burst. Purely decorative: it never blocks clicks, removes itself, and is
  // skipped for anyone whose computer asks for reduced motion.
  window.celebrate = function celebrate() {
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const colors = [TEAL, AMBER, SAGE, CORAL, TEAL_LIGHT, AMBER_LIGHT];
    const layer = document.createElement("div");
    layer.className = "confetti-layer";
    layer.setAttribute("aria-hidden", "true");
    for (let i = 0; i < 90; i++) {
      const piece = document.createElement("i");
      const size = 6 + Math.random() * 7;
      piece.style.left = Math.random() * 100 + "vw";
      piece.style.width = size + "px";
      piece.style.height = (Math.random() < 0.5 ? size * 0.45 : size) + "px";
      piece.style.background = colors[i % colors.length];
      if (Math.random() < 0.3) piece.style.borderRadius = "50%";
      piece.style.setProperty("--drift", Math.round(Math.random() * 180 - 90) + "px");
      piece.style.setProperty("--spin", Math.round(Math.random() * 900 - 450) + "deg");
      piece.style.animationDelay = (Math.random() * 0.5).toFixed(2) + "s";
      piece.style.animationDuration = (1.7 + Math.random() * 0.8).toFixed(2) + "s";
      layer.appendChild(piece);
    }
    document.body.appendChild(layer);
    setTimeout(() => layer.remove(), 3500);
  };
})();
