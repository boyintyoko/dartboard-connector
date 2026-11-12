import "./globals.css"
import "@fontsource/barlow-condensed/latin-400.css"
import "@fontsource/barlow-condensed/latin-500.css"
import "@fontsource/barlow-condensed/latin-600.css"
import "@fontsource/barlow-condensed/latin-700.css"
import "@fontsource/barlow-condensed/latin-800.css"

export const metadata = {
  title: "Darts Room — Home Board Companion",
  description: "Bluetoothで遊ぶローカルダーツゲーム。01、CRICKET、PRACTICE、MATCH、ROBO MATCH。",
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
    apple: "/icon.svg",
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  )
}
