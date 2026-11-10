import { ChangeDetectionStrategy, Component, input } from '@angular/core';

// "AI is working" overlay: light blur over the page, three glowing stars, shimmering text.
@Component({
  selector: 'app-ai-loading',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="overlay" role="status" aria-live="polite">
      <div class="edge" aria-hidden="true"></div>
      <div class="center">
        <div class="stars" aria-hidden="true">
          <div class="halo"></div>
          <svg class="star star-1" viewBox="0 0 24 24">
            <defs>
              <linearGradient id="ai-star-grad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stop-color="#8FA2FF" />
                <stop offset="50%" stop-color="#3B4EDB" />
                <stop offset="100%" stop-color="#B57BFF" />
              </linearGradient>
            </defs>
            <path [attr.d]="star" fill="url(#ai-star-grad)" />
          </svg>
          <svg class="star star-2" viewBox="0 0 24 24"><path [attr.d]="star" fill="url(#ai-star-grad)" /></svg>
          <svg class="star star-3" viewBox="0 0 24 24"><path [attr.d]="star" fill="url(#ai-star-grad)" /></svg>
        </div>
        <p class="title">{{ message() }}</p>
        <p class="sub">{{ detail() }}</p>
        <ng-content />
      </div>
    </div>
  `,
  styles: `
    /* Covers the content area only, so the menu stays usable during long runs. */
    .overlay {
      position: fixed; inset: 0 0 0 248px; z-index: 100;
      display: grid; place-items: center;
      background: var(--overlay);
      backdrop-filter: blur(12px) saturate(150%);
      -webkit-backdrop-filter: blur(12px) saturate(150%);
      animation: fade-in .35s ease-out both;
    }
    .edge {
      position: absolute; inset: 0; pointer-events: none;
      box-shadow: inset 0 0 80px 10px rgba(123, 140, 255, .35), inset 0 0 160px 30px rgba(181, 123, 255, .18);
      animation: edge-glow 2.8s ease-in-out infinite;
    }
    .center { position: relative; display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 0 24px; text-align: center; }

    .stars { position: relative; width: 150px; height: 150px; margin-bottom: 14px; }
    .halo {
      position: absolute; inset: 18px; border-radius: 50%;
      background: conic-gradient(from 0deg, #8FA2FF, #B57BFF, #5EC8FF, #3B4EDB, #8FA2FF);
      filter: blur(28px); opacity: .55;
      animation: spin 6s linear infinite, breathe 2.4s ease-in-out infinite;
    }
    .star { position: absolute; filter: drop-shadow(0 0 10px rgba(123, 140, 255, .9)) drop-shadow(0 0 22px rgba(181, 123, 255, .6)); }
    .star-1 { width: 76px; height: 76px; left: 30px; top: 40px; animation: twinkle 1.8s ease-in-out infinite; }
    .star-2 { width: 38px; height: 38px; right: 18px; top: 16px; animation: twinkle 1.8s ease-in-out .45s infinite; }
    .star-3 { width: 26px; height: 26px; right: 30px; bottom: 22px; animation: twinkle 1.8s ease-in-out .9s infinite; }

    .title {
      font-size: 22px; font-weight: 800; letter-spacing: -.01em;
      background: linear-gradient(90deg, var(--ink) 0%, #7C8BFF 35%, #B57BFF 50%, #7C8BFF 65%, var(--ink) 100%);
      background-size: 250% 100%;
      -webkit-background-clip: text; background-clip: text; color: transparent;
      animation: shimmer 2.2s linear infinite;
    }
    .sub { color: var(--muted); font-weight: 600; font-size: 14px; max-width: 360px; }

    @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
    @keyframes spin { to { transform: rotate(360deg); } }
    @keyframes breathe { 0%, 100% { opacity: .4; } 50% { opacity: .75; } }
    @keyframes twinkle {
      0%, 100% { transform: scale(.82) rotate(0deg); opacity: .75; }
      50% { transform: scale(1.08) rotate(18deg); opacity: 1; }
    }
    @keyframes shimmer { from { background-position: 100% 0; } to { background-position: -150% 0; } }
    @keyframes edge-glow { 0%, 100% { opacity: .55; } 50% { opacity: 1; } }

    @media (max-width: 900px) { .overlay { inset: 68px 0 0 0; } }
    @media (prefers-reduced-motion: reduce) {
      .overlay, .edge, .halo, .star, .title { animation: none; }
      .title { color: var(--ink); background: none; }
    }
  `
})
export class AiLoadingComponent {
  readonly message = input('AI is reading employee profiles...');
  readonly detail = input('Matching skills and experience. This can take a few seconds.');

  // Four-point sparkle.
  readonly star = 'M12 0C12.8 6.5 17.5 11.2 24 12C17.5 12.8 12.8 17.5 12 24C11.2 17.5 6.5 12.8 0 12C6.5 11.2 11.2 6.5 12 0Z';
}
