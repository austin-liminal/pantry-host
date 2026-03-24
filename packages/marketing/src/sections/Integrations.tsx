function IconSearch() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width={24} height={24} fill="currentColor" aria-hidden="true">
      <path d="M508.5 468.9L387.1 347.5c-2.3-2.3-5.3-3.5-8.5-3.5h-13.2c31.5-36.5 50.6-84 50.6-136C416 93.1 322.9 0 208 0S0 93.1 0 208s93.1 208 208 208c52 0 99.5-19.1 136-50.6v13.2c0 3.2 1.3 6.2 3.5 8.5l121.4 121.4c4.7 4.7 12.3 4.7 17 0l22.6-22.6c4.7-4.7 4.7-12.3 0-17zM208 384c-97.3 0-176-78.7-176-176S110.7 32 208 32s176 78.7 176 176-78.7 176-176 176z" />
    </svg>
  );
}

function IconUtensils() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 416 512" width={24} height={24} fill="currentColor" aria-hidden="true">
      <path d="M207.9 15.2c.8 4.7 16.1 94.5 16.1 128.8 0 52.3-27.8 89.6-68.9 104.6L168 480c0 17.7-14.3 32-32 32s-32-14.3-32-32V248.5c-41-15-68.9-52.3-68.9-104.6 0-34.3 15.4-124.1 16.1-128.8.4-2.6 2.6-4.5 5.3-4.5h10.7c2.8 0 5.1 2.2 5.3 5 2.1 33.3 3.5 72.4 3.5 88.9 0 19.1-2.9 36-8.2 50.4l37.2 3.7V16c0-3 2.6-5.4 5.6-5l8.8 1.2c3 .4 5.2 3 5.2 6v137.3l37.2-3.7c-5.3-14.4-8.2-31.3-8.2-50.4 0-16.5 1.4-55.6 3.5-88.9.2-2.8 2.5-5 5.3-5h10.7c2.7 0 4.9 1.9 5.3 4.5zM384 0c-17.7 0-32 14.3-32 32v118.4c0 33.3-10.3 56.1-26.7 68l-22 16.1c-4.9 3.6-7.3 9.7-7.3 16V480c0 17.7 14.3 32 32 32s32-14.3 32-32V250.5c0-6.3-2.4-12.4-7.3-16l-22-16.1c-16.4-12-26.7-34.7-26.7-68V32c0-17.7 14.3-32 32-32h16c.6 0 1 .4 1 1v149c0 .6-.4 1-1 1h-8.5c-.3 0-.5.2-.5.5v10c0 .3.2.5.5.5H352c.6 0 1-.4 1-1V1c0-.6-.4-1-1-1h-16z" />
    </svg>
  );
}

function IconCog() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width={24} height={24} fill="currentColor" aria-hidden="true">
      <path d="M482.696 299.276l-32.61-18.827a195.168 195.168 0 0 0 0-48.899l32.61-18.827c9.576-5.528 14.195-16.902 10.979-27.727-8.862-29.822-23.394-57.146-42.561-80.609-7.064-8.631-18.784-11.024-28.63-5.622l-32.831 18.956a196.16 196.16 0 0 0-42.339-24.443V55.904c0-11.04-7.525-20.792-18.232-23.501-29.437-7.447-60.774-7.36-90.098.27-10.576 2.752-17.963 12.426-17.963 23.348v37.655a196.16 196.16 0 0 0-42.339 24.443l-32.831-18.956c-9.846-5.402-21.566-3.009-28.63 5.622-19.167 23.463-33.699 50.787-42.561 80.609-3.216 10.825 1.403 22.199 10.979 27.727l32.61 18.827a195.168 195.168 0 0 0 0 48.899l-32.61 18.827c-9.576 5.528-14.195 16.902-10.979 27.727 8.862 29.822 23.394 57.146 42.561 80.609 7.064 8.631 18.784 11.024 28.63 5.622l32.831-18.956a196.16 196.16 0 0 0 42.339 24.443v37.374c0 11.04 7.525 20.792 18.232 23.501 29.437 7.447 60.774 7.36 90.098-.27 10.576-2.752 17.963-12.426 17.963-23.348v-37.655a196.16 196.16 0 0 0 42.339-24.443l32.831 18.956c9.846 5.402 21.566 3.009 28.63-5.622 19.167-23.463 33.699-50.787 42.561-80.609 3.216-10.825-1.403-22.199-10.979-27.727zM256 336c-44.112 0-80-35.888-80-80s35.888-80 80-80 80 35.888 80 80-35.888 80-80 80z" />
    </svg>
  );
}

const capabilities = [
  {
    title: 'Ask your pantry',
    description: 'What ingredients do I have? What\u2019s running low? Filter by category or tags.',
    icon: IconSearch,
  },
  {
    title: 'Get recipe help',
    description: 'Search recipes by tag or cookware. Generate new ones from what\u2019s on hand. Queue meals for the week.',
    icon: IconUtensils,
  },
  {
    title: 'Manage your kitchen',
    description: 'Add ingredients, create menus, track cookware. Full read/write access to your data.',
    icon: IconCog,
  },
];

function IconProjectDiagram() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 512" width={32} height={32} fill="currentColor" aria-hidden="true">
      <path d="M592 0h-96c-26.51 0-48 21.49-48 48v32H192V48c0-26.51-21.49-48-48-48H48C21.49 0 0 21.49 0 48v96c0 26.51 21.49 48 48 48h94.86l88.76 150.21c-4.77 7.46-7.63 16.27-7.63 25.79v96c0 26.51 21.49 48 48 48h96c26.51 0 48-21.49 48-48v-96c0-26.51-21.49-48-48-48h-96c-5.2 0-10.11 1.04-14.8 2.57l-83.43-141.18C184.8 172.59 192 159.2 192 144v-32h256v32c0 26.51 21.49 48 48 48h96c26.51 0 48-21.49 48-48V48c0-26.51-21.49-48-48-48zM32 144V48c0-8.82 7.18-16 16-16h96c8.82 0 16 7.18 16 16v96c0 8.82-7.18 16-16 16H48c-8.82 0-16-7.18-16-16zm336 208c8.82 0 16 7.18 16 16v96c0 8.82-7.18 16-16 16h-96c-8.82 0-16-7.18-16-16v-96c0-8.82 7.18-16 16-16h96zm240-208c0 8.82-7.18 16-16 16h-96c-8.82 0-16-7.18-16-16V48c0-8.82 7.18-16 16-16h96c8.82 0 16 7.18 16 16v96z" />
    </svg>
  );
}

export default function Integrations() {
  return (
    <section className="px-4 sm:px-6 py-16 sm:py-24 max-w-5xl mx-auto">
      <div className="flex justify-center mb-4 opacity-60">
        <IconProjectDiagram />
      </div>
      <h2
        className="text-3xl sm:text-4xl font-bold text-center mb-4"
        style={{ fontFamily: "'Crimson Pro', Georgia, serif" }}
      >
        Open by&nbsp;Design
      </h2>
      <p className="text-center text-[var(--color-text-secondary)] text-sm sm:text-base max-w-2xl mx-auto mb-12 leading-relaxed">
        Pantry&nbsp;Host ships an <abbr title="Model Context Protocol">MCP</abbr> server so any compatible AI&nbsp;client can read and write your kitchen&nbsp;data&nbsp;&mdash; right from your&nbsp;<abbr title="Local Area Network">LAN</abbr>.
      </p>
      <div className="grid md:grid-cols-3 gap-6 mb-10">
        {capabilities.map((cap) => (
          <div
            key={cap.title}
            className="rounded-xl border border-[var(--color-border-card)] bg-[var(--color-bg-card)] p-5"
          >
            <div className="mb-3 opacity-60">
              <cap.icon />
            </div>
            <h3
              className="text-xl font-bold mb-2"
              style={{ fontFamily: "'Crimson Pro', Georgia, serif" }}
            >
              {cap.title}
            </h3>
            <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed pretty">
              {cap.description}
            </p>
          </div>
        ))}
      </div>
      <p className="text-center text-xs text-[var(--color-text-secondary)]">
        Works with any MCP-compatible client&nbsp;&mdash; Claude&nbsp;Desktop, Cursor, and&nbsp;more. Runs on your LAN, your data stays&nbsp;home.
      </p>
    </section>
  );
}
