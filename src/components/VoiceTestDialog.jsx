import { useState } from 'react';
import { Volume2 } from 'lucide-react';

// Only show the one-time iOS Silent Mode tip once per device.
const IOS_TIP_KEY = 'nwt-voice-ios-tip-shown';

function isIOS() {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

/**
 * VoiceTestDialog
 *
 * Shown immediately after the user enables voice guidance for the first time.
 * The parent must have already called _doSpeak("Voice guidance is now enabled.")
 * inside the same gesture handler before mounting this component.
 *
 * Props:
 *   onSpeak(text)  — speak a message (called inside a button tap so iOS allows it)
 *   onConfirm()    — user heard it — dismiss, keep voice on
 *   onDismiss()    — user chose "Continue without voice" — dismiss, turn voice off
 */
export default function VoiceTestDialog({ onSpeak, onConfirm, onDismiss }) {
  const [screen, setScreen] = useState('test'); // 'test' | 'help'
  const showIosTip = isIOS() && !localStorage.getItem(IOS_TIP_KEY);

  function handleYes() {
    localStorage.setItem(IOS_TIP_KEY, '1');
    onConfirm();
  }

  function handleNo() {
    setScreen('help');
  }

  function handleTestAgain() {
    onSpeak('This is a voice guidance test.');
  }

  function handleContinueWithout() {
    localStorage.setItem(IOS_TIP_KEY, '1');
    onDismiss();
  }

  if (screen === 'help') {
    return (
      <div className="vt-backdrop" role="dialog" aria-modal="true" aria-labelledby="vt-help-title">
        <div className="vt-sheet" role="document">
          <h2 id="vt-help-title" className="vt-title">Can't hear voice guidance?</h2>
          <p className="vt-body">If you're using an iPhone:</p>
          <ul className="vt-list">
            <li>Make sure <strong>Silent Mode is turned OFF</strong> — flip the ringer switch on the side of your phone.</li>
            <li>Turn up your <strong>media volume</strong> using the volume buttons.</li>
            <li>If Bluetooth headphones or a car are connected, audio may be playing there.</li>
            <li>Then tap <strong>Test Voice</strong> again.</li>
          </ul>
          <div className="vt-actions">
            <button className="vt-btn vt-btn-primary" onClick={handleTestAgain} aria-label="Play a voice guidance test message">
              <Volume2 size={22} aria-hidden="true" />
              Test Voice Again
            </button>
            <button className="vt-btn vt-btn-secondary" onClick={handleContinueWithout}>
              Continue Without Voice
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="vt-backdrop" role="dialog" aria-modal="true" aria-labelledby="vt-title">
      <div className="vt-sheet" role="document">
        <div className="vt-icon" aria-hidden="true"><Volume2 size={34} /></div>
        <h2 id="vt-title" className="vt-title">Voice Test</h2>
        <p className="vt-body">You should have just heard:<br /><em>"Voice guidance is now enabled."</em></p>
        {showIosTip && (
          <p className="vt-ios-tip" role="note">
            <strong>iPhone tip:</strong> For the best experience, make sure Silent Mode is off and your media volume is turned up.
          </p>
        )}
        <p className="vt-question">Did you hear the voice message?</p>
        <div className="vt-actions">
          <button className="vt-btn vt-btn-primary" onClick={handleYes} aria-label="Yes, I heard the voice message">
            Yes, I heard it
          </button>
          <button className="vt-btn vt-btn-secondary" onClick={handleNo} aria-label="No, I did not hear anything">
            No, I didn't hear anything
          </button>
        </div>
      </div>
    </div>
  );
}
