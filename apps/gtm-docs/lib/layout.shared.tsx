import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <span className="font-bold">
          paydirt<span className="text-fd-primary"> · </span>GTM Systems
        </span>
      ),
    },
    githubUrl: 'https://github.com/nika-loki/paydirt',
    // The /studio board editor is a product feature, not a doc page — surface
    // it beside the sidebar links. (The retired /model composer redirects.)
    links: [
      {
        text: 'Studio',
        url: '/studio',
        // Keyed: fumadocs composes sidebar link children as [icon, text]
        // inside one Link element — an unkeyed icon element makes React log
        // 'Each child in a list should have a unique "key" prop' on every
        // docs page.
        icon: (
          <svg
            key="studio-link-icon"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-4"
          >
            <circle cx="5" cy="6" r="2" />
            <circle cx="19" cy="6" r="2" />
            <circle cx="12" cy="18" r="2" />
            <path d="M7 6h10M6.5 7.5 11 16.5M17.5 7.5 13 16.5" />
          </svg>
        ),
      },
    ],
  };
}
