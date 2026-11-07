import type { Metadata, Viewport } from 'next';
import '@fontsource/instrument-sans/400.css';
import '@fontsource/instrument-sans/500.css';
import '@fontsource/instrument-sans/600.css';
import '@fontsource/instrument-serif/400.css';
import './globals.css';
import './styles/workspace.css';
import './styles/packs.css';
import './styles/sessions.css';
import './styles/access.css';
import './styles/responsive.css';
import './styles/dashboard-activity.css';
import './styles/dashboard.css';
import './styles/history.css';
import './styles/product-scene.css';
import './styles/voice-room.css';
import './styles/oral-setup.css';

export const metadata: Metadata = { title: 'Muntlig', description: 'Skolens egen plattform for muntlig fagtrening. Lærerstyrte fagpakker, samtaler og gjennomgang med kilder.', robots: { index: false, follow: false } };
export const viewport: Viewport = { width: 'device-width', initialScale: 1 };
export default function RootLayout({ children }: Readonly<{children: React.ReactNode}>) {
 return <html lang="nb"><body>{children}</body></html>;
}
