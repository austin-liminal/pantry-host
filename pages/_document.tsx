import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#d97706" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Crimson+Pro:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500&display=swap" rel="stylesheet" />
      </Head>
      <body>
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem('theme-preference')||'system';var hc=localStorage.getItem('high-contrast')==='true';var dark=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme:dark)').matches);if(dark)document.documentElement.classList.add('dark');if(hc)document.documentElement.classList.add('high-contrast');document.documentElement.style.colorScheme=dark?'dark':'light'}catch(e){}})()` }} />
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
