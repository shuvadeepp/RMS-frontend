import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type IconName =
  | 'sparkle' | 'home' | 'search' | 'folder' | 'users' | 'check' | 'trending' | 'chart'
  | 'logout' | 'menu' | 'close' | 'arrow-left' | 'arrow-right' | 'plus' | 'chevron-down'
  | 'alert' | 'refresh' | 'calendar' | 'clock' | 'x' | 'eye' | 'eye-off' | 'tag' | 'unlock' | 'sun' | 'moon' | 'list';

// Inline SVG icons (stroke style). Decorative unless a label is given.
@Component({
  selector: 'app-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display:inline-flex' },
  template: `
    <svg [attr.width]="size()" [attr.height]="size()" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
         [attr.aria-hidden]="label() ? null : 'true'" [attr.aria-label]="label()" [attr.role]="label() ? 'img' : null">
      @switch (name()) {
        @case ('sparkle') { <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/> }
        @case ('home') { <path d="M3 10.5L12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/> }
        @case ('search') { <circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/> }
        @case ('folder') { <path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2.5h8.5A1.5 1.5 0 0 1 21 9v9.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z"/> }
        @case ('users') { <circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8"/><path d="M18 14a6.5 6.5 0 0 1 3.5 6"/> }
        @case ('check') { <circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.7 2.7L16 10"/> }
        @case ('trending') { <path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/> }
        @case ('chart') { <path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20v-7"/><path d="M22 20H2"/> }
        @case ('logout') { <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M10 16l-4-4 4-4"/><path d="M6 12h10"/> }
        @case ('menu') { <path d="M4 6h16M4 12h16M4 18h16"/> }
        @case ('close') { <path d="M6 6l12 12M18 6L6 18"/> }
        @case ('x') { <path d="M8 8l8 8M16 8l-8 8"/> }
        @case ('arrow-left') { <path d="M19 12H5"/><path d="M11 6l-6 6 6 6"/> }
        @case ('arrow-right') { <path d="M5 12h14"/><path d="M13 6l6 6-6 6"/> }
        @case ('plus') { <path d="M12 5v14M5 12h14"/> }
        @case ('chevron-down') { <path d="M6 9l6 6 6-6"/> }
        @case ('alert') { <circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5"/><path d="M12 16.5h.01"/> }
        @case ('refresh') { <path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/> }
        @case ('calendar') { <rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/> }
        @case ('eye') { <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/> }
        @case ('eye-off') { <path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-2.8 3.6"/><path d="M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7c1.8 0 3.4-.5 4.8-1.3"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/><path d="M3 3l18 18"/> }
        @case ('clock') { <circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/> }
        @case ('tag') { <path d="M3 12.6V4.5A1.5 1.5 0 0 1 4.5 3h8.1a1.5 1.5 0 0 1 1.06.44l6.9 6.9a1.5 1.5 0 0 1 0 2.12l-8.1 8.1a1.5 1.5 0 0 1-2.12 0l-6.9-6.9A1.5 1.5 0 0 1 3 12.6z"/><circle cx="8" cy="8" r="1.5"/> }
        @case ('sun') { <circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/> }
        @case ('list') { <path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6h.01M4 12h.01M4 18h.01"/> }
        @case ('moon') { <path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5a8.5 8.5 0 1 0 10.7 10.7z"/> }
        @case ('unlock') { <rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/> }
      }
    </svg>
  `
})
export class IconComponent {
  readonly name = input.required<IconName>();
  readonly size = input<number>(20);
  readonly label = input<string | null>(null);
}
