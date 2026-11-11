export const metadata = { title: 'プライバシーについて — Darts Room' }

export default function PrivacyPage() {
  return <main className="privacy-page">
    <a className="back-link" href="/">← Darts Room</a>
    <div className="kicker">DARTS ROOM · PRIVACY</div>
    <h1>プライバシーについて</h1>
    <p className="privacy-date">最終更新：2026年11月11日</p>
    <p>Darts Roomは、自宅のダーツボードでのプレイ、オンライン対戦、個人の成績記録を提供するアプリです。</p>
    <section><h2>Googleログインで扱う情報</h2>
      <p>ログイン時に、Googleアカウントの識別子、名前、メールアドレス、プロフィール画像URLなどの基本プロフィールをSupabase Authで受け取ります。アカウントの識別、ログイン状態の維持、アプリ内の本人表示に利用します。Googleアカウントのパスワードは本アプリでは扱いません。</p>
    </section>
    <section><h2>成績の保存</h2>
      <p>ログイン後に開始した対象ゲームについて、本人のゲーム識別子、ゲーム種別、スタッツ、勝敗、記録日時をSupabaseに保存し、成績表示と参考レーティングの計算に利用します。保存データには本人のアカウントからアクセスするための制限を設定しています。</p>
      <p>ソロ、ROBO、練習ゲームはレーティングの対象に含めません。参考レーティングはDARTSLIVE公式の値とは異なります。</p>
    </section>
    <section><h2>オンライン対戦とカメラ</h2>
      <p>対戦ではプレイヤー名、得点、投球などのゲーム情報を対戦相手と共有します。Googleログインで取得したメールアドレスを対戦相手に自動公開する機能はありません。</p>
      <p>カメラをオンにした場合だけ、映像を対戦相手へ送ります。映像接続に中継サーバーを利用する場合があります。本アプリにはカメラ映像の録画・保存機能や、マイク音声の送信機能はありません。</p>
    </section>
    <section><h2>ブラウザー内の保存</h2>
      <p>ログイン状態を維持するための認証情報と、送信待ちの本人の成績をブラウザー内に保存します。送信待ちの成績は、保存処理が成功すると送信待ち一覧から取り除かれます。Bluetooth入力は、接続したボードからゲームの投球情報を受け取るために利用します。</p>
    </section>
    <section><h2>外部サービス</h2>
      <p>認証・成績保存にSupabase、サイトと対戦サーバーの提供にRender、Googleログインとフォントの配信にGoogleのサービスを利用します。ページ表示や接続に必要な通信では、各サービスにIPアドレスなどの通信情報が送信されます。</p>
      <p><a href="https://supabase.com/privacy" target="_blank" rel="noreferrer">Supabaseのプライバシーポリシー</a> · <a href="https://render.com/privacy" target="_blank" rel="noreferrer">Renderのプライバシーポリシー</a> · <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">Googleのプライバシーポリシー</a></p>
    </section>
    <section><h2>お問い合わせ・削除の依頼</h2>
      <p>アカウントや保存した成績の削除、データの扱いに関するお問い合わせは、Googleログインの同意画面に表示されるDarts Roomのサポートメールへご連絡ください。Googleアカウント側の連携解除だけでは、本アプリに保存済みの成績は削除されません。</p>
    </section>
  </main>
}
