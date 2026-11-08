import "./globals.css"

export const metadata = {
  title: "Darts Room — Home Board Companion",
  description: "Bluetoothで遊ぶローカルダーツゲーム。01、CRICKET、PRACTICE、MATCH、ROBO MATCH。",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  )
}
