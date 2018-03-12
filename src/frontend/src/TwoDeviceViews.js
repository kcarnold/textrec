export const LookAtPhone = inject('clientId')(({clientId}) => <div><p>Complete this step on your phone.</p> If you need it, your phone code is <tt>{clientId}-p</tt>.</div>);
export const LookAtComputer = inject('clientId')(({clientId}) => <div><p>Complete this step on your computer.</p> If you need it, your computer code is <tt>{clientId}-c</tt>.</div>);

export const SetupPairingComputer = inject('clientId')(({clientId}) => {
    let url = `http://${hostname}/?${clientId}-p`;
    return <div>
    <p>You will need two devices to complete this study: a <b>laptop/desktop computer</b> (you could use a tablet but we haven't tested it), and a <b>smartphone</b> with a web browser and WiFi (we will not be responsible for any data charges).</p>

    <div>How to pair your phone (they're all the same, pick the easiest one for you):</div>
    <ul>
      <li>On your phone's web browser, go to <tt>{hostname}</tt> and enter <tt>{clientId}-p</tt>.</li>
      <li>Send this link to yourself: <input readOnly={true} style={{fontFamily: 'monospace', width: '25em'}} value={url} /></li>
      <li>Scan this:<br/><img src={"https://zxing.org/w/chart?cht=qr&chs=350x350&chld=L&choe=UTF-8&chl=" + encodeURIComponent(url)} alt=""/></li>
    </ul>
    <p>Once your phone is paired, there will be a button on that page to continue.</p>
  </div>;
  });
export const SetupPairingPhone = () => <div>Successfully paired! <NextBtn /></div>;

export const ProbablyWrongCode = () => <div>
    <p>Waiting for computer. If you're seeing this on your phone, you probably mistyped your code.</p>
  </div>;

export const TimesUpPhone = () => <div>Time is up. Follow the instructions on your computer.</div>;

